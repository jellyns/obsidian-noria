const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi,extractH2Section}=require('../src/public-api.js');
function fixture(initial={}){
 const files=new Map(Object.entries(initial)),refresh=[],queues=new Map();
 const p={_noriaPluginDisposed:false,normalizePath:x=>x.replaceAll('\\','/'),app:{vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null}},
 getLocalYmd:()=> '2026-09-26',loadTextFromVault:async path=>files.get(path)||'',resolveCalendarNoteSpecAsync:async(mode,date)=>({path:'Custom/'+date+'.md'}),buildCalendarNoteContent:async()=> '---\nkeep: true\n---\n\n## 记录\n',requestNoriaRefresh:(...args)=>refresh.push(args),
 processTextAtVaultPath(path,fn){const op=(queues.get(path)||Promise.resolve()).catch(()=>{}).then(()=>{const old=files.get(path)||'',next=fn(old);if(next!==old)files.set(path,next);});queues.set(path,op);return op;},
 createDataService:async()=>({getTasks:async()=>({meta:{schemaVersion:1},items:[...files].filter(([path])=>path.startsWith('Projects/')).map(([path,text])=>({identity:{sourcePath:path},source:{line:1,rawLine:text.split('\n')[1]}}))})})};
 return {p,api:createPublicApi(p),files,refresh};
}
test('public task query feeds date and status writes, returns a new ref and rejects stale input',async()=>{
 const f=fixture({'Projects/A.md':'## Tasks\n- [ ] Example [due:: 2026-09-26]\n\nKeep this.'});
 const {items:[item]}=await f.api.tasks.list();
 const result=await f.api.tasks.update({ref:item.ref,patch:{due:'2026-09-27'}});
 assert.equal(result.changed,true);assert.match(f.files.get(item.ref.path),/due:: 2026-09-27/);assert.match(f.files.get(item.ref.path),/Keep this\.$/);
 await assert.rejects(f.api.tasks.update({ref:item.ref,patch:{due:'2026-09-28'}}),e=>e.code==='conflict');
 assert.equal((await f.api.tasks.update({ref:result.ref,patch:{due:'2026-09-27'}})).changed,false);
 const done=await f.api.tasks.update({ref:result.ref,patch:{status:'done'}});assert.match(done.ref.rawText,/\[x\].*completion:: 2026-09-26/);assert.equal(f.refresh.length,2);
});
test('suggestion writes preserve surrounding CRLF content and tolerate independent edits but protect manual changes',async()=>{
 const path='Custom/2026-09-26.md',before='---\r\nx: true\r\n---\r\n## 记录\r\nKeep\r\n## 建议\r\nOld\r\n\r\n## 复盘\r\nRetain\r\n',f=fixture({[path]:before});
 const base=await f.api.suggestions.read({date:'2026-09-26'});f.files.set(path,before.replace('Keep','Keep edited'));
 const result=await f.api.suggestions.update({...base,markdown:'### 一步\nNew'});
 assert.equal(f.files.get(path),before.replace('Keep','Keep edited').replace('## 建议\r\nOld\r\n\r\n','## 建议\r\n\r\n### 一步\r\nNew\r\n\r\n'));
 assert.equal((await f.api.suggestions.update({...base,markdown:'### 一步\nNew'})).changed,false);
 f.files.set(path,f.files.get(path).replace('New','User edited'));
 await assert.rejects(f.api.suggestions.update({...result,markdown:'Another'}),e=>e.code==='conflict');assert.match(f.files.get(path),/User edited/);
 assert.equal(f.refresh.length,1);
});
test('missing suggestions are read without creation and concurrent updates commit only one version',async()=>{
 const f=fixture(),base=await f.api.suggestions.read({date:'2026-09-26'});assert.equal(f.files.size,0);
 assert.equal((await f.api.suggestions.update({...base,markdown:''})).changed,false);assert.equal(f.files.size,0);
 const results=await Promise.allSettled(['First','Second'].map(markdown=>f.api.suggestions.update({...base,markdown})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'conflict');assert.match(f.files.get(base.path),/^---\nkeep: true/);
});
test('suggestion section boundaries reject ambiguous and escaping content without touching source',async()=>{
 const f=fixture({'Custom/2026-09-26.md':'## 建议\nOne\n## 建议\nTwo'});
 await assert.rejects(f.api.suggestions.read({date:'2026-09-26'}),e=>e.code==='conflict');
 f.files.set('Custom/2026-09-26.md','## 记录\nKeep');const base=await f.api.suggestions.read({date:'2026-09-26'});
 for(const markdown of ['## 其他\nescape','```js\nopen','<!-- open'])await assert.rejects(f.api.suggestions.update({...base,markdown}),e=>e.code==='invalid-input');
 const body='```md\n## Not a section\n```\n\nUseful';await f.api.suggestions.update({...base,markdown:body});assert.equal(extractH2Section(f.files.get(base.path),'建议').text,body);
 f.files.set(base.path,'```md\nunclosed source');const broken=await f.api.suggestions.read({date:'2026-09-26'});
 await assert.rejects(f.api.suggestions.update({...broken,markdown:'Safe'}),e=>e.code==='conflict');assert.equal(f.files.get(base.path),'```md\nunclosed source');
});
test('unsupported fields, invalid dates and retained unloaded API handles cannot write',async()=>{
 const f=fixture({'Projects/A.md':'## Tasks\n- [ ] Example'}),{items:[item]}=await f.api.tasks.list();
 await assert.rejects(f.api.tasks.update({ref:item.ref,patch:{title:'Change'}}),e=>e.code==='invalid-input');
 await assert.rejects(f.api.suggestions.read({date:'2026-02-30'}),e=>e.code==='invalid-input');
 f.p._noriaPluginDisposed=true;await assert.rejects(f.api.tasks.update({ref:item.ref,patch:{status:'done'}}),e=>e.code==='unsupported');assert.match(f.files.get(item.ref.path),/- \[ \] Example$/);
});
