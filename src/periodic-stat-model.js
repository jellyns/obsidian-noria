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
   done:Number(row.done||0)}));
}
module.exports={granularity,series};
