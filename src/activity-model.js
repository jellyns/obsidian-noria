"use strict";
const {diaryRange,shiftDate}=require("./diary-tasks.js");
const {splitDateMarkdown}=require("./diary-document.js");
const {readReviewDocument,reviewPresentation,hasReviewContent}=require("./review-document.js");
const {scanMarkdownLines}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const {getTaskDate,cleanTaskTitle}=require("./runtime/views/dashboard/core/utils/task-display.js");

function validDate(value){
  const date=String(value?.toISODate?.() || value || "").slice(0,10);
  const parsed=new Date(date+"T12:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===date?date:"";
}
function activityBody(raw,heading){
  let body=splitDateMarkdown(raw).body;
  // An ambiguous review boundary must not turn a review into an activity record.
  const review=readReviewDocument(body,[heading]);
  if(review.exists)body=body.slice(0,review.start)+reviewPresentation(review.markdown,heading).leading+body.slice(review.end);
  const rows=scanMarkdownLines(body,{listContent:true}),ranges=[];let taskIndent=null;
  for(const row of rows){
    const match=row.eligible&&/^(\s*)(?:[-+*]|\d+[.)])\s+\[[^\]]\]\s/.exec(row.text);
    if(match){taskIndent=match[1].length;ranges.push(row);}
    else if(taskIndent!==null&&(!row.text.trim() || /^\s*/.exec(row.text)[0].length>taskIndent))ranges.push(row);
    else taskIndent=null;
  }
  for(const row of ranges.reverse())body=body.slice(0,row.start)+body.slice(row.end);
  return hasReviewContent(body)?body.trim():"";
}
function taskActivities(tasks,range,today){
  const result=[],seen=new Set(),within=date=>date&&date>=range.start&&date<=range.end&&date<=today;
  for(const task of tasks||[]){
    const path=task.path||task.from;if(!path||!Number.isInteger(task.line)||/(^|\s)#habit\b/.test(task.text||""))continue;
    const text=task.rawText||task.rawLine||task.text||"";
    const created=validDate(task.created||task.creation||/\[created::\s*([^\]]+)/i.exec(text)?.[1]||/➕\s*(\d{4}-\d{2}-\d{2})/u.exec(text)?.[1]);
    const done=validDate(getTaskDate(task,"done")||/✅\s*(\d{4}-\d{2}-\d{2})/u.exec(text)?.[1]);
    for(const [kind,date] of [["task-created",created],["task-done",task.completed?done:""]]){
      const id=`${path}:${task.line}:${kind}`;if(!within(date)||seen.has(id))continue;seen.add(id);
      result.push({id,kind,date,path,line:task.line,title:cleanTaskTitle(task.text||text),task});
    }
  }
  return result;
}
function fileActivities(files,range,config,localDate,today,clock){
  const result=[],seen=new Set();
  for(const file of files||[])for(const [key,kind] of [["ctime","note-created"],["mtime","note-modified"]]){
    if(!config[key]||!Number.isFinite(file.stat?.[key])||file.stat[key]<=0)continue;
    const stamp=new Date(file.stat[key]),date=clock?clock.day(+stamp):localDate(stamp),id=`${file.path}:${kind}`;
    if(date<range.start||date>range.end||date>today||seen.has(id))continue;seen.add(id);
    result.push({id,kind,date,time:clock?clock.wall(+stamp).slice(11):`${String(stamp.getHours()).padStart(2,"0")}:${String(stamp.getMinutes()).padStart(2,"0")}`,path:file.path,title:file.basename||file.path.split("/").pop()});
  }
  return result;
}
async function createActivityReader(plugin,{selection,range:explicitRange,config={},excludePaths=[],includeDates=[],recordDates,onlyDates,order="desc",signal,clock}={}){
  const range=explicitRange||diaryRange(selection),today=clock?clock.day(Date.now()):plugin.getLocalYmd(),excluded=new Set(excludePaths),byPath=new Map(),events=[];
  const check=()=>{if(signal?.aborted){const error=new Error("Activity request cancelled");error.name="AbortError";throw error;}};
  check();
  let ambiguous=0;
  if(config.records!==false){
    const settings=plugin.getCalendarSettings(),dailyNotesConfig=settings.calendarIntegrationMode==="daily-notes"?await plugin.readDailyNotesPluginConfig():null;
    function* calendarDates(){for(let date=range.start;date<=range.end;date=shiftDate(date,1))yield date;}
    for(const date of recordDates||calendarDates()){
      if(!validDate(date)||date<range.start||date>range.end)continue;
      check();
      const spec=plugin.resolveCalendarNoteSpec("daily",date,{settings,dailyNotesConfig});
      if(excluded.has(spec.path)||!plugin.app.vault.getAbstractFileByPath(spec.path))continue;
      if(byPath.has(spec.path)){byPath.set(spec.path,null);continue;}
      byPath.set(spec.path,{id:`${spec.path}:record`,kind:"record",date,path:spec.path});
    }
    for(const record of byPath.values())if(record)events.push(record);else ambiguous++;
  }
  if(config.tasks!==false)events.push(...taskActivities(await plugin.getRuntimeTaskRows("tasks"),range,today));
  check();
  if(config.ctime||config.mtime){
    const files=plugin.filesUnderRoots(plugin.getScopeSpec("notes").roots,[".md"]);
    events.push(...fileActivities(files,range,config,date=>plugin.getLocalYmd(date),today,clock));
  }
  const allowed=onlyDates?new Set(onlyDates):null;
  const dates=[...new Set([...events.map(e=>e.date),...includeDates.filter(d=>validDate(d)&&d>=range.start&&d<=range.end)])].filter(d=>!allowed||allowed.has(d)).sort();if(order!=="asc")dates.reverse();
  const byDate=new Map(),cache=new Map();for(const event of events){if(!byDate.has(event.date))byDate.set(event.date,[]);byDate.get(event.date).push(event);}
  let cursor=0;
  return {async next(limit=14){
    check();const selected=dates.slice(cursor,cursor+Math.max(1,Math.floor(Number(limit)||14))),groups=[];let pageAmbiguous=0;
    for(const date of selected){
    const items=[];
    for(const event of byDate.get(date)||[]){
      check();
      if(event.kind==="record"){
        if(!cache.has(event.path)){
          const raw=await plugin.loadTextFromVault(event.path);check();
          try{cache.set(event.path,{markdown:activityBody(raw,plugin.getReviewFinalSectionHeading("daily",raw))});}catch(_){cache.set(event.path,{ambiguous:true});}
        }
        const parsed=cache.get(event.path);if(parsed.ambiguous){pageAmbiguous++;continue;}if(!parsed.markdown)continue;
        items.push({...event,markdown:parsed.markdown});continue;
      }
      items.push(event);
    }
    if(items.length)groups.push({date,items:items.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")||a.id.localeCompare(b.id))});
    }
    check();cursor+=selected.length;
    const result={groups,hasMore:cursor<dates.length,through:selected.at(-1)||null,ambiguous:ambiguous+pageAmbiguous,excludedCurrent:excluded.size>0,range};ambiguous=0;return result;
  }};
}
async function loadActivityPage(plugin,options){const reader=await createActivityReader(plugin,options);return reader.next(options.limit??14);}
module.exports={validDate,activityBody,taskActivities,fileActivities,loadActivityPage,createActivityReader};
