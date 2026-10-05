const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
function fixture(){
 const files=new Map(),storage=new Map();let fail=false;
 const plugin={settings:{},normalizePath:p=>p,app:{loadLocalStorage:k=>storage.get(k),saveLocalStorage:(k,v)=>storage.set(k,v),vault:{getMarkdownFiles:()=>[...files.keys()].map(path=>({path})),getAbstractFileByPath:path=>files.has(path)?{path}:null}},
  loadTextFromVault:async p=>files.get(p)||'',processTextAtVaultPath:async(p,fn)=>{if(fail)throw Error('Disk full');files.set(p,fn(files.get(p)||''));},requestNoriaRefresh(){}};
 plugin.api=createPublicApi(plugin);return {plugin,files,api:plugin.api.interactions,setFail:v=>fail=v};
}
const definition={title:'阅读安排',markdown:'今天想怎样读？',fields:[{id:'book',label:'书目',type:'single',options:[{id:'a',label:'小说'},{id:'b',label:'论文'}],required:true},{id:'minutes',label:'分钟',type:'number',default:15},{id:'note',label:'补充',type:'text'}]};
const publish={conversationId:'reading-plan-one',requestId:'publish-reading-one',revision:null,date:'2026-09-29',definition};
test('publish and structured submissions survive reload, snapshots, retries and definition changes',async()=>{
 const f=fixture(),first=await f.api.publish(publish);assert.equal(first.changed,true);assert.equal((await f.api.publish(publish)).changed,false);
 const req={conversationId:first.id,sourceRevision:first.source.revision,requestId:'answer-reading-one',answers:{book:'a',minutes:20,note:'先试一章'}};
 const saved=await f.api.submit(req);assert.equal(saved.replies[0].answers.book,'a');assert.match(saved.replies[0].markdown,/书目：小说/);
 assert.equal((await f.api.submit(req)).changed,false);await assert.rejects(f.api.submit({...req,answers:{book:'b'}}),{code:'conflict'});
 const next=await f.api.publish({...publish,requestId:'publish-reading-two',revision:first.source.revision,definition:{...definition,fields:[{id:'book',label:'新问题',type:'text'}]}});
 await assert.rejects(f.api.submit({...req,requestId:'answer-reading-stale'}),{code:'conflict'});
 f.plugin.api=createPublicApi(f.plugin);const read=await f.plugin.api.interactions.read({conversationId:first.id});assert.equal(read.source.revision,next.source.revision);assert.equal(read.replies[0].definitionVersion,1);assert.match(read.replies[0].sourceMarkdown,/今天想怎样读/);assert.deepEqual(read.replies[0].answers,req.answers);
 const raw=f.files.get(read.path);assert.match(raw,/## 阅读安排/);assert.match(raw,/先试一章/);
});
test('shared claim/respond protocol fences concurrent workers and isolates generic conversations from suggestions',async()=>{
 const f=fixture(),first=await f.api.publish(publish),saved=await f.api.submit({conversationId:first.id,sourceRevision:first.source.revision,requestId:'answer-reading-one',answers:{book:'a'}}),r=saved.replies[0];
 const ref={conversationId:first.id,replyId:r.id,replyRevision:r.revision,sourceRevision:first.source.revision};
 await f.api.claim({...ref,requestId:'claim-reading-one',agent:'Codex'});
 await assert.rejects(f.api.claim({...ref,requestId:'claim-reading-two',agent:'Another'}),{code:'conflict'});
 const answer={...ref,claimId:'claim-reading-one',requestId:'respond-reading-one',markdown:'先读一章，再决定是否继续。'};
 await f.api.respond(answer);assert.equal((await f.api.respond(answer)).changed,false);
 assert.equal((await f.api.read({conversationId:first.id})).replies[0].state,'responded');
 assert.equal((await f.plugin.api.suggestionReplies.list({start:publish.date,end:publish.date})).items.length,0);
 await assert.rejects(f.plugin.api.suggestionReplies.claim({...ref,requestId:'claim-wrong-kind',agent:'Agent'}),{code:'conflict'});
 assert.equal((await f.api.list({})).items[0].pending,0);
});
test('invalid inputs and failed persistence preserve files; renamed objects keep identity and duplicate IDs conflict',async()=>{
 const f=fixture();for(const fields of [[{id:'same',label:'A',type:'text'},{id:'same',label:'B',type:'text'}],[{id:'x',label:'A',type:'single',options:[]}],[{id:'x',label:'A',type:'date',default:'2026-02-30'}]])await assert.rejects(f.api.publish({...publish,definition:{...definition,fields}}),{code:'invalid-input'});
 const one=await f.api.publish(publish),req={conversationId:one.id,sourceRevision:one.source.revision,requestId:'answer-reading-one',answers:{book:'missing'}};
 await assert.rejects(f.api.submit(req),{code:'invalid-input'});f.setFail(true);await assert.rejects(f.api.submit({...req,answers:{book:'a'}}),{code:'io-error'});f.setFail(false);assert.equal((await f.api.read({conversationId:one.id})).replies.length,0);
 const moved=one.path.replace(/[^/]+$/,'重命名.md'),raw=f.files.get(one.path);f.files.delete(one.path);f.files.set(moved,raw);assert.equal((await f.api.read({conversationId:one.id})).path,moved);
 f.files.set(one.path,raw);await assert.rejects(f.api.read({conversationId:one.id}),{code:'conflict'});
});
test('shared persistent draft survives question changes, and answers typed during submission get a new request ID',async()=>{
 const f=fixture(),first=await f.api.publish(publish),{draftFor}=require('../src/interaction-draft.js'),model=draftFor(f.plugin,first.id);model.acceptSource(first);model.set('book','a');model.set('note','keep');
 assert.equal(draftFor(f.plugin,first.id),model);const requestId=model.draft.requestId;
 const submit=f.plugin.api.interactions.submit;let release;f.plugin.api={interactions:{submit:request=>new Promise(resolve=>release=()=>submit(request).then(resolve))}};
 const pending=model.submit();model.set('note','new supplement');release();await pending;assert.equal(model.draft.answers.note,'new supplement');assert.notEqual(model.draft.requestId,requestId);
 const next=await f.api.publish({...publish,requestId:'publish-reading-two',revision:first.source.revision,definition:{...definition,fields:[{id:'note',label:'新的补充',type:'text'}]}});model.acceptSource(next);assert.equal(model.draft.sourceRevision,first.source.revision);assert.equal(model.draft.answers.book,'a');model.useCurrent();assert.equal(model.draft.sourceRevision,next.source.revision);assert.equal(model.draft.answers.note,'new supplement');assert.match(model.draft.previous,/书目：小说/);
 f.plugin._interactionDrafts=null;assert.equal(draftFor(f.plugin,first.id).draft.answers.note,'new supplement');
});
