const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DayClock}=require('../src/day-clock.js');
test('day clock resumes each view independently, retries drafts, handles clock reversal and unload',async()=>{
  let day='2026-09-23',draft=true;const calls=[],clock=new DayClock(()=>day);
  try{
    const stop=clock.watch(d=>{calls.push('home:'+d);return !draft;});clock.watch(d=>calls.push('countdown:'+d));
    await clock.check();assert.equal(calls.length,0);
    day='2026-09-25';await clock.check();assert.deepEqual(calls,['home:2026-09-25','countdown:2026-09-25']);
    draft=false;await clock.check();assert.equal(calls.at(-1),'home:2026-09-25');assert.equal(calls.length,3);
    await clock.check();assert.equal(calls.length,3);
    stop();day='2026-09-24';await clock.check();assert.equal(calls.at(-1),'countdown:2026-09-24');
    clock.dispose();day='2026-09-26';await clock.check();assert.equal(calls.length,4);
  }finally{clock.dispose();}
});
test('focus and visibility recovery are removed with the last window subscriber',async()=>{
  let day='2026-09-23',calls=0;const win=new EventTarget();win.document=new EventTarget();const clock=new DayClock(()=>day);
  try{
    const stop=clock.watch(()=>calls++,win);day='2026-09-24';win.dispatchEvent(new Event('focus'));await clock.check();assert.equal(calls,1);
    day='2026-09-25';win.document.dispatchEvent(new Event('visibilitychange'));await clock.check();assert.equal(calls,2);
    stop();day='2026-09-26';win.dispatchEvent(new Event('focus'));await clock.check();assert.equal(calls,2);assert.equal(clock.windows.size,0);
  }finally{clock.dispose();}
});
test('a slow day refresh is not duplicated and a later day is not lost',async()=>{
  let day='2026-09-23',release,calls=0;const clock=new DayClock(()=>day);
  try{
    clock.watch(()=>{calls++;return new Promise(r=>release=r);});day='2026-09-24';const pending=clock.check();day='2026-09-25';await clock.check();assert.equal(calls,1);
    release(true);await pending;const again=clock.check();assert.equal(calls,2);release(true);await again;
  }finally{clock.dispose();}
});
test('day refresh preserves text entered while initial Home loading finishes and never refreshes the diary editor',async()=>{
  const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/workbench.js'),'utf8'),{module:mod,require:()=>({})});
  const w=Object.create(mod.exports.NoriaWorkbench.prototype);let resolveLoad,empty=0,renders=0,modal=null;
  const input={value:'',defaultValue:''},doc={querySelector:()=>modal,activeElement:null};
  const panel={ownerDocument:doc,querySelector:()=>null,querySelectorAll:()=>[input,{type:'checkbox',value:'on',defaultValue:''}],contains:()=>false,scrollTop:87,empty:()=>empty++};
  w.pages=new Map([['home',{panel}]]);w.loads=new Map([['home',new Promise(r=>resolveLoad=r)]]);w.plugin={runNoriaView:async()=>renders++};w.diary={refresh:()=>assert.fail('No diary refresh')};
  const pending=w.refreshForDay();input.value='Unsent project action';resolveLoad();assert.equal(await pending,false);assert.equal(empty,0);
  input.value='';modal={};assert.equal(await w.refreshForDay(),false);assert.equal(renders,0);
  modal=null;assert.equal(await w.refreshForDay(),true);assert.equal(renders,1);assert.equal(panel.scrollTop,87);
});
