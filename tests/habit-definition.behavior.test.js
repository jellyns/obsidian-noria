const test=require("node:test"),assert=require("node:assert/strict");
const {readHabitDefinitions,writeHabitDefinition}=require("../src/habit-definition.js");
const raw="## 打卡中的习惯\n\n- 阅读 [type:: number] [target:: 20] [unit:: 分钟]\n- 散步\n\n## 暂停的习惯\n\n# 历史\n\n- [x] 阅读 [type:: number] [target:: 20] #habit [due:: 2026-09-10] [value:: 25]\n";
test("rename retains a stable habit and leaves past records with their original target and name",()=>{
  const old=readHabitDefinitions(raw)[0];const next=writeHabitDefinition(raw,old,{...old,name:"读书",target:"30"},{id:"reading"});
  const row=readHabitDefinitions(next)[0];assert.equal(row.id,"reading");assert.equal(row.aliases,"阅读");assert.equal(row.name,"读书");
  assert.ok(next.endsWith(raw.slice(raw.indexOf("# 历史"))));
});
test("pausing changes only the definition's section and keeps unrelated Markdown",()=>{
  const old=readHabitDefinitions(raw)[0];const next=writeHabitDefinition(raw,old,{...old,stage:"paused"},{id:"reading"});
  assert.equal(readHabitDefinitions(next).find(r=>r.id==="reading").stage,"paused");assert.match(next,/- 散步/);assert.ok(next.includes(raw.slice(raw.indexOf("# 历史"))));
});
test("an unrelated concurrent definition is kept while editing the same changed definition is rejected",()=>{
  const old=readHabitDefinitions(raw)[0];const next=writeHabitDefinition(raw.replace("- 散步","- 跑步"),old,{...old,target:"30"},{id:"reading"});
  assert.match(next,/- 跑步/);assert.throws(()=>writeHabitDefinition(raw.replace("target:: 20","target:: 40"),old,{...old,target:"30"},{id:"reading"}),/changed/);
});
