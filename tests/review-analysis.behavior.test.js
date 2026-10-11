const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
const start=source.indexOf('class NoriaReviewCenterRenderer'),end=source.indexOf('class NoriaSettingTab',start);
const Renderer=vm.runInNewContext(source.slice(start,end)+'\nNoriaReviewCenterRenderer',{reviewDocument:require('../src/review-document.js')});
function node(tag='div',options={}){
 const el={tag,text:options.text||'',cls:options.cls||'',children:[],attrs:{},events:{},disabled:false,
  setAttribute(key,value){this.attrs[key]=value;},addEventListener(type,fn){this.events[type]=fn;},focus(){this.focused=true;}};
 el.createEl=(tag,options)=>{const child=node(tag,options);el.children.push(child);return child;};
 el.createDiv=options=>el.createEl('div',options);el.createSpan=options=>el.createEl('span',options);return el;
}
function all(el){return [el,...el.children.flatMap(all)];}
function fixture(){
 const r=Object.create(Renderer.prototype),artifact={generated:true,stale:true,path:'Diary/week-review.md',text:'## Observation\nKeep this proposal.',parsed:{meta:{evidence_hash:'old'}}};
 let renderCount=0,captures=0;const calls=[];
 Object.assign(r,{selection:{mode:'weekly',anchorDate:'2026-10-06',generation:1},generationGate:{isCurrent:g=>g===r.selection.generation},hostEl:{},
  state:{support:{mode:'analysis',status:'ready',value:artifact,evidence:{evidenceHash:'cached-old'}},final:{payload:{body:'My unsaved reflection.'}}},
  plugin:{t:key=>key,prepareReviewAnalysis:async(...args)=>{calls.push(args);return {ok:true,evidence:{evidenceHash:'new'}};},getReviewAnalysisArtifact:async()=>artifact},
  reviewWorkspace:{captureEditor(){captures++;},renderMarkdown(){}},renderFinalFirst(){renderCount++;},resetSupportEvidenceCache(){}});
 return {r,artifact,calls,get renders(){return renderCount;},get captures(){return captures;}};
}
test('analysis keeps stale content visible and provides a material preparation action',()=>{
 const f=fixture(),parent=node();f.r.renderAnalysisSupport(parent,f.artifact);
 const elements=all(parent);
 assert.ok(elements.some(el=>el.text==='review.analysis.changed'));
 assert.ok(elements.some(el=>el.tag==='button'&&el.text==='review.analysis.prepare'));
 assert.ok(elements.some(el=>el.tag==='summary'&&el.text==='Observation'));
 assert.ok(elements.some(el=>el.tag==='button'&&el.text==='review.document.appendSection'));
 const current=node();f.r.renderAnalysisSupport(current,{...f.artifact,stale:false});
 assert.equal(all(current).some(el=>el.text==='review.analysis.changed'),false);
});

test('a section action appends once and leaves existing reflection intact',()=>{
 const f=fixture(),parent=node();f.r.markFinalDirty=()=>{};f.r.renderAnalysisSupport(parent,f.artifact);
 const append=all(parent).find(el=>el.tag==='button'&&el.text==='review.document.appendSection');
 const event={preventDefault(){},stopPropagation(){}};append.events.click(event);append.events.click(event);
 assert.equal(append.disabled,true);assert.equal(f.r.state.final.payload.body,'My unsaved reflection.\n\n### Observation\nKeep this proposal.');
 assert.equal(f.captures,1);
});

test('refreshing a saved review restores its open analysis without reopening an old period',async()=>{
 const f=fixture(),opened=[];
 let finish;
 f.r.render=()=>{f.r.selection.generation++;f.r.state.support={mode:'',status:'idle'};return new Promise(resolve=>finish=resolve);};
 f.r.setSupportMode=async mode=>{opened.push(mode);f.r.state.support={mode,status:'ready'};};
 let pending=f.r.refreshReviewSupport();finish();await pending;
 assert.deepEqual(opened,['analysis']);
 pending=f.r.refreshReviewSupport();f.r.selection.generation++;finish();await pending;
 assert.deepEqual(opened,['analysis']);
});
test('preparation uses fresh material, preserves the editor and does not start twice',async()=>{
 const f=fixture(),button=node('button');let resolve;
 f.r.plugin.prepareReviewAnalysis=(...args)=>{f.calls.push(args);return new Promise(done=>resolve=done);};
 const pending=f.r.prepareAnalysisSupport(button);await f.r.prepareAnalysisSupport(button);
 assert.equal(button.disabled,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0][1],null);
 assert.equal(f.calls[0][2].notify,false);
 resolve({ok:true,evidence:{evidenceHash:'new'}});await pending;
 assert.equal(f.r.state.final.payload.body,'My unsaved reflection.');assert.equal(f.r.state.support.value,f.artifact);
 assert.equal(f.r.state.support.prepared,true);assert.ok(f.captures>=1);assert.equal(button.disabled,false);
});
test('preparation failure retains analysis and draft, and late completion cannot replace a new period',async()=>{
 const f=fixture(),button=node('button');f.r.plugin.prepareReviewAnalysis=async()=>{throw Error('Cannot save material');};
 await f.r.prepareAnalysisSupport(button);
 assert.equal(f.r.state.support.status,'ready');assert.equal(f.r.state.support.value,f.artifact);
 assert.equal(f.r.state.support.prepareError,'Cannot save material');assert.equal(f.r.state.final.payload.body,'My unsaved reflection.');
 let resolve;f.r.plugin.prepareReviewAnalysis=()=>new Promise(done=>resolve=done);
 const pending=f.r.prepareAnalysisSupport(button),next={mode:'analysis',status:'ready',value:{text:'Other period'}};
 f.r.selection={...f.r.selection,generation:2};f.r.state.support=next;
 resolve({ok:true,evidence:{evidenceHash:'new'}});await pending;
 assert.equal(f.r.state.support,next);assert.equal(f.r.state.final.payload.body,'My unsaved reflection.');
});
