"use strict";
const {scanAtxHeadings,scanMarkdownLines}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const pad=n=>String(n).padStart(2,'0');
const dayOf=value=>{const d=new Date(value);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
function stamp(value,day){
  const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('Invalid focus time');
  const time=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return (dayOf(value)===day?'':dayOf(value)+' ')+time;
}
function parseStamp(value,day){
  const match=/^(?:(\d{4}-\d{2}-\d{2}) )?(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/.exec(value.trim());
  if(!match||+match[2]>23||+match[3]>59||+(match[4]||0)>59)throw Error('Invalid focus time');
  const date=match[1]||day,iso=`${date}T${match[2]}:${match[3]}:${match[4]||'00'}${match[5]||''}`;
  const parsed=new Date(iso);if(!Number.isFinite(parsed.getTime())||dayOf(parsed)!==date)throw Error('Invalid focus date');return parsed.toISOString();
}
function anchor(session){return 'focus-'+new Date(session.start).toISOString().replace(/\D/g,'');}
const encode=value=>String(value||'').replace(/&/g,'&amp;').replace(/\|/g,'&#124;').replace(/\[/g,'&#91;').replace(/\]/g,'&#93;').replace(/[\r\n]+/g,' ');
const decode=value=>String(value).replace(/&#124;/g,'|').replace(/&#91;/g,'[').replace(/&#93;/g,']').replace(/&amp;/g,'&');
function focusLine(record,session,day){
  // Markdown is a second-resolution record. Subsecond fragments that collapse
  // to the same second must not produce an invalid zero-length interval.
  const spans=(session.segments||[]).filter(span=>Math.floor(Date.parse(span.end)/1000)>Math.floor(Date.parse(span.start)/1000));
  if(!spans.length)return '';
  const times=spans.map(span=>`${stamp(span.start,day)}–${stamp(span.end,day)}`).join(' / ');
  const title=encode(record.titleSnapshot||'自由专注'),source=record.path?`[[${encode(record.path.replace(/\.md$/,''))}|${title}]]`:title;
  const mode=session.mode==='BREAK'?'休息':session.timerMode==='stopwatch'?'自由':session.completed?'番茄完成':'专注';
  return `- ${times} · ${source} · ${mode} ^${anchor(session)}`;
}
function parseFocusLine(line,day){
  const match=/^- (.+?) · (.+) · (自由|专注|番茄完成|休息) \^(focus-[\w-]+)\s*$/.exec(line);
  if(!match)return null;
  const segments=match[1].split(' / ').map(pair=>{const [a,b,...extra]=pair.split('–');if(!a||!b||extra.length)throw Error('Invalid focus span');const start=parseStamp(a,day),end=parseStamp(b,day);if(Date.parse(end)<=Date.parse(start))throw Error('Focus end must follow start');return {start,end};});
  for(let i=1;i<segments.length;i++)if(Date.parse(segments[i].start)<Date.parse(segments[i-1].end))throw Error('Focus spans overlap');
  const link=/^\[\[([^|]+)\|(.+)\]\]$/.exec(match[2]);
  const durationMs=segments.reduce((sum,span)=>sum+Date.parse(span.end)-Date.parse(span.start),0);
  return {id:match[4],title:decode(link?link[2]:match[2]),sourcePath:link?decode(link[1])+(/\.md$/.test(link[1])?'':'.md'):'',
    mode:match[3]==='休息'?'BREAK':'WORK',timerMode:match[3]==='自由'?'stopwatch':'pomodoro',completed:match[3]==='番茄完成',outcome:match[3]==='番茄完成'?'completed':'stopped',
    start:segments[0].start,end:segments.at(-1).end,durationMs,durationMin:Math.floor(durationMs/60000),segments};
}
function readFocusDocument(raw,day){
  const records=new Map(),errors=new Map();
  for(const line of scanMarkdownLines(raw)){
    if(!line.eligible)continue;
    const id=line.text.match(/\^(focus-[\w-]+)\s*$/)?.[1];if(!id)continue;
    if(records.has(id)||errors.has(id)){records.delete(id);errors.set(id,'Duplicate focus anchor');continue;}
    try{const record=parseFocusLine(line.text,day);if(!record)throw Error('Invalid focus record');records.set(id,{...record,line:line.line});}
    catch(error){errors.set(id,error.message);}
  }
  return {records,errors};
}
function appendFocusRecord(raw,{record,session,day,heading='专注'}){
  if(!heading.trim()||/[\r\n]/.test(heading))throw Error('Invalid focus heading');
  const id=anchor(session),existing=readFocusDocument(raw,day);
  if(existing.errors.has(id))throw Error(existing.errors.get(id));
  // An existing anchor is the user's entry, even if its content has been edited.
  if(existing.records.has(id))return raw;
  const line=focusLine(record,session,day);if(!line)return raw;
  const headings=scanAtxHeadings(raw),matches=headings.filter(h=>h.level===2&&h.title===heading);
  if(matches.length>1)throw Error('Duplicate focus headings');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  if(!matches.length)return raw+(raw&&!raw.endsWith(eol)?eol:'')+eol+`## ${heading}${eol}${eol}${line}${eol}`;
  const section=matches[0],end=headings.find(h=>h.start>section.start&&h.level<=2)?.start??raw.length;
  const before=raw.slice(0,end),after=raw.slice(end);
  return before+(before.endsWith(eol)?'':eol)+line+eol+(after?eol:'')+after;
}
module.exports={dayOf,anchor,focusLine,parseFocusLine,readFocusDocument,appendFocusRecord};
