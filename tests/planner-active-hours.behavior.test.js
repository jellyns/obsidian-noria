const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
function runtime() {
  const c = vm.createContext({ showEarlyHours: false, plannerActiveHours: {start: 450, end: 1380}, plannerHoursExpanded: false, PLANNER_CHROME_TIMELINE_START_MIN: 0, PLANNER_CHROME_TIMELINE_END_MIN: 1440 });
  for (const name of ['getPlannerChromeTimelineStartMin', 'getPlannerChromeTimelineEndMin', 'classifyPlannerHoursSlot', 'plannerHoursAxisMarks']) {
    const i = source.indexOf('function ' + name + '(');
    vm.runInContext(source.slice(i, source.indexOf('\nfunction ', i + 10)), c);
  }
  return c;
}
test('visible bounds retain non-hour precision and expand together without changing the configured range', () => {
  const c = runtime(), bounds = () => [c.getPlannerChromeTimelineStartMin(), c.getPlannerChromeTimelineEndMin()];
  assert.deepEqual(bounds(), [450, 1380]);
  c.plannerHoursExpanded = true; assert.deepEqual(bounds(), [0, 1440]);
  c.plannerHoursExpanded = false; assert.deepEqual(bounds(), [450, 1380]);
  c.showEarlyHours = true; assert.deepEqual(bounds(), [0, 1440]);
  assert.deepEqual(c.plannerActiveHours, {start:450,end:1380});
});
test('half-open intervals keep crossing tasks visible and distinguish scheduled outside tasks from unscheduled tasks', () => {
  const c = runtime(), cases = [
    ['none', undefined, undefined, false, false, false],
    ['range', 0, 450, true, false, true],
    ['range', 420, 480, true, false, false],
    ['range', 450, 1380, false, false, false],
    ['range', 1320, 1440, false, true, false],
    ['range', 1380, 1440, false, true, true],
    ['range', 0, 1440, true, true, false],
    ['point', 449, 449, true, false, true],
    ['point', 450, 450, false, false, false],
    ['point', 1380, 1380, false, true, true],
  ];
  for (const [slotType,startMin,endMin,before,after,outside] of cases) {
    const slot = {slotType,startMin,endMin}, original = {...slot};
    assert.deepEqual(JSON.parse(JSON.stringify(c.classifyPlannerHoursSlot(slot,450,1380))), {before,after,outside});
    assert.deepEqual(slot, original, 'classification must not rewrite task times');
  }
});
test('axis labels include exact range boundaries, retain whole hours, and avoid collisions', () => {
  const c=runtime();
  for (const [start,end,height] of [[450,1380,465],[470,1390,460],[0,1440,480],[460,520,44]]) {
    const marks=Array.from(c.plannerHoursAxisMarks(start,end,height));
    assert.equal(marks[0],start);assert.equal(marks.at(-1),end);
    assert.ok(marks.slice(1,-1).every(m=>m%60===0));
    assert.ok(marks.slice(1).every((m,i)=>(m-marks[i])/(end-start)*height>=15));
  }
});
