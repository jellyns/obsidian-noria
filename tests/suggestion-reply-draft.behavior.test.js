const test=require('node:test'),assert=require('node:assert/strict');
const {createReplyDraft}=require('../src/suggestion-reply-draft.js');
function setup(){const local=new Map(),source={path:'Diary/2026-09-27.md',date:'2026-09-27',revision:'rev-one',markdown:'Original'},calls=[];let fail=false;
 const app={loadLocalStorage:key=>local.get(key),saveLocalStorage(key,value){if(!fail)local.set(key,structuredClone(value));}};
 const api={suggestionReplies:{submit:async request=>{calls.push(request);return {path:'reply.md',replies:[{id:request.requestId,markdown:request.markdown}]};}}};
 return {local,source,calls,api,app,setFail:v=>fail=v,make:()=>createReplyDraft({app,source,getApi:()=>api})};}
test('collapsed drafts recover by exact source and successful save clears only their draft',async()=>{
 const f=setup(),first=f.make();first.edit('Do this tomorrow.');first.expand(false);
 const restored=f.make();assert.equal(restored.snapshot().draft.markdown,'Do this tomorrow.');assert.equal(restored.snapshot().draft.expanded,false);
 const other=createReplyDraft({app:f.app,source:{...f.source,date:'2026-09-28'},getApi:()=>f.api});other.edit('Other day');
 await restored.save();assert.equal(f.make().snapshot().draft.markdown,'');assert.equal(other.snapshot().draft.markdown,'Other day');assert.equal(f.calls.length,1);
});
test('write failures retain input and retry ID; storage failure stops a submission',async()=>{
 const f=setup(),draft=f.make();draft.edit('Keep my input');const id=draft.snapshot().draft.requestId;
 f.api.suggestionReplies.submit=async request=>{f.calls.push(request);throw Object.assign(Error('disk'),{code:'io-error'});};
 await assert.rejects(draft.save());assert.equal(draft.snapshot().draft.markdown,'Keep my input');
 await assert.rejects(draft.save());assert.ok(f.calls.every(call=>call.requestId===id));
 f.setFail(true);assert.throws(()=>draft.edit('Still in memory'));assert.equal(draft.snapshot().draft.markdown,'Still in memory');
 const count=f.calls.length;await assert.rejects(draft.save());assert.equal(f.calls.length,count);
});
test('source updates cannot silently rebase an existing draft; concurrent saves submit only once',async()=>{
 const f=setup(),draft=f.make();draft.edit('My correction');draft.setSource({...f.source,revision:'rev-two'});assert.equal(draft.snapshot().stale,true);
 assert.equal(draft.snapshot().draft.sourceRevision,'rev-one');draft.rebase();assert.equal(draft.snapshot().stale,false);
 await Promise.all([draft.save(),draft.save()]);assert.equal(f.calls.length,1);assert.equal(f.calls[0].sourceRevision,'rev-two');
 draft.setSource({...f.source,revision:'rev-three'});draft.edit('New correction');assert.equal(draft.snapshot().stale,false);
});
test('a transient local read failure can recover without overwriting the stored draft',()=>{
 const f=setup();f.make().edit('Recover this draft');const original=f.app.loadLocalStorage;
 f.app.loadLocalStorage=()=>{throw Error('temporarily unavailable');};const draft=f.make();
 assert.equal(draft.snapshot().error,'draft-load');draft.rebase();assert.throws(()=>draft.edit('replacement'));
 f.app.loadLocalStorage=original;draft.reloadDraft();assert.equal(draft.snapshot().error,'');assert.equal(draft.snapshot().draft.markdown,'Recover this draft');
});
