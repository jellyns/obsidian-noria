"use strict";
const {diaryRange}=require('./diary-tasks.js');
const {supportsRange}=require('./dashboard-statistic-settings.js');
const {formatStatRange}=require('./property-statistics.js');

// Diary owns the selected period. A card resolves it without changing Home's range.
function diaryStatisticInput(widget,selection){
  if(!supportsRange(widget))throw Error('Unsupported diary statistic');
  const props={...widget.props,lazy:false,cardContent:true};
  const follow=!props.statsRange||props.statsRange.mode==='homeCurrent';
  if(follow)props.statsRange={mode:'custom',...diaryRange(selection)};
  return {widget:{...widget,props},follow};
}

async function renderDiaryStatistic(plugin,widget,container,selection,component){
  const resolved=diaryStatisticInput(widget,selection),bridge=plugin.buildRuntimeBridgeConfig();
  bridge.statisticsPageId=`diary:${globalThis.crypto.randomUUID()}`;
  bridge.homeEditMode=false;
  const context=container.closest?.('.noria-diary-card')?._noriaDiaryContext?.()||{page:'diary',mode:selection.mode,selection};
  bridge.runtime.renderDailyRecordSummary=(host,range,options)=>plugin.propertyStats.renderDailySummary(host,range,{...options,
    context,
    headerTools:host.closest('.noria-diary-card')?.querySelector('.noria-diary-card-tools'),
    getWidget:id=>(context.noteCards?.layout()||plugin.cards.layout(selection.mode)).widgets.find(item=>item.id===id),
    saveWidget:next=>context.noteCards?context.noteCards.update(items=>{const model=require('./diary-cards-document.js');return model.localId(next.id)?model.editNoteCard(items,next):model.addNoteCard(items,{...next,replaces:next.id});}):plugin.cards.updateLayout(selection.mode,layout=>{const index=layout.widgets.findIndex(item=>item.id===next.id);if(index<0)throw Error('Card no longer exists');layout.widgets[index]=next;return layout;})});
  const requested=resolved.widget.props.statsRange;
  const range=requested.mode==='all'?null:await (await plugin.createDataService()).resolveRange(requested);
  if(range)resolved.widget.props.statsGranularity=require('./periodic-stat-model.js').granularity({},range);
  // Trend and daily-record renderers already own their header range.
  const ownsRange=['note-trend-card','task-trend-card','daily-state-card'].includes(widget.builtinId||widget.id);
  if(!resolved.follow&&!ownsRange){
    const tools=container.closest?.('.noria-diary-card')?.querySelector('.noria-diary-card-tools');
    const text=range?formatStatRange(range,plugin.getNoriaLocale()):plugin.cards.text('今日与累计','Today and all-time');
    const label=(tools||container).createSpan({cls:'noria-card-secondary noria-trend-range',text,
      attr:{title:range?range.start+' — '+range.end:plugin.cards.text('今日新增与累计完成','Today and all-time')}});
    if(tools)tools.insertBefore(label,tools.querySelector('.noria-diary-card-menu'));
    component.register(()=>label.remove());
  }
  const mount=container.createDiv({cls:'noria-diary-statistic'});
  if(range){mount.dataset.rangeStart=range.start;mount.dataset.rangeEnd=range.end;}
  let disposed=false;
  const cleanup=()=>{disposed=true;mount.__noriaHomeCleanup?.();};
  component.register(cleanup);
  await plugin.runNoriaView('.obsidian/plugins/noria/views/dashboard/home',{
    workbench:true,noriaBridge:bridge,previewWidget:resolved.widget
  },mount);
  if(disposed){cleanup();mount.remove();}
}
module.exports={diaryStatisticInput,renderDiaryStatistic};
