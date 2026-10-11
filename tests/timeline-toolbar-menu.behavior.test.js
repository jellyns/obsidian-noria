const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let shown;
class Menu {constructor(){this.items=[];}addItem(fn){const item={setIcon(x){this.icon=x;return this;},setTitle(x){this.title=x;return this;},setChecked(x){this.checked=x;return this;},setSubmenu(){this.submenu=new Menu();return this.submenu;},onClick(fn){this.run=fn;return this;}};fn(item);this.items.push(item);}addSeparator(){}showAtPosition(){shown=this;}}
const ctx={module:{exports:{}},require:name=>name==='obsidian'?{Menu,Notice:class{constructor(message){throw Error(message);}}}:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/timeline-workspace.js'),'utf8'),ctx);
const {TimelineWorkspace}=ctx.module.exports;
function open(orientation,capture=false,groupBy='free'){
 const calls=[],view={plugin:{getNoriaLocale:()=> 'en',settings:{timelineView:{orientation}},openNoriaSettings:tab=>calls.push(tab)},_timelineInlineMode:capture?'capture':null,_timelineFilterState:{groupBy,markMode:false},toggleTimelineAnnotationSelection:()=>calls.push('annotation'),closeTimelineInlinePanel:()=>calls.push('return'),_timelineCaptureComposer:{input:{focus:()=>calls.push('input')}},renderTimelineSavedViews:()=>({querySelector:()=>null})};
 const w=new TimelineWorkspace(view);w.panel=()=>({});w.morePanel({getBoundingClientRect:()=>({left:0,bottom:20})});return {items:shown.items,calls};
}
test('timeline menus expose only actions belonging to their current surface',async()=>{
 const horizontal=open('horizontal');assert.deepEqual(horizontal.items.map(i=>i.title),['Save and manage views','Select annotations','Overview navigation','Noria settings']);await horizontal.items[1].run();assert.deepEqual(horizontal.calls,['annotation']);
 assert.deepEqual(open('vertical').items.map(i=>i.title),['Save and manage views','Noria settings']);
 const project=open('horizontal',false,'projects');assert.deepEqual(project.items.map(i=>i.title),['Save and manage views','Overview navigation','Noria settings']);assert.deepEqual(project.items[1].submenu.items.map(i=>[i.title,i.checked]),[['Automatic',true],['Show',false],['Hide',false]]);
});
test('Inbox menu keeps writing and return local, without timeline-only tools',async()=>{
 for(const orientation of ['vertical','horizontal']){const {items,calls}=open(orientation,true);assert.deepEqual(items.map(i=>i.title),['Continue writing','Return to timeline','Noria settings']);await items[0].run();await items[1].run();await items[2].run();assert.deepEqual(calls,['input','return','home']);}
});
