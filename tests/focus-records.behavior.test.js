const test=require('node:test'),assert=require('node:assert/strict');
const {FocusTimer}=require('../src/focus-timer.js');
const engine=require('../src/runtime/views/task-timeline/pomodoro-state.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const at=time=>new Date('2026-10-10T'+time).toISOString();
const meta={taskKey:'zp_test',path:'Projects/Test.md',title:'阅读并摘录',lineHint:1,textFingerprint:'read'};
function setup(initial){
  const files=new Map(),events={};let now=at('09:00:00'),failNote=false,failRefs=false,timer;
  const plugin={settings:{pomodoro:engine.normalizePomodoroState(initial||{})},registerEvent(){},
    getPomodoroState(){const raw=engine.normalizePomodoroState(this.settings.pomodoro);return timer?.records?timer.records.project(raw):raw;},
    normalizePomodoroState:engine.normalizePomodoroState,async saveSettings(){this.settings=clone(this.settings);if(failRefs&&Object.values(this.settings.pomodoro.tasks).some(r=>r.sessions.some(s=>s.recordRef)))throw Error('Settings disk full');},
    app:{workspace:{trigger(){}},vault:{on(name,fn){(events[name]||=[]).push(fn);},getAbstractFileByPath(path){return files.has(path)?{path}:null;},async read(file){return files.get(file.path);}}},
    async resolveCalendarNoteSpecAsync(mode,day){return {path:`Diary/${day}.md`};},
    async createCalendarNoteIfMissing(spec){if(!files.has(spec.path))files.set(spec.path,'## 记录\n原有文字。\n');return {file:{path:spec.path}};},
    async processTextAtVaultPath(path,fn){if(failNote)throw Error('Note disk full');files.set(path,fn(files.get(path)||''));}};
  timer=new FocusTimer(plugin,{interval:0,now:()=>now});
  return {timer,plugin,files,events,setNow:t=>now=at(t),failNote:value=>failNote=value,failRefs:value=>failRefs=value};
}
test('finished sessions become ordinary diary records and native edits drive the displayed duration',async()=>{
  const h=setup();await h.timer.start(meta,{mode:'stopwatch'});h.setNow('09:10:00');await h.timer.stop();
  const path='Diary/2026-10-10.md',raw=h.files.get(path);assert.match(raw,/## 记录\n原有文字。/);assert.match(raw,/09:00:00–09:10:00/);
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,600000);
  h.files.set(path,raw.replace('09:10:00','09:12:00'));await h.timer.records.load(path,'2026-10-10');
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,720000);
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].completed,false);
});
test('note write failure retains the stopped timer and retries exactly once without data loss',async()=>{
  const h=setup();await h.timer.start(meta);h.failNote(true);h.setNow('09:05:00');await h.timer.stop();
  assert.equal(h.timer.read().active,null);assert.equal(h.timer.read().tasks.zp_test.sessions[0].recording,true);assert.match(h.timer.recordError,/Note disk full/);
  h.failNote(false);await h.timer.retryRecords();await h.timer.retryRecords();
  assert.equal((h.files.get('Diary/2026-10-10.md').match(/\^focus-/g)||[]).length,1);assert.equal(h.timer.recordError,'');
});
test('retry after a saved note but failed reference save preserves a native edit',async()=>{
  const h=setup();await h.timer.start(meta);h.setNow('09:05:00');h.failRefs(true);await h.timer.stop();
  assert.match(h.timer.recordError,/Settings disk full/);const path='Diary/2026-10-10.md';
  h.files.set(path,h.files.get(path).replace('09:05:00','09:08:00'));h.failRefs(false);await h.timer.retryRecords();
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,480000);assert.equal((h.files.get(path).match(/\^focus-/g)||[]).length,1);
});
test('native delete and undo remain authoritative through another timer save',async()=>{
  const h=setup();await h.timer.start(meta);h.setNow('09:05:00');await h.timer.stop();
  const path='Diary/2026-10-10.md',raw=h.files.get(path);h.files.delete(path);await h.timer.records.load(path,'2026-10-10');assert.equal(h.timer.read().tasks.zp_test.sessions.length,0);
  h.setNow('09:10:00');await h.timer.start({...meta,taskKey:'zp_other',textFingerprint:'other',title:'另一任务',lineHint:2});
  h.files.set(path,raw);await h.timer.records.load(path,'2026-10-10');assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,300000);
});
test('reopening reads Markdown again instead of trusting the duration cached in settings',async()=>{
  const h=setup();await h.timer.start(meta);h.setNow('09:05:00');await h.timer.stop();const saved=clone(h.plugin.settings.pomodoro);h.timer.dispose();
  const next=setup(saved);next.files.set('Diary/2026-10-10.md',h.files.get('Diary/2026-10-10.md').replace('09:05:00','09:15:00'));
  await next.timer.records.initialize(saved);assert.equal(next.timer.read().tasks.zp_test.sessions[0].durationMs,900000);
});
test('legacy stored sessions are neither rewritten nor silently migrated into new notes',async()=>{
  const h=setup({tasks:{zp_old:{actual:1,sessions:[{start:at('08:00:00'),end:at('08:25:00'),mode:'WORK',durationMin:25,completed:true}]}}});
  await h.timer.retryRecords();assert.equal(h.files.size,0);assert.equal(h.timer.read().tasks.zp_old.actual,1);
});

