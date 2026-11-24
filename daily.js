import { randomUUID } from 'node:crypto'

// Calendar arithmetic, not elapsed-hour arithmetic: DST days aren't always 24 hours.
export function dailyWindow(time, timeZone) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('日报时间须为 HH:mm')
  const clock = new Intl.DateTimeFormat('en-US', {timeZone, calendar:'gregory', numberingSystem:'latn', hourCycle:'h23',
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})
  return instant => {
    const p = Object.fromEntries(clock.formatToParts(instant).map(({type,value}) => [type,value]))
    if (`${p.hour}:${p.minute}` < time) return null
    return new Date(Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day)-1)).toISOString().slice(0,10)
  }
}

export function formatDaily(date, zone, {total, models, skippedSessions}) {
  const amount = entry => entry.knownCalls === 0 && entry.unknownCalls > 0 ? '未知' : `US$${Number(entry.knownCostUsd).toFixed(6)}`
  const line = e => `已知小计 ${amount(e)}；${e.calls} 次调用（${e.unknownCalls} 次费用未知）`
  const out = [`DSH 模型成本日报 · ${date} (${zone})`, '全部会话（含子代理）', line(total)]
  if (skippedSessions) out.push(`未能读取 ${skippedSessions} 个会话，统计不完整。`)
  if (models.length) out.push('按模型：')
  // Never send prompts, session names, or raw logs. Bound the single Feishu message.
  let bytes = Buffer.byteLength(out.join('\n'))
  for (const [i, m] of models.entries()) {
    const model = String(m.model || '未知模型').replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0,128)
    const s = `${model}：${line(m)}`
    bytes += Buffer.byteLength(s)+1
    if (bytes > 11400) { out.push(`其余 ${models.length-i} 个模型已计入小计。`); break }
    out.push(s)
  }
  return out.join('\n')
}

// A persisted pending ID survives a crash between a successful POST and checkpointing.
// Feishu's idempotency window is finite: delivery is not a distributed transaction.
export function startDaily({query, open, send, time, zone, now=Date.now, warn=()=>{}, every=setInterval, cancel=clearInterval}) {
  const due = dailyWindow(time,zone)
  let stopped = false, task, store, record, loaded = false, retryAt = 0
  async function run() {
    const date = due(now())
    if (!date || now() < retryAt) return
    store ??= await open()
    if (!loaded) { record = (await store.loadAll()).global; loaded = true }
    if (stopped || record?.sent >= date) return
    if (record?.pending !== date) {
      const next = {sent:record?.sent ?? null, pending:date, uuid:randomUUID()}
      await store.setGlobal(next); record = next
    }
    const summary = await query({date,timeZone:zone})
    if (stopped || due(now()) !== date) return
    await send(formatDaily(date,zone,summary),record.uuid)
    const next = {sent:date}; await store.setGlobal(next); record = next
  }
  function tick() {
    if (!stopped && !task) task = run().catch(() => {
      retryAt = now()+300000
      if (!stopped) warn('成本日报未完成；请检查飞书会话绑定、机器人发信权限及本地存储，五分钟后重试。')
    }).finally(() => { task = undefined })
    return task
  }
  const timer = every(tick,60000); timer.unref?.(); tick()
  return {tick, async stop() { stopped = true; cancel(timer); await task; await store?.close() }}
}

export function mountDaily(ctx, config, query) {
  if (config?.dailyEnabled !== true) return
  const time = config.dailyTime ?? '09:00', zone = config.dailyTimeZone ?? 'Asia/Shanghai'
  try { dailyWindow(time, zone) } catch { console.warn('[DSH metrics] 日报时间或时区无效；已停用日报。'); return }
  ctx.inject(['storage','storage.backend.json','feishuOwnerMessenger'], sub => {
    sub.effect(() => {
      const {stop} = startDaily({time,zone,query,
        open: () => sub.storage.backend.get('json').kv.open({name:'dsh-chat-metrics-daily',version:1,tables:[],hasGlobal:true}),
        send: (text,uuid) => sub.feishuOwnerMessenger.sendOwnerText(text,uuid), warn: message => console.warn('[DSH metrics]',message)})
      return stop
    })
  })
}
