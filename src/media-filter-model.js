"use strict";
const {mediaDistribution}=require('./media-distribution-model.js');

// Within a dimension selections are alternatives; different dimensions intersect.
function filterMediaClassification(items,{genre=[],tag=[],unclassified=false}={}){
 let rows=items;
 for(const [dimension,selected] of [['genre',genre],['tag',tag]]){
  if(!selected.length&&!(dimension==='tag'&&unclassified))continue;
  const data=mediaDistribution(rows,{dimension}),paths=new Set();
  for(const group of data.result.groups)if(selected.includes(group.key))for(const row of group.rows)paths.add(row.path);
  if(dimension==='tag'&&unclassified)for(const row of data.missing)paths.add(row.path);
  rows=rows.filter(row=>paths.has(row.path));
 }
 return rows;
}
module.exports={filterMediaClassification};
