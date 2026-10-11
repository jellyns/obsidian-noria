"use strict";
const {readProperty,writeProperty,validateValue}=require('./record-properties.js');
const {scanMarkdownLines,scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
function inspect(raw,field){
  const headings=scanAtxHeadings(raw),key=encodeURIComponent(field.property);
  const found=headings.filter(h=>h.title.includes(`[record:: ${key}]`));
  if(found.length>1)throw Error('此记录有重复明细分节，请先检查日记 / Duplicate record sections');
  if(!found.length)return null;
  const heading=found[0],match=/\[summary:: (sum|latest)\]$/.exec(heading.title);
  if(!match||match[1]==='sum'&&field.type!=='number')throw Error('记录汇总方式无效 / Invalid record summary');
  const end=headings.find(h=>h.start>heading.start&&h.level<=heading.level)?.start??raw.length;
  const lines=scanMarkdownLines(raw).filter(l=>l.start>=heading.end&&l.start<end&&l.eligible&&/^\s*[-+*]\s/.test(l.visible));
  const entries=lines.map(line=>{
    const m=/^- (?:(\d{2}:\d{2}) · )?(.+)$/.exec(line.text);if(!m)throw Error('记录明细格式无效，请检查日记 / Invalid record entry');
    let value;try{value=JSON.parse(m[2]);}catch{throw Error('记录明细值无效，请检查日记 / Invalid record value');}
    validateEntry(field,value,m[1]||'');return {time:m[1]||'',value};
  });
  return {heading,end,lines,entries,aggregation:match[1]};
}
function validateEntry(field,value,time){
  validateValue(field,value);if(value==null)throw Error('填写此次记录的值 / Enter an entry value');
  if(typeof time!=='string'||time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('时间使用 HH:mm / Use HH:mm');
}
function summarize(entries,aggregation){
  if(!entries.length)return null;
  if(aggregation==='sum'){const value=entries.reduce((sum,e)=>sum+e.value,0);if(!Number.isFinite(value))throw Error('合计超出数值范围 / Total is out of range');return value;}
  // Backfilled entries use their stated clock time; equal or absent times retain source order.
  return entries.reduce((latest,e)=>e.time>=latest.time?e:latest).value;
}
function readEntries(raw,field,parse){
  const section=inspect(raw,field),aggregation=section?.aggregation||(field.type==='number'&&field.aggregation!=='latest'?'sum':'latest');
  const multiple=!!section||field.multiple===true;
  const scalar=section?null:readProperty(raw,field,parse);
  const entries=section?.entries||(multiple&&scalar!=null?[{time:'',value:scalar}]:[]);
  return {multiple,aggregation,entries,value:section?summarize(entries,aggregation):scalar};
}
function changeEntry(raw,field,{operation,entry,value,time=''},parse){
  const section=inspect(raw,field),state=readEntries(raw,field,parse);
  if(!state.multiple)throw Error('此项目尚未启用日内多次 / Multiple entries are not enabled');
  if(!['append','edit','delete'].includes(operation))throw Error('请选择新增、修改或删除 / Choose append, edit or delete');
  if(operation!=='append'&&(!Number.isInteger(entry)||entry<0||entry>=state.entries.length))throw Error('这条记录已不存在，请重新打开 / Entry no longer exists');
  if(operation!=='delete')validateEntry(field,value,time);
  const entries=state.entries.map(e=>({...e})),eol=raw.includes('\r\n')?'\r\n':'\n';
  if(operation==='append')entries.push({time,value});else if(operation==='edit')entries[entry]={time,value};else entries.splice(entry,1);
  const line=e=>`- ${e.time?e.time+' · ':''}${JSON.stringify(e.value)}${eol}`;
  if(section){
    if(operation==='append'){const at=section.lines.at(-1)?.end??section.heading.end;raw=raw.slice(0,at)+(at&&!/[\r\n]$/.test(raw.slice(0,at))?eol:'')+line({time,value})+raw.slice(at);}
    else {const target=section.lines[entry];raw=raw.slice(0,target.start)+(operation==='edit'?line({time,value}):'')+raw.slice(target.end);}
  }else{
    const title=String(field.name||field.property).replace(/[\r\n]/g,' ');
    raw+=(raw&&!raw.endsWith(eol)?eol:'')+eol+`## ${title} [record:: ${encodeURIComponent(field.property)}] [summary:: ${state.aggregation}]${eol}`+entries.map(line).join('');
  }
  // Bases reads the daily projection; Noria always derives it from the detail section.
  return writeProperty(raw,field,summarize(entries,state.aggregation),parse);
}
module.exports={readEntries,changeEntry};
