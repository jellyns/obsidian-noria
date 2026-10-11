const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const parseYaml=text=>Object.fromEntries(text.split('\n').filter(l=>l.includes(':')).map(l=>{const i=l.indexOf(':'),key=l.slice(0,i).trim().replaceAll('"',''),v=l.slice(i+1).trim();return [key,v==='null'?null:!isNaN(Number(v))?Number(v):v];}));
function load(obsidian={},controls={}){const file=path.resolve(__dirname,'../src/property-stat-cards.js'),local=createRequire(file),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>id==='obsidian'?{parseYaml,...obsidian}:id==='./card-controls.js'?controls:id==='./record-popover.js'?{recordPopover:()=>{throw Error('Unexpected error popover');}}:local(id)});return module.exports.PropertyStatCards;}
function plugin(){return {app:{vault:{getAbstractFileByPath:()=>({})}},records:{definitions:()=>[]},getNoriaLocale:()=> 'en',getLocalYmd:()=> '2026-09-23'};}

test('focus following range resolves today in the selected display zone',async()=>{
 const p=plugin();p.settings={tasksCalendar:{timeZone:'Pacific/Kiritimati'},home:{trendsRange:{mode:'last30'}}};let request;
 p.createDataService=async()=>({resolveRange:value=>{request=value;return value;}});
 await new (load())(p).range({source:'focus',scope:'follow'});
 assert.equal(request.mode,'last30');assert.equal(request.today,require('../src/time-ring-model.js').displayDay(Date.now(),'Pacific/Kiritimati'));
});

test('ordinary source lists retain their rows regardless of chart aggregation groups',()=>{
 const elements=[];function el(tag,options={}){const e={tag,options,createDiv:o=>el('div',o),createEl:el,createSpan:o=>el('span',o)};elements.push(e);return e;}
 class Modal{constructor(){this.contentEl=el('div');}setTitle(){}open(){}}
 const p=plugin();p.cards={trackModal:()=>()=>{}};const stats=new (load({Modal}))(p),rows=[{path:'A.md',title:'Source A'},{path:'B.md',title:'Source B'}];
 for(const groups of [[],[{key:'category',value:2,rows}]]){elements.length=0;stats.openRows(rows,{recorded:2,groups});assert.deepEqual(elements.filter(e=>e.tag==='button').map(e=>e.options.text),['Source A','Source B']);}
});

test('composition rejects non-additive statistics and follows daily, weekly, monthly and yearly diary ranges',async()=>{
 const p=plugin(),stats=new (load())(p),config={source:'diary',property:'mood',calculate:'distribution',display:'composition',scope:'follow'};
 for(const calculate of ['mean','min','max'])assert.throws(()=>stats.validate({...config,calculate}),/counts, sums or distributions/);
 const expected={daily:['2026-10-02','2026-10-02'],weekly:['2026-09-28','2026-10-04'],monthly:['2026-10-01','2026-10-31'],yearly:['2026-01-01','2026-12-31']};
 for(const [mode,[start,end]] of Object.entries(expected)){const range=await stats.range(config,{mode,anchorDate:'2026-10-02'});assert.equal(range.start,start);assert.equal(range.end,end);}
});

