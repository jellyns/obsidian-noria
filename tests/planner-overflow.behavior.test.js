const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
const start=source.indexOf('function planPlannerOverflow('),end=source.indexOf('\nfunction ',start+10);
const plan=vm.runInNewContext(source.slice(start,end)+';planPlannerOverflow');
const item=(col,start=600,end=660)=>({col,start,end});
test('six concurrent tasks retain readable slots and represent every remaining task once',()=>{
 const tasks=Array.from({length:6},(_,i)=>item(i)),p=plan(tasks,164,true);
 assert.equal(p.capacity,2);assert.equal(p.hidden.size,4);assert.equal(p.summaries.length,1);
 assert.deepEqual(Array.from(p.summaries[0].items),tasks.slice(2));
 assert.equal(p.summaries[0].start,600);assert.equal(p.summaries[0].end,660);
 assert.ok((100-p.reservePct)/100*164/2>=60);
});
test('a long visible task does not merge morning and afternoon overflow into a whole-day summary',()=>{
 const long=item(0,420,1380),morning=[item(1),item(2)],afternoon=[item(1,900,960),item(2,900,960)],later=item(1,1080,1140);
 const p=plan([long,...morning,...afternoon,later],164,true);
 assert.equal(p.hidden.size,2);assert.ok(!p.hidden.has(long));assert.ok(!p.hidden.has(later));
 assert.deepEqual(Array.from(p.summaries,s=>[s.start,s.end]),[[600,660],[900,960]]);
});
test('touching overflow intervals stay separate, overlapping ones share their union',()=>{
 const p=plan([item(1,600,645),item(2,620,660),item(1,660,720)],100,true);
 assert.deepEqual(Array.from(p.summaries,s=>[s.start,s.end,s.items.length]),[[600,660,2],[660,720,1]]);
});
test('wide week and day views keep all original tasks; planning does not mutate source intervals',()=>{
 const tasks=Array.from({length:6},(_,i)=>item(i)),before=JSON.stringify(tasks);
 for(const [width,enabled] of [[800,true],[164,false],[0,true]]) assert.equal(plan(tasks,width,enabled).hidden.size,0);
 plan(tasks,90,true);assert.equal(JSON.stringify(tasks),before);
});
