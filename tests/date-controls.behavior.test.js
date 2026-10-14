const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../src/date-control-model.js');
test('month and year navigation clamps dates without skipping periods',()=>{
 assert.equal(M.shiftDate('2024-01-31','month',1),'2024-02-29');
 assert.equal(M.shiftDate('2024-02-29','year',1),'2025-02-28');
 assert.equal(M.shiftDate('2026-01-01','month',-1),'2025-12-01');
 assert.equal(M.shiftDate('2026-12-28','week',1),'2027-01-04');
 assert.equal(M.date('2026-02-30'),null);
});
test('natural and rolling periods keep their different meanings',()=>{
 assert.deepEqual(M.periodRange('month','2024-02-18'),{start:'2024-02-01',end:'2024-02-29'});
 assert.deepEqual(M.periodRange('last30','2024-02-18'),{start:'2024-01-20',end:'2024-02-18'});
 assert.deepEqual(M.periodRange('week','2026-01-01'),{start:'2025-12-29',end:'2026-01-04'});
 assert.equal(M.rangeLabel('2025-12-29','2026-01-04','week','zh'),'2025-12-29 – 2026-01-04');
 assert.equal(M.currentLabel('year'),'今年');
});
test('date headings retain exact week bounds while separating month and range',()=>{
 assert.deepEqual(M.dateHeading('2026-10-11','2026-10-17','week','zh'),{primary:'2026年10月',secondary:'11–17日'});
 assert.deepEqual(M.dateHeading('2026-09-27','2026-10-03','week','zh'),{primary:'2026年',secondary:'9/27–10/3'});
 assert.deepEqual(M.dateHeading('2026-12-27','2027-01-02','week','zh'),{primary:'2026–2027',secondary:'12/27–1/2'});
 assert.deepEqual(M.dateHeading('2026-10-14','2026-10-14','day','zh'),{primary:'10月14日',secondary:'周三 · 2026'});
 assert.deepEqual(M.dateHeading('2026-09-15','2026-10-14','last30','zh'),{primary:'9/15–10/14',secondary:'2026'});
 assert.deepEqual(M.dateHeading('2026-10-01','2026-10-31','month','en'),{primary:'Oct',secondary:'2026'});
});
test('page-following charts resolve the saved historical anchor and return to current month without it',()=>{
 const ctx={Date,console};ctx.globalThis=ctx;vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('src/runtime/views/dashboard/core/data/data-service.js','utf8'),ctx);
 const data=ctx.dashboardCore.data.dataService,bridge={homeSettings:{trendsRange:{mode:'month',anchor:'2024-02-18'}}};
 let range=data.resolveRange({mode:'homeCurrent'},{bridge,now:'2026-10-14'});
 assert.equal(range.start,'2024-02-01');assert.equal(range.end,'2024-02-29');assert.equal(range.mode,'month');
 bridge.homeSettings.trendsRange={mode:'month'};range=data.resolveRange({mode:'homeCurrent'},{bridge,now:'2026-10-14'});
 assert.equal(range.start,'2026-10-01');assert.equal(range.end,'2026-10-31');
});
