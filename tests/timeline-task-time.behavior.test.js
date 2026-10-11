const test=require('node:test'),assert=require('node:assert/strict');
const {taskTimeLabel}=require('../src/timeline-stream-model.js');
const item=meta=>({date:'2026-10-10',payload:{noria:{startYmd:'2026-10-10',endYmd:'2026-10-10',...meta}}});
test('same-day tasks have one range and date-only tasks rely on their day heading',()=>{
 assert.equal(taskTimeLabel(item({startTime:'09:00',endTime:'10:00'})),'09:00–10:00');
 assert.equal(taskTimeLabel(item({startTime:'09:00'})),'09:00');
 assert.equal(taskTimeLabel(item({})),'');
 assert.equal(taskTimeLabel(item({startTime:'09:00',endTime:'09:00'})),'09:00');
});
test('cross-day and continuing tasks keep their real date context',()=>{
 assert.equal(taskTimeLabel(item({startTime:'23:30',endYmd:'2026-10-11',endTime:'00:30'})),'23:30–次日 00:30');
 assert.equal(taskTimeLabel(item({endYmd:'2026-10-12'})),'10月10日–10月12日');
 const continuing={...item({startYmd:'2026-10-09',startTime:'23:30',endTime:'01:00'}),continuation:true};
 assert.equal(taskTimeLabel(continuing),'延续 · 10月9日 23:30–10月10日 01:00');
 assert.match(taskTimeLabel(item({startTime:'23:30',endYmd:'2027-01-01',endTime:'00:30'})),/2027/);
});
test('display-zone range wins without changing source fields or inventing an unscheduled time',()=>{
 const task=item({startTime:'23:30',endYmd:'2026-10-11',endTime:'00:30'});task.date='2026-10-11';task.displayRange={startYmd:'2026-10-11',endYmd:'2026-10-11',startTime:'00:30',endTime:'01:30'};
 assert.equal(taskTimeLabel(task),'00:30–01:30');assert.equal(task.payload.noria.startTime,'23:30');
 assert.equal(taskTimeLabel(item({fallbackDateSource:'created'}),'zh-CN',''),'');
 assert.match(taskTimeLabel(item({}),'zh-CN',''),/2026年10月10日/);
 assert.equal(taskTimeLabel(item({startTime:'23:30',endYmd:'2026-10-11',endTime:'00:30'}),'en'),'23:30–next day 00:30');
});