test('diary statistics only read notes in the requested date range before collecting failures',async()=>{
 const p=plugin(),read=[];p.buildRuntimeBridgeConfig=()=>({paths:{diaryRoot:'Diary'}});
 p.filesUnderRoots=()=>['2026-08-31','2026-09-01','2026-09-02','2026-09-03'].map(basename=>({basename,path:'Diary/'+basename+'.md'}));
 p.app.metadataCache={getFileCache:()=>({})};p.app.vault.cachedRead=async file=>{read.push(file.basename);if(file.basename!=='2026-09-01')throw Error('Cannot read note');return '---\nv: 0\n---\n';};
 const r=await new (load())(p).query({source:'diary',property:'v',calculate:'mean',scope:'fixed',start:'2026-09-01',end:'2026-09-02'});
 assert.deepEqual(read,['2026-09-01','2026-09-02']);assert.equal(r.value,0);assert.equal(r.unreadable.length,1);assert.equal(r.unreadable[0].path,'Diary/2026-09-02.md');
});
test('task ratio counts open tasks in the selected cohort, deduplicates and excludes habits',async()=>{
 const p=plugin();p.getRuntimeTaskRows=async()=>[{id:'a',path:'a',text:'A [due:: 2026-09-20]',completed:true},{id:'a',path:'a',text:'A [due:: 2026-09-20]',completed:true},{id:'b',path:'b',text:'B [due:: 2026-09-20]',completed:false},{id:'c',path:'c',text:'Habit #habit [due:: 2026-09-20]',completed:true}];
 const r=await new (load())(p).query({source:'tasks',calculate:'rate',scope:'fixed',start:'2026-09-01',end:'2026-09-23'});
 assert.equal(r.value,50);assert.equal(r.denominator,2);assert.equal(r.numerator,1);
});
test('habit denominator follows dated plans, skips rests and future dates',async()=>{
 const p=plugin();p.getManagedPath=()=> 'Habits.md';p.loadTextFromVault=async()=> '## 打卡中的习惯\n- Read [habit-id:: h] [weekdays:: 135] [plan:: 2026-09-01=135]\n- [x] Read #habit [habit-id:: h] [due:: 2026-09-21]\n';p.pagesForManagedPath=()=>[];
 const r=await new (load())(p).query({source:'habits',calculate:'rate',scope:'fixed',start:'2026-09-21',end:'2026-09-27'});
 assert.equal(r.denominator,2);assert.equal(r.numerator,1);assert.equal(r.value,50);
});

test('task statistics retain source identity and locate the current line after surrounding edits',async()=>{
 const p=plugin(),raw='- [x] Done [completion:: 2026-09-20]',path='Projects/Work.md',opened=[];
 p.getRuntimeTaskRows=async()=>[{id:'done',path,line:2,text:raw,rawText:raw,completed:true}];
 let source='## Tasks\n\n'+raw+'\n';p.app.vault.read=async()=>source;
 p.openReviewSourceFile=async(...args)=>{opened.push(args);return {ok:true};};
 const stats=new (load())(p),result=await stats.query({source:'tasks',calculate:'count',scope:'fixed',start:'2026-09-01',end:'2026-09-23'}),row=result.rows[0];
 assert.ok(row.taskRef,'Task sources must retain their original identity');assert.deepEqual(JSON.parse(JSON.stringify(row.taskRef)),{path,line:2,rawText:raw});assert.equal(row.title,'Done');
 source='# Added context\n\n'+source;await stats.openSource(row);
 assert.deepEqual(JSON.parse(JSON.stringify(opened[0])),[path,{line:5,newLeaf:true}]);
 source+='\n'+raw;await assert.rejects(()=>stats.openSource(row),/changed|uniquely/);assert.equal(opened.length,1);
});

test('statistics source navigation reuses ordinary notes and refuses missing sources',async()=>{
 const p=plugin(),opened=[];p.openHomeSource=async path=>{opened.push(path);return {ok:true};};
 const stats=new (load())(p);await stats.openSource({path:'Diary/2026-09-20.md'});assert.deepEqual(opened,['Diary/2026-09-20.md']);
 p.app.vault.getAbstractFileByPath=()=>null;
 await assert.rejects(()=>stats.openSource({path:'Missing.md'}),/Source note/);assert.equal(opened.length,1);
});
test('preview activation inspects sources without entering record editing or creating date notes',async()=>{
 const p=plugin(),stats=new (load())(p),opened=[];
 p.records.edit=()=>{throw Error('Preview must not edit records');};
 p.resolveCalendarNoteSpecAsync=()=>{throw Error('Preview must not resolve a new diary');};
 stats.openRows=(rows,result,title)=>opened.push({rows,result,title});
 for(const rows of [[],[{path:'Diary/2026-09-20.md',date:'2026-09-20'}]])await stats.editPoint({},rows,{source:'diary',property:'v'},'2026-09-20',{rows},{page:'diary',preview:true});
 assert.equal(opened.length,2);assert.equal(opened[0].rows.length,0);assert.equal(opened[1].rows[0].path,'Diary/2026-09-20.md');
});

