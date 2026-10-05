const test=require("node:test"),assert=require("node:assert/strict");
const {readCountdowns,updateCountdown,countdownProgress,dayNumber,shiftDate}=require("../src/countdown-document.js");
const source="---\nowner: life\n---\n## Dates\n\n| 日期 | 名称 | 类型 |\n| --- | --- | --- |\n| 2026-09-30 | 月度复盘 | review |\n| 2026-10-03 | 城市散步 | |\n\n# Other\nKeep this paragraph.\n\n```md\n| 日期 | 名称 |\n| --- | --- |\n| 2027-01-01 | Example only |\n```\n";
test("legacy dates remain readable without inventing a start; fenced examples are excluded",()=>{
  const rows=readCountdowns(source).rows;assert.equal(rows.length,2);assert.equal(rows[0].start,"");assert.equal(rows[1].type,"");
  assert.equal(countdownProgress("",rows[0].date,"2026-09-17"),null);
});
test("editing a countdown keeps unrelated text and rows and adds a stable identity",()=>{
  const row=readCountdowns(source).rows[0],current=source.replace("Keep this paragraph.","Keep this paragraph. External edit.");
  const changed=updateCountdown(current,row,{start:"2026-09-01",date:"2026-09-25"},{id:"one"});
  assert.match(changed,/Keep this paragraph\. External edit\./);assert.match(changed,/owner: life/);assert.match(changed,/Example only/);
  const rows=readCountdowns(changed).rows;assert.equal(rows[0].id,"one");assert.equal(rows[1].name,"城市散步");assert.equal(rows[1].start,"");
});
test("archive and restore keep the record in the original Markdown",()=>{
  const initial=updateCountdown(source,readCountdowns(source).rows[0],{archived:true},{id:"one"});
  const row=readCountdowns(initial).rows[0];assert.equal(row.archived,true);
  const restored=updateCountdown(initial,row,{archived:false},{id:"ignored"});assert.equal(readCountdowns(restored).rows[0].id,"one");assert.equal(readCountdowns(restored).rows[0].archived,false);
});
test("concurrent changes to the same countdown are refused and duplicated legacy rows are distinguished only in an unchanged table",()=>{
  const row=readCountdowns(source).rows[0];assert.throws(()=>updateCountdown(source.replace("月度复盘","另一个名称"),row,{date:"2026-09-28"},{id:"a"}),/changed elsewhere/);
  const duplicate=source.replace("| 2026-10-03 | 城市散步 | |","| 2026-09-30 | 月度复盘 | review |");const rows=readCountdowns(duplicate).rows;
  const changed=updateCountdown(duplicate,rows[1],{date:"2026-10-01"},{id:"second"});assert.equal(readCountdowns(changed).rows[0].date,"2026-09-30");assert.equal(readCountdowns(changed).rows[1].id,"second");
  assert.throws(()=>updateCountdown(duplicate.replace("| --- | --- | --- |","| ---- | --- | --- |"),rows[1],{date:"2026-10-01"},{id:"second"}),/changed elsewhere/);
});
test("day arithmetic is calendar based and progress handles same-day, future and expired ranges",()=>{
  assert.equal(shiftDate("2026-03-08",1),"2026-03-09");assert.equal(dayNumber("2026-02-30").toString(),"NaN");
  assert.equal(countdownProgress("2026-09-10","2026-09-20","2026-09-15"),50);
  assert.equal(countdownProgress("2026-09-20","2026-09-20","2026-09-20"),100);
  assert.equal(countdownProgress("2026-09-20","2026-09-20","2026-09-19"),0);
  assert.equal(countdownProgress("2026-09-10","2026-09-20","2026-09-22"),100);
  assert.throws(()=>updateCountdown(source,null,{name:"Bad",start:"2026-10-02",date:"2026-10-01"},{id:"bad"}));
});
test("an empty file can receive a countdown and escaped title pipes survive a later edit",()=>{
  const text=updateCountdown("",null,{name:"Walk | read",start:"2026-09-17",date:"2026-09-30"},{id:"new",zh:false});
  const row=readCountdowns(text).rows[0];assert.equal(row.name,"Walk | read");assert.equal(row.id,"new");
  assert.equal(readCountdowns(updateCountdown(text,row,{date:"2026-10-01"})).rows[0].name,"Walk | read");
});
