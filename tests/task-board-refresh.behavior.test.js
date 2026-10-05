const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
function load(c, name) {
 const start = source.indexOf('async function ' + name + '(');
 vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
}
test('refresh waits for the fresh model, and does not rebuild while saving', async () => {
 let resolve; const frames=[];
 const c=vm.createContext({plannerChromeInteractionActive:false,editModeActive:false,tcRuntimeDisposed:false,
  refreshTasksFromFreshSource:()=>new Promise(r=>{resolve=r}),rootNode:{querySelector:()=>({})},
  hydrateGridTaskCells:()=>frames.push('hydrate'),schedulePlannerChromeWeekLanesFinalizePost(){},schedulePlannerChromeOverlapLayout(){}});
 const start=source.indexOf('async function triggerTaskFreshRefresh(');
 vm.runInContext(source.slice(start,source.indexOf('/** 拖拽/弹窗保存后延迟合并刷新',start)),c);
 const pending=c.triggerTaskFreshRefresh();assert.deepEqual(frames,[]);
 resolve(3);await pending;assert.deepEqual(frames,['hydrate']);
 c.plannerChromeInteractionActive=true;await c.triggerTaskFreshRefresh();
 assert.deepEqual(frames,['hydrate']);assert.equal(c.tcRefreshDeferredByInteraction,true);
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
  normalizeTaskTemporal(){},getTaskStatusFromText:()=> 'todo',getPriorityFromText:()=> 'normal',getInlineFieldValue:()=>'',
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
