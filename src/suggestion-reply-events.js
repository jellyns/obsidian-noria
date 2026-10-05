"use strict";
const {createHash}=require('node:crypto');
const idOk=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(id);
const fail=()=>{throw Object.assign(Error('Reply processing records are inconsistent; original content was preserved'),{code:'conflict'});};
const revision=reply=>'reply-v1-'+createHash('sha256').update(JSON.stringify([reply.id,reply.markdown,reply.sourceRevision,reply.sourceMarkdown,...(reply.definitionVersion===undefined?[]:[reply.definitionVersion,reply.date,reply.answers])])).digest('hex');
const state=(reply,now=Date.now())=>reply.response?'responded':reply.claim?Date.parse(reply.claim.expiresAt)>now?'claimed':'uncertain':'saved';
function applyEvents(outside,replies){
 const lines=outside.split('\n'),remaining=[];
 for(let i=0;i<lines.length;i++){
  const match=/^<!-- noria:reply-(claim|response) (.+) -->$/.exec(lines[i]);
  if(!match){remaining.push(lines[i]);continue;}
  let event;try{event=JSON.parse(match[2]);}catch{fail();}
  const reply=replies.find(r=>r.id===event.replyId);
  if(!reply||!idOk(event.id)||event.replyRevision!==revision(reply)||typeof event.sourceRevision!=='string'||!Number.isFinite(Date.parse(event.createdAt)))fail();
  if(match[1]==='claim'){
   if(reply.response||typeof event.agent!=='string'||!event.agent.trim()||event.agent.length>80||!Number.isFinite(Date.parse(event.expiresAt))||Date.parse(event.expiresAt)<=Date.parse(event.createdAt))fail();
   const claims=reply.claims||(reply.claims=[]),prior=claims.find(c=>c.id===event.id);
   if(prior&&(reply.claim?.id!==event.id||prior.agent!==event.agent||prior.sourceRevision!==event.sourceRevision))fail();
   claims.push(event);reply.claim=event;
  }else{
   if(reply.response||reply.claim?.id!==event.claimId||event.agent!==reply.claim.agent)fail();
   while(i+1<lines.length&&lines[i+1]!=='<!-- noria:reply-response-text -->'){i++;if(lines[i].includes('<!-- noria:reply'))fail();}
   if(lines[++i]!=='<!-- noria:reply-response-text -->')fail();
   const body=[];while(++i<lines.length&&lines[i]!=='<!-- noria:reply-response-end -->')body.push(lines[i]);
   const markdown=body.join('\n').trim();if(i===lines.length||!markdown||markdown.includes('<!-- noria:reply'))fail();
   reply.response={...event,markdown};
  }
 }
 return remaining.join('\n');
}
module.exports={applyEvents,revision,state,idOk};
