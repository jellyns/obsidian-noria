const test=require('node:test'),assert=require('node:assert/strict');
const {filterMediaClassification}=require('../src/media-filter-model.js');
const item=(path,genre,tags,status='在读')=>({path,title:path,kinds:['book'],tags,properties:{genre,status}});
const rows=[item('A',['心理','成长'],['book','topic/生活']),item('B','成长',['book','topic/科学']),item('C',null,['book','topic/生活']),item('D',{name:'心理'},['book'])];
const paths=rows=>rows.map(r=>r.path);
test('classification alternatives unite within a dimension and intersect across dimensions',()=>{
 assert.deepEqual(paths(filterMediaClassification(rows,{genre:['心理','成长']})),['A','B']);
 assert.deepEqual(paths(filterMediaClassification(rows,{genre:['成长'],tag:['topic/生活']})),['A']);
 assert.deepEqual(paths(filterMediaClassification(rows,{tag:['topic/生活','topic/科学']})),['A','B','C']);
 assert.deepEqual(paths(filterMediaClassification(rows,{genre:['成长'],tag:['topic/生活','topic/科学']})),['A','B']);
});
test('untagged uses category tags rather than missing genre and combines with explicit properties',()=>{
 const sample=[...rows,item('E','未分类',['book']),item('F','成长',['book'])];
 assert.deepEqual(paths(filterMediaClassification(sample,{unclassified:true})),['D','E','F']);
 assert.deepEqual(paths(filterMediaClassification(sample,{unclassified:true,genre:['成长']})),['F']);
 assert.deepEqual(paths(filterMediaClassification(sample,{unclassified:true,tag:['topic/科学']})),['B','D','E','F']);
 assert.deepEqual(paths(filterMediaClassification(sample,{genre:['未分类']})),['E']);
});
test('filters preserve input order and values, exclude identity tags, and keep unmatched selections empty',()=>{
 const before=JSON.stringify(rows);
 assert.deepEqual(paths(filterMediaClassification(rows,{})),['A','B','C','D']);
 assert.deepEqual(filterMediaClassification(rows,{tag:['book']}),[]);
 assert.deepEqual(filterMediaClassification(rows,{tag:['topic']}),[]);
 assert.deepEqual(filterMediaClassification(rows,{genre:['不存在']}),[]);
 assert.deepEqual(paths(filterMediaClassification([rows[1]],{genre:['成长']})),['B']);
 assert.equal(JSON.stringify(rows),before);
});
