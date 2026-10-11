"use strict";
const {datesIn}=require('./statistic-model.js');
const {dayModel}=require('./time-ring-model.js');
const DEFAULT_ROWS=['focus','tasks','habits','words'];
function selectedRows(config={}){
  return [...new Set(Array.from({length:6},(_,i)=>config['row'+(i+1)]??DEFAULT_ROWS[i]??'none').filter(key=>key!=='none'))];
}
function bucketsFor(range){
  const days=datesIn(range),monthly=days.length>62,buckets=[];
  for(const date of days){const key=monthly?date.slice(0,7):date;
    let bucket=buckets.at(-1);if(bucket?.key!==key){bucket={key,start:date,end:date,dates:[]};buckets.push(bucket);}
    bucket.dates.push(date);bucket.end=date;
  }
  return buckets;
}
function pointFor(metric,bucket,today){
  const days=bucket.dates.filter(date=>date<=today),sources=[];
  if(!days.length||metric.error)return {value:null,sources,future:!days.length};
  if(metric.key==='focus'){
    let ms=0;
    for(const day of days){const model=dayModel(metric.rows||[],day);ms+=model.totalMs;sources.push(...model.segments);}
    return {value:ms/60000,sources};
  }
  const dates=new Set(days),rows=(metric.rows||[]).filter(row=>dates.has(row.date));sources.push(...rows);
  if(metric.key==='habits'){
    const done=rows.filter(row=>row.done).length;
    return {value:rows.length?done/rows.length*100:null,done,total:rows.length,sources};
  }
  if(metric.categorical){
    const counts=new Map(),valid=[];
    for(const row of rows){const values=[...new Set([row.value].flat().filter(v=>v!=null&&v!==''&&['string','number','boolean'].includes(typeof v)).map(String))];
      if(values.length)valid.push(row);
      for(const key of values)counts.set(key,(counts.get(key)||0)+1);
    }
    const order=(metric.categories||[]).map(c=>String(c.key));
    const categories=[...counts].sort((a,b)=>{const x=order.indexOf(a[0]),y=order.indexOf(b[0]);return (x<0?Infinity:x)-(y<0?Infinity:y)||a[0].localeCompare(b[0]);}).map(([key,count])=>({key,count}));
    return {value:valid.length||null,categories,sources:valid};
  }
  if(metric.key.startsWith('record:')){
    const values=rows.filter(row=>row.value!=null&&row.value!=='').map(row=>Number(row.value)).filter(Number.isFinite);
    return {value:values.length?values.reduce((sum,n)=>sum+n,0)/values.length:null,sources,count:values.length};
  }
  return {value:metric.key==='words'?(rows.length?rows.reduce((sum,row)=>sum+Number(row.value||0),0):null):rows.length,sources};
}
function overviewModel(metrics,range,today){
  const buckets=bucketsFor(range),whole={dates:datesIn(range)};
  return {range,buckets,daily:range.start===range.end,rows:metrics.map(metric=>{
    const points=buckets.map(bucket=>pointFor(metric,bucket,today));
    return {...metric,points,total:pointFor(metric,whole,today),min:Math.min(0,...points.map(p=>p.value??0)),max:Math.max(0,...points.map(p=>p.value??0))};
  })};
}
module.exports={DEFAULT_ROWS,selectedRows,bucketsFor,overviewModel};
