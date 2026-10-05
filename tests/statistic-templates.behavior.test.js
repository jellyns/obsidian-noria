const test=require('node:test'),assert=require('node:assert/strict');
const {builtInTemplates,dashboardTemplates,widgetFromTemplate,templateFromWidget,StatisticTemplates,STYLES}=require('../src/statistic-templates.js');
const {chartOptions}=require('../src/statistic-model.js');
const en=(zh,en)=>en;
test('every distinct style has a compatible complete default, using configured fields when available',()=>{
 const fields=[{id:'mood',name:'Mood',property:'feeling',type:'option'},{id:'energy',name:'Energy',property:'energy_level',type:'level'}];
 const {styles,recommended}=builtInTemplates(fields,en);
 assert.equal(styles.length,11);assert.equal(new Set(styles.map(t=>t.props.display)).size,11);
 assert.deepEqual(styles.map(t=>t.props.display),STYLES.map(t=>t[0]));
 for(const t of styles){const p=t.props,field=fields.find(f=>f.property===p.property);assert.ok(chartOptions(p,field).includes(p.display),t.id);assert.ok(p.source&&p.calculate&&p.scope);}
 assert.equal(styles.find(t=>t.style==='line').props.property,'energy_level');
 assert.equal(styles.find(t=>t.style==='states').props.property,'feeling');assert.ok(recommended.some(t=>t.props.source==='habits'));
 const empty=builtInTemplates([],en).styles;assert.equal(empty.find(t=>t.style==='line').props.source,'tasks');assert.equal(empty.find(t=>t.style==='states').props.property,'');
});
test('saved templates copy data configuration and picture but do not copy placement identity or manual height',()=>{
 const widget={id:'card-original',type:'extension',source:'noria:statistics',size:'wide',props:{source:'notes',folder:'Projects',display:'trend',calculate:'sum',property:'hours',scope:'fixed',start:'2026-09-01',end:'2026-09-29',picture:'lucide:timer',cardHeight:420}};
 const t=templateFromWidget(widget,'  Hours  ','template-id');assert.equal(t.title,'Hours');assert.equal(t.size,'wide');assert.equal(t.id,'template-id');assert.equal(t.props.display,'columns');assert.equal(t.props.picture,'lucide:timer');assert.equal(t.props.cardHeight,undefined);
 t.props.folder='Elsewhere';assert.equal(widget.props.folder,'Projects');assert.equal(widget.props.display,'trend');assert.equal(widget.props.cardHeight,420);
 assert.throws(()=>templateFromWidget(widget,''));
});
test('template changes are serialized, survive reload and roll back on failed persistence',async()=>{
 let disk={},fail=false;const plugin={settings:{unrelated:'keep'},async saveSettings(){if(fail)throw Error('disk unavailable');disk=structuredClone(this.settings);}};
 const store=new StatisticTemplates(plugin),widget={type:'extension',source:'noria:statistics',props:{source:'tasks',display:'metric',calculate:'count'}};
 const [first,second]=await Promise.all([store.save(widget,'A'),store.save(widget,'B')]);assert.equal(store.read().length,2);assert.equal(disk.unrelated,'keep');
 const reloaded=new StatisticTemplates({settings:structuredClone(disk)});assert.equal(reloaded.read()[1].id,second.id);
 fail=true;await assert.rejects(store.save(widget,'C'),/disk unavailable/);assert.equal(store.read().length,2);
 await assert.rejects(store.remove(first.id),/disk unavailable/);assert.equal(store.read().length,2);
 fail=false;await store.remove(first.id);assert.deepEqual(store.read().map(t=>t.title),['B']);assert.equal(widget.props.source,'tasks');
});

test('dashboard templates preserve the existing renderer when replacing a generic card',()=>{
 const defaults=[{id:'note-trend-card',type:'builtin',source:'trends-and-stats',size:'wide',props:{renderMode:'block',block:'note-trend',lazy:true}},{id:'inbox-card',type:'builtin',source:'overview-columns',props:{}}];
 const templates=dashboardTemplates(defaults,en);assert.equal(templates.length,1);
 const prior={id:'card-existing',order:7,type:'extension',source:'noria:statistics',props:{property:'energy'}};
 const result=widgetFromTemplate(templates[0],prior);assert.equal(result.id,prior.id);assert.equal(result.order,7);assert.equal(result.type,'builtin');assert.equal(result.builtinId,'note-trend-card');assert.equal(result.source,'trends-and-stats');assert.deepEqual(result.props,defaults[0].props);
 result.props.block='task-trend';assert.equal(defaults[0].props.block,'note-trend');assert.equal(templates[0].props.block,'note-trend');
 const back=widgetFromTemplate(builtInTemplates([],en).styles[0],result);assert.equal(back.id,prior.id);assert.equal(back.source,'noria:statistics');assert.equal(back.builtinId,undefined);assert.equal(back.props.block,undefined);
});

test('saved dashboard statistics survive storage and create independent card placements',async()=>{
 let disk;const plugin={settings:{},async saveSettings(){disk=structuredClone(this.settings);}},store=new StatisticTemplates(plugin);
 const card={id:'card-current',builtinId:'habit-history-card',type:'builtin',source:'trends-and-stats',size:'full',props:{block:'habit-history',renderMode:'block',historyDays:14,picture:'lucide:calendar',cardHeight:300}};
 const saved=await store.save(card,'My habits'),loaded=new StatisticTemplates({settings:disk}).read()[0];assert.deepEqual(saved,loaded);
 const first=widgetFromTemplate(loaded),second=widgetFromTemplate(loaded);assert.notEqual(first.id,second.id);assert.notEqual(first.id,card.id);assert.equal(first.builtinId,card.builtinId);assert.equal(first.props.historyDays,14);assert.equal(first.props.picture,card.props.picture);assert.equal(first.props.cardHeight,undefined);
 await store.remove(saved.id);assert.equal(first.props.historyDays,14);assert.equal(store.read().length,0);
 assert.throws(()=>templateFromWidget({id:'inbox-card',type:'builtin',props:{}},'Inbox'),/Only statistics/);
});
