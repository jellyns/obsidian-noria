const test=require('node:test'),assert=require('node:assert/strict');
const {readingSummary}=require('../src/focus-reading.js');
const {focusLine,readFocusDocument}=require('../src/focus-document.js');
const at=time=>new Date('2026-10-10T'+time).toISOString();
function record(segments){const session={start:segments[0].start,end:segments.at(-1).end,segments,mode:'WORK',timerMode:'stopwatch'};return [...readFocusDocument(focusLine({titleSnapshot:'阅读',path:'Projects/阅读.md'},session,'2026-10-10'),'2026-10-10').records.values()][0];}
test('new records show second-resolution duration and intervals consistently',()=>{
  const r=record([{start:at('09:06:56.750'),end:at('09:07:16.289')}]),view=readingSummary(r);
  assert.equal(view.duration,'20 秒');assert.deepEqual(view.spans,['09:06:56–09:07:16']);assert.equal(r.durationMs,20000);
});
test('paused segments stay separate and only actual work contributes to the summary',()=>{
  const r=record([{start:at('09:00:00'),end:at('09:10:00')},{start:at('09:30:00'),end:at('09:40:00')}]);
  assert.deepEqual(readingSummary(r),{duration:'20 分钟',mode:'自由计时',spans:['09:00–09:10','09:30–09:40']});
  assert.equal(readingSummary(r,'en').duration,'20 min');
});
test('subsecond and cross-midnight records remain meaningful',()=>{
  const legacy=[...readFocusDocument('- 09:00:00.100–09:00:00.500 · 阅读 · 自由 ^focus-legacy','2026-10-10').records.values()][0];
  assert.equal(readingSummary(legacy).duration,'<1 秒');
  const r=record([{start:at('23:50:00'),end:new Date('2026-10-11T00:10:00').toISOString()}]);
  assert.deepEqual(readingSummary(r).spans,['23:50–2026-10-11 00:10']);
});
