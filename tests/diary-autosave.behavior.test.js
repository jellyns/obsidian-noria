const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = name => fs.readFileSync(path.join(__dirname,"../src",name),"utf8");
function loadDiary() {
  const module = {exports:{}};
  vm.runInNewContext(source("diary-workspace.js"), {module,setTimeout,clearTimeout,
    require:id=>id==="./diary-document.js"?require("../src/diary-document.js"):{} });
  return module.exports.DiaryWorkspace;
}
function loadReview() {
  const text=source("main.js"),module={exports:{}};
  vm.runInNewContext(text.slice(text.indexOf("class NoriaReviewCenterRenderer"),text.indexOf("class NoriaSettingTab"))+"\nmodule.exports=NoriaReviewCenterRenderer;", {
    module,setTimeout,clearTimeout,reviewDocument:require("../src/review-document.js"),
    reviewCenterCore:require("../src/review-center-core.js")
  });
  return module.exports;
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function diaryFixture() {
  const d=Object.create(loadDiary().prototype),writes=[];
  d.session={model:{body:"Before",raw:"Before",prefix:"",path:"one.md",exists:true,selection:{mode:"daily",period:"2098-01-01"}},body:"First edit",dirty:true,editing:true};
  d.capture=()=>{};d.root={};d.feedback={setText(){},setAttribute(){},removeAttribute(){}};
  d.plugin={app:{vault:{getAbstractFileByPath:path=>({path})}}};d.t=k=>k;
  d.editor={isComposing:()=>false,setFile(){},dispose(){assert.fail("saving must keep the mounted editor");}};
  d.renderContent=()=>assert.fail("saving must not remount the document");
  d.renderActions=()=>{};
  d.store={preserve:async()=>{},save:async(model,body)=>{writes.push(body);return {...model,raw:body,body,recoveryCleared:true};}};
  return {d,writes};
}
test("diary save keeps the editor and drains text entered during an earlier write",async()=>{
  const {d,writes}=diaryFixture(),entered=deferred(),gate=deferred(),save=d.store.save;
  d.store.save=async(model,body)=>{if(!writes.length){entered.resolve();await gate.promise;}return save(model,body);};
  const editor=d.editor,pending=d.save();await entered.promise;
  d.session.body="First edit plus later typing";d.session.dirty=true;
  gate.resolve();await pending;
  assert.deepEqual(writes,["First edit","First edit plus later typing"]);
  assert.equal(d.session.model.body,d.session.body);
  assert.equal(d.session.dirty,false);assert.equal(d.session.editing,true);assert.equal(d.editor,editor);
  assert.notEqual(d.root.inert,true);
});
test("leaving a dirty diary flushes to the source while browsing a template does not create it",async()=>{
  const {d,writes}=diaryFixture();await d.flush();assert.deepEqual(writes,["First edit"]);
  d.session.model.exists=false;d.session.model.body=d.session.body="## Notes\n\n## Plan\n\n";d.session.dirty=false;
  await d.flush();assert.equal(writes.length,1);
});
test("a recovered diary remains a recoverable candidate until edited or explicitly accepted",async()=>{
  const {d,writes}=diaryFixture();d.session.needsAdoption=true;
  await d.flush();assert.equal(writes.length,0);assert.equal(d.session.body,"First edit");
  await d.save({acceptRecovery:true});assert.deepEqual(writes,["First edit"]);
});
test("review save preserves late typing and records the exact submitted baseline",async()=>{
  const R=loadReview(),r=Object.create(R.prototype),entered=deferred(),gate=deferred(),writes=[];
  r.hostEl={};r.state={final:{model:{sectionHeading:"Review",targetKey:"daily:2098-01-01",targetPath:"one.md",savedPayload:{format:"markdown",body:"## Review\n\nBefore"}},payload:{format:"markdown",body:"## Review\n\nFirst"},dirty:true,saveState:"dirty",error:""}};
  r.renderFinalFirst=()=>{};r.syncFinalSaveUi=()=>{};
  r.reviewWorkspace={captureEditor(){},editor:{isComposing:()=>false},afterSave(){assert.fail("autosave must not leave editing");}};
  r.plugin={t:k=>k,queueReviewRecoveryEntry:async()=>{},saveReviewFinal:async(model,payload)=>{
    writes.push({base:model.savedPayload.body,body:payload.body});if(writes.length===1){entered.resolve();await gate.promise;}
    return {ok:true,savedPayload:payload,baseFingerprint:String(writes.length)};
  }};
  const pending=r.saveReviewFinal();await entered.promise;
  r.state.final.payload.body="## Review\n\nFirst plus later typing";r.state.final.dirty=true;
  gate.resolve();await pending;
  assert.deepEqual(writes,[{base:"## Review\n\nBefore",body:"## Review\n\nFirst"},{base:"## Review\n\nFirst",body:"## Review\n\nFirst plus later typing"}]);
  assert.equal(r.state.final.model.savedPayload.body,r.state.final.payload.body);assert.equal(r.state.final.dirty,false);
});
