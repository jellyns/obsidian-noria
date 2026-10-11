const test=require('node:test'),assert=require('node:assert/strict');
const {recentSuggestionSource}=require('../src/suggestion-source.js');
const source={date:'2026-10-11',path:'Daily/2026-10-11.md',heading:'建议'};
function lookup(notes){const reads=[];return {reads,options:{resolvePath:async date=>'Daily/'+date+'.md',read:async path=>{reads.push(path);return notes[path]??null;}}};}
test('latest advice retains its real date and respects the configured daily-note resolver',async()=>{
 const f=lookup({'Daily/2026-10-11.md':'## 记录\n今天的记录','Daily/2026-10-09.md':'## 建议\n\n先核对项目材料。'});
 const found=await recentSuggestionSource(source,f.options);assert.equal(found.date,'2026-10-09');assert.equal(found.path,'Daily/2026-10-09.md');assert.equal(f.reads.length,3);
});
test('an empty latest section does not resurrect an older removed recommendation',async()=>{
 const f=lookup({'Daily/2026-10-10.md':'## 建议\n\n## 复盘\n保留。','Daily/2026-10-09.md':'## 建议\n过时建议'});
 assert.equal((await recentSuggestionSource(source,f.options)).date,'2026-10-10');assert.equal(f.reads.length,2);
});
test('lookup stops at unreadable or ambiguous sources instead of disguising them with older content',async()=>{
 for(const raw of [null,'## 建议\n甲\n## 建议\n乙']){
  const read=[];const found=await recentSuggestionSource(source,{resolvePath:async date=>'Daily/'+date+'.md',read:async path=>{read.push(path);if(path===source.path)return null;if(raw==null)throw Error('disk error');return raw;}});
  assert.equal(found.date,'2026-10-10');assert.equal(read.length,2);
 }
});
test('lookup is bounded, ignores future dates and crosses calendar years without scanning the vault',async()=>{
 const f=lookup({'Daily/2026-10-12.md':'## 建议\n未来内容'});await recentSuggestionSource(source,f.options);assert.equal(f.reads.length,30);assert.equal(f.reads.at(-1),'Daily/2026-09-12.md');assert.ok(!f.reads.includes('Daily/2026-10-12.md'));
 const g=lookup({'Daily/2025-12-31.md':'## 建议\n上次建议'}),found=await recentSuggestionSource({...source,date:'2026-01-01',path:'Daily/2026-01-01.md'},g.options);
 assert.equal(found.date,'2025-12-31');assert.equal(g.reads.length,2);
});
