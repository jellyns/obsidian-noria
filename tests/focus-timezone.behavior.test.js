const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const modulePath=require.resolve('../src/focus-document.js');
function inZone(zone,body){
  return JSON.parse(execFileSync(process.execPath,['-e',`const f=require(${JSON.stringify(modulePath)});${body}`],{env:{...process.env,TZ:zone},encoding:'utf8'}));
}
for(const [name,start,end,minutes] of [
  ['fall-back crossing','2026-11-01T08:50:00Z','2026-11-01T09:10:00Z',20],
  ['second repeated hour','2026-11-01T09:10:00Z','2026-11-01T10:10:00Z',60],
  ['ordinary day','2026-10-31T08:50:00Z','2026-10-31T09:10:00Z',20],
  ['spring-forward crossing','2026-03-08T09:50:00Z','2026-03-08T10:10:00Z',20]
])test(`focus round trip preserves actual instants: ${name}`,()=>{
  const result=inZone('America/Los_Angeles',`
    const start=${JSON.stringify(start)},end=${JSON.stringify(end)},day=f.dayOf(start);
    const raw=f.appendFocusRecord('',{record:{titleSnapshot:'Read'},session:{start,end,segments:[{start,end}]},day});
    const doc=f.readFocusDocument(raw,day);console.log(JSON.stringify({raw,day,records:[...doc.records.values()],errors:[...doc.errors]}));`);
  assert.deepEqual(result.errors,[]);assert.equal(result.records[0].durationMs,minutes*60000);
  assert.equal(Date.parse(result.records[0].start),Date.parse(start));assert.equal(Date.parse(result.records[0].end),Date.parse(end));
  // Moving the same Markdown to another time zone must not reinterpret its clocks.
  const elsewhere=inZone('Asia/Shanghai',`console.log(JSON.stringify([...f.readFocusDocument(${JSON.stringify(result.raw)},${JSON.stringify(result.day)}).records.values()]));`);
  assert.equal(elsewhere[0].start,result.records[0].start);assert.equal(elsewhere[0].end,result.records[0].end);
});
test('legacy ambiguous clocks are reported, not silently guessed or rewritten',()=>{
  const result=inZone('America/Los_Angeles',`
    const raw='- 01:10:00–02:10:00 · Read · 自由 ^focus-old';
    const doc=f.readFocusDocument(raw,'2026-11-01');console.log(JSON.stringify({records:[...doc.records],errors:[...doc.errors.values()]}));`);
  assert.equal(result.records.length,0);assert.match(result.errors[0],/ambiguous.*offset/i);
});
test('explicit offsets allow cross-midnight records and reject invalid calendar dates and offsets',()=>{
  const {readFocusDocument}=require(modulePath);
  const line='- 23:55:00-07:00–2026-11-02 00:05:00-07:00 · Read · 自由 ^focus-manual';
  const doc=readFocusDocument(line,'2026-11-01');assert.equal(doc.errors.size,0);assert.equal([...doc.records.values()][0].durationMs,600000);
  for(const bad of [line.replace('2026-11-02','2026-02-31'),line.replace('-07:00','-24:00')])assert.equal(readFocusDocument(bad,'2026-11-01').errors.size,1);
});
