const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const library=require('../src/event-library.js');
const line=(time='08:00',enabled=true)=>`- [${enabled?'x':' '}] 早餐 [default_tag:: #tl/breakfast] [default_start::${time}] [default_duration_min::20] #tl/template\n`;
const old=()=>({timelineQuickSettings:{pregenSpanDays:7,pregenItems:['breakfast'],items:{breakfast:{label:'早餐',timelineTag:'#tl/breakfast',startTime:'08:00',durationMin:20,custom:'keep'}}}});
function fixture(text=line()){
 const files=new Map(text===null?[]:[['Events.md',text]]),writes=[];
 const adapter={exists:async p=>files.has(p),read:async p=>{if(!files.has(p))throw Error('missing');return files.get(p);},mkdir:async p=>files.set(p,''),write:async(p,v)=>{writes.push(p);files.set(p,v);}};
 const plugin={manifest:{id:'noria'},getManagedPath:()=> 'Events.md',getManagedNoteSeed:()=>line(),normalizeSettings:()=>({managedPaths:{templateLibrary:'Events.md'}}),ensureVaultParent:async()=>{},app:{vault:{configDir:'.obsidian',adapter,
  getAbstractFileByPath:p=>files.has(p)?{path:p}:null,
  process:async(f,change)=>{files.set(f.path,change(files.get(f.path)));writes.push(f.path);},
  create:async(p,v)=>{if(files.has(p))throw Error('exists');files.set(p,v);writes.push(p);return {path:p};}}}};
 return {plugin,files,writes};
}
test('empty and unchecked libraries remain intentional; missing optional library is read-only builtin',async()=>{
 for(const [source,count,enabled,kind] of [['',0,0,'library'],[line('08:00',false),1,0,'library'],[null,1,1,'builtin']]){
  const f=fixture(source),result=await library.read(f.plugin);
  assert.equal(result.items.length,count);assert.equal(result.items.filter(x=>x.enabled).length,enabled);assert.equal(result.source,kind);assert.equal(f.writes.length,0);
 }
});
test('external editing is visible on the next read; ambiguous tags fail instead of picking the first',async()=>{
 const f=fixture();assert.equal((await library.read(f.plugin)).items[0].startTime,'08:00');
 f.files.set('Events.md',line('09:10'));assert.equal((await library.read(f.plugin)).items[0].startTime,'09:10');
 f.files.set('Events.md',line()+line('09:10'));await assert.rejects(library.read(f.plugin),/重复标签/);
});
test('matching migration keeps Markdown byte for byte and retires the second content store once',async()=>{
 const text='---\ncustom: retained\n---\n\n'+line()+'\nMy own explanation.\n',f=fixture(text),input=old();
 const result=await library.migrate(f.plugin,input);
 assert.equal(f.files.get('Events.md'),text);assert.equal(result.settings.timelineQuickSettings.items,undefined);assert.deepEqual(result.settings.timelineQuickSettings.pregenItems,['breakfast']);
 assert.equal(input.timelineQuickSettings.items.breakfast.custom,'keep');
 const receipt=JSON.parse([...f.files].find(([p])=>p.includes('event-library-'))[1]);assert.equal(receipt.previous.items.breakfast.custom,'keep');assert.equal(receipt.source,text);
 const count=f.writes.length;assert.equal((await library.migrate(f.plugin,result.settings)).changed,false);assert.equal(f.writes.length,count);
});
test('conflicting original and batch times both survive; retry after settings failure adds no duplicates',async()=>{
 const source='Personal intro\n\n'+line('09:00'),f=fixture(source),input=old();
 const result=await library.migrate(f.plugin,input),text=f.files.get('Events.md'),items=library.parse(text);
 assert.ok(text.startsWith(source));assert.equal(items.length,2);assert.equal(items[0].startTime,'09:00');assert.equal(items[1].startTime,'08:00');assert.match(items[1].label,/原批量/);
 assert.equal(result.settings.timelineQuickSettings.pregenItems[0],items[1].key);
 await library.migrate(f.plugin,input);assert.equal(f.files.get('Events.md'),text);
});
test('a migrated row does not hide existing table templates or unchecked rows',()=>{
 const table='| Name | Start | Duration | Tag |\n| --- | --- | --- | --- |\n| Walk | 10:00 | 30 | #tl/walk |\n';
 const plan=library.migrationPlan(table,old().timelineQuickSettings),items=library.parse(plan.text);
 assert.equal(items.length,2);assert.ok(items.some(x=>x.label==='Walk'));assert.ok(plan.text.startsWith(table));
});
test('receipt failure or an external edit refuses migration without replacing the source',async()=>{
 const f=fixture(line('09:00')),input=old();f.plugin.app.vault.adapter.write=async()=>{throw Error('Disk full');};
 await assert.rejects(library.migrate(f.plugin,input),/Disk full/);assert.equal(f.files.get('Events.md'),line('09:00'));assert.ok(input.timelineQuickSettings.items);
 const g=fixture(line('09:00'));g.plugin.app.vault.process=async(f,change)=>{g.files.set(f.path,line('10:00'));change(g.files.get(f.path));};
 await assert.rejects(library.migrate(g.plugin,input),/已变化/);assert.equal(g.files.get('Events.md'),line('10:00'));
});
test('missing custom blocks create one source; fresh settings do not create files',async()=>{
 const f=fixture(null),input=old();input.timelineQuickSettings.items.breakfast.startTime='11:00';
 const result=await library.migrate(f.plugin,input);assert.ok((await library.read(f.plugin)).items.some(i=>i.startTime==='11:00'));assert.ok(!result.settings.timelineQuickSettings.items);
 const fresh=fixture(null);await library.migrate(fresh.plugin,{});assert.equal(fresh.writes.length,0);
});
test('template ending exactly at midnight uses the next day',()=>{
 assert.equal(library.parse(line('23:40'))[0].crossDay,true);
});

