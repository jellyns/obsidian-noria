const test=require("node:test"),assert=require("node:assert/strict");
const {readingBody,buildReviewMaterial,collectReviewMaterialRecords}=require("../src/review-material.js");
const {normalizeReviewSelection}=require("../src/review-center-core.js");
function plugin(files){const reads=[];return {reads,resolveReviewSelection:normalizeReviewSelection,
  resolveCalendarNoteSpecAsync:async(mode,date)=>({path:`Diary/${normalizeReviewSelection({mode,anchorDate:date}).period}.md`}),
  getReviewFinalSectionHeading:mode=>mode==="weekly"?"周复盘":"月复盘",
  loadTextFromVault:async path=>{reads.push(path);return files[path]||"";}};}
test("material retains authored prose and code while omitting executable views",()=>{
  const text='---\nmood: 稳定\n---\n\nMention focusPanel without hiding this sentence.\n\n```noria\n{"view":"focusPanel"}\n```\n\n```js\nconst example=1;\n```\n';
  const body=readingBody(text);assert.match(body,/Mention focusPanel/);assert.match(body,/const example=1/);assert.doesNotMatch(body,/"view"|mood:/);
});

test('empty diary templates remain references while fields, prose and attachments remain material',async()=>{
  const p=plugin({'Diary/2026-W39.md':'## 周计划\n\n## 周复盘\n',
    'Diary/2026-09-21.md':'## 记录\n\n```noria\nview: diary\n```\n\n%% noria:review:start %%\n## 复盘\n### 下一步\n%% noria:review:end %%',
    'Diary/2026-09-22.md':'---\nsleep: 0\nwalk: false\n---\n## 记录',
    'Diary/2026-09-23.md':'## 记录\n\n![[photo.png]]',
    'Diary/2026-09-24.md':'## 记录\n\n留下原话。\n\n## 待填写'});
  p.records={definitions:()=>[{property:'sleep',name:'睡眠'},{property:'walk',name:'散步'}],read:(raw,f)=>raw.includes('sleep: 0')?({sleep:0,walk:false})[f.property]:null};
  const result=await collectReviewMaterialRecords(p,{mode:'weekly',date:'2026-09-24',period:'2026-W39',periodNotePath:'Diary/2026-W39.md',evidence:{dailyNotes:[21,22,23,24].map(d=>({date:`2026-09-${d}`,path:`Diary/2026-09-${d}.md`,exists:true}))}});
  assert.equal(result.records.length,3);assert.equal(result.references.filter(r=>r.reason==='no body or recorded values').length,2);
  const fields=result.records.find(r=>r.date==='2026-09-22');assert.deepEqual(fields.recordValues.map(v=>v.value),[0,false]);assert.equal(fields.text,undefined);
  assert.match(result.records.find(r=>r.date==='2026-09-23').text,/!\[\[photo.png\]\]/);
  assert.equal(result.records.find(r=>r.date==='2026-09-24').text,'## 记录\n\n留下原话。\n\n## 待填写');
  assert.equal(new Set(p.reads).size,p.reads.length);
});
test("compact material keeps secondary projects and long original records without duplicate statistics",()=>{
  const task={label:"Deliver one result",path:"Projects/A.md",line:4};
  const envelope={payload:{mode:"daily",period:"2026-09-16",evidenceHash:"source",evidence:{tasks:{done:1,open:1,doneItems:[task],openItems:[{label:"Write a paragraph",path:"Projects/B.md",line:8}]}},snapshot:{domains:{tasks:{completion:{completedItems:[{title:task.label,source:{path:task.path,line:3}}]}},vaultHealth:{noise:"x".repeat(5000)}}}}};
  const original="作者的原话。".repeat(800),result=buildReviewMaterial(envelope,{records:[{path:"Diary/day.md",text:original}],fullEvidencePath:"full.json"});
  assert.equal(result.payload.records[0].text,original);assert.equal(result.payload.tasks.length,2);assert.ok(result.payload.tasks.some(t=>t.path==="Projects/B.md"));
  assert.doesNotMatch(JSON.stringify(result),/vaultHealth|5000/);assert.equal(result.payload.fullEvidencePath,"full.json");
});
test("monthly material prefers adopted weekly reviews and reads uncovered dates once",async()=>{
  const p=plugin({"Diary/2026-09.md":"## 九月\n\n原定计划。","Diary/2026-W37.md":"## 周复盘\n\n完成了一篇文章，记下散步见闻。","Diary/2026-09-02.md":"边界日原文。","Diary/2026-09-08.md":"已被周回顾覆盖的原文。"});
  const model={mode:"monthly",date:"2026-09-16",period:"2026-09",periodNotePath:"Diary/2026-09.md",evidence:{dailyNotes:[{date:"2026-09-02",path:"Diary/2026-09-02.md",exists:true},{date:"2026-09-08",path:"Diary/2026-09-08.md",exists:true}]}};
  const result=await collectReviewMaterialRecords(p,model);
  assert.ok(result.records.some(r=>r.role==="lower-review"));assert.ok(result.records.some(r=>r.text==="边界日原文。"));
  assert.ok(!p.reads.includes("Diary/2026-09-08.md"));assert.ok(result.references.some(r=>r.date==="2026-09-08"));assert.equal(new Set(p.reads).size,p.reads.length);
});
test("missing lower reviews use actual daily records and supplied daily text is not reread",async()=>{
  const p=plugin({"Diary/2026-09-08.md":"生活记录，无须变成任务。"});
  const monthly=await collectReviewMaterialRecords(p,{mode:"monthly",date:"2026-09-16",period:"2026-09",evidence:{dailyNotes:[{date:"2026-09-08",path:"Diary/2026-09-08.md",exists:true}]}});
  assert.equal(monthly.records[0].text,"生活记录，无须变成任务。");
  p.reads.length=0;const daily=await collectReviewMaterialRecords(p,{mode:"daily",date:"2026-09-08",period:"2026-09-08",diaryPath:"Diary/2026-09-08.md",evidence:{excerpts:[{path:"Diary/2026-09-08.md",text:"完整原文"}]}});
  assert.equal(p.reads.length,0);assert.equal(daily.records[0].text,"完整原文");
});

