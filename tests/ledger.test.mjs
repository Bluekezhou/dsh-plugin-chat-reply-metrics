import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from '../ledger.js';

const midnight = Date.parse('2026-11-22T16:00:00Z');
const model = 'gpt-6.2-astra';
const usage = { inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10, outputTokens: 20 };
const call = (route = model, time = midnight) => ({ type: 'assistant/message', time, data: { message: { id: 'durable', source: { model: route } }, usage } });
function fixture() {
  const snapshots = [], stores = new Map(), reads = [], closes = [];
  const add = (id, events, parentSession, origin, inherited = 0) => {
    const snap = { header: { id, parentSession, origin, isSeeded: inherited > 0 }, revision: 'rev' };
    snapshots.push(snap); stores.set(id, { events, inherited }); return snap;
  };
  const ledger = createLedger({ list: async () => snapshots, open: async (id, mode) => {
    assert.equal(mode, 'read'); const store = stores.get(id);
    return { inheritedEventCount: store.inherited, read: async offset => {
      reads.push([id, offset]); return { events: store.events.slice(offset) };
    }, close: async () => { closes.push(id); } };
  } });
  return { add, reads, closes, ledger, stores };
}

test('counts local suffixes exactly once in global, selected and nested agent scopes', async () => {
  const { add, reads, ledger } = fixture();
  add('A', [call()]);
  add('B', [call(), call('unpriced')], 'A', 'subagent', 1);
  add('C', [call()], 'B', 'subagent');
  add('D', [call(), call()], 'A', undefined, 1);
  const a = await ledger.query({ sessionId: 'A' });
  assert.deepEqual(a.total, { calls: 3, knownCalls: 2, unknownCalls: 1, knownCostUsd: 3440/1e6 });
  assert.equal(a.self.calls, 1); assert.equal(a.descendants.calls, 2);
  assert.deepEqual(a.models.map(row => [row.model,row.calls]), [[model,2],['unpriced',1]]);
  const b = await ledger.query({ sessionId: 'B' }); assert.equal(b.self.unknownCalls, 1); assert.equal(b.descendants.calls, 1);
  const all = await ledger.query(); assert.equal(all.total.calls, 4); assert.equal(all.self.calls, 2);
  assert.deepEqual(reads, [['A',0],['B',1],['C',0],['D',1]]);
});

test('local dates include midnight, exclude adjacent days and respect DST fall-back', async () => {
  const { add, ledger } = fixture();
  const times = [midnight-1,midnight,midnight+86400000-1,midnight+86400000,...['2026-11-01T05:30Z','2026-11-01T06:30Z'].map(Date.parse)];
  add('A', times.map(t => call(model,t)));
  assert.equal((await ledger.query({ date:'2026-11-23' })).total.calls, 2);
  assert.equal((await ledger.query({ date:'2026-11-01', timeZone:'America/New_York' })).total.calls, 2);
  await assert.rejects(ledger.query({date:'2026-02-30'}),RangeError);
  await assert.rejects(ledger.query({date:'2026-02-03',timeZone:'Invalid'}),RangeError);
});

test('skip migration/read failures explicitly, close readers, retry and invalidate changed revisions', async () => {
  const { add, reads, closes, stores, ledger } = fixture();
  const a = add('A', [call()]); add('old', []).formatStatus = 'migration-required'; add('broken', null);
  assert.equal((await ledger.query()).skippedSessions, 2); assert.deepEqual(closes, ['A','broken']);
  stores.get('broken').events = []; a.revision = 'next'; stores.get('A').events.push(call());
  const next = await ledger.query(); assert.equal(next.skippedSessions, 1); assert.equal(next.total.calls, 2); assert.equal(reads.length, 4);
  await assert.rejects(ledger.query({sessionId:'typo'}),RangeError);
});

test('counts actual compaction calls once, ignores attempts, local summaries, and missing message ids', async () => {
  const { add, ledger } = fixture();
  add('A', [{ type: 'assistant/attempt', data: {} },{ type: 'assistant/message', data: { message: {} } },
    { type: 'compaction/summary', data: { model: 'local' } },
    { type: 'compaction/summary', data: { model, usage, llmStreamCall:true }, time: midnight },
    { ...call(), data: { ...call().data, usage: undefined } }]);
  const { total } = await ledger.query(); assert.deepEqual(total, { calls:2, knownCalls:1, unknownCalls:1, knownCostUsd:1720/1e6 });
});
