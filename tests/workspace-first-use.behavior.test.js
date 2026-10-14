const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const setup=require('../src/workspace-setup.js');
function make(saved={}){
  const file=path.resolve(__dirname,'../main.js'),module={exports:{}},realRequire=createRequire(file);
  const obsidian=new Proxy({getLanguage:()=> 'zh',setIcon(){},normalizePath:p=>p},{get:(o,k)=>o[k]||class{}});
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>id==='obsidian'?obsidian:realRequire(id),console,setTimeout,clearTimeout,setInterval,clearInterval,process,URL,URLSearchParams,TextEncoder,TextDecoder,structuredClone,Buffer},{filename:file});
  const plugin=new module.exports(),files=new Map(),folders=[];
  plugin.app={vault:{getAbstractFileByPath:p=>files.has(p)?{path:p,extension:'md'}:folders.includes(p)?{path:p,children:[]}:null,
    adapter:{stat:async p=>files.has(p)?{type:'file'}:folders.includes(p)?{type:'folder'}:null,exists:async p=>files.has(p)||folders.includes(p),read:async p=>{if(!files.has(p))throw Error('missing');return files.get(p);}},
    createFolder:async p=>{folders.push(p);},create:async(p,s)=>{assert.ok(!files.has(p));files.set(p,s);return {path:p};}},workspace:{}};
  plugin.ensureVaultParent=async p=>{folders.push(p.substring(0,p.lastIndexOf('/')));};
  plugin.getLocalYmd=()=>"2026-10-14";plugin.settings=plugin.normalizeSettings(saved);plugin.saveSettings=async()=>{plugin.settings=plugin.normalizeSettings(plugin.settings);};
  return {plugin,files,folders};
}
test('fresh IPARA stays empty until confirmation, which creates folders without support files',async()=>{
  const {plugin,files,folders}=make();
  assert.equal(plugin.settings.onboarding.profile,'ipara');
  assert.equal(plugin.getManagedPath('diaryRoot'),'06_Diary');
  assert.equal(plugin.getManagedPath('dailyTemplate'),'');
  assert.equal(plugin.getManagedPath('timelineSettings'),'');
  assert.equal(plugin.settings.home.identity.avatarPath,'');
  assert.equal(plugin.settings.homeDashboard.mocEntries.length,0);
  const before=JSON.stringify(plugin.settings.weather);
  assert.equal(folders.length,0);
  await plugin.initializeMissingManagedNotes();
  assert.equal(files.size,0);assert.deepEqual(folders,setup.iparaFolders);
  assert.equal(JSON.stringify(plugin.settings.weather),before);
  assert.equal(plugin.getManagedPath('dailyTemplate'),'');
});
test('existing standard and custom paths and blank template selections survive normalization',()=>{
  for(const profile of ['standard','custom']){
    const {plugin}=make({onboarding:{profile,workspaceRoot:'MySpace'},managedPaths:{diaryRoot:'Journal',dailyTemplate:'Templates/My day.md',weeklyTemplate:''},home:{identity:{avatarPath:'my.jpg',quoteListPath:''}}});
    assert.equal(plugin.getManagedPath('diaryRoot'),'Journal');assert.equal(plugin.getManagedPath('dailyTemplate'),'Templates/My day.md');
    assert.equal(plugin.getManagedPath('weeklyTemplate'),'');assert.equal(plugin.settings.home.identity.avatarPath,'my.jpg');
    assert.equal(plugin.normalizeSettings(plugin.settings).home.identity.quoteListPath,'');
  }
});
test('directory preset changes future paths but does not replace personal navigation or write notes',()=>{
  const {plugin,files}=make({onboarding:{profile:'custom'},homeDashboard:{mocEntryPaths:['Mine.md'],mocEntries:[{path:'Mine.md',color:''}]},home:{identity:{avatarPath:'me.jpg'}}});
  plugin.applyStarterWorkspaceDefaults({profile:'ipara',replaceAll:true});
  assert.equal(plugin.getManagedPath('inboxRoot'),'00_Inbox');assert.equal(plugin.getManagedPath('diaryRoot'),'06_Diary');
  assert.equal(plugin.settings.home.identity.avatarPath,'me.jpg');assert.equal(plugin.settings.homeDashboard.mocEntryPaths[0],'Mine.md');assert.equal(files.size,0);
});
test('starter notes use chosen locations and never overwrite a same-name note or generate a diary',async()=>{
  const {plugin,files,folders}=make();plugin.settings.managedPaths.inboxRoot='Capture';plugin.settings.managedPaths.projectsRoot='Work';
  const first=setup.exampleFiles(plugin)[0];files.set(first.path,'My original note');
  await setup.finishSetup(plugin,{examples:true});await setup.finishSetup(plugin,{examples:true});
  assert.equal(files.size,4);assert.equal(files.get(first.path),'My original note');
  assert.ok([...files.keys()].every(p=>p.startsWith('Capture/')||p.startsWith('Work/')||[plugin.getManagedPath('habitRegistry'),plugin.getManagedPath('importantDates')].includes(p)));
  assert.ok(setup.iparaFolders.every(p=>folders.includes(p)));
  assert.ok(![...files.keys()].some(p=>p.startsWith('06_Diary/')));
  assert.ok([...files.values()].every(s=>!s.includes('- [x]')));
});
test('built-in diary creates readable content; selected missing template fails instead of silently replacing it',async()=>{
  const {plugin}=make();const spec={period:'daily',date:new Date(2026,9,14),templatePath:''};
  const content=await plugin.buildCalendarNoteContent(spec);
  assert.match(content,/## 记录/);
  await assert.rejects(plugin.buildCalendarNoteContent({...spec,templatePath:'missing.md'}));
});
test('native template synchronization requires a real custom template and does not write on failure',async()=>{
  const {plugin}=make();let writes=0;plugin.app.vault.adapter.write=async()=>{writes++;};
  await assert.rejects(plugin.syncObsidianTemplateConfigs());assert.equal(writes,0);
});
test('path validation rejects external and traversal paths while allowing builtin templates',()=>{
  for(const p of ['../Diary','F:/Diary','/Diary','a/../b'])assert.throws(()=>setup.validatePath(p,{folder:true}));
  assert.equal(setup.validatePath('',{optional:true}),'');assert.equal(setup.validatePath('My Journal',{folder:true}),'My Journal');
});

test('location preview is read-only; saving affects only paths and onboarding',async()=>{
  const {previewLocations,saveLocations}=require('../src/workspace-locations.js');
  const {plugin,files}=make({onboarding:{profile:'custom'},managedPaths:{diaryRoot:'Journal',dailyTemplate:'Templates/Day.md'},home:{identity:{avatarPath:'Portrait.jpg'}}});
  const before=JSON.stringify(plugin.settings),other=JSON.stringify(plugin.settings.home);
  const draft={profile:'standard',workspaceRoot:'Personal'};
  const preview=previewLocations(plugin,draft);
  assert.equal(preview.managedPaths.diaryRoot,'Personal/Diary');
  assert.equal(preview.managedPaths.dailyTemplate,'Templates/Day.md');
  assert.equal(JSON.stringify(plugin.settings),before);assert.equal(files.size,0);
  plugin.requestNoriaRefresh=()=>{};
  await saveLocations(plugin,draft);
  assert.equal(plugin.settings.managedPaths.diaryRoot,'Personal/Diary');
  assert.equal(plugin.settings.managedPaths.dailyTemplate,'Templates/Day.md');
  assert.equal(JSON.stringify(plugin.settings.home),other);assert.equal(files.size,0);
});

test('location save failure restores current settings, and existing-location choice keeps paths',async()=>{
  const {saveLocations,previewLocations}=require('../src/workspace-locations.js');
  const {plugin}=make({onboarding:{profile:'custom'},managedPaths:{diaryRoot:'Journal'}});
  const before=JSON.stringify(plugin.settings);
  assert.deepEqual(previewLocations(plugin,{profile:'custom'}).changes,[]);
  plugin.saveSettings=async()=>{throw Error('Disk full');};
  await assert.rejects(saveLocations(plugin,{profile:'standard',workspaceRoot:'Personal'}),/Disk full/);
  assert.equal(JSON.stringify(plugin.settings),before);
  assert.throws(()=>previewLocations(plugin,{profile:'standard',workspaceRoot:'../Elsewhere'}));
});

test('search follows actual settings ownership and resolves diary sources in each mode',()=>{
  const {plugin}=make();
  const registry=plugin.getSettingsRegistry();
  assert.ok(!registry.some(e=>e.id.startsWith('inboxWorkflow.')||e.id==='managedPaths.inboxWorkflow'));
  for(const [id,tab] of [['weather.enabled','connections'],['agentConnection.enabled','connections'],['managedPaths.inboxRoot','content'],['performance.taskSnapshotTtlMs','advanced'],['tasksCalendar.timeZone','features'],['home.identity.displayName','general']])
    assert.equal(registry.find(e=>e.id===id)?.tab,tab,id);
  const daily=registry.find(e=>e.id==='managedPaths.dailyTemplate');
  plugin.settings.calendar.calendarIntegrationMode='custom';
  assert.equal(plugin.resolveSettingsTarget(daily).targetId,'calendar.calendarCustomFilePattern');
  plugin.settings.calendar.calendarIntegrationMode='daily-notes';
  assert.equal(plugin.resolveSettingsTarget(daily).targetId,'calendar.calendarIntegrationMode');
  plugin.settings.calendar.calendarIntegrationMode='noria';
  assert.equal(plugin.resolveSettingsTarget(daily).id,daily.id);
});

test('unchanged storage draft preserves all overrides without saving or refreshing',async()=>{
  const {previewLocations,saveLocations}=require('../src/workspace-locations.js');
  const {plugin}=make({onboarding:{profile:'standard',workspaceRoot:'Noria'},managedPaths:{diaryRoot:'My Journal',dailyTemplate:'My Templates/Daily.md',weeklyTemplate:'My Templates/Weekly.md'}});
  let saves=0,refreshes=0;plugin.saveSettings=async()=>{saves++;};plugin.requestNoriaRefresh=()=>{refreshes++;};
  const before=JSON.stringify(plugin.settings),draft={profile:'standard',workspaceRoot:'Noria'};
  assert.deepEqual(previewLocations(plugin,draft).changes,[]);await saveLocations(plugin,draft);
  assert.equal(JSON.stringify(plugin.settings),before);assert.equal(saves,0);assert.equal(refreshes,0);
});

test('a location editor cannot overwrite a newer path edit',async()=>{
  const {saveLocations}=require('../src/workspace-locations.js');const {plugin}=make({onboarding:{profile:'standard',workspaceRoot:'Noria'}});
  const draft={profile:'standard',workspaceRoot:'Other',expected:JSON.stringify([plugin.settings.onboarding,plugin.settings.managedPaths])};
  plugin.settings.managedPaths.inboxRoot='Latest Inbox';
  await assert.rejects(saveLocations(plugin,draft),/已变化/);assert.equal(plugin.settings.managedPaths.inboxRoot,'Latest Inbox');
});


test('first load keeps IPARA when migrations add receipts to empty settings',async()=>{
 const {plugin}=make();plugin.loadData=async()=>null;
 plugin.migrateSettingsInput=async()=>({settings:{migrations:{timelineInbox:1,eventLibrary:1}},changed:true});
 plugin.hydrateWeatherSecretForRuntime=async()=>{};let saved;
 plugin.saveData=async value=>{saved=value;};
 await plugin.loadSettings();
 assert.equal(plugin.settings.onboarding.profile,'ipara');assert.equal(plugin.getManagedPath('projectsRoot'),'01_Projects');
 assert.equal(plugin.getManagedPath('diaryRoot'),'06_Diary');assert.equal(saved.onboarding.profile,'ipara');assert.equal(saved.onboarding.locationsPending,true);
 assert.equal(plugin.settings.homeDashboard.mocEntries.length,0);assert.equal(plugin.settings.home.identity.quoteListPath,'');
});


test('confirming IPARA creates all eight folders once without adding notes',async()=>{
  const {plugin,files,folders}=make();
  assert.equal(folders.length,0);
  await setup.finishSetup(plugin,{examples:false});
  assert.deepEqual(folders,setup.iparaFolders);assert.equal(files.size,0);
  await setup.finishSetup(plugin,{examples:false});assert.equal(folders.length,8);
});
test('IPARA checks conflicting files before creating any directory',async()=>{
  const {plugin,files,folders}=make();files.set('03_Resources','my existing content');
  await assert.rejects(setup.finishSetup(plugin),/03_Resources/);
  assert.equal(folders.length,0);assert.equal(files.get('03_Resources'),'my existing content');
  assert.ok(!plugin.settings.onboarding.initializedAt);
});
test('saving the current IPARA location can complete missing folders without changing templates',async()=>{
  const {plugin,folders}=make({onboarding:{profile:'ipara'},managedPaths:{dailyTemplate:'Templates/Mine.md'}});
  const before=JSON.stringify(plugin.settings);
  await require('../src/workspace-locations.js').saveLocations(plugin,{profile:'ipara'});
  assert.deepEqual(folders,setup.iparaFolders);assert.equal(JSON.stringify(plugin.settings),before);
});


test('location setup offers only a fresh unconfirmed installation, not configured upgrades',()=>{
 const {shouldOfferLocationSetup:offer}=require('../src/workspace-locations.js');
 assert.equal(offer({locationsPending:true},'1.0'),true);
 assert.equal(offer({locationsPending:true,dismissedVersion:'1.0'},'1.0'),false);
 assert.equal(offer({locationsPending:true,dismissedVersion:'1.0'},'1.1'),true);
 assert.equal(offer({locationsPending:true,initializedAt:'2026-10-14'},'1.1'),false);
 assert.equal(offer({profile:'custom'},'1.1'),false);
 assert.equal(offer({initializedAt:'2026-10-14'},'1.1'),false);
});
test('custom location choice edits only selected roots and preserves templates',async()=>{
 const {plugin,files,folders}=make({onboarding:{profile:'ipara',locationsPending:true},managedPaths:{dailyTemplate:'Templates/Mine.md'}});
 const {previewLocations,saveLocations}=require('../src/workspace-locations.js');
 const draft={profile:'custom',roots:{diaryRoot:'Journal',inboxRoot:'Capture',projectsRoot:'Work'}};
 const registry=plugin.settings.managedPaths.habitRegistry;
 assert.equal(previewLocations(plugin,draft).managedPaths.diaryRoot,'Journal');
 assert.equal(folders.length,0);assert.equal(files.size,0);
 await saveLocations(plugin,draft);
 assert.equal(plugin.settings.managedPaths.diaryRoot,'Journal');assert.equal(plugin.settings.managedPaths.inboxRoot,'Capture');
 assert.equal(plugin.settings.managedPaths.habitRegistry,registry);assert.equal(plugin.settings.managedPaths.dailyTemplate,'Templates/Mine.md');
 assert.equal(plugin.settings.onboarding.locationsPending,false);assert.equal(folders.length,0);assert.equal(files.size,0);
 assert.throws(()=>previewLocations(plugin,{profile:'custom',roots:{diaryRoot:'../Journal'}}));
});
test('confirming unchanged fresh locations clears the prompt and does not create notes',async()=>{
 const {plugin,files,folders}=make({onboarding:{profile:'ipara',locationsPending:true}});
 await require('../src/workspace-locations.js').saveLocations(plugin,{profile:'ipara'});
 await setup.finishSetup(plugin);
 assert.equal(plugin.settings.onboarding.locationsPending,false);assert.ok(plugin.settings.onboarding.initializedAt);
 assert.deepEqual(folders,setup.iparaFolders);assert.equal(files.size,0);
});

test('first-use modal can defer without creating files, then confirm a chosen layout',async()=>{
 class Element {
  constructor(tag='div',opts={}){this.tag=tag;this.type=opts.type;this.children=[];this.value=opts.value||'';this.text=opts.text||'';this.checked=false;}
  createEl(tag,opts){const child=new Element(tag,opts);this.children.push(child);return child;}
  createDiv(opts){return this.createEl('div',opts);}createSpan(opts){return this.createEl('span',opts);}
  empty(){this.children=[];}setText(text){this.text=text;}addClass(){}focus(){}
  all(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.all(tag)]);}
 }
 class Modal {
  constructor(){this.contentEl=new Element();this.titleEl=new Element();this.modalEl=new Element();}
  open(){this.opened=true;}close(){this.opened=false;this.onClose?.();}
 }
 const {offerLocationSetup,openLocationSetup}=require('../src/workspace-locations.js');
 const {plugin,files,folders}=make({onboarding:{profile:'ipara',locationsPending:true}});plugin.manifest={version:'1.0'};let openedHome=0;plugin.openDashboardHomeLeaf=async()=>{openedHome++;};
 const before=JSON.stringify(plugin.settings.managedPaths);
 const modal=offerLocationSetup(plugin,{Modal});assert.ok(modal.opened);assert.equal(folders.length,0);
 await modal.close();assert.equal(plugin.settings.onboarding.dismissedVersion,'1.0');
 assert.equal(offerLocationSetup(plugin,{Modal}),undefined);assert.equal(folders.length,0);assert.equal(files.size,0);
 assert.equal(JSON.stringify(plugin.settings.managedPaths),before);
 const next=openLocationSetup(plugin,{Modal});
 const checkbox=next.contentEl.all('input').find(el=>el.type==='checkbox');
 assert.equal(checkbox.checked,true);checkbox.checked=false;
 const choice=next.contentEl.all('select')[0];choice.value='standard';choice.onchange();
 const root=next.contentEl.all('input')[0];root.value='Personal';root.oninput();
 await next.contentEl.all('button').find(button=>button.text==='开始使用').onclick();
 assert.equal(next.opened,false);assert.equal(openedHome,1);assert.equal(plugin.settings.managedPaths.diaryRoot,'Personal/Diary');
 assert.equal(plugin.settings.onboarding.locationsPending,false);assert.ok(plugin.settings.onboarding.initializedAt);
 assert.equal(files.size,0);assert.equal(folders.length,0);
});


