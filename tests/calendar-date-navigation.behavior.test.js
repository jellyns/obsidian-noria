const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
const start=source.indexOf('async function openPeriodicNoteFromCellLink('),end=source.indexOf('\n\trootNode.addEventListener("click"',start);
function fixture(resolveNote){
 const opened=[],created=[],errors=[],file={path:'Journal/2026/10/06.md'};
 const ctx={noriaBridge:{calendar:{resolveNote}},app:{vault:{getAbstractFileByPath:p=>p===file.path?file:null},workspace:{getLeaf:()=>({openFile:async f=>opened.push(f.path)}),openLinkText:async p=>opened.push(p)}},ensurePeriodicNoteFromTemplate:async p=>created.push(p),console:{error(){}},showDebugNotice:m=>errors.push(m),tcRuntimeT:(_k,args)=>args.message};
 const open=vm.runInNewContext(source.slice(start,end)+';openPeriodicNoteFromCellLink',ctx);
 const link={getAttribute:()=> 'Journal/2026/2026/2026-10-06.md',closest:()=>({getAttribute:()=> '2026-10-06'})};
 return {run:()=>open(link,false),opened,created,errors};
}
test('calendar date opens the configured diary path without creating a duplicate year directory',async()=>{
 const requests=[],f=fixture(async r=>{requests.push(r);return {path:'Journal/2026/10/06.md'};});await f.run();
 assert.deepEqual(JSON.parse(JSON.stringify(requests)),[{period:'daily',date:'2026-10-06'}]);assert.deepEqual(f.opened,['Journal/2026/10/06.md']);assert.deepEqual(f.created,[]);
});
test('failed date resolution reports failure and creates no fallback diary',async()=>{
 const f=fixture(async()=>{throw Error('unavailable');});await f.run();assert.deepEqual(f.created,[]);assert.deepEqual(f.opened,[]);assert.deepEqual(f.errors,['unavailable']);
});
test('explicit journal navigation bypasses the active timeline while ordinary day navigation keeps it',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main.js'),'utf8'),start=main.indexOf('async openPeriodNote(request = {})'),end=main.indexOf('async addDateTask(request = {})',start);
 const opened=[],jumped=[],plugin={_timelineCalendarTarget:{vertical:()=>true,stream:{isConnected:true},jumpToDate:async d=>jumped.push(d),view:{leaf:{}}},getLocalYmd:d=>d,coerceLocalDate:d=>d,activateWorkspaceLeaf(){},openCalendarPeriodNote:async r=>{opened.push(r);return {ok:true};}};
 const api=vm.runInNewContext('({'+main.slice(start,end)+'})',{plugin});
 await api.openPeriodNote({period:'daily',date:'2026-10-10'});
 await api.openPeriodNote({period:'monthly',date:'2026-10-01',diary:true});
 await api.openPeriodNote({period:'yearly',date:'2026-01-01',diary:true});
 assert.deepEqual(jumped,['2026-10-10']);assert.deepEqual(opened.map(r=>r.period),['monthly','yearly']);assert.ok(opened.every(r=>r.followActiveDateView===false));
});

function pickerFixture(selectionMode, browseHeader=false) {
 const calendar=fs.readFileSync(require.resolve('../src/runtime/views/calendar/view.js'),'utf8');
 const start=calendar.indexOf('function setMode('),end=calendar.indexOf('function applyTaskTime(',start);
 const nodes=[],opened=[],state={mode:'days',anchor:'2026-10',selectedDate:'2026-10-10',selectionMode},root={querySelector:()=>null};
 const el=(parent,tag,options={})=>{const node={...options,parent,events:{},addEventListener(name,fn){this.events[name]=fn;}};nodes.push(node);return node;};
 const api=vm.runInNewContext(start>=0?calendar.slice(start,end)+';({renderMonthPicker,renderYearPicker,renderPickerActions})':'',{
  input:{browseHeader},state,root,el,addClass(){},setIconButton(){},render:async()=>{},bridge:{locale:'zh'},
  openPeriod:async(...args)=>opened.push(args),yearStartFor:y=>Math.floor(y/16)*16,dateFromMonth:m=>m+'-01'
 });
 return {api,state,opened,nodes,click:(cls,event={})=>nodes.find(n=>n.cls?.split(' ').includes(cls)).events.click(event)};
}

test('journal period synchronization preserves the calendar browsing mode instead of deriving it from journal scope',()=>{
 const {pickerState}=require('../src/diary-navigation.js');
 for(const mode of ['daily','weekly','monthly','yearly']) {
  const state=pickerState({mode,anchorDate:'2026-10-10'});
  assert.equal(state.mode,'days');assert.equal(state.selectionMode,mode);assert.equal(state.anchor,'2026-10');
  for(const browseMode of ['days','months','years'])assert.equal(pickerState({mode,anchorDate:'2026-10-10'},browseMode).mode,browseMode);
 }
});

test('month and year cells open their journals directly regardless of the previous journal scope',async()=>{
 for(const scope of ['daily','weekly','monthly','yearly']){
  const f=pickerFixture(scope),event={ctrlKey:true};f.state.mode='months';
  f.api.renderMonthPicker({months:[{label:'9月',anchor:'2026-09',date:'2026-09-01'}]});
  await f.click('noria-calendar-month-cell',event);
  assert.equal(f.state.mode,'months');assert.deepEqual(f.opened[0],['monthly','2026-09-01',event,true]);
  f.state.mode='years';
  f.api.renderYearPicker({years:[{year:2025}]},{anchor:'2026-09'});await f.click('noria-calendar-year-cell');
  assert.equal(f.state.mode,'years');assert.equal(f.opened[1][0],'yearly');assert.equal(f.opened[1][1],'2025-01-01');assert.equal(f.opened[1][3],true);
 }
});

test('date input keeps year-to-month navigation; return does not change the selected date',async()=>{
 const f=pickerFixture('daily',true);f.state.mode='years';
 f.api.renderYearPicker({years:[{year:2025}]},{anchor:'2026-10'});await f.click('noria-calendar-year-cell');
 assert.equal(f.state.mode,'months');
 f.api.renderMonthPicker({months:[{label:'9月',anchor:'2025-09',date:'2025-09-01'}]});await f.click('noria-calendar-month-cell');
 assert.equal(f.state.mode,'days');assert.equal(f.state.selectedDate,'2026-10-10');assert.deepEqual(f.opened,[]);
 assert.equal(f.state.anchor,'2025-09');
});

test('return leaves the current journal and calendar date unchanged',async()=>{
 for(const mode of ['months','years']) {
  const f=pickerFixture('daily');f.state.mode=mode;
  f.api.renderPickerActions({});await f.click('noria-calendar-return');
  assert.equal(f.state.mode,'days');assert.deepEqual(f.opened,[]);
  assert.equal(f.state.anchor,'2026-10');assert.equal(f.state.selectedDate,'2026-10-10');
 }
});

test('context actions live in the header only while browsing month or year lists',()=>{
 for(const mode of ['days','months','years']){
  const f=pickerFixture('weekly'),header={};f.state.mode=mode;
  f.api.renderPickerActions(header);
  assert.equal(f.nodes[0].parent,header);
  const actions=f.nodes.filter(n=>n.attr?.type==='button');
  assert.equal(actions.length,mode==='days'?0:1);
  assert.ok(actions.every(n=>n.attr['aria-label']&&n.parent===f.nodes[0]));
 }
 const input=pickerFixture('daily',true);input.state.mode='months';
 input.api.renderPickerActions({});
 assert.equal(input.nodes.filter(n=>n.attr?.type==='button').length,1);
});
