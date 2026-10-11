const test=require('node:test'),assert=require('node:assert/strict');
const {mediaDistribution}=require('../src/media-distribution-model.js');
const work=(path,genre,tags=['book'],kinds=['book'])=>({path,title:path,properties:{genre},tags,kinds});
test('media distribution counts each work once per category and preserves overlaps and unclassified sources',()=>{
 const a=work('A.md',['成长','心理','成长']),b=work('B.md','成长'),c=work('C.md',' '),d=work('D.md',['小说',{}]);
 const items=[a,b,c,d,a],before=JSON.stringify(items),r=mediaDistribution(items,{dimension:'genre'});
 assert.equal(r.total,4);assert.equal(r.result.recorded,2);assert.deepEqual(r.result.groups.map(g=>[g.key,g.value]),[['成长',2],['心理',1]]);
 assert.deepEqual(r.missing.map(x=>x.path),['C.md']);assert.deepEqual(r.invalid.map(x=>x.path),['D.md']);
 assert.deepEqual(r.result.groups[0].rows.map(x=>x.path),['A.md','B.md']);assert.equal(JSON.stringify(items),before);
});
test('tag distribution excludes media identity tags and honors exact prefix boundaries without inventing ancestors',()=>{
 const rows=[work('A.md',null,['#book','topic/习惯','topic/习惯','topic/心理']),work('B.md',null,['arts/books','topics/不属于','topic']),work('C.md',null,['movie','topic/心理'],['movie'])];
 const r=mediaDistribution(rows,{dimension:'tag',tagPrefix:'#topic/',kind:'book'});
 assert.equal(r.total,2);assert.deepEqual(new Set(r.result.groups.map(g=>g.key)),new Set(['topic/习惯','topic/心理','topic']));
 assert.ok(r.result.groups.every(g=>g.value===1));assert.equal(r.missing.length,0);
 const all=mediaDistribution(rows,{dimension:'tag'});assert.ok(!all.result.groups.some(g=>['book','movie','arts/books'].includes(g.key)));assert.equal(all.result.groups.find(g=>g.key==='topic/心理').value,2);
});
test('empty and invalid genre values remain distinguishable and actual category names are not reserved',()=>{
 const r=mediaDistribution([work('A.md','未分类'),work('B.md',null),work('C.md',false),work('D.md',[])],{dimension:'genre'});
 assert.deepEqual(r.result.groups.map(g=>g.key),['未分类']);assert.equal(r.missing.length,2);assert.equal(r.invalid.length,1);
 assert.equal(mediaDistribution([]).total,0);
});

test('default distribution uses note tags without requiring duplicate genre metadata',()=>{
 const rows=[work('三体.md',null,['book','科幻']),work('星际穿越.md','剧情',['movie','科幻'],['movie'])];
 const result=mediaDistribution(rows);
 assert.deepEqual(result.result.groups.map(g=>[g.key,g.value]),[['科幻',2]]);
 assert.equal(result.missing.length,0);
 assert.deepEqual(mediaDistribution(rows,{dimension:'genre'}).result.groups.map(g=>g.key),['剧情']);
});
