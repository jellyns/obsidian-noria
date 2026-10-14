'use strict';
// Build a working dashboard from existing renderers, never a gallery of samples.
function statisticsDefaults(plugin){
 const defaults=plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[],cards=[];
 const add=(widget,span)=>cards.push({...structuredClone(widget),id:`card-${crypto.randomUUID()}`,enabled:true,order:cards.length*10,layout:{span},props:{...widget.props,cardHeight:null,lazy:false}});
 for(const [id,span] of [['metrics',12],['note-trend-card',6],['task-trend-card',6],['habit-history-card',12],['daily-state-card',12]]){
  const widget=defaults.find(w=>w.id===id);if(widget)add({...widget,builtinId:id,props:{...widget.props,statsRange:{mode:'homeCurrent'}}},span);
 }
 const pages=plugin.cards.pages.read().pages;
 for(const [pageId,sources] of [['page-health',['noria:health-sleep','noria:health-steps']],['page-finance',['noria:finance-cashflow','noria:finance-categories']]]){
  const page=pages.find(p=>p.id===pageId&&!p.hidden);if(!page)continue;
  for(const source of sources){const widget=page.widgets?.find(w=>w.source===source&&w.enabled!==false);if(widget&&plugin.cards.providers.has(source))add(widget,source==='noria:finance-cashflow'?8:source==='noria:finance-categories'?4:6);}
 }
 return cards;
}
module.exports={statisticsDefaults};
