import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('shipped dock renders exact and prefixed model costs, hiding unknowns', () => {
  let entry, dock;
  const react = {createElement: (type, props, ...children) => ({type, props, children}), useState: x => [x, () => {}], useEffect() {}};
  vm.runInNewContext(fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {window: {__ModuleLoader__: {load: x => {entry = x;}}}});
  entry.factory(() => react).apply({effect() {}, locale: {bind: () => k => k}, slots: {inject: (_, fn) => fn(), register: (_, fn) => {dock = fn;}}});
  for (const [model, expected] of [['gpt-6.2-astra', '$16.0000'], ['anthropic-kimi-k3', '$3.0000'], ['no-such-model', null]]) {
    const node = {kind: 'assistant', messageId: 'a', requestConfig: {model}, usage: {inputTokens: 1000000, outputTokens: 0}};
    const component = dock({sessionId: 's', useTrajectory: select => select({eventNodes: [node]})});
    const price = component.type(component.props).children.find(x => x?.props?.className === 'dcrm-last');
    assert.equal(price?.children[0] ?? null, expected && `last ≈ ${expected}`);
  }
});
