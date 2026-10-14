const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=(dir,name)=>fs.readFileSync(path.join(dir,name),'utf8');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
function generate(t,locale){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'noria-story-')),vault=path.join(temp,'vault');
 t.after(()=>{const absolute=path.resolve(temp),base=path.resolve(os.tmpdir());assert.ok(absolute.startsWith(base+path.sep)&&path.basename(absolute).startsWith('noria-story-'));fs.rmSync(absolute,{recursive:true,force:true});});
 const result=spawnSync(process.execPath,['scripts/prepare-release-demo-vault.mjs',vault,'--date=2026-10-14','--locale='+locale],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);return vault;
}
test('public story has a single source for tasks, check-ins and focus records',t=>{
 const vault=generate(t,'en'),data=JSON.parse(read(vault,'.obsidian/plugins/noria/data.json'));
 assert.equal(data.onboarding.profile,'ipara');assert.equal(data.weather.enabled,false);
 for(const name of ['00_Inbox','01_Projects','02_Areas','03_Resources','04_Archives','05_MOC','06_Diary','99_Attachment'])assert.ok(fs.existsSync(path.join(vault,name)));
 assert.deepEqual(data.workbenchPages.pages.map(p=>p.id),['home','diary','day','calendar']);
 assert.ok(data.shortcuts.every(e=>e.kind==='file'&&fs.existsSync(path.join(vault,e.target))));
 assert.ok(data.homeDashboard.mocEntries.every(e=>fs.existsSync(path.join(vault,e.path))));
 for(const key of ['dailyTemplate','weeklyTemplate','monthlyTemplate','yearlyTemplate'])assert.equal(data.managedPaths[key],'');
 const today=read(vault,'06_Diary/2026/2026-10-14.md');
 assert.match(today,/Send the return parcel/);assert.doesNotMatch(today,/^- \[.\] Explain the bookshop design decisions/m);
 const focus=require('../src/focus-document.js').readFocusDocument(today,'2026-10-14');
 assert.equal(focus.errors.size,0);assert.equal(focus.records.size,2);
 const portfolio=read(vault,'01_Projects/Publish my portfolio/Publish my portfolio.md');
 assert.match(portfolio,/\[start:: 2026-10-14 09:30\] \[due:: 2026-10-14 10:45\]/);
 assert.match(portfolio,/^- \[ \] Organize the original project files #work$/m);
 assert.match(portfolio,/Send the preview to a colleague \[due:: 2026-10-16\]/);
 const registry=read(vault,data.managedPaths.habitRegistry);
 assert.doesNotMatch(registry,/\[completion::/);
 const definitions=require('../src/habit-definition.js').readHabitDefinitions(registry);
 assert.equal(definitions.length,3);assert.equal(definitions.find(h=>h.name==='Strength training').weekdays,'135');
 const restDay=read(vault,'06_Diary/2026/2026-10-13.md');assert.doesNotMatch(restDay,/^- \[.\] Strength training/m);
 const diaries=walk(path.join(vault,'06_Diary')).filter(f=>/\d{4}-\d{2}-\d{2}\.md$/.test(f));
 assert.equal(diaries.length,14);
 const mood=data.recordFields.find(f=>f.id==='mood'),scale=require('../src/daily-record-chart.js').recordTrendScale(mood,[]);
 assert.ok(scale,'The translated demo retains the ordered mood scale');
 const levels=diaries.map(f=>scale.value(JSON.parse(/^mood: (.+)$/m.exec(fs.readFileSync(f,'utf8'))[1])));
 assert.ok(levels.every(v=>v!==null));assert.ok(new Set(levels).size>=3,'Mood history contains the intended variation');
 const notes=diaries.map(f=>fs.readFileSync(f,'utf8'));
 assert.equal(new Set(notes.map(s=>/^## .+$/m.exec(s)[0])).size,14);
 assert.ok(notes.some(s=>/^- \[ \].*#habit/m.test(s)),'History includes genuinely incomplete targets');
 const markdown=walk(vault).filter(f=>f.endsWith('.md')).map(f=>read(vault,path.relative(vault,f))).join('\n');
 assert.doesNotMatch(markdown,/WENO|ZFD|jellyns|Review one captured note|Kept the next action visible/);
 assert.match(read(vault,'README.md'),/fictional records/);
 for(const [,target] of markdown.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)){
  const name=target.endsWith('.md')||target.endsWith('.base')?target:target+'.md';
  assert.ok(fs.existsSync(path.join(vault,name))||walk(vault).some(f=>path.basename(f)===name),'Unresolved source: '+target);
 }
});
test('Chinese and English tell the same story with matching task dates and habit schedules',t=>{
 const zh=generate(t,'zh-CN'),en=generate(t,'en');
 const inventory=vault=>{const files=walk(vault).filter(f=>f.endsWith('.md'));const text=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');return {files:files.length,dates:[...text.matchAll(/\[(start|due|scheduled|completion):: ([^\]]+)\]/g)].map(m=>m[1]+':'+m[2]).sort(),focus:(text.match(/\^focus-/g)||[]).length};};
 assert.deepEqual(inventory(zh),inventory(en));
 assert.match(read(zh,'06_Diary/2026/2026-10-14.md'),/第一版一直在讲做了什么/);
 assert.match(read(zh,'06_Diary/2026/2026-W42.md'),/同事对/);
 assert.match(read(zh,'02_Areas/Noria/Projects.md'),/发布个人作品集/);
});
test('generator refuses a nonempty destination without changing it',t=>{
 const vault=generate(t,'en'),before=read(vault,'README.md');
 const result=spawnSync(process.execPath,['scripts/prepare-release-demo-vault.mjs',vault],{cwd:root,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.equal(read(vault,'README.md'),before);
});
