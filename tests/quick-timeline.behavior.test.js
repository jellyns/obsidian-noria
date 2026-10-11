const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
const code=source.slice(source.indexOf('async function quickAddTimelineEvent('),source.indexOf('function setQuickTimelinePanel()'));
function setup(resolveNote){
  const writes=[],hydrated=[];
  const context={
    ensureTimelineActionsAdapterLoaded:async()=>({buildTimelineTaskLine:()=>'- [ ] Event'}),
    moment:date=>({isValid:()=>true,format:()=>date,clone(){return this;}}),
    resolveNewTaskAppendTarget:()=>({filePath:'old/2026/2026/2026-10-06.md',sectionHeading:'### 今日任务'}),
    calendarDaySpanBetweenStartDays:()=>0,
    noriaBridge:{calendar:{resolveNote}},
    appendTaskLineToDaily:async(...args)=>{writes.push(args);return true;},
    hydrateQuickAddedTaskIntoRuntime:(...args)=>hydrated.push(args),
    showDebugNotice(){},tcRuntimeT:key=>key,describePeriodicDestForNotice:path=>path
  };
  return {run:vm.runInNewContext(code+';quickAddTimelineEvent',context),writes,hydrated};
}
test('quick timeline writes and hydrates the same configured calendar note as diary creation',async()=>{
  const requests=[],f=setup(async request=>{requests.push(request);return {path:'Journal/2026/10/06.md'};});
  await f.run('2026-10-06',{label:'Event',startTime:'09:00',dueTime:'10:00'});
  assert.deepEqual(JSON.parse(JSON.stringify(requests)),[{period:'daily',date:'2026-10-06'}]);
  assert.equal(f.writes[0][4].filePath,'Journal/2026/10/06.md');
  assert.equal(f.hydrated[0][0],'Journal/2026/10/06.md');
});
test('a failed calendar path lookup does not write to an unrelated fallback note',async()=>{
  const f=setup(async()=>{throw Error('Unavailable calendar');});
  await assert.rejects(f.run('2026-10-06',{label:'Event'}),/Unavailable calendar/);
  assert.equal(f.writes.length,0);assert.equal(f.hydrated.length,0);
});
