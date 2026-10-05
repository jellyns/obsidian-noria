const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/runtime/views/dashboard/home/sections/trends-and-stats/view.js'),'utf8');
const start=source.indexOf('async function renderBlockIntoSlot('),end=source.indexOf('\nif (renderMode === "range")',start);
function harness(runBlock){
  const old={old:true},slot={firstChild:old,style:{minHeight:'1px'},getBoundingClientRect:()=>({height:320}),createDiv(){const stage={style:{},remove(){this.removed=true;}};this.stage=stage;return stage;},replaceChildren(stage){this.firstChild=stage;}};
  const context={renderToken:1,trendsDisposed:false,runBlock,createTrendsBlockCleanupRegistry:()=>({cleanup(){slot.cleaned=true;}}),runTrendsBlockCleanup(){},clearElement(){}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return {slot,old,context,render:()=>context.renderBlockIntoSlot('daily-state',slot,{},null,1)};
}
test('statistics replacement releases transient height after success',async()=>{
  let release;const h=harness(()=>new Promise(r=>release=r));const pending=h.render();
  assert.equal(h.slot.style.minHeight,'320px');assert.equal(h.slot.firstChild,h.old);
  release();await pending;assert.equal(h.slot.style.minHeight,'1px');assert.equal(h.slot.firstChild,h.slot.stage);
});
test('failed statistics replacement retains old content and releases transient height',async()=>{
  const h=harness(async()=>{throw Error('read failed');});await assert.rejects(h.render(),/read failed/);
  assert.equal(h.slot.firstChild,h.old);assert.equal(h.slot.style.minHeight,'1px');assert.equal(h.slot.stage.removed,true);assert.equal(h.slot.cleaned,true);
});
test('outdated render cannot release a newer render height lock',async()=>{
  let release;const h=harness(()=>new Promise(r=>release=r));const pending=h.render();h.context.renderToken=2;h.slot.style.minHeight='480px';
  release();await pending;assert.equal(h.slot.style.minHeight,'480px');assert.equal(h.slot.firstChild,h.old);assert.equal(h.slot.stage.removed,true);
});
