"use strict";
const {wallAt,wallInstant,timelineClock}=require('./task-calendar-zone.js');
const {parseTaskLine}=require('./task-document.js');
const {resolveTaskCategory}=require('./task-category.js');

function scheduledSegments(tasks,palette,settings={}){
  const rows=[],invalid=[],seen=new Set();
  const clock=timelineClock(settings);
  for(const task of tasks){
    const raw=task.rawLine||task.source?.rawLine||task.rawText||task.text?.raw||(typeof task.text==='string'?task.text:'');
    const parsed=parseTaskLine(/^[ \t]*[-*+]\s+\[[^\]]\]/.test(raw)?raw:'- [ ] '+raw);
    if(parsed.status==='cancelled')continue;
    const path=task.path||task.source?.path||'',line=task.line??task.source?.line;
    const source={path,title:parsed.title,kind:'schedule',taskRef:{path,line,rawText:raw},category:resolveTaskCategory(task,palette)};
    parsed.schedules.forEach((span,index)=>{
      const id=`schedule:${path}:${line}:${index}`;if(seen.has(id))return;seen.add(id);
      if(span.error){invalid.push({...source,id,fieldName:span.raw});return;}
      // Dates and deadlines do not establish a timed arrangement. Legacy
      // start/due pairs retain their unresolved meaning outside this comparison.
      if(!/[ T]\d{1,2}:\d{2}/.test(span.start)||!/[ T]\d{1,2}:\d{2}/.test(span.end||''))return;
      try{
        const startMs=wallInstant(span.start,clock.source),endMs=wallInstant(span.end,clock.source);
        if(endMs<=startMs)throw Error('Invalid elapsed schedule');
        rows.push({...source,id,startMs,endMs});
      }catch(error){invalid.push({...source,id,fieldName:span.raw,error:error.message});}
    });
  }
  return {rows,invalid};
}

function displayDay(instant,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){return wallAt(+new Date(instant),timeZone).slice(0,10);}
function dayBounds(day,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
  const date=new Date(day+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==day)throw Error('Invalid calendar day');
  date.setUTCDate(date.getUTCDate()+1);
  return {startMs:wallInstant(day+' 00:00',timeZone),endMs:wallInstant(date.toISOString().slice(0,10)+' 00:00',timeZone)};
}
function focusSegments(state,now){
  const rows=[],seen=new Set();
  let omitted=0;
  for(const [key,record]of Object.entries(state.tasks||{}))for(const session of record.sessions||[]){
    if(session.mode==='BREAK')continue;
    if(!session.segments?.length&&session.end&&!session.recordRef)omitted++;
    const spans=[...session.segments||[]];
    const active=state.active;
    if(active?.taskKey===key&&active.mode==='WORK'&&active.status==='running'&&!session.end)spans.push({start:active.startedAt,end:now});
    spans.forEach((span,index)=>{
      const startMs=Date.parse(span.start),endMs=Date.parse(span.end);
      if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return;
      const ref=session.recordRef;
      const id=`${ref?ref.path+'#'+ref.id:key+'#'+session.start}:${index}`;
      if(seen.has(id))return;seen.add(id);
      rows.push({id,startMs,endMs,title:session.title||record.titleSnapshot||'',path:ref?.path||record.path||'',anchor:ref?.id||'',taskKey:key});
    });
  }
  return {rows,omitted};
}
function dayModel(rows,day,timeZone){
  const bounds=dayBounds(day,timeZone),segments=rows.filter(r=>r.endMs>bounds.startMs&&r.startMs<bounds.endMs).map(r=>({...r,from:Math.max(r.startMs,bounds.startMs),to:Math.min(r.endMs,bounds.endMs)})).sort((a,b)=>a.from-b.from||a.to-b.to||a.id.localeCompare(b.id));
  const lanes=[];let totalMs=0,lastEnd=-Infinity;
  for(const row of segments){
    let lane=lanes.findIndex(end=>end<=row.from);if(lane<0)lane=lanes.length;lanes[lane]=row.to;row.lane=lane;
    totalMs+=Math.max(0,row.to-Math.max(lastEnd,row.from));lastEnd=Math.max(lastEnd,row.to);
    row.startFraction=(row.from-bounds.startMs)/(bounds.endMs-bounds.startMs);
    row.endFraction=(row.to-bounds.startMs)/(bounds.endMs-bounds.startMs);
  }
  return {...bounds,day,segments,lanes:lanes.length,totalMs,recordedMs:segments.reduce((n,r)=>n+r.to-r.from,0),hours:(bounds.endMs-bounds.startMs)/3600000};
}
function initialDay(rows,range,today,preferToday=false,timeZone){
  const end=range?.end&&range.end<today?range.end:today;
  const start=range?.start||'0001-01-01';
  if(preferToday)return start>end?start:end;
  const upper=dayBounds(end,timeZone).endMs;
  const candidates=rows.filter(r=>r.startMs<upper&&displayDay(r.endMs-1,timeZone)>=start).map(r=>displayDay(Math.min(r.endMs-1,upper-1),timeZone)).sort();
  return candidates.at(-1)||(range?.start>today?range.start:end);
}
function arcPath(radius,start,end){
  const p=f=>[160+radius*Math.sin(f*Math.PI*2),160-radius*Math.cos(f*Math.PI*2)];
  const a=p(start),b=p(end),point=v=>v.map(n=>n.toFixed(3)).join(' ');
  if(end-start>=.999999){const mid=p(start+.5);return `M ${point(a)} A ${radius} ${radius} 0 1 1 ${point(mid)} A ${radius} ${radius} 0 1 1 ${point(a)}`;}
  return `M ${point(a)} A ${radius} ${radius} 0 ${end-start>.5?1:0} 1 ${point(b)}`;
}
module.exports={displayDay,dayBounds,focusSegments,scheduledSegments,dayModel,initialDay,arcPath};
