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
    const emoji=/^(🛫|📅|📆|🗓|⏳|⌛|✅|❌|➕)\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/u.exec(rest);
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
  return {raw,prefix:match[1],mark:match[2],body,tokens,prose,title,status,start:read("start"),due:read("due"),scheduled:read("scheduled"),created:read("created"),completion:read("completion"),cancelled:read("cancelled"),tags:tokens.filter(t=>t.key==="tag").map(t=>t.value).join(" "),priority:read("priority")||"normal",repeat:read("repeat"),id:read("id"),dependsOn:read("dependson")};
}

function taskIdentity(value){return String(value||"").replace(/^[ \t]*[-*+][ \t]*\[[^\]]*\][ \t]*/,"").trim();}
function locateTask(source, request) {
  const identity=taskIdentity(request.rawText||request.text);
  if(!identity)throw new Error("missing-task-identity");
  const rows=scanMarkdownLines(source,{listContent:true}).filter(row=>row.eligible&&/^[ \t]*[-*+]\s+\[[^\]]\]/.test(row.visible));
  const matches=rows.filter(row=>taskIdentity(row.text)===identity);
  if(matches.length!==1)throw new Error(matches.length?"ambiguous-task":"task-not-found");
  if(request.rawText&&/^[ \t]*[-*+]\s+\[[^\]]\]/.test(request.rawText)&&parseTaskLine(request.rawText).mark!==parseTaskLine(matches[0].text).mark)throw new Error("task-changed");
  return matches[0];
}
function validateTaskDate(value){
  if(!value)return "";
  const s=String(value).replace("T"," ").trim(),m=/^(\d{4}-\d{2}-\d{2})(?: ([01]\d|2[0-3]):([0-5]\d))?$/.exec(s);
  if(!m||!Number.isFinite(Date.parse(m[1]+"T12:00:00Z"))||new Date(m[1]+"T12:00:00Z").toISOString().slice(0,10)!==m[1])throw new Error("invalid-date");
  return s;
}
function setTaskField(raw,key,value,render=value=>`[${key}:: ${value}]`){
  const p=parseTaskLine(raw),matches=p.tokens.filter(t=>(dateAliases[key]||[key.toLowerCase()]).includes(t.key));
  let body=p.body;
  for(const t of matches.slice().reverse())body=body.slice(0,t.start)+(t===matches[0]&&value?render(value):"")+body.slice(t.end);
  if(!matches.length&&value){const tail=/(?:[ \t]+\^[A-Za-z0-9-]+)?[ \t]*$/.exec(body)[0];body=body.slice(0,body.length-tail.length)+" "+render(value)+tail;}
  return p.prefix+body;
}
function patchTaskLine(raw,patch,today){
  let next=raw,p=parseTaskLine(raw);
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
module.exports={parseTaskLine,locateTask,patchTaskLine,editTaskDocument,appendProjectTask};
