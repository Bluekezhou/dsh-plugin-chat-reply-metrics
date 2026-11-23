export function factory(require, measure, latestCall, catalog) {
  const React = require('react'), h = React.createElement;
  const strings = {
    zh:{unpriced:'费用未知',dockHelp:'按最近一次已完成调用的用量和模型费率估算，非账单。'},
    en:{unpriced:'Cost unavailable',dockHelp:'Estimated from usage and model rates for the last completed call; not a bill.'}
  };
  return {inject:['slots','locale'], apply(ctx) {
    ctx.effect(()=>ctx.locale.register('chatReplyMetrics',strings));
    const t = ctx.locale.bind('chatReplyMetrics');
    function formatCost(cost) {
      return cost > 0 && cost < 0.0001 ? '< $0.0001' : `≈ $${cost.toFixed(4)}`;
    }
    function DockCost({useTrajectory}) {
      const node = useTrajectory(latestCall);
      if (!node) return null;
      const {cost,model} = measure(node,catalog);
      return h('span',{title:[model,t('dockHelp')].filter(Boolean).join(' · '),style:{color:'var(--dsw-alias-label-tertiary)',fontSize:'calc(var(--dsh-content-font-size-secondary,13px) - 1px)',lineHeight:'calc(20px + var(--dsh-content-font-delta-secondary,0px))',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}},cost == null ? t('unpriced') : formatCost(cost));
    }
    const dock='conversation.composer.dock';
    ctx.slots.inject(dock,()=>ctx.slots.register({name:dock,id:'chat-reply-latest-cost',order:40},DockCost));
  }};
}
