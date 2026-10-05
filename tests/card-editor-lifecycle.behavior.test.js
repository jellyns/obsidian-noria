const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const actual=createRequire(require('node:path').resolve('src/card-catalog.js'));
const moduleBox={exports:{}};
vm.runInNewContext(fs.readFileSync('src/card-catalog.js','utf8'),{module:moduleBox,require:id=>id==='obsidian'?{Modal:class{}}:id==='./card-controls.js'?{}:actual(id),clearTimeout,setTimeout,console});
const {CardCatalog}=moduleBox.exports;
class El{
 constructor(){this.children=[];this.text='';}createDiv(opts={}){const el=new El();el.text=opts.text||'';this.children.push(el);return el;}
 createEl(tag,opts){return this.createDiv(opts);}empty(){this.children=[];}setText(text){this.text=text;}
 get textContent(){return this.text+this.children.map(el=>el.textContent).join('');}
}
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function editor(){return Object.assign(Object.create(CardCatalog.prototype),{context:{page:'home'},generation:0,draft:{id:'card-a',type:'extension',source:'test:card',title:'Original',props:{}},plugin:{settings:{home:{}},isIsoDateText:()=>true,app:{}},app:{plugins:{plugins:{}}},system:{providers:new Map([['test:card',{pluginId:'noria'}]])},contentEl:new El(),previewHost:new El(),errorEl:new El(),applyButton:new El(),text:(zh,en)=>en,validateDraft:async()=>{},close(){this.closed=true;},showError(e){this.error=String(e);}});}

test('applying captures the validated draft once and blocks a second save',async()=>{
 const m=editor(),validation=gate();let calls=0,saved;
 m.validateDraft=()=>validation.promise;m.system.saveHome=async draft=>{calls++;saved=draft;};
 const first=m.save();assert.equal(m.contentEl.inert,true);assert.equal(m.applyButton.disabled,true);
 m.draft.title='Changed during await';await m.save();validation.resolve();await first;
 assert.equal(calls,1);assert.equal(saved.title,'Original');assert.equal(m.closed,true);assert.equal(m.contentEl.inert,false);
});

test('save failure keeps edits available and a retry applies the same draft',async()=>{
 const m=editor();let fail=true;m.system.saveHome=async()=>{if(fail)throw Error('disk unavailable');};
 await m.save();assert.equal(m.closed,undefined);assert.equal(m.draft.title,'Original');assert.equal(m.applyButton.disabled,false);assert.match(m.error,/edits are kept/);
 fail=false;await m.save();assert.equal(m.closed,true);
});

test('out-of-order previews cannot append to the current preview or unlock an active save',async()=>{
 const m=editor(),gates=[gate(),gate()];let index=0,cleaned=0;
 m.system.render=async(draft,body)=>{const i=index++;await gates[i].promise;body.createDiv({text:draft.title});return ()=>cleaned++;};
 const old=m.preview();m.draft.title='Latest';const current=m.preview();m.saving=true;
 gates[1].resolve();await current;gates[0].resolve();await old;
 assert.match(m.previewHost.textContent,/Latest/);assert.doesNotMatch(m.previewHost.textContent,/Original/);assert.equal(cleaned,1);assert.equal(m.applyButton.disabled,true);
});

test('invalid custom dates stop the preview before rendering and recover after correction',async()=>{
 const m=editor();m.context={page:'diary',mode:'weekly'};m.draft={id:'a',type:'builtin',builtinId:'metrics',props:{statsRange:{mode:'custom',start:'2026-10-02',end:'2026-10-01'}}};let renders=0;m.system.render=async()=>{renders++;return ()=>{};};
 await m.preview();assert.equal(renders,0);assert.equal(m.applyButton.disabled,true);
 m.draft.props.statsRange.end='2026-10-03';await m.preview();assert.equal(renders,1);assert.equal(m.applyButton.disabled,false);
});
