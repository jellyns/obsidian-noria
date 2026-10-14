const test=require("node:test"),assert=require("node:assert/strict");
const P=require("../src/picture-model.js"),N=require("../src/diary-navigation.js"),H=require("../src/habit-plan.js");
test("picture references accept arbitrary host icon ids, emoji and stable assets, not paths or markup",()=>{
 for(const value of ["lucide-bike","alarm-clock","asset:abc-123","emoji:"+encodeURIComponent("👨‍👩‍👧‍👦")])assert.equal(P.validPicture(value),true,value);
 for(const value of ["<svg>","C:/private.png","https://x/a.svg","emoji:%QQ","emoji:%0A"])assert.equal(P.validPicture(value),false,value);
});
test("asset rename keeps identity and handles folder boundaries",()=>{
 assert.deepEqual(P.renamedAssets({a:"Icons/a.svg",b:"Icons/sub/b.png",c:"Icons2/a.svg"},"Icons","Art"),{a:"Art/a.svg",b:"Art/sub/b.png",c:"Icons2/a.svg"});
});
test("asset and emoji survive habit definition serialization without changing its name",()=>{
 const {writeHabitDefinition,readHabitDefinitions}=require("../src/habit-definition.js");
 for(const icon of ["asset:abc-123","emoji:"+encodeURIComponent("📚")]){const raw=writeHabitDefinition("",null,{name:"阅读",icon},{id:"read"});const row=readHabitDefinitions(raw)[0];assert.equal(row.icon,icon);assert.equal(row.name,"阅读");}
});
test("group navigation moves the visible group and clamps month/year dates",()=>{
 assert.equal(N.shiftGroup({mode:"daily",anchorDate:"2026-12-29"},1).anchorDate,"2027-01-05");
 assert.equal(N.shiftGroup({mode:"monthly",anchorDate:"2024-02-29"},1).anchorDate,"2025-02-28");
 assert.equal(N.shiftGroup({mode:"weekly",anchorDate:"2026-09-23"},1).anchorDate,"2026-11-11");
});
test("picker opens on days and highlights the selected period across years",()=>{
 const state=N.pickerState({mode:"weekly",anchorDate:"2027-01-01"});assert.equal(state.mode,"days");assert.deepEqual(state.selectedRange,{start:"2026-12-28",end:"2027-01-03"});
 assert.equal(N.pickerState({mode:"monthly",anchorDate:"2020-04-02"}).mode,"days");assert.equal(N.pickerState({mode:"yearly",anchorDate:"2020-04-02"}).mode,"days");
 assert.match(N.rangeLabel({mode:"daily",anchorDate:"2027-01-01"},"en"),/2026.*2027/);
});
test("streak endings use complete history and scheduled days, retaining earlier runs",()=>{
 const records={"2026-09-14":{done:true},"2026-09-16":{done:true},"2026-09-18":{done:true},"2026-09-21":{done:false},"2026-09-23":{done:true},"2026-09-25":{done:true}};
 assert.deepEqual(H.streakEnds({weekdays:"135",plan:"2026-09-01=135"},records,"2026-09-23"),{"2026-09-18":3});
 records["2026-09-21"].done=true;assert.deepEqual(H.streakEnds({weekdays:"135",plan:"2026-09-01=135"},records,"2026-09-23"),{"2026-09-23":5});
});
