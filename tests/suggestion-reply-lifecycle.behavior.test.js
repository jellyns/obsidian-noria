const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
const {createReplyDraft,draftKey}=require('../src/suggestion-reply-draft.js');
const {replyCoordinator}=require('../src/suggestion-reply-lifecycle.js');
const {readReplyLibrary}=require('../src/suggestion-reply-library.js');
function fixture(){
 const date='2026-09-28',old='Diary/'+date+'.md',next='Moved/Reading.md',files=new Map([[old,'## 建议\nRead, then walk.\n']]),local=new Map();
 const plugin={settings:{onboarding:{workspaceRoot:'Noria'}},normalizePath:s=>s,resolveCalendarNoteSpecAsync:async()=>({path:old}),loadTextFromVault:async p=>files.get(p)||'',requestNoriaRefresh(){},app:{loadLocalStorage:k=>local.get(k),saveLocalStorage:(k,v)=>local.set(k,structuredClone(v)),vault:{getMarkdownFiles:()=>[...files.keys()].map(path=>({path})),getAbstractFileByPath:p=>files.has(p)?{path:p}:null}},processTextAtVaultPath:async(p,fn)=>{const raw=files.get(p)||'',value=fn(raw);if(value!==raw)files.set(p,value);}};
 plugin.app.fileManager={generateMarkdownLink:(file,_source,subpath)=>`[[${file.path.replace(/\.md$/,'')}${subpath}]]`};
 plugin.api=createPublicApi(plugin);plugin._suggestionReplyDrafts=new Map();
 const model=async()=>{const source=await plugin.api.suggestions.read({date}),draft=createReplyDraft({app:plugin.app,source,getApi:()=>plugin.api});plugin._suggestionReplyDrafts.set(draftKey(source),draft);return draft;};
 const rename=(from=old,to=next)=>{files.set(to,files.get(from));files.delete(from);return replyCoordinator(plugin).rename(from,to);};
 return {plugin,date,old,next,files,local,model,rename};
}
test('known rename keeps conversation ID, filename and snapshots, and resumes the same draft',async()=>{
 const f=fixture(),model=await f.model();model.edit('Keep the walk');const first=await model.save();model.edit('Another thought');const oldId=model.snapshot().draft.requestId;
 const before=f.files.get(first.path).slice(f.files.get(first.path).indexOf('<!-- noria:reply '));
 await f.rename();const record=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next});
 assert.equal(record.id,first.id);assert.equal(record.path,first.path);assert.equal(record.replies.length,1);const start=f.files.get(first.path).indexOf('<!-- noria:reply ');assert.equal(f.files.get(first.path).slice(start,start+before.length),before);
 assert.equal(model.snapshot().source.path,f.next);assert.equal(model.snapshot().draft.requestId,oldId);assert.equal(model.snapshot().stale,false);assert.equal(f.local.get(draftKey({path:f.old,date:f.date})),null);
 assert.equal((await readReplyLibrary(f.plugin)).items[0].sourceState,'relocated');await model.save();assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next})).replies.length,2);
 f.files.set(f.old,'## 建议\nA different note at the old path.');const replacement=await f.plugin.api.suggestions.read({date:f.date});
 const separate=await f.plugin.api.suggestionReplies.submit({date:f.date,sourcePath:f.old,sourceRevision:replacement.revision,requestId:'separate-reply',markdown:'New note reply'});assert.notEqual(separate.id,first.id);assert.notEqual(separate.path,first.path);assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next})).id,first.id);
});
test('successive observed renames follow the final path, including a folder rename',async()=>{
 const f=fixture(),model=await f.model();model.edit('Follow this note');
 const first=f.rename();const last='Final/Reading.md';f.files.set(last,f.files.get(f.next));f.files.delete(f.next);const second=replyCoordinator(f.plugin).rename('Moved','Final');
 await Promise.all([first,second]);assert.equal(model.snapshot().source.path,last);assert.equal(model.snapshot().draft.markdown,'Follow this note');assert.equal((await readReplyLibrary(f.plugin)).items[0].path,last);
});
test('folder rename moves an unloaded draft and survives reconstruction before first reply',async()=>{
 const f=fixture(),model=await f.model();model.edit('Draft only');f.plugin._suggestionReplyDrafts.clear();
 const target='Renamed/2026-09-28.md';f.files.set(target,f.files.get(f.old));f.files.delete(f.old);await replyCoordinator(f.plugin).rename('Diary','Renamed');
 delete f.plugin._suggestionReplyCoordinator;f.plugin.api=createPublicApi(f.plugin);
 const read=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:target});assert.equal(read.exists,false);assert.equal(read.source.originPath,f.old);
 const reopened=createReplyDraft({app:f.plugin.app,source:read.source,getApi:()=>f.plugin.api});assert.equal(reopened.snapshot().draft.markdown,'Draft only');await reopened.save();
 assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:target})).replies.length,1);assert.equal(f.files.has(f.old),false);
});
test('save already in flight finishes once before rename and clears the correct local draft',async()=>{
 const f=fixture(),model=await f.model();model.edit('Exactly once');const request={...model.snapshot().draft};
 let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),write=f.plugin.processTextAtVaultPath;let paused=false;
 f.plugin.processTextAtVaultPath=async(p,fn)=>{if(!paused){paused=true;enter();await gate;}return write(p,fn);};
 const saving=model.save();await entered;const moving=f.rename();release();await saving;await moving;
 const record=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next});assert.equal(record.replies.length,1);assert.equal(model.snapshot().draft.markdown,'');assert.equal(model.snapshot().source.path,f.next);
 const retry=await f.plugin.api.suggestionReplies.submit({date:f.date,sourcePath:f.next,sourceRevision:request.sourceRevision,requestId:request.requestId,markdown:request.markdown});assert.equal(retry.changed,false);assert.equal(retry.replies.length,1);
});
test('a submission queued after rename retains its input, then can be reviewed and saved',async()=>{
 const f=fixture(),model=await f.model();model.edit('Keep my input');const moving=f.rename(),saving=model.save();await moving;await assert.rejects(saving,e=>e.code==='conflict'||e.code==='not-found');
 assert.equal(model.snapshot().draft.markdown,'Keep my input');assert.equal(model.snapshot().source.path,f.next);model.rebase();await model.save();assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next})).replies.length,1);
});
test('destination draft collision preserves both drafts and leaves conversation metadata untouched',async()=>{
 const f=fixture(),model=await f.model();model.edit('Saved');const saved=await model.save();model.edit('Original draft');const before=f.files.get(saved.path),key=draftKey({path:f.next,date:f.date});f.local.set(key,{version:1,markdown:'Other draft',requestId:'different-id'});
 await assert.rejects(f.rename(),e=>e.code==='conflict');assert.equal(f.files.get(saved.path),before);assert.equal(model.snapshot().draft.markdown,'Original draft');assert.equal(f.local.get(key).markdown,'Other draft');
 f.local.set(key,{version:2,payload:'Future draft'});await assert.rejects(replyCoordinator(f.plugin).rename(f.old,f.next),e=>e.code==='conflict');assert.deepEqual(f.local.get(key),{version:2,payload:'Future draft'});assert.equal(f.files.get(saved.path),before);
});
test('failed migration storage retains the original draft for recovery',async()=>{
 const f=fixture(),model=await f.model();model.edit('Do not lose this');const save=f.plugin.app.saveLocalStorage,key=draftKey({path:f.next,date:f.date});f.plugin.app.saveLocalStorage=(k,v)=>{if(k===key)throw Error('storage failed');save(k,v);};
 await assert.rejects(f.rename());assert.equal(f.local.get(draftKey({path:f.old,date:f.date})).markdown,'Do not lose this');assert.equal(model.snapshot().draft.markdown,'Do not lose this');
});
test('native link-update replay is reconciled by conversation ID after plugin reconstruction',async()=>{
 const f=fixture(),model=await f.model();model.edit('Preserve this message');const saved=await model.save(),oldRaw=f.files.get(saved.path);
 await f.rename();f.files.set(saved.path,oldRaw.replace(`[[${f.old.replace('.md','')}#建议]]`,`[[${f.next.replace('.md','')}#建议]]`));
 delete f.plugin._suggestionReplyCoordinator;f.plugin.api=createPublicApi(f.plugin);
 const recovered=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next});assert.equal(recovered.id,saved.id);assert.equal(recovered.replies[0].markdown,'Preserve this message');assert.equal(recovered.source.originPath,f.old);
 assert.equal(require('../src/suggestion-replies.js').parse(f.files.get(saved.path)).meta.sourcePath,f.next);
});

