const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function modules() {
  const context = vm.createContext({ console, __NORIA_TASK_TIMELINE_TEST__: true });
  for (const file of ['pomodoro-state.js', 'pomodoro-binding.js', 'pomodoro-provider.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/runtime/views/task-timeline', file), 'utf8'), context);
  }
  return context.noriaTaskTimeline;
}
const meta = { taskKey: 'task-a', path: 'Projects/Review.md', lineHint: 0, textFingerprint: 'review', title: 'Review evidence' };
const at = time => `2026-10-09T${time}:00+08:00`;
const plain = value => JSON.parse(JSON.stringify(value));
function freeze(value) { Object.freeze(value); for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return value; }

test('focus events keep a separate duration and link to the editable Markdown record',()=>{
  const {pomodoroProvider:p}=modules();
  const event=p.pomodoroStateToTimelineEvents({tasks:{a:{titleSnapshot:'阅读',path:'Project.md',sessions:[{mode:'WORK',timerMode:'stopwatch',start:at('09:00'),end:'2026-10-09T09:00:20+08:00',recordRef:{path:'Diary.md',id:'focus-1'},line:8}]}}},{locale:'zh-CN'}).events[0];
  assert.equal(event.title,'阅读');assert.equal(event.presentation.durationLabel,'20秒');assert.equal(event.source.path,'Diary.md');assert.equal(event.source.line,8);assert.equal(event.color,'');
});
test('runtime timer publishes its API without replacing Obsidian ambient module exports',()=>{
  const ambient={exports:{keep:true}},context=vm.createContext({module:ambient});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/runtime/views/task-timeline/pomodoro-state.js'),'utf8'),context);
  assert.equal(typeof context.noriaTaskTimeline.pomodoroState.startPomodoroWorkState,'function');
  assert.deepEqual(ambient.exports,{keep:true});
});
function vertical() {
  const moment = () => ({startOf(){return this;},format(){return '2026-10-09';},isValid(){return true;},isBefore(){return false;},hours(){return 12;},minutes(){return 0;}});
  const context = vm.createContext({console,moment,__NORIA_TL_TEST__:true});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/runtime/views/task-timeline/pomodoro-state.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/runtime/views/tasks-timeline/view.js'),'utf8'),context);
  return context.__noriaTimelineTestHooks;
}
function persist(state) {
  const source = fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const method = source.slice(source.indexOf('  normalizePomodoroState(raw) {'),source.indexOf('  normalizePlannerLabControls(raw) {'));
  const context = vm.createContext({clonePomodoroDefaults:()=>({workLen:25,breakLen:5}),normalizePomodoroTaskKey:key=>key,state});
  return vm.runInContext(`({${method}}).normalizePomodoroState(state)`,context);
}

test('vertical timer and plugin persistence retain pauses across reloads', () => {
  const v=vertical(),{pomodoroProvider:p}=modules();
  let s=v.startPomodoroWork({workLen:60},meta,at('09:00'));
  s=persist(v.pausePomodoro(s,at('09:15')));
  s=v.resumePomodoro(s,at('09:30'));
  s=persist(v.pausePomodoro(s,at('09:40')));
  const session=Object.values(s.tasks)[0].sessions[0];
  assert.deepEqual(plain(session.segments),[{start:at('09:00'),end:at('09:15')},{start:at('09:30'),end:at('09:40')}]);
  assert.equal(s.active.elapsedMs,25*60000);
  assert.equal(p.pomodoroStateToTimelineEvents(s,{now:at('10:00')}).events.length,2);
});

test('late vertical tick ends at the target instead of counting time away as work', () => {
  const v=vertical();
  let s=v.startPomodoroWork({workLen:25,breakLen:5,autostartBreak:false},meta,at('09:00'));
  s=v.tickPomodoro(s,at('10:00'));
  const sessions=Object.values(s.tasks)[0].sessions;
  assert.equal(Date.parse(sessions[0].end),Date.parse(at('09:25')));
  assert.equal(sessions[0].durationMs,25*60000);
  assert.equal(s.active.status,'paused');
  assert.deepEqual(plain(sessions[1].segments),[]);
});

test('horizontal timer respects disabled and manually started breaks', () => {
  const b=modules().pomodoroBinding;
  let s=b.startOrTogglePomodoroState({workLen:25,breakLen:0},meta,at('09:00'));
  s=b.advancePomodoroState(s,at('10:00'));
  assert.equal(s.active,null);
  assert.equal(s.tasks['task-a'].sessions.length,1);
  s=b.startOrTogglePomodoroState({workLen:25,breakLen:5,autostartBreak:false},meta,at('09:00'));
  s=b.advancePomodoroState(s,at('10:00'));
  assert.equal(s.active.mode,'BREAK');
  assert.equal(s.active.status,'paused');
  assert.deepEqual(plain(s.tasks['task-a'].sessions[1].segments),[]);
});

