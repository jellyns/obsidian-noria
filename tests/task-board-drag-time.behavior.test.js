const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
function moment(value){
 const d=new Date(value?.valueOf?.() instanceof Number?+value:value instanceof Object?+value:String(value).replace(' ','T')+'Z');
 return {valueOf:()=>+d,isValid:()=>Number.isFinite(+d),clone(){return moment(this)},add(n,u){d.setTime(+d+n*(u==='days'?86400000:60000));return this},subtract(n,u){return this.add(-n,u)},diff(o,u){return (+d-+o)/(u==='days'?86400000:60000)},isBefore:o=>+d<+o,isAfter:o=>+d>+o,hours:()=>d.getUTCHours(),minutes:()=>d.getUTCMinutes(),format(f){const s=d.toISOString();return f==='YYYY-MM-DD'?s.slice(0,10):f==='HH:mm'?s.slice(11,16):s.slice(0,16).replace('T',' ')}};
}
function dragFixture(){
 const listeners=new Map(),saved=[],attrs=new Map(Object.entries({'data-start-date':'2026-09-26','data-start-time':'09:00','data-due-date':'2026-09-26','data-due-time':'09:10'}));
 const style={top:'37.5%',height:'2.5%'};
 const lane={getBoundingClientRect:()=>({top:0,height:1440}),appendChild(el){el.parentElement=this},scrollHeight:1440,clientHeight:1440,parentElement:null};
 const cell={getAttribute:()=> '2026-09-26'};
 const task={parentElement:lane,style,getAttribute:k=>attrs.get(k)||null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),querySelector:()=>null,
  closest:s=>s==='.cell'?cell:null,getBoundingClientRect:()=>({top:540,height:36}),classList:{add(){},remove(){}},setPointerCapture(){},releasePointerCapture(){},addEventListener(){}};
 const tooltips=['Task preview','Other control'].map(textContent=>({textContent,removed:false,remove(){this.removed=true}}));
 attrs.set('aria-label','Task preview');
 const doc={querySelectorAll:()=>tooltips,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 task.ownerDocument=doc;
 const context=vm.createContext({createCalendarDragFeedback:()=>({update(){},close(){}}),showCalendarDragUndo(){},tasksCalendarRuntimeLocale:()=>"zh-CN",document:doc,rootNode:{classList:{contains:()=>true}},moment,isTimelineCalendarView:()=>true,editModeActive:false,pendingDeleteMode:false,plannerChromeInteractionActive:false,
  normalizeTimeStr:s=>s, getPlannerChromeTimelineStartMin:()=>0,getPlannerChromeTimelineEndMin:()=>1440,tcEnsureTimeLaneHost:()=>lane,getCellFromPoint:(x,y)=>y>=0&&y<1440?cell:null,
  roundMinutesToStep:(n,s)=>Math.round(n/s)*s,toDayMoment:(date,min)=>moment(date+' 00:00').add(min,'minutes'),computePlannerChromeExpandedSlotBounds:(a,b,s,e)=>({s,e}),
  minutesToTimeStr:n=>`${Math.floor(n/60)}:${n%60}`,PLANNER_CHROME_MIN_VISUAL_RANGE_MIN:30,PLANNER_CHROME_COMPACT_MAX_MIN:30,
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout(){},mdTaskAdapter:{saveDateTime:async(el,s,e)=>saved.push([s.format('HH:mm'),e.format('HH:mm')])},
  schedulePlannerChromeOverlapLayout(){},normalizePlannerChromeWeekTaskGeometry(){},schedulePlannerChromeWeekLanesFinalize(){},scheduleTasksCalendarSoftRefresh(){},flushDeferredHydration(){},flushDeferredTaskFreshRefresh(){},showBriefNotice(){},showDebugNotice(){},tcRuntimeT:k=>k,console});
 vm.runInContext(source.slice(source.indexOf('function onTaskPointerDown'),source.indexOf('\nfunction getMetaFromNote')),context);
 const event=y=>({button:0,currentTarget:task,target:task,clientX:10,clientY:y,pointerId:1,preventDefault(){},stopPropagation(){}});
 return {context,event,listeners,saved,task,tooltips};
}
test('moving a ten-minute task preserves duration and the grabbed position',async()=>{
 const f=dragFixture();f.context.onTaskPointerDown(f.event(565));f.listeners.get('pointermove')(f.event(625));await f.listeners.get('pointerup')(f.event(625));
 assert.deepEqual(f.saved,[['10:00','10:10']]);
 assert.deepEqual(f.tooltips.map(t=>t.removed),[true,false]);
});
test('sub-threshold movement does not snap or write; Escape and invalid drops restore the original position',async()=>{
 for(const mode of ['tiny','escape','outside']){
  const f=dragFixture();f.context.onTaskPointerDown(f.event(545));f.listeners.get('pointermove')(f.event(mode==='tiny'?546:605));
  if(mode==='escape'){const key=f.listeners.get('keydown');assert.equal(typeof key,'function');key({key:'Escape',preventDefault(){},stopPropagation(){}});}
  else await f.listeners.get('pointerup')(f.event(mode==='outside'?1500:546));
  assert.deepEqual(f.saved,[],mode);assert.equal(f.task.style.top,'37.5%',mode);
 }
});
test('month date shifts preserve field shape, times, and unrelated completion dates',()=>{
 const context=vm.createContext({moment});const start=source.indexOf('function shiftTaskCalendarDates(');assert.notEqual(start,-1);
 vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+10)),context);
 const cases=[
  ['- [ ] Due [due:: 2026-09-26]','- [ ] Due [due:: 2026-09-28]'],
  ['- [ ] Scheduled [scheduled:: 2026-09-26 08:15]','- [ ] Scheduled [scheduled:: 2026-09-28 08:15]'],
  ['- [x] Overnight [start:: 2026-09-26 23:55] [due:: 2026-09-27 00:05] [completion:: 2026-09-27] ^id','- [x] Overnight [start:: 2026-09-28 23:55] [due:: 2026-09-29 00:05] [completion:: 2026-09-27] ^id'],
  ['- [ ] Emoji 📅 2026-09-26','- [ ] Emoji 📅 2026-09-28'],
  ['- [ ] Diary task','- [ ] Diary task']];
 for(const [before,after] of cases)assert.equal(context.shiftTaskCalendarDates(before,2),after);
});

