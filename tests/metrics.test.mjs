import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {measure,latestCall} from '../src/metrics.js';
test('dock selects the latest durable call even if it is unpriced',()=>{
  const select=(...nodes)=>latestCall({eventNodes:nodes});
  const prior={kind:'assistant',messageId:'a'}, current={kind:'assistant',messageId:'b'};
  assert.equal(select(),undefined);assert.equal(select(prior,current,{kind:'assistant',interrupted:true},{kind:'user'}),current);
});
const prices=JSON.parse(fs.readFileSync(new URL('../data/rates.json',import.meta.url)));const node={providerMetadata:{provider:'localcodex',model:'gpt-6.2-astra'},usage:{inputTokens:100,cacheReadTokens:50,cacheWriteTokens:10,outputTokens:20,reasoningTokens:5},timing:{firstTokenTime:1000,completedTime:1500}};
test('historical exact route, disjoint token buckets, stream-only timing',()=>{const m=measure(node,prices);assert.equal(m.cost,2175/1e6);assert.equal(m.speed,40)});
test('tier threshold excludes output and includes cached prompt',()=>{const calc=n=>measure({...node,usage:{inputTokens:1,cacheReadTokens:n,outputTokens:1}},prices).cost;assert.equal(calc(271999),(10+271999+50)/1e6);assert.equal(calc(272000),(20+272000*2+75)/1e6)});
test('never guess a rate for the same model on a different provider',()=>assert.equal(measure({...node,providerMetadata:{...node.providerMetadata,provider:'other'}},prices).cost,null));
test('missing or contradictory evidence does not become a charge or a speed',()=>{assert.equal(measure({...node,usage:{...node.usage,totalTokens:3}},prices).cost,null);assert.equal(measure({...node,timing:{firstTokenTime:null,completedTime:3}},prices).speed,null);assert.equal(measure({...node,usage:undefined},prices).cost,null)});