test('manual preview is read-only; confirmation preserves identity and old reply text across reconstruction',async()=>{
 const f=fixture(),model=await f.model();model.edit('Saved before going offline');const saved=await model.save();model.edit('Keep this unfinished thought');
 const record=f.files.get(saved.path),requestId=model.snapshot().draft.requestId;f.files.set('Noria/Conversations/empty.md','');
 f.files.set(f.next,'## 建议\nA revised plan.\n');f.files.delete(f.old);
 const files=[...f.files],local=JSON.stringify([...f.local]),coordinator=replyCoordinator(f.plugin);
 const preview=await coordinator.previewRelink({path:f.old,date:f.date},f.next);
 assert.equal(preview.target.markdown,'A revised plan.');assert.deepEqual([...f.files],files);assert.equal(JSON.stringify([...f.local]),local);
 await coordinator.relink(preview);assert.ok(f.files.get(saved.path).startsWith(record));assert.ok(f.files.get(saved.path).includes('当前来源：[[Moved/Reading#建议]]'));assert.equal(f.files.get(f.next),'## 建议\nA revised plan.\n');assert.equal(f.files.has(f.old),false);
 assert.equal(model.snapshot().draft.requestId,requestId);assert.equal(model.snapshot().stale,true);
 delete f.plugin._suggestionReplyCoordinator;f.plugin._suggestionReplyDrafts.clear();f.plugin.api=createPublicApi(f.plugin);
 const read=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next});assert.equal(read.id,saved.id);assert.equal(read.replies[0].markdown,'Saved before going offline');
 const restored=createReplyDraft({app:f.plugin.app,source:read.source,getApi:()=>f.plugin.api});assert.equal(restored.snapshot().draft.markdown,'Keep this unfinished thought');
 restored.rebase();await restored.save();assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next})).replies.length,2);
});

