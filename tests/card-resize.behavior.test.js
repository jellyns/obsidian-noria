const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("card resizing works without layout mode and Escape restores the saved height",async()=>{
  const mod={exports:{}},listeners=new Map(),style=new Map(),saved=[];
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/card-controls.js"),"utf8"),{module:mod,require:()=>({setIcon(){},setTooltip(){},Notice:class{}})});
  const button={addClass(){},setPointerCapture(){},remove(){}};
  const host={createEl:()=>button,style:{setProperty:(k,v)=>style.set(k,v)},getBoundingClientRect:()=>({height:240}),ownerDocument:{addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)}};
  const dispose=mod.exports.attachCardResize(host,()=>240,v=>saved.push(v),"Resize");
  button.onpointerdown({button:0,clientY:100,pointerId:1,preventDefault(){}});button.onpointermove({clientY:160});button.onpointerup();
  assert.deepEqual(saved,[300]);assert.equal(style.get("--noria-card-height"),"300px");
  button.onpointerdown({button:0,clientY:100,pointerId:1,preventDefault(){}});button.onpointermove({clientY:190});listeners.get("keydown")({key:"Escape",preventDefault(){},stopPropagation(){}});button.onpointerup();
  assert.deepEqual(saved,[300]);assert.equal(style.get("--noria-card-height"),"240px");
  button.onkeydown({key:"ArrowDown",preventDefault(){}});button.onkeydown({key:"Home",preventDefault(){}});assert.deepEqual(saved,[300,256,null]);dispose();assert.equal(listeners.size,0);
});
