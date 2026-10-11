"use strict";
const {summarize}=require('./property-statistics.js');
const {mediaTypes}=require('./media-catalog.js');

function mediaDistribution(items,{dimension='tag',tagPrefix='',kind=''}={}){
 const prefix=String(tagPrefix).trim().replace(/^#/,'').replace(/\/$/,''),missing=[],invalid=[],rows=[];
 const unique=[...new Map(items.filter(item=>!kind||item.kinds.includes(kind)).map(item=>[item.path,item])).values()];
 for(const item of unique){
   const raw=dimension==='tag'?item.tags:item.properties.genre;
   const values=(Array.isArray(raw)?raw:[raw]).filter(value=>value!=null&&value!=='');
   if(values.some(value=>typeof value!=='string')){invalid.push(item);continue;}
   let names=[...new Set(values.map(value=>value.trim()).filter(Boolean))];
   if(dimension==='tag')names=[...new Set(names.map(value=>value.replace(/^#/,'')))].filter(tag=>!mediaTypes({tags:[tag]}).types.length&&(!prefix||tag===prefix||tag.startsWith(prefix+'/')));
   if(!names.length){missing.push(item);continue;}
   rows.push({...item,properties:{...item.properties,distribution:names}});
 }
 const result=summarize(rows,{property:'distribution',calculate:'distribution'});
 result.groups.sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key));
 return {result,total:unique.length,missing,invalid};
}
module.exports={mediaDistribution};