test('arbitrary property editing writes its source and rejects stale values',async()=>{
 const p=plugin(),field={property:'v',name:'Value',type:'number'};let raw='---\nv: 2\nother: keep\n---\n\nBody',editor,writePath;
 p.records={definitions:()=>[field],read:(text)=>parseYaml(text).v,snapshot:()=>({multiple:false}),edit:(anchor,f,options)=>{editor=options;}};
 p.app.vault.read=async()=>raw;p.processTextAtVaultPath=async(path,fn)=>{writePath=path;raw=fn(raw);};p.requestNoriaRefresh=()=>{};
 const stats=new (load())(p),context={page:'custom',pageId:'reading'};await stats.editPoint({},[{path:'Research/A.md',date:'2026-09-20'}],{source:'notes',property:'v'},'2026-09-20',{rows:[]},context);
 assert.deepEqual(editor.context,context);
 await editor.onSave(3);assert.equal(writePath,'Research/A.md');assert.match(raw,/"v": 3/);assert.match(raw,/other: keep/);assert.match(raw,/Body/);
 await assert.rejects(()=>editor.onSave(4),/changed elsewhere/);assert.match(raw,/"v": 3/);
});
test('period comparison uses completed events and equal elapsed ranges',async()=>{
 const p=plugin();p.getRuntimeTaskRows=async()=>[{id:'a',path:'a',text:'A [completion:: 2026-09-02]',completed:true},{id:'b',path:'b',text:'B [completion:: 2026-08-20]',completed:true}];
 const r=await new (load())(p).query({source:'tasks',calculate:'count',display:'comparison',scope:'fixed',start:'2026-09-01',end:'2026-09-30'});
 assert.equal(r.range.end,'2026-09-23');assert.equal(r.value,1);assert.equal(r.comparison.previous.value,1);assert.equal(r.comparison.periods.partial,true);
});
test('rolling ranges include today and keep custom filters and data when switching presentation',async()=>{
 const stats=new (load())(plugin());const props={source:'tasks',calculate:'count',display:'line',scope:'rolling',days:7};
 assert.deepEqual(JSON.parse(JSON.stringify(await stats.range(props))),{start:'2026-09-17',end:'2026-09-23'});
 for(const days of [0,1.5,3661])assert.throws(()=>stats.validate({...props,days}),/1.*3660/);
 const legacy={source:'diary',calculate:'count',display:'trend'};assert.ok(!stats.chartChoices(legacy).some(c=>c.value==='trend'));assert.ok(stats.chartChoices(legacy).some(c=>c.value==='columns'));
});

test('goal progress accepts only finite positive targets without requiring a target for completion rates',()=>{
 const stats=new (load())(plugin()),config={source:'diary',calculate:'sum',property:'v',display:'progress',scope:'all'};
 for(const target of [Infinity,'Infinity',NaN,0,-1,''])assert.throws(()=>stats.validate({...config,target}),/finite target/);
 for(const target of [1,0.5,'12'])assert.doesNotThrow(()=>stats.validate({...config,target}));
 assert.doesNotThrow(()=>stats.validate({source:'habits',calculate:'rate',display:'progress',scope:'all'}));
});

