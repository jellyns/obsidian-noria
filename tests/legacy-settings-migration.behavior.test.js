"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {migrate}=require("../src/legacy-settings-migration.js");
function fixture(config={}) {
  const disk=new Map([["Old.md","---\ntimeline_settings: fixture\n---\n\n## My notes\nKeep this"]]);
  const plugin={manifest:{id:"noria"},app:{vault:{configDir:".obsidian",adapter:{
    exists:async p=>disk.has(p),read:async p=>disk.get(p),write:async(p,v)=>disk.set(p,v),mkdir:async p=>disk.set(p,"")
  }}}};
  return {plugin,disk,parse:()=>({timeline_settings:config})};
}
test("file priority transfers to existing settings, preserves custom items and source; repeat startup is a no-op",async()=>{
  const f=fixture({defaultStrategy:"weekly-all",dayBucketHeight:123,laneHeight:900,pregenSpanDays:3,pregenItems:["custom"],items:{custom:{label:"My block",startTime:"11:00",durationMin:45}},unknown:"Keep"});
  const raw={managedPaths:{timelineSettings:"Old.md",inboxWorkflow:"Guide.md",inboxQueue:"Mine.base"},inboxWorkflow:{statuses:[{id:"mine"}]},sizing:{dayBucketHeight:84,other:11},timelineQuickSettings:{items:{custom:{timelineTag:"#tl/mine"}}},home:{widgets:[{metrics:["inbox.stale","tasks.open"]}]}};
  const before=JSON.stringify(raw),result=await migrate(f.plugin,raw,f.parse);
  assert.equal(JSON.stringify(raw),before);assert.equal(result.settings.defaultStrategy,"weekly");
  assert.deepEqual(result.settings.sizing,{dayBucketHeight:123,laneHeight:900,other:11});
  assert.equal(result.settings.timelineQuickSettings.items.custom.timelineTag,"#tl/mine");
  assert.equal(result.settings.timelineQuickSettings.items.custom.label,"My block");
  assert.equal(result.settings.managedPaths.inboxQueue,"Mine.base");assert.equal(result.settings.inboxWorkflow,undefined);
  assert.deepEqual(result.settings.home.widgets[0].metrics,["tasks.open"]);
  const receipt=JSON.parse([...f.disk.entries()].find(([p])=>p.endsWith(".json"))[1]);
  assert.equal(receipt.source,f.disk.get("Old.md"));assert.equal(receipt.imported.unknown,"Keep");
  assert.equal(receipt.previous.inboxWorkflow.statuses[0].id,"mine");
  const count=f.disk.size;assert.equal((await migrate(f.plugin,result.settings,()=>{throw Error("must not read");})).changed,false);assert.equal(f.disk.size,count);
});
test("empty configured path does not rediscover retired defaults or overwrite current settings",async()=>{
  const f=fixture({dayBucketHeight:123});f.disk.set(".obsidian/plugins/noria/config/timeline-settings.md",f.disk.get("Old.md"));
  const result=await migrate(f.plugin,{managedPaths:{timelineSettings:""},sizing:{dayBucketHeight:200}},f.parse);
  assert.equal(result.settings.sizing.dayBucketHeight,200);assert.equal(f.disk.size,2);
});
test("unconfigured legacy installations import the former implicit path",async()=>{
  const f=fixture({laneHeight:1400});f.disk.set(".obsidian/plugins/noria/config/timeline-settings.md",f.disk.get("Old.md"));
  assert.equal((await migrate(f.plugin,{},f.parse)).settings.sizing.laneHeight,1400);
});
test("unreadable source, invalid YAML and failed recovery write leave input and original file untouched",async()=>{
  for(const mode of ["read","yaml","write","verify"]) {
    const f=fixture({}),raw={managedPaths:{timelineSettings:"Old.md"},inboxWorkflow:{custom:true}},before=JSON.stringify(raw),source=f.disk.get("Old.md");
    const adapter=f.plugin.app.vault.adapter;
    if(mode==="read")adapter.read=async()=>{throw Error("read failed");};
    if(mode==="yaml")f.parse=()=>{throw Error("bad YAML");};
    if(mode==="write")adapter.write=async()=>{throw Error("disk full");};
    if(mode==="verify")adapter.write=async(p,v)=>f.disk.set(p,v+"corruption");
    await assert.rejects(migrate(f.plugin,raw,f.parse));assert.equal(JSON.stringify(raw),before);assert.equal(f.disk.get("Old.md"),source);
  }
});
test("a missing source is recorded without fabricating a recovered configuration",async()=>{
  const f=fixture();const result=await migrate(f.plugin,{managedPaths:{timelineSettings:"Missing.md"},sizing:{laneHeight:1250}},f.parse);
  assert.equal(result.settings.sizing.laneHeight,1250);
  const receipt=JSON.parse([...f.disk.entries()].find(([p])=>p.endsWith(".json"))[1]);assert.equal(receipt.source,null);assert.equal(receipt.sourcePath,"Missing.md");
});
