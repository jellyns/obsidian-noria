"use strict";
const {renderDualAxisSvg}=require('./runtime/views/dashboard/core/components/charts/dual-axis-svg-chart.js');
const {formatStatRange}=require('./property-statistics.js');
const M=require('./periodic-stat-model.js');
function periodicTemplates(t){return [
 {id:'periodic-notes',title:t('笔记与日记字符 · 周期趋势','Notes and diary characters · Period trend'),description:t('新增笔记与当前日记字符，支持按日／周／月汇总','New notes and current diary characters grouped by day, week or month'),metric:'notes'},
 {id:'periodic-tasks',title:t('任务数量与完成率','Task count and completion rate'),description:t('沿用活动任务口径，按汇总后的数量重算比例','Activity-based tasks; ratios recalculated from grouped counts'),metric:'tasks'}
 ].map(({metric,...template})=>({...template,kind:'periodic',style:'combo',icon:'chart-no-axes-combined',size:'wide',props:{metric,scope:'follow',granularity:'auto'}}));}
function registerPeriodicStats(system,plugin){
 const t=(zh,en)=>system.text(zh,en);
 system.register({id:'noria:periodic-statistics',title:t('周期组合趋势','Periodic combination trends'),icon:'chart-no-axes-combined',supportsDate:true,
 description:t('笔记与日记字符、活动任务与完成率，跟随当前日记周期。','Notes and diary characters, or activity-based tasks and completion rates, following the diary period.'),
 fields:config=>[
  {key:'metric',label:t('统计内容','Metrics'),type:'select',default:'notes',options:[{value:'notes',label:t('新增笔记与当前日记字符','New notes and current diary characters')},{value:'tasks',label:t('活动任务数量与完成率','Activity task count and completion rate')}]},
  ...plugin.propertyStats.fields(config).filter(f=>['scope','days','start','end'].includes(f.key)).map(f=>f.key==='scope'?{...f,options:f.options.filter(o=>o.value!=='all')}:f),
  {key:'granularity',label:t('默认汇总粒度','Default grouping'),type:'select',default:'auto',options:[['auto','自动','Auto'],['day','日','Day'],['week','周','Week'],['month','月','Month']].map(([value,zh,en])=>({value,label:t(zh,en)}))}
 ],
 validate:config=>{if(!['notes','tasks'].includes(config.metric)||!['follow','rolling','fixed'].includes(config.scope)||!['auto','day','week','month'].includes(config.granularity))throw Error(t('选择有效的统计内容、时间范围与汇总粒度。','Choose valid metrics, range and grouping.'));plugin.propertyStats.validate({...config,source:'diary'});},
 render:async({container,config,selection,component})=>{
  container.addClass('noria-periodic-stat');let disposed=false,generation=0,timer,current=config.granularity||'auto',model,range,selectedKey;
  const notes=config.metric==='notes',locale=plugin.getNoriaLocale(),number=new Intl.NumberFormat(locale,{maximumFractionDigits:1}),compact=new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1});
  const format=n=>n==null?'—':number.format(n),barName=notes?t('当前日记字符','Diary characters'):t('活动任务','Activity tasks'),lineName=notes?t('新增笔记','New notes'):t('完成率','Completion rate');
  const top=container.createDiv({cls:'noria-periodic-toolbar'}),date=top.createSpan({cls:'noria-card-secondary'}),switcher=top.createDiv({cls:'noria-periodic-granularity',attr:{'aria-label':t('汇总粒度','Grouping')}});
  const status=container.createDiv({cls:'noria-card-secondary',attr:{role:'status'}}),body=container.createDiv();
  const legend=body.createDiv({cls:'noria-periodic-legend'});
  legend.createSpan({cls:'noria-periodic-line-label',text:lineName+t(' · 左轴',' · left axis')});
  legend.createSpan({cls:'noria-periodic-bar-label',text:barName+t(' · 右轴',' · right axis')});
  const chart=body.createDiv(),readout=body.createDiv({cls:'noria-periodic-readout',attr:{'aria-live':'polite','aria-atomic':'true'}}),period=readout.createDiv({cls:'noria-periodic-selected-date'}),values=readout.createDiv({cls:'noria-periodic-values'});
  const lineValue=values.createSpan(),barValue=values.createSpan();
  const details=body.createEl('details',{cls:'noria-periodic-data'});details.createEl('summary',{text:t('数值与统计口径','Values and definitions')});
  details.createEl('p',{cls:'noria-card-secondary',text:notes?t('新增笔记按 created 属性（缺失时取文件创建时间）统计；当前日记字符是对应日期文件去除空白后的字符数，包含 Markdown 标记。','New notes use created, falling back to file creation time. Diary characters count non-whitespace characters in dated diary files, including Markdown markup.'):t('已完成任务按完成日归入，未完成任务按截止日、安排日、开始日或所在日记日期归入；完成率为本时段已完成数 ÷ 活动任务数。无任务时不计算比例。','Completed tasks use completion dates; open tasks use due, scheduled, start or diary dates. Rate = completed / activity tasks in each period; no tasks means no rate.')});
  const table=details.createEl('table'),head=table.createEl('thead').createEl('tr');for(const title of [t('日期／周期','Date / period'),barName,lineName])head.createEl('th',{text:title,attr:{scope:'col'}});
  const rows=table.createEl('tbody');
  const inspect=index=>{
   const row=model[index];if(!row)return;selectedKey=row.key;
   const next=model[index+1]?.start,end=next?new Date(Date.parse(next+'T12:00:00Z')-86400000).toISOString().slice(0,10):range.end;
   period.setText(formatStatRange({start:row.start,end},locale));
   lineValue.setText(`${lineName}  ${format(row.line)}${notes||row.line==null?'':'%'}`);barValue.setText(`${barName}  ${format(row.bar)}`);
  };
  const draw=()=>{
   if(disposed||!model)return;const focused=chart.contains(container.ownerDocument.activeElement);chart.empty();
   const hasActivity=model.some(row=>row.bar||row.line);legend.hidden=!hasActivity;readout.hidden=!hasActivity;
   if(!hasActivity){chart.createDiv({cls:'noria-card-empty',text:t('此范围没有可展示的活动。','No activity in this range.')});return;}
   let selected=model.findIndex(row=>row.key===selectedKey);if(selected<0)selected=model.findLastIndex(row=>row.bar||row.line);
   const acrossYears=range.start.slice(0,4)!==range.end.slice(0,4);
   const tickLabels=model.map(row=>{
    const date=new Date(row.start+'T12:00:00');
    return Number.isNaN(date.getTime())?row.key:new Intl.DateTimeFormat(locale,{...(acrossYears?{year:'2-digit'}:{}),month:'numeric',...(container.dataset.granularity==='month'?{}:{day:'numeric'})}).format(date);
   });
   renderDualAxisSvg(chart,{bare:true,title:t('周期趋势','Period trend'),barSeries:model.map(r=>r.bar),lineSeries:model.map(r=>r.line),labels:model.map(r=>r.key),tickLabels,barName,lineName,lineMax:notes?undefined:100,lineUnit:notes?'':'%',formatValue:n=>compact.format(n),onInspect:inspect,selectedIndex:selected,keyboardLabel:t('周期趋势：左右键选择时段，Home／End 到首尾，下方显示完整数值。','Period trend: use arrow keys to select a period, Home / End for first / last. Full values appear below.')});
   if(focused)chart.querySelector('.noria-periodic-plot')?.focus({preventScroll:true});
  };
  const paint=async()=>{
   const serial=++generation;status.setText(t('正在更新…','Updating…'));container.setAttribute('aria-busy','true');
   try{
    const nextRange=await plugin.propertyStats.range(config,selection),group=M.granularity({...config,granularity:current},nextRange);
    const service=await plugin.createDataService(),snapshot=await service.getSnapshot({preset:'periodic',range:{mode:'custom',...nextRange},granularity:group});
    if(disposed||serial!==generation)return;range=nextRange;model=M.series(snapshot,config.metric);date.setText(formatStatRange(range,plugin.getNoriaLocale()));
    container.dataset.granularity=group;for(const b of switcher.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.granularity===group));
    status.empty();body.hidden=false;rows.empty();
    for(const row of model){const tr=rows.createEl('tr');tr.createEl('th',{text:row.key,attr:{scope:'row'}});tr.createEl('td',{text:format(row.bar)});tr.createEl('td',{text:format(row.line)+(notes||row.line==null?'':'%')});}
    draw();
   }catch(e){if(!disposed&&serial===generation){model=null;body.hidden=true;date.setText('');status.setText(e.message||String(e));const retry=status.createEl('button',{text:t('重试','Retry'),attr:{type:'button'}});retry.onclick=()=>void paint();}}
   finally{if(!disposed&&serial===generation)container.setAttribute('aria-busy','false');}
  };
  for(const [key,zh,en] of [['day','日','Day'],['week','周','Week'],['month','月','Month']]){const b=switcher.createEl('button',{text:t(zh,en),attr:{type:'button','data-granularity':key,'aria-pressed':'false'}});b.onclick=()=>{current=key;void paint();};}
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(paint,180);};
  component.registerEvent(plugin.app.metadataCache.on('changed',refresh));component.registerEvent(plugin.app.vault.on('delete',refresh));
  let width=container.clientWidth;const observer=new ResizeObserver(()=>{const next=container.clientWidth;if(Math.abs(next-width)>10){width=next;draw();}});observer.observe(container);
  component.register(()=>{disposed=true;++generation;clearTimeout(timer);observer.disconnect();});await paint();
 }});
}
module.exports={periodicTemplates,registerPeriodicStats};
