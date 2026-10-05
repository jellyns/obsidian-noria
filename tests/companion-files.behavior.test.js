"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {preview,apply,rememberCreated,changedBlock,syncUnchanged,keepCurrent,restore,schedule,cancel}=require('../src/companion-files.js');
function fixture(){
 const disk=new Map(),notes=new Map(),writes=[];let generation='one';
 const paths={inboxQueue:'Noria/Queue.base',inboxWorkflow:'Noria/Workflow.md'};
 const adapter={exists:async p=>disk.has(p)||notes.has(p),read:async p=>disk.get(p)??notes.get(p),mkdir:async p=>disk.set(p,null),write:async(p,c)=>{disk.set(p,c);writes.push(p);}};
 const vault={configDir:'.obsidian',adapter,getAbstractFileByPath:p=>notes.has(p)?{path:p,extension:p.split('.').pop()}:null,read:async f=>notes.get(f.path),create:async(p,c)=>{if(notes.has(p))throw Error('exists');notes.set(p,c);return {path:p};},process:async(f,fn)=>notes.set(f.path,fn(notes.get(f.path)))};
 const plugin={app:{vault},manifest:{id:'noria'},getNoriaLocale:()=> 'zh',getManagedPath:id=>paths[id],getInboxWorkflowConfig:()=>({generation}),getManagedNoteSeed:id=>`${id}: ${generation}\n`,ensureVaultParent:async()=>{}};
 return {plugin,disk,notes,writes,paths,next:()=>generation='two'};
}
const queue=async f=>(await preview(f.plugin))[0];
test('unknown custom files are kept unless explicitly selected; backup matches original',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'my columns');const item=await queue(f);assert.equal(item.status,'unknown');
 await assert.rejects(apply(f.plugin,item),/差异/);assert.equal(f.notes.get(item.path),'my columns');assert.equal(f.writes.length,0);
 const result=await apply(f.plugin,item,{replaceCustom:true});assert.equal(f.disk.get(result.backup),'my columns');assert.equal(f.notes.get(item.path),item.content);
 const count=f.writes.length;await apply(f.plugin,await queue(f));assert.equal(f.writes.length,count);
});
test('new files gain a baseline; unchanged defaults update while edits are protected',async()=>{
 const f=fixture();await apply(f.plugin,await queue(f));f.next();assert.equal((await queue(f)).status,'safe');
 await apply(f.plugin,await queue(f));f.notes.set(f.paths.inboxQueue,'custom');assert.equal((await queue(f)).status,'custom');
});
test('matching legacy defaults register without modifying content or creating a backup',async()=>{
 const f=fixture(),p=f.paths.inboxQueue;f.notes.set(p,f.plugin.getManagedNoteSeed('inboxQueue'));const item=await queue(f);assert.equal(item.status,'current');assert.equal(item.tracked,false);
 await apply(f.plugin,item);assert.equal((await queue(f)).tracked,true);assert.equal([...f.disk.keys()].some(p=>p.endsWith('.txt')),false);
});
test('edits and config changes after preview reject the update',async()=>{
 for(const change of [f=>f.notes.set(f.paths.inboxQueue,'newer edit'),f=>f.next(),f=>f.paths.inboxQueue='Elsewhere/Queue.base']){
  const f=fixture();f.notes.set(f.paths.inboxQueue,'old');const item=await queue(f);change(f);await assert.rejects(apply(f.plugin,item,{replaceCustom:true}),/变化/);assert.ok(![...f.notes.values()].includes(item.content));
 }
});
test('a concurrent edit during backup is checked inside vault.process',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'old');const item=await queue(f),write=f.plugin.app.vault.adapter.write;
 f.plugin.app.vault.adapter.write=async(p,c)=>{await write(p,c);if(p.endsWith('.txt'))f.notes.set(item.path,'concurrent');};
 await assert.rejects(apply(f.plugin,item,{replaceCustom:true}),/变化/);assert.equal(f.notes.get(item.path),'concurrent');
});
test('backup failure never changes the file',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'old');const item=await queue(f);
 f.plugin.app.vault.adapter.write=async()=>{throw Error('disk full');};await assert.rejects(apply(f.plugin,item,{replaceCustom:true}),/disk full/);assert.equal(f.notes.get(item.path),'old');
});
test('tracking failure reports that content was saved and retains recovery backup',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'old');const item=await queue(f),write=f.plugin.app.vault.adapter.write;
 f.plugin.app.vault.adapter.write=async(p,c)=>{if(p.endsWith('state.json'))throw Error('disk full');return write(p,c);};
 await assert.rejects(apply(f.plugin,item,{replaceCustom:true}),/文件已更新/);assert.equal(f.notes.get(item.path),item.content);assert.ok([...f.disk.values()].includes('old'));
});
test('concurrent file updates preserve both baseline records',async()=>{
 const f=fixture();await Promise.all((await preview(f.plugin)).map(item=>apply(f.plugin,item)));assert.ok((await preview(f.plugin)).every(item=>item.tracked));
});
test('new note generation can register the exact baseline and refuses stale paths',async()=>{
 const f=fixture(),content=f.plugin.getManagedNoteSeed('inboxQueue');f.notes.set(f.paths.inboxQueue,content);
 await rememberCreated(f.plugin,'inboxQueue',f.paths.inboxQueue,content);assert.equal((await queue(f)).tracked,true);
 f.paths.inboxQueue='Other/Queue.base';f.notes.set(f.paths.inboxQueue,'edited');assert.equal((await queue(f)).status,'unknown');
});
test('path traversal and corrupt metadata fail closed',async()=>{
 const f=fixture();f.paths.inboxQueue='../outside.base';await assert.rejects(preview(f.plugin),/路径/);
 f.paths.inboxQueue='Noria/Queue.base';f.disk.set('.obsidian/plugins/noria/cache/companion-files/state.json','bad json');await assert.rejects(preview(f.plugin));assert.equal(f.notes.size,0);
});
test('changed block preserves all differences without quadratic comparison',()=>{
 assert.deepEqual(changedBlock('a\nb\nc','a\nx\nc'),{line:2,before:'b',after:'x'});
 assert.deepEqual(changedBlock('a\nc','a\nb\nc'),{line:2,before:'',after:'b'});
});


