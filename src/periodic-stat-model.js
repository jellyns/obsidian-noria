"use strict";
const {dayNumber}=require('./countdown-document.js');
function granularity(config,range){
 if(['day','week','month'].includes(config.granularity))return config.granularity;
 const days=dayNumber(range.end)-dayNumber(range.start)+1;
 return days<=45?'day':days<=180?'week':'month';
}
function series(snapshot,metric){
 const domain=snapshot.domains||{};
 const rows=metric==='notes'?domain.notes?.trend?.series||[]:domain.tasks?.completion?.series||[];
 return rows.map(row=>({key:row.key,start:row.start||row.key,
   bar:metric==='notes'?Number(row.words||0):Number(row.planned||0),
   line:metric==='notes'?Number(row.notes||0):row.planned>0?Number(row.done||0)/row.planned*100:null,
   done:Number(row.done||0),source:row}));
}
function periodRange(model,index,range){
 const row=model[index];if(!row)return null;
 const next=model[index+1]?.start;
 const end=next?new Date(Date.parse(next+'T12:00:00Z')-86400000).toISOString().slice(0,10):range.end;
 return {start:row.start<range.start?range.start:row.start,end:end>range.end?range.end:end};
}
module.exports={granularity,series,periodRange};
