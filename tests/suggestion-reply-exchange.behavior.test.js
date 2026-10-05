const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
function fixture(){
 const date='2026-09-29',path='Diary/'+date+'.md',files=new Map([[path,'## 建议\nRead first.\n## 保留\nKeep this.\n']]);
 const plugin={settings:{onboarding:{workspaceRoot:'Noria'}},normalizePath:s=>s,resolveCalendarNoteSpecAsync:async(_,d)=>({path:'Diary/'+d+'.md'}),loadTextFromVault:async p=>files.get(p)||'',requestNoriaRefresh(){},app:{loadLocalStorage:()=>null,vault:{getAbstractFileByPath:p=>files.has(p)?{path:p}:null,getMarkdownFiles:()=>[...files.keys()].map(path=>({path}))}},processTextAtVaultPath:async(p,fn)=>{const old=files.get(p)||'',next=fn(old);if(next!==old)files.set(p,next);}};
 plugin.api=createPublicApi(plugin);
 const read=()=>plugin.api.suggestionReplies.read({date});
 const submit=async(id='user-reply-one')=>{const source=await plugin.api.suggestions.read({date});return plugin.api.suggestionReplies.submit({date,sourcePath:path,sourceRevision:source.revision,requestId:id,markdown:'Walk first instead.'});};
 const ref=async()=>{const r=await read(),reply=r.replies[0];return {conversationId:r.id,replyId:reply.id,replyRevision:reply.revision,sourceRevision:r.source.revision};};
 const claim=async(id='claim-agent-one')=>plugin.api.suggestionReplies.claim({...await ref(),requestId:id,agent:'Test agent'});
 return {date,path,files,plugin,read,submit,ref,claim};
}
test('bounded discovery, claim and response persist readable content; an idempotent response survives reconstruction',async()=>{
 const f=fixture();await f.submit();const original=f.files.get(f.path),record=await f.read(),before=f.files.get(record.path),api=f.plugin.api.suggestionReplies;
 const list=await api.list({start:f.date,end:f.date});assert.equal(list.items.length,1);assert.equal(list.items[0].state,'saved');assert.equal(f.files.get(record.path),before);
 const claim=await f.claim();assert.equal((await api.list({start:f.date,end:f.date})).items.length,0);
 const request={...await f.ref(),claimId:claim.claimId,requestId:'response-agent-one',markdown:'Walk first; no task dates changed.'};
 assert.equal((await api.respond(request)).changed,true);assert.equal(f.files.get(f.path),original);assert.ok(f.files.get(record.path).includes(request.markdown));
 f.plugin.api=createPublicApi(f.plugin);assert.equal((await f.read()).replies[0].state,'responded');assert.equal((await f.plugin.api.suggestionReplies.respond(request)).changed,false);assert.equal((await f.read()).replies[0].response.markdown,request.markdown);
});
test('competing claims have one winner, renewal retains ownership, and responding does not complete a newer user reply',async()=>{
 const f=fixture();await f.submit();const base=await f.ref(),api=f.plugin.api.suggestionReplies;
 const results=await Promise.allSettled(['worker-one','worker-two'].map(requestId=>api.claim({...base,requestId,agent:requestId})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results[1].reason.code,'conflict');
 const claim=await api.claim({...base,requestId:'worker-one',agent:'worker-one'});assert.equal(claim.claimId,'worker-one');
 await f.submit('user-reply-two');await api.respond({...base,claimId:claim.claimId,requestId:'response-worker-one',markdown:'Reply only to the first message.'});
 const read=await f.read();assert.deepEqual(read.replies.map(r=>r.state),['responded','saved']);assert.equal((await api.list({start:f.date,end:f.date})).items[0].replyId,'user-reply-two');
});
test('expired claims remain uncertain across reload, require outcome acknowledgement and fence out the previous worker',async t=>{
 const f=fixture();await f.submit();const base=await f.ref(),first=await f.claim(),future=Date.parse(first.expiresAt)+1;t.mock.method(Date,'now',()=>future);
 f.plugin.api=createPublicApi(f.plugin);const api=f.plugin.api.suggestionReplies;assert.equal((await f.read()).replies[0].state,'uncertain');
 await assert.rejects(api.claim({...base,requestId:'claim-agent-one',agent:'Test agent'}),{code:'conflict'});
 const second={...base,requestId:'claim-agent-two',agent:'Second agent'};await assert.rejects(api.claim(second),{code:'conflict'});await api.claim({...second,acknowledgeUncertain:true});
 await assert.rejects(api.respond({...base,claimId:first.claimId,requestId:'late-response-one',markdown:'Late old result'}),{code:'conflict'});
 await api.respond({...base,claimId:second.requestId,requestId:'response-new-owner',markdown:'Prior outcomes checked; no action repeated.'});assert.equal((await f.read()).replies[0].response.claimId,second.requestId);
});
test('source edits block stale claims and responses without undoing an already successful business write',async()=>{
 const f=fixture();await f.submit();const old=await f.ref();f.files.set(f.path,'## 建议\nChanged manually.\n');const api=f.plugin.api.suggestionReplies;
 await assert.rejects(api.claim({...old,requestId:'claim-stale-source',agent:'Agent'}),{code:'conflict'});const claim=await f.claim(),base=await f.ref();
 await f.plugin.api.suggestions.update({date:f.date,revision:base.sourceRevision,markdown:'Walk first. Reading deferred.'});
 const request={...base,claimId:claim.claimId,requestId:'response-after-edit',markdown:'Suggestions updated. Other work remains.'};
 await assert.rejects(api.respond(request),{code:'conflict'});assert.equal((await f.plugin.api.suggestions.read({date:f.date})).markdown,'Walk first. Reading deferred.');
 request.sourceRevision=(await f.ref()).sourceRevision;await api.respond(request);f.files.delete(f.path);assert.equal((await api.respond(request)).changed,false);
 await assert.rejects(api.respond({...request,markdown:'A different result'}),{code:'conflict'});
});
test('failed writes retain pending input, retry appends once, and damaged event data cannot be overwritten',async()=>{
 const f=fixture();await f.submit();const claim=await f.claim(),api=f.plugin.api.suggestionReplies,request={...await f.ref(),claimId:claim.claimId,requestId:'response-io-retry',markdown:'A real reply.'},write=f.plugin.processTextAtVaultPath;
 f.plugin.processTextAtVaultPath=async()=>{throw Error('disk unavailable');};await assert.rejects(api.respond(request),{code:'io-error'});f.plugin.processTextAtVaultPath=write;
 await api.respond(request);await api.respond(request);const record=await f.read(),raw=f.files.get(record.path);assert.equal(raw.split('<!-- noria:reply-response {').length,2);
 f.files.set(record.path,raw.replace('"claimId":"'+claim.claimId+'"','"claimId":"unknown-claim"'));const damaged=f.files.get(record.path);await assert.rejects(api.respond(request),{code:'conflict'});assert.equal(f.files.get(record.path),damaged);
 const list=await api.list({start:f.date,end:f.date});assert.deepEqual(list.unreadable,[record.path]);assert.equal(list.items.length,0);
});
test('list limits are explicit and invalid ranges or unloaded operations cannot write',async()=>{
 const f=fixture();await f.submit();await f.submit('user-reply-two');const api=f.plugin.api.suggestionReplies;
 const list=await api.list({start:f.date,end:f.date,limit:1});assert.equal(list.items.length,1);assert.equal(list.truncated,true);
 await assert.rejects(api.list({start:'bad',end:f.date}),{code:'invalid-input'});await assert.rejects(api.list({start:'2020-01-01',end:f.date}),{code:'invalid-input'});
 const original=JSON.stringify([...f.files]),base=await f.ref();f.plugin._noriaPluginDisposed=true;await assert.rejects(api.claim({...base,requestId:'disposed-claim',agent:'Agent'}),{code:'unsupported'});assert.equal(JSON.stringify([...f.files]),original);
});
