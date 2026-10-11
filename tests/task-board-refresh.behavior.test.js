const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const taskDocument = require('../src/task-document.js');
function load(c, name) {
 const start = source.indexOf('async function ' + name + '(');
 vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
}

test('calendar display omits a trailing block reference but preserves the source and literal carets',()=>{
 const c=vm.createContext({noriaBridge:{tasks:taskDocument},extractTimelineTag:()=>'',normalizeTaskTemporal(){},taskDiaryDateFromPath:()=>'',
 parseDateTimeValue:()=>({}),normalizeTaskIdList:()=>[],isTimelineTaggedTask:()=>false,normalizePriorityValue:v=>v,getPriorityFromText:()=> 'normal',
 globalTaskFilter:'',stripTaskMetadataEmojis:v=>v,timeToMinutes:()=>Infinity,taskPassesRuntimeTagFilter:()=>true,console});
 const start=source.indexOf('function getMeta(tasks)');vm.runInContext(source.slice(start,source.indexOf('\nfunction getFilename',start)),c);
 for(const [raw,title] of [['Read source [due:: 2026-12-29] ^source-1','Read source'],['Read `^literal`','Read `^literal`'],['Compare ^value with x','Compare ^value with x'],['Keep ^value [due:: 2026-12-29]','Keep ^value'],['Read [schedule:: 2026-10-08] [schedule:: 2026-10-09 12:00 / 2026-10-09 13:00]','Read']]){
  const [item]=c.getMeta([{text:raw}]);assert.equal(item.text,title);assert.equal(item.rawText,raw);
 }
});
test('calendar metadata cleanup preserves ordinary emoji and Unicode titles',()=>{
 const start=source.indexOf('function stripTaskMetadataEmojis('),end=source.indexOf('var TASKS_PRIORITY_ORDER',start);
 const strip=vm.runInNewContext(source.slice(start,end)+';stripTaskMetadataEmojis');
 const title='核对图表 📚 🧪 👩‍💻 🚴🏽‍♀️';
 assert.equal(strip(title),title);
 const priorityStart=source.indexOf('function stripTaskPriorityMarkers('),priorityEnd=source.indexOf('function getPriorityFromText(',priorityStart);
 const stripPriority=vm.runInNewContext(source.slice(priorityStart,priorityEnd)+';stripTaskPriorityMarkers');
 assert.equal(stripPriority('- [ ] '+title+' 🔺 [priority:: high]'),'- [ ] '+title);
 assert.equal(strip(title+' 🔺 📅 2026-12-31 18:00').trim(),title);
 assert.equal(strip('任务 🛫 2026-12-30 ⏳ 2026-12-30 ✅ 2026-12-31 ➕ 2026-12-01 ❌ 2026-12-31').trim(),'任务');
});

test('refresh waits for the fresh model, and does not rebuild while saving', async () => {
 let resolve; const frames=[];
 const c=vm.createContext({plannerChromeInteractionActive:false,editModeActive:false,tcRuntimeDisposed:false,
  refreshTasksFromFreshSource:()=>new Promise(r=>{resolve=r}),rootNode:{querySelector:()=>({}),getAttribute:()=> 'day'},
  refreshCalendarRangeStatistics:()=>frames.push('statistics'),
  hydrateGridTaskCells:()=>frames.push('hydrate'),schedulePlannerChromeWeekLanesFinalizePost(){},schedulePlannerChromeOverlapLayout(){}});
 const start=source.indexOf('async function triggerTaskFreshRefresh(');
 vm.runInContext(source.slice(start,source.indexOf('/** 拖拽/弹窗保存后延迟合并刷新',start)),c);
 const pending=c.triggerTaskFreshRefresh();assert.deepEqual(frames,[]);
 resolve(3);await pending;assert.deepEqual(frames,['hydrate','statistics']);
 c.plannerChromeInteractionActive=true;await c.triggerTaskFreshRefresh();
 assert.deepEqual(frames,['hydrate','statistics']);assert.equal(c.tcRefreshDeferredByInteraction,true);
});
test('an older read cannot overwrite a newer read or a committed local write',async()=>{
 const reads=[];const c=vm.createContext({tcTaskSourceRevision:0,tcTaskSourceRequest:0,pages:'',tasks:['original'],
  plannerChromeInteractionActive:false,editModeActive:false,getMeta:x=>x,
  collectFreshTasksForCalendar:()=>new Promise(resolve=>reads.push(resolve))});
 load(c,'refreshTasksFromFreshSource');
 const old=c.refreshTasksFromFreshSource(),next=c.refreshTasksFromFreshSource();
 reads[1](['fresh']);assert.equal(await next,1);
 reads[0](['stale']);assert.equal(await old,-1);assert.deepEqual(c.tasks,['fresh']);
 const beforeWrite=c.refreshTasksFromFreshSource();c.tcTaskSourceRevision++;c.tasks=['saved'];
 reads[2](['before-write']);assert.equal(await beforeWrite,-1);assert.deepEqual(c.tasks,['saved']);
});