test('starter examples provide dated open tasks, two editable habits and a future countdown without history',async()=>{
 const {readHabitDefinitions}=require('../src/habit-definition.js');
 const {readCountdowns}=require('../src/countdown-document.js');
 const {habitRecords}=require('../src/diary-habits.js');
 for(const locale of ['zh','en']) {
  const {plugin,files}=make();plugin.getNoriaLocale=()=>locale;
  plugin.settings.managedPaths.habitRegistry='My lists/Habits.md';plugin.settings.managedPaths.importantDates='My lists/Dates.md';
  await setup.finishSetup(plugin,{examples:true});
  const defs=readHabitDefinitions(files.get('My lists/Habits.md'));assert.equal(defs.length,2);
  assert.equal(defs[0].type,'number');assert.equal(defs[0].target,'20');assert.equal(defs[1].stage,'active');
  assert.equal(habitRecords(files.get('My lists/Habits.md'),'2026-10-14','My lists/Habits.md').length,0);
  const countdown=readCountdowns(files.get('My lists/Dates.md')).rows;
  assert.equal(countdown.length,1);assert.equal(countdown[0].start,'2026-10-14');assert.equal(countdown[0].date,'2026-10-21');
  const tasks=[...files.values()].join('\n').match(/^- \[ \] .*$/gm)||[];assert.equal(tasks.length,2);assert.ok(tasks.every(task=>task.includes('[due:: 2026-10-14]')));
  assert.ok([...files.values()].every(raw=>!raw.includes('- [x]')));
 }
});
test('starter creation skips existing habit and countdown notes without editing their content',async()=>{
 const {plugin,files}=make();files.set(plugin.getManagedPath('habitRegistry'),'My habits and notes');files.set(plugin.getManagedPath('importantDates'),'My dates and notes');
 await setup.finishSetup(plugin,{examples:true});
 assert.equal(files.get(plugin.getManagedPath('habitRegistry')),'My habits and notes');assert.equal(files.get(plugin.getManagedPath('importantDates')),'My dates and notes');
});
