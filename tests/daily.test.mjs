import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyWindow, formatDaily, startDaily, mountDaily } from '../daily.js'

const total = {calls:3, knownCalls:2, unknownCalls:1, knownCostUsd:0.001}
const summary = {total,models:[{...total,model:'m'}],skippedSessions:1}
test('natural day with configured local time and DST transition', () => {
  const day = dailyWindow('09:00','Asia/Shanghai')
  assert.equal(day(new Date('2026-01-01T00:59Z')),null)
  assert.equal(day(new Date('2026-01-01T01:00Z')),'2025-12-31')
  assert.equal(dailyWindow('00:00','America/New_York')(new Date('2026-03-09T04:00Z')),'2026-03-08')
  assert.throws(() => dailyWindow('24:00','UTC'))
  assert.throws(() => dailyWindow('09:00','Mars/Foo'))
  mountDaily({}, {}, null) // no optional services or work unless configured
})
test('report distinguishes unknown costs, skipped sessions and bounds model detail', () => {
  const output = formatDaily('2026-01-01','UTC', {...summary,models:Array(1000).fill({...total,model:'测试模型'.repeat(50)})})
  assert.match(output,/已知小计 US\$0.001000/); assert.match(output,/1 次费用未知/); assert.match(output,/未能读取 1 个会话/)
  assert.match(output,/其余 \d+ 个模型/); assert.ok(Buffer.byteLength(output) < 12000)
  assert.match(formatDaily('2026-01-01','UTC',{...summary,total:{...total,knownCalls:0,knownCostUsd:0}}),/已知小计 未知/)
})
function fixture() {
  let clock = Date.parse('2026-01-02T12:30:00Z'), record=null
  const sent=[], queried=[], warnings=[]
  const config = {time:'09:00',zone:'UTC',now:()=>clock,every:()=>1,cancel:()=>{},warn:m=>warnings.push(m),
    open:async()=>({loadAll:async()=>({global:record}),setGlobal:async r=>{record=r},close:async()=>{}}),
    query:async q=>{queried.push(q);return summary},send:async (s,k)=>sent.push([s,k])}
  return {sent,queried,warnings,config, advance:ms=>{clock+=ms},record:()=>record}
}
test('retries with persisted UUID; no duplicate after restart or concurrent ticks', async () => {
  const f=fixture(); const fail=startDaily({...f.config, send:(s,k)=>{f.sent.push([s,k]);throw Error('secret')}})
  await Promise.all([fail.tick(),fail.tick()]); await fail.tick(); assert.equal(f.sent.length,1)
  assert.equal(f.warnings.length,1); assert.doesNotMatch(f.warnings[0],/secret/); await fail.stop()
  const good=startDaily(f.config); await good.tick(); await good.tick(); await good.stop()
  const restarted=startDaily(f.config); await restarted.tick(); await restarted.stop()
  assert.equal(f.sent.length,2); assert.deepEqual(f.sent[0],f.sent[1]); assert.deepEqual(f.queried[0],{date:'2026-01-01',timeZone:'UTC'})
  assert.deepEqual(f.record(),{sent:'2026-01-01'})
})
test('disable while the ledger is loading prevents sending', async()=>{
  const f=fixture(); let release,start; const started=new Promise(r=>{start=r})
  const job=startDaily({...f.config,query:()=>{start();return new Promise(r=>{release=r})}})
  await started; const stopped=job.stop(); release(summary); await stopped; assert.equal(f.sent.length,0)
})
