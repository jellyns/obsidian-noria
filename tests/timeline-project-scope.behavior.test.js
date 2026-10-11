const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}},require:()=>({})};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/timeline-workspace.js'),'utf8'),ctx);
const {TimelineWorkspace}=ctx.module.exports;
class Node {
  constructor(){this.children=[];this.options=[];this.dataset={};this.isConnected=true;}
  createEl(tag,config={}){const child=new Node();Object.assign(child,config);this.children.push(child);if(tag==='option')this.options.push(child);return child;}
  createSpan(config){return this.createEl('span',config);}
}
test('project picker preserves an unavailable selected scope and excludes hidden projects',async()=>{
  let applied;
  const view={plugin:{getNoriaLocale:()=> 'zh',createDataService:async()=>({getSnapshot:async()=>({domains:{projects:{items:[{root:'P/A.md',name:'A'},{root:'P/B.md',name:'B',stage:'hidden'}]}}})})}};
  const w=new TimelineWorkspace(view),panel=new Node(),state={projectRoot:'Old.md',expandedProjects:[]};
  const row=w.renderProjectScope(panel,state,next=>applied=next),select=row.children[1];
  await new Promise(r=>setImmediate(r));
  assert.equal(select.value,'Old.md');assert.equal(select.disabled,false);
  assert.deepEqual(select.options.map(o=>o.value),['','Old.md','P/A.md']);
  select.value='P/A.md';select.onchange();assert.equal(applied.projectRoot,'P/A.md');assert.ok(applied.expandedProjects.includes('P/A.md'));assert.equal(w.pendingProjectFit,undefined); // filtering must not change the date window
});
test('a delayed project load never updates a closed picker',async()=>{
  let finish;
  const w=new TimelineWorkspace({plugin:{getNoriaLocale:()=> 'en',createDataService:async()=>({getSnapshot:()=>new Promise(r=>finish=r)})}});
  const row=w.renderProjectScope(new Node(),{projectRoot:'',expandedProjects:[]},()=>{});
  await new Promise(r=>setImmediate(r));row.isConnected=false;finish({domains:{projects:{items:[{root:'A.md',name:'A'}]}}});await new Promise(r=>setImmediate(r));
  assert.equal(row.children[1].options.length,1);
});
test('project focus returns after loading only while no other control has taken focus',async()=>{
 for(const moved of [false,true]){
  const panel=new Node(),body={},elsewhere={},doc={body,activeElement:moved?elsewhere:body};panel.ownerDocument=doc;panel.dataset.pendingFocus='project-scope';
  const w=new TimelineWorkspace({plugin:{getNoriaLocale:()=> 'en',createDataService:async()=>({getSnapshot:async()=>({})})}});
  const row=w.renderProjectScope(panel,{projectRoot:'',expandedProjects:[]},()=>{}),select=row.children[1];let focused=false;select.focus=()=>focused=true;
  await new Promise(r=>setImmediate(r));assert.equal(focused,!moved);assert.equal(panel.dataset.pendingFocus,undefined);
 }
});

test('scope change starts at its heading while an external refresh preserves the reading anchor',()=>{
 const w=new TimelineWorkspace({plugin:{}}),state={scrollTop:180,projectKey:'P/A.md',projectOffset:-12,previousProjectWindow:{startMs:1,endMs:2}};
 let flushed=0;w.backend={host:{isConnected:true},flushWindow:()=>flushed++,captureViewState:()=>state};
 w.rememberHorizontal();assert.equal(w.horizontalState,state);
 w.resetHorizontalScroll=true;w.rememberHorizontal();assert.equal(w.horizontalState.scrollTop,0);assert.equal(w.horizontalState.projectKey,'');assert.equal(w.horizontalState.previousProjectWindow,state.previousProjectWindow);assert.equal(flushed,2);
 const saved=w.horizontalState;w.backend.captureViewState=()=>null;w.rememberHorizontal();assert.equal(w.horizontalState,saved);
});
