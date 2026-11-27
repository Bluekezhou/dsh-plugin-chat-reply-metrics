// Select only durable assistant messages, not streaming interruption placeholders.
export function latestCall(snapshot) {
  return snapshot.eventNodes.findLast(node => node.kind === 'assistant' && node.messageId);
}

// Rate lookup: exact model ID first, then the longest catalog key that is a
// hyphen-boundary suffix, so provider-prefixed routes like `anthropic-kimi-k3`
// price as `kimi-k3` without per-prefix entries. Unknown names stay unpriced.
export function rateCard(model, prices) {
  if (typeof model !== 'string') return null;
  if (Object.hasOwn(prices, model)) return prices[model];
  let best = null;
  for (const key of Object.keys(prices)) {
    const i = model.length - key.length;
    if (i > 0 && model[i - 1] === '-' && model.endsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? prices[best] : null;
}

// The build embeds this pure function and the sanitized USD/Mtok catalog in the client.
export function measure(node, prices) {
  const model = node.providerMetadata?.model || node.requestConfig?.model;
  const u = node.usage ?? {}, timing = node.timing ?? {};
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const out = u.outputTokens;
  const dt = Number.isFinite(timing.firstTokenTime) ? timing.completedTime - timing.firstTokenTime : NaN;
  const speed = count(out) && dt > 0 ? out * 1000 / dt : null;
  let cost = null;
  const card = rateCard(model, prices);
  const read = u.cacheReadTokens ?? 0, write = u.cacheWriteTokens ?? 0;
  if (card && [u.inputTokens, out, read, write].every(count)) {
    const prompt = u.inputTokens + read + write;
    if (u.totalTokens == null || u.totalTokens === prompt + out) {
      const tier = card.tiers.findLast(t => prompt > t.inputTokensAbove) ?? card;
      cost = (u.inputTokens*tier.input + read*tier.cacheRead + write*tier.cacheWrite + out*tier.output)/1e6;
    }
  }
  return {model, output:count(out)?out:null, speed, cost};
}
