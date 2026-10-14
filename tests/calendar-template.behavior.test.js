const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
const start=source.indexOf('  async buildCalendarNoteContent(spec) {'),end=source.indexOf('\n  async getDailyNotesIntegrationStatus()',start);
const build=vm.runInNewContext('({'+source.slice(start,end)+'})').buildCalendarNoteContent;
function plugin(files={}){
 return {normalizePath:p=>p,getNoriaLocale:()=> 'zh',app:{vault:{adapter:{read:async path=>{if(!Object.hasOwn(files,path))throw Error('ENOENT');return files[path];}}}},
  loadTextFromVault:async path=>files[path]||'',getCalendarFallbackSeed:()=> '## 默认\n',applyCalendarTemplateVariables:(raw,spec)=>raw.replaceAll('{{date}}',spec.date),buildCalendarNoteContent:build};
}
test('a deliberately empty or whitespace-only template is not replaced with starter content',async()=>{
 const p=plugin({'Templates/empty.md':'','Templates/spaces.md':'  \n \n'});
 assert.equal(await build.call(p,{templatePath:'Templates/empty.md'}),'');
 assert.equal(await build.call(p,{templatePath:'Templates/spaces.md'}),'');
});
test('missing and unreadable selected templates stop creation instead of silently substituting defaults',async()=>{
 const p=plugin();await assert.rejects(build.call(p,{templatePath:'Templates/missing.md'}),/missing\.md/);
 p.app.vault.adapter.read=async()=>{throw Error('permission denied');};
 await assert.rejects(build.call(p,{templatePath:'Templates/private.md'}),/private\.md/);
});
test('only an unspecified template uses defaults; an extensionless Daily Notes path resolves to Markdown',async()=>{
 const p=plugin({'Templates/日记.md':'## 自定义\n{{date}}\n'});
 assert.equal(await build.call(p,{templatePath:''}),'## 默认\n');
 assert.equal(await build.call(p,{templatePath:'Templates/日记',date:'2001-02-03'}),'## 自定义\n2001-02-03\n');
});
test('template settings route to the owning source and selected period without changing sources',()=>{
 const {openDiaryTemplateSettings}=require('../src/template-file.js'),calls=[];
 const p={getCalendarSettings:()=>({calendarIntegrationMode:p.mode}),openNoriaSettings:(...args)=>calls.push(args),app:{setting:{open:()=>calls.push('open'),openTabById:id=>calls.push(id)}}};
 p.mode='noria';openDiaryTemplateSettings(p,'monthly');assert.deepEqual(calls.pop(),['overview','managedPaths.monthlyTemplate']);
 p.mode='custom';openDiaryTemplateSettings(p,'weekly');assert.deepEqual(calls.pop(),['calendar','calendar.calendarCustomWeekTemplate']);
 p.mode='daily-notes';openDiaryTemplateSettings(p,'daily');assert.deepEqual(calls.splice(0),['open','daily-notes']);
 openDiaryTemplateSettings(p,'yearly');assert.deepEqual(calls.pop(),['overview','managedPaths.yearlyTemplate']);
});

test('template preview rejects an old Base selection and still opens extensionless Markdown paths',async()=>{
 const {openMarkdownTemplate}=require('../src/template-file.js'),opened=[];
 const files={'Templates/day.base':{extension:'base'},'Templates/day.base.md':{extension:'md'},'Templates/day.md':{extension:'md'}};
 const p={normalizePath:p=>p,getNoriaLocale:()=> 'en',app:{vault:{getAbstractFileByPath:path=>files[path]},workspace:{getLeaf:()=>({openFile:file=>opened.push(file)})}}};
 await assert.rejects(openMarkdownTemplate(p,'Templates/day.base'),/\.md template/);assert.deepEqual(opened,[]);
 await openMarkdownTemplate(p,'Templates/day');assert.equal(opened[0],files['Templates/day.md']);
});

test('template suggestions include Markdown outside note query scopes and notify the input owner window',()=>{
 const module={exports:{}},events=[];
 const api={AbstractInputSuggest:class{constructor(app,input){this.input=input;}close(){this.closed=true;}}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/template-file.js'),'utf8'),{module,require:name=>{assert.equal(name,'obsidian');return api;}});
 class OwnerEvent{constructor(type,options){this.type=type;this.bubbles=options.bubbles;}}
 const input={value:'',ownerDocument:{defaultView:{Event:OwnerEvent}},dispatchEvent:event=>events.push(event)};
 const p={app:{vault:{getMarkdownFiles:()=>[{path:'Templates/自由.temple.md'},{path:'Notes/普通.md'}]}},getScopeSpec:()=>{throw Error('Templates must not inherit note query scopes');}};
 const suggest=module.exports.attachMarkdownTemplateSuggest(p,input);
 assert.deepEqual(Array.from(suggest.getSuggestions('自由')),['Templates/自由.temple.md']);
 suggest.selectSuggestion('Templates/自由.temple.md');
 assert.equal(input.value,'Templates/自由.temple.md');assert.equal(suggest.closed,true);
 assert.deepEqual(events.map(e=>e.type),['input','change']);assert.ok(events.every(e=>e instanceof OwnerEvent&&e.bubbles));
});
