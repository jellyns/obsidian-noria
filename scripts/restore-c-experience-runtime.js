/* Recover owned acceptance fixtures and restore NoriaTest's original user state. */
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest required");
  const fs=require("fs"),path=require("path"),crypto=require("crypto"),p=app.plugins.plugins.noria;
  const dir="F:/NoriaTest/_acceptance-c-review-20260916",base="F:/NoriaTest",initial="F:/NoriaTest/_acceptance-c-cards-20260916/baseline";
  const state=JSON.parse(fs.readFileSync(initial+"/runtime.json","utf8").replace(/^\uFEFF/,""));
  const report={fixtures:[],build:globalThis.__noriaRuntimeBuildId};
  const stat=relative=>{const bytes=fs.readFileSync(path.join(base,relative));return {path:relative,sha256:crypto.createHash("sha256").update(bytes).digest("hex")};};
  const fixtures=["Noria/Diary/2001/2001-02-12.md","Noria/Diary/2001/2001-W07.md","Noria/Diary/2001/2001-02-12-review.md"];
  for(const relative of fixtures)report.fixtures.push(stat(relative));
  await app.workspace.changeLayout(state.layout);
  const parent="_acceptance-c-review-20260916/fixtures";
  if(!app.vault.getAbstractFileByPath(parent))await app.vault.createFolder(parent);
  const moves=fixtures.map(relative=>[relative,parent+"/"+path.basename(relative)]);
  moves.push(["NoriaFirstUse20260917",parent+"/first-use"]);
  for(const [from,to] of moves){
    for(const target of [from,to])if(!path.resolve(base,target).startsWith(path.resolve(base)+path.sep))throw Error("Outside isolated vault");
    if(app.vault.getAbstractFileByPath(to))throw Error("Destination already exists");
    const record=report.fixtures.find(x=>x.path===from);if(record&&stat(from).sha256!==record.sha256)throw Error("Fixture changed concurrently");
    await app.vault.rename(app.vault.getAbstractFileByPath(from),to);
    if(record)record.archivedAt=to;
  }
  p.settings=structuredClone(state.settings);p.syncRuntimeBridgeConfig();
  const originalData=fs.readFileSync(initial+"/vault/.obsidian/plugins/noria/data.json");
  fs.writeFileSync(base+"/.obsidian/plugins/noria/data.json",originalData);
  Object.keys(localStorage).filter(k=>k.startsWith("noria.")).forEach(k=>{if(!(k in state.storage))localStorage.removeItem(k);});
  Object.entries(state.storage).forEach(([k,v])=>localStorage.setItem(k,v));
  const appearance=JSON.parse(fs.readFileSync(initial+"/vault/.obsidian/appearance.json","utf8"));
  const dark=appearance.theme==="obsidian";document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);
  const win=require("@electron/remote").getCurrentWindow();win.setBounds(state.bounds);if(state.bounds.x<0)win.maximize();win.webContents.setBackgroundThrottling(state.throttle);
  const leaf=app.workspace.getLeafById(state.active);if(leaf)app.workspace.setActiveLeaf(leaf,{focus:true});
  await new Promise(r=>setTimeout(r,400));
  report.active=app.workspace.activeLeaf?.id;report.bounds=win.getBounds();report.locale=p.getNoriaLocale();report.theme=dark?"dark":"light";
  report.layout=app.workspace.getLayout();report.settingsFileSame=fs.readFileSync(base+"/.obsidian/plugins/noria/data.json").equals(originalData);
  report.oldDatesRemoved=fixtures.every(x=>!app.vault.getAbstractFileByPath(x));
  report.emptyDateNotCreated=!app.vault.getAbstractFileByPath("Noria/Diary/2001/2001-02-13.md");
  fs.writeFileSync(dir+"/restoration.json",JSON.stringify(report,null,2));
  return {active:report.active,settingsFileSame:report.settingsFileSame,fixtures:report.fixtures.length,oldDatesRemoved:report.oldDatesRemoved,emptyDateNotCreated:report.emptyDateNotCreated};
})()
