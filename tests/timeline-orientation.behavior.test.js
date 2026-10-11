const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={module:{exports:{}},require:()=>({})};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/timeline-workspace.js'),'utf8'),context);
const {TimelineWorkspace}=context.module.exports;
test('orientation switches leave capture only after saving, and expose the chosen timeline',async()=>{
  for(const orientation of ['vertical','horizontal']){
    const calls=[],settings={orientation},view={plugin:{getNoriaLocale:()=> 'zh',settings:{timelineView:settings}},appChromeEl:{dataset:{}},_timelineInlineMode:'capture',closeTimelineInlinePanel(){calls.push('close');this._timelineInlineMode=null;},renderTimelineAppChrome(){calls.push('chrome');}};
    const workspace=new TimelineWorkspace(view);let switchView;
    const control=()=>({dataset:{},setAttribute(){}});
    workspace.button=(_parent,_icon,_label,run)=>{switchView??=run;return control();};
    workspace.remember=()=>{};workspace.updateScaleLabel=()=>{};workspace.updateFilterState=()=>{};
    workspace.present=()=>{assert.equal(view._timelineInlineMode,null);calls.push(settings.orientation);};
    workspace.save=async patch=>{calls.push('save');Object.assign(settings,patch);};
    workspace.toolbar({createEl:control,prepend(){}},{});await switchView();
    assert.deepEqual(calls,['save','close',orientation==='vertical'?'horizontal':'vertical']);
    view._timelineInlineMode='capture';workspace.save=async()=>{throw Error('disk full');};
    await assert.rejects(switchView(),/disk full/);assert.equal(view._timelineInlineMode,'capture');
  }
});

test('range settings do not insert a toolbar control when changing orientation',()=>{
  for(const orientation of ['vertical','horizontal']){
    const lead={children:['inbox'],createEl(){const c={dataset:{},setAttribute(){}};this.children.push(c);return c;},prepend(c){this.children.splice(this.children.indexOf(c),1);this.children.unshift(c);}};
    const view={plugin:{getNoriaLocale:()=> 'zh',settings:{timelineView:{orientation}}},appChromeEl:{dataset:{}}};
    const workspace=new TimelineWorkspace(view);
    workspace.button=(parent)=>parent===lead?lead.createEl():{setAttribute(){}};
    workspace.updateScaleLabel=()=>{};workspace.updateFilterState=()=>{};
    workspace.toolbar(lead,{});
    assert.equal(lead.children.at(-2),'inbox');
    assert.equal(lead.children.at(-1).dataset.action,'timeline-orientation');
    assert.equal(lead.children.length,2);
  }
});
test('a toolbar refresh reanchors an open vertical filter instead of dismissing it',()=>{
 const view={plugin:{getNoriaLocale:()=> 'zh',settings:{timelineView:{orientation:'vertical'}}},appChromeEl:{dataset:{}}};
 const w=new TimelineWorkspace(view);w.panelKind='filter';let anchor,closed=0;
 w.closePanel=()=>closed++;w.reanchorPanel=value=>anchor=value;w.updateFilterState=()=>{};w.button=()=>({dataset:{},setAttribute(){}});
 w.toolbar({},{});assert.equal(closed,0);assert.equal(anchor,w.filterButton);
 view.plugin.settings.timelineView.orientation='horizontal';w.toolbar({},{});assert.equal(closed,1);
});


test('opening unscheduled tasks remembers the timeline, starts at the top and returns focus',async()=>{
 const calls=[],doc={activeElement:null,body:{}},filter={focus:()=>calls.push('filter-focus')},back={focus:()=>calls.push('back-focus')};
 const view={plugin:{getNoriaLocale:()=> 'zh',settings:{timelineView:{orientation:'vertical'}}},app:{workspace:{requestSaveLayout(){}}}};
 const w=new TimelineWorkspace(view);w.filterButton=filter;w.stream={ownerDocument:doc,contains:()=>false,querySelector:()=>back,scrollTop:250};
 w.remember=()=>calls.push('remember');w.renderStream=async()=>calls.push(w.showUnscheduled?'list':'timeline');
 doc.activeElement=doc.body;
 await w.setUnscheduled(true);assert.equal(w.unscheduledScroll,0);assert.deepEqual(calls,['remember','list','back-focus']);
 calls.length=0;await w.setUnscheduled(false);assert.deepEqual(calls,['timeline','filter-focus']);
});

test('unscheduled scrolling cannot overwrite the saved timeline date',()=>{
 const anchor={id:'day:2026-09-20',date:'2026-09-20',offset:8},view={plugin:{app:{workspace:{requestSaveLayout(){throw Error('unexpected timeline save')}}}},_verticalTimelineState:anchor};
 const w=new TimelineWorkspace(view);w.showUnscheduled=true;w.stream={scrollTop:325,isConnected:true};w.captureAnchor=()=>{throw Error('must not inspect timeline anchors in the list')};
 assert.equal(w.remember(),anchor);assert.equal(w.unscheduledScroll,325);assert.equal(view._verticalTimelineState,anchor);
});

test('late unscheduled rendering does not steal focus from another pane',async()=>{
 const elsewhere={},doc={activeElement:{},body:{}},view={plugin:{}},w=new TimelineWorkspace(view);
 w.stream={ownerDocument:doc,contains:()=>false,querySelector:()=>({focus(){throw Error('stole focus')}})};w.remember=()=>{};
 w.renderStream=async()=>{doc.activeElement=elsewhere;};await w.setUnscheduled(true);assert.equal(doc.activeElement,elsewhere);
});


test('detached streams during refresh cannot reset the unscheduled scroll position',()=>{
 const w=new TimelineWorkspace({plugin:{}});w.showUnscheduled=true;w.unscheduledScroll=325;w.stream={scrollTop:0,isConnected:false};
 w.remember();assert.equal(w.unscheduledScroll,325);
});
test('Inbox preserves the reading anchor and list scroll during hidden refreshes',()=>{
 const anchor={id:'day:2026-10-12',date:'2026-10-12',offset:8};
 const view={plugin:{},_timelineInlineMode:'capture',_verticalTimelineState:anchor},w=new TimelineWorkspace(view);
 w.stream={isConnected:true,scrollTop:0,getBoundingClientRect(){throw Error('hidden geometry must not be read');}};
 assert.equal(w.captureAnchor(),anchor);assert.equal(w.remember(),anchor);w.restoreAnchor(anchor);
 w.showUnscheduled=true;w.unscheduledScroll=325;w.remember();assert.equal(w.unscheduledScroll,325);
});
const {TimelineWorkspace:Workspace}=context.module.exports;
test('successful source save does not wait for the whole timeline mount before closing its editor',async()=>{
 let release,rendered=0;const pending=new Promise(r=>release=r),order=[];
 const plugin={createDataService:async()=>({invalidate:()=>order.push('data')}),invalidateTaskSnapshots:()=>order.push('snapshots')};
 const w=new Workspace({plugin,refreshTimelineRuntimeFromChrome:()=>{order.push('refresh');return pending;}});w.remember=()=>{};w.renderStream=async()=>{rendered++;};
 const result=await Promise.race([w.taskSaved({classList:{toggle(){}}},{completed:false}).then(()=>true),new Promise(r=>setTimeout(()=>r(false),30))]);
 release();await new Promise(r=>setTimeout(r,0));assert.equal(result,true);assert.deepEqual(order,['data','snapshots','refresh']);assert.equal(rendered,1);
});
