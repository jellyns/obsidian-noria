// Prepare native screenshots in NoriaTest; all appearance changes stay in memory.
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw new Error("Use NoriaTest");
  const p=app.plugins.plugins.noria,leaf=app.workspace.getLeavesOfType("noria-dashboard-home")[0];
  await app.workspace.revealLeaf(leaf);p.activateWorkspaceLeaf(leaf);
  const w=leaf.view.workbench,fs=require("fs"),root="F:/NoriaTest/_acceptance-c-tasks-20260914";
  const pane=leaf.view.containerEl;
  const saved={locale:p.getNoriaLocale,dark:document.body.classList.contains("theme-dark"),width:w.host.style.width,maxWidth:w.host.style.maxWidth,paneWidth:pane.style.width,paneMaxWidth:pane.style.maxWidth};
  const report=[];
  const wait=async fn=>{const end=Date.now()+60000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error("Appearance not ready");};
  const close=()=>document.querySelectorAll(".tc-planner-te-overlay--workbench").forEach(e=>e.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  const show=async({width=1040,dark=false,locale="zh-CN"}={})=>{
    close();p.getNoriaLocale=()=>/^zh/.test(locale)?"zh":"en";
    p.activateWorkspaceLeaf(leaf);
    document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);
    w.host.style.width=width+"px";w.host.style.maxWidth="100%";
    pane.style.width=width+"px";pane.style.maxWidth="100%";
    await w.show("diary",p.resolveReviewSelection({mode:"daily",anchorDate:"2026-09-14"}),"record");
    const d=w.diary;d.session.taskExpanded=true;d.renderToolbar();d.renderActions();await d.refreshTasks();
    p.activateWorkspaceLeaf(leaf);
    const title=[...d.taskHost.parentElement.querySelectorAll(".noria-diary-task-title")].find(e=>e.textContent.includes("看不见的城市")&&e.getBoundingClientRect().width>0);
    if(!title)throw new Error("Expected existing isolated example task");
    await wait(()=>title.getBoundingClientRect().width>0);
    title.scrollIntoView({block:"center"});title.click();
    await wait(()=>document.querySelector(".tc-planner-te-overlay--workbench"));
    const panel=document.querySelector(".tc-planner-te-panel--workbench");
    await wait(()=>panel.getBoundingClientRect().width>0);
    await Promise.all(panel.getAnimations().map(animation=>animation.finished.catch(()=>{})));
    const rect=panel.getBoundingClientRect(),host=w.host.getBoundingClientRect();
    const checks={width,dark,locale,panelWidth:rect.width,panelScroll:panel.scrollWidth,
      fits:rect.left>=host.left&&rect.right<=host.right&&rect.top>=0&&rect.bottom<=innerHeight,
      fieldsFit:[...panel.querySelectorAll("input")].every(e=>e.getBoundingClientRect().right<=rect.right+1),
      themeBackground:getComputedStyle(panel).backgroundColor,themeText:getComputedStyle(panel).color};
    report.push(checks);fs.writeFileSync(root+"/appearance-results.json",JSON.stringify(report,null,2));
    if(!checks.fits||!checks.fieldsFit||panel.scrollWidth>panel.clientWidth+1)throw new Error("Task editor overflows");
    const x=Math.max(host.x,rect.x-28),y=Math.max(host.y,rect.y-28);
    const clip={x:Math.floor(x),y:Math.floor(y),width:Math.floor(Math.min(host.right,rect.right+28)-x),height:Math.floor(Math.min(host.bottom,rect.bottom+28)-y)};
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const capture=await require("electron").remote.getCurrentWindow().webContents.capturePage(clip);
    const name=(locale==="en"?"en":"zh")+"-"+(dark?"dark":"light")+"-"+(width<500?"narrow":"wide")+".png";
    fs.writeFileSync(root+"/"+name,capture.toPNG());
    return {...checks,clip,image:name};
  };
  const restore=async()=>{close();p.getNoriaLocale=saved.locale;document.body.classList.toggle("theme-dark",saved.dark);document.body.classList.toggle("theme-light",!saved.dark);w.host.style.width=saved.width;w.host.style.maxWidth=saved.maxWidth;pane.style.width=saved.paneWidth;pane.style.maxWidth=saved.paneMaxWidth;await w.refresh();};
  window.__noriaCA={show,restore,report,w,saved};return {ready:true};
})()
