// Pure preview transformations. This module never reads or writes a vault.
const {scanMarkdownLines,scanAtxHeadings}=require('../src/runtime/views/dashboard/core/utils/diary-day-blocks.js');
const H=require('../src/runtime/views/dashboard/core/utils/habit-parsing.js');
const {habitRecords}=require('../src/diary-habits.js');
const {normalizeReviewSelection}=require('../src/review-center-core.js');
const builtins=new Set(['focusPanel','habitCheckin','dailyOtherToday','weeklyOtherTasks','monthlyOtherTasks','statusSelector']);
function removeBuiltInViews(raw,registryPath){
  const rows=scanMarkdownLines(raw),removed=[],retained=[];
  for(let i=0;i<rows.length;i++){
    const start=rows[i];if(!start.fenceStart||start.fenceLanguage!=='noria-view')continue;
    const end=rows.slice(i+1).find(row=>row.fenceEnd);
    if(!end){retained.push({line:start.line+1,reason:'unclosed block'});continue;}
    let payload;try{payload=JSON.parse(raw.slice(start.end,end.start));}catch(_){retained.push({line:start.line+1,reason:'invalid JSON'});continue;}
    const props=payload.props||{},view=payload.view;
    const safe=builtins.has(view)&&Object.keys(payload).every(k=>['view','props'].includes(k))&&
      props&&typeof props==='object'&&!Array.isArray(props)&&Object.keys(props).every(k=>k==='sourcePath'&&['focusPanel','habitCheckin'].includes(view)&&props[k]===registryPath);
    if(safe)removed.push({start:start.start,end:end.end,line:start.line+1,view});
    else retained.push({line:start.line+1,view,reason:'custom or unrecognized block'});
  }
  const ranges=removed.slice(),headings=scanAtxHeadings(raw),wrappers=new Set(['待办','今日任务','日态','Tasks','Today\'s tasks','Daily state']);
  for(const heading of headings){
    if(!wrappers.has(heading.title))continue;
    const end=headings.find(h=>h.start>heading.start&&h.level<=heading.level)?.start??raw.length;
    const inside=removed.filter(r=>r.start>=heading.end&&r.end<=end);if(!inside.length)continue;
    let body=raw.slice(heading.end,end);
    for(const range of inside.slice().reverse())body=body.slice(0,range.start-heading.end)+body.slice(range.end-heading.end);
    // Empty, recognized child wrappers are the only non-whitespace content removed.
    body=body.replace(/^ {0,3}#{1,6}\s+(?:待办|今日任务|日态|Tasks|Today's tasks|Daily state)\s*$/gm,'');
    if(!body.trim())ranges.push({start:heading.start,end});
  }
  const merged=[];
  for(const range of ranges.sort((a,b)=>a.start-b.start||b.end-a.end)){
    const last=merged.at(-1);if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});
  }
  let text=raw;for(const range of merged.reverse())text=text.slice(0,range.start)+text.slice(range.end);
  return {text,removed,retained};
}
function appendOriginalRecord(raw,line){
  const headings=scanAtxHeadings(raw),hits=headings.filter(h=>h.level===2&&['习惯记录','Habit records'].includes(h.title));
  if(hits.length>1)throw new Error('ambiguous habit section');
  const eol=/\r\n|\n|\r/.exec(raw)?.[0]||'\n';
  if(hits.length){
    const end=headings.find(h=>h.start>hits[0].start&&h.level<=2)?.start??raw.length;
    return raw.slice(0,end)+(raw.slice(0,end).endsWith(eol)?'':eol)+line+eol+(end<raw.length?eol:'')+raw.slice(end);
  }
  return raw+(raw?raw.endsWith(eol+eol)?'':raw.endsWith(eol)?eol:eol+eol:'')+'## 习惯记录'+eol+eol+line+eol;
}
function planHabitHistory(registry,notes,pathForDate,seedForDate=()=> ''){
  const rows=scanMarkdownLines(registry),groups=new Map(),retained=[],moved=[],after=new Map(notes);
  for(let i=0;i<rows.length;i++){
    const row=rows[i],match=row.eligible&&/^\s*[-*+]\s*\[([ xX])\]\s+(.+)$/.exec(row.text);
    if(!match||!/(^|\s)#habit\b/.test(match[2]))continue;
    const date=H.extractTaskDate(match[2]);if(!date)continue;
    const name=H.canonicalHabitName(match[2]),key=date+'|'+name;
    const item={...row,date,name,done:/[xX]/.test(match[1]),value:H.extractInlineField(match[2],'value'),continuation:/^\s+\S/.test(rows[i+1]?.text||'')};
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
  }
  for(const items of groups.values()){
    const row=items[0],keep=reason=>retained.push({date:row.date,name:row.name,lines:items.map(r=>r.line+1),reason});
    if(items.length>1){keep('duplicate date and habit');continue;}
    try{normalizeReviewSelection({mode:'daily',anchorDate:row.date});}catch(_){keep('invalid date');continue;}
    if(!row.done&&!row.value){keep('pending recurring placeholder');continue;}
    if(row.continuation||/\^[A-Za-z0-9-]+\s*$/.test(row.text)){keep('linked block or continued content');continue;}
    const path=pathForDate(row.date),raw=after.has(path)?after.get(path):seedForDate(row.date);
    if(habitRecords(raw,row.date,path).some(r=>r.name===row.name)){keep('date note already has a record');continue;}
    let text;try{text=appendOriginalRecord(raw,row.text);}catch(_){keep('ambiguous habit section');continue;}
    after.set(path,text);moved.push({...row,path});
  }
  let registryAfter=registry;
  for(const row of moved.slice().sort((a,b)=>b.start-a.start))registryAfter=registryAfter.slice(0,row.start)+registryAfter.slice(row.end);
  return {registryAfter,notes:after,moved:moved.map(r=>({line:r.line+1,date:r.date,name:r.name,path:r.path,raw:r.text})),retained};
}
function plainTemplate(raw){
  const match=/^(\uFEFF?---[^\r\n]*\r?\n)([\s\S]*?)(\r?\n---[^\r\n]*(?:\r?\n|$))/.exec(raw);
  if(!match)throw new Error('Template properties must be reviewed explicitly');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  // These old template literals are sample weather, never observations.
  const properties=match[2].split(/\r?\n/).filter(line=>!/^weather(?:_[\w]+)?:/.test(line)).join(eol);
  return match[1]+properties+match[3]+eol+'## 记录'+eol+eol+'## 计划'+eol;
}
module.exports={removeBuiltInViews,planHabitHistory,plainTemplate};
