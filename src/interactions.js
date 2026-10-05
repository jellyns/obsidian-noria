"use strict";
const doc=require('./interaction-document.js');
const {idOk}=require('./suggestion-reply-events.js');
const {conversationFiles}=require('./suggestion-reply-library.js');
const {dayNumber}=require('./countdown-document.js');
function createInteractions(plugin){
 const checkId=id=>{if(!idOk(id))throw doc.fail('invalid-input','Use a stable ID of 8–100 letters, digits, underscores or hyphens');};
 const root=()=>{const value=plugin.normalizePath(plugin.settings?.onboarding?.workspaceRoot||'Noria');if(!value||/[\\:]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw doc.fail('invalid-input','Invalid Noria workspace root');return value+'/Conversations';};
 async function find(id){
  checkId(id);const found=[];
  for(const file of conversationFiles(plugin)){
   const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->/.exec(raw);if(!head)continue;
   let meta;try{meta=JSON.parse(head[1]);}catch{continue;}
   if(meta.id===id){if(meta.kind!=='interaction')throw doc.fail('conflict','ID belongs to another conversation');found.push({path:file.path,record:doc.parse(raw)});}
  }
  if(found.length>1)throw doc.fail('conflict','Duplicate interaction IDs; keep both notes and resolve the conflict');return found[0];
 }
 const state=(record,path)=>({id:record.id,path,date:record.meta.date,definition:record.current.definition,definitionVersion:record.current.version,source:{path,date:record.meta.date,exists:true,revision:record.current.revision,markdown:doc.readable(record.current.definition)},replies:record.replies});
 async function read(request){const found=await find(request?.conversationId);if(!found)throw doc.fail('not-found','找不到这份交互，请重新选择');return state(found.record,found.path);}
 const exchange=require('./suggestion-reply-exchange.js').createReplyExchange(plugin,null,{accept:meta=>meta.kind==='interaction',parse:doc.parse,readSource:async record=>(await read({conversationId:record.id})).source});
 return {
  read,
  async list({limit=50}={}){
   if(!Number.isInteger(limit)||limit<1||limit>100)throw doc.fail('invalid-input','Limit must be 1–100');const items=[],unreadable=[];
   for(const file of conversationFiles(plugin)){
    const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->/.exec(raw);if(!head)continue;
    try{const meta=JSON.parse(head[1]);if(meta.kind!=='interaction')continue;const r=doc.parse(raw);items.push({id:r.id,path:file.path,title:r.current.definition.title,date:r.meta.date,revision:r.current.revision,pending:r.replies.filter(r=>['saved','uncertain'].includes(r.state)).length});}catch{unreadable.push(file.path);}
   }
   items.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));return {items:items.slice(0,limit),truncated:items.length>limit,unreadable};
  },
  async publish(request){
   checkId(request?.conversationId);checkId(request.requestId);const definition=doc.normalizeDefinition(request.definition);
   if(!Number.isFinite(dayNumber(request.date)))throw doc.fail('invalid-input','Specify context date as YYYY-MM-DD');
   const found=await find(request.conversationId),path=found?.path||`${root()}/交互-${request.conversationId}.md`;let changed=false;
   await plugin.processTextAtVaultPath(path,raw=>{
    const record=raw?doc.parse(raw):null;if(record&&record.id!==request.conversationId)throw doc.fail('conflict','Path belongs to a different interaction');
    const prior=record?.versions.find(v=>v.requestId===request.requestId);
    if(prior){if(!doc.same(prior.definition,definition)||record.meta.date!==request.date||prior.baseRevision!==request.revision)throw doc.fail('conflict','Request ID already used with different content');return raw;}
    if((record?.current.revision||null)!==request.revision||record&&record.meta.date!==request.date)throw doc.fail('conflict','问题已更新，请重新读取后再保存');
    const meta={version:1,kind:'interaction',id:request.conversationId,sourcePath:path,date:request.date};
    const entry={version:(record?.current.version||0)+1,requestId:request.requestId,baseRevision:request.revision,createdAt:new Date().toISOString(),definition};changed=true;
    return (raw||`<!-- noria:conversation ${JSON.stringify(meta)} -->\n`)+ '\n'+doc.block(entry);
   });
   return {ok:true,changed,...await read(request)};
  },
  async submit(request){
   checkId(request?.requestId);const found=await find(request.conversationId);if(!found)throw doc.fail('not-found','Interaction no longer exists');let changed=false;
   await plugin.processTextAtVaultPath(found.path,raw=>{
    const record=doc.parse(raw),old=record.replies.find(r=>r.id===request.requestId);
    if(old){const version=record.versions.find(v=>v.version===old.definitionVersion),answers=doc.answersFor(version.definition,request.answers);if(old.sourceRevision!==request.sourceRevision||!doc.same(old.answers,answers))throw doc.fail('conflict','Request ID already used for another answer');return raw;}
    if(record.current.revision!==request.sourceRevision)throw doc.fail('conflict','问题已更新，已保留你的输入；请核对新问题后提交');
    const answers=doc.answersFor(record.current.definition,request.answers),markdown=doc.answerMarkdown(record.current.definition,answers);
    if(!markdown)throw doc.fail('invalid-input','请先填写回答');
    const entry={id:request.requestId,createdAt:new Date().toISOString(),sourceRevision:request.sourceRevision,definitionVersion:record.current.version,date:record.meta.date,answers};
    const snapshot=doc.readable(record.current.definition).split('\n').map(line=>'> '+line).join('\n');changed=true;
    return raw+`\n<!-- noria:reply ${JSON.stringify(entry)} -->\n## 我的回答 · ${entry.createdAt}\n\n<!-- noria:reply-text -->\n${markdown}\n\n<!-- noria:reply-source -->\n${snapshot}\n\n<!-- noria:reply-end -->\n`;
   });
   return {ok:true,changed,...await read(request)};
  },
  claim:exchange.claim,respond:exchange.respond
 };
}
module.exports={createInteractions};