function chromeElement(options={}){
 const e={options,children:[],style:{setProperty(){}},dataset:{},addClass(){},setAttribute(){},
  createDiv(o){return this.createEl('div',o);},createSpan(o){return this.createEl('span',o);},
  createEl(tag,o={}){const child=chromeElement(o);child.tag=tag;child.parent=this;this.children.push(child);return child;},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
  querySelector(){return null;},insertBefore(child,before){this.children=this.children.filter(x=>x!==child);const i=this.children.indexOf(before);i<0?this.children.push(child):this.children.splice(i,0,child);}};
 return e;
}
test('statistics use one header and current source action through refresh and disposal',()=>{
 const p=plugin(),stats=new(load())(p),tools=chromeElement(),prior={label:'Existing action'},shell={_noriaRecordActions:[prior],querySelector:()=>tools},host=chromeElement();host.closest=()=>shell;
 const classes=new Set();shell.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
 let opened;stats.openRows=(rows,result)=>opened={rows,result};
 const result={recorded:1,value:12,rows:[{path:'a.md'}],invalid:[],range:{start:'2026-09-01',end:'2026-09-23'}};
 stats.draw(host,result,{calculate:'count',display:'metric'});
 assert.equal(tools.children.length,1);assert.equal(host.children.some(x=>x.options.cls==='noria-stat-toolbar'),false);
 assert.equal(tools.children[0].children.some(x=>x.options.cls==='noria-stat-calculation'),false);
 assert.equal(shell._noriaRecordActions.length,2);
 assert.ok(classes.has('noria-stat-card'));
 const next={...result,rows:[{path:'b.md'}]};stats.draw(host,next,{calculate:'mean',display:'metric'});
 assert.equal(tools.children.length,1);assert.equal(shell._noriaRecordActions.length,2);
 assert.equal(tools.children[0].children.find(x=>x.options.cls==='noria-stat-calculation').options.text,'Mean');
 shell._noriaRecordActions[1].run();assert.equal(opened.rows,next.rows);assert.equal(opened.result.calculationLabel,'Mean');
 host.__noriaStatChromeCleanup();assert.equal(tools.children.length,0);assert.deepEqual(Array.from(shell._noriaRecordActions),[prior]);
 assert.equal(classes.has('noria-stat-card'),false);
});
test('statistics previews keep an accessible source control without changing surrounding card tools',()=>{
 let control;const p=plugin(),stats=new(load({}, {iconButton:(parent,icon,label,run)=>{control={parent,label,run};}}))(p),host=chromeElement();
 host.closest=()=>{throw Error('Preview must not alter a surrounding card');};let opened=false;stats.openRows=()=>opened=true;
 stats.draw(host,{recorded:1,value:0,rows:[],invalid:[]},{calculate:'count',display:'metric'},{},{preview:true});
 assert.equal(control.parent,host.children[0]);assert.equal(control.label,'Summary & sources');control.run();assert.equal(opened,true);
 host.__noriaStatChromeCleanup();assert.equal(host.children.includes(control.parent),false);
});


test('goal rings query independent metrics within one range and isolate a failed source',async()=>{
 const p=plugin(),stats=new (load())(p),original=stats.query.bind(stats),calls=[];
 stats.query=async(config,selection)=>{if(config.source==='goals')return original(config,selection);calls.push(config);if(config.source==='diary')throw Error('Unreadable diary');return {numerator:2,denominator:4,value:50,rows:[{path:'A.md'}]};};
 const result=await stats.query({source:'goals',display:'progress-rings',scope:'fixed',start:'2026-09-20',end:'2026-09-23',ringCount:'2',ring2Source:'diary',ring2Property:'hours',ring2Target:3});
 assert.equal(result.series[0].ratio,.5);assert.equal(result.series[1].status,'incomplete');assert.equal(result.series[1].result.error,'Unreadable diary');
 for(const call of calls){assert.equal(call.start,'2026-09-20');assert.equal(call.end,'2026-09-23');assert.equal(call.display,'metric');}
 assert.equal(result.series[0].unit,'tasks');
});
