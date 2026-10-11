"use strict";
const {scanMarkdownLines}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const {createTimelineMatcher}=require("./runtime/views/task-timeline/event-model.js");
const {readTaskScheduling}=require("./task-document.js");
function normalizeFilter(value={}) {
  value=value||{};
  return {tasks:value.tasks!==false,records:value.records!==false,showDone:value.showDone!==false,ctime:value.ctime===true,mtime:value.mtime===true,query:String(value.query||"").slice(0,500)};
}
function dateKey(ms){const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function taskRequest(task){return {...task,path:task.path||task.source?.path,line:task.line??task.source?.line,text:typeof task.text==="string"?task.text:task.text?.raw||task.source?.rawLine||task.title||"",rawText:task.rawText||task.source?.rawLine||task.rawLine};}
function taskTimeLabel(item,locale='zh-CN',contextDate=item.date){
  const meta=item.displayRange||item.payload?.noria||{},start=meta.startYmd||item.date,end=meta.endYmd||start;
  if(item.payload?.noria?.fallbackDateSource)return '';
  const startTime=meta.startTime||item.time||'',endTime=meta.endTime||'';
  const date=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
    return new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short',day:'numeric',...(contextDate&&value.slice(0,4)===contextDate.slice(0,4)?{}:{year:'numeric'})}).format(new Date(value+'T12:00:00Z'));
  };
  const first=[start!==contextDate?date(start):'',startTime].filter(Boolean).join(' ');
  let label=first;
  if(end&&end!==start){
    const nextDay=start&&Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z')===86400000;
    const endLabel=nextDay&&start===contextDate&&startTime&&endTime?(locale.startsWith('zh')?'次日':'next day'):date(end);
    label=`${first||date(start)}–${[endLabel,endTime].filter(Boolean).join(' ')}`;
  }else if(endTime&&endTime!==startTime)label=[first,endTime].filter(Boolean).join('–');
  if(item.continuation)label=[locale.startsWith('zh')?'延续':'Ongoing',label].filter(Boolean).join(' · ');
  return label;
}
// Only split genuine top-level Inbox entries. Fences, nested lists and review
// text have their own lexical boundaries and never become invented events.
function splitRecord(item) {
  const body=item.markdown||"",rows=scanMarkdownLines(body,{listContent:true}),parts=[],cuts=[];let inbox=false;
  for(let i=0;i<rows.length;i++){
    const r=rows[i];if(r.eligible&&/^#{1,6}\s/.test(r.text)){inbox=/^##\s+Inbox\s*$/i.test(r.text);continue;}
    if(!inbox||!r.eligible)continue;
    const m=/^[-*+]\s+\[((?:[01]\d|2[0-3]):[0-5]\d)\]\s+/.exec(r.text);if(!m)continue;
    let end=r.end;
    for(let j=i+1;j<rows.length;j++){if(rows[j].text.trim()&&!/^\s/.test(rows[j].text))break;end=rows[j].end;}
    parts.push({...item,id:`${item.id}:${r.line}`,time:m[1],kind:"capture",markdown:body.slice(r.start,end).replace(m[0],"").replace(/^  /gm,"").trim()});cuts.push([r.start,end]);
  }
  let remainder=body;for(const [start,end] of cuts.reverse())remainder=remainder.slice(0,start)+remainder.slice(end);
  const headings=scanMarkdownLines(remainder).filter(r=>r.eligible&&/^#{1,6}\s/.test(r.text));
  for(let i=headings.length-1;i>=0;i--){const r=headings[i],end=headings[i+1]?.start??remainder.length;if(!remainder.slice(r.end,end).trim())remainder=remainder.slice(0,r.start)+remainder.slice(r.end);}
  remainder=remainder.replace(/^##\s+Inbox\s*$(?=\s*(?:^#|$))/gim,"").trim();
  if(remainder)parts.push({...item,markdown:remainder});return parts;
}
function buildStream(model,activities,window,filter,clock) {
  const day=clock?clock.day:dateKey;
  const f=normalizeFilter(filter),startDate=window.startDate||day(window.startMs),endDate=window.endDate||day(window.endMs-1),items=[],unscheduled=[],seen=new Set(),seenEvents=new Set();
  const matches=createTimelineMatcher({text:f.query});
  if(f.tasks){
    for(const e of model.events||[]){
      const raw=e.payload?.task;if(!raw||!f.showDone&&raw.completed)continue;const task=taskRequest(raw);
      const item={...e,kind:"task",task,path:e.source?.path,time:e.payload?.noria?.startTime||"",date:e.payload?.noria?.startYmd||dateKey(Date.parse(e.start))};
      const meta=e.payload?.noria;
      if(clock&&item.time){
        const start=clock.wall(Date.parse(e.start));item.date=start.slice(0,10);item.time=start.slice(11);
        if(e.end){const end=clock.wall(Date.parse(e.end));item.displayRange={startYmd:item.date,startTime:item.time,endYmd:end.slice(0,10),endTime:meta?.endTime?end.slice(11):''};}
      }
      const key=`${item.path}:${e.source?.line}`,eventKey=`${key}:${e.payload?.noria?.scheduleIndex??e.kind??"task"}`;
      if(seenEvents.has(eventKey)||!matches(e))continue;seenEvents.add(eventKey);
      if(e.payload?.noria?.fallbackDateSource){if(!seen.has(key))unscheduled.push(item);seen.add(key);continue;}
      if(e.kind==="due"&&!seen.has(key)&&!raw.completed&&e.status!=="cancelled"){
        const timing=readTaskScheduling(task);
        if(!timing.start&&!timing.schedules.some(s=>!s.error))unscheduled.push(item);
      }
      seen.add(key);
      const a=Date.parse(e.start),b=e.end?Date.parse(e.end):a;
      const included=item.time? a<window.endMs&&(b>a?b>window.startMs:a>=window.startMs):item.date<=endDate&&(e.payload?.noria?.endYmd||item.date)>=startDate;
      if(included){
        if(item.date<startDate){item.date=startDate;item.time="";item.continuation=true;}
        else if(item.time&&a<window.startMs){item.time="";item.continuation=true;}
        items.push(item);
      }
    }
    for(const e of model.unplaced||[]){const task=taskRequest(e.task),key=`${task.path}:${task.line}`;if(seen.has(key)||!f.showDone&&task.completed)continue;const item={...e,task,kind:"task",path:task.path};if(matches(e)){seen.add(key);unscheduled.push(item);}}
  }
  for(const e of activities||[]){
    if(e.kind==="record"&&!f.records||e.kind==="note-created"&&!f.ctime||e.kind==="note-modified"&&!f.mtime)continue;
    for(const item of e.kind==="record"?splitRecord(e):[e]){
      const source={type:["note-created","note-modified"].includes(item.kind)?"filesystem":"markdown",path:item.path};
      if(!matches({...item,source},item.markdown)||item.date<startDate||item.date>endDate)continue;
      // Diary entries belong to their note's date. Their plain HH:mm is not an instant.
      if(item.time&&clock){const civil=`${item.date} ${item.time}`;if(civil<clock.wall(window.startMs)||civil>=clock.wall(window.endMs))continue;}
      else {const ms=item.time?+new Date(`${item.date}T${item.time}:00`):NaN;if(item.time&&(ms<window.startMs||ms>=window.endMs))continue;}
      items.push(item);
    }
  }
  const orderTime=item=>item.continuation?"":item.time||"99:99";
  items.sort((a,b)=>a.date.localeCompare(b.date)||orderTime(a).localeCompare(orderTime(b))||a.id.localeCompare(b.id));
  return {items,unscheduled};
}
module.exports={normalizeFilter,dateKey,splitRecord,buildStream,taskRequest,taskTimeLabel};
