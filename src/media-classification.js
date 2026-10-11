"use strict";
const {mediaTypes}=require('./media-catalog.js');
const fail=message=>Object.assign(Error(message),{code:'invalid-input'});
const identity=value=>mediaTypes({tags:[value]}).types.length>0;
function storedTags(raw){
 if(raw==null)return [];
 const values=typeof raw==='string'?raw.split(/[\s,]+/).filter(Boolean):raw;
 if(!Array.isArray(values)||values.some(v=>typeof v!=='string'))throw fail('标签格式异常，请先在原笔记修正。 / Repair the tags format in the source note first.');
 return values;
}
function classificationPatch(patch,current){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!['genre','tags'].includes(k)))throw fail('请选择类型或标签。 / Choose genres or tags.');
 const result={};
 for(const [key,raw] of Object.entries(patch)){
  if(!Array.isArray(raw)||raw.some(v=>typeof v!=='string'||!v.trim()||/[\r\n]/.test(v)))throw fail('分类须为文本列表。 / Categories must be a text list.');
  let values=[...new Set(raw.map(v=>v.trim()))];
  if(key==='tags'){
   values=[...new Set(values.map(v=>v.replace(/^#/,'')))];
   if(values.some(v=>!/^([\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_-]+$/u.test(v)||/^\d+$/.test(v)))throw fail('标签使用文字、数字、下划线、短横线或分层斜线，不能包含空格。 / Use tag names without spaces.');
   if(values.some(identity))throw fail('作品种类标签由原笔记保留，请只填写分类标签。 / Media identity tags are retained; enter only category tags.');
   values=[...storedTags(current.tags).filter(identity),...values];
  }
  result[key]=values.length?values:null;
 }
 return result;
}
module.exports={classificationPatch,storedTags,identity};
