const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const context = vm.createContext({});
const tokens = source.match(/var plannerTimeTypography = [^;]+;/)[0];
const start = source.indexOf('\tfunction decidePlannerChromeTimePlacement(');
vm.runInContext(tokens + source.slice(start, source.indexOf('\n\tfunction setAttrIfChanged', start)), context);
const base = { usableWidth: 150, usableHeight: 100, overlapCols: 3, approxTitlePx: 60,
  timeTexts: { start: '09:00', end: '11:30' }, measuredFullNeed: 78, measuredStackNeed: 30, startTimeNeed: 30 };

test('wide day and week blocks keep a full single-line interval even among overlapping tasks', () => {
  for (const view of ['day', 'week']) {
    const result = context.decidePlannerChromeTimePlacement(null, { ...base, view });
    assert.equal(result.placement, 'range-corner');
    assert.equal(result.nearTitle, true);
  }
});

test('wrapped titles reserve their measured height before the adjacent time',()=>{
 const element={querySelector:()=>({getBoundingClientRect:()=>({height:34})})};
 const result=context.decidePlannerChromeTimePlacement(element,{...base,view:'day'});
 assert.ok(result.nearTitle);assert.ok(result.timeTopPx>=38);
});

test('narrow blocks stack only when both lines and their spacing fit; shorter blocks degrade without clipping', () => {
  for (const view of ['day', 'week']) {
    const decide = height => context.decidePlannerChromeTimePlacement(null, { ...base, view, usableWidth: 70, usableHeight: height });
    const tall = decide(100);
    assert.equal(tall.placement, 'range-stack');
    assert.ok(!tall.nearTitle);
    assert.ok(tall.timeBandPx >= 2 * 14 + 1 + 5);
    assert.equal(decide(60).placement, 'start-corner');
    assert.equal(decide(30).placement, 'hidden');
  }
});
