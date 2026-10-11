const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
function load(c, name) {
  const start = source.indexOf('function ' + name + '(');
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 10)), c);
}

test('month layout retains subscriptions and only updates replaced content hosts', () => {
  const observed = [], removed = [];
  const wrapper = {}, first = {}, next = {};
  let box = first;
  const grid = { querySelectorAll: selector => selector.includes('wrappers') ? [wrapper] : [box] };
  const c = vm.createContext({
    tcMonthLayoutRo: null, tcMonthLayoutRoGrid: null, tcMonthLayoutRoTargets: new Set(),
    ResizeObserver: class {
      observe(n) { observed.push(n); } unobserve(n) { removed.push(n); }
      disconnect() { removed.push('all'); }
    }
  });
  load(c, 'bindMonthLayoutResizeObserver');
  c.bindMonthLayoutResizeObserver(grid);
  c.bindMonthLayoutResizeObserver(grid);
  assert.deepEqual(observed, [grid, wrapper, first]);
  assert.deepEqual(removed, []);
  box = next; c.bindMonthLayoutResizeObserver(grid);
  assert.deepEqual(observed, [grid, wrapper, first, next]);
  assert.deepEqual(removed, [first]);
});

test('ready grid starts once without delayed full redraws while recovery listeners stay bound', () => {
  const queue = [], events = [], grid = {};
  const c = vm.createContext({
    rootNode: { isConnected: true },
    bindTasksCalendarCellContentObserver: () => events.push('content'),
    hydrateGridWhenReady: g => { assert.equal(g, grid); events.push('render'); },
    bindTasksCalendarIntersectionHydrate: () => events.push('visibility'),
    bindTasksCalendarWakeHydration: () => events.push('wake'),
    isPlannerChromeActive: () => false,
    setTimeout: fn => queue.push(fn), requestAnimationFrame: fn => queue.push(fn)
  });
  load(c, 'scheduleGridHydration'); c.scheduleGridHydration(grid);
  while (queue.length) queue.shift()();
  assert.deepEqual(events, ['content', 'render', 'visibility', 'wake']);
});

test('a hidden grid can retry when its dimensions become usable', () => {
  let ready = false, renders = 0;
  const queue = [], rect = () => ({ width: ready ? 800 : 0, height: ready ? 500 : 0 });
  const grid = { isConnected: true, getBoundingClientRect: rect };
  const c = vm.createContext({
    rootNode: { isConnected: true, getBoundingClientRect: rect },
    resolveHydrationGrid: g => g, setTimeout: fn => queue.push(fn),
    hydrateGridTaskCells: g => { assert.equal(g, grid); renders++; }
  });
  load(c, 'hydrateGridWhenReady'); c.hydrateGridWhenReady(grid, 0);
  assert.equal(renders, 0); ready = true; queue.shift()(); assert.equal(renders, 1);
});

function visibilityFixture(hydrated) {
  let callback, renders = 0;
  const attrs = new Map(), grid = { _noriaTaskCellsHydrated: hydrated };
  const c = vm.createContext({
    tcRuntimeDisposed: false, tcVisibleIoExpiryTimer: null, plannerChromeInteractionActive: false,
    rootNode: { isConnected: true, getAttribute: k => attrs.get(k), setAttribute: (k,v) => attrs.set(k,v), querySelector: () => grid },
    IntersectionObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() {} },
    setTimeout() {}, clearTimeout() {}, hydrateGridTaskCells: () => { renders++; }
  });
  load(c, 'bindTasksCalendarIntersectionHydrate'); c.bindTasksCalendarIntersectionHydrate();
  return { notify: isIntersecting => callback([{ isIntersecting }]), renders: () => renders };
}
test('first visibility notification preserves already mounted content; returning from hidden still restores it', () => {
  const f = visibilityFixture(true); f.notify(true); assert.equal(f.renders(), 0);
  f.notify(false); f.notify(true); assert.equal(f.renders(), 1);
});
test('first visible notification still hydrates a grid that was not ready', () => {
  const f = visibilityFixture(false); f.notify(true); assert.equal(f.renders(), 1);
});
test('binding wake listeners does not synthesize a wake; a real focus event still hydrates', () => {
  const listeners = new Map(), queue = [], grid = {};
  let renders = 0;
  const c = vm.createContext({
    tcRuntimeDisposed: false, tcWakeHydrationTimer: null,
    rootNode: { isConnected: true, getAttribute() {}, setAttribute() {} },
    document: { addEventListener() {} }, window: { addEventListener: (name,fn) => listeners.set(name,fn) },
    setTimeout: fn => { queue.push(fn); return 1; }, clearTimeout() {},
    hydrateGridWhenReady: g => { assert.equal(g,grid); renders++; }
  });
  load(c, 'bindTasksCalendarWakeHydration'); c.bindTasksCalendarWakeHydration(grid);
  assert.equal(queue.length, 0);
  listeners.get('focus')(); queue.shift()(); assert.equal(renders, 1);
});