test('the committed line clears obsolete dates when undo restores a point or scheduled task',()=>{
 const row={start:'2026-09-26',startTime:'10:00',due:'2026-09-27',dueTime:'11:00'};
 const c=vm.createContext({tcTaskSourceRevision:0,findTaskRowForSaveMeta:()=>row,
  readTaskCalendarDate:(line,key)=>{const m=line.match(new RegExp('\\['+key+':: (\\d{4}-\\d{2}-\\d{2})(?: (\\d{2}:\\d{2}))?\\]'));return {date:m?.[1]||'',time:m?.[2]||''}},
  noriaBridge:{tasks:taskDocument},normalizeTaskTemporal(){},getTaskStatusFromText:()=> 'todo',getPriorityFromText:()=> 'normal',getInlineFieldValue:()=>'',
  normalizeTaskIdList:()=>[],formatTaskDateOnly:()=>'',parseDateTimeValue:()=>({time:''}),extractTimelineTag:()=>'',timeToMinutes:()=>0});
 const start=source.indexOf('function patchGlobalTasksFromSavedLine(');
 vm.runInContext(source.slice(start,source.indexOf('function removeTaskFromRuntimeByMeta(',start)),c);
 c.patchGlobalTasksFromSavedLine({},'- [ ] Task [due:: 2026-09-26 11:00]');
 assert.equal(row.start,'');assert.equal(row.startTime,'');assert.equal(row.due,'2026-09-26');assert.equal(row.dueTime,'11:00');
 c.patchGlobalTasksFromSavedLine({},'- [ ] Task [scheduled:: 2026-09-25]');
 assert.equal(row.start,'');assert.equal(row.due,'');assert.equal(row.dueTime,'');assert.equal(row.scheduled,'2026-09-25');
 c.patchGlobalTasksFromSavedLine({},'- [ ] Task');
 assert.equal(row.scheduled,undefined);assert.equal(c.tcTaskSourceRevision,3);
});


test('calendar instances retain independent invalidation listeners through rebind and disposal',()=>{
 const refs=new Set(),refreshes=[];
 const app={workspace:{on:(name,callback)=>{const ref={name,callback};refs.add(ref);return ref;},offref:ref=>refs.delete(ref)}};
 const extract=name=>{const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2);};
 const c=vm.createContext({app});
 const make=vm.runInContext(`(label,refreshes)=>{let tcFreshTaskInvalidationRef=null,tcRuntimeDisposed=false,plannerChromeInteractionActive=false,editModeActive=false,tcRefreshDeferredByInteraction=false;const scheduleTasksCalendarSoftRefresh=()=>refreshes.push(label);${extract('clearFreshTaskInvalidationEvent')}
${extract('bindFreshTaskInvalidationEvent')}
return {bind:bindFreshTaskInvalidationEvent,clear:clearFreshTaskInvalidationEvent};}`,c);
 const day=make('day',refreshes),week=make('week',refreshes);
 day.bind();week.bind();assert.equal(refs.size,2);
 for(const ref of refs)ref.callback({});assert.deepEqual(refreshes,['day','week']);
 day.bind();assert.equal(refs.size,2,'rebinding does not duplicate the subscription');
 week.clear();assert.equal(refs.size,1);refreshes.length=0;for(const ref of refs)ref.callback({});assert.deepEqual(refreshes,['day']);
 day.clear();day.clear();assert.equal(refs.size,0);
});
