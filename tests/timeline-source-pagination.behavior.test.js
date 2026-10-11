const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ContinuousTimeline}=require('../src/timeline-continuous.js');
const ctx={module:{exports:{}},require:id=>id==='./timeline-continuous.js'?{ContinuousTimeline}:['./timeline-stream-model.js','./runtime/views/task-timeline/time-window.js'].includes(id)?require('../src/'+id.slice(2)):{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/timeline-workspace.js'),'utf8'),ctx);
test('horizontal window changes leave the vertical reader, anchor and scroll untouched',()=>{
  const windows=require('../src/runtime/views/task-timeline/time-window.js');
  const t=new ctx.module.exports.TimelineWorkspace({plugin:{}}),reader={id:1},anchor={date:'2026-09-20',offset:-20};t.reader=reader;t.savedAnchor=anchor;t.scroll=400;
  const focus=new Date(2026,8,20,12).getTime();let selected=windows.at(focus,{amount:1,unit:'day'});
  t.backend={getWindow:()=>selected,getFocus:()=>focus,setWindow:value=>{selected=value;}};
  t.setScale({amount:1,unit:'week'});
  assert.equal(selected.scale.unit,'week');assert.ok(selected.startMs<=focus&&selected.endMs>focus);
  assert.equal(t.reader,reader);assert.equal(t.savedAnchor,anchor);assert.equal(t.scroll,400);
});
test('a cancelled initialization cannot dispose the newer vertical reader',async()=>{
  const t=new ctx.module.exports.TimelineWorkspace({plugin:{}});let reject,disposed=false;
  t.reader={dispose(){}};t.readerReady=new Promise((_,r)=>reject=r);const old=t.ensureReader();
  const fresh={dispose(){disposed=true;}};t.reader=fresh;t.readerReady=Promise.resolve(fresh);const current=t.ensureReader();
  const error=new Error('cancelled');error.name='AbortError';reject(error);
  await assert.rejects(old,{name:'AbortError'});assert.equal(await current,fresh);assert.equal(t.reader,fresh);assert.equal(disposed,false);
});
test('confirmed task writes update emphasis and invalidate data before rebuilding the view',async()=>{
  const order=[],t=new ctx.module.exports.TimelineWorkspace({plugin:{createDataService:async()=>({invalidate:()=>order.push('data')}),invalidateTaskSnapshots:()=>order.push('snapshot')},refreshTimelineRuntimeFromChrome:async()=>order.push('render')});
  t.remember=()=>order.push('anchor');await t.taskSaved({classList:{toggle:(_,done)=>order.push(done?'done':'open')}},{completed:true});
  assert.deepEqual(order,['done','anchor','data','snapshot','render']);
});
test('stream refresh restores the corresponding control without scrolling or stealing outside focus',()=>{
  const focused=[],body={},first={dataset:{tlFocus:'first'}},old={dataset:{tlFocus:'task'}},next={dataset:{tlFocus:'next'}},doc={body,activeElement:old};
  const host={ownerDocument:doc,isConnected:true,contains:e=>[first,old,next].includes(e),querySelectorAll:()=>[first,old,next],focus:o=>focused.push(['host',o])};
  const t=new ctx.module.exports.TimelineWorkspace({plugin:{}});t.stream=host;t.rememberFocus();
  const replacement={dataset:{tlFocus:'task'},focus:o=>focused.push(['task',o])};host.querySelectorAll=()=>[replacement];doc.activeElement=body;t.restoreFocus();
  assert.equal(focused[0][0],'task');assert.equal(focused[0][1].preventScroll,true);
  t.pendingFocus={key:'task'};doc.activeElement={dialog:true};t.restoreFocus();assert.equal(focused.length,1);assert.equal(t.pendingFocus,null);
});
test('filtered-out controls move keyboard focus to a surviving neighbor',()=>{
  let focused=false;const body={},target={dataset:{tlFocus:'next'},focus:()=>{focused=true;}},t=new ctx.module.exports.TimelineWorkspace({plugin:{}});
  t.stream={isConnected:true,ownerDocument:{activeElement:body,body},contains:()=>false,querySelectorAll:()=>[target]};t.pendingFocus={key:'removed',next:'next',previous:'before'};t.restoreFocus();assert.equal(focused,true);
});
