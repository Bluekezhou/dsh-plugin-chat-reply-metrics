export function factory(require, measure, latestCall, catalog) {
  const React = require('react'), h = React.createElement;
  const strings = {
    zh:{sessionTotal:'总消费',knownSubtotal:'已知小计',last:'上次',partial:'已读取会话小计',loaded:'已加载模型数：',title:'消耗明细',current:'当前会话',all:'所有会话',self:'会话自身',roots:'普通会话',children:'子代理（含嵌套）',total:'合计',model:'按模型',scope:'统计范围',calls:'调用次数',cost:'已知费用（美元）',unknown:'未计价次数',close:'关闭',refresh:'刷新',loading:'正在汇总会话记录…',failed:'读取失败，请刷新重试。',empty:'尚无已记录的模型调用。',note:'金额按模型费率估算，不是账单。未计价的调用不计入金额。',skipped:'未能读取的会话：',unpriced:'费用未知',dockHelp:'最近一次已完成模型调用的估算费用'},
    en:{sessionTotal:'Session total',knownSubtotal:'Known subtotal',last:'Last',partial:'Readable sessions subtotal',loaded:'Models loaded: ',title:'Cost details',current:'This session',all:'All sessions',self:'Session itself',roots:'Non-agent sessions',children:'Subagents (including nested)',total:'Total',model:'By model',scope:'Scope',calls:'Calls',cost:'Known cost (USD)',unknown:'Unpriced calls',close:'Close',refresh:'Refresh',loading:'Reading session records…',failed:'Could not load costs. Refresh to retry.',empty:'No recorded model calls yet.',note:'Estimates use model rates, not billing data. Unpriced calls are excluded from amounts.',skipped:'Unreadable sessions: ',unpriced:'Cost unavailable',dockHelp:'Estimated cost of the latest completed model call'}
  };
  const css=`.dcrm-dialog{box-sizing:border-box;width:min(660px,94vw);max-height:85vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:20px;font:var(--dsw-font-s-14,14px/1.5 sans-serif)}.dcrm-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 25%,transparent)}.dcrm-dialog header,.dcrm-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dcrm-dialog h2{margin:0 auto 0 0;font:var(--dsw-font-base-strong-16,600 16px/1.5 sans-serif)}.dcrm-dialog button,.dcrm-open{font:inherit;color:inherit;cursor:pointer}.dcrm-dialog button{padding:4px 9px;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px}.dcrm-dialog button[aria-pressed=true]{color:var(--dsw-alias-brand-primary);border-color:currentColor}.dcrm-tools{margin:16px 0}.dcrm-scroll{overflow-x:auto}.dcrm-dialog table{width:100%;border-collapse:collapse;margin-bottom:16px;font-variant-numeric:tabular-nums}.dcrm-dialog td,.dcrm-dialog th{padding:6px;text-align:end;border-bottom:1px solid var(--dsw-alias-border-l1)}.dcrm-dialog tr>:first-child{text-align:start;overflow-wrap:anywhere}.dcrm-dialog p{color:var(--dsw-alias-label-secondary)}.dcrm-open{border:0;background:none;padding:1px 4px;color:var(--dsw-alias-label-secondary);white-space:nowrap}.dcrm-open:hover{text-decoration:underline}.dcrm-last,.dcrm-open{font-family:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-weight:400;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}.dcrm-dialog table{font:inherit;font-variant-numeric:tabular-nums}.dcrm-dialog th{font-weight:600}.dcrm-dialog tbody th{font-weight:400}`;
  return {inject:['slots','locale','connection'], apply(ctx) {
    ctx.effect(()=>ctx.locale.register('chatReplyMetrics',strings));
    const t = ctx.locale.bind('chatReplyMetrics');
    const format = n => n > 0 && n < .0001 ? '< $0.0001' : `$${n.toFixed(4)}`;
    function Table({label,rows}) {
      return h('div',{className:'dcrm-scroll'},h('table',{'aria-label':label},h('thead',null,h('tr',null,...[label,t('calls'),t('cost'),t('unknown')].map(k=>h('th',{key:k,scope:'col'},k)))),h('tbody',null,rows.map(([k,v])=>h('tr',{key:k},h('th',{scope:'row'},k),h('td',null,v.calls),h('td',null,v.calls && !v.knownCalls ? '—' : format(v.knownCostUsd)),h('td',null,v.unknownCalls))))));
    }
    function Report({sessionId,all,revision}) {
      const [state,set]=React.useState(null);
      React.useEffect(()=>{ const abort=new AbortController(); (async()=>{
        try { const r=await ctx.connection.rpc.call('/api',all?'chatCosts/globalCosts':'chatCosts/sessionCosts',{args:all?{}:{sessionId}},abort.signal);
          if(!r.ok) throw new Error(); if(!abort.signal.aborted)set(r.value);
        } catch { if(!abort.signal.aborted)set(false); }
      })();return ()=>abort.abort(); },[sessionId,all,revision]);
      if(!state) return h('p',{role:'status'},t(state===false?'failed':'loading'));
      return h(React.Fragment,null,h('p',{role:'status'},state.skippedSessions?t('skipped')+state.skippedSessions:t('loaded')+state.models.length),h(Table,{label:t('scope'),rows:[[t(all?'roots':'self'),state.self],[t('children'),state.descendants],[t(state.skippedSessions?'partial':'total'),state.total]]}),state.models.length?h(Table,{label:t('model'),rows:state.models.map(v=>[v.model,v])}):!state.skippedSessions&&h('p',null,t('empty')),h('p',null,t('note')));
    }
    function Panel({sessionId,onClose}) {
      const ref=React.useRef(null),[all,scope]=React.useState(false),[revision,refresh]=React.useState(0);
      React.useLayoutEffect(()=>{const d=ref.current;d.showModal();return ()=>{if(d.open)d.close();};},[]);
      return h('dialog',{ref,className:'dcrm-dialog','aria-label':t('title'),onCancel:e=>{e.preventDefault();onClose();}},h('header',null,h('h2',null,t('title')),h('button',{onClick:onClose},t('close'))),h('div',{className:'dcrm-tools'},...[false,true].map(v=>h('button',{key:String(v),'aria-pressed':v===all,onClick:()=>scope(v)},(v===all?'✓ ':'')+t(v?'all':'current'))),h('button',{onClick:()=>refresh(n=>n+1)},t('refresh'))),h(Report,{key:JSON.stringify([sessionId,all,revision]),sessionId,all,revision}));
    }
    function DockCost(props) { return h(SessionCost,{...props,key:props.sessionId}); }
    function SessionCost({useTrajectory,sessionId}) {
      const node=useTrajectory(latestCall), last=node?.messageId, cost=node?measure(node,catalog).cost:null;
      const [open,setOpen]=React.useState(false),[report,setReport]=React.useState(null);
      React.useEffect(()=>{
        const abort=new AbortController(); let timer;
        async function load(){
          try { if(!document.hidden){const r=await ctx.connection.rpc.call('/api','chatCosts/sessionCosts',{args:{sessionId}},abort.signal);if(!abort.signal.aborted)setReport(r.ok?r.value:false);} }
          catch { if(!abort.signal.aborted)setReport(false); }
          finally { if(!abort.signal.aborted)timer=setTimeout(load,30000); }
        }
        load();return ()=>{abort.abort();clearTimeout(timer);};
      },[sessionId,last]);
      const partial=report&&(report.skippedSessions>0||report.total.unknownCalls>0);
      const value=report?(partial&&!report.total.knownCalls?t('unpriced'):'≈ '+format(report.total.knownCostUsd)):report===false?t('unpriced'):'…';
      return h(React.Fragment,null,h('style',null,css),node&&h('span',{className:'dcrm-last',title:t('dockHelp')},`${t('last')} ${cost==null?t('unpriced'):'≈ '+format(cost)}`),h('button',{type:'button',className:'dcrm-open',title:t('title'),'aria-haspopup':'dialog',onClick:()=>setOpen(true)},`${t(partial?'knownSubtotal':'sessionTotal')} ${value}`),open&&h(Panel,{key:sessionId,sessionId,onClose:()=>setOpen(false)}));
    }
    const dock='conversation.composer.dock';
    ctx.slots.inject(dock,()=>ctx.slots.register({name:dock,id:'chat-reply-latest-cost',order:40},DockCost));
  }};
}
