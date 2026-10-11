const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/progress-rings-model.js');
const {fields}=require('../src/progress-rings-fields.js');
const en=(a,b)=>b;
test('progress rings keep each unit separate and cap only the drawn arc',()=>{
 const hours=M.metricModel({calculate:'sum',target:2,unit:'h'},{value:3});
 const tasks=M.metricModel({calculate:'rate'},{numerator:1,denominator:4});
 assert.equal(hours.ratio,1.5);assert.equal(hours.arc,1);assert.equal(hours.value,3);
 assert.equal(tasks.ratio,.25);assert.equal(tasks.value,1);assert.equal(tasks.target,4);
 assert.equal(M.metricModel({calculate:'sum',target:2},{value:0}).status,'ready');
 assert.equal(M.metricModel({calculate:'sum',target:2},{value:0}).ratio,0);
});
test('empty, unset targets, invalid sources and negative values never become zero progress',()=>{
 assert.equal(M.metricModel({calculate:'rate'},{numerator:0,denominator:0}).status,'empty');
 assert.equal(M.metricModel({calculate:'sum',target:10},{value:null}).status,'empty');
 assert.equal(M.metricModel({calculate:'sum'},{value:4}).status,'no-target');
 const partial=M.metricModel({calculate:'sum',target:10},{value:4,unreadable:[{path:'x'}]});assert.equal(partial.status,'incomplete');assert.equal(partial.ratio,null);assert.equal(partial.value,4);
 assert.equal(M.metricModel({calculate:'sum',target:10},{value:-1}).status,'negative');
});
test('source switching ignores stale property units and all series share the exact date range',()=>{
 const config={ringCount:'2',ring1Source:'tasks',ring1Property:'hours',ring1Unit:'h',ring2Source:'diary',ring2Property:'hours',ring2Calculation:'mean',ring2Target:8};
 M.validate(config);const metrics=M.metrics(config);assert.equal(metrics[0].property,'');assert.equal(metrics[0].unit,'');
 const range={start:'2026-10-01',end:'2026-10-07'};
 for(const metric of metrics){const q=M.queryConfig(metric,range);assert.equal(q.start,range.start);assert.equal(q.end,range.end);assert.equal(q.display,'metric');assert.equal(q.scope,'fixed');}
 assert.equal(metrics[1].calculate,'mean');assert.equal(metrics[1].target,8);
});
test('configuration allows missing targets but rejects invalid target semantics',()=>{
 for(const target of ['',undefined,8])M.validate({ringCount:1,ring1Source:'diary',ring1Property:'hours',ring1Target:target});
 for(const target of [0,-1,Infinity,'bad'])assert.throws(()=>M.validate({ringCount:1,ring1Source:'diary',ring1Property:'hours',ring1Target:target}));
 assert.throws(()=>M.validate({ringCount:5}));assert.throws(()=>M.validate({ringCount:1,ring1Source:'diary'}));
 const names=fields({ringCount:'1',ring1Source:'diary'},en).map(f=>f.key);assert.ok(names.includes('ring1Target'));assert.ok(!names.includes('ring2Source'));
});
