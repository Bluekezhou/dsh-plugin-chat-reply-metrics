import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {measure,latestCall} from '../src/metrics.js';
test('dock selects the latest durable call even if it is unpriced',()=>{
  const select=(...nodes)=>latestCall({eventNodes:nodes});
  const prior={kind:'assistant',messageId:'a'}, current={kind:'assistant',messageId:'b'};
  assert.equal(select(),undefined);assert.equal(select(prior,current,{kind:'assistant',interrupted:true},{kind:'user'}),current);
});
const prices=JSON.parse(fs.readFileSync(new URL('../data/rates.json',import.meta.url)));const node={providerMetadata:{provider:'localcodex',model:'gpt-6.2-astra'},usage:{inputTokens:100,cacheReadTokens:50,cacheWriteTokens:10,outputTokens:20,reasoningTokens:5},timing:{firstTokenTime:1000,completedTime:1500}};
test('historical exact route, disjoint token buckets, stream-only timing',()=>{const m=measure(node,prices);assert.equal(m.cost,2175/1e6);assert.equal(m.speed,40)});
test('tier threshold excludes output and includes cached prompt',()=>{const calc=n=>measure({...node,usage:{inputTokens:1,cacheReadTokens:n,outputTokens:1}},prices).cost;assert.equal(calc(271999),(10+271999+50)/1e6);assert.equal(calc(272000),(20+272000*2+75)/1e6)});
test('model price does not depend on provider',()=>{
  for(const provider of ['other',undefined])assert.equal(measure({...node,providerMetadata:{model:'gpt-6.2-astra',provider}},prices).cost,2175/1e6);
  assert.equal(measure({...node,providerMetadata:{provider:'other'},requestConfig:{model:'gpt-6.2-astra'}},prices).cost,2175/1e6);
});
test('configured GLM overrides are priced by model ID',()=>{
  const lookup=model=>measure({requestConfig:{model},usage:{inputTokens:1_000_000,outputTokens:0}},prices).cost;
  assert.equal(lookup('glm-5.3'),1.19);assert.equal(lookup('glm-5.3-flash'),0.12);
  assert.equal(lookup('glm-5.2-highspeed'),1.4);assert.equal(lookup('glm-5.3-highspeed'),1.19);assert.equal(lookup('glm-4.6v'),0.15);
});
test('provider-prefixed routes price by the longest hyphen-boundary suffix',()=>{
  const lookup=model=>measure({requestConfig:{model},usage:{inputTokens:1_000_000,outputTokens:0}},prices).cost;
  assert.equal(lookup('anthropic-kimi-k3'),3);assert.equal(lookup('kimi-k3'),3);
  assert.equal(lookup('gw-glm-5.3-flash'),0.12);assert.equal(lookup('gw-glm-5.3'),1.19);
  assert.equal(lookup('someone-claude-haiku-5-5'),0.5);
});
test('suffix matching never crosses segment boundaries or guesses',()=>{
  const lookup=model=>measure({requestConfig:{model},usage:{inputTokens:1_000_000,outputTokens:0}},prices).cost;
  for(const model of ['xkimi-k3','kimi-k3x','glm-5.3-flash-extra','k3','moonshot'])assert.equal(lookup(model),null);
});
test('unknown model names are not guessed',()=>{
  for(const model of ['gpt-6.2-astra-custom','toString',undefined])assert.equal(measure({...node,providerMetadata:{model}},prices).cost,null);
});
test('missing or contradictory evidence does not become a charge or a speed',()=>{assert.equal(measure({...node,usage:{...node.usage,totalTokens:3}},prices).cost,null);assert.equal(measure({...node,timing:{firstTokenTime:null,completedTime:3}},prices).speed,null);assert.equal(measure({...node,usage:undefined},prices).cost,null)});
