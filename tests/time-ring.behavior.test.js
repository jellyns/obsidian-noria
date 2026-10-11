const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/time-ring-model.js');
const ms=s=>+new Date('2026-10-10T'+s+':00');
const row=(id,a,b)=>({id,startMs:ms(a),endMs:ms(b)});
test('today preference does not show yesterday as today and respects fixed page bounds',()=>{
 const rows=[row('old','09:00','10:00')];
 assert.equal(M.initialDay(rows,null,'2026-10-12',true),'2026-10-12');
 assert.equal(M.initialDay(rows,{start:'2026-09-01',end:'2026-09-30'},'2026-10-12',true),'2026-09-30');
 assert.equal(M.initialDay(rows,{start:'2026-11-01',end:'2026-11-30'},'2026-10-12',true),'2026-11-01');
});
test('schedule comparison uses explicit timed ranges without inferring deadlines or all-day duration',()=>{
  let line=0;const task=raw=>({source:{path:'P.md',line:line++,rawLine:raw}});
  const timed=task('- [ ] Read #work [schedule:: 2026-10-10 09:00 / 2026-10-10 10:00] [schedule:: 2026-10-10 11:00 / 2026-10-10 11:30]');
  const data=M.scheduledSegments([timed,timed,task('- [ ] Date [scheduled:: 2026-10-10]'),task('- [ ] Legacy [start:: 2026-10-10 09:00] [due:: 2026-10-10 10:00]')],{tagColorMap:{work:'#008577'}});
  assert.equal(data.rows.length,2);assert.equal(data.rows[0].title,'Read');assert.equal(data.rows[0].category.color,'#008577');assert.equal(data.rows[0].taskRef.rawText,timed.source.rawLine);
  assert.equal(M.dayModel(data.rows,'2026-10-10').totalMs,90*60000);
});
test('cancelled and invalid schedules never become time, while completed scheduled work stays comparable',()=>{
  const tasks=['- [-] Cancelled [schedule:: 2026-10-10 09:00 / 2026-10-10 10:00]','- [x] Done [schedule:: 2026-10-09 23:30 / 2026-10-10 00:30]','- [ ] Invalid [schedule:: invalid]'].map((rawLine,line)=>({path:'P.md',line,rawLine}));
  const data=M.scheduledSegments(tasks,{});assert.equal(data.rows.length,1);assert.equal(data.invalid.length,1);
  assert.equal(M.dayModel(data.rows,'2026-10-10').totalMs,30*60000);assert.equal(data.rows[0].title,'Done');
});
test('time ring preserves pauses, places overlaps in separate lanes and sums their union',()=>{
  const model=M.dayModel([row('a','09:00','10:00'),row('b','09:30','11:00'),row('c','12:00','12:30')],'2026-10-10');
  assert.equal(model.totalMs,2.5*3600000);assert.equal(model.recordedMs,3*3600000);
  assert.deepEqual(model.segments.map(r=>r.lane),[0,1,0]);
  assert.equal(model.segments[2].from,ms('12:00'));assert.equal(model.lanes,2);
});
test('cross-midnight rows clip to the selected local day while retaining original source times',()=>{
  const source={id:'night',startMs:+new Date('2026-10-09T23:00:00'),endMs:ms('01:00'),path:'Diary.md',anchor:'focus-1'};
  const day=M.dayModel([source],'2026-10-10');assert.equal(day.totalMs,3600000);assert.equal(day.segments[0].startMs,source.startMs);assert.equal(day.segments[0].startFraction,0);assert.equal(day.segments[0].anchor,'focus-1');
  assert.equal(M.dayModel([source],'2026-10-11').segments.length,0);
});
test('only actual segments enter the ring, breaks and inferred legacy spans stay out',()=>{
  const session={start:new Date(ms('09:00')).toISOString(),segments:[{start:new Date(ms('09:00')).toISOString(),end:new Date(ms('09:30')).toISOString()}]};
  const state={tasks:{x:{titleSnapshot:'Read',sessions:[session,{mode:'BREAK',segments:session.segments},{start:session.start,end:new Date(ms('11:00')).toISOString()}]}},active:{taskKey:'x',mode:'WORK',status:'running',startedAt:new Date(ms('10:00')).toISOString()}};
  const data=M.focusSegments(state,new Date(ms('10:15')).toISOString());assert.equal(data.rows.length,2);assert.equal(data.omitted,1);assert.equal(M.dayModel(data.rows,'2026-10-10').totalMs,45*60000);
  state.active.status='paused';assert.equal(M.focusSegments(state,new Date(ms('12:00')).toISOString()).rows.length,1);
});
test('latest recorded day respects range and never treats an empty day as a zero record',()=>{
  const rows=[row('a','09:00','10:00')];assert.equal(M.initialDay(rows,{start:'2026-10-01',end:'2026-10-31'},'2026-10-12'),'2026-10-10');
  assert.equal(M.initialDay(rows,{start:'2026-10-11',end:'2026-10-31'},'2026-10-12'),'2026-10-12');assert.equal(M.dayModel(rows,'2026-10-12').segments.length,0);
  assert.throws(()=>M.dayBounds('2026-02-31'),/Invalid/);assert.match(M.arcPath(100,0,1),/ A .* A /);
});
test('local DST day uses its real elapsed length',()=>{
  const {execFileSync}=require('node:child_process');
  const code=`const M=require(${JSON.stringify(require.resolve('../src/time-ring-model.js'))});console.log(M.dayModel([],'2026-03-08').hours);`;
  assert.equal(execFileSync(process.execPath,['-e',code],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'}).trim(),'23');
});
test('schedule instants use the board source zone and clip in its display zone',()=>{
 const tasks=[{path:'P.md',line:0,rawLine:'- [ ] Read [schedule:: 2026-10-10 22:30 / 2026-10-11 00:30]'}];
 const result=M.scheduledSegments(tasks,{}, {sourceTimeZone:'Asia/Shanghai',timeZone:'Asia/Tokyo'});
 assert.equal(result.rows[0].startMs,Date.parse('2026-10-10T14:30:00Z'));
 assert.equal(result.rows[0].endMs,Date.parse('2026-10-10T16:30:00Z'));
 const first=M.dayModel(result.rows,'2026-10-10','Asia/Tokyo'),second=M.dayModel(result.rows,'2026-10-11','Asia/Tokyo');
 assert.equal(first.totalMs,30*60000);assert.equal(second.totalMs,90*60000);
 assert.equal(second.segments[0].from,Date.parse('2026-10-10T15:00:00Z'));
 assert.equal(first.totalMs+second.totalMs,2*3600000);
 assert.equal(M.initialDay(result.rows,null,'2026-10-12',false,'Asia/Tokyo'),'2026-10-11');
 assert.equal(M.displayDay(Date.parse('2026-10-10T15:15:00Z'),'Asia/Tokyo'),'2026-10-11');
 assert.equal(M.displayDay(Date.parse('2026-10-10T15:15:00Z'),'Asia/Shanghai'),'2026-10-10');
});
test('DST day keeps actual elapsed duration and rejects ambiguous source schedules',()=>{
 const zone='America/New_York';
 assert.equal(M.dayModel([],'2026-03-08',zone).hours,23);
 assert.equal(M.dayModel([],'2026-11-01',zone).hours,25);
 const rawLine='- [ ] Spring [schedule:: 2026-03-08 01:30 / 2026-03-08 03:30]';
 const result=M.scheduledSegments([{path:'P.md',line:0,rawLine}],{},{sourceTimeZone:zone});
 assert.equal(result.rows[0].endMs-result.rows[0].startMs,3600000);
 for(const range of ['2026-03-08 02:30 / 2026-03-08 03:30','2026-11-01 01:30 / 2026-11-01 03:30']){
  const invalid=M.scheduledSegments([{path:'P.md',line:0,rawLine:'- [ ] Invalid [schedule:: '+range+']'}],{},{sourceTimeZone:zone});
  assert.equal(invalid.rows.length,0);assert.equal(invalid.invalid.length,1);assert.ok(invalid.invalid[0].error);
 }
});