test('renaming a diary keeps one canonical reference and continues native edit tracking',async()=>{
  const h=setup();await h.timer.start(meta,{mode:'stopwatch'});h.setNow('09:05:00');await h.timer.stop();
  const old='Diary/2026-10-10.md',path='Archive/2026-10-10.md';h.files.set(path,h.files.get(old));h.files.delete(old);
  h.events.rename.forEach(fn=>fn({path},old));await h.timer.queue;
  const sessions=h.plugin.settings.pomodoro.tasks.zp_test.sessions;
  assert.equal(sessions.length,1);assert.equal(sessions[0].recordRef.path,path);assert.equal(h.timer.records.documents.has(old),false);
  h.files.set(path,h.files.get(path).replace('09:05:00','09:08:00'));await h.timer.records.load(path,'2026-10-10');
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,480000);
});

test('a deleted record survives a folder rename for native undo without being reinserted at the old path',async()=>{
  const h=setup();await h.timer.start(meta);h.setNow('09:05:00');await h.timer.stop();
  const old='Diary/2026-10-10.md',raw=h.files.get(old),path='Journal/2026-10-10.md';h.files.set(old,'## 专注\n');await h.timer.records.load(old,'2026-10-10');
  h.files.set(path,h.files.get(old));h.files.delete(old);h.events.rename.forEach(fn=>fn({path:'Journal'},'Diary'));await h.timer.queue;
  assert.equal(h.timer.read().tasks.zp_test.sessions.length,0);
  assert.equal(h.plugin.settings.pomodoro.tasks.zp_test.sessions.length,1);
  h.files.set(path,raw);await h.timer.records.load(path,'2026-10-10');assert.equal(h.timer.read().tasks.zp_test.sessions[0].durationMs,300000);
});

test('immediate start and stop creates no empty diary or pending write',async()=>{
  const h=setup();await h.timer.start(meta);await h.timer.stop();assert.equal(h.files.size,0);
  assert.equal(h.timer.read().tasks.zp_test.sessions[0].recording,undefined);assert.equal(h.timer.recordError,'');
});

test('an external Markdown record is discovered from the native block index without a settings cache',async()=>{
  const h=setup(),path='Diary/2026-10-10.md';
  await h.timer.ready;
  h.files.set(path,'## 专注\n\n- 09:00–09:25 · [[Projects/Test|阅读]] · 番茄完成 ^focus-external\n');
  h.plugin.app.metadataCache={getFileCache:()=>({blocks:{'focus-external':{}}})};
  h.plugin.app.vault.getMarkdownFiles=()=>[{path,extension:'md'}];await h.timer.records.discover();
  const entries=Object.values(h.timer.read().tasks);assert.equal(entries.length,1);assert.equal(entries[0].sessions[0].durationMs,1500000);assert.equal(entries[0].actual,1);
  await h.timer.tick();assert.equal(Object.keys(h.plugin.settings.pomodoro.tasks).length,0);
  await h.timer.start(meta);assert.equal(Object.values(h.timer.read().tasks).flatMap(r=>r.sessions).filter(s=>s.recordRef).length,1);
  h.files.set(path,h.files.get(path).replace('09:25','09:30'));await h.timer.records.discover();
  assert.equal(Object.values(h.timer.read().tasks).flatMap(r=>r.sessions).find(s=>s.recordRef).durationMs,1800000);
});

test('focus discovery does not read ordinary note bodies or files without an interpretable date',async()=>{
  const h=setup(),reads=[],files=[{path:'Private.md',extension:'md'},{path:'Diary/2026-10-10.md',extension:'md'},{path:'Undated.md',extension:'md'}];
  await h.timer.ready;
  h.plugin.app.vault.getMarkdownFiles=()=>files;
  h.plugin.app.metadataCache={getFileCache:file=>({blocks:file.path==='Private.md'?{}:{'focus-manual':{}}})};
  h.files.set(files[1].path,'## 专注\n- 09:00–09:10 · 阅读 · 专注 ^focus-manual\n');
  const read=h.plugin.app.vault.read;h.plugin.app.vault.read=async file=>{reads.push(file.path);return read(file);};
  await h.timer.records.discover();assert.deepEqual(reads,['Diary/2026-10-10.md']);
});
