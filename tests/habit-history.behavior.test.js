const test=require("node:test"),assert=require("node:assert/strict"),{DiaryHabitStore}=require("../src/diary-habits.js"),P=require("../src/habit-plan.js");
test("full habit history resolves aliases and lets dated withdrawals override legacy completion",async()=>{
 const notes={"Habits.md":"- [x] Old #habit [due:: 2026-09-21]\n","Diary/21.md":"- [ ] Old #habit [due:: 2026-09-21] [habit-id:: read]\n","Diary/22.md":"- [x] New #habit [due:: 2026-09-22] [habit-id:: read]\n\n```md\n- [x] New #habit [due:: 2026-09-23]\n```"};
 const p={getLocalYmd:()=>"2026-09-23",getManagedPath:()=>"Habits.md",loadTextFromVault:async path=>notes[path],pagesForManagedPath:()=>Object.keys(notes).filter(path=>path.startsWith("Diary/")).map(path=>({file:{path,tasks:[{text:"",completed:true}]}}))};
 const config={name:"New",id:"read",aliases:"Old"},rows=await new DiaryHabitStore(p).history([config]);
 assert.equal(rows.New["2026-09-21"].done,false);assert.equal(P.summary(config,rows.New,"2026-09-23").streak,1);
 assert.equal(rows.New["2026-09-23"],undefined);
});
test("linked history reads the dated property and historical goal instead of a stale checkbox",async()=>{
 const registry="## Paused habits\n- Reading [type:: number] [target:: 20] [unit:: hours] [record-field:: minutes] [habit-id:: read]\n";
 const notes={"Habits.md":registry,"Diary/2026-08-01.md":'minutes: 12\n- [ ] Old [type:: number] [target:: 10] [unit:: minutes] [habit-id:: read] #habit [due:: 2026-08-01]\n',"Diary/2026-08-02.md":'minutes: 0\n- [x] Old [type:: number] [target:: 10] [unit:: minutes] [habit-id:: read] #habit [due:: 2026-08-02]\n',"Diary/2026-08-03.md":'- [x] Old [type:: number] [target:: 10] [unit:: minutes] [habit-id:: read] #habit [due:: 2026-08-03]\n'};
 const config=require("../src/habit-definition.js").readHabitDefinitions(registry)[0],reads=[];
 const p={getLocalYmd:()=>"2026-10-06",getManagedPath:()=>"Habits.md",buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:"Habits.md"}}),resolveCalendarNoteSpecAsync:async(_,date)=>({path:`Diary/${date}.md`}),
  loadTextFromVault:async path=>{reads.push(path);return notes[path]||"";},pagesForManagedPath:()=>Object.keys(notes).filter(path=>path.startsWith("Diary/")).map(path=>({file:{path}})),
  records:{definitions:()=>[{property:"minutes",type:"number"}],read:raw=>{const match=/^minutes: (\d+)/m.exec(raw);return match?Number(match[1]):null;}}};
 const store=new DiaryHabitStore(p),history=(await store.history([config])).Reading;
 assert.deepEqual([history["2026-08-01"].value,history["2026-08-01"].done,history["2026-08-01"].target,history["2026-08-01"].unit],[12,true,"10","minutes"]);
 assert.deepEqual([history["2026-08-02"].value,history["2026-08-02"].done],[0,false]);
 assert.deepEqual([history["2026-08-03"].value,history["2026-08-03"].done],["",false]);
 assert.equal(reads.length,new Set(reads).size,"reuse already loaded notes within the history scan");
 for(const date of Object.keys(history)){
  const row=(await store.load(date)).records[0];
  for(const key of ["value","done","target","unit"])assert.equal(history[date][key],row[key],`${date}: ${key} matches the diary`);
 }
});
