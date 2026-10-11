const test=require('node:test'),assert=require('node:assert/strict');
const {dayOf,focusLine,readFocusDocument,appendFocusRecord}=require('../src/focus-document.js');
const at=value=>new Date('2026-10-10T'+value).toISOString();
const record={titleSnapshot:'阅读与摘录',path:'Projects/阅读.md'};
const session={start:at('09:00:00'),end:at('09:40:00'),mode:'WORK',timerMode:'stopwatch',segments:[{start:at('09:00:00'),end:at('09:10:00')},{start:at('09:30:00'),end:at('09:40:00')}]};
test('ordinary Markdown retains actual spans, task source and pause gaps',()=>{
  const raw=appendFocusRecord('## 记录\n今天的文字。\n',{record,session,day:'2026-10-10'});
  assert.match(raw,/09:00:00–09:10:00 \/ 09:30:00–09:40:00 · \[\[Projects\/阅读\|阅读与摘录\]\]/);
  const parsed=[...readFocusDocument(raw,'2026-10-10').records.values()][0];
  assert.equal(parsed.durationMs,1200000);assert.equal(parsed.sourcePath,record.path);assert.equal(parsed.timerMode,'stopwatch');assert.equal(parsed.completed,false);
});
test('retry does not duplicate or overwrite an entry edited in Obsidian',()=>{
  const options={record,session,day:'2026-10-10'};let raw=appendFocusRecord('',options);raw=raw.replace('阅读与摘录','原生笔记中改写的活动');
  assert.equal(appendFocusRecord(raw,options),raw);
});
test('native edits change the duration derived from Markdown',()=>{
  const raw=focusLine(record,session,'2026-10-10').replace('09:40:00','09:45:00');
  assert.equal([...readFocusDocument(raw,'2026-10-10').records.values()][0].durationMs,1500000);
});
test('cross-midnight entries preserve dates and precise seconds',()=>{
  const start=new Date('2026-10-09T23:59:40.123').toISOString(),end=at('00:00:20.456');
  const s={...session,start,end,segments:[{start,end}]},raw=focusLine(record,s,'2026-10-09');
  assert.match(raw,/2026-10-10 00:00:20 /);assert.doesNotMatch(raw,/\d{2}:\d{2}:\d{2}\.\d/);assert.equal([...readFocusDocument(raw,'2026-10-09').records.values()][0].durationMs,40000);assert.equal(dayOf(start),'2026-10-09');
});
test('legacy milliseconds remain readable and collapsed subsecond fragments are omitted',()=>{
  const legacy='- 09:00:00.123–09:00:20.456 · 阅读 · 自由 ^focus-legacy';
  assert.equal([...readFocusDocument(legacy,'2026-10-10').records.values()][0].durationMs,20333);
  const tiny={...session,segments:[{start:at('09:00:00.100'),end:at('09:00:00.900')}]};
  assert.equal(focusLine(record,tiny,'2026-10-10'),'');
});
test('duplicate anchors, overlapping spans and invalid dates fail visibly rather than becoming zero',()=>{
  const line=focusLine(record,session,'2026-10-10');assert.equal(readFocusDocument(line+'\n'+line,'2026-10-10').errors.size,1);
  assert.equal(readFocusDocument(line.replace('09:30:00','09:05:00'),'2026-10-10').errors.size,1);
  assert.equal(readFocusDocument(line.replace('09:30:00','2026-02-31 09:30:00'),'2026-10-10').errors.size,1);
});
test('append preserves unrelated sections and ignores examples inside code fences',()=>{
  const options={record,session,day:'2026-10-10'},line=focusLine(record,session,'2026-10-10');
  const raw='## 记录\n```md\n'+line+'\n```\n\n## 专注\n\n## 复盘\n保留这段。\n';
  const next=appendFocusRecord(raw,options);assert.equal(readFocusDocument(next,'2026-10-10').records.size,1);assert.ok(next.endsWith('## 复盘\n保留这段。\n'));
});
