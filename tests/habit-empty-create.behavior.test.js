const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(tag='div',opts={}){this.tag=tag;this.children=[];this.attrs=opts.attr||{};this.text=opts.text||'';this.style={};this.dataset={};}
  createEl(tag,opts){const child=new Element(tag,opts);this.children.push(child);return child;}
  createDiv(opts){return this.createEl('div',opts);}
  setText(text){this.text=text;}setAttribute(key,value){this.attrs[key]=value;}removeAttribute(key){delete this.attrs[key];}
  closest(){return null;}
  all(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.all(tag)]);}
}
for(const content of [null,'## 打卡中的习惯\n\n','## 暂停的习惯\n- 阅读\n']) {
  test(`habit card keeps direct creation and management with ${content===null?'no registry':content.includes('暂停')?'paused habits only':'an empty registry'}`,async()=>{
    const mount=new Element(),actionsHost=new Element(),shell={},opened=[];
    mount.closest=()=>shell;
    const bridge={locale:'zh',diaryHabits:{today:()=> '2026-10-14',manage:initial=>opened.push(initial)}};
    const source=fs.readFileSync(require.resolve('../src/runtime/views/periodic/dashboardHabitWeek.js'),'utf8');
    await vm.runInNewContext('(async()=>{'+source+'})()',{
      input:{mount,actionsHost,noriaBridge:bridge},ctx:{io:{load:async()=>content},page:()=>null},
      app:{vault:{getAbstractFileByPath:()=>content?{}:null}},console
    });
    const plus=actionsHost.all('button').find(b=>b.attrs['aria-label']==='Add habit');
    assert.ok(plus);plus.onclick();
    const add=mount.all('button').find(b=>b.attrs['data-noria-action-kind']==='add-habit');
    assert.ok(add);assert.equal(await add.onclick(),true);
    shell._noriaConfigureWidget();assert.deepEqual(opened,[true,true,false]);
  });
}
