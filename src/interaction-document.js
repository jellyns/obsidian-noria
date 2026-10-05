"use strict";
const {createHash}=require('node:crypto');
const {dayNumber}=require('./countdown-document.js');
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const {parse:parseReplies}=require('./suggestion-replies.js');
const fail=(code,message)=>Object.assign(Error(message),{code});
const invalid=message=>{throw fail('invalid-input',message);};
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[\r\n]|<!-- noria:/.test(value);
function markdown(value){
 if(typeof value!=='string'||value.length>12000||value.includes('<!-- noria:'))invalid('Use Markdown up to 12000 characters without reserved Noria markers');
 const result=value.replace(/\r\n?/g,'\n').trim();
 if(scanAtxHeadings(result+'\n\n## noria-boundary\n').at(-1)?.title!=='noria-boundary')invalid('Close Markdown fences and comments');
 return result;
}
function valueFor(field,value){
 if(value==null||(typeof value==='string'&&!value.trim())||(Array.isArray(value)&&!value.length)){if(field.required)invalid(`请填写「${field.label}」`);return undefined;}
 const valid=field.type==='text'?typeof value==='string'&&value.length<=4000&&!value.includes('<!-- noria:'):
  field.type==='number'?typeof value==='number'&&Number.isFinite(value):
  field.type==='date'?typeof value==='string'&&Number.isFinite(dayNumber(value)):
  field.type==='single'?field.options.some(o=>o.id===value):
  Array.isArray(value)&&new Set(value).size===value.length&&value.every(v=>field.options.some(o=>o.id===v));
 if(!valid)invalid(`「${field.label}」的内容与问题类型不符`);
 return field.type==='multi'?field.options.filter(o=>value.includes(o.id)).map(o=>o.id):value;
}
function normalizeDefinition(input){
 if(!input||!text(input.title,120)||!Array.isArray(input.fields)||input.fields.length>12)invalid('Supply a title and up to 12 fields');
 const seen=new Set(),fields=input.fields.map(item=>{
  if(!item||!key(item.id)||seen.has(item.id)||!text(item.label,120)||!['single','multi','text','number','date'].includes(item.type))invalid('Fields need unique stable IDs, labels and supported types');
  seen.add(item.id);const field={id:item.id,label:item.label.trim(),type:item.type,required:!!item.required};
  if(['single','multi'].includes(item.type)){
   const ids=new Set();if(!Array.isArray(item.options)||!item.options.length||item.options.length>20)invalid('Choose between 1 and 20 options');
   field.options=item.options.map(o=>{if(!key(o?.id)||ids.has(o.id)||!text(o.label,160))invalid('Options need unique stable IDs and labels');ids.add(o.id);return {id:o.id,label:o.label.trim()};});
  }
  if(item.default!=null&&item.default!=='')field.default=valueFor({...field,required:false},item.default);
  return field;
 });
 return {title:input.title.trim(),markdown:markdown(input.markdown||''),fields};
}
function answersFor(definition,answers){
 if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).some(k=>!definition.fields.some(f=>f.id===k)))invalid('Answers must use current field IDs');
 const result={};for(const field of definition.fields){const v=valueFor(field,answers[field.id]);if(v!==undefined)result[field.id]=v;}return result;
}
const readable=definition=>`## ${definition.title}\n\n${definition.markdown}${definition.fields.map(f=>`\n\n### ${f.label}${f.required?' *':''}${f.options?'\n'+f.options.map(o=>'- '+o.label).join('\n'):''}`).join('')}`.trim();
const block=entry=>`<!-- noria:interaction-definition ${JSON.stringify(entry)} -->\n${readable(entry.definition)}\n<!-- noria:interaction-end -->\n`;
function parse(raw){
 const record=parseReplies(raw);if(!record||record.meta.kind!=='interaction')throw fail('conflict','This note is not a Noria interaction');
 const text=raw.replace(/\r\n?/g,'\n'),versions=[];
 const pattern=/^<!-- noria:interaction-definition (.+) -->\n([\s\S]*?)^<!-- noria:interaction-end -->$/gm;
 for(const match of text.matchAll(pattern)){
  let entry;try{entry=JSON.parse(match[1]);const normalized=normalizeDefinition(entry.definition);if(!same(normalized,entry.definition)||entry.version!==versions.length+1||readable(normalized)+'\n'!==match[2])throw Error();}catch{throw fail('conflict','交互定义已被手动改动或损坏，请保留原文并修复后再保存');}
  entry.revision='interaction-v1-'+createHash('sha256').update(match[0]).digest('hex');versions.push(entry);
 }
 if(!versions.length||text.split('<!-- noria:interaction-definition ').length!==versions.length+1)throw fail('conflict','Interaction definition is missing or damaged');
 for(const reply of record.replies){const version=versions.find(v=>v.version===reply.definitionVersion);try{if(!version||reply.sourceRevision!==version.revision||reply.date!==record.meta.date||!same(answersFor(version.definition,reply.answers),reply.answers)||reply.markdown!==answerMarkdown(version.definition,reply.answers)||reply.sourceMarkdown!==readable(version.definition))throw Error();}catch{throw fail('conflict','Saved answers no longer match their question snapshot; original content was preserved');}}
 return {...record,versions,current:versions.at(-1)};
}
function answerMarkdown(definition,answers){
 return definition.fields.filter(f=>Object.hasOwn(answers,f.id)).map(f=>{
  const value=answers[f.id],label=id=>f.options.find(o=>o.id===id).label;
  return `${f.label}：${f.type==='multi'?value.map(label).join('、'):f.type==='single'?label(value):value}`;
 }).join('\n\n');
}
module.exports={parse,block,normalizeDefinition,answersFor,answerMarkdown,readable,same,fail};
