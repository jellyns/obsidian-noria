const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class El{
 constructor(text=''){this.text=text;this.children=[];this.dataset={};}
 createEl(tag,opts={}){const child=new El(opts.text||'');child.tag=tag;this.children.push(child);return child;}
 createDiv(opts){return this.createEl('div',opts);}createSpan(opts){return this.createEl('span',opts);}
 empty(){this.children=[];}focus(){}get textContent(){return this.text+this.children.map(el=>el.textContent).join('');}
 all(){return this.children.flatMap(child=>[child,...child.all()]);}
}
const box={exports:{}},localRequire=require('node:module').createRequire(require('node:path').resolve('src/card-catalog.js'));
vm.runInNewContext(fs.readFileSync('src/card-catalog.js','utf8'),{module:box,require:id=>id==='obsidian'?{Modal:class{},setIcon(){}}:id==='./card-layout-model.js'?{CARD_IDS:[]}:id==='./statistic-templates.js'?{dashboardTemplates:()=>[]}:id==='./card-controls.js'?{}:localRequire(id),clearTimeout,setTimeout});
function catalog(existing){
 const template={id:'daily-advice',type:'markdown',enabled:false,size:'full',order:40,props:{sourceMode:'daily-section',heading:'建议'}};
 const widgets=existing?[{...template,...existing}]:[],saved=[];
 const modal=Object.assign(Object.create(box.exports.CardCatalog.prototype),{context:{page:'home'},plugin:{settings:{home:{widgets}},buildRuntimeBridgeConfig:()=>({homeWidgetDefaults:[template]})},system:{providers:new Map(),title:w=>w.title||'建议',async saveHome(w){saved.push(w);const i=widgets.findIndex(item=>item.id===w.id);if(i<0)widgets.push(w);else widgets[i]=w;}},contentEl:new El(),modalEl:new El(),text:(zh,en)=>zh,setTitle(){},close(){this.closed=true;}});
 modal.list();return {modal,saved,widgets,choices:()=>modal.contentEl.all().filter(el=>el.tag==='button'&&el.textContent.includes('建议'))};
}
test('suggestions are a normal addable card even when the saved widget is absent',async()=>{
 const {modal,saved,choices}=catalog();assert.equal(choices().length,1);assert.ok(choices()[0].textContent.startsWith('建议'));choices()[0].onclick();await new Promise(setImmediate);assert.equal(saved[0].id,'daily-advice');assert.equal(saved[0].enabled,true);assert.equal(modal.closed,true);
});
test('adding suggestions restores the same configured card without a duplicate restore entry',async()=>{
 const {saved,widgets,choices}=catalog({title:'我的建议',size:'medium',props:{sourceMode:'daily-section',heading:'建议',renderMode:'compact'}});assert.equal(choices().length,1);await choices()[0].onclick();assert.equal(widgets.length,1);assert.equal(saved[0].title,'我的建议');assert.equal(saved[0].size,'medium');
});
test('a visible suggestions card is shown as already on the page and cannot be added twice',()=>{
 const {choices}=catalog({enabled:true});assert.equal(choices().length,1);assert.equal(choices()[0].disabled,true);assert.ok(choices()[0].textContent.includes('已在本页'));
});
