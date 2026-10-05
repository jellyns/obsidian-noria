/* End-to-end smoke from an empty workspace inside NoriaTest, then restore settings. */
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest required");
  const p=app.plugins.plugins.noria,fs=require("fs"),dir="F:/NoriaTest/_acceptance-c-review-20260916",root="NoriaFirstUse20260917";
  if(app.vault.getAbstractFileByPath(root))throw Error("Fresh owned directory required");
  const settings=structuredClone(p.settings),checks=[],configs={};
  for(const path of [".obsidian/daily-notes.json",".obsidian/templates.json"]){const absolute="F:/NoriaTest/"+path;configs[path]=fs.existsSync(absolute)?fs.readFileSync(absolute):null;}
  const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});if(!ok)throw Error(name);};
  const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error("Timed out");};
  try{
    p.settings=p.normalizeSettings({});p.applyStarterWorkspaceDefaults({workspaceRoot:root,profile:"standard",replaceAll:true});
    p.settings.weather.enabled=false;
    const result=await p.initializeMissingManagedNotes();p.settings.weather.enabled=false;await p.saveSettings();p.syncRuntimeBridgeConfig();
    check("First initialization creates starter notes only inside the isolated root",result.ok&&result.created.length>0&&result.created.every(x=>x.path?.startsWith(root+"/")),result.created.map(x=>x.path));
    const home=await p.openDashboardHomeLeaf(false);await home.view.renderHome();
    await wait(()=>home.view.hostEl.querySelector(".dashboard-project-next-input"));
    const project=p.getStarterProjectDefinitions()[0];check("Starter project is discoverable from Home",!!home.view.hostEl.querySelector(".dashboard-project-next-input"),project.path);
    const request={path:project.path,text:"为城市散步留下一张路线草图"};
    const appended=await p.appendTaskToProject(request);
    check("A next step is stored once in the existing project note",appended.ok&&(await p.loadTextFromVault(project.path)).split(request.text).length===2);
    const changed=await p.updateTaskCheckboxStatus({path:project.path,text:appended.text,line:appended.line,done:true,recordCompletion:true});
    check("The same project task can be completed",changed.ok&&/\[x\].*为城市散步/.test(await p.loadTextFromVault(project.path)));
    const opened=await p.openDiaryInHome({selection:{mode:"daily",anchorDate:p.getLocalYmd()}}),d=opened.leaf.view.workbench.diary;
    const note=await p.appendHomeQuickCapture({date:p.getLocalYmd(),target:"diary-inbox",text:"做完路线草图，先留下一个可以继续的起点。\n下次带着它去走一走。",refresh:false});
    await d.refreshDocument();
    check("First diary capture keeps its template and multiple lines",note.path.startsWith(root+"/")&&note.write.text.includes("下次带着它")&&note.write.text.includes("## "));
    const review=await p.prepareReviewAnalysis({mode:"daily",anchorDate:p.getLocalYmd()});
    const material=JSON.parse(await p.loadTextFromVault(review.evidencePath.replace(/\.json$/,".material.json")));
    check("The same new record reaches review material",material.payload.records.some(x=>x.text.includes("路线草图")));
    const records=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(root+"/"));
    check("Initialized workspace has native Home, templates, projects and dated content",home.view.getViewType()==="noria-dashboard-home"&&records.some(f=>f.path.includes("Templates/"))&&records.some(f=>f.path.includes("Projects/"))&&records.some(f=>f.path.includes("Diary/")),records.length);
    return {checks:checks.length,failed:checks.filter(x=>!x.ok),root};
  }finally{
    p.settings=settings;await p.saveSettings();p.syncRuntimeBridgeConfig();
    for(const [path,data]of Object.entries(configs)){
      const absolute="F:/NoriaTest/"+path;
      if(data)fs.writeFileSync(absolute,data);
      else if(fs.existsSync(absolute)){const backup=dir+"/"+path.split("/").pop();fs.renameSync(absolute,backup);}
    }
    fs.writeFileSync(dir+"/first-use-results.json",JSON.stringify({build:globalThis.__noriaRuntimeBuildId,checks,root,boundary:"Empty workspace in an existing NoriaTest vault, not a clean Obsidian installation"},null,2));
  }
})()
