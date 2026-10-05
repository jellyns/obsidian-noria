"use strict";
const {conversationFiles}=require('./suggestion-reply-library.js');
const {parse}=require('./suggestion-replies.js');
const {idOk,state}=require('./suggestion-reply-events.js');
const {dayNumber}=require('./countdown-document.js');
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const LEASE_MS=5*60*1000;
const fail=(code,message)=>Object.assign(Error(message),{code});
const conflict=message=>fail('conflict',message);
function createReplyExchange(plugin,replies,options={}){
 const accept=options.accept||((meta)=>!meta.kind);
 const parseRecord=options.parse||parse;
 const active=()=>{if(plugin._noriaPluginDisposed)throw fail('unsupported','Noria unloaded; reconnect');};
 async function find(id){
  if(!idOk(id))throw fail('invalid-input','Specify a conversationId from replies.list');
  const found=[];
  for(const file of conversationFiles(plugin)){
   const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->/.exec(raw);if(!head)continue;
   let meta;try{meta=JSON.parse(head[1]);}catch{continue;}
   if(meta.id===id&&accept(meta))found.push({path:file.path,record:parseRecord(raw)});
  }
  if(found.length!==1)throw conflict('Conversation missing or duplicated; inspect the saved record');
  return found[0];
 }
 function target(record,request){
  if(record?.id!==request.conversationId)throw conflict('Conversation changed');
  const reply=record.replies.find(r=>r.id===request.replyId);
  if(!reply||reply.revision!==request.replyRevision)throw conflict('Reply changed; reread before acting');
  return reply;
 }
 async function sourceFor(record,request){
  if(options.readSource){const source=await options.readSource(record);if(!source.exists||source.revision!==request.sourceRevision)throw conflict('Questions changed; reread the interaction before acting');return source;}
  const read=await replies.read({date:record.meta.date,sourcePath:record.meta.sourcePath});
  if(read.id!==record.id||!read.source.exists)throw conflict('Source unavailable; locate it before processing');
  if(read.source.revision!==request.sourceRevision)throw conflict('Suggestions changed; reread current sources and prior outcomes');
  return read.source;
 }
 return {
  async list(request={}){
   const {start,end,limit=50,status='pending'}=request,a=dayNumber(start),b=dayNumber(end);
   if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||b-a>365||!Number.isInteger(limit)||limit<1||limit>100||!['pending','all'].includes(status))throw fail('invalid-input','Specify a date range up to 366 days, limit 1–100 and pending or all status');
   const items=[],unreadable=[];
   for(const file of conversationFiles(plugin)){
    active();let record;try{record=parseRecord(await plugin.loadTextFromVault(file.path));}catch{unreadable.push(file.path);continue;}
    if(!record||!accept(record.meta)||record.meta.date<start||record.meta.date>end)continue;
    for(const reply of record.replies){if(status==='pending'&&!['saved','uncertain'].includes(reply.state))continue;
     items.push({conversationId:record.id,replyId:reply.id,replyRevision:reply.revision,date:record.meta.date,sourcePath:record.meta.sourcePath,path:file.path,state:reply.state,createdAt:reply.createdAt});
    }
   }
   items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.replyId.localeCompare(b.replyId));
   return {items:items.slice(0,limit),truncated:items.length>limit,unreadable};
  },
  async claim(request){
   active();if(!idOk(request?.requestId)||typeof request.agent!=='string'||!request.agent.trim()||request.agent.length>80||typeof request.sourceRevision!=='string')throw fail('invalid-input','Supply a stable requestId, agent label and current sourceRevision');
   const {path,record}=await find(request.conversationId);target(record,request);await sourceFor(record,request);let claim;
   await plugin.processTextAtVaultPath(path,raw=>{
    active();const reply=target(parseRecord(raw),request),now=Date.now();
    if(reply.response)throw conflict('This reply already has a response');
    if(reply.claim?.id===request.requestId){
     if(reply.state!=='claimed'||reply.claim.agent!==request.agent||reply.claim.sourceRevision!==request.sourceRevision)throw conflict('Previous claim expired or changed; inspect prior outcomes before a new claim');
    }else{
     if(reply.state==='claimed')throw conflict('Another claim is active');
     if(reply.claims?.some(c=>c.id===request.requestId))throw conflict('Claim ID already used; reread before a new claim');
     if(reply.state==='uncertain'&&request.acknowledgeUncertain!==true)throw conflict('Expired claim may have acted; inspect outcomes and explicitly acknowledge before reclaiming');
    }
    claim={id:request.requestId,replyId:reply.id,replyRevision:reply.revision,agent:request.agent,sourceRevision:request.sourceRevision,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+LEASE_MS).toISOString()};
    return raw+'\n<!-- noria:reply-claim '+JSON.stringify(claim)+' -->\n';
   });
   return {ok:true,claimId:claim.id,expiresAt:claim.expiresAt,state:'claimed'};
  },
  async respond(request){
   active();if(!idOk(request?.requestId)||!idOk(request?.claimId)||typeof request.markdown!=='string'||!request.markdown.trim()||request.markdown.length>12000||request.markdown.includes('<!-- noria:reply')||typeof request.sourceRevision!=='string')throw fail('invalid-input','Supply claimId, stable response requestId, current sourceRevision and nonempty Markdown up to 12000 characters');
   const markdown=request.markdown.replace(/\r\n?/g,'\n').trim();
   if(scanAtxHeadings(markdown+'\n\n## noria-response-boundary\n').at(-1)?.title!=='noria-response-boundary')throw fail('invalid-input','Close Markdown code blocks and comments');
   const {path,record}=await find(request.conversationId),first=target(record,request);
   const same=reply=>reply.response?.id===request.requestId&&reply.response.claimId===request.claimId&&reply.response.markdown===markdown&&reply.response.sourceRevision===request.sourceRevision;
   if(first.response){if(same(first))return {ok:true,changed:false,state:'responded',response:first.response};throw conflict('A response already exists; it was preserved');}
   await sourceFor(record,request);let response,changed=false;
   await plugin.processTextAtVaultPath(path,raw=>{
    active();const reply=target(parseRecord(raw),request);
    if(reply.response){if(same(reply)){response=reply.response;return raw;}throw conflict('A response already exists');}
    if(state(reply)!=='claimed'||reply.claim.id!==request.claimId)throw conflict('Claim expired or replaced; inspect outcomes before retrying');
    response={id:request.requestId,replyId:reply.id,replyRevision:reply.revision,claimId:request.claimId,agent:reply.claim.agent,sourceRevision:request.sourceRevision,createdAt:new Date().toISOString(),markdown};changed=true;
    const {markdown:body,...meta}=response;
    return raw+'\n<!-- noria:reply-response '+JSON.stringify(meta)+' -->\n## Agent 回应 · '+meta.createdAt+'\n\n<!-- noria:reply-response-text -->\n'+body+'\n\n<!-- noria:reply-response-end -->\n';
   });
   return {ok:true,changed,state:'responded',response};
  }
 };
}
module.exports={createReplyExchange};
