/* Native screenshots from temporary public demonstration text; restores the source. */
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest required");
  const p=app.plugins.plugins.noria,fs=require("fs"),win=require("@electron/remote").getCurrentWindow();
  const dir="F:/NoriaTest/_acceptance-c-diary-capture-20260916",checks=[],check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});if(!ok)throw Error(name);};
  const frame=()=>new Promise(r=>setTimeout(r,220)),wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,80));}throw Error("Timed out");};
  const path=(await p.resolveCalendarNoteSpecAsync("daily","2026-09-14")).path,file=app.vault.getAbstractFileByPath(path),original=await app.vault.read(file);
  fs.writeFileSync(dir+"/baseline/public-demo.md",original);
  const wasDark=document.body.classList.contains("theme-dark"),locale=p.getNoriaLocale,bridge=globalThis.__noriaRuntimeBridge,bounds=win.getBounds(),max=win.isMaximized();
  let expected=original,d;
  const write=async text=>{await app.vault.process(file,current=>{if(current!==expected)throw Error("Demo changed concurrently");return text;});expected=text;};
  const capture=async(name,el)=>{document.querySelectorAll(".tooltip").forEach(n=>n.remove());el.scrollIntoView({block:"start"});win.webContents.invalidate();await frame();const r=el.getBoundingClientRect(),top=Math.max(0,Math.ceil(r.y));fs.writeFileSync(dir+"/"+name+".png",(await win.webContents.capturePage({x:Math.ceil(r.x),y:top,width:Math.floor(r.width),height:Math.min(Math.floor(r.height),win.getContentBounds().height-top-8)})).toPNG());};
  try{
    app.commands.executeCommandById("noria:quick-capture");await wait(()=>!!document.querySelector(".modal .noria-quick-capture"));
    const modal=document.querySelector(".modal .noria-quick-capture");
    check("Global command names today's actual date",modal.querySelector(".noria-quick-capture-date").textContent.includes(p.getLocalYmd()));
    check("Global command exposes a multi-line native field",!!modal.querySelector("textarea"));
    document.querySelector(".modal .modal-header-button").click();await frame();
    if(max){win.unmaximize();await new Promise(r=>setTimeout(r,400));}win.setBounds({x:0,y:0,width:1500,height:1030});await frame();
    for(const lang of ["zh-CN","en"]){
      p.getNoriaLocale=()=>lang==="en"?"en":"zh";globalThis.__noriaRuntimeBridge=p.buildRuntimeBridgeConfig();
      const body=lang==="en"?"## A slower morning\n\nI walked by the river and noticed the first osmanthus flowers. Back at my desk, I gathered the weekend photos into a small album.\n\n## Inbox\n\n- [09:10] Leave a little time for the places we do not plan to stop.\n- [18:35] The old bridge would make a good starting point for a photo walk.  \n  Keep the route in [[Noria/MOC/Knowledge Base|my notes]], then choose a few photos together.\n":"## 慢一点的早晨\n\n沿河走了一小段路，发现街角的桂花已经开了。回到桌前，先把周末拍的照片整理成一个小相册。\n\n## Inbox\n\n- [09:10] 给那些计划之外的停留，留一点时间。\n- [18:35] 旧桥适合作为下次城市散步的起点。  \n  先把路线记到 [[Noria/MOC/Knowledge Base|笔记]]，再一起挑几张照片。\n";
      await write(`---\ncssclasses: [daily-clean]\nmood: 稳定\nenergy: 4\n---\n${body}`);
      const opened=await p.openDiaryInHome({selection:{mode:"daily",anchorDate:"2026-09-14"}});d=opened.leaf.view.workbench.diary;await d.refreshDocument();await d.contentReady;
      if(d.captureComposer){d.captureComposer.dispose();d.captureComposer=null;}
      d.toggleCapture();await d.captureComposer.ready;d.captureComposer.input.blur();
      check(lang+" shows each timestamped note once",d.content.querySelectorAll(".noria-diary-quick-note").length===2);
      check(lang+" preserves multi-line linked prose",!!d.content.querySelector(".noria-diary-quick-note a.internal-link")&&d.content.textContent.includes(lang==="en"?"Keep the route":"先把路线"));
      // The figure concentrates on recording; existing task/habit cards remain above it.
      d.stateHost.scrollIntoView({block:"start"});await frame();
      await capture("diary-quick-notes-"+lang,d.article);
      // Smaller focused crop from the same actual page, no DOM imitation.
      const a=d.stateHost.getBoundingClientRect(),b=d.content.getBoundingClientRect();
      fs.writeFileSync(dir+"/diary-capture-detail-"+lang+".png",(await win.webContents.capturePage({x:Math.ceil(a.x),y:Math.max(0,Math.ceil(a.y)),width:Math.floor(a.width),height:Math.min(Math.floor(b.bottom-a.y),win.getContentBounds().height-Math.ceil(a.y)-10)})).toPNG());
    }
    p.getNoriaLocale=()=>"zh";globalThis.__noriaRuntimeBridge=p.buildRuntimeBridgeConfig();
    win.setBounds({x:0,y:0,width:1200,height:980});await frame();
    for(const dark of [false,true]){document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);await frame();
      const r=d.root.getBoundingClientRect();check("Narrow "+(dark?"dark":"light")+" has no horizontal overflow",d.root.scrollWidth<=d.root.clientWidth+1,{width:r.width,scroll:d.root.scrollWidth});
      await capture("diary-narrow-"+(dark?"dark":"light"),d.root);
    }
    return {checks:checks.length,failed:checks.filter(c=>!c.ok)};
  }finally{
    d?.captureComposer?.dispose();if(d)d.captureComposer=null;
    await write(original);p.getNoriaLocale=locale;globalThis.__noriaRuntimeBridge=bridge;
    document.body.classList.toggle("theme-dark",wasDark);document.body.classList.toggle("theme-light",!wasDark);win.setBounds(bounds);if(max)win.maximize();
    if(d)await d.refreshDocument();
    fs.writeFileSync(dir+"/appearance-results.json",JSON.stringify({build:globalThis.__noriaRuntimeBuildId,checks,restored:await app.vault.read(file)===original},null,2));
  }
})()
