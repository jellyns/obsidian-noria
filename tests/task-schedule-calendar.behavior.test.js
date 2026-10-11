const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const doc=require('../src/task-document.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
function load(c,name){let i=source.indexOf('function '+name+'(');assert.notEqual(i,-1,name);if(source.slice(i-6,i)==='async ')i-=6;vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+15)),c);}
function dateMoment(value){const d=new Date(typeof value==='object'?+value:String(value).replace(' ','T'));
 return {valueOf:()=>+d,isValid:()=>Number.isFinite(+d),isAfter:other=>+d>+other,add(n){d.setDate(d.getDate()+n);return this},format(f){const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return date+(f==='YYYY-MM-DD'?'':` ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)}};
}
function setup(raw,extra={}){
 const task={...doc.parseTaskLine(raw),rawText:raw,text:'Read',path:'Diary/2026-10-07.md',line:1,dailyNote:'2026-10-07',...extra};
 const c=vm.createContext({tasks:[task],noriaBridge:{tasks:{...doc,locateSource:doc.locateTask}},rootNode:{getAttribute:()=> 'month'},runtimeTaskQueryPolicy:{includeCancelled:true},
  coerceTemporalToYmd:v=>v||'',sortTasksByYmdField:t=>t,taskIsOpenForCalendar:t=>!t.completed&&!t.checked,isTimelineTaggedTask:()=>false,
  taskDateSameDay:(a,b)=>a===b,taskDateBeforeDay:(a,b)=>a<b,taskDateAfterDay:(a,b)=>a>b,
  parseDateTimeValue:v=>({date:(v||'').slice(0,10),time:(v||'').slice(11)}),timeToMinutes:v=>v?+v.slice(0,2)*60+ +v.slice(3):Infinity,
  normalizeTaskIdentitySnippet:v=>v,hashTaskSnippet:v=>v,moment:()=>({format:()=> '2026-10-07'})});
 for(const name of ['getCalendarTaskEntries','getTaskKey','taskUsesDiaryDate','collectCalendarRangeTasks'])load(c,name);
 const i=source.indexOf('var taskQueryAdapter =');vm.runInContext(source.slice(i,source.indexOf('\nawait initialize();',i)),c);
 return {task,c,query:date=>c.taskQueryAdapter.collectForDate(date)};
}
test('calendar projects arrangements without mutating its task store or repeating completion counts',()=>{
 const raw='- [ ] Read [schedule:: 2026-10-08 09:00 / 2026-10-08 10:00] [schedule:: 2026-10-08 14:00 / 2026-10-08 15:00] [due:: 2026-10-12]';
 const f=setup(raw),before=JSON.stringify(f.task),today=f.query('2026-10-08');
 assert.deepEqual(Array.from(today.due,t=>t.calendarSchedule.index),[0,1]);
 assert.equal(new Set(today.due.map(f.c.getTaskKey)).size,2);
 assert.deepEqual(Array.from(today.due,t=>t.calendarSource.due),['2026-10-12','2026-10-12']);
 assert.equal(f.query('2026-10-07').dailyNote.length,0);
 assert.equal(f.query('2026-10-09').overdue.length,0,'arrangement end is not an overdue deadline');
 assert.equal(f.query('2026-10-12').due.length,1);
 assert.equal(f.c.tasks.length,1);assert.equal(JSON.stringify(f.task),before);
 Object.assign(f.c,today);const open=new Map(),done=new Map();f.c.collectCalendarRangeTasks(open,done,'2026-10-08');
 assert.equal(open.size,1);assert.equal(done.size,0);
 f.task.completed=true;f.task.completion='2026-10-10';Object.assign(f.c,f.query('2026-10-08'));f.c.collectCalendarRangeTasks(new Map(),done,'2026-10-08');
 assert.equal(done.size,0,'showing a completed arrangement does not invent its completion date');
 Object.assign(f.c,f.query('2026-10-10'));f.c.collectCalendarRangeTasks(new Map(),done,'2026-10-10');assert.equal(done.size,1);
});
test('date-only and overnight calendar arrangements keep independent positions and invalid dates have no diary fallback',()=>{
 const f=setup('- [ ] Read [scheduled:: 2026-10-08] [schedule:: 2026-10-09 23:00 / 2026-10-10 07:00]');
 assert.equal(f.query('2026-10-08').scheduled[0].calendarSchedule.index,0);
 assert.equal(f.query('2026-10-09').start[0].calendarSchedule.index,1);
 assert.equal(f.query('2026-10-10').due[0].calendarSchedule.index,1);
 const broken=setup('- [ ] Read [schedule:: bad]');assert.equal(broken.query('2026-10-07').dailyNote.length,0);
});

test('calendar moves and resizes just the selected arrangement, retaining precision and deadline',()=>{
 const raw='  - [ ] Read [schedule:: 2026-10-08] [schedule:: 2026-10-09 23:00 / 2026-10-10 07:00] [due:: 2026-10-20] ^read';
 const {c}=setup(raw);c.moment=dateMoment;load(c,'patchCalendarSchedule');
 assert.equal(c.patchCalendarSchedule(raw,1,null,null,{calendarDayShift:2}),raw.replace('2026-10-09 23:00 / 2026-10-10 07:00','2026-10-11 23:00 / 2026-10-12 07:00'));
 assert.equal(c.patchCalendarSchedule(raw,1,null,null,{calendarResize:{key:'due',date:'2026-10-11'}}),raw.replace('2026-10-10 07:00','2026-10-11 07:00'));
 assert.equal(c.patchCalendarSchedule(raw,0,dateMoment('2026-10-12 12:00'),dateMoment('2026-10-12 13:00'),{}),raw.replace('[schedule:: 2026-10-08]','[schedule:: 2026-10-12]'));
 assert.throws(()=>c.patchCalendarSchedule(raw,1,null,null,{calendarResize:{key:'due',date:'2026-10-08'}}),/invalid-schedule/);
});

test('calendar arrangement writeback follows the original note, invalidates views, undoes and rejects reordered source',async()=>{
 const raw='  - [ ] Read [schedule:: 2026-10-08] [schedule:: 2026-10-09 23:00 / 2026-10-10 07:00] [due:: 2026-10-20] ^read';
 const {c}=setup(raw);let content='## Tasks\r\n'+raw+'\r\n    Child text\r\n';const original=content,events=[];
 Object.assign(c,{moment:dateMoment,processTaskMarkdownFile:async(path,fn)=>{assert.equal(path,'Diary/2026-10-07.md');content=fn(content)},patchGlobalTasksFromSavedLine(){},
  app:{workspace:{trigger:()=>events.push('refresh')}},scheduleTasksCalendarSoftRefresh(){},rootNode:null,tasksCalendarRuntimeLocale:()=> 'en'});
 load(c,'patchCalendarSchedule');load(c,'saveTaskDateTimeLines');load(c,'restoreCalendarDragLine');
 const meta={filePath:'Diary/2026-10-07.md',lineIndex:1,rawText:raw,rawSig:encodeURIComponent(raw),scheduleIndex:1};
 const receipt=await c.saveTaskDateTimeLines(meta,null,null,{calendarDayShift:2,suppressRefresh:true,silentNotice:true});
 assert.equal(content,original.replace('2026-10-09 23:00 / 2026-10-10 07:00','2026-10-11 23:00 / 2026-10-12 07:00'));
 await c.restoreCalendarDragLine(receipt);assert.equal(content,original);assert.equal(events.length,2);
 content=original.replace('[schedule:: 2026-10-08] [schedule:: 2026-10-09 23:00 / 2026-10-10 07:00]','[schedule:: 2026-10-09 23:00 / 2026-10-10 07:00] [schedule:: 2026-10-08]');
 const concurrent=content;
 await assert.rejects(c.saveTaskDateTimeLines(meta,null,null,{calendarDayShift:2}),/task-not-found/);
 assert.equal(content,concurrent);
});

test('month row cleanup and span grouping do not merge two arrangements on the same dates',()=>{
 const {c}=setup('- [ ] Read');
 for(const name of ['getMonthTaskDomKey','getMonthTaskDomKeyShort','groupMonthSpanSegments','dedupeMonthCellTasks'])load(c,name);
 const removed=[];
 function node(index){const attrs={'data-tc-path':'P.md','data-tc-line':'2','data-tc-sig':'same source','data-schedule-index':String(index)};return {getAttribute:key=>attrs[key]??null,querySelector:()=>null,remove(){removed.push(this)}};}
 const a=node(0),copy=node(0),b=node(1);
 assert.notEqual(c.getMonthTaskDomKey(a),c.getMonthTaskDomKey(b));
 assert.equal(c.dedupeMonthCellTasks({querySelectorAll:()=>[a,copy,b]}),1);
 assert.deepEqual(removed,[copy]);
 const segments=[{node:a,scheduleIndex:0},{node:copy,scheduleIndex:0},{node:b,scheduleIndex:1}].map(s=>({...s,path:'P.md',line:'2',sig:'same',cellIndex:1,pos:'single'}));
 assert.equal(c.groupMonthSpanSegments(segments).length,2);
});

test('same-day deadline is attached to its arrangement, still becomes overdue later, and consumes no time block',()=>{
 const {c,query}=setup('- [ ] Read [schedule:: 2026-10-08 09:00 / 2026-10-08 10:00] [due:: 2026-10-08]');
 assert.equal(query('2026-10-08').due.length,1);assert.equal(query('2026-10-08').due[0].calendarSchedule.index,0);
 assert.equal(query('2026-10-09').overdue.length,1);
 load(c,'getTaskTimeSlot');assert.equal(c.getTaskTimeSlot({calendarDeadline:true,dueTime:'14:00'},'due','2026-10-08').slotType,'none');
 const midnight=setup('- [ ] Read [schedule:: 2026-10-07 23:00 / 2026-10-08 00:00] [due:: 2026-10-08]');
 assert.equal(midnight.query('2026-10-08').due.filter(t=>!t.calendarSchedule).length,1);
});

test('staged moves for two arrangements commit once and an invalid second move leaves both unchanged',async()=>{
 const raw='- [ ] Read [schedule:: 2026-10-08 09:00 / 2026-10-08 10:00] [schedule:: 2026-10-09 14:00 / 2026-10-09 15:00] [due:: 2026-10-20]';
 const {c}=setup(raw);let content=raw+'\n',writes=0;
 Object.assign(c,{moment:dateMoment,console:{error(){}},processTaskMarkdownFile:async(path,fn)=>{const next=fn(content);content=next;writes++;},patchGlobalTasksFromSavedLine(){},
  collectTaskMeta:el=>({filePath:'P.md',rawText:raw,rawSig:encodeURIComponent(raw),scheduleIndex:el.index}),
  mdTaskAdapter:{saveDateTime:(el,s,e,o)=>c.saveTaskDateTimeLines(c.collectTaskMeta(el),s,e,o)}});
 for(const name of ['patchCalendarSchedule','saveTaskDateTimeLines','applyPendingPatches'])load(c,name);
 const ops=[{type:'update',taskEl:{index:0},newStart:'2026-10-10 09:00',newEnd:'2026-10-10 10:00'},{type:'update',taskEl:{index:1},newStart:'2026-10-11 14:00',newEnd:'2026-10-11 15:00'}];
 const invalid=await c.applyPendingPatches([ops[0],{...ops[1],newEnd:'2026-10-11 13:00'}]);assert.equal(invalid.failCount,2);assert.equal(writes,0);assert.equal(content,raw+'\n');
 const result=await c.applyPendingPatches(ops);assert.equal(result.okUpdate,2);assert.equal(result.failCount,0);assert.equal(writes,1);
 assert.equal(content,raw.replaceAll('2026-10-08','2026-10-10').replaceAll('2026-10-09','2026-10-11')+'\n');
});


test('waiting drop adds an arrangement to the original row, preserves deadline, and supports undo and conflict rejection',async()=>{
 const raw='  - [ ] Read [due:: 2026-10-20 18:00] ^read';const {c}=setup(raw);
 let content='## Tasks\r\n'+raw+'\r\n    Child\r\n';const original=content;
 Object.assign(c,{moment:dateMoment,processTaskMarkdownFile:async(path,fn)=>{content=fn(content)},patchGlobalTasksFromSavedLine(){},scheduleTasksCalendarSoftRefresh(){},rootNode:null,tasksCalendarRuntimeLocale:()=> 'en'});
 for(const name of ['saveTaskDateTimeLines','restoreCalendarDragLine'])load(c,name);
 const meta={filePath:'Diary/2026-10-07.md',rawText:raw,rawSig:encodeURIComponent(raw),lineIndex:1};
 const receipt=await c.saveTaskDateTimeLines(meta,dateMoment('2026-10-08 23:30'),dateMoment('2026-10-09 00:30'),{addSchedule:true,suppressRefresh:true,silentNotice:true});
 const parsed=doc.parseTaskLine(content.split('\r\n')[1]);assert.equal(parsed.due,'2026-10-20 18:00');assert.equal(parsed.start,'');
 assert.equal(parsed.schedules[0].start,'2026-10-08 23:30');assert.equal(parsed.schedules[0].end,'2026-10-09 00:30');assert.ok(content.endsWith('\r\n    Child\r\n'));
 await c.restoreCalendarDragLine(receipt);assert.equal(content,original);
 content=original.replace('18:00','17:00');const changed=content;
 await assert.rejects(c.saveTaskDateTimeLines(meta,dateMoment('2026-10-08 09:00'),dateMoment('2026-10-08 10:00'),{addSchedule:true}),/task-not-found/);assert.equal(content,changed);
});


test('dragging a date-only arrangement into a time lane gives that arrangement a time, preserving the deadline',()=>{
 const raw='- [ ] Read [scheduled:: 2026-10-08] [due:: 2026-10-20]';const {c}=setup(raw);c.moment=dateMoment;load(c,'patchCalendarSchedule');
 const next=c.patchCalendarSchedule(raw,0,dateMoment('2026-10-09 14:00'),dateMoment('2026-10-09 15:00'),{scheduleTimed:true});
 const model=doc.parseTaskLine(next);assert.equal(model.schedules.length,1);assert.equal(model.schedules[0].start,'2026-10-09 14:00');assert.equal(model.schedules[0].end,'2026-10-09 15:00');assert.equal(model.due,'2026-10-20');
});

test('repeated staged drags retain the pending schedule addition until applying',()=>{
 const {c}=setup('- [ ] Read');Object.assign(c,{moment:dateMoment,pendingTaskChanges:new Map(),getTaskIdentityKey:()=> 'task'});load(c,'stageTaskMove');
 const el={classList:{add(){}}};c.stageTaskMove(el,dateMoment('2026-10-08 09:00'),dateMoment('2026-10-08 10:00'),{addSchedule:true});
 c.stageTaskMove(el,dateMoment('2026-10-08 14:00'),dateMoment('2026-10-08 15:00'),{});
 const op=c.pendingTaskChanges.get('task');assert.equal(op.newStart,'2026-10-08 14:00');assert.equal(op.saveOptions.addSchedule,true);
});
