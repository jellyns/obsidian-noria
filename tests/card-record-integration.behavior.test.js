const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),{createRequire}=require("node:module");
const {DiaryHabitStore,habitRecords}=require("../src/diary-habits.js");
function load(name,stubs){const filename=path.resolve(__dirname,"../src/"+name),module={exports:{}},local=createRequire(filename);vm.runInNewContext(fs.readFileSync(filename,"utf8"),{module,require:id=>id in stubs?stubs[id]:local(id),console,crypto:require("node:crypto").webcrypto});return module.exports;}
class Component{constructor(){this.cleanups=[];}load(){}register(fn){this.cleanups.push(fn);}unload(){this.cleanups.splice(0).reverse().forEach(fn=>fn());}}
class Element{createDiv(){return new Element();}empty(){}remove(){this.removed=true;} }
const parse=raw=>Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const hit=/^(?:"([^"]+)"|([^:\s]+)):\s*(.+)$/.exec(line);if(!hit)return [];try{return [[hit[1]||hit[2],JSON.parse(hit[3])]];}catch{return [[hit[1]||hit[2],hit[3]]];}}));
test("provider config is instance-owned and late rendering is disposed exactly once",async()=>{
 const {CardSystem}=load("card-system.js",{"obsidian":{Component},"./card-controls.js":{}}),system=Object.create(CardSystem.prototype);
 Object.assign(system,{providers:new Map(),mounted:new Set(),listeners:new Set(),app:{plugins:{plugins:{example:{}}}},plugin:{getNoriaLocale:()=>"en"}});
 let resolveA,cleaned=0,received;
 const unregister=system.register({id:"example:counter",title:"Counter",render:async({config,component})=>{received=config;config.nested.value=9;component.register(()=>cleaned++);await new Promise(resolve=>resolveA=resolve);return()=>cleaned++;}});
 const widget={source:"example:counter",props:{nested:{value:2}}},pending=system.render(widget,new Element());
 assert.equal(widget.props.nested.value,2);assert.equal(received.nested.value,9);assert.equal(system.mounted.size,1);
 unregister();assert.equal(cleaned,1);resolveA();const dispose=await pending;dispose();assert.equal(cleaned,2);assert.equal(system.mounted.size,0);
});
test("one provider failure leaves a separate provider and its mount running",async()=>{
 const {CardSystem}=load("card-system.js",{"obsidian":{Component},"./card-controls.js":{}}),system=Object.create(CardSystem.prototype);
 Object.assign(system,{providers:new Map(),mounted:new Set(),listeners:new Set(),app:{plugins:{plugins:{example:{}}}},plugin:{getNoriaLocale:()=>"en"}});
 let cleanup=0;const unregister=system.register({id:"example:good",title:"Good",render:()=>()=>cleanup++});system.register({id:"example:broken",title:"Broken",render:()=>{throw Error("unavailable");}});
 const good=await system.render({source:"example:good"},new Element()),bad=await system.render({source:"example:broken"},new Element());bad();assert.equal(cleanup,0);assert.equal(system.mounted.size,1);unregister();good();assert.equal(cleanup,1);
});
test("saving a bound daily property preserves historical target and other habits, with one value source",async()=>{
 const {RecordFields}=load("record-fields.js",{"obsidian":{parseYaml:parse},"./record-manager.js":{},"./record-popover.js":{},"./card-controls.js":{}});
 let raw='---\nreading_minutes: 0\n---\n\n## Notes\nKeep this paragraph.\n\n## 习惯记录\n- [x] 散步 #habit [due:: 2026-09-16]\n- [ ] 阅读 [type:: number] [target:: 10] [unit:: 分钟] #habit [due:: 2026-09-16]\n';
 const p={app:{vault:{getAbstractFileByPath:()=>({})}},settings:{},getNoriaLocale:()=>"en",getLocalYmd:()=>"2026-09-17",getManagedPath:()=>"Habits.md",t:()=>"习惯记录",resolveCalendarNoteSpecAsync:async()=>({path:"2026-09-16.md"}),loadTextFromVault:async()=>"## 打卡中的习惯\n- 阅读 [type:: number] [target:: 20] [unit:: 分钟] [record-field:: reading_minutes]\n",processTextAtVaultPath:async(_,mutate)=>{raw=mutate(raw);},requestNoriaRefresh(){}};
 const records=new RecordFields(p),field={property:"reading_minutes",type:"number"};await records.save("2026-09-16",field,5);await records.save("2026-09-16",field,5,{increment:true});
 assert.match(raw,/"reading_minutes": 10/);assert.match(raw,/Keep this paragraph/);assert.doesNotMatch(raw,/\[value::/);
 const rows=habitRecords(raw,"2026-09-16","");assert.equal(rows[0].name,"散步");assert.equal(rows[0].done,true);assert.equal(rows[1].done,true);assert.equal(rows[1].target,"10");
});
test("sleep after midnight belongs to the previous day and an explicit record wins",async()=>{
 let diary="",registry="## Active habits\n- Bedtime [type:: sleep] [target:: 00:30]\n";
 const p={resolveCalendarNoteSpecAsync:async(_,date)=>({path:date+".md"}),buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:"Habits.md"}}),getLocalYmd:()=>"2026-09-17",loadTextFromVault:async path=>path==="Habits.md"?registry:path==="2026-09-16.md"?diary:'- [ ] Sleep #tl/sleep [start:: 2026-09-17 00:15]\n'};
 const store=new DiaryHabitStore(p),auto=await store.load("2026-09-16");assert.equal(auto.records[0].source,"tl");assert.equal(auto.records[0].value,"00:15");assert.equal(auto.records[0].done,true);
 diary='- [ ] Bedtime [type:: sleep] [target:: 00:30] #habit [due:: 2026-09-16] [value:: 01:00]\n';const explicit=await store.load("2026-09-16");assert.equal(explicit.records[0].value,"01:00");assert.equal(explicit.records[0].done,false);
});
test("paused bound habits still read their historical property and original goal",async()=>{
 const registry="## Paused habits\n- Reading [type:: number] [target:: 20] [record-field:: minutes]\n",raw='- [ ] Reading [type:: number] [target:: 10] #habit [due:: 2026-09-16]\n';
 const p={resolveCalendarNoteSpecAsync:async(_,date)=>({path:date+".md"}),buildRuntimeBridgeConfig:()=>({paths:{habitRegistryPath:"Habits.md"}}),getLocalYmd:()=>"2026-09-17",loadTextFromVault:async path=>path==="Habits.md"?registry:raw,records:{definitions:()=>[{property:"minutes"}],read:()=>12}};
 const result=await new DiaryHabitStore(p).load("2026-09-16");assert.equal(result.active.length,0);assert.equal(result.records[0].done,true);assert.equal(result.records[0].value,12);assert.equal(result.records[0].target,"10");
});
