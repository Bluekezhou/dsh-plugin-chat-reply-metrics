// Select only durable assistant messages, not streaming interruption placeholders.
export function latestCall(snapshot) {
  return snapshot.eventNodes.findLast(node => node.kind === 'assistant' && node.messageId);
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
  const card = typeof model === 'string' && Object.hasOwn(prices, model) ? prices[model] : null;
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