test('a leading capture before an empty lower review does not cover the daily originals',async()=>{
  const p=plugin({'Diary/2026-W37.md':'%% noria:review:start %%\n- [10:00] 只是闪念\n\n## 周复盘\n\n### 待填写\n\n%% noria:review:end %%','Diary/2026-09-08.md':'不能遗漏的原始记录。'});
  const result=await collectReviewMaterialRecords(p,{mode:'monthly',date:'2026-09-16',period:'2026-09',evidence:{dailyNotes:[{path:'Diary/2026-09-08.md',date:'2026-09-08',exists:true}]}});
  assert.ok(result.records.some(r=>r.text==='不能遗漏的原始记录。'));assert.ok(!result.records.some(r=>r.role==='lower-review'));
});

test('lower reviews use the confirmed reading body without leading capture or executable views',async()=>{
  const p=plugin({'Diary/2026-W37.md':'%% noria:review:start %%\n- [10:00] 旧闪念\n\n## 周复盘\n\n本周结论。\n\n```noria-view\nview: test\n```\n\n```js\nconst authored=1;\n```\n%% noria:review:end %%'});
  const result=await collectReviewMaterialRecords(p,{mode:'monthly',date:'2026-09-16',period:'2026-09'});
  const body=result.records.find(r=>r.role==='lower-review').text;assert.match(body,/本周结论|const authored=1/);assert.doesNotMatch(body,/旧闪念|noria-view|view: test/);
});

test('covered diary fields come from source text and retain legacy values, zero and false',async()=>{
  const p=plugin({'Diary/2026-W37.md':'## 周复盘\n\n已确认结论。','Diary/2026-09-08.md':'旧格式字段原文，不重复提供正文。'});
  p.records={definitions:()=>[{property:'energy',name:'精力'},{property:'sleep',name:'睡眠',unit:'小时'},{property:'walk',name:'散步'}],read:(raw,f)=>raw.includes('旧格式')?{energy:2,sleep:0,walk:false}[f.property]:null};
  const result=await collectReviewMaterialRecords(p,{mode:'monthly',date:'2026-09-16',period:'2026-09',evidence:{dailyNotes:[{path:'Diary/2026-09-08.md',date:'2026-09-08',exists:true}]}});
  const record=result.records.find(r=>r.role==='daily-record-values');assert.deepEqual(record.recordValues.map(r=>r.value),[2,0,false]);assert.equal(record.text,undefined);assert.equal(p.reads.filter(path=>path==='Diary/2026-09-08.md').length,1);
});

test('period candidates outside the selected range or with invalid dates are never read',async()=>{
  const p=plugin({'Diary/outside.md':'不属于本期'});
  const result=await collectReviewMaterialRecords(p,{mode:'weekly',date:'2026-09-24',period:'2026-W39',evidence:{dailyNotes:['2026-09-20','2026-09-28','2026-02-30',''].map(date=>({path:'Diary/outside.md',date,exists:true}))}});
  assert.equal(result.records.length,0);assert.equal(p.reads.length,0);
});

test('a week spanning a year boundary keeps both years and excludes adjacent days',async()=>{
  const dates=['2025-12-28','2025-12-29','2026-01-04','2026-01-05'],p=plugin(Object.fromEntries(dates.map(d=>[`Diary/${d}.md`,d])));
  const result=await collectReviewMaterialRecords(p,{mode:'weekly',date:'2026-01-01',period:'2026-W01',evidence:{dailyNotes:dates.map(date=>({path:`Diary/${date}.md`,date,exists:true}))}});
  assert.deepEqual(result.records.map(r=>r.date),['2025-12-29','2026-01-04']);
});
