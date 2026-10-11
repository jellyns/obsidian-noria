"use strict";
const T=require('./task-document.js');
const dateKeys=['start','due','scheduled','completion','cancelled','created'];
function validZone(value){if(!value)return '';try{return new Intl.DateTimeFormat('en',{timeZone:String(value)}).resolvedOptions().timeZone;}catch{return '';}}
const formatters=new Map();
function wallAt(instant,zone){
 let format=formatters.get(zone);if(!format){format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,format);}
 const parts=format.formatToParts(new Date(instant)),v=key=>parts.find(p=>p.type===key).value;
 return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
}
function wallInstant(value,zone){
 const plain=String(value).replace('T',' ').replace(/ (\d):/,' 0$1:'),guess=Date.parse(plain.replace(' ','T')+':00Z');
 if(!Number.isFinite(guess))throw Error('Invalid date/time: '+value);
 // Offset samples cover DST changes and non-integer-hour zones. Round-trip validation
 // rejects missing/repeated local times instead of choosing a different instant silently.
 const candidates=new Set();
 for(const delta of [-36,0,36]){const probe=guess+delta*3600000,offset=Date.parse(wallAt(probe,zone).replace(' ','T')+':00Z')-probe;const instant=guess-offset;if(wallAt(instant,zone)===plain)candidates.add(instant);}
 if(candidates.size!==1)throw Error((candidates.size?'时区回拨使此时刻有两个可能，请避开重复时段：':'此时刻在该时区不存在，请调整时间：')+plain+' · '+zone);
 return [...candidates][0];
}
function convertWall(value,from,to){
 if(!value||!/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}$/.test(String(value))||from===to)return value;
 return wallAt(wallInstant(value,from),to);
}
function zoneContext(settings={},device=Intl.DateTimeFormat().resolvedOptions().timeZone){
 const source=validZone(settings.sourceTimeZone),display=validZone(settings.timeZone)||device;
 return source?{source,display}:null;
}
function adapter(context){
 const {source,display}=context;
 const to=value=>convertWall(value,source,display),from=(value,original)=>{
  if(original!=null&&to(original)===value)return original;
  if(/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}$/.test(String(value)))wallInstant(value,display);
  return convertWall(value,display,source);
 };
 const model=raw=>{const p=T.parseTaskLine(raw);for(const key of dateKeys)p[key]=to(p[key]);p.schedules=p.schedules.map(s=>s.error?s:{...s,start:to(s.start),end:to(s.end)});return p;};
 const patch=(change,raw)=>{
  const result={...change},original=T.parseTaskLine(raw);
  for(const key of dateKeys)if(Object.hasOwn(result,key)){const value=result[key];result[key]=typeof value==='function'?v=>from(value(to(v)),v):from(value,original[key]);}
  if(result.schedule){const one=c=>{const old=original.schedules[c.index];return {...c,...(Object.hasOwn(c,'start')?{start:from(c.start,old?.start)}:{}),...(Object.hasOwn(c,'end')?{end:from(c.end,old?.end)}:{})};};result.schedule=Array.isArray(result.schedule)?result.schedule.map(one):one(result.schedule);}
  return result;
 };
 return {source,display,to,from,model,patch,now:()=>wallAt(Date.now(),display),
  label:date=>{const instant=wallInstant(date+' 12:00',display);return new Intl.DateTimeFormat('en',{timeZone:display,timeZoneName:'shortOffset'}).formatToParts(new Date(instant)).find(p=>p.type==='timeZoneName').value.replace('GMT','UTC');},
  elapsed:(start,end)=>(wallInstant(end,display)-wallInstant(start,display))/60000,
  lineFromDisplay:raw=>{
    const p=T.parseTaskLine(raw),change={};for(const key of dateKeys)if(p[key]&&key!=='scheduled')change[key]=p[key];
    if(p.schedules.length)change.schedule=p.schedules.filter(s=>!s.error).map(s=>({action:'update',index:s.index,start:s.start,end:s.end}));
    return T.patchTaskLine(raw,patch(change,raw));
  },
  parseTaskLine:model,patchTaskDates:(raw,change)=>T.patchTaskDates(raw,patch(change,raw)),patchTaskLine:(raw,change,today)=>T.patchTaskLine(raw,patch(change,raw),today),
  fieldTo:(key,value)=>dateKeys.includes(key)||key==='done'||key==='date'?to(value):value,
  fieldFrom:(key,value)=>dateKeys.includes(key)||key==='done'||key==='date'?from(value):value};
}
// Timeline geometry stays in real instants; only civil input/output uses the selected zones.
function timelineClock(settings={}){
 const device=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const source=validZone(settings.sourceTimeZone)||device,display=validZone(settings.timeZone)||device;
 const wall=instant=>wallAt(instant,display),day=instant=>wall(instant).slice(0,10);
 const dayStart=instant=>wallInstant(day(instant)+' 00:00',display);
 const addDays=(instant,amount)=>{const d=new Date(day(instant)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return wallInstant(d.toISOString().slice(0,10)+' 00:00',display);};
 const iso=meta=>new Date(wallInstant(meta.ymd+' '+(meta.hhmm||'00:00'),meta.hhmm?source:display)).toISOString();
 const write=(instant,dateOnly=false)=>{
  if(instant==null)return '';
  const value=wallAt(+new Date(instant),dateOnly?display:source);
  if(dateOnly)return value.slice(0,10);
  wallInstant(value,source); // Do not encode an ambiguous instant as unqualified Markdown time.
  return value;
 };
 const ticks=(start,end,interval)=>{
  const out=[],DAY=86400000;
  if(interval<DAY){
   const local=wall(start),minutes=Number(local.slice(11,13))*60+Number(local.slice(14,16));
   let cursor=Math.floor(start/60000)*60000-(minutes%(interval/60000))*60000;
   for(let i=0;cursor<=end&&i<2000;i++,cursor+=interval)if(cursor>=start)out.push(cursor);
  }else{
   const cursor=new Date(day(start)+'T00:00:00Z'),monthStep=interval>=365*DAY?12:Math.round(interval/(30*DAY));
   if(interval>=30*DAY){cursor.setUTCDate(1);cursor.setUTCMonth(Math.floor(cursor.getUTCMonth()/monthStep)*monthStep);}
   else {const index=Math.floor(+cursor/DAY),step=interval/DAY;cursor.setUTCDate(cursor.getUTCDate()-((index%step)+step)%step);}
   for(let i=0;i<2000;i++){
    const date=cursor.toISOString().slice(0,10);let instant;
    try{instant=wallInstant(date+' 00:00',display);}catch{instant=null;}
    if(instant>end)break;if(instant!=null&&instant>=start)out.push(instant);
    if(interval>=30*DAY)cursor.setUTCMonth(cursor.getUTCMonth()+monthStep);else cursor.setUTCDate(cursor.getUTCDate()+interval/DAY);
   }
  }
  return out;
 };
 const add=(instant,spec,direction=1)=>{
  const n=spec.amount*direction;if(spec.unit==='hour')return instant+n*3600000;
  const cursor=new Date(wall(instant).replace(' ','T')+':00Z');
  if(spec.unit==='day'||spec.unit==='week')cursor.setUTCDate(cursor.getUTCDate()+n*(spec.unit==='week'?7:1));
  else {const d=cursor.getUTCDate();cursor.setUTCDate(1);cursor.setUTCMonth(cursor.getUTCMonth()+n*(spec.unit==='year'?12:1));const last=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate();cursor.setUTCDate(Math.min(d,last));}
  return wallInstant(cursor.toISOString().slice(0,16).replace('T',' '),display)+(instant%60000);
 };
 const fromDisplay=value=>wallInstant(String(value).replace('T',' '),display);
 return {source,display,wall,day,dayStart,addDays,iso,write,ticks,add,fromDisplay};
}
module.exports={validZone,wallAt,wallInstant,convertWall,zoneContext,adapter,timelineClock};
