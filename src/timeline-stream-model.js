"use strict";
const {scanMarkdownLines}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const {createTimelineMatcher}=require("./runtime/views/task-timeline/event-model.js");
function normalizeFilter(value={}) {
  value=value||{};
  return {tasks:value.tasks!==false,records:value.records!==false,showDone:value.showDone!==false,ctime:value.ctime===true,mtime:value.mtime===true,query:String(value.query||"").slice(0,500)};
}
function dateKey(ms){const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function taskRequest(task){return {...task,path:task.path||task.source?.path,line:task.line??task.source?.line,text:typeof task.text==="string"?task.text:task.text?.raw||task.source?.rawLine||task.title||"",rawText:task.rawText||task.source?.rawLine||task.rawLine};}
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
function buildStream(model,activities,window,filter) {
  const f=normalizeFilter(filter),startDate=dateKey(window.startMs),endDate=dateKey(window.endMs-1),items=[],unscheduled=[],seen=new Set();
  const matches=createTimelineMatcher({text:f.query});
  if(f.tasks){
    for(const e of model.events||[]){
      const raw=e.payload?.task;if(!raw||!f.showDone&&raw.completed)continue;const task=taskRequest(raw);
      const item={...e,kind:"task",task,path:e.source?.path,time:e.payload?.noria?.startTime||"",date:e.payload?.noria?.startYmd||dateKey(Date.parse(e.start))};
      const key=`${item.path}:${e.source?.line}`;if(seen.has(key)||!matches(e))continue;seen.add(key);
      if(e.payload?.noria?.fallbackDateSource){unscheduled.push(item);continue;}
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
      const ms=item.time?+new Date(`${item.date}T${item.time}:00`):NaN;
      if(item.time&&(ms<window.startMs||ms>=window.endMs))continue;
      items.push(item);
    }
  }
  const orderTime=item=>item.continuation?"":item.time||"99:99";
  items.sort((a,b)=>a.date.localeCompare(b.date)||orderTime(a).localeCompare(orderTime(b))||a.id.localeCompare(b.id));
  return {items,unscheduled};
}
module.exports={normalizeFilter,dateKey,splitRecord,buildStream,taskRequest};
