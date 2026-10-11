"use strict";
const {iconButton}=require('./card-controls.js');
const {arcPath}=require('./time-ring-model.js');
const {formatStatRange}=require('./property-statistics.js');
const {accent}=require('./statistic-appearance.js');
function renderProgressRings(host,result,config,state,{plugin,context={}}){
  const t=(a,b)=>plugin.getNoriaLocale()==='zh'?a:b,doc=host.ownerDocument,series=result.series;
  const number=n=>n==null?'—':new Intl.NumberFormat(plugin.getNoriaLocale(),{maximumFractionDigits:2}).format(n);
  const statusText=metric=>({empty:metric.source==='tasks'?t('没有纳入的任务','No tasks in this cohort'):metric.source==='habits'?t('没有应打卡次数','No scheduled check-ins'):t('暂无记录','No records'),
    'no-target':t('未设目标','No target set'),incomplete:t('数据不完整，查看来源','Incomplete data; view sources'),negative:t('负值不绘制进度','Negative values have no progress arc')})[metric.status]||'';
  const detail=metric=>metric.value==null?'—':number(metric.value)+(metric.target?` / ${number(metric.target)}`:'')+(metric.unit?' '+metric.unit:'');
  const shell=context.preview?null:host.closest('.noria-diary-card,.dashboard-home-widget-shell');
  const tools=shell?.querySelector('.noria-diary-card-tools,.dashboard-guide-card__tools');
  if(tools)shell.classList.add('noria-stat-card');
  const head=(tools||host).createDiv({cls:'noria-stat-toolbar'+(tools?' noria-stat-header':'')});
  if(tools)tools.insertBefore(head,tools.querySelector('.noria-diary-card-menu,.dashboard-home-widget-shell-actions'));
  const range=result.range,locale=plugin.getNoriaLocale();
  const formatter=new Intl.DateTimeFormat(locale,{month:'numeric',day:'numeric',...(range&&(range.start.slice(0,4)!==range.end.slice(0,4)||range.start.slice(0,4)!==plugin.getLocalYmd().slice(0,4))?{year:'numeric'}:{})});
  head.createSpan({cls:'noria-stat-range',text:range?formatter.formatRange(new Date(range.start+'T12:00:00'),new Date(range.end+'T12:00:00')):t('不限时间','All dates'),attr:{title:range?formatStatRange(range,locale):t('不限时间','All dates')}});
  host.addClass('noria-progress-rings');
  const stage=host.createDiv({cls:'noria-progress-rings-stage'});
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 320');svg.setAttribute('tabindex','0');svg.setAttribute('role','group');svg.classList.add('noria-stat-plot');stage.append(svg);
  const center=stage.createEl('button',{cls:'noria-progress-rings-readout',attr:{type:'button'}}),label=center.createSpan({cls:'noria-progress-rings-label'}),value=center.createSpan({cls:'noria-progress-rings-value'}),amount=center.createSpan({cls:'noria-progress-rings-amount'});
  const legend=host.createDiv({cls:'noria-progress-rings-legend',attr:{role:'group','aria-label':t('选择指标','Select metric')}}),note=host.createDiv({cls:'noria-progress-rings-note'});
  let selected=series.find(s=>s.id===state.ring)||series[0];state.ring=selected.id;
  const marks=[],buttons=[];
  function openSource(){
    const metric=selected,rule=metric.source==='tasks'?(metric.cohort==='due'?t('此范围截止任务的当前完成状态','Current completion of tasks due in this range'):t('此范围计划任务的当前完成状态','Current completion of tasks scheduled in this range')):metric.source==='habits'?t('截至今天应打卡次数，按历史计划','Scheduled check-ins through today, using historical plans'):(metric.calculate==='mean'?t('已记录数值的平均值','Mean of recorded values'):t('已记录数值的合计','Sum of recorded values'));
    const rows=(metric.result.rows||[]).map(row=>({...row,fieldName:metric.source==='diary'?number(row.value)+(metric.unit?' '+metric.unit:''):row.done?t('已完成','Completed'):t('未完成','Incomplete')}));
    plugin.propertyStats.openRows(rows,{...metric.result,denominatorLabel:undefined,...(metric.source==='diary'?{sourceNotes:new Set((metric.result.rows||[]).map(r=>r.path)).size,invalid:metric.result.invalid||[],unreadable:metric.result.unreadable||[]}:{}),summary:[rule,detail(metric),statusText(metric),metric.result.error].filter(Boolean).join(' · ')},metric.label,false,{preview:!!context.preview});
  }
  const action={icon:'list',label:t('当前指标与来源','Selected metric & sources'),run:openSource};
  if(tools)shell._noriaRecordActions=[...shell._noriaRecordActions||[],action];else iconButton(head,'list',action.label,openSource);
  center.onclick=openSource;
  const draw=(tag,attrs)=>{const element=doc.createElementNS(svg.namespaceURI,tag);for(const [key,v]of Object.entries(attrs))element.setAttribute(key,String(v));svg.append(element);return element;};
  const fallback=['var(--color-cyan)','var(--color-purple)','var(--color-orange)','var(--color-green)'];
  series.forEach((metric,index)=>{
    const field=plugin.records.definitions().find(f=>f.property===metric.property),color=accent(config.appearance)||(field?plugin.records.color(field):fallback[index]),radius=132-index*21;
    const track=draw('circle',{cx:160,cy:160,r:radius,fill:'none',stroke:'var(--background-modifier-border)','stroke-width':11,...(metric.status!=='ready'?{'stroke-dasharray':'2 6'}:{})});
    const arc=draw('path',{d:metric.arc>0?arcPath(radius,0,metric.arc):'',fill:'none',stroke:color,'stroke-width':11,'stroke-linecap':metric.arc===1?'butt':'round',class:'noria-progress-rings-arc'});
    const hit=draw('circle',{cx:160,cy:160,r:radius,fill:'none',stroke:'transparent','stroke-width':20,class:'noria-progress-rings-hit'});
    const title=doc.createElementNS(svg.namespaceURI,'title');title.textContent=metric.label+' · '+detail(metric);hit.append(title);
    hit.onpointerenter=()=>show(metric);hit.onclick=()=>{show(metric,true);svg.focus({preventScroll:true});};marks.push({id:metric.id,arc,track});
    const button=legend.createEl('button',{cls:'noria-progress-rings-item',attr:{type:'button','data-progress-ring':metric.id}});button.style.setProperty('--noria-progress-color',color);
    button.createSpan({cls:'noria-progress-rings-dot',attr:{'aria-hidden':'true'}});const text=button.createSpan({cls:'noria-progress-rings-item-text'});text.createSpan({cls:'noria-progress-rings-name',text:metric.label});text.createSpan({cls:'noria-progress-rings-detail',text:metric.status==='ready'?detail(metric):statusText(metric)});
    button.title=metric.label+' · '+detail(metric)+' · '+statusText(metric);button.onclick=()=>show(metric,true);buttons.push({id:metric.id,button});
  });
  function show(metric,pin=false){
    selected=metric;if(pin)state.ring=metric.id;
    label.textContent=metric.label;value.textContent=metric.ratio==null?(metric.status==='empty'?'—':number(metric.value)):number(metric.ratio*100)+'%';amount.textContent=metric.ratio==null?(metric.value==null?'':metric.unit):detail(metric);
    center.title=[metric.label,detail(metric),statusText(metric)].filter(Boolean).join(' · ');center.setAttribute('aria-label',center.title+' · '+t('查看来源','View sources'));
    svg.setAttribute('aria-label',t('进度环','Progress rings')+' · '+center.title);
    note.textContent=statusText(metric)|| (metric.source==='tasks'?(metric.cohort==='due'?t('按截止日期','By due date'):t('按计划日期','By scheduled date')):metric.source==='habits'?t('按应打卡次数','Against scheduled check-ins'):metric.calculate==='mean'?t('记录平均值','Mean of recorded values'):t('记录合计','Sum of recorded values'));
    for(const mark of marks){mark.arc.setAttribute('data-selected',String(mark.id===metric.id));mark.track.setAttribute('data-selected',String(mark.id===metric.id));}
    for(const item of buttons)item.button.setAttribute('aria-pressed',String(item.id===metric.id));
  }
  svg.onpointerleave=()=>show(series.find(s=>s.id===state.ring)||series[0]);
  svg.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;event.preventDefault();if(['Enter',' '].includes(event.key)){openSource();return;}let i=series.indexOf(selected);i=event.key==='Home'?0:event.key==='End'?series.length-1:Math.max(0,Math.min(series.length-1,i+(event.key==='ArrowRight'?1:-1)));show(series[i],true);};
  host.__noriaStatChromeCleanup=()=>{head.remove();host.classList.remove('noria-progress-rings');if(tools){shell.classList.remove('noria-stat-card');shell._noriaRecordActions=(shell._noriaRecordActions||[]).filter(item=>item!==action);}delete host.__noriaStatChromeCleanup;};
  show(selected);
}
module.exports={renderProgressRings};
