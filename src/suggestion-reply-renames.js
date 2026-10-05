"use strict";
const {conversationFiles,validSource}=require('./suggestion-reply-library.js');
const RENAME_KEY='noria-reply-renames-v1';
function readMoves(app){
 const value=app.loadLocalStorage(RENAME_KEY);if(value==null)return [];
 if(!Array.isArray(value)||value.some(m=>typeof m.id!=='string'||!validSource(m)||!Array.isArray(m.from)||m.from.some(path=>!validSource({path,date:m.date}))))throw Error('Reply rename receipts could not be read');
 return value;
}
function rememberMove(app,id,source,target){
 const all=readMoves(app),prior=all.find(m=>m.id===id),next={id,path:target.path,date:target.date,originPath:target.originPath,from:[...new Set([...(prior?.from||[]),source.path])].filter(p=>p!==target.path)};
 const updated=[...all.filter(m=>m.id!==id),next];app.saveLocalStorage(RENAME_KEY,updated);
 if(JSON.stringify(app.loadLocalStorage(RENAME_KEY))!==JSON.stringify(updated))throw Error('Reply rename receipt could not be saved');
}
function rewriteSource(text,source,target){
 require('./suggestion-replies.js').parse(text,source);
 // Appending leaves Obsidian's cached link offsets intact during renameFile.
 const move={from:source.path,path:target.path,date:source.date};
 return text+(text.endsWith('\n')?'':'\n')+'\n<!-- noria:reply-relocation '+JSON.stringify(move)+' -->\n';
}
async function reconcileMoves(plugin){
 const moves=readMoves(plugin.app);if(!moves.length)return;
 for(const file of conversationFiles(plugin)){
  const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->\r?\n/.exec(raw);if(!head)continue;
  let meta;try{meta=require('./suggestion-replies.js').parse(raw).meta;}catch{continue;}
  const move=moves.find(m=>m.id===meta.id&&m.date===meta.date&&m.from.includes(meta.sourcePath));if(!move)continue;
  await plugin.processTextAtVaultPath(file.path,text=>{
   let current;try{current=require('./suggestion-replies.js').parse(text).meta;}catch{return text;}
   if(current.id!==move.id||current.date!==move.date||!move.from.includes(current.sourcePath))return text;
   return rewriteSource(text,{path:current.sourcePath,date:current.date},move);
  });
 }
}
module.exports={RENAME_KEY,rememberMove,rewriteSource,reconcileMoves,readMoves};
