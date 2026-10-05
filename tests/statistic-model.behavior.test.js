const test=require('node:test'),assert=require('node:assert/strict'),M=require('../src/statistic-model.js'),{summarize}=require('../src/property-statistics.js');
const row=(path,value,date)=>({path,date,properties:{v:value},tags:[]});
test('time charts preserve missing days, zeros and duplicate category sources',()=>{
 const rows=[row('a',0,'2026-09-01'),row('b',4,'2026-09-03')],config={property:'v',calculate:'mean'};
 const r={...summarize(rows,config),range:{start:'2026-09-01',end:'2026-09-03'}};
 assert.deepEqual(M.calendarPoints(r,config).map(p=>p.value),[0,null,4]);
 const c={property:'v',calculate:'distribution'},duplicate={...summarize([row('a','calm','2026-09-01'),row('b','low','2026-09-01')],c),range:r.range};
 assert.equal(M.calendarPoints(duplicate,c)[0].ambiguous,true);assert.equal(M.calendarPoints(duplicate,c)[0].value,null);
 const lists={...summarize([row('a',['calm','calm',''],'2026-09-01'),row('b',['calm','low'],'2026-09-03')],c),range:r.range};
 const points=M.calendarPoints(lists,c);assert.equal(points[0].value,'calm');assert.equal(points[1].multiple,false);assert.equal(points[2].multiple,true);assert.equal(points[2].value,null);assert.equal(points[2].rows.length,1);
});
test('overlapping and negative compositions cannot become donut shares',()=>{
 assert.equal(M.exclusiveGroups(summarize([row('a',['x','y'])],{property:'v',calculate:'distribution'})),false);
 assert.equal(M.exclusiveGroups(summarize([row('a','x'),row('b','y')],{property:'v',calculate:'distribution'})),true);
 assert.equal(M.exclusiveGroups({value:-2,rows:[{path:'a'}],groups:[{value:-2,rows:[{path:'a'}]}]}),false);
});
test('completion ratios use all eligible rows and leave an empty denominator unknown',()=>{
 assert.deepEqual(M.completion([{done:true},{done:false}]).value,50);assert.equal(M.completion([]).value,null);
});
test('comparison aligns elapsed ranges and does not invent growth from zero',()=>{
 assert.deepEqual(M.priorRange({start:'2026-09-01',end:'2026-09-30'},'2026-09-23'),{current:{start:'2026-09-01',end:'2026-09-23'},previous:{start:'2026-08-09',end:'2026-08-31'},partial:true});
 assert.equal(M.delta(2,0).percent,null);assert.equal(M.delta(null,2).absolute,null);
 assert.throws(()=>M.priorRange({start:'2026-10-01',end:'2026-10-31'},'2026-09-23'));
});
test('chart choices follow data shape and calendar input is bounded',()=>{
 assert.ok(M.chartOptions({calculate:'rate'}).includes('progress'));assert.ok(!M.chartOptions({calculate:'rate'}).includes('donut'));
 assert.ok(!M.chartOptions({calculate:'distribution'}).includes('line'));assert.throws(()=>M.datesIn({start:'2000-01-01',end:'2026-01-01'}));
});