test('automatic sync registers identical defaults, updates unchanged files, and is idempotent',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,f.plugin.getManagedNoteSeed('inboxQueue'));
 await syncUnchanged(f.plugin);assert.equal((await queue(f)).tracked,true);assert.equal(f.notes.has(f.paths.inboxWorkflow),false);
 f.next();await syncUnchanged(f.plugin);assert.equal(f.notes.get(f.paths.inboxQueue),f.plugin.getManagedNoteSeed('inboxQueue'));
 const count=f.writes.length;await syncUnchanged(f.plugin);assert.equal(f.writes.length,count);
});
test('automatic sync leaves custom, unknown and deleted files intact',async()=>{
 const f=fixture();await apply(f.plugin,await queue(f));f.notes.set(f.paths.inboxQueue,'my custom view');f.notes.set(f.paths.inboxWorkflow,'my guide');f.next();
 assert.deepEqual(await syncUnchanged(f.plugin),[]);assert.equal(f.notes.get(f.paths.inboxQueue),'my custom view');assert.equal(f.notes.get(f.paths.inboxWorkflow),'my guide');
 f.notes.delete(f.paths.inboxQueue);await syncUnchanged(f.plugin);assert.equal(f.notes.has(f.paths.inboxQueue),false);
});
test('keeping a default persists across future updates until the user adopts the new version',async()=>{
 const f=fixture();await apply(f.plugin,await queue(f));await keepCurrent(f.plugin,await queue(f));f.next();
 await syncUnchanged(f.plugin);assert.equal(f.notes.get(f.paths.inboxQueue),'inboxQueue: one\n');
 await apply(f.plugin,await queue(f),{replaceCustom:true});assert.equal((await queue(f)).keep,false);
});
test('restore recovers the exact original and is not undone by automatic maintenance',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'custom columns');await apply(f.plugin,await queue(f),{replaceCustom:true});
 const item=await queue(f);assert.equal(item.canRestore,true);await restore(f.plugin,item);assert.equal(f.notes.get(item.path),'custom columns');assert.equal((await queue(f)).keep,true);
 f.next();await syncUnchanged(f.plugin);assert.equal(f.notes.get(item.path),'custom columns');assert.equal((await queue(f)).canRestore,false);
});
test('restore refuses later edits and tampered backup content',async()=>{
 for(const tamper of ['note','backup']){
 const f=fixture();f.notes.set(f.paths.inboxQueue,'original');await apply(f.plugin,await queue(f),{replaceCustom:true});const item=await queue(f);
 if(tamper==='note')f.notes.set(item.path,'later edit');else f.disk.set(item.backup,'bad backup');
 await assert.rejects(restore(f.plugin,item));assert.equal(f.notes.get(item.path),tamper==='note'?'later edit':item.content);
 }
});
test('a failed restore write preserves the keep choice and current content',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'original');await apply(f.plugin,await queue(f),{replaceCustom:true});const item=await queue(f);
 f.plugin.app.vault.process=async()=>{throw Error('disk full');};await assert.rejects(restore(f.plugin,item),/disk full/);
 assert.equal(f.notes.get(item.path),item.content);assert.equal((await queue(f)).keep,true);
});
test('an old path never offers a backup for the newly configured file',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'original');await apply(f.plugin,await queue(f),{replaceCustom:true});f.paths.inboxQueue='Other/Queue.base';
 f.notes.set(f.paths.inboxQueue,'other');assert.equal((await queue(f)).backup,null);assert.equal((await queue(f)).canRestore,false);
});
test('background failure keeps originals and is returned without throwing a user prompt',async()=>{
 const f=fixture();await apply(f.plugin,await queue(f));f.next();f.plugin.app.vault.adapter.write=async()=>{throw Error('disk full');};
 const result=await syncUnchanged(f.plugin);assert.match(result[0].error,/disk full/);assert.equal(f.notes.get(f.paths.inboxQueue),'inboxQueue: one\n');
});
test('settings maintenance coalesces changes and cancels on unload',async()=>{
 const f=fixture();f.plugin._companionReady=true;await apply(f.plugin,await queue(f));f.next();schedule(f.plugin);const timer=f.plugin._companionTimer;schedule(f.plugin);assert.equal(f.plugin._companionTimer,timer);
 cancel(f.plugin);await new Promise(r=>setTimeout(r,850));assert.equal(f.notes.get(f.paths.inboxQueue),'inboxQueue: one\n');
 f.plugin._companionReady=true;f.plugin._companionSignature=null;schedule(f.plugin);await new Promise(r=>setTimeout(r,850));await f.plugin._companionPending;assert.equal(f.notes.get(f.paths.inboxQueue),'inboxQueue: two\n');
});
test('plugin unload during backup cannot write an old preview',async()=>{
 const f=fixture();f.notes.set(f.paths.inboxQueue,'original');const item=await queue(f),write=f.plugin.app.vault.adapter.write;
 f.plugin.app.vault.adapter.write=async(p,c)=>{await write(p,c);if(p.endsWith('.txt'))f.plugin._noriaPluginDisposed=true;};
 await assert.rejects(apply(f.plugin,item,{replaceCustom:true}),/停止/);assert.equal(f.notes.get(item.path),'original');
});
