const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"../src/quick-capture.js"),"utf8");
function makeComposer(append){
  const context={module:{exports:{}},require:id=>id==="obsidian"?{}:id.includes("review-center")?{createReviewDraftId:()=>"next"}:{setActionIcon(){}},clearTimeout};
  vm.runInNewContext(source,context);
  const c=Object.create(context.module.exports.QuickCaptureComposer.prototype);
  Object.assign(c,{input:{value:"A thought\nSecond line",focus(){}},submit:{},feedback:{setText(text){this.text=text;}},ready:Promise.resolve(),date:"2001-02-12",draftId:"draft",targetKey:"capture:daily:2001-02-12",preserve:async()=>{},plugin:{appendHomeQuickCapture:append,clearReviewRecoveryEntry:async()=>{},requestNoriaRefresh(){},t:key=>key}});
  return c;
}
test("capture preserves unsaved input after a write error",async()=>{
  const c=makeComposer(async()=>{throw Error("disk unavailable");});
  await c.save();assert.equal(c.input.value,"A thought\nSecond line");assert.equal(c.busy,false);assert.equal(c.input.readOnly,false);assert.equal(c.feedback.text,"disk unavailable");
});
test("capture only appends once while pending and after a successful write with refresh failure",async()=>{
  let count=0,release;const pending=new Promise(r=>{release=r;});
  const c=makeComposer(async request=>{count++;assert.equal(request.date,"2001-02-12");await pending;return {ok:true};});
  c.onSaved=async()=>{throw Error("refresh failed");};
  const a=c.save();await c.save();release();await a;await c.save();
  assert.equal(count,1);assert.equal(c.input.value,"");assert.equal(c.feedback.text,"refresh failed");
});
test("a conflicting diary draft blocks capture and leaves its input intact",async()=>{
  let count=0;const c=makeComposer(async()=>{count++;});c.beforeSave=async()=>false;
  await c.save();assert.equal(count,0);assert.equal(c.input.value,"A thought\nSecond line");assert.equal(c.busy,false);
});

test("closing during a save waits before preserving the final input",async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const c=makeComposer(async()=>{await pending;return {ok:true};});
  c.root={remove(){}};const bodies=[];c.preserve=async()=>{bodies.push(c.input.value);};
  const saving=c.save();await new Promise(r=>setImmediate(r));
  const disposal=c.dispose();release();await saving;await disposal;
  assert.equal(c.disposed,true);assert.equal(bodies.at(-1),"");
  assert.equal(bodies.filter(Boolean).length,1);
});
test("closing after a failed save keeps its draft available for recovery",async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const c=makeComposer(async()=>{await pending;throw Error("offline");});
  c.root={remove(){}};const bodies=[];c.preserve=async()=>{bodies.push(c.input.value);};
  const saving=c.save();await new Promise(r=>setImmediate(r));
  const disposal=c.dispose();release();await saving;await disposal;
  assert.equal(bodies.at(-1),"A thought\nSecond line");
  assert.equal(c.input.value,"A thought\nSecond line");
});
