const test=require("node:test"),assert=require("node:assert/strict"),{DiaryHabitStore}=require("../src/diary-habits.js"),P=require("../src/habit-plan.js");
test("full habit history resolves aliases and lets dated withdrawals override legacy completion",async()=>{
 const notes={"Habits.md":"- [x] Old #habit [due:: 2026-09-21]\n","Diary/21.md":"- [ ] Old #habit [due:: 2026-09-21] [habit-id:: read]\n","Diary/22.md":"- [x] New #habit [due:: 2026-09-22] [habit-id:: read]\n\n```md\n- [x] New #habit [due:: 2026-09-23]\n```"};
 const p={getLocalYmd:()=>"2026-09-23",getManagedPath:()=>"Habits.md",loadTextFromVault:async path=>notes[path],pagesForManagedPath:()=>Object.keys(notes).filter(path=>path.startsWith("Diary/")).map(path=>({file:{path,tasks:[{text:"",completed:true}]}}))};
 const config={name:"New",id:"read",aliases:"Old"},rows=await new DiaryHabitStore(p).history([config]);
 assert.equal(rows.New["2026-09-21"].done,false);assert.equal(P.summary(config,rows.New,"2026-09-23").streak,1);
 assert.equal(rows.New["2026-09-23"],undefined);
});
