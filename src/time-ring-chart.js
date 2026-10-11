"use strict";
const {iconButton}=require('./card-controls.js');
const {setIcon}=require('obsidian');
const {accent}=require('./statistic-appearance.js');
const M=require('./time-ring-model.js');
function duration(ms,t){
  const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
  return hours?`${hours} ${t('小时','h')}${minutes%60?' '+minutes%60+' '+t('分','min'):''}`:minutes?`${minutes} ${t('分钟','min')}`:`${seconds===0&&ms>0?'<1':seconds} ${t('秒','s')}`;
}
function renderTimeRing(host,result,config,state,{plugin,context={}}){
  const t=(a,b)=>plugin.getNoriaLocale()==='zh'?a:b,doc=host.ownerDocument;
  host.addClass('noria-time-ring');
  const shell=context.preview?null:host.closest('.noria-diary-card,.dashboard-home-widget-shell');
  const tools=context.ringTools||shell?.querySelector('.noria-diary-card-tools,.dashboard-guide-card__tools');
  if(tools&&!context.ringTools)shell.classList.add('noria-stat-card');
  const head=(tools||host).createDiv({cls:'noria-time-ring-date'});
  if(tools)tools.insertBefore(head,tools.querySelector('.noria-diary-card-menu,.dashboard-home-widget-shell-actions'));
  const timeZone=result.timeZone||require('./task-calendar-zone.js').timelineClock(plugin.settings?.tasksCalendar).display;
  const timelineClock=require('./task-calendar-zone.js').timelineClock({timeZone});
  const range=result.range,today=timelineClock.day(Date.now()),compare=config.showSchedule===true;
  if(!state.day||config.initialDay==='today'&&!state.browsing||range&&(state.day<range.start||state.day>range.end))state.day=M.initialDay(result.rows.length?result.rows:result.planned||[],range,today,config.initialDay==='today',timeZone);
  const picker=head.createDiv({cls:'noria-time-ring-picker'});setIcon(picker.createSpan({cls:'noria-time-ring-date-icon'}),'calendar-days');const dateText=picker.createSpan();
  const date=picker.createEl('input',{attr:{type:'date','aria-label':t('查看日期','View date')}});
  date.onclick=()=>{try{date.showPicker();}catch(_){}};
  if(range){date.min=range.start;date.max=range.end;}
  date.onchange=()=>changeDay(date.value);
  head.onfocusin=()=>{host.__noriaRingEditing=true;};head.onfocusout=()=>{host.__noriaRingEditing=false;};
  const stage=host.createDiv({cls:'noria-time-ring-stage'});
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 320');svg.classList.add('noria-stat-plot');svg.setAttribute('tabindex','0');svg.setAttribute('role','group');stage.append(svg);
  svg.setAttribute('aria-description',t('左右方向键选择时段，回车打开来源，Esc返回当天总览。','Use arrow keys to choose an interval, Enter to open its source, and Escape to return to the day summary.'));
  const center=stage.createDiv({cls:'noria-time-ring-center'}),value=center.createDiv({cls:'noria-time-ring-value'}),caption=center.createDiv({cls:'noria-time-ring-caption',text:t('已记录专注','Recorded focus')});
  const title=center.createEl('button',{cls:'noria-time-ring-source',attr:{type:'button'}});
  const note=iconButton(head,'circle-alert',t('记录提示','Record notices'),()=>{});note.hidden=true;
  const plannedValue=compare?center.createDiv({cls:'noria-time-ring-planned-value'}):null;
  if(plannedValue)plannedValue.title=t('外圈为安排，内圈为实际专注；两者分别统计','Outer ring: schedule; inner ring: actual focus. Totals are separate.');
  let model,plannedModel,selectionRows=[],selected,marks=[];
  const sourceAction={icon:'list',label:t('时段与来源','Intervals & sources'),run:()=>plugin.propertyStats.openRows([...selectionRows.map(row=>({...row,focusAnchor:row.anchor,date:state.day,fieldName:(row.kind==='schedule'?t('安排 · ','Scheduled · '):t('专注 · ','Focus · '))+`${interval(row,true)} · ${duration(row.to-row.from,t)}`})),...result.scheduleErrors||[]],{recorded:selectionRows.length,summary:timeZone+' · '+t('安排与专注分别统计；暂停不计，各自的重叠时长只计一次，空白不代表空闲。','Schedules and focus are counted separately. Pauses are excluded, overlaps within each count once, and unrecorded time is not free time.')},state.day,false,{preview:!!context.preview})};
  if(shell)shell._noriaRecordActions=[...shell._noriaRecordActions||[],sourceAction];
  else iconButton(head,sourceAction.icon,sourceAction.label,sourceAction.run);
  const draw=(tag,attributes)=>{const el=doc.createElementNS(svg.namespaceURI,tag);for(const [key,v]of Object.entries(attributes))el.setAttribute(key,String(v));svg.append(el);return el;};
  function clock(ms,seconds=false){return new Intl.DateTimeFormat(plugin.getNoriaLocale(),{timeZone,hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),...(model?.hours!==24?{timeZoneName:'shortOffset'}:{}),hourCycle:'h23'}).format(new Date(ms));}
  function continuation(row){return [row.startMs<row.from?t('接前日','Continued from previous day'):'',row.endMs>row.to?t('续至次日','Continues next day'):''].filter(Boolean).join(' · ');}
  function interval(row,seconds=false){return `${clock(row.from,seconds)}–${row.to===model.endMs?'24:00':clock(row.to,seconds)}`+(continuation(row)?' · '+continuation(row):'');}
  function show(row,pin=false){
    selected=row;if(pin)state.segment=row?.id||null;
    marks.forEach(({el,id})=>el.setAttribute('data-selected',String(id===row?.id)));
    title.hidden=!row;
    if(plannedValue)plannedValue.hidden=!!row||!plannedModel.segments.length;
    value.textContent=row?duration(row.to-row.from,t):(model.segments.length?duration(model.totalMs,t):'—');
    svg.setAttribute('aria-label',`${state.day} · ${row?(row.kind==='schedule'?t('安排','Scheduled'):t('专注','Focus'))+' · '+(row.title||t('自由专注','Free focus')):t('时间环','Time ring')} · ${value.textContent}`);
    if(!row){caption.textContent=compare?t('专注','Focus'):t('已记录专注','Recorded focus');title.textContent='';return;}
    title.textContent=row.title||t('自由专注','Free focus');title.disabled=!row.path||!!context.preview;
    const precise=row.to-row.from<60000;
    caption.textContent=(row.kind==='schedule'?t('安排','Scheduled'):t('专注','Focus'))+(continuation(row)?' · '+continuation(row):'');
    title.title=`${title.textContent} · ${interval(row,precise)} · ${timeZone}`;

  }
  title.onclick=()=>{if(selected?.path&&!context.preview)void plugin.propertyStats.openSource({...selected,focusAnchor:selected.anchor}).catch(error=>new (require('obsidian').Notice)(error.message));};
  function changeDay(day){
    try{M.dayBounds(day,timeZone);}catch(_){date.value=state.day;return;}
    if(range&&(day<range.start||day>range.end)){date.value=state.day;return;}
    state.day=day;state.browsing=day!==today;state.segment=null;paint();
  }
  function paint(){
    model=M.dayModel(result.rows,state.day,timeZone);plannedModel=M.dayModel(compare?result.planned||[]:[],state.day,timeZone);selectionRows=[...model.segments,...plannedModel.segments].sort((a,b)=>a.from-b.from||a.to-b.to||a.id.localeCompare(b.id));if(plannedValue)plannedValue.textContent=t('安排 ','Scheduled ')+(plannedModel.segments.length?duration(plannedModel.totalMs,t):'—');date.value=state.day;date.title=state.day+' · '+timeZone;dateText.textContent=state.day===today?t('今天','Today'):new Intl.DateTimeFormat(plugin.getNoriaLocale(),{timeZone:'UTC',month:'numeric',day:'numeric',...(state.day.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{})}).format(new Date(state.day+'T12:00:00Z'));
    svg.replaceChildren();marks=[];
    value.textContent=model.segments.length?duration(model.totalMs,t):'—';
    caption.textContent=t('已记录专注','Recorded focus');
    caption.title=t('空白时段不代表空闲；重叠专注只计一次','Unrecorded time is not free time; overlapping focus counts once');
    svg.setAttribute('aria-label',`${state.day} · ${t('时间环','Time ring')} · ${value.textContent}`);
    const tracks=Math.max(1,model.lanes),base=compare?96:120,step=Math.min(16,(compare?36:58)/tracks),stroke=Math.max(.6,Math.min(10,step-1));
    for(let lane=0;lane<tracks;lane++)draw('circle',{cx:160,cy:160,r:base-lane*step,fill:'none',stroke:'var(--background-modifier-border)','stroke-width':stroke});
    for(const instant of timelineClock.ticks(model.startMs,model.endMs-1,3600000)){
      const hour=timelineClock.wall(instant).slice(11,13),a=(instant-model.startMs)/(model.endMs-model.startMs)*Math.PI*2,major=Number(hour)%6===0;
      draw('line',{x1:160+133*Math.sin(a),y1:160-133*Math.cos(a),x2:160+(major?138:136)*Math.sin(a),y2:160-(major?138:136)*Math.cos(a),stroke:'var(--text-faint)','stroke-width':1});
      if(major){const label=draw('text',{x:160+150*Math.sin(a),y:160-150*Math.cos(a),'text-anchor':'middle','dominant-baseline':'central',fill:'var(--text-muted)','font-size':11});label.textContent=hour;}
    }
    if(compare){
      const lanes=Math.max(1,plannedModel.lanes),spacing=Math.min(8,22/lanes);
      for(let lane=0;lane<lanes;lane++)draw('circle',{cx:160,cy:160,r:126-lane*spacing,fill:'none',stroke:'var(--background-modifier-border)','stroke-width':1});
    }
    for(const row of selectionRows){
      const color=accent(config.appearance)||row.category?.color||'var(--interactive-accent)';
      const scheduled=row.kind==='schedule',radius=scheduled?126-row.lane*Math.min(8,22/Math.max(1,plannedModel.lanes)):base-row.lane*step,d=M.arcPath(radius,row.startFraction,row.endFraction),lineWidth=scheduled?Math.max(.6,Math.min(3,22/Math.max(1,plannedModel.lanes)-1)):stroke;
      const el=draw('path',{d,fill:'none',stroke:color,'stroke-width':lineWidth,'stroke-linecap':'butt',...(scheduled?{'stroke-dasharray':'3 3'}:{}),class:'noria-time-ring-arc','data-kind':scheduled?'schedule':'focus'});
      if(row.endFraction-row.startFraction<.001){const a=row.startFraction*2*Math.PI;draw('circle',{cx:160+radius*Math.sin(a),cy:160-radius*Math.cos(a),r:2.5,fill:color,'pointer-events':'none'});}
      const laneSpace=scheduled?Math.min(8,22/Math.max(1,plannedModel.lanes)):step;
      const hit=draw('path',{d,fill:'none',stroke:'transparent','stroke-width':Math.max(1,Math.min(laneSpace-1,lineWidth+6)),'stroke-linecap':'round',class:'noria-time-ring-hit'});
      const description=doc.createElementNS(svg.namespaceURI,'title');description.textContent=`${scheduled?t('安排 · ','Scheduled · '):t('专注 · ','Focus · ')}${row.title||t('自由专注','Free focus')} · ${interval(row,true)} · ${timeZone}`;hit.append(description);
      hit.onpointerenter=()=>show(row);hit.onclick=()=>{show(state.segment===row.id?null:row,true);svg.focus({preventScroll:true});};marks.push({el,id:row.id});
    }
    show(selectionRows.find(r=>r.id===state.segment));
    const notices=[];
    if(model.recordedMs>model.totalMs)notices.push(t('重叠时段已去重','Overlapping time counted once'));
    if(result.scheduleErrors?.length)notices.push(t('部分安排格式需要检查，可查看时段与来源','Some schedules need checking; see intervals and sources'));
    if(model.hours!==24)notices.push(t('此日实际长度','Actual day length')+` ${model.hours}h`);
    if(result.unreadable?.length)notices.push(t('部分原始记录无法读取，请检查来源','Some source records could not be read'));
    if(result.omitted)notices.push(t('旧记录缺少分段，未推算时段','Legacy records without segments are not inferred'));
    note.title=notices.join(' · ');note.setAttribute('aria-label',note.title);note.hidden=!notices.length;note.onclick=()=>new (require('obsidian').Notice)(note.title);
  }
  stage.onpointerleave=()=>show(selectionRows.find(r=>r.id===state.segment));
  svg.onclick=event=>{if(!event.target.closest('.noria-time-ring-hit'))show(null,true);};
  stage.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!selected&&!state.segment)return;
    event.preventDefault();event.stopPropagation();show(null,true);svg.focus({preventScroll:true});
  });
  svg.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key)||!selectionRows.length)return;
    event.preventDefault();
    if(event.key==='Enter'||event.key===' '){title.click();return;}
    let i=selectionRows.findIndex(row=>row.id===selected?.id);i=event.key==='Home'?0:event.key==='End'?selectionRows.length-1:Math.max(0,Math.min(selectionRows.length-1,i+(event.key==='ArrowRight'?1:-1)));
    show(selectionRows[i],true);
  };
  const body=shell?.querySelector('.noria-custom-card-body,.noria-diary-card-body');
  const fit=()=>{
    let size=context.ringTools?host.clientWidth:Math.min(host.clientWidth,460);
    if(context.ringTools)size=Math.min(size,host.parentElement.clientHeight);
    if(!context.ringTools&&body&&parseFloat(getComputedStyle(shell).getPropertyValue('--noria-card-height'))>0){
      const otherHeight=host.offsetHeight-stage.offsetHeight;
      size=Math.min(size,Math.max(120,body.clientHeight-otherHeight));
    }
    const nextSize=Math.floor(size)+'px';if(size>0&&stage.style.width!==nextSize)stage.style.width=nextSize;
  };
  const observer=new ResizeObserver(fit);observer.observe(host);if(body)observer.observe(body);if(context.ringTools)observer.observe(host.parentElement);
  const frame=requestAnimationFrame(fit);
  host.__noriaStatChromeCleanup=()=>{observer.disconnect();cancelAnimationFrame(frame);head.remove();if(tools&&!context.ringTools)shell.classList.remove('noria-stat-card');if(shell)shell._noriaRecordActions=(shell._noriaRecordActions||[]).filter(action=>action!==sourceAction);delete host.__noriaRingEditing;delete host.__noriaStatChromeCleanup;};
  paint();
}
module.exports={renderTimeRing,duration};
