const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/workspace-setup.js'),'utf8');
const {validatePath}=require('../src/workspace-setup.js');
function editor(path,{copy=false,folder=false}={}){
  class Element{
    constructor(tag,options={}){this.tag=tag;this.value=options.value;this.text=options.text;this.children=[];}
    createEl(tag,options){const child=new Element(tag,options);this.children.push(child);return child;}
    createDiv(options){return this.createEl('div',options);}
    setText(text){this.text=text;} after(){} focus(){} appendText(){}
    querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
  }
  const buttons=[],container=new Element('div'),files=new Map(copy?[]:[[path,folder?{path,children:[]}:{path,extension:path.split('.').at(-1)}]]),created=[];
  const api={Setting:class{
    constructor(){this.settingEl=new Element('div');this.descEl=new Element('div');}
    setName(){return this;}setDesc(){return this;}
    addButton(fn){const btn={buttonEl:new Element('button'),setButtonText(text){this.text=text;return this;},onClick(fn){this.click=fn;return this;}};fn(btn);buttons.push(btn);return this;}
  }};
  const module={exports:{}};vm.runInNewContext(source,{module,require:name=>{assert.equal(name,'./template-file.js');return {attachMarkdownTemplateSuggest(){}};}});
  let saves=0;
  const plugin={getNoriaLocale:()=> 'en',getManagedPath:()=>'',getManagedNoteSeed:()=> '## Diary',settings:{managedPaths:{dailyTemplate:''}},async saveSettings(){saves++;},async ensureVaultParent(){},
    app:{vault:{getAbstractFileByPath:p=>files.get(p),adapter:{exists:async p=>files.has(p)},async create(p,raw){created.push([p,raw]);}}}};
  module.exports.renderPath({plugin,decorateSettingsTarget(){},display(){}},container,'dailyTemplate','Daily template',api);
  buttons.find(b=>b.text==='Change').click();container.querySelectorAll('input')[0].value=path;
  return {plugin,created,saves:()=>saves,async save(){container.querySelectorAll('button').find(b=>b.text===(copy?'Save built-in copy':'Save')).onclick();await new Promise(setImmediate);},error:()=>container.children[0].children.find(e=>e.tag==='div').text};
}
for(const copy of [false,true])test(`${copy?'saving a built-in copy':'selecting an existing template'} rejects Base before any write`,async()=>{
  const h=editor('Templates/day.base',{copy});await h.save();
  assert.equal(h.plugin.settings.managedPaths.dailyTemplate,'');assert.equal(h.saves(),0);assert.deepEqual(h.created,[]);assert.match(h.error(),/\.md/);
});
test('template selection requires a file rather than a directory named .md',async()=>{
  const h=editor('Templates/folder.md',{folder:true});await h.save();assert.equal(h.saves(),0);assert.match(h.error(),/template|Markdown/i);
});
test('existing Markdown and a built-in Markdown copy remain usable; other Base sources remain valid',async()=>{
  const existing=editor('Templates/day.temple.md');await existing.save();assert.equal(existing.saves(),1);assert.equal(existing.plugin.settings.managedPaths.dailyTemplate,'Templates/day.temple.md');
  const copy=editor('Templates/new.md',{copy:true});await copy.save();assert.equal(copy.saves(),1);assert.deepEqual(copy.created,[['Templates/new.md','## Diary']]);
  assert.equal(validatePath('Views/Library.base'),'Views/Library.base');
});
