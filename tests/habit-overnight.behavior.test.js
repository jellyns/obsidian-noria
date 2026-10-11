const test=require('node:test'),assert=require('node:assert/strict');
const {DiaryHabitStore}=require('../src/diary-habits.js');

test('one night follows both dated sources, including a later creation or removal',async()=>{
 const registry='## Active habits\n- Sleep [type:: sleep] [target:: 00:30]\n';
 const notes={'Habits.md':registry,'Diary/2026-10-11.md':'- [ ] Sleep #tl/sleep [start:: 2026-10-11 00:20] [due:: 2026-10-11 07:00]\n'};
 const p={getLocalYmd:()=> '2026-10-11',getManagedPath:()=> 'Habits.md',buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:'Habits.md'}}),resolveCalendarNoteSpecAsync:async(_,date)=>({date,path:`Diary/${date}.md`}),loadTextFromVault:async path=>notes[path]||'',pagesForManagedPath:()=>Object.keys(notes).filter(path=>path.startsWith('Diary/')).map(path=>({file:{path}}))};
 const store=new DiaryHabitStore(p),night='2026-10-10';let day=await store.load(night);
 assert.deepEqual(day.sourcePaths,['Diary/2026-10-10.md','Diary/2026-10-11.md']);
 assert.equal(day.records[0].date,night);assert.equal(day.records[0].done,true);assert.equal(day.records[0].end,'07:00');assert.equal(day.records[0].task.path,'Diary/2026-10-11.md');
 assert.equal((await store.load('2026-10-11')).records.length,0);
 notes['Diary/2026-10-11.md']=notes['Diary/2026-10-11.md'].replace('00:20','01:10');
 day=await store.load(night);assert.equal(day.records[0].done,false);assert.equal((await store.history(day.active)).Sleep[night].done,false);
 delete notes['Diary/2026-10-11.md'];day=await store.load(night);assert.equal(day.records.length,0);assert.equal(day.sourcePaths.length,2);
 notes['Diary/2026-10-10.md']='- [ ] Sleep #habit [type:: sleep] [due:: 2026-10-10]\n';
 notes['Diary/2026-10-11.md']='- [ ] Sleep #tl/sleep [start:: 2026-10-11 00:20] [due:: 2026-10-11 07:00]\n';
 day=await store.load(night);assert.equal(day.records[0].done,false,'explicit withdrawal overrides the timeline projection');assert.equal(day.sourcePaths.length,2);
});
