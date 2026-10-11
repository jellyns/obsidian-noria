"use strict";
const {scanMarkdownLines, scanAtxHeadings} = require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");

// Source edits are independent of any calendar range or rendered task row.
const statusMarks = {todo:" ",in_progress:"/",done:"x",cancelled:"-"};
const dateAliases = {start:["start"],due:["due","date"],scheduled:["scheduled"],completion:["completion","done"],cancelled:["cancelled"],repeat:["repeat","recurrence","every"]};
const dateEmojis = {"🛫":"start","📅":"due","📆":"due","🗓":"due","⏳":"scheduled","⌛":"scheduled","✅":"completion","❌":"cancelled","➕":"created"};
const priorityEmojis = {"🔺":"highest","⏫":"high","🔼":"medium","🔽":"low","⏬":"lowest"};

function parseTaskLine(raw) {
  const match = /^([ \t]*[-*+][ \t]+\[([^\]])\][ \t]*)(.*)$/.exec(raw);
  if (!match) throw new Error("not-task");
  const body=match[3], tokens=[], prose=[];
  let cursor=0, plainStart=0;
  const token=(end,key,value)=>{if(cursor>plainStart)prose.push({start:plainStart,end:cursor});tokens.push({start:cursor,end,key,value});cursor=end;plainStart=end;};
  while(cursor<body.length) {
    const rest=body.slice(cursor);
    const literal=/^(`+)[\s\S]*?\1(?!`)|^!?\[\[[\s\S]*?\]\]|^!?\[[^\]]*\]\([^)]*\)/.exec(rest);
    if(literal){cursor+=literal[0].length;continue;}
    const comment=/^(?:%%[\s\S]*?%%|<!--[\s\S]*?-->)/.exec(rest);
    if(comment){token(cursor+comment[0].length,"extra",comment[0]);continue;}
    const field=/^\[([^\[\]:]+?)\s*::\s*/.exec(rest);
    if(field){let depth=1,end=cursor+field[0].length;for(;end<body.length;end++){if(body[end]==="[")depth++;if(body[end]==="]"&&!--depth)break;}
      if(depth===0){token(end+1,field[1].toLowerCase(),body.slice(cursor+field[0].length,end).trim());continue;}}
    const emoji=/^(🛫|📅|📆|🗓|⏳|⌛|✅|❌|➕)\uFE0F?\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/u.exec(rest);
    if(emoji){token(cursor+emoji[0].length,dateEmojis[emoji[1]],emoji[2]);continue;}
    const priority=/^(🔺|⏫|🔼|🔽|⏬)/u.exec(rest);
    if(priority){token(cursor+priority[0].length,"priority",priorityEmojis[priority[0]]);continue;}
    const meta=/^(🔁|🆔|⛔)\s*(.*?)(?=\s*(?:🛫|📅|📆|🗓|⏳|⌛|✅|❌|➕|🔺|⏫|🔼|🔽|⏬|🔁|🆔|⛔|\[|#|\^|%%|<!--)|$)/u.exec(rest);
    if(meta){const length=meta[0].trimEnd().length;token(cursor+length,{"🔁":"repeat","🆔":"id","⛔":"dependson"}[meta[1]],meta[2].trim());continue;}
    const extra=/^(?:#[^\s#]+)|^\^[A-Za-z0-9-]+(?=\s*$)/u.exec(rest);
    if(extra&&(cursor===0||/\s/.test(body[cursor-1]))){token(cursor+extra[0].length,extra[0][0]==="#"?"tag":"extra",extra[0]);continue;}
    cursor++;
  }
  if(cursor>plainStart)prose.push({start:plainStart,end:cursor});
  const title=prose.map(p=>body.slice(p.start,p.end)).join(" ").replace(/\s+/g," ").trim();
  const read=key=>tokens.find(t=>(dateAliases[key]||[key]).includes(t.key))?.value||"";
  const status=Object.keys(statusMarks).find(key=>statusMarks[key].toLowerCase()===match[2].toLowerCase())||match[2];
  const schedules=scheduleTokens(tokens).map((t,index)=>{
    try{return {index,source:t.key,raw:t.value,...(t.key==="scheduled"?validateSchedule(t.value):parseScheduleValue(t.value)),error:""};}
    catch(_){return {index,source:t.key,raw:t.value,start:"",end:"",error:"invalid-schedule"};}
  });
  return {raw,prefix:match[1],mark:match[2],body,tokens,prose,title,status,start:read("start"),due:read("due"),scheduled:read("scheduled"),schedules,created:read("created"),completion:read("completion"),cancelled:read("cancelled"),tags:tokens.filter(t=>t.key==="tag").map(t=>t.value).join(" "),priority:read("priority")||"normal",repeat:read("repeat"),id:read("id"),dependsOn:read("dependson")};
}

function taskIdentity(value){return String(value||"").replace(/^[ \t]*[-*+][ \t]*\[[^\]]*\][ \t]*/,"").trim();}
function readTaskScheduling(task){
  const raw=task?.rawLine||task?.source?.rawLine||task?.rawText||task?.text?.raw||(typeof task?.text==="string"?task.text:"");
  const p=parseTaskLine(/^[ \t]*[-*+]\s+\[[^\]]\]/.test(raw)?raw:"- [ ] "+raw);
  return {schedules:p.schedules,start:p.start||(!raw?task?.start||task?.dates?.start||"":""),due:p.due||(!raw?task?.due||task?.dates?.due||"":"")};
}
function readTaskLines(source) {
  return scanMarkdownLines(source,{listContent:true}).filter(row=>row.eligible&&/^[ \t]*[-*+]\s+\[[^\]]\]/.test(row.visible));
}
function locateTask(source, request) {
  const identity=taskIdentity(request.rawText||request.text);
  if(!identity)throw new Error("missing-task-identity");
  const rows=readTaskLines(source);
  const matches=rows.filter(row=>taskIdentity(row.text)===identity);
  if(matches.length!==1)throw new Error(matches.length?"ambiguous-task":"task-not-found");
  if(request.rawText&&/^[ \t]*[-*+]\s+\[[^\]]\]/.test(request.rawText)&&parseTaskLine(request.rawText).mark!==parseTaskLine(matches[0].text).mark)throw new Error("task-changed");
  return matches[0];
}
// Conversion requires an exact eligible source line; repeated paragraphs are ambiguous.
function locateTaskConversion(source,request){
  const rows=scanMarkdownLines(source,{listContent:true}),raw=String(request.rawText??"");
  const matches=rows.filter(row=>row.eligible&&row.text===raw&&(!raw.trim()?row.line===Number(request.line):true));
  if(matches.length!==1)throw Error(matches.length?"ambiguous-task":"task-changed");
  return matches[0];
}
function validateTaskDate(value){
  if(!value)return "";
  const s=String(value).replace("T"," ").trim(),m=/^(\d{4}-\d{2}-\d{2})(?: ([01]\d|2[0-3]):([0-5]\d))?$/.exec(s);
  if(!m||!Number.isFinite(Date.parse(m[1]+"T12:00:00Z"))||new Date(m[1]+"T12:00:00Z").toISOString().slice(0,10)!==m[1])throw new Error("invalid-date");
  return s;
}
const scheduleTokens=tokens=>tokens.filter(t=>t.key==="schedule"||t.key==="scheduled");
function validateSchedule(start,end=""){
  try{
    if(typeof start!=="string"||!start.trim()||typeof end!=="string")throw new Error();
    start=validateTaskDate(start);end=validateTaskDate(end);
    if(end&&((start.length>10)!==(end.length>10)||end<start||(start.length>10&&end===start)))throw new Error();
    return {start,end};
  }catch(_){throw new Error("invalid-schedule");}
}
function parseScheduleValue(value){
  const parts=value.split(/\s*\/\s*/);
  if(parts.length>2||(parts.length===2&&!parts[1]))throw new Error("invalid-schedule");
  return validateSchedule(parts[0],parts[1]||"");
}
function appendTaskToken(parsed,token){
  const tail=/(?:[ \t]+\^[A-Za-z0-9-]+)?[ \t]*$/.exec(parsed.body)[0];
  return parsed.prefix+parsed.body.slice(0,parsed.body.length-tail.length)+" "+token+tail;
}
// An index is scoped to the exact source line, never a persistent task identity.
// editTaskDocument/saveTaskEditor guard that source before writing it back.
function patchTaskSchedule(raw,change){
  if(Array.isArray(change)){
    const indices=new Set();
    for(const item of change){
      if(!item||!["add","update","remove"].includes(item.action))throw new Error("invalid-schedule-action");
      if(item.action!=="add"){
        if(!Number.isInteger(item.index)||indices.has(item.index))throw new Error("invalid-schedule-index");
        indices.add(item.index);
      }
    }
    // All selectors refer to the original line. Higher indices are applied
    // first so removing one row cannot redirect another row's edit.
    const existing=change.filter(c=>c.action!=="add").sort((a,b)=>b.index-a.index);
    return [...existing,...change.filter(c=>c.action==="add")].reduce(patchTaskSchedule,raw);
  }
  const p=parseTaskLine(raw),tokens=scheduleTokens(p.tokens);
  if(!change||!["add","update","remove"].includes(change.action))throw new Error("invalid-schedule-action");
  const {action,index}=change;
  if(action!=="add"&&(!Number.isInteger(index)||index<0||index>=tokens.length))throw new Error("invalid-schedule-index");
  const target=tokens[index];
  if(action==="remove")return p.prefix+p.body.slice(0,target.start)+p.body.slice(target.end);
  const next=validateSchedule(change.start,change.end===undefined?"":change.end);
  if(action==="update"){
    const previous=p.schedules[index];
    if(!previous.error&&previous.start===next.start&&previous.end===next.end)return raw;
  }
  const value=next.start+(next.end?" / "+next.end:"");
  if(action==="add")return appendTaskToken(p,`[schedule:: ${value}]`);
  const token=p.body.slice(target.start,target.end),field=/^(\[[^\]]*?::[ \t]*)([\s\S]*?)([ \t]*\])$/.exec(token);
  // Keep old scheduled syntax for a single date; a range has an explicit field
  // so readers of the traditional scheduled date never mistake it for a date.
  const replacement=target.key==="scheduled"&&next.end?`[schedule:: ${value}]`
    :field?field[1]+value+field[3]
    :token.replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/,value);
  return p.prefix+p.body.slice(0,target.start)+replacement+p.body.slice(target.end);
}
function guardSingleScheduledEdit(raw){
  const tokens=scheduleTokens(parseTaskLine(raw).tokens);
  if(tokens.length>1||tokens.some(t=>t.key==="schedule"))throw new Error("schedule-update-required");
}
function setTaskField(raw,key,value,render=value=>`[${key}:: ${value}]`){
  const p=parseTaskLine(raw),matches=p.tokens.filter(t=>(dateAliases[key]||[key.toLowerCase()]).includes(t.key));
  let body=p.body;
  for(const t of matches.slice().reverse())body=body.slice(0,t.start)+(t===matches[0]&&value?render(value):"")+body.slice(t.end);
  if(!matches.length&&value)return appendTaskToken({...p,body},render(value));
  return p.prefix+body;
}
// Date operations edit only parsed field values, retaining aliases and emoji syntax.
function patchTaskDates(raw, patch) {
  if(Object.hasOwn(patch,"scheduled"))guardSingleScheduledEdit(raw);
  let next=raw;
  for(const key of ["start","due","scheduled","completion","cancelled","created"]){
    if(!Object.hasOwn(patch,key))continue;
    const p=parseTaskLine(next),matches=p.tokens.filter(t=>(dateAliases[key]||[key]).includes(t.key));
    const change=patch[key];let body=p.body;
    for(const t of matches.slice().reverse()){
      const value=validateTaskDate(typeof change==="function"?change(t.value):change);
      const token=body.slice(t.start,t.end),field=/^(\[[^\]]*?::[ \t]*)([\s\S]*?)([ \t]*\])$/.exec(token);
      const updated=!value?"":field?field[1]+value+field[3]:token.replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/,value);
      body=body.slice(0,t.start)+updated+body.slice(t.end);
    }
    next=p.prefix+body;
    if(!matches.length&&typeof change!=="function"&&change)next=setTaskField(next,key,validateTaskDate(change));
  }
  return next;
}
function patchTaskLine(raw,patch,today){
  if(Object.hasOwn(patch,"schedule")&&Object.hasOwn(patch,"scheduled"))throw new Error("conflicting-schedule-patch");
  if(Object.hasOwn(patch,"scheduled"))guardSingleScheduledEdit(raw);
  let next=raw,p=parseTaskLine(raw);
  if(Object.hasOwn(patch,"schedule")){next=patchTaskSchedule(next,patch.schedule);p=parseTaskLine(next);}
  if(Object.hasOwn(patch,"title")&&patch.title!==p.title){
    const title=String(patch.title||"").replace(/[\r\n]+/g," ").trim();if(!title)throw new Error("empty-title");
    const spans=p.prose.map(s=>{const text=p.body.slice(s.start,s.end),trim=text.trim();return trim?{start:s.start+text.indexOf(trim),end:s.start+text.indexOf(trim)+trim.length}:null;}).filter(Boolean);
    let body=p.body;if(!spans.length)body=title+" "+body;
    for(let i=spans.length-1;i>=0;i--)body=body.slice(0,spans[i].start)+(i===0?title:"")+body.slice(spans[i].end);
    next=p.prefix+body;
  }
  for(const key of ["start","due","scheduled","created"])if(Object.hasOwn(patch,key)&&patch[key]!==p[key])next=setTaskField(next,key,validateTaskDate(patch[key]));
  for(const key of ["repeat","id","dependsOn"])if(Object.hasOwn(patch,key)&&patch[key]!==p[key]){
    const value=String(patch[key]||"").trim();if(/[\r\n\[\]]/.test(value))throw new Error("invalid-task-field");
    next=setTaskField(next,key,value);
  }
  if(Object.hasOwn(patch,"tags")&&patch.tags!==p.tags){
    const tags=String(patch.tags||"").trim().split(/\s+/).filter(Boolean).map(t=>t.startsWith("#")?t:"#"+t);
    if(tags.some(t=>!/^#[\p{L}\p{N}_/-]+$/u.test(t)))throw new Error("invalid-task-tags");
    next=setTaskField(next,"tag",[...new Set(tags)].join(" "),value=>value);
  }
  if(Object.hasOwn(patch,"priority")&&patch.priority!==p.priority){
    if(!["normal",...Object.values(priorityEmojis)].includes(patch.priority))throw new Error("invalid-task-priority");
    next=setTaskField(next,"priority",patch.priority==="normal"?"":patch.priority);
  }
  const after=parseTaskLine(next);
  if((Object.hasOwn(patch,"start")||Object.hasOwn(patch,"due"))&&after.start&&after.due&&
    (after.start.slice(0,10)>after.due.slice(0,10)||(after.start.length>10&&after.due.length>10&&after.start>after.due)))throw new Error("end-before-start");
  if(Object.hasOwn(patch,"status")&&patch.status!==p.status){
    if(!Object.hasOwn(statusMarks,patch.status))throw new Error("unsupported-task-status");
    next=next.replace(/^([ \t]*[-*+]\s+)\[[^\]]\]/,`$1[${statusMarks[patch.status]}]`);
    next=setTaskField(next,"completion",patch.status==="done"?validateTaskDate(Object.hasOwn(patch,"completion")?patch.completion:today):"");
    next=setTaskField(next,"cancelled",patch.status==="cancelled"?validateTaskDate(Object.hasOwn(patch,"cancelled")?patch.cancelled:today):"");
  }
  for(const key of ["completion","cancelled"])if(Object.hasOwn(patch,key)&&patch[key]!==parseTaskLine(next)[key])next=setTaskField(next,key,validateTaskDate(patch[key]));
  return next;
}
function editTaskDocument(source,request,patch,today){
  const row=locateTask(source,request),line=patchTaskLine(row.text,patch,today);
  return {text:source.slice(0,row.start)+line+source.slice(row.start+row.text.length),line:row.line,rawText:line,changed:line!==row.text};
}
function appendProjectTask(source,line,heading=""){
  const headings=scanAtxHeadings(source),aliases=/^(?:tasks|next steps?|待办|任务|下一步|当前推进|项目任务)$/i;
  const candidates=headings.filter(h=>heading?h.title===heading:aliases.test(h.title));
  if(candidates.length>1)throw new Error("ambiguous-task-section");
  if(heading&&!candidates.length)throw new Error("task-section-missing");
  const section=candidates[0];
  const end=section?(headings.find(h=>h.start>section.start&&h.level<=section.level)?.start??source.length):source.length;
  const eol=source.includes("\r\n")?"\r\n":"\n",before=source.slice(0,end),after=source.slice(end);
  const prefix=before+(before&&!before.endsWith("\n")?eol:"")+(before&&!/\r?\n\r?\n$/.test(before)?eol:"");
  const text=prefix+line+eol+(after?eol:"")+after;
  return {text,line:prefix.split(/\r?\n/).length-1,rawText:line,changed:true};
}
module.exports={parseTaskLine,readTaskScheduling,readTaskLines,locateTask,locateTaskConversion,patchTaskLine,patchTaskDates,editTaskDocument,appendProjectTask};
