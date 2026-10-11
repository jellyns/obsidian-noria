const test=require('node:test'),assert=require('node:assert/strict');
const Z=require('../src/task-calendar-zone.js'),T=require('../src/task-document.js');
const zone=Z.adapter({source:'Asia/Shanghai',display:'Asia/Tokyo'});
test('single display zone preserves instants, midnight and all-day dates',()=>{
 assert.equal(zone.to('2026-10-10 09:00'),'2026-10-10 10:00');assert.equal(zone.to('2026-10-10 9:00'),'2026-10-10 10:00');assert.equal(zone.to('2026-10-10 23:30'),'2026-10-11 00:30');assert.equal(zone.to('2026-10-10'),'2026-10-10');
 assert.equal(zone.from('2026-10-10 10:00'),'2026-10-10 09:00');assert.equal(Z.convertWall('2026-10-10 09:00','Asia/Shanghai','Asia/Kathmandu'),'2026-10-10 06:45');
});
test('source syntax survives editor, drag and multi-schedule writeback',()=>{
 const raw='- [ ] 开会 🛫 2026-10-10 09:00 [due:: 2026-10-10 10:00] [schedule:: 2026-10-11 09:00 / 2026-10-11 10:00] #项目';
 const view=zone.model(raw);assert.equal(view.start,'2026-10-10 10:00');assert.equal(view.schedules[0].start,'2026-10-11 10:00');
 assert.equal(zone.patchTaskDates(raw,{start:view.start,due:view.due}),raw);
 const changed=zone.patchTaskLine(raw,{start:'2026-10-10 10:30',schedule:{action:'update',index:0,start:'2026-10-11 10:30',end:'2026-10-11 11:30'}});
 assert.equal(T.parseTaskLine(changed).start,'2026-10-10 09:30');assert.equal(T.parseTaskLine(changed).schedules[0].start,'2026-10-11 09:30');assert.ok(zone.patchTaskDates(raw,{start:'2026-10-10 10:30'}).includes('🛫 2026-10-10 09:30'));assert.ok(changed.endsWith('#项目'));
 const moved=zone.patchTaskDates(raw,{start:v=>v.replace('10-10','10-11')});assert.equal(T.parseTaskLine(moved).start,'2026-10-11 09:00');
});
test('date-specific DST offsets and rejected missing/repeated civil times',()=>{
 assert.equal(Z.convertWall('2026-01-10 09:00','Asia/Shanghai','America/New_York'),'2026-01-09 20:00');
 assert.equal(Z.convertWall('2026-07-10 09:00','Asia/Shanghai','America/New_York'),'2026-07-09 21:00');
 assert.throws(()=>Z.wallInstant('2026-03-08 02:30','America/New_York'),/不存在/);
 assert.throws(()=>Z.wallInstant('2026-11-01 01:30','America/New_York'),/两个可能/);
});
test('source baseline remains stable as device zone changes; invalid zone never enables conversion',()=>{
 assert.deepEqual(Z.zoneContext({sourceTimeZone:'Asia/Shanghai'},'Asia/Tokyo'),{source:'Asia/Shanghai',display:'Asia/Tokyo'});
 assert.equal(Z.zoneContext({timeZone:'Asia/Tokyo'}),null);assert.equal(Z.validZone('invalid/zone'),'');
});


test('quick presets encode selected-zone civil times once before entering Markdown',()=>{
 const line='- [ ] 午餐 [start:: 2026-10-10 12:30] [due:: 2026-10-10 13:00] #timeline';
 const saved=zone.lineFromDisplay(line),view=zone.model(saved);
 assert.equal(T.parseTaskLine(saved).start,'2026-10-10 11:30');assert.equal(view.start,'2026-10-10 12:30');assert.equal(view.due,'2026-10-10 13:00');
 assert.equal(zone.label('2026-10-10'),'UTC+9');
 assert.equal(Z.adapter({source:'America/New_York',display:'America/New_York'}).elapsed('2026-03-08 01:30','2026-03-08 03:30'),60);
});


test('horizontal source instants, display dates and writeback agree with the calendar',()=>{
 const clock=Z.timelineClock({sourceTimeZone:'Asia/Shanghai',timeZone:'Asia/Tokyo'});
 const instant=Date.parse(clock.iso({ymd:'2026-10-12',hhmm:'09:00'}));
 assert.equal(instant,Date.parse('2026-10-12T01:00:00Z'));
 assert.equal(clock.wall(instant),'2026-10-12 10:00');
 assert.equal(clock.write(instant+1800000),'2026-10-12 09:30');
 const date=Date.parse(clock.iso({ymd:'2026-10-12'}));
 assert.equal(clock.wall(date),'2026-10-12 00:00');
 assert.equal(clock.write(clock.addDays(date,1),true),'2026-10-13');
 assert.equal(clock.dayStart(instant),date);
});

test('horizontal day ticks follow DST while repeated civil writeback is rejected',()=>{
 const clock=Z.timelineClock({sourceTimeZone:'America/New_York',timeZone:'America/New_York'});
 const start=Date.parse('2026-03-08T05:00:00Z'),next=clock.addDays(start,1);
 assert.equal(next-start,23*3600000);
 assert.deepEqual(clock.ticks(start,next,86400000),[start,next]);
 assert.throws(()=>clock.write(Date.parse('2026-11-01T05:30:00Z')),/两个可能/);
 assert.equal(clock.wall(Date.parse(clock.iso({ymd:'2026-01-10',hhmm:'09:00'}))),'2026-01-10 09:00');
});


test('horizontal calendar windows preserve local days and reversible month anchors across DST',()=>{
 const clock=Z.timelineClock({sourceTimeZone:'Asia/Shanghai',timeZone:'America/New_York'});
 const W=require('../src/runtime/views/task-timeline/time-window.js').withClock(clock);
 const day=W.at(Date.parse('2026-03-08T05:00:00Z'),{amount:1,unit:'day'});
 assert.equal(day.endMs-day.startMs,23*3600000);
 assert.deepEqual(W.shift(W.shift(day,1),-1),day);
 const month=W.at(Date.parse('2026-01-31T17:00:00Z'),{amount:1,unit:'month'});
 assert.equal(clock.wall(W.shift(month,1).startMs),'2026-02-28 12:00');
 assert.equal(W.shift(W.shift(month,1),-1).startMs,month.startMs);
});
