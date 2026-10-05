const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
function fixture(){
 const files=new Map([['Diary/2026-09-27.md','## 记录\nKeep this.\n\n## 建议\n先读书，再散步。\n']]),queues=new Map();
 const plugin={settings:{onboarding:{workspaceRoot:'Noria'}},normalizePath:s=>s,resolveCalendarNoteSpecAsync:async(_,date)=>({path:`Diary/${date}.md`}),loadTextFromVault:async path=>files.get(path)||'',app:{loadLocalStorage:()=>null,vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null}},
 processTextAtVaultPath(path,fn){const job=(queues.get(path)||Promise.resolve()).catch(()=>{}).then(()=>{const old=files.get(path)||'',next=fn(old);if(next!==old)files.set(path,next);});queues.set(path,job);return job;}};
 const api=()=>createPublicApi(plugin);
 const request=async(id='reply-one',markdown='散步保留，读书改到明天。')=>{const s=await api().suggestions.read({date:'2026-09-27'});return {date:s.date,sourcePath:s.path,sourceRevision:s.revision,requestId:id,markdown};};
 return {files,plugin,api,request};
}
test('read creates nothing; saved replies recover with the original context and leave the diary unchanged',async()=>{
 const f=fixture(),original=f.files.get('Diary/2026-09-27.md');
 assert.equal((await f.api().suggestionReplies.read({date:'2026-09-27'})).exists,false);assert.equal(f.files.size,1);
 const saved=await f.api().suggestionReplies.submit(await f.request());
 assert.equal(saved.changed,true);assert.equal(f.files.get('Diary/2026-09-27.md'),original);
 assert.match(f.files.get(saved.path),/散步保留，读书改到明天。/);assert.match(f.files.get(saved.path),/\[\[Diary\/2026-09-27#建议\]\]/);
 const reopened=await f.api().suggestionReplies.read({date:'2026-09-27'});
 assert.equal(reopened.id,saved.id);assert.equal(reopened.replies[0].sourceMarkdown,'先读书，再散步。');assert.equal(reopened.replies[0].state,'saved');
 assert.equal((await f.api().suggestionReplies.read({date:'2026-09-28'})).exists,false);assert.equal(f.files.size,2);
});
test('duplicate retries append once; competing different replies survive the shared mutation queue',async()=>{
 const f=fixture(),request=await f.request();
 const result=await Promise.all([f.api().suggestionReplies.submit(request),f.api().suggestionReplies.submit(request)]);
 assert.equal(result.filter(r=>r.changed).length,1);
 await assert.rejects(f.api().suggestionReplies.submit({...request,markdown:'Changed payload'}),e=>e.code==='conflict');
 await Promise.all(['reply-two','reply-three'].map(async id=>f.api().suggestionReplies.submit(await f.request(id,id))));
 assert.equal((await f.api().suggestionReplies.read(request)).replies.length,3);
});
test('source changes preserve saved context, refuse stale new submissions and keep retry idempotency',async()=>{
 const f=fixture(),request=await f.request(),saved=await f.api().suggestionReplies.submit(request);
 f.files.set(request.sourcePath,'## 建议\n人工更新。');
 const read=await f.api().suggestionReplies.read(request);assert.equal(read.replies[0].sourceChanged,true);assert.equal(read.replies[0].sourceMarkdown,'先读书，再散步。');
 await assert.rejects(f.api().suggestionReplies.submit({...request,requestId:'reply-new'}),e=>e.code==='conflict');
 assert.equal((await f.api().suggestionReplies.submit(request)).changed,false);
 assert.equal((await f.api().suggestionReplies.read(request)).replies.length,1);
 f.plugin.resolveCalendarNoteSpecAsync=async()=>({path:'Elsewhere/2026-09-27.md'});
 await assert.rejects(f.api().suggestionReplies.submit(request),e=>e.code==='conflict');
 assert.equal(f.files.has(saved.path),true);
});
test('unknown or broken reply files and unloaded handles cannot overwrite existing content',async()=>{
 const f=fixture(),request=await f.request(),saved=await f.api().suggestionReplies.submit(request);
 const broken=f.files.get(saved.path).replace('<!-- noria:reply-end -->','');f.files.set(saved.path,broken);
 await assert.rejects(f.api().suggestionReplies.submit({...request,requestId:'reply-new'}),e=>e.code==='conflict');assert.equal(f.files.get(saved.path),broken);
 f.files.set(saved.path,'My own note.');await assert.rejects(f.api().suggestionReplies.read(request),e=>e.code==='conflict');
 f.plugin._noriaPluginDisposed=true;await assert.rejects(f.api().suggestionReplies.read(request),e=>e.code==='unsupported');
});
test('invalid Markdown and failed storage create no record or delivery claim',async()=>{
 const f=fixture(),request=await f.request();
 for(const markdown of ['','```js\nopen','<!-- open','<!-- noria:reply fake -->'])await assert.rejects(f.api().suggestionReplies.submit({...request,markdown}),e=>e.code==='invalid-input');
 assert.equal(f.files.size,1);
 f.plugin.processTextAtVaultPath=async()=>{throw Error('disk unavailable');};
 await assert.rejects(f.api().suggestionReplies.submit(request),e=>e.code==='io-error');assert.equal(f.files.size,1);
});
