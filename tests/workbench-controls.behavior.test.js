const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
test("quickly finishing layout editing is not dropped by refresh deduplication",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../src/main.js"),"utf8");
  const method=name=>{const start=source.indexOf(`  ${name}(`),end=source.indexOf("\n  }",start)+4;return source.slice(start,end);};
  const p=vm.runInNewContext("({"+method("async setHomeEditMode")+","+method("requestNoriaRefresh")+"})",{setTimeout,clearTimeout,Date,NORIA_DEFAULT_PERFORMANCE:{refreshDebounceMs:20}});
  p.settings={performance:{refreshDebounceMs:20}};p.isNoriaRecoveryOwnerActive=()=>true;p.invalidateTaskSnapshots=()=>{};p.createDataService=async()=>({invalidate(){}});
  const modes=[];p.reloadOpenNoriaViews=async()=>modes.push(p._homeEditMode);
  await p.setHomeEditMode(true);await p.setHomeEditMode(false);
  assert.deepEqual(modes,[true,false]);assert.equal(p._homeEditMode,false);
});
test("the task editor stays inside a narrow pane beside its anchor",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../src/runtime/views/tasks-calendar/runtime-core.js"),"utf8");
  const start=source.indexOf("function positionWorkbench()"),end=source.indexOf("\n\tif (workbench)",start);
  const pane={left:383,right:773,width:390},panel={style:{},getBoundingClientRect:()=>({height:315})};
  const anchor={getBoundingClientRect:()=>({left:439,top:300,bottom:330}),closest:()=>({getBoundingClientRect:()=>pane})};
  new Function("workbench","panel","window",source.slice(start,end)+";positionWorkbench();")({anchor},panel,{innerWidth:1920,innerHeight:1032});
  assert.equal(panel.style.width,"366px");
  assert.ok(parseFloat(panel.style.left)>=pane.left+12);
  assert.ok(parseFloat(panel.style.left)+parseFloat(panel.style.width)<=pane.right-12);
});
test("the existing preview command switches Noria modes and restores native behavior on unload",()=>{
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/workbench-controls.js"),"utf8"),{module,require:()=>({})});
  let toggles=0,native=0,cleanup;
  const original=()=>{native++;return false;},command={checkCallback:original,hotkeys:[{modifiers:["Mod","Shift"],key:"E"}]};
  const app={commands:{commands:{"markdown:toggle-preview":command}},workspace:{activeLeaf:{view:{}}}};
  const plugin={app,register:fn=>cleanup=fn},diary={session:{},toggleEditing:()=>toggles++};
  module.exports.installWorkbenchModeCommand(plugin);
  command.checkCallback(false);assert.equal(native,1);
  app.workspace.activeLeaf.view={plugin,workbench:{active:"diary",diary}};
  assert.equal(command.checkCallback(true),true);assert.equal(toggles,0);
  command.checkCallback(false);assert.equal(toggles,1);
  assert.deepEqual(command.hotkeys,[{modifiers:["Mod","Shift"],key:"E"}]);
  app.workspace.activeLeaf.view.workbench.active="home";command.checkCallback(false);assert.equal(native,2);
  cleanup();assert.equal(command.checkCallback,original);
});
