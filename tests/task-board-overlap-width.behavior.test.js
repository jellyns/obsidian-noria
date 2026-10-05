const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const code = source.slice(source.indexOf('function applyPlannerChromeOverlapLayout('), source.indexOf('var tcWeekAdaptiveStableState'));

function layout(intervals) {
  const tasks = intervals.map(([start, end], id) => {
    const attrs = { 'data-start-min': String(start), 'data-end-min': String(end) }, styles = {};
    return { id, start, end, attrs, styles,
      getAttribute: key => attrs[key], setAttribute: (key, value) => attrs[key] = value,
      removeAttribute: key => delete attrs[key],
      style: { setProperty: (key, value) => styles[key] = value, removeProperty: key => delete styles[key] } };
  });
  const lane = { querySelectorAll: () => tasks };
  const context = vm.createContext({ rootNode: {}, isPlannerChromeTimelineView: () => true,
    getPlannerChromeTimelineStartMin: () => 0, getPlannerChromeTimelineEndMin: () => 1440,
    computePlannerChromeExpandedSlotBounds: (a,b,s,e) => ({s,e}), getTaskIdentityKey: el => String(el.id) });
  vm.runInContext(code, context);context.applyPlannerChromeOverlapLayout([lane]);
  return tasks.map(t => ({ ...t, left: parseFloat(t.styles['--ov-left'] || '0'), width: parseFloat(t.styles['--ov-width'] || '100') }));
}

test('a long task no longer keeps a later non-busy interval at the earlier peak width', () => {
  const tasks = layout([[0,600],[0,120],[0,120],[0,120],[180,240]]);
  assert.ok(tasks[4].width > 2.5 * tasks[1].width);
  assert.equal(tasks[0].left, 0);
  assert.ok(tasks[4].left >= tasks[0].left + tasks[0].width);
});

test('expansion stops before an occupied column and leaves touching intervals independent', () => {
  const tasks = layout([[0,600],[0,100],[0,300],[100,200],[600,700]]);
  for (let i=0;i<tasks.length;i++) for (let j=i+1;j<tasks.length;j++) {
    const a=tasks[i],b=tasks[j];
    if(a.start<b.end && b.start<a.end) assert.ok(a.left+a.width<=b.left+0.002 || b.left+b.width<=a.left+0.002);
  }
  assert.equal(tasks[4].width, 100);
  assert.ok(tasks[3].width < 50);
});
