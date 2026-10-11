const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function modules(){const c=vm.createContext({});for(const name of ['event-model.js','pomodoro-provider.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/runtime/views/task-timeline',name),'utf8'),c);return c.noriaTaskTimeline;}
const state={tasks:{a:{path:'Projects/Research/task.md',titleSnapshot:'Read evidence',sessions:[{start:'2026-10-10T09:00:00+08:00',end:'2026-10-10T09:20:00+08:00',mode:'WORK',recordRef:{path:'Diary/2026-10-10.md',id:'focus-example'},line:9}]}}};
test('project filtering keeps actual focus written in a diary, without changing its navigation source',()=>{
  const {eventModel:m,pomodoroProvider:p}=modules();const events=p.pomodoroStateToTimelineEvents(state).events;
  for(const sourceRoot of ['Projects/Research','Projects/Research/task.md']){
    const filtered=m.filterTimelineEvents(events,{sourceRoot,layers:['pomodoro']});
    assert.equal(filtered.length,1);assert.equal(filtered[0].source.path,'Diary/2026-10-10.md');assert.equal(filtered[0].source.anchor,'focus-example');
  }
  assert.equal(m.filterTimelineEvents(events,{sourceRoot:'Projects/Research/task.md-more'}).length,0);
  assert.equal(m.filterTimelineEvents(events,{sourceRoot:'Projects/Other'}).length,0);
});
test('filtering preserves an anchor through repeated normalization and still supports diary source search',()=>{
  const {eventModel:m,pomodoroProvider:p}=modules();const events=p.pomodoroStateToTimelineEvents(state).events;
  const twice=m.filterTimelineEvents(m.filterTimelineEvents(events,{}),{text:'source:Diary'});
  assert.equal(twice.length,1);assert.equal(twice[0].source.anchor,'focus-example');assert.equal(twice[0].source.line,9);
});
test('free focus cannot acquire an unrelated project merely because it shares a date',()=>{
  const {eventModel:m,pomodoroProvider:p}=modules();const free={tasks:{a:{titleSnapshot:'Free focus',sessions:state.tasks.a.sessions}}};
  assert.equal(m.filterTimelineEvents(p.pomodoroStateToTimelineEvents(free).events,{sourceRoot:'Projects/Research'}).length,0);
});
