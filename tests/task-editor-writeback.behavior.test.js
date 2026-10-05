const test=require("node:test"),assert=require("node:assert/strict");
const {saveTaskEditor}=require("../src/task-editor-writeback.js");
function harness(source){
  const files={...source},writes=[];let id=0;
  return {files,writes,read:async path=>files[path],process:async(path,fn)=>{files[path]=fn(files[path]);writes.push(path);},createId:()=>"new"+(++id),today:"2099-01-01"};
}
test("dependency edits preflight all sources and preserve nested content",async()=>{
  const h=harness({"a.md":"- [ ] A [custom:: keep]\r\n  detail\r\n","b.md":"- [ ] B #tag","c.md":"- [ ] C"});
  await saveTaskEditor({...h,identity:{path:"a.md",rawText:"- [ ] A [custom:: keep]"},patch:{title:"A revised"},dependencies:{before:[{path:"b.md",rawText:h.files["b.md"]}],after:[{path:"c.md",rawText:h.files["c.md"]}]}});
  assert.equal(h.files["a.md"],"- [ ] A revised [custom:: keep] [id:: new2] [dependsOn:: new1]\r\n  detail\r\n");
  assert.equal(h.files["b.md"],"- [ ] B #tag [id:: new1]");assert.equal(h.files["c.md"],"- [ ] C [dependsOn:: new2]");
});
test("stale dependency source fails before writing the edited task",async()=>{
  const h=harness({"a.md":"- [ ] A","b.md":"- [ ] Externally changed"});
  await assert.rejects(saveTaskEditor({...h,identity:{path:"a.md",rawText:h.files["a.md"]},patch:{title:"Changed"},dependencies:{before:[{path:"b.md",rawText:"- [ ] B"}]}}),/not-found/);
  assert.deepEqual(h.writes,[]);
});
test("a later write failure restores only this save's unchanged writes",async()=>{
  const h=harness({"a.md":"- [ ] A","b.md":"- [ ] B"}),process=h.process;
  await assert.rejects(saveTaskEditor({...h,process:async(path,fn)=>{if(path==="b.md")throw Error("disk error");return process(path,fn);},identity:{path:"a.md",rawText:h.files["a.md"]},patch:{},dependencies:{before:[{path:"b.md",rawText:h.files["b.md"]}]}}),/disk error/);
  assert.deepEqual(h.files,{"a.md":"- [ ] A","b.md":"- [ ] B"});
});
test("removing an after-task relation preserves its other dependencies",async()=>{
  const h=harness({"a.md":"- [ ] A [id:: aaa]","b.md":"- [ ] B [dependsOn:: aaa,bbb]"});
  await saveTaskEditor({...h,identity:{path:"a.md",rawText:h.files["a.md"]},patch:{},dependencies:{before:[],after:[],originalAfter:[{path:"b.md",rawText:h.files["b.md"]}]}});
  assert.equal(h.files["b.md"],"- [ ] B [dependsOn:: bbb]");assert.deepEqual(h.writes,["b.md"]);
});
