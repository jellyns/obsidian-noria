const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
test('aligned daily series preserve missing dates, zero and conflicting date notes',()=>{
 const {alignDailyRecords}=require('../src/property-statistics.js');
 const model=alignDailyRecords([{rows:[{date:'2026-09-01',value:0},{date:'2026-09-03',value:4}]},{rows:[{date:'2026-09-02',value:'稳定'},{date:'2026-09-03',value:3},{date:'2026-09-03',value:5}]}],{start:'2026-09-01',end:'2026-09-03'});
 assert.deepEqual(model.dates,['2026-09-01','2026-09-02','2026-09-03']);
 assert.deepEqual(model.series[0].map(r=>r.value),[0,null,4]);assert.equal(model.series[1][2].ambiguous,true);assert.equal(model.series[1][2].value,null);
});
function projectParser(file,name,next){
 const source=fs.readFileSync(path.join(__dirname,'../src/runtime/views',file),'utf8');
 const fragment=source.slice(source.indexOf(`  const ${name} =`),source.indexOf(`  const ${next} =`));
 return vm.runInNewContext(`${fragment}\n${name}`,{projectsRoot:'Noria/Projects',normalizeName:x=>String(x||'').trim(),normalizePath:x=>String(x||'').trim().replace(/\\/g,'/'),escapeRegExp:x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')});
}
test('project entry labels keep the alias and source when a description follows the link',()=>{
 for(const [file,name,next] of [['dashboard/home/sections/guide-panels/view.js','parseProjectItem','stripFrontmatter'],['periodic/dashboardGuideProjects.js','parseItemText','toEntryMap']]){
  const parse=projectParser(file,name,next),row=parse('- [[Noria/Projects/Work/Work.md|工作区]]：熟悉任务与复盘。');
  assert.equal(row.name,'工作区');assert.equal(row.targetPath,'Noria/Projects/Work/Work.md');
  assert.equal(row.description,'：熟悉任务与复盘。');
 }
});
test('mood choices stay distinct without changing stored values',()=>{
 const filename=path.resolve(__dirname,'../src/record-fields.js'),module={exports:{}},local=createRequire(filename);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>['obsidian','./record-manager.js','./record-popover.js','./card-controls.js'].includes(id)?{}:local(id)});
 const records=new module.exports.RecordFields({app:{},settings:{},getNoriaLocale:()=> 'zh',displayRuntimeLabel:(_,value)=>value==='一般'?'稳定':value});
 const field=records.definitions()[0];assert.equal(records.display(field,'一般'),'一般');assert.equal(records.display(field,'稳定'),'稳定');
 assert.equal(new Set(field.options.map(v=>records.display(field,v))).size,field.options.length);
});
test('project serialization retains the description and previous stage while changing display name',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/runtime/views/dashboard/home/sections/guide-panels/view.js'),'utf8');
 const fragment=source.slice(source.indexOf('  const buildProjectBody ='),source.indexOf('  const processProjectRegistry ='));
 const build=vm.runInNewContext(`${fragment}\nbuildProjectBody`,{normalizeName:x=>String(x||'').trim(),normalizePath:x=>String(x||'').trim(),projectsUseChinese:true,PROJECT_SECTIONS:{hidden:'隐藏',active:'进行中',planned:'计划中',done:'完成'}});
 const registry={hidden:new Map([['新名称',{name:'新名称',targetPath:'Projects/Work.md',description:'：保留这段说明及 [[来源]]。',previousStage:'planned'}]]),active:new Map(),planned:new Map(),done:new Map()};
 const raw=build(registry);assert.match(raw,/- \[\[Projects\/Work.md\|新名称\]\]：保留这段说明及 \[\[来源\]\]。 <!-- noria-stage:planned -->/);
});
