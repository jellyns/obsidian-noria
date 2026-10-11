const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');

function fixture({ filled = true, expected = 1, recent = false } = {}) {
  let callback, pending, queries = 0, repairs = 0;
  const grid = { isConnected: true };
  const cell = { getAttribute: key => key === 'data-date' ? '2031-01-15' : '1' };
  const attrs = new Map(recent ? [['data-tc-mo-ts', String(Date.now())]] : []);
  const box = {
    closest: () => cell, querySelector: () => null,
    getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value)
  };
  const target = { nodeType: 1, closest: selector => selector === '.cellContent' ? box : null, matches: () => false };
  const c = vm.createContext({
    rootNode: { getAttribute: () => 'month', querySelector: () => grid, contains: () => true },
    tcCellMoBound: false, plannerChromeInteractionActive: false, tcMoDebounceTimer: null,
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} },
    setTimeout: fn => { pending = fn; return 1; }, clearTimeout() {},
    sumBucketExpectForDate: () => { queries++; return expected; },
    upgradeCellContentToRuntimeBacked: () => box, dedupeMonthCellTasks() {},
    countCalItemsInHost: () => filled ? 1 : 0,
    renderTasksIntoHost: () => { repairs++; filled = true; }, commitMonthLayout() {}, console
  });
  const start = source.indexOf('function bindTasksCalendarCellContentObserver()');
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
  c.bindTasksCalendarCellContentObserver();
  return {
    notify(count) { callback(Array.from({ length: count }, () => ({ target, type: 'childList', addedNodes: [], removedNodes: [] }))); pending(); },
    result: () => ({ queries, repairs })
  };
}

test('already populated cells do not query all tasks for each title or checkbox mutation', () => {
  const f = fixture(); f.notify(100);
  assert.deepEqual(f.result(), { queries: 0, repairs: 0 });
});
test('an emptied cell still restores expected tasks once per mutation batch', () => {
  const f = fixture({ filled: false }); f.notify(100);
  assert.deepEqual(f.result(), { queries: 1, repairs: 1 });
});
test('an empty date with no expected tasks is queried only once in a batch', () => {
  const f = fixture({ filled: false, expected: 0 }); f.notify(100);
  assert.deepEqual(f.result(), { queries: 1, repairs: 0 });
});
test('recently repaired cells respect the existing cooldown without scanning tasks', () => {
  const f = fixture({ filled: false, recent: true }); f.notify(100);
  assert.deepEqual(f.result(), { queries: 0, repairs: 0 });
});
