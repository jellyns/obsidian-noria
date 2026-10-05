const test=require('node:test'),assert=require('node:assert/strict');
const {removeBuiltInViews,planHabitHistory,plainTemplate}=require('../scripts/diary-handoff-plan.cjs');
test('handoff removes only recognized built-ins and preserves authored text and custom fences',()=>{
  const built='```noria-view\n{"view":"focusPanel","props":{"sourcePath":"Habits.md"}}\n```\n';
  const custom='```noria-view\n{"view":"focusPanel","props":{"sourcePath":"Other.md"}}\n```\n';
  const example='````md\n'+built+'````\n';
  const raw='---\nkey: kept\n---\n## 自定标题\n正文  \n'+built+custom+example;
  const result=removeBuiltInViews(raw,'Habits.md');
  assert.equal(result.text,'---\nkey: kept\n---\n## 自定标题\n正文  \n'+custom+example);
  assert.equal(result.removed.length,1);assert.equal(result.retained.length,1);
  assert.equal(removeBuiltInViews(result.text,'Habits.md').text,result.text);
});
test('habit handoff preserves exact observations and never turns targets into measured values',()=>{
  const registry='## Active habits\n- 阅读 [type::number] [target::20]\n## History\n- [x] 阅读20分钟 #habit 📅 2026-09-12 ✅ 2026-09-12\n- [ ] 阅读 #habit [due::2026-09-13] [value::0]\n';
  const before='## 自由记录\r\n原文  \r\n';
  const result=planHabitHistory(registry,new Map([['2026-09-12.md',before]]),d=>d+'.md');
  assert.equal(result.moved.length,2);assert.equal(result.registryAfter,'## Active habits\n- 阅读 [type::number] [target::20]\n## History\n');
  const day=result.notes.get('2026-09-12.md');assert(day.startsWith(before));assert(day.includes('- [x] 阅读20分钟 #habit 📅 2026-09-12 ✅ 2026-09-12'));
  assert.doesNotMatch(day,/value::/);assert.match(result.notes.get('2026-09-13.md'),/value::0/);
  const twice=planHabitHistory(result.registryAfter,result.notes,d=>d+'.md');assert.equal(twice.moved.length,0);assert.deepEqual(twice.notes,result.notes);
});
test('only wrappers emptied by a removed built-in disappear, while authored task plans remain',()=>{
  const view='```noria-view\n{"view":"dailyOtherToday","props":{}}\n```\n';
  const result=removeBuiltInViews('## 待办\n### 今日任务\n'+view+'## Inbox\n手写内容\n','Habits.md');
  assert.equal(result.text,'## Inbox\n手写内容\n');
  const authored='## 待办\n- [ ] 我的计划\n'+view+'## 自定标题\n';
  assert.equal(removeBuiltInViews(authored,'Habits.md').text,'## 待办\n- [ ] 我的计划\n## 自定标题\n');
});
test('conflicts, pending placeholders, source links and date-note withdrawals stay unresolved',()=>{
  const lines=['- [x] 散步 #habit [due::2026-09-10]','- [ ] 散步 #habit [due::2026-09-10]',
    '- [ ] 散步 #habit [due::2026-09-11]','- [x] 散步 #habit [due::2026-09-12] ^walk',
    '- [x] 散步 #habit [due::2026-09-13]','- [x] 散步 #habit [due::2026-09-14]','  私人备注需随正文处理'];
  const registry=lines.join('\n'),notes=new Map([['2026-09-13.md','- [ ] 散步 #habit [due::2026-09-13]\n']]);
  const result=planHabitHistory(registry,notes,d=>d+'.md');assert.equal(result.registryAfter,registry);assert.equal(result.moved.length,0);assert.equal(result.retained.length,5);assert.deepEqual(result.notes,notes);
});
test('template proposal keeps properties without sample weather or rendering placeholders',()=>{
  const next=plainTemplate('---\ncssclasses: [daily-clean]\ncustom: keep\nweather: 晴\nweather_temp: 20\n---\n## Old\nbody');
  assert.equal(next,'---\ncssclasses: [daily-clean]\ncustom: keep\n---\n\n## 记录\n\n## 计划\n');
  assert.throws(()=>plainTemplate('custom template without properties'),/reviewed explicitly/);
});
test('filesystem preview writes only new reviewable copies and rejects source-vault output or stale review inputs',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {preview}=require('../scripts/preview-diary-handoff.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'noria-handoff-')),vault=path.join(root,'vault');
  try{
    fs.mkdirSync(path.join(vault,'Diary'),{recursive:true});
    const template='---\ncssclasses: [daily-clean]\n---\n## Old template\n';
    fs.writeFileSync(path.join(vault,'Template.md'),template);
    const registry='## Active habits\n- Read\n## History\n- [x] Read #habit [due::2026-09-12]\n';
    fs.writeFileSync(path.join(vault,'Habits.md'),registry);
    const config={vault,output:path.join(root,'preview'),diaryRoot:'Diary',registry:'Habits.md',templates:['Template.md'],dailyPath:'Diary/{date}.md'};
    const result=preview(config);assert.equal(result.productionWrites,0);assert.equal(result.habits.moved.length,1);
    assert.equal(fs.readFileSync(path.join(vault,'Habits.md'),'utf8'),registry);assert.equal(fs.readFileSync(path.join(vault,'Template.md'),'utf8'),template);
    assert.equal(fs.existsSync(path.join(vault,'Diary/2026-09-12.md')),false);
    assert.match(fs.readFileSync(path.join(config.output,'after/Diary/2026-09-12.md'),'utf8'),/Read #habit/);
    assert.throws(()=>preview({...config,output:path.join(vault,'preview')}),/outside the source vault/);
    const previous=path.join(root,'review.json'),after=path.join(root,'after.md');fs.writeFileSync(after,'changed');
    fs.writeFileSync(previous,JSON.stringify({changed:[{relative:'Template.md',beforeSha256:'stale',afterSha256:'stale',after}]}));
    assert.throws(()=>preview({...config,output:path.join(root,'stale-preview'),reviewManifest:previous}),/stale/);
    assert.equal(fs.existsSync(path.join(root,'stale-preview')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
