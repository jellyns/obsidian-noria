const test=require("node:test"),assert=require("node:assert/strict"),V=require("../src/record-visual.js");
test("custom state appearance keeps stored values stable and validates visual metadata",()=>{
 const field={type:"option",options:["steady"],states:{steady:{label:"平静",icon:"smile",color:"#aabbcc"}}};
 assert.deepEqual(V.choices(field),["steady"]);assert.equal(V.appearance(field,"steady").label,"平静");assert.equal(V.validateVisuals(field).steady.icon,"smile");assert.equal(field.options[0],"steady");
 assert.throws(()=>V.validateVisuals({...field,states:{steady:{color:"red;display:none"}}}));
});
test("legacy mood icons remain distinct and numeric scales keep every value",()=>{
 assert.equal(V.appearance({legacy:"mood"},"一般").icon,"noria-mood-3");assert.equal(V.appearance({legacy:"mood"},"稳定").icon,"noria-mood-4");
 assert.deepEqual(V.choices({type:"level",min:0,max:4}),[0,1,2,3,4]);assert.deepEqual(V.choices({type:"toggle"}),[true,false]);
});
test('record defaults distinguish empty and filled states without modifying stored choices',()=>{
 const f={legacy:'energy',icon:'battery-medium',type:'level',min:1,max:5};
 assert.equal(V.fieldPicture(f),'noria-energy');
 assert.equal(V.appearance(f,null).icon,'noria-energy');
 assert.equal(V.appearance(f,1).icon,'noria-energy-1');
 assert.equal(V.appearance(f,5).icon,'noria-energy-5');
 assert.equal(f.icon,'battery-medium');
 assert.equal(V.fieldPicture({...f,icon:'emoji:%F0%9F%8C%9E'}),'emoji:%F0%9F%8C%9E');
 assert.equal(V.fieldPicture({...f,iconCustomized:true}),'battery-medium');
 assert.equal(V.appearance({...f,states:{3:{icon:'asset:my-sun',label:'刚好'}}},3).icon,'asset:my-sun');
 assert.equal(V.appearance({...f,states:{3:{label:'刚好'}}},3).label,'刚好');
 assert.equal(V.appearance({legacy:'focus',icon:'focus'},'难进入状态').icon,'noria-focus-1');
 assert.equal(V.appearance({legacy:'focus',icon:'focus'},'很专注').icon,'noria-focus-4');
});