test('month drag edits the original note, preserves children and block links, and can undo',async()=>{
 for(const [before,after] of [
  ['- [ ] Read ^reading','- [ ] Read  [scheduled:: 2026-09-28] ^reading'],
  ['- [ ] Read [scheduled:: 2026-09-26 08:15]','- [ ] Read [scheduled:: 2026-09-28 08:15]']]){
  const path='Diary/2026-09-26.md',original=`## Tasks\r\n${before}\r\n  - [ ] Child\r\n  Attached paragraph\r\n`,files=new Map([[path,original]]),writes=[];
  let cached=original;
  const c=vm.createContext({moment,processTaskMarkdownFile:async(p,fn)=>{writes.push(p);files.set(p,fn(files.get(p)))},
   pickTaskLineIndex:lines=>lines.findIndex(l=>l===before),patchGlobalTasksFromSavedLine(){},
   normalizeVaultRelPath:p=>p,getConfiguredDailyNoteYmdFromPath:()=> '2026-09-26',buildDailyNotePath:d=>`Diary/${d}.md`,
   saveTaskDateTimeRelocateBetweenDailyNotes:()=>{throw Error('must not relocate the task')},
   rootNode:null,noriaBridge:{data:{invalidate:async()=>{cached=files.get(path)}}},scheduleTasksCalendarSoftRefresh(){},tasksCalendarRuntimeLocale:()=> 'en'});
  for(const name of ['shiftTaskCalendarDates','readTaskCalendarDate','getInlineFieldValue','parseDateTimeValue','upsertInlineField','calendarMonthDrop']){
   const i=source.indexOf('function '+name+'(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);
  }
  const i=source.indexOf('async function saveTaskDateTimeLines(');vm.runInContext(source.slice(i,source.indexOf('\nfunction isPlannerChromeActive',i)),c);
  const u=source.indexOf('async function restoreCalendarDragLine(');vm.runInContext(source.slice(u,source.indexOf('\nfunction ',u)),c);
  const drop=c.calendarMonthDrop({startM:moment('2026-09-26 09:00'),endM:moment('2026-09-26 10:00')},'2026-09-28','2026-09-26','');
  const receipt=await c.saveTaskDateTimeLines({filePath:path,lineIndex:1,rawText:before},drop.start,drop.end,{...drop.options,silentNotice:true,suppressRefresh:true});
  assert.deepEqual([...files.keys()],[path]);assert.deepEqual(writes,[path]);
  assert.equal(files.get(path),original.replace(before,after));assert.equal(receipt.path,path);
  assert.equal(cached,files.get(path),'successful writes must invalidate cached dates before refresh, without relying on vault events');
  await c.restoreCalendarDragLine(receipt);assert.equal(files.get(path),original);
 }
});
test('drag keeps refresh frozen until the write settles, including a failed write',async()=>{
 for(const fail of [false,true]){
  const f=dragFixture();let settle;
  f.context.console={error(){}};
  f.context.mdTaskAdapter.saveDateTime=()=>new Promise((resolve,reject)=>{settle=()=>fail?reject(Error('write failed')):resolve(null)});
  f.context.onTaskPointerDown(f.event(565));f.listeners.get('pointermove')(f.event(625));
  const pending=f.listeners.get('pointerup')(f.event(625));
  assert.equal(f.context.plannerChromeInteractionActive,true,'write must retain the preview freeze');
  settle();await pending;
  assert.equal(f.context.plannerChromeInteractionActive,false,'both success and failure must release');
  if(fail)assert.equal(f.task.style.top,'37.5%');
 }
});

test('calendar uses the diary date only until an explicit task date is assigned',()=>{
 const tasks=[{id:'undated',dailyNote:'2026-09-26'},{id:'moved',dailyNote:'2026-09-26',scheduled:'2026-09-28'}];
 const c=vm.createContext({tasks,rootNode:{getAttribute:()=> 'month'},runtimeTaskQueryPolicy:{},
  getTaskKey:t=>t.id,sortTasksByYmdField:t=>t,taskIsOpenForCalendar:t=>!t.completed,isTimelineTaggedTask:()=>false,
  coerceTemporalToYmd:v=>v||'',taskDateSameDay:(a,b)=>a===b,taskDateBeforeDay:(a,b)=>a<b,taskDateAfterDay:(a,b)=>a>b});
 let i=source.indexOf('function taskUsesDiaryDate(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);
 i=source.indexOf('var taskQueryAdapter =');vm.runInContext(source.slice(i,source.indexOf('\nawait initialize();',i)),c);
 i=source.indexOf('function getTasks(date)');vm.runInContext(source.slice(i,source.indexOf('\nfunction getTasksViaAdapter',i)),c);
 for(const date of ['2026-09-26','2026-09-28']){
  const expected=date.endsWith('26')?['undated']:[],scheduled=date.endsWith('28')?['moved']:[];
  const actual=c.taskQueryAdapter.collectForDate(date);c.getTasks(date);
  for(const result of [actual,c]){assert.deepEqual(Array.from(result.dailyNote,t=>t.id),expected);assert.deepEqual(Array.from(result.scheduled,t=>t.id),scheduled);}
 }
});

test('calendar time save preserves nested task indentation and places new fields before its block reference',async()=>{
 const before='    - [ ] Compare `a  b` ^child-task';let text=before+'\n';
 const c=vm.createContext({moment,noriaBridge:null,processTaskMarkdownFile:async(p,fn)=>{text=fn(text)},pickTaskLineIndex:()=>0,patchGlobalTasksFromSavedLine(){},stripTaskTemplateOnlyFields:s=>s,formatTaskDateTimeForSave:m=>m.format('YYYY-MM-DD HH:mm')});
 for(const name of ['upsertInlineField','stripInlineField']){const i=source.indexOf('function '+name+'(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);}
 const i=source.indexOf('async function saveTaskDateTimeLines(');vm.runInContext(source.slice(i,source.indexOf('\nfunction isPlannerChromeActive',i)),c);
 await c.saveTaskDateTimeLines({filePath:'Task.md',lineIndex:0,rawText:before},moment('2026-10-06 09:00'),moment('2026-10-06 10:00'),{silentNotice:true,suppressRefresh:true});
 assert.equal(text,'    - [ ] Compare `a  b`  [start:: 2026-10-06 09:00]  [due:: 2026-10-06 10:00] ^child-task\n');
});

test('month endpoints preserve the opposite endpoint and reject inverted ranges',()=>{
 const c=vm.createContext({moment});for(const name of ['calendarMonthDrop','resizeTaskCalendarDate']){const i=source.indexOf('function '+name+'(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);}
 const original={startM:moment('2026-09-26 09:00'),endM:moment('2026-09-30 18:00')};
 const drop=c.calendarMonthDrop(original,'2026-10-02','2026-09-30','due');
 assert.equal(drop.start.format('YYYY-MM-DD HH:mm'),'2026-09-26 09:00');assert.equal(drop.end.format('YYYY-MM-DD HH:mm'),'2026-10-02 18:00');
 assert.equal(c.calendarMonthDrop(original,'2026-10-01','2026-09-26','start'),null);
 const dueOnly=c.calendarMonthDrop({...original,hasStart:false},'2026-09-24','2026-09-30','due');
 assert.equal(dueOnly.end.format('YYYY-MM-DD'),'2026-09-24');
 assert.equal(dueOnly.options.calendarResize.key,'due');
 const startOnly=c.calendarMonthDrop({...original,hasDue:false},'2026-10-02','2026-09-26','start');
 assert.equal(startOnly.start.format('YYYY-MM-DD'),'2026-10-02');
 assert.equal(c.resizeTaskCalendarDate('- [ ] Range [start:: 2026-09-26] [due:: 2026-09-30 18:00]','due','2026-10-02'),'- [ ] Range [start:: 2026-09-26] [due:: 2026-10-02 18:00]');
});

test('undo restores only the saved task and keeps unrelated edits; newer task edits conflict',async()=>{
 let raw='new paragraph\n- [ ] Task [due:: 2026-09-28]\nother task\n';
 const patched=[];
 const c=vm.createContext({processTaskMarkdownFile:async(p,fn)=>{raw=fn(raw)},patchGlobalTasksFromSavedLine:(meta,line)=>patched.push({meta,line}),rootNode:null,noriaBridge:null,triggerTaskFreshRefresh(){},scheduleTasksCalendarSoftRefresh(){},tasksCalendarRuntimeLocale:()=>"en"});
 const i=source.indexOf('async function restoreCalendarDragLine(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i)),c);
 const receipt={path:'Tasks.md',index:1,before:'- [ ] Task [due:: 2026-09-26]',after:'- [ ] Task [due:: 2026-09-28]'};
 await c.restoreCalendarDragLine(receipt);assert.equal(raw,'new paragraph\n- [ ] Task [due:: 2026-09-26]\nother task\n');
 assert.equal(patched.length,1);assert.equal(patched[0].line,receipt.before);
 assert.equal(patched[0].meta.filePath,'Tasks.md');
 raw='- [x] Task [due:: 2026-09-28]\n';await assert.rejects(c.restoreCalendarDragLine(receipt),/changed again/);assert.equal(raw,'- [x] Task [due:: 2026-09-28]\n');
 assert.equal(patched.length,1,'conflicting undo must not alter the model');
});

test('edge scrolling hands off a full inner region and leaves the center still',()=>{
 const outer={scrollTop:0,scrollHeight:800,clientHeight:400,getBoundingClientRect:()=>({top:0,bottom:400})},inner={scrollHeight:600,clientHeight:400,parentElement:outer,getBoundingClientRect:()=>({top:0,bottom:400})};
 let pos=200;Object.defineProperty(inner,'scrollTop',{get:()=>pos,set:v=>pos=Math.min(200,Math.max(0,v))});
 const doc={elementFromPoint:()=>inner,defaultView:{innerHeight:600,getComputedStyle:()=>({overflowY:'auto'})}};
 const c=vm.createContext({});const i=source.indexOf('function calendarEdgeScroll(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);
 assert.equal(c.calendarEdgeScroll(doc,50,390),true);assert.ok(outer.scrollTop>0);const before=outer.scrollTop;
 assert.equal(c.calendarEdgeScroll(doc,50,200),false);assert.equal(outer.scrollTop,before);
});

test('undo refresh reads the restored file even without a vault change event',async()=>{
 let raw='after',cached=raw,model=raw,settle;
 const snapshots=[];
 const c=vm.createContext({processTaskMarkdownFile:async(p,fn)=>{raw=fn(raw)},
  patchGlobalTasksFromSavedLine:(meta,line)=>{model=line},rootNode:null,
  noriaBridge:{data:{invalidate:()=>new Promise(resolve=>{settle=()=>{cached=null;resolve()}})},taskSnapshots:{invalidate:scope=>snapshots.push(scope)}},
  scheduleTasksCalendarSoftRefresh(){model=cached??raw},tasksCalendarRuntimeLocale:()=> 'en'});
 const i=source.indexOf('async function restoreCalendarDragLine(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i)),c);
 const pending=c.restoreCalendarDragLine({path:'Tasks.md',index:0,before:'before',after:'after'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(model,'before','local state must be restored immediately');
 assert.equal(typeof settle,'function','the write must invalidate cached task sources itself');
 settle();await pending;
 assert.equal(model,'before','the subsequent refresh must not restore stale cached dates');
 assert.deepEqual(snapshots,['tasks']);
});
