const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve("../src/review-workspace.js"),"utf8"),{module:mod,require:id=>id==="./review-document.js"?require("../src/review-document.js"):({})});
const {ReviewWorkspace}=mod.exports;
test("same-page review previews confirmed text while recovered input remains explicitly editable",()=>{
  const w=Object.create(ReviewWorkspace.prototype);w.mode="browse";w.renderer={beforeEdit:()=>true,state:{final:{needsAdoption:true,model:{savedPayload:{body:"Confirmed"}},payload:{body:"Unsaved draft"}}}};
  assert.equal(w.displayedBody,"Confirmed");w.mode="edit";assert.equal(w.displayedBody,"Unsaved draft");
});
test("review editor cannot activate when diary save is blocked",async()=>{
  const w=Object.create(ReviewWorkspace.prototype);w.mode="browse";w.renderer={beforeEdit:async()=>false};await w.startEditing();assert.equal(w.mode,"browse");
});
test("review outline excludes a legacy leading capture without shifting edit indices",()=>{
  const w=Object.create(ReviewWorkspace.prototype);w.mode="browse";w.renderer={beforeEdit:()=>true,state:{final:{model:{sectionHeading:"复盘"},payload:{body:"- [11:51] capture\n\n## 复盘\n\nResult"}}}};
  assert.equal(w.visibleParts.length,1);assert.equal(w.visibleParts[0].index,1);assert.equal(w.visibleParts[0].part.title,"复盘");
});

test('review reading hides empty prompts while editing preserves their original indices',()=>{
  const w=Object.create(ReviewWorkspace.prototype);w.mode='browse';w.renderer={beforeEdit:()=>true,state:{final:{model:{sectionHeading:'复盘'},payload:{body:'## 复盘\n\n### 值得记住\n\n完成了验证。\n\n### 想到的\n\n### 下一步\n\n继续观察。'}}}};
  assert.deepEqual(Array.from(w.visibleParts,p=>p.index),[0,2]);
  w.mode='edit';assert.deepEqual(Array.from(w.visibleParts,p=>p.index),[0,1,2]);
});

test('unconfirmed recovery cannot supply the displayed title or visible chapters',()=>{
  const w=Object.create(ReviewWorkspace.prototype);w.mode='browse';w.renderer={beforeEdit:()=>true,state:{final:{needsAdoption:true,model:{sectionHeading:'复盘',savedPayload:{body:'## 已确认\n\n### 事实\n\n已保存正文'}},payload:{body:'## 未确认\n\n### 草稿\n\n未采纳内容'}}}};
  assert.equal(w.visibleParts[0].part.title,'事实');assert.match(w.displayedBody,/^## 已确认/);
});

test('diary reading renders the complete ordered review while compact entry points retain previews',()=>{
  const body='## 复盘\n\n### 一\n\n短段落。\n\n### 二\n\n另一段。\n\n### 长文\n\n首段。\n\n'+('完整叙述。'.repeat(120))+'\n\n| 项目 | 结果 |\n| --- | --- |\n| 最后一个证据 | 保留 |';
  function render(diary){
    const nodes=[],prose=[];
    const element=()=>{const node={classes:new Set(),children:[],setAttribute(){},empty(){this.children=[];}};node.classList={toggle:(name,on)=>on?node.classes.add(name):node.classes.delete(name)};
      node.createDiv=node.createEl=()=>{const child=element();node.children.push(child);nodes.push(child);return child;};return node;};
    const w=Object.create(ReviewWorkspace.prototype);Object.assign(w,{mode:'browse',components:[],content:element(),pane:element(),renderToolbar(){},renderMarkdown(parent,text){prose.push(text);const el=element();nodes.push(el);return el;},action(){return element();},t:key=>key});
    w.renderer={beforeEdit:diary?()=>true:null,paintIcon(){},state:{final:{model:{sectionHeading:'复盘',targetPath:'day.md'},payload:{body}}}};
    w.renderDocument();return {w,nodes,prose};
  }
  const diary=render(true),compact=render(false);
  assert.deepEqual(diary.prose.slice(0,2),['短段落。','另一段。']);
  assert.match(diary.prose.at(-1),/最后一个证据/);
  assert.equal(diary.nodes.some(n=>n.classes.has('is-paired')),false);
  assert.equal(diary.nodes.some(n=>n.classes.has('is-preview')),false);
  assert.equal(diary.w.state.payload.body,body);
  assert.equal(compact.nodes.some(n=>n.classes.has('is-paired')),true);
  assert.equal(compact.nodes.some(n=>n.classes.has('is-preview')),true);
});
