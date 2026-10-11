const test=require('node:test'),assert=require('node:assert/strict');
const {datedName,datedNotesBase,bindDatedBase}=require('../src/dated-notes.js');
test('dated filenames preserve optional time and reject invalid dates',()=>{
 assert.deepEqual(datedName('2026-10-08 读后感.md'),{date:'2026-10-08',time:null,title:'读后感'});
 assert.deepEqual(datedName('2026-10-08 1030 判断.md'),{date:'2026-10-08',time:'10:30',title:'判断'});
 assert.equal(datedName('2026-10-08 1984 读后感.md').title,'1984 读后感');
 for(const name of ['2026-02-30 无效.md','2026-10-08 2430 无效.md','2026-10-08.md','普通笔记.md'])assert.equal(datedName(name),null);
});
test('shared Base has contextual and all views without writing dates or relying on mtime',()=>{
 const source=datedNotesBase('en');
 assert.match(source,/name: Records/);assert.match(source,/name: All/);assert.match(source,/this.file.name/);assert.doesNotMatch(source,/mtime|ctime|uuid|created|today\(/);
});
test('period binding retains source settings and gives ISO week-year context without a diary file',()=>{
 const config={filters:'file.hasTag("mine")',views:[{type:'list',name:'My list',order:['formula.source']}],formulas:{contextName:'this.file.name',contextPath:'this.file.path',standalone:'this.file.ext == "base"',periodFormat:'kept',custom:'note.rating * 2'}};
 const before=JSON.stringify(config);
 for(const [mode,date,period] of [['daily','2021-01-01','2021-01-01'],['weekly','2021-01-01','2020-W53'],['monthly','2020-02-29','2020-02'],['yearly','2020-02-29','2020']]){
  const path='Custom/'+period+'.md',bound=bindDatedBase(config,{mode,anchorDate:date},path);
  assert.equal(JSON.parse(bound.formulas.contextName),period);assert.equal(JSON.parse(bound.formulas.contextPath),path);
  assert.equal(bound.formulas.standalone,'false');assert.deepEqual(bound.views,config.views);assert.equal(bound.filters,config.filters);assert.equal(bound.formulas.custom,config.formulas.custom);
 }
 assert.equal(JSON.stringify(config),before);
 assert.equal(bindDatedBase({formulas:{unrelated:'file.name'}},{mode:'daily',anchorDate:'2021-01-01'},'x'),null);
 assert.throws(()=>bindDatedBase(config,{mode:'weekly',anchorDate:'2021-02-30'},'x'),RangeError);
 const grouped={...config,views:[{name:'Dates',groupBy:{property:'formula.group'}},{name:'My topics',groupBy:{property:'note.topic'}}]};
 const day=bindDatedBase(grouped,{mode:'daily',anchorDate:'2021-01-01'},'x');
 assert.equal(day.views[0].groupBy,undefined);assert.deepEqual(day.views[1],grouped.views[1]);assert.ok(grouped.views[0].groupBy);
});
test('reusable Base artifact stays aligned with its generator',()=>{
 const fs=require('node:fs'),path=require('node:path');
 assert.equal(fs.readFileSync(path.join(__dirname,'../docs/templates/Dated notes.base'),'utf8'),datedNotesBase('en'));
});
