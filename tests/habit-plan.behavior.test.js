const test=require("node:test"),assert=require("node:assert/strict"),P=require("../src/habit-plan.js"),{readHabitDefinitions,writeHabitDefinition}=require("../src/habit-definition.js");
test("new schedules preserve historical weekdays and reject retroactive changes",()=>{
 const old={name:"Read",stage:"active"},next=P.evolve(old,{...old,weekdays:"135",effective:"2026-09-28"},"2026-09-23");
 assert.equal(P.due(next,"2026-09-27"),true);assert.equal(P.due(next,"2026-09-29"),false);
 assert.throws(()=>P.evolve(old,{...old,weekdays:"135",effective:"2026-09-22"},"2026-09-23"));
 const created=P.evolve(null,{name:"New",weekdays:"1234567"},"2026-09-23");assert.equal(P.due(created,"2026-09-22"),false);
});
test("planned streak skips rest and pause dates, ignores extra check-ins, and tolerates unfinished today",()=>{
 const config={plan:"2026-09-01=135;2026-09-16=off;2026-09-21=135"},records={"2026-09-11":{done:true},"2026-09-14":{done:true},"2026-09-19":{done:true},"2026-09-21":{done:true}};
 assert.equal(P.summary(config,records,"2026-09-23").streak,3);
 assert.equal(P.summary(config,records,"2026-09-24").streak,0);
 records["2026-09-23"]={done:true};assert.deepEqual(P.summary(config,records,"2026-09-23"),{streak:4,planned:3,done:2,actualDone:2,historyMissing:false,daily:false,todayPlanned:true});
});
test("backfilled check-ins count this week before the first schedule; an explicit earlier start preserves later changes",()=>{
 const config={name:"Exercise",stage:"active",weekdays:"12457",plan:"0001-01-01=off;2026-09-26=12457;2026-09-28=off;2026-10-01=135"};
 const records=Object.fromEntries([21,22,23,24,25].map(d=>[`2026-09-${d}`,{done:true}]));
 assert.equal(P.summary(config,records,"2026-09-26").actualDone,5);
 assert.equal(P.summary(config,records,"2026-09-26").historyMissing,true);
 const updated=P.evolve(config,{...config,startedOn:"2026-09-21"},"2026-09-26");
 assert.equal(updated.plan,"0001-01-01=off;2026-09-21=12457;2026-09-28=off;2026-10-01=135");
 assert.equal(P.summary(updated,records,"2026-09-26").streak,4);
 assert.equal(P.summary(updated,records,"2026-09-26").historyMissing,false);
 assert.equal(P.streakEnds(updated,records,"2026-09-26")["2026-09-25"],4);
 records["2026-09-25"].done=false;
 assert.equal(P.summary(updated,records,"2026-09-26").actualDone,4);
 assert.throws(()=>P.evolve(config,{...config,startedOn:"2026-09-27"},"2026-09-26"));
 const created=P.evolve(null,{name:"Read",weekdays:"1234567",startedOn:"2026-09-21"},"2026-09-26");
 assert.equal(P.due(created,"2026-09-21"),true);
});
test("streak is independent of the visible 21 days and explicit withdrawal breaks it",()=>{
 const records={};for(let i=1;i<=31;i++)records[`2026-08-${String(i).padStart(2,"0")}`]={done:true};
 assert.equal(P.summary({},records,"2026-08-31").streak,31);records["2026-08-28"]={done:false};assert.equal(P.summary({},records,"2026-08-31").streak,3);
});
test("definition editing records pause intervals without rewriting dated records",()=>{
 let raw="## 打卡中的习惯\n- Read\n\n## 历史\n- [x] Read #habit [due:: 2026-09-20]\n";
 let old=readHabitDefinitions(raw)[0];raw=writeHabitDefinition(raw,old,{...old,icon:"book-open",color:"#112233",stage:"paused"},{today:"2026-09-23",id:"read"});
 old=readHabitDefinitions(raw)[0];assert.equal(P.due(old,"2026-09-23"),false);assert.equal(P.due(old,"2026-09-20"),true);assert.equal(old.icon,"book-open");
 raw=writeHabitDefinition(raw,old,{...old,stage:"active"},{today:"2026-09-25"});const resumed=readHabitDefinitions(raw)[0];assert.equal(P.due(resumed,"2026-09-24"),false);assert.equal(P.due(resumed,"2026-09-25"),true);assert.match(raw,/\[due:: 2026-09-20\]/);
});