// Exercise the actual quick-action consumer without creating real user tasks.
const runtime=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
const actionSource=runtime.match(/async function runQuickAction\(action, sourceEl\) \{[\s\S]*?\n};/)[0];
test('single and batch additions read the same changed source and fail before writes if selection disappeared',async()=>{
 const f=fixture(line('09:10')),saved=[],cache={all:[],templates:[]};
 const context={console,tcRuntimeT:k=>k,showBriefNotice(){},showDebugNotice(){},timelineQuickStrategy:'daily-only',timelineSettings:{pregenItems:['breakfast'],pregenSpanDays:7},firstDayOfWeek:1,
  noriaBridge:{},getFallbackDateInView:()=> '2026-10-14',getVisibleWeekDates:()=>['2026-10-14'],
  ensureTimelineActionsAdapterLoaded:async()=>({getPregenDates:()=>['2026-10-14'],addMinutesToTime:()=> '09:30'}),quickEventLibraryCache:cache,
  refreshQuickEventLibraryTemplates:async()=>{const r=await library.read(f.plugin);cache.all=r.items;cache.templates=r.items.filter(x=>x.enabled);},getQuickEventTemplatesForRender:()=>cache.templates,
  quickAddTimelineEvent:async(date,cfg)=>{saved.push({date,cfg});return {affectedDates:[date]};},flushTimelineMutationAfterQuickAdd(){}};
 vm.createContext(context);vm.runInContext(actionSource,context);
 await context.runQuickAction('event-template',{getAttribute:()=> 'breakfast'});await context.runQuickAction('pregen');
 assert.deepEqual(saved[0],saved[1]);assert.equal(saved[0].cfg.startTime,'09:10');
 f.files.set('Events.md','');await assert.rejects(context.runQuickAction('pregen'),/eventSelectionMissing/);assert.equal(saved.length,2);
});
