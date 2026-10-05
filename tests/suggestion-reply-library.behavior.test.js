const test=require('node:test'),assert=require('node:assert/strict');
const {readReplyLibrary,draftKey,indexDraft,DRAFT_INDEX}=require('../src/suggestion-reply-library.js');
const {createPublicApi}=require('../src/public-api.js');
function fixture(){
 const files=new Map([['Diary/2026-09-28.md','## 建议\nRead today.']]),local=new Map(),reads=[];
 const plugin={settings:{onboarding:{workspaceRoot:'Noria'}},normalizePath:s=>s,resolveCalendarNoteSpecAsync:async(_,date)=>({path:`Diary/${date}.md`}),loadTextFromVault:async path=>{reads.push(path);return files.get(path)||'';},
 app:{loadLocalStorage:key=>local.get(key),saveLocalStorage:(key,v)=>local.set(key,structuredClone(v)),vault:{getMarkdownFiles:()=>[...files.keys()].map(path=>({path})),getAbstractFileByPath:path=>files.has(path)?{path}:null}},
 processTextAtVaultPath:async(path,fn)=>files.set(path,fn(files.get(path)||''))};plugin.api=createPublicApi(plugin);
 return {plugin,files,local,reads};
}
test('missing sources and changed roots retain a readable independent conversation and local draft',async()=>{
 const f=fixture(),source=await f.plugin.api.suggestions.read({date:'2026-09-28'});
 const saved=await f.plugin.api.suggestionReplies.submit({date:source.date,sourcePath:source.path,sourceRevision:source.revision,requestId:'reply-first',markdown:'My reply'});
 indexDraft(f.plugin.app,source,true);f.local.set(draftKey(source),{version:1,markdown:'Still writing'});
 const before=new Map(f.files);f.plugin.settings.onboarding.workspaceRoot='New Noria';
 f.plugin.resolveCalendarNoteSpecAsync=async()=>({path:'New Diary/2026-09-28.md'});
 let items=(await readReplyLibrary(f.plugin)).items;assert.equal(items[0].sourceState,'different-source');assert.equal(items[0].conversations[0].path,saved.path);assert.equal(items[0].draft.markdown,'Still writing');
 f.files.delete(source.path);items=(await readReplyLibrary(f.plugin)).items;assert.equal(items[0].sourceState,'missing');assert.equal(f.files.get(saved.path),before.get(saved.path));assert.equal(f.files.size,1);
});
test('recovery discovers records under old roots without reading unrelated note bodies',async()=>{
 const f=fixture(),source=await f.plugin.api.suggestions.read({date:'2026-09-28'});
 const saved=await f.plugin.api.suggestionReplies.submit({date:source.date,sourcePath:source.path,sourceRevision:source.revision,requestId:'scope-recovery',markdown:'Keep this reply'});
 f.plugin.settings.onboarding.workspaceRoot='New Noria';
 for(let i=0;i<50;i++)f.files.set(`Unrelated/${i}.md`,'Ordinary note body');
 f.reads.length=0;
 const result=await readReplyLibrary(f.plugin);
 assert.equal(result.items[0].conversations[0].path,saved.path);
 assert.ok(f.reads.includes(saved.path));
 assert.ok(f.reads.every(path=>path===saved.path||path===source.path));
});

test('draft-only records stay discoverable without a source; unreadable index is never replaced',async()=>{
 const f=fixture(),source={path:'Gone/2026-09-28.md',date:'2026-09-28'};indexDraft(f.plugin.app,source,true);f.local.set(draftKey(source),{version:1,markdown:'Keep this'});
 assert.equal((await readReplyLibrary(f.plugin)).items[0].draft.markdown,'Keep this');
 f.local.set(DRAFT_INDEX,{unknown:'preserve'});assert.equal((await readReplyLibrary(f.plugin)).draftError,true);assert.throws(()=>indexDraft(f.plugin.app,source,true));assert.deepEqual(f.local.get(DRAFT_INDEX),{unknown:'preserve'});
});
test('damaged conversation is offered as a file, never silently repaired or read as valid history',async()=>{
 const f=fixture(),path='Noria/Conversations/broken.md',raw='<!-- noria:conversation {broken} -->\nKeep my text';f.files.set(path,raw);
 const r=await readReplyLibrary(f.plugin);assert.deepEqual(r.unreadable,[path]);assert.deepEqual(r.items,[]);assert.equal(f.files.get(path),raw);
 const damaged='Other/2026-09-28-建议-aabbccddeeff.md';f.files.set(damaged,'My surviving text');assert.ok((await readReplyLibrary(f.plugin)).unreadable.includes(damaged));assert.equal(f.files.get(damaged),'My surviving text');
});
test('recovery uses the current in-memory draft when its last local save failed',async()=>{
 const f=fixture(),source={path:'Gone/2026-09-28.md',date:'2026-09-28'};
 f.local.set(draftKey(source),{version:1,markdown:'Older persisted text'});
 f.plugin._suggestionReplyDrafts=new Map([[draftKey(source),{snapshot:()=>({source,draft:{version:1,markdown:'Latest unsaved input'},error:'draft-save'})}]]);
 const r=await readReplyLibrary(f.plugin);assert.equal(r.items[0].draft.markdown,'Latest unsaved input');assert.equal(f.local.get(draftKey(source)).markdown,'Older persisted text');
});
