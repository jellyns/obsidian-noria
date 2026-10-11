const test=require('node:test'),assert=require('node:assert/strict');
const {overviewModel,selectedRows}=require('../src/period-overview-model.js');
process.env.TZ='Asia/Shanghai';
test('overview clips focus across midnight and counts overlapping time once',()=>{
 const rows=[{id:'a',startMs:+new Date('2026-10-09T23:30:00+08:00'),endMs:+new Date('2026-10-10T00:30:00+08:00')},{id:'b',startMs:+new Date('2026-10-10T00:15:00+08:00'),endMs:+new Date('2026-10-10T00:45:00+08:00')}];
 const m=overviewModel([{key:'focus',rows}],{start:'2026-10-10',end:'2026-10-10'},'2026-10-10');
 assert.equal(m.rows[0].total.value,45);
 assert.equal(m.rows[0].total.sources.length,2);
});
test('overview recomputes habit rates from scheduled occurrences and excludes future days',()=>{
 const rows=[{date:'2026-10-01',done:true},{date:'2026-10-01',done:false},{date:'2026-10-02',done:true},{date:'2026-10-20',done:false}];
 const m=overviewModel([{key:'habits',rows}],{start:'2026-10-01',end:'2026-12-31'},'2026-10-10');
 assert.equal(m.buckets.length,3);assert.ok(Math.abs(m.rows[0].total.value-200/3)<1e-10);assert.equal(m.rows[0].points[1].value,null);assert.equal(m.rows[0].points[1].future,true);
});
test('overview preserves missing diaries, recorded zero and unavailable data',()=>{
 const metrics=[{key:'words',rows:[{date:'2026-10-02',value:0}]},{key:'tasks',rows:[],error:'unavailable'}];
 const m=overviewModel(metrics,{start:'2026-10-01',end:'2026-10-02'},'2026-10-10');
 assert.equal(m.rows[0].points[0].value,null);assert.equal(m.rows[0].points[1].value,0);assert.equal(m.rows[1].total.value,null);
});
test('overview custom means ignore missing values and keep row selection stable',()=>{
 assert.deepEqual(selectedRows({row1:'words',row2:'none',row3:'words',row4:'tasks'}),['words','tasks']);
 const m=overviewModel([{key:'record:energy',rows:[{date:'2026-10-01',value:null},{date:'2026-10-02',value:4},{date:'2026-10-02',value:2}]}],{start:'2026-10-01',end:'2026-10-02'},'2026-10-10');
 assert.equal(m.rows[0].total.value,3);assert.equal(m.rows[0].points[0].value,null);
 const signed=overviewModel([{key:'record:balance',rows:[{date:'2026-10-01',value:-4},{date:'2026-10-02',value:2}]}],{start:'2026-10-01',end:'2026-10-02'},'2026-10-10');
 assert.equal(signed.rows[0].total.value,-1);assert.equal(signed.rows[0].min,-4);assert.equal(signed.rows[0].max,2);
});

test('categorical overview preserves false, deduplicates selections and leaves missing days empty',()=>{
 const m=overviewModel([{key:'record:mood',categorical:true,categories:[{key:'稳定'},{key:'偏低'}],rows:[{date:'2026-10-01',value:['稳定','稳定']},{date:'2026-10-02',value:'偏低'}]},{key:'record:exercise',categorical:true,rows:[{date:'2026-10-01',value:false}]}],{start:'2026-10-01',end:'2026-10-03'},'2026-10-10');
 assert.deepEqual(m.rows[0].total.categories,[{key:'稳定',count:1},{key:'偏低',count:1}]);assert.equal(m.rows[0].total.value,2);assert.equal(m.rows[0].points[2].value,null);
 assert.deepEqual(m.rows[1].total.categories,[{key:'false',count:1}]);assert.equal(m.rows[1].total.sources.length,1);
});
