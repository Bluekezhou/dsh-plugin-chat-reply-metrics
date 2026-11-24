import { createRequire } from 'node:module';
import { measure } from './src/metrics.js';

const prices = createRequire(import.meta.url)('./data/rates.json');
const empty = () => ({ calls: 0, knownCalls: 0, unknownCalls: 0, knownCostUsd: 0 });
function count(group, cost) {
  group.calls++;
  if (cost === null) group.unknownCalls++;
  else { group.knownCalls++; group.knownCostUsd += cost; }
}

function dateFilter(date, timeZone) {
  if (date === undefined) return () => true;
  const utc = new Date(`${date}T00:00:00Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+utc) || utc.toISOString().slice(0, 10) !== date) throw new RangeError('Invalid ledger date');
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return time => format.format(time) === date;
}

function selectSessions(byId, sessionId) {
  if (sessionId === undefined) return byId.values();
  if (!byId.has(sessionId)) throw new RangeError('Unknown ledger session');
  const children = new Map();
  for (const { header } of byId.values()) {
    if (header.origin !== 'subagent') continue; // A normal fork gets its own bill, not its parent's.
    if (!children.has(header.parentSession)) children.set(header.parentSession, []);
    children.get(header.parentSession).push(header.id);
  }
  const selected = new Set([sessionId]);
  for (const id of selected) for (const child of children.get(id) ?? []) selected.add(child);
  return Array.from(selected, id => byId.get(id));
}

// Keep only the priced facts, never message text, streams, paths or tool arguments.
async function readFacts(persistence, { header }) {
  const handle = await persistence.open(header.id, 'read');
  try {
    // DSH's persisted cut is authoritative even when a copied event has a different seq/id.
    const offset = handle.inheritedEventCount;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid inherited prefix');
    const { events } = await handle.read(offset);
    const facts = [];
    for (const { type, time, data } of events) {
      let model;
      if (type === 'assistant/message' && data.message?.id) model = data.message.source?.model;
      else if (type === 'compaction/summary' && (data.llmStreamCall === true || data.usage != null)) model = data.model;
      else continue;
      const { cost } = measure({ providerMetadata: { model }, usage: data.usage }, prices);
      facts.push({ time, model: model || '(unknown)', cost });
    }
    return facts;
  } finally { await handle.close(); }
}

/** A read-only ledger bound to one DSH sessionPersistence service instance. */
export function createLedger(persistence) {
  const cache = new Map();
  function getFacts(snap) {
    const id = snap.header.id;
    const cached = cache.get(id);
    if (cached && snap.revision !== undefined && cached.revision === snap.revision) return cached.facts;
    const entry = { revision: snap.revision, facts: readFacts(persistence, snap) };
    cache.set(id, entry);
    entry.facts.catch(() => { if (cache.get(id) === entry) cache.delete(id); });
    return entry.facts;
  }
  return { async query({ sessionId, date, timeZone = 'Asia/Shanghai' } = {}) {
    const include = dateFilter(date, timeZone);
    const snapshots = await persistence.list();
    const byId = new Map(snapshots.map(snap => [snap.header.id, snap]));
    for (const id of cache.keys()) if (!byId.has(id)) cache.delete(id);
    const total = empty(), self = empty(), descendants = empty(), models = new Map();
    let skippedSessions = 0;
    for (const snap of selectSessions(byId, sessionId)) {
      if (snap.formatStatus === 'migration-required') { skippedSessions++; continue; }
      let facts;
      try { facts = await getFacts(snap); } catch { skippedSessions++; continue; }
      const own = sessionId === undefined ? snap.header.origin !== 'subagent' : snap.header.id === sessionId;
      for (const { time, model, cost } of facts) {
        if (!include(time)) continue;
        if (!models.has(model)) models.set(model, { model, ...empty() });
        count(total, cost); count(own ? self : descendants, cost); count(models.get(model), cost);
      }
    }
    return { total, self, descendants, models: [...models.values()].sort((a, b) => b.knownCostUsd - a.knownCostUsd || a.model.localeCompare(b.model)), skippedSessions };
  } };
}
