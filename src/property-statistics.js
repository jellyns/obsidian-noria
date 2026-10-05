"use strict";
const missing=value=>value===null||value===undefined||value===""||(Array.isArray(value)&&value.every(v=>v==null||v===''));
function categoryValues(value){
  const values=(Array.isArray(value)?value:[value]).filter(v=>v!=null&&v!=='');
  if(values.some(v=>!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))return null;
  return [...new Map(values.map(v=>[String(v),v])).values()];
}
function filterNotes(rows,config){
  const folder=String(config.folder||"").replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
  const tag=String(config.tag||"").replace(/^#/,"");
  return rows.filter(row=>{
    const path=row.path;
    if(folder&&!(config.recursive!==false?path.startsWith(folder+"/"):path.slice(0,path.lastIndexOf("/"))===folder))return false;
    if(tag&&!(row.tags||[]).some(value=>String(value).replace(/^#/,"")===tag||String(value).replace(/^#/,"").startsWith(tag+"/")))return false;
    if(config.filterProperty){const value=row.properties[config.filterProperty];if(config.filterValue===""||config.filterValue==null){if(missing(value))return false;}
      else if(![value].flat().some(item=>String(item)===String(config.filterValue)))return false;}
    return true;
  });
}
function summarize(rows,config={}){
  const numeric=["sum","mean","min","max"].includes(config.calculate),valid=[],invalid=[],groups=new Map();let missingCount=0;
  const units=new Set(config.unitProperty?rows.filter(row=>!missing(row.properties[config.property])).map(row=>row.properties[config.unitProperty]):[]);
  for(const row of rows){const value=config.property?row.properties[config.property]:1;
    if(missing(value)){missingCount++;continue;}
    const categories=config.calculate==='distribution'?categoryValues(value):null;
    if(config.calculate==='distribution'&&!categories){invalid.push({...row,reason:'unsupported-category'});continue;}
    if(numeric&&config.unitProperty&&(units.size>1||missing(row.properties[config.unitProperty]))){invalid.push({...row,error:"Incompatible or missing unit"});continue;}
    if(numeric&&(typeof value!=="number"||!Number.isFinite(value))){invalid.push({...row,reason:'non-numeric'});continue;}
    valid.push({...row,value});
    const keys=config.group==="folder"?[row.path.slice(0,row.path.lastIndexOf("/"))||"/"]:config.group==="tag"?[...new Set((row.tags||[]).map(tag=>String(tag).replace(/^#/,'')))]:
      config.display==="trend"?[row.date]:config.calculate==="distribution"?categories:[];
    for(const key of keys){if(missing(key))continue;if(typeof key==="object"){invalid.push(row);continue;}const label=String(key);if(!groups.has(label))groups.set(label,[]);groups.get(label).push({...row,value});}
  }
  const calculate=list=>!list.length?null:config.calculate==="sum"?list.reduce((a,b)=>a+b.value,0):config.calculate==="mean"?list.reduce((a,b)=>a+b.value,0)/list.length:
    config.calculate==="min"?Math.min(...list.map(r=>r.value)):config.calculate==="max"?Math.max(...list.map(r=>r.value)):list.length;
  return {matched:rows.length,recorded:valid.length,missing:missingCount,invalid,rows:valid,value:calculate(valid),unit:units.size===1?[...units][0]:"",
    groups:[...groups].map(([key,items])=>({key,value:calculate(items),rows:items})).sort((a,b)=>a.key.localeCompare(b.key))};
}
// A shared calendar axis includes missing days. Gaps never become zero or a joined trend.
function alignDailyRecords(results,range){
  const start=Date.parse(range.start+"T00:00:00Z"),end=Date.parse(range.end+"T00:00:00Z");
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error("Invalid date range");
  const dates=Array.from({length:Math.floor((end-start)/86400000)+1},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
  return {dates,series:results.map(result=>{const byDate=new Map();for(const row of result.rows){if(!byDate.has(row.date))byDate.set(row.date,[]);byDate.get(row.date).push(row);}
    return dates.map(date=>{const rows=byDate.get(date)||[],values=rows.length===1?categoryValues(rows[0].value):null;
      return {date,rows,value:values?.length===1?values[0]:null,ambiguous:rows.length>1,multiple:!!(values&&values.length>1)};});})};
}
// Field values and source notes are different counts when several fields share a diary.
function dailySources(results,fields=[]){
  const notes=new Map(),invalid=[],unreadable=new Map();
  results.forEach((result,index)=>{
    for(const row of result.rows)if(!notes.has(row.path))notes.set(row.path,row);
    for(const row of result.invalid||[])invalid.push({...row,fieldName:fields[index]?.name||fields[index]?.property||''});
    for(const row of result.unreadable||[]){
      if(!unreadable.has(row.path))unreadable.set(row.path,{...row,errors:[]});
      const errors=unreadable.get(row.path).errors;if(row.error&&!errors.includes(row.error))errors.push(row.error);
    }
  });
  const rows=[...notes.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.path.localeCompare(b.path));
  return {rows,sourceNotes:rows.length,recorded:results.reduce((sum,r)=>sum+r.recorded,0),missing:results.reduce((sum,r)=>sum+(r.missing||0),0),invalid,unreadable:[...unreadable.values()].map(row=>({...row,error:row.errors.join(' · ')}))};
}
function statisticUnit(config,result,field){
  if(config.calculate==='rate')return '%';
  if(!['sum','mean','min','max'].includes(config.calculate)||['tasks','habits'].includes(config.source))return '';
  return config.unitProperty?(result.unit||''):(field?.unit||result.unit||'');
}
function formatStatRange(range,locale){
  if(!range)return '';
  const format=new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric'});
  return format.formatRange(new Date(range.start+'T12:00:00'),new Date(range.end+'T12:00:00'));
}
module.exports={missing,categoryValues,filterNotes,summarize,alignDailyRecords,dailySources,statisticUnit,formatStatRange};
