const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const entry={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/review-workspace.js'),'utf8'),{module:entry,require:id=>id==='./review-document.js'?require('../src/review-document.js'):id==='./review-center-core.js'?require('../src/review-center-core.js'):{}});
const {ReviewWorkspace}=entry.exports;
function fixture(){
 const w=Object.create(ReviewWorkspace.prototype),state={dirty:true,payload:{format:'markdown',body:'## Review\n\nCurrent writing'},model:{targetKey:'daily:2026-10-06',sectionHeading:'Review',savedPayload:{body:'## Review\n\nSaved'}}};
 const selected={draftId:'old',payload:{format:'markdown',body:'## Review\n\nOlder draft'}},kept={draftId:'current',payload:state.payload};let writes=0;
 Object.assign(w,{content:{},toolbar:{},reference:{setAttribute(){}},renderer:{state:{final:state,support:{mode:'drafts'}},flushReviewRecoveryDraft:async()=>{writes++;},markFinalDirty(){state.dirty=true;}},plugin:{readReviewRecoveryStore:async()=>({entries:{[state.model.targetKey]:[selected,kept]}})},renderDocument(){},update(){}});
 return {w,state,selected,kept,get writes(){return writes;}};
}
test('draft recovery locks input and rejects duplicate activation until current writing is preserved',async()=>{
 const f=fixture();let finish;f.w.renderer.flushReviewRecoveryDraft=()=>new Promise(r=>{finish=r;});
 const pending=f.w.restoreDraft(f.selected);await Promise.resolve();await f.w.restoreDraft(f.selected);
 assert.equal(f.w.content.inert,true);assert.equal(f.state.payload.body,'## Review\n\nCurrent writing');finish();await pending;
 assert.equal(f.state.payload.body,f.selected.payload.body);assert.deepEqual(Array.from(f.state.model.preservedRecoveryDrafts),[f.kept]);assert.equal(f.w.content.inert,false);
});
test('failed preservation keeps current input and permits retry instead of switching drafts',async()=>{
 const f=fixture();f.w.renderer.flushReviewRecoveryDraft=async()=>{throw Error('Storage unavailable');};
 await f.w.restoreDraft(f.selected);assert.equal(f.state.payload.body,'## Review\n\nCurrent writing');assert.equal(f.state.error,'Storage unavailable');assert.equal(f.w.content.inert,false);
 f.w.renderer.flushReviewRecoveryDraft=async()=>{};await f.w.restoreDraft(f.selected);assert.equal(f.state.payload.body,f.selected.payload.body);
});
test('late recovery cannot replace another date or a disposed workspace',async()=>{
 for(const change of [w=>{w.renderer.state.final={payload:{body:'Another date'}};},w=>{w.disposed=true;}]){
  const f=fixture();let finish;f.w.plugin.readReviewRecoveryStore=()=>new Promise(r=>finish=r);
  const pending=f.w.restoreDraft(f.selected);await new Promise(setImmediate);change(f.w);finish({entries:{}});await pending;
  assert.equal(f.state.payload.body,'## Review\n\nCurrent writing');
 }
});
test('recovery waits for the active save before preserving and selecting a draft',async()=>{
 const f=fixture();let finish;f.state.pendingSave=new Promise(r=>finish=r);const pending=f.w.restoreDraft(f.selected);
 await Promise.resolve();assert.equal(f.writes,0);finish();await pending;assert.equal(f.writes,1);assert.equal(f.state.payload.body,f.selected.payload.body);
});
