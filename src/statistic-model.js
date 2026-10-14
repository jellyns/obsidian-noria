"use strict";
const {summarize,categoryValues}=require("./property-statistics.js");
const {dayNumber}=require("./countdown-document.js");
const temporal=new Set(["trend","line","columns","calendar","strip"]);
const shift=(date,n)=>new Date((dayNumber(date)+n)*86400000).toISOString().slice(0,10);
function datesIn(range){
 const length=dayNumber(range?.end)-dayNumber(range?.start)+1;
 if(!Number.isFinite(length)||length<1||length>3660)throw Error("Choose a range of up to ten years");
 return Array.from({length},(_,i)=>shift(range.start,i));
}
function priorRange(range,today){
 if(!range||range.start>today)throw Error("Choose a period that has started");
 const end=range.end>today?today:range.end,length=dayNumber(end)-dayNumber(range.start)+1;
 return {current:{start:range.start,end},previous:{start:shift(range.start,-length),end:shift(range.start,-1)},partial:end!==range.end};
}
function chartOptions(config,field){
 if(config.source==='goals')return ['progress-rings'];
 if(config.source==='focus')return ['time-ring'];
 const category=field?['option','toggle'].includes(field.type):config.calculate==='distribution';
 const grouped=!!config.group||config.calculate==='distribution',rate=config.calculate==='rate';
 if(rate)return ['metric','progress','comparison'];
 if(category&&!config.group)return ['metric','strip','calendar','bars','donut','composition'];
 if(grouped)return ['metric','bars','donut',...(['count','sum','distribution'].includes(config.calculate)?['composition']:[])];
 return ['metric','line','columns','trend','calendar','strip','progress','comparison'];
}
function dateGroups(result,config){
 return summarize(result.rows,{...config,group:'',display:'trend',calculate:config.calculate==='distribution'?'count':config.calculate}).groups;
}
function calendarPoints(result,config){
 const range=result.range||{start:result.rows.map(r=>r.date).filter(Boolean).sort()[0],end:result.rows.map(r=>r.date).filter(Boolean).sort().at(-1)};
 if(!range.start||!range.end)return [];
 const category=config.calculate==='distribution',groups=new Map(dateGroups(result,config).map(g=>[g.key,g]));
 return datesIn(range).map(date=>{const group=groups.get(date),rows=group?.rows||[],values=category&&rows.length===1?categoryValues(rows[0].value):null;
   return {date,rows,value:category?(values?.length===1?values[0]:null):group?.value??null,ambiguous:category&&rows.length>1,multiple:!!(values&&values.length>1)};});
}
function exclusiveGroups(result){
 if(!result.groups.length||result.groups.some(g=>!Number.isFinite(g.value)||g.value<0))return false;
 const seen=new Set();let memberships=0;
 for(const g of result.groups)for(const row of g.rows){const id=row.id??row.path;if(seen.has(id))return false;seen.add(id);memberships++;}
 return memberships===result.rows.length&&Math.abs(result.groups.reduce((s,g)=>s+g.value,0)-(result.value||0))<1e-9;
}
function completion(rows){
 const done=rows.filter(r=>r.done).length,total=rows.length;
 return {value:total?done/total*100:null,numerator:done,denominator:total,rows,recorded:total,matched:total,missing:0,invalid:[],groups:[]};
}
function delta(current,previous){return {absolute:current==null||previous==null?null:current-previous,percent:current==null||previous==null||previous===0?null:(current-previous)/Math.abs(previous)*100};}
module.exports={temporal,shift,datesIn,priorRange,chartOptions,calendarPoints,exclusiveGroups,completion,delta};
