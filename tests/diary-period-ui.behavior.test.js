const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/diary-workspace.js'),'utf8'),{module:mod,require:id=>id==='./diary-tasks.js'?require('../src/diary-tasks.js'):{},clearTimeout,setTimeout,Intl});
const {DiaryWorkspace}=mod.exports;
function host(){return {hidden:false,children:[],attrs:{},empty(){for(const c of this.children)c.removed=true;this.children=[];},setAttribute(k,v){this.attrs[k]=v;},createDiv(){const child={removed:false,remove(){this.removed=true;}};this.children.push(child);return child;},createSpan(o){this.children.push(o);}};}
function workspace(mode='monthly',anchorDate='2026-09-23'){const d=Object.create(DiaryWorkspace.prototype);d.session={model:{selection:{mode,anchorDate,period:mode==='monthly'?'2026-09':'2026-W39'},path:'period.md'}};d.summaryGeneration=0;d.summaryHost=host();return d;}
test('empty periods leave no summary chrome, while real counts retain their meaning',async()=>{
 const d=workspace();let domains={tasks:{completion:{completed:0}},habits:{summary:{checked:0}},notes:{diaryWords:{total:0}}};d.plugin={getNoriaLocale:()=> 'en',createDataService:async()=>({getSnapshot:async()=>({domains})})};d.t=(k,p)=>k+':'+p.count;
 await d.refreshPeriodSummary();assert.equal(d.summaryHost.hidden,true);assert.equal(d.summaryHost.children.length,0);
 domains.tasks.completion.completed=2;domains.notes.diaryWords.total=1234;await d.refreshPeriodSummary();assert.equal(d.summaryHost.hidden,false);assert.equal(d.summaryHost.children[0].text,'periodTasks:2 · periodWords:1,234');
});
test('a late period summary cannot reappear after switching to daily',async()=>{
 const d=workspace();let resolve;d.plugin={createDataService:async()=>({getSnapshot:()=>new Promise(r=>resolve=r)})};const pending=d.refreshPeriodSummary();await Promise.resolve();d.session.model.selection={mode:'daily',anchorDate:'2026-10-07',period:'2026-10-07'};await d.refreshPeriodSummary();resolve({domains:{notes:{diaryWords:{total:99}}}});await pending;assert.equal(d.summaryHost.hidden,true);assert.equal(d.summaryHost.children.length,0);
});
