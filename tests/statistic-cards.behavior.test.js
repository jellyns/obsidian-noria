const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const parseYaml=text=>Object.fromEntries(text.split('\n').filter(l=>l.includes(':')).map(l=>{const i=l.indexOf(':'),key=l.slice(0,i).trim().replaceAll('"',''),v=l.slice(i+1).trim();return [key,v==='null'?null:!isNaN(Number(v))?Number(v):v];}));
function load(){const file=path.resolve(__dirname,'../src/property-stat-cards.js'),local=createRequire(file),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>id==='obsidian'?{parseYaml}:id==='./card-controls.js'?{}:id==='./record-popover.js'?{recordPopover:()=>{throw Error('Unexpected error popover');}}:local(id)});return module.exports.PropertyStatCards;}
function plugin(){return {app:{vault:{getAbstractFileByPath:()=>({})}},records:{definitions:()=>[]},getNoriaLocale:()=> 'en',getLocalYmd:()=> '2026-09-23'};}

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
test('arbitrary property editing writes its source and rejects stale values',async()=>{
 const p=plugin(),field={property:'v',name:'Value',type:'number'};let raw='---\nv: 2\nother: keep\n---\n\nBody',editor,writePath;
 p.records={definitions:()=>[field],read:(text)=>parseYaml(text).v,edit:(anchor,f,options)=>{editor=options;}};
 p.app.vault.read=async()=>raw;p.processTextAtVaultPath=async(path,fn)=>{writePath=path;raw=fn(raw);};p.requestNoriaRefresh=()=>{};
 const stats=new (load())(p);await stats.editPoint({},[{path:'Research/A.md',date:'2026-09-20'}],{source:'notes',property:'v'},'2026-09-20',{rows:[]});
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