test('paused work preserves two real spans and never paints the intervening break', () => {
  const { pomodoroBinding: b, pomodoroProvider: p } = modules();
  let s = b.startOrTogglePomodoroState({workLen: 60}, meta, at('09:00'));
  s = b.startOrTogglePomodoroState(s, meta, at('09:20'));
  const paused = p.pomodoroStateToTimelineEvents(s, {now: at('09:29')}).events;
  assert.deepEqual(plain(paused.map(e => [e.start, e.end])), [[at('09:00'), at('09:20')]]);
  s = b.startOrTogglePomodoroState(s, meta, at('09:30'));
  const running = p.pomodoroStateToTimelineEvents(s, {now: at('09:40')}).events;
  assert.deepEqual(plain(running.map(e => [e.start, e.end])), [[at('09:00'), at('09:20')], [at('09:30'), at('09:40')]]);
  s = b.stopPomodoroState(s, at('09:50'));
  assert.equal(s.tasks['task-a'].sessions[0].durationMin, 40);
  assert.equal(s.tasks['task-a'].sessions[0].durationMs, 40 * 60000);
  assert.equal(s.tasks['task-a'].actual, 0);
  assert.deepEqual(plain(p.pomodoroStateToTimelineEvents(s).events.map(e => [e.start,e.end])), [[at('09:00'),at('09:20')],[at('09:30'),at('09:50')]]);
});

test('state transitions never modify saved input or share session segments with it', () => {
  const { pomodoroBinding: b } = modules();
  const original = freeze(plain(b.startOrTogglePomodoroState({}, meta, at('09:00'))));
  const before = JSON.stringify(original);
  const stopped = b.stopPomodoroState(original, at('09:05'));
  assert.equal(JSON.stringify(original), before);
  assert.equal(stopped.tasks['task-a'].sessions[0].end, at('09:05'));
  assert.equal(stopped.tasks['task-a'].lineHint, 0);
});

test('ending while paused keeps the last real end and does not extend the span', () => {
  const { pomodoroBinding: b, pomodoroProvider: p } = modules();
  let s = b.startOrTogglePomodoroState({}, meta, at('09:00'));
  s = b.startOrTogglePomodoroState(s, meta, at('09:10'));
  s = b.stopPomodoroState(s, at('10:00'));
  assert.equal(s.tasks['task-a'].sessions[0].durationMs, 600000);
  assert.equal(p.pomodoroStateToTimelineEvents(s).events[0].end, at('09:10'));
  assert.deepEqual(plain(b.stopPomodoroState(s, at('10:01'))), plain(s));
});

test('automatic finish uses effective work after pause, then starts the real break', () => {
  const { pomodoroBinding: b, pomodoroProvider: p } = modules();
  let s = b.startOrTogglePomodoroState({workLen:25,breakLen:5}, meta, at('09:00'));
  s = b.startOrTogglePomodoroState(s, meta, at('09:10'));
  s = b.startOrTogglePomodoroState(s, meta, at('09:20'));
  s = b.advancePomodoroState(s, at('09:36'));
  assert.equal(s.tasks['task-a'].sessions[0].durationMs, 1500000);
  assert.equal(s.tasks['task-a'].actual, 1);
  const work = p.pomodoroStateToTimelineEvents(s,{now:at('09:36')}).events.filter(e => e.kind === 'work');
  assert.equal(work.length, 2);
  assert.equal(Date.parse(work[1].end), Date.parse(at('09:35')));
  assert.equal(s.active.mode, 'BREAK');
});

test('short work retains seconds and never invents a full minute or a future span', () => {
  const { pomodoroBinding: b, pomodoroProvider: p } = modules();
  let s = b.startOrTogglePomodoroState({}, meta, at('09:00'));
  assert.equal(p.pomodoroStateToTimelineEvents(s,{now:at('09:00')}).events.length, 0);
  s = b.stopPomodoroState(s, '2026-10-09T09:00:20+08:00');
  assert.equal(s.tasks['task-a'].sessions[0].durationMs, 20000);
  assert.equal(p.pomodoroStateToTimelineEvents(s).events[0].end, '2026-10-09T09:00:20+08:00');
});

test('legacy completed sessions remain readable without invented pause segments', () => {
  const { pomodoroBinding:b, pomodoroProvider:p } = modules();
  const old = {tasks:{old:{titleSnapshot:'Legacy task',sessions:[{mode:'WORK',start:at('09:00'),end:at('09:30'),durationMin:20}]}}};
  assert.equal(b.normalizePomodoroState(old).tasks.old.sessions[0].segments, undefined);
  assert.equal(p.pomodoroStateToTimelineEvents(old).events.length, 1);
});
