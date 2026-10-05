const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/runtime/views/tasks-calendar/runtime-core.js'), 'utf8');
const code = source.slice(source.indexOf('function getMonthGridCellFromPoint'), source.indexOf('function scheduleMonthTaskDragBind'));

function fixture() {
  const listeners = new Map(), attrs = new Map(), classes = new Set(), handlers = new Map(), saved = [];
  const cells = [16, 17, 18].map((day, i) => ({
    getAttribute: () => `2026-09-${day}`,
    getBoundingClientRect: () => ({ left: 100 + i * 100, right: 200 + i * 100, top: -120, bottom: 400 }),
    classList: { add() {}, remove() {} }
  }));
  const wrapper = { querySelectorAll: () => cells, getBoundingClientRect: () => ({top: 80, bottom: 220}) };
  const bar = {
    classList: { contains: n => n === 'tc-month-span-overlay-item' || classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n) },
    closest: sel => sel === '.wrapper' ? wrapper : sel === '.tc-month-span-overlay-item' ? bar : null,
    getAttribute: name => attrs.get(name) || null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name), hasAttribute: name => attrs.has(name),
    addEventListener: (name, fn) => handlers.set(name, fn), style: {},
    setPointerCapture() {}, releasePointerCapture() {}
  };
  const doc = {
    elementFromPoint: (x, y) => x >= 100 && x < 400 && y >= 80 && y < 220 ? bar : null,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)
  };
  const root = { ownerDocument: doc, getAttribute: () => 'month', contains: el => el === bar || cells.includes(el),
    querySelectorAll: sel => sel.includes('drop-target') ? [] : sel.includes('overlay-item') ? [bar] : [] };
  const date = value => ({
    value: value instanceof Object ? value.value : new Date(value + 'T00:00:00Z').getTime(),
    clone() { return date(this); }, add(days) { this.value += days * 86400000; return this; },
    diff(other) { return (this.value - other.value) / 86400000; },
    format() { return new Date(this.value).toISOString().slice(0, 10); }
  });
  const context = vm.createContext({ createCalendarDragFeedback:()=>({update(){},close(){}}),showCalendarDragUndo(){},tasksCalendarRuntimeLocale:()=>"zh-CN",document: doc, rootNode: root, moment: date,
    plannerChromeInteractionActive: false, editModeActive: true, flushDeferredHydration() {}, flushDeferredTaskFreshRefresh() {},
    stageTaskMove: (el, start, end) => saved.push([start.format(), end.format()]),
    showBriefNotice() {}, tcRuntimeT: s => s, setTimeout() {}, console });
  vm.runInContext(code, context);
  context.buildTaskTemporalMomentsFromEl = () => ({ startM: date('2026-09-12'), endM: date('2026-09-23') });
  const event = (x, y = 120) => ({ currentTarget: bar, target: bar, button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
  return {context, bar, cells, handlers, listeners, saved, event};
}

test('scrolled month overlay resolves the date under the grabbed column', () => {
  const f = fixture();
  assert.equal(f.context.getMonthGridCellFromPoint(250, 120), f.cells[1]);
  assert.equal(f.context.getMonthGridCellFromPoint(250, 230), null);
});

test('continuous month bars receive drag binding and shift both dates from the grabbed day', () => {
  const f = fixture(); f.context.setupMonthTaskDrag();
  assert.equal(typeof f.handlers.get('pointerdown'), 'function');
  f.handlers.get('pointerdown')(f.event(250));
  f.listeners.get('pointermove')(f.event(350));
  f.listeners.get('pointerup')(f.event(350));
  assert.deepEqual(f.saved, [['2026-09-13', '2026-09-24']]);
});

test('leaving the month before pointer-up cancels instead of using the last hovered date', () => {
  const f = fixture(); f.context.onMonthTaskPointerDown(f.event(250));
  assert.equal(typeof f.listeners.get('pointermove'), 'function');
  f.listeners.get('pointermove')(f.event(350));
  f.listeners.get('pointerup')(f.event(450));
  assert.deepEqual(f.saved, []);
  f.context.onMonthTaskPointerDown(f.event(250));
  f.listeners.get('pointermove')(f.event(350));
  f.listeners.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(f.listeners.size,0);
  assert.deepEqual(f.saved,[]);
});

test('checkbox targets and pointer cancellation never reschedule a continuous bar', () => {
  const f = fixture();
  const checkbox = {...f.event(250), target: { closest: () => ({}) }};
  f.context.onMonthTaskPointerDown(checkbox);
  assert.equal(f.listeners.size, 0);
  f.context.onMonthTaskPointerDown(f.event(250));
  assert.equal(typeof f.listeners.get('pointercancel'), 'function');
  f.listeners.get('pointercancel')(f.event(350));
  assert.equal(f.listeners.size, 0);
  assert.deepEqual(f.saved, []);
});

test('a completed drag suppresses the ensuing click before asynchronous saving finishes', () => {
  const f=fixture();f.context.editModeActive=false;
  f.context.mdTaskAdapter={saveDateTime:()=>new Promise(()=>{})};
  f.context.onMonthTaskPointerDown(f.event(250));
  f.listeners.get('pointermove')(f.event(350));
  f.listeners.get('pointerup')(f.event(350));
  assert.equal(f.bar.getAttribute('data-suppress-click'),'true');
  assert.equal(f.context.plannerChromeInteractionActive,true);
});

test('month saving releases the freeze once and schedules one fresh pass on success or failure', async () => {
  for(const fail of [false,true]) {
    const f=fixture(),passes=[];let settle;
    f.context.editModeActive=false;
    f.context.console={error(){}};f.context.showDebugNotice=()=>{};
    f.context.scheduleTasksCalendarSoftRefresh=()=>passes.push('fresh');
    f.context.mdTaskAdapter={saveDateTime:()=>new Promise((resolve,reject)=>{settle=()=>fail?reject(Error('write failed')):resolve({})})};
    f.context.onMonthTaskPointerDown(f.event(250));
    f.listeners.get('pointermove')(f.event(350));
    const pending=f.listeners.get('pointerup')(f.event(350));
    assert.equal(f.context.plannerChromeInteractionActive,true);
    assert.deepEqual(passes,[]);
    settle();await pending;
    assert.equal(f.context.plannerChromeInteractionActive,false);
    assert.deepEqual(passes,['fresh']);
  }
});

test('single-day rows expose real date endpoints before any drag; continuation segments expose only their own edge', () => {
  const context=vm.createContext({tasksCalendarRuntimeLocale:()=> 'en',
    readTaskCalendarDate:(raw,key)=>({date:raw.includes('['+key+'::')?'2026-09-26':''})});
  vm.runInContext(source.slice(source.indexOf('function syncMonthTaskDateHandles('),source.indexOf('function setupMonthTaskDrag(')),context);
  for(const [raw,pos,wanted] of [
    ['[start:: 2026-09-26] [due:: 2026-09-26]','single',['start','due']],
    ['[due:: 2026-09-26]','single',['due']],
    ['[scheduled:: 2026-09-26]','single',[]],
    ['[start:: 2026-09-26] [due:: 2026-09-29]','start',['start']],
    ['[start:: 2026-09-26] [due:: 2026-09-29]','middle',[]],
    ['[start:: 2026-09-26] [due:: 2026-09-29]','end',['due']]
  ]) {
    const children=[],classes=new Set();
    const row={classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},getAttribute:()=>encodeURIComponent(raw),querySelectorAll:()=>[...children],appendChild:h=>children.push(h),
      ownerDocument:{createElement:()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v},remove(){children.splice(children.indexOf(this),1)}})}};
    context.syncMonthTaskDateHandles(row,pos);context.syncMonthTaskDateHandles(row,pos);
    assert.deepEqual(children.map(h=>h.attrs['data-edge']),wanted);
    assert.deepEqual([...classes].sort(),wanted.map(edge=>'tc-month-resizable-'+edge).sort());
    context.syncMonthTaskDateHandles(row,'middle');
    assert.equal(classes.size,0,'continuation resets both endpoint spacing states');
  }
});