test('manual confirmation rejects a changed preview, changed draft, or restored original without writing',async()=>{
 const f=fixture(),model=await f.model();model.edit('My draft');f.files.set(f.next,f.files.get(f.old));f.files.delete(f.old);const coordinator=replyCoordinator(f.plugin),source={path:f.old,date:f.date};
 let preview=await coordinator.previewRelink(source,f.next);f.files.set(f.next,'## 建议\nChanged after preview.');
 await assert.rejects(coordinator.relink(preview),e=>e.code==='conflict');assert.equal(model.snapshot().source.path,f.old);
 preview=await coordinator.previewRelink(source,f.next);model.edit('Edited while previewing');await assert.rejects(coordinator.relink(preview),e=>e.code==='conflict');assert.equal(model.snapshot().draft.markdown,'Edited while previewing');
 preview=await coordinator.previewRelink(source,f.next);f.files.set(f.old,'## 建议\nRestored.');const before=JSON.stringify([...f.files]);
 await assert.rejects(coordinator.relink(preview),e=>e.code==='conflict');assert.equal(JSON.stringify([...f.files]),before);assert.equal(model.snapshot().source.path,f.old);
});

test('manual linking targets exactly one date and never moves other conversations sharing the old path',async()=>{
 const f=fixture(),model=await f.model();model.edit('First date');const first=await model.save();
 const date='2026-09-27',source=await f.plugin.api.suggestions.read({date});const second=await f.plugin.api.suggestionReplies.submit({date,sourcePath:f.old,sourceRevision:source.revision,requestId:'another-date-message',markdown:'Another date'}),before=f.files.get(second.path);
 f.files.set(f.next,f.files.get(f.old));f.files.delete(f.old);const coordinator=replyCoordinator(f.plugin);
 await coordinator.relink(await coordinator.previewRelink({path:f.old,date:f.date},f.next));
 assert.equal(f.files.get(second.path),before);assert.equal((await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next})).id,first.id);
});

test('manual linking preserves destination drafts and conversations and rejects a note without Suggestions',async()=>{
 const f=fixture(),model=await f.model();model.edit('Original draft');f.files.set(f.next,'## Other\nNo suggestions.');f.files.delete(f.old);const coordinator=replyCoordinator(f.plugin),source={path:f.old,date:f.date};
 await assert.rejects(coordinator.previewRelink(source,f.next),e=>e.code==='conflict');f.files.set(f.next,'## 建议\nDestination.');
 const key=draftKey({path:f.next,date:f.date});f.local.set(key,{version:1,markdown:'Destination draft',requestId:'another-id',sourceRevision:'old'});
 await assert.rejects(coordinator.previewRelink(source,f.next),e=>e.code==='conflict');assert.equal(f.local.get(key).markdown,'Destination draft');f.local.delete(key);
 f.files.set('Noria/Conversations/collision.md',`<!-- noria:conversation ${JSON.stringify({version:1,id:'another-conversation',sourcePath:f.next,date:f.date})} -->\n\n## 建议交流\n`);
 await assert.rejects(coordinator.previewRelink(source,f.next),e=>e.code==='conflict');assert.equal(model.snapshot().draft.markdown,'Original draft');
});

test('manual linking restores an unloaded draft without a conversation and preserves unknown original data',async()=>{
 const f=fixture(),model=await f.model();model.edit('Unsent draft');f.plugin._suggestionReplyDrafts.clear();f.files.set(f.next,f.files.get(f.old));f.files.delete(f.old);const coordinator=replyCoordinator(f.plugin),source={path:f.old,date:f.date},key=draftKey(source),draft=f.local.get(key);
 f.local.set(key,{version:2,payload:'Unknown future shape'});await assert.rejects(coordinator.previewRelink(source,f.next),e=>e.code==='conflict');assert.equal(f.local.get(key).version,2);f.local.set(key,draft);
 await coordinator.relink(await coordinator.previewRelink(source,f.next));const read=await f.plugin.api.suggestionReplies.read({date:f.date,sourcePath:f.next});assert.equal(read.exists,false);assert.equal(read.source.originPath,f.old);
 assert.equal(createReplyDraft({app:f.plugin.app,source:read.source,getApi:()=>f.plugin.api}).snapshot().draft.markdown,'Unsent draft');
});
