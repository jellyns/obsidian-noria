const test=require('node:test'),assert=require('node:assert/strict');
const {FocusTimer}=require('../src/focus-timer.js');
const engine=require('../src/runtime/views/task-timeline/pomodoro-state.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){
  let now='2026-10-09T23:50:00+08:00',fail=false,writes=0;const events={};
  const plugin={settings:{pomodoro:engine.normalizePomodoroState({})},
    normalizePomodoroState:engine.normalizePomodoroState,getPomodoroState(){return clone(this.settings.pomodoro);},
    async saveSettings(){if(fail)throw Error('disk unavailable');writes++;},
    registerEvent(){},app:{vault:{on(name,fn){events[name]=fn;}},workspace:{trigger(){}}}};
  const timer=new FocusTimer(plugin,{interval:0,now:()=>now});
  return {timer,plugin,events,setNow:value=>now=value,setFail:value=>fail=value,writes:()=>writes};
}
const task={taskKey:'zp_review',title:'Review',path:'Projects/Review.md',textFingerprint:'review',lineHint:0};
test('dropping the current task preserves its session, including a paused session',async()=>{
  const h=setup();await h.timer.start(task);await h.timer.pause();const before=h.timer.read();
  await h.timer.start(task,{guardRevision:0});assert.deepEqual(h.timer.read(),before);
});
test('a confirmed switch retains elapsed time and rejects stale confirmation from another card',async()=>{
  const h=setup();await h.timer.start(task,{mode:'stopwatch'});const revision=h.timer.read().revision;
  h.setNow('2026-10-09T23:55:00+08:00');const next={...task,taskKey:'zp_other',textFingerprint:'other',title:'Other'};
  await h.timer.start(next,{mode:'stopwatch',guardRevision:revision});
  assert.equal(h.timer.read().tasks[task.taskKey].sessions[0].durationMs,300000);
  await assert.rejects(h.timer.start(task,{guardRevision:revision}),/changed/);
  assert.equal(h.timer.read().active.taskKey,next.taskKey);
});
test('free timer keeps actual seconds across midnight without completing a task or a pomodoro',async()=>{
  const h=setup();await h.timer.start(task,{mode:'stopwatch'});h.setNow('2026-10-10T00:30:20+08:00');
  await h.timer.tick();assert.equal(h.timer.read().active.mode,'WORK');await h.timer.stop();
  const record=h.timer.read().tasks.zp_review;assert.equal(record.sessions[0].durationMs,2420000);assert.equal(record.actual,0);assert.equal(record.sessions[0].completed,false);
});
test('one lifecycle timer advances without a timeline or card mounted',async()=>{
  const h=setup();await h.timer.start(task);h.setNow('2026-10-10T00:20:00+08:00');await h.timer.tick();
  const state=h.timer.read();assert.equal(state.tasks.zp_review.actual,1);assert.equal(state.active.status,'paused');
  assert.equal(Date.parse(state.tasks.zp_review.sessions[0].end),Date.parse('2026-10-10T00:15:00+08:00'));
});
test('a stale second view cannot overwrite more recent timer activity',async()=>{
  const h=setup();await h.timer.start(task);const stale=h.timer.read();await h.timer.pause();
  await assert.rejects(h.timer.save(engine.stopPomodoroState(stale,'2026-10-10T00:01:00+08:00')),/changed/);
  assert.equal(h.timer.read().active.status,'paused');
});
test('failed timer save restores the prior state and a retry remains usable',async()=>{
  const h=setup();await h.timer.start(task);const before=h.timer.read();h.setFail(true);
  await assert.rejects(h.timer.pause(),/disk unavailable/);assert.deepEqual(h.timer.read(),before);
  h.setFail(false);await h.timer.pause();assert.equal(h.timer.read().active.status,'paused');
});
test('save failure also rolls back when settings serialization replaces the state object',async()=>{
  const h=setup();await h.timer.start(task);const before=h.timer.read();
  h.plugin.saveSettings=async()=>{h.plugin.settings={...h.plugin.settings,pomodoro:clone(h.plugin.settings.pomodoro)};throw Error('write failed');};
  await assert.rejects(h.timer.pause(),/write failed/);assert.deepEqual(h.timer.read(),before);
});
test('source rename preserves task and session identity without rewriting unrelated records',async()=>{
  const h=setup();await h.timer.start(task);h.events.rename({path:'Archive/Review.md'},'Projects/Review.md');await h.timer.queue;
  const state=h.timer.read();assert.equal(state.active.taskKey,'zp_review');assert.equal(state.tasks.zp_review.path,'Archive/Review.md');assert.equal(state.tasks.zp_review.sessions.length,1);
});
test('ordinary clock ticks update subscribers without writing settings every second',async()=>{
  const h=setup();await h.timer.start(task);let paints=0;h.timer.subscribe(()=>paints++);const writes=h.writes();
  h.setNow('2026-10-09T23:50:01+08:00');await h.timer.tick();assert.equal(h.writes(),writes);assert.equal(paints,1);
  h.timer.dispose();await h.timer.tick();assert.equal(paints,1);
});
test('same-titled tasks on separate lines have independent timer histories',()=>{
  const event=line=>({noria:{path:'Tasks.md',line,task:{rawLine:'- [ ] Read'}}});
  const first=engine.taskPomodoroMeta(event(1)),second=engine.taskPomodoroMeta(event(4));
  let state=engine.startPomodoroWorkState({},first,'2026-10-10T09:00:00+08:00');
  state=engine.startPomodoroWorkState(state,second,'2026-10-10T09:05:00+08:00');
  assert.notEqual(first.taskKey,second.taskKey);assert.equal(Object.keys(state.tasks).length,2);assert.equal(state.tasks[first.taskKey].sessions[0].durationMs,300000);
});
test('existing task ids preserve focus identity through title and scheduling edits',()=>{
  const event=(line,rawLine)=>({noria:{path:'Tasks.md',line,task:{rawLine}}});
  const before=engine.taskPomodoroMeta(event(1,'- [ ] Read [id:: read-book] [scheduled:: 2026-10-09]'));
  const after=engine.taskPomodoroMeta(event(4,'- [ ] Read chapter two [id:: read-book] [scheduled:: 2026-10-10]'));
  assert.equal(before.taskKey,after.taskKey);
  const state=engine.attachPomodoroState(engine.startPomodoroWorkState({},before,'2026-10-10T09:00:00+08:00'),after);
  assert.equal(state.tasks[before.taskKey].titleSnapshot,'Read chapter two');assert.equal(state.tasks[before.taskKey].sessions.length,1);
});

test('an explicit task edit preserves a running timer without requiring an id in Markdown',async()=>{
  const h=setup(),meta=(title,line)=>engine.taskPomodoroMeta({noria:{path:'Tasks.md',line,task:{rawLine:'- [ ] '+title}}});
  const before=meta('Read',0),other=meta('Read',4);await h.timer.start(other);h.setNow('2026-10-09T23:51:00+08:00');await h.timer.start(before,{mode:'stopwatch'});
  const after=meta('Read chapter two',2);await h.timer.rebindTask(before,after);
  const state=h.timer.read(),key=engine.resolvePomodoroTaskKey(state,after);
  assert.equal(key,before.taskKey);assert.equal(state.active.taskKey,key);assert.equal(state.tasks[key].titleSnapshot,'Read chapter two');
  assert.equal(state.tasks[other.taskKey].titleSnapshot,'Read');assert.equal(state.tasks[key].taskId,'');
  h.setNow('2026-10-09T23:55:00+08:00');await h.timer.stop();assert.equal(h.timer.read().tasks[key].sessions[0].durationMs,240000);
});
