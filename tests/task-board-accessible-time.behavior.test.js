const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function formatPlannerTaskAccessibleTime('), source.indexOf('function syncPlannerChromeWeekTimeBadgeVisibility(')), context);
const label = (attrs, segment) => context.formatPlannerTaskAccessibleTime({getAttribute: key => attrs[key]}, segment);

test('cross-day preview describes the real endpoints, not the visible midnight segment', () => {
  const attrs = {'data-start-date':'2026-12-31','data-start-time':'21:00','data-due-date':'2027-01-01','data-due-time':'01:00'};
  assert.equal(label(attrs, '21:00 - 24:00'), '2026-12-31 21:00 → 2027-01-01 01:00');
  assert.equal(label(attrs, '00:00 - 01:00'), '2026-12-31 21:00 → 2027-01-01 01:00');
  delete attrs['data-due-time'];
  assert.equal(label(attrs, '21:00 - 24:00'), '2026-12-31 21:00 → 2027-01-01');
});

test('same-day preview retains real times outside the visible axis and supports point tasks', () => {
  assert.equal(label({'data-start-date':'2026-09-26','data-due-date':'2026-09-26','data-start-time':'03:00','data-due-time':'08:00'}, '06:00 - 08:00'), '03:00–08:00');
  assert.equal(label({}, '10:00'), '10:00');
});

test('overdue reminders do not borrow their old clock time as a slot today',()=>{
 const c=vm.createContext({moment:()=>({isValid:()=>true,isAfter:()=>false,isBefore:()=>false}),coerceTemporalToYmd:s=>s,getTimeForClass:obj=>obj.dueTime,taskDateSameDay:(a,b)=>a===b,timeToMinutes:s=>{const [h,m]=s.split(':').map(Number);return h*60+m},normalizeTimeStr:s=>s});
 const i=source.indexOf('function getTaskTimeSlot(');vm.runInContext(source.slice(i,source.indexOf('\nfunction ',i+10)),c);
 const task={start:'2026-09-25',due:'2026-09-25',startTime:'12:30',dueTime:'12:40'};
 const reminder=c.getTaskTimeSlot(task,'overdue','2026-09-27');
 assert.equal(reminder.slotType,'none');assert.equal(reminder.startMin,'');
 const original=c.getTaskTimeSlot(task,'due','2026-09-25');
 assert.equal(original.slotType,'range');assert.equal(original.startMin,'750');assert.equal(original.endMin,'760');
});
