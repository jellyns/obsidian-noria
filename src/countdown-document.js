"use strict";
const {scanMarkdownLines}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const aliases={date:["日期","截止","截止日期","date","due","end"],name:["名称","事件","name","title"],type:["类型","type"],start:["开始","开始日期","start"],status:["状态","status"]};
const columns=line=>line.replace(/<!-- noria-countdown:[\w-]+ -->\s*$/,"").trim().replace(/^\|/,"").replace(/\|$/,"").split(/(?<!\\)\|/).map(v=>v.trim().replace(/\\\|/g,"|"));
const cell=value=>String(value??"").replace(/\|/g,"\\|");
function dayNumber(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return NaN;
  const n=Date.parse(date+"T00:00:00Z");return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date?n/86400000:NaN;
}
function shiftDate(date,days){const n=dayNumber(date);if(!Number.isFinite(n))throw Error("Invalid date");return new Date((n+days)*86400000).toISOString().slice(0,10);}
function countdownProgress(start,date,today){
  const a=dayNumber(start),b=dayNumber(date),t=dayNumber(today);
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(t)||a>b)return null;
  if(a===b)return t<a?0:100;
  return Math.max(0,Math.min(100,(t-a)/(b-a)*100));
}
function readCountdowns(text){
  const lines=scanMarkdownLines(text),rows=[],tables=[];
  for(let i=0;i<lines.length-1;i++){
    const head=lines[i];if(!head.eligible||!head.text.trim().startsWith("|"))continue;
    const headers=columns(head.text),index={};for(const [key,names] of Object.entries(aliases))index[key]=headers.findIndex(h=>names.includes(h.toLowerCase()));
    if(index.date<0||index.name<0||!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[i+1].text))continue;
    let end=i+2;while(end<lines.length&&lines[end].eligible&&lines[end].text.trim().startsWith("|"))end++;
    const table={line:i,end,headers,index,text:lines.slice(i,end).map(l=>l.text).join("\n")};tables.push(table);
    for(let j=i+2;j<end;j++){
      const raw=lines[j].text,cells=columns(raw),date=cells[index.date];if(!Number.isFinite(dayNumber(date)))continue;
      const read=key=>index[key]<0?"":cells[index[key]]||"";
      rows.push({id:raw.match(/<!-- noria-countdown:([\w-]+) -->/)?.[1]||"",date,name:read("name"),type:read("type"),start:read("start"),archived:/^(archived|已归档|归档)$/i.test(read("status")),raw,line:j,table,cells});
    }i=end-1;
  }return {rows,tables,lines};
}
function updateCountdown(text,original,patch,{id,zh=true}={}){
  const parsed=readCountdowns(text),eol=text.includes("\r\n")?"\r\n":"\n";
  const name=String(patch.name??original?.name??"").trim(),date=patch.date??original?.date,start=patch.start??original?.start??"";
  if(!name||/[\r\n]/.test(name)||!Number.isFinite(dayNumber(date))||(start&&(!Number.isFinite(dayNumber(start))||start>date)))throw Error("Invalid countdown name or date range");
  let current;
  if(original){
    const matches=parsed.rows.filter(row=>original.id?row.id===original.id:row.raw===original.raw);
    if(matches.length===1)current=matches[0];
    else if(!original.id&&matches.length>1)current=matches.find(row=>row.line===original.line&&row.table.text===original.table.text);
    if(!current||["name","date","start","type","archived"].some(key=>current[key]!==original[key]))throw Error("Countdown changed elsewhere; reload before saving");
  }
  const table=current?.table||parsed.tables[0];
  if(!table){
    const heading=zh?"## 倒计时":"## Countdowns";
    const initial=`| ${zh?"截止 | 名称 | 类型 | 开始 | 状态":"Date | Name | Type | Start | Status"} |${eol}| --- | --- | --- | --- | --- |${eol}`;
    return updateCountdown(text+(text.endsWith(eol+eol)?"":text.endsWith(eol)?eol:eol+eol)+heading+eol+eol+initial,null,patch,{id,zh});
  }
  const headers=[...table.headers],index={...table.index};
  for(const [key,label] of [["start",zh?"开始":"Start"],["status",zh?"状态":"Status"],["type",zh?"类型":"Type"]])if(index[key]<0){index[key]=headers.length;headers.push(label);}
  const lines=text.split(/\r?\n/),newRows=[];
  const format=(cells,rowId)=>`| ${cells.map(cell).join(" | ")} |${rowId?` <!-- noria-countdown:${rowId} -->`:""}`;
  const createCells=base=>{const values=Array.from({length:headers.length},(_,i)=>base?.[i]||"");values[index.name]=name;values[index.date]=date;values[index.start]=start;values[index.type]=String(patch.type??original?.type??"");values[index.status]=(patch.archived??original?.archived)?(zh?"已归档":"Archived"):"";return values;};
  for(let i=table.line+2;i<table.end;i++){
    if(current?.line===i)newRows.push(format(createCells(current.cells),current.id||id));
    else{const raw=lines[i],rowId=raw.match(/<!-- noria-countdown:([\w-]+) -->/)?.[1],values=columns(raw);while(values.length<headers.length)values.push("");newRows.push(headers.length===table.headers.length?raw:format(values,rowId));}
  }
  if(!original)newRows.push(format(createCells(),id));
  lines.splice(table.line,table.end-table.line,format(headers),format(headers.map(()=>"---")),...newRows);
  return lines.join(eol);
}
module.exports={readCountdowns,updateCountdown,dayNumber,shiftDate,countdownProgress};

