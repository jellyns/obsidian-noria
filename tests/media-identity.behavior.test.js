const test=require('node:test'),assert=require('node:assert/strict');
const {mediaTypes}=require('../src/media-catalog.js');
const {classificationPatch}=require('../src/media-classification.js');
const {mediaDistribution}=require('../src/media-distribution-model.js');
const {filterMediaClassification}=require('../src/media-filter-model.js');
const {templateContent}=require('../src/media-content-model.js');

test('Chinese work identities support frontmatter and inline tags without changing stored text',()=>{
 const expected={book:['图书','书籍'],movie:['电影','影视','电视剧','动画'],music:['音乐','专辑','歌曲'],game:['游戏']};
 for(const [kind,tags] of Object.entries(expected))for(const tag of tags){
  const fm={tags:['#'+tag,'科幻']},before=JSON.stringify(fm);
  assert.deepEqual(mediaTypes(fm).types,[kind]);
  assert.deepEqual(mediaTypes({},['#'+tag]).types,[kind]);
  assert.equal(JSON.stringify(fm),before);
 }
 assert.deepEqual(mediaTypes({tags:['book','图书','书籍']}).types,['book']);
 assert.deepEqual(mediaTypes({tags:'电影, 科幻'}).tags,['电影','科幻']);
});

test('work identity is an exact tag, never inferred from activities, themes or custom descendants',()=>{
 for(const tag of ['阅读','待读','观影','科幻','电影研究','电影/科幻','兴趣/游戏','图书馆','游戏设计','音乐理论','arts/books/notes']){
  assert.deepEqual(mediaTypes({tags:[tag]}).types,[],tag);
 }
 assert.deepEqual(mediaTypes({tags:['#BOOK','arts/film','音乐','游戏']}).types,['book','movie','music','game']);
});

test('classification editing retains Chinese identity and prevents its replacement as a topic',()=>{
 const current={tags:['#图书','科幻']};
 assert.deepEqual(classificationPatch({tags:['文学']},current),{tags:['#图书','文学']});
 assert.deepEqual(classificationPatch({tags:[]},current),{tags:['#图书']});
 for(const tag of ['影视','书籍','歌曲','游戏'])assert.throws(()=>classificationPatch({tags:[tag]},current),e=>e.code==='invalid-input');
 assert.deepEqual(current.tags,['#图书','科幻']);
});

test('classification filters and charts share Chinese identities and cross-category topics',()=>{
 const work=(title,tags)=>({title,path:title+'.md',tags,kinds:mediaTypes({tags}).types,properties:{}});
 const rows=[work('三体',['图书','科幻']),work('星际穿越',['电影','科幻']),work('黑神话：悟空',['游戏'])];
 const chart=mediaDistribution(rows);
 assert.deepEqual(chart.result.groups.map(g=>[g.key,g.value]),[['科幻',2]]);
 assert.deepEqual(chart.missing.map(w=>w.title),['黑神话：悟空']);
 assert.deepEqual(filterMediaClassification(rows,{tag:['科幻']}).map(w=>w.title),['三体','星际穿越']);
 assert.deepEqual(filterMediaClassification(rows,{unclassified:true}).map(w=>w.title),['黑神话：悟空']);
});

test('Chinese templates keep their tags and reject a different work kind',()=>{
 const raw='---\ntags: ["图书","习惯"]\n---\n## 简介\n{{title}}\n';
 const parse=()=>({tags:['图书','习惯']});
 const result=templateContent(raw,{title:'原子习惯',tags:['book']},{parse});
 assert.ok(result.includes('"tags": ["图书","习惯"]'));assert.ok(result.endsWith('## 简介\n原子习惯\n'));
 assert.throws(()=>templateContent(raw,{title:'星际穿越',tags:['movie']},{parse}),e=>e.code==='template');
});
