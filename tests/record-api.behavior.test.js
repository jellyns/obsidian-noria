const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const {createPublicApi}=require('../src/public-api.js');
const {habitRecords}=require('../src/diary-habits.js');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{const m=/^(?:"([^"]+)"|([^:\s]+)):\s*(.+)$/.exec(line);if(!m)return [];try{return [[m[1]||m[2],JSON.parse(m[3])]];}catch{return [[m[1]||m[2],m[3]]];}}));
function fixture(raw){
 const filename=path.resolve(__dirname,'../src/record-fields.js'),module={exports:{}},local=createRequire(filename);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>id==='obsidian'?{parseYaml:parse}:['./record-manager.js','./record-popover.js','./card-controls.js'].includes(id)?{}:local(id)});
 const date='2026-10-06',note='Diary/'+date+'.md',files=new Map(raw==null?[]:[[note,raw]]),refresh=[],queues=new Map();
 const fields=[{id:'reading',property:'minutes',name:'Reading',type:'number',unit:'min',icon:'book-open'}, {id:'exercise',property:'exercise',name:'Exercise',type:'toggle',enabled:false}, {id:'mood',property:'mood',name:'Mood',type:'option',options:['Good','Low']}];
 const p={settings:{recordFields:fields},getNoriaLocale:()=> 'en',getLocalYmd:()=>date,app:{vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null}},
  getManagedPath:()=> 'Habits.md',t:()=> 'Habits',resolveCalendarNoteSpecAsync:async(_,date)=>({path:'Diary/'+date+'.md'}),buildCalendarNoteContent:async()=> '---\nkeep: true\n---\n## Notes\n',
  loadTextFromVault:async path=>path==='Habits.md'?'## Active habits\n- Reading [type:: number] [target:: 10] [record-field:: minutes]\n':files.get(path)||'',requestNoriaRefresh:(...args)=>refresh.push(args),
  processTextAtVaultPath(path,transform){const job=(queues.get(path)||Promise.resolve()).catch(()=>{}).then(()=>{const current=files.get(path)||'',next=transform(current);if(next!==current)files.set(path,next);});queues.set(path,job);return job;}};
 p.records=new module.exports.RecordFields(p);return {p,api:createPublicApi(p),files,fields,date,note,refresh};
}
test('record API reads without creation, writes through shared habit binding and preserves independent prose',async()=>{
 const f=fixture();const definitions=await f.api.records.fields();assert.equal(definitions.items.length,3);definitions.items[0].name='Changed copy';assert.equal(f.fields[0].name,'Reading');
 const before=await f.api.records.read({date:f.date});assert.equal(before.exists,false);assert.equal(f.files.size,0);
 const reading=before.items.find(row=>row.fieldId==='reading');assert.equal(reading.value,null);
 assert.equal((await f.api.records.update({date:f.date,...reading,value:null})).changed,false);assert.equal(f.files.size,0);
 const write=await f.api.records.update({date:f.date,fieldId:reading.fieldId,revision:reading.revision,value:12});
 assert.equal(write.value,12);assert.equal(write.changed,true);assert.equal(write.write,undefined);assert.equal(write.markdown,undefined);
 assert.match(f.files.get(f.note),/keep: true/);assert.equal(habitRecords(f.files.get(f.note),f.date,f.note)[0].done,true);
 const ref=(await f.api.records.read({date:f.date})).items[0];f.files.set(f.note,f.files.get(f.note)+'Keep my new paragraph.\n');
 const zero=await f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:ref.revision,value:0});assert.equal(zero.value,0);assert.ok(f.files.get(f.note).endsWith('Keep my new paragraph.\n'));assert.equal(habitRecords(f.files.get(f.note),f.date,f.note)[0].done,false);
 const clear=await f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:zero.revision,value:null});assert.equal(clear.value,null);
 assert.equal((await f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:clear.revision,value:null})).changed,false);
});
test('record API conflicts after value or definition changes and serializes competing writes',async()=>{
 const f=fixture('---\nminutes: 10\n---\nKeep.\n'),read=async()=> (await f.api.records.read({date:f.date})).items[0];
 let ref=await read();f.files.set(f.note,f.files.get(f.note).replace('minutes: 10','minutes: 11'));
 await assert.rejects(f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:ref.revision,value:12}),e=>e.code==='conflict');
 ref=await read();f.fields[0].unit='hours';await assert.rejects(f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:ref.revision,value:12}),e=>e.code==='conflict');
 ref=await read();const competing=await Promise.allSettled([12,15].map(value=>f.api.records.update({date:f.date,fieldId:ref.fieldId,revision:ref.revision,value})));
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.find(r=>r.status==='rejected').reason.code,'conflict');
 const previous=f.files.get(f.note),fresh=await read(),originalLoad=f.p.loadTextFromVault;
 f.p.loadTextFromVault=async path=>{const raw=await originalLoad(path);if(path==='Habits.md')f.fields[0].unit='seconds';return raw;};
 await assert.rejects(f.api.records.update({date:f.date,fieldId:fresh.fieldId,revision:fresh.revision,value:100}),e=>e.code==='conflict');assert.equal(f.files.get(f.note),previous);
});
test('record API rejects invalid and future inputs, preserves false, and rejects unloaded handles',async()=>{
 const f=fixture(),base=await f.api.records.read({date:f.date}),reading=base.items[0],toggle=base.items[1];
 for(const value of ['12',NaN,{},[]])await assert.rejects(f.api.records.update({date:f.date,fieldId:reading.fieldId,revision:reading.revision,value}),e=>e.code==='invalid-input');
 await assert.rejects(f.api.records.update({date:f.date,fieldId:reading.fieldId,value:12}),e=>e.code==='invalid-input');
 await assert.rejects(f.api.records.read({date:'2026-02-30'}),e=>e.code==='invalid-input');
 await assert.rejects(f.api.records.update({date:'2099-01-01',fieldId:reading.fieldId,revision:reading.revision,value:12}),e=>e.code==='invalid-input');
 await assert.rejects(f.api.records.update({date:f.date,fieldId:'missing',revision:reading.revision,value:12}),e=>e.code==='not-found');assert.equal(f.files.size,0);
 assert.equal((await f.api.records.update({date:f.date,fieldId:toggle.fieldId,revision:toggle.revision,value:false})).value,false);
 f.p._noriaPluginDisposed=true;await assert.rejects(f.api.records.read({date:f.date}),e=>e.code==='unsupported');
});
