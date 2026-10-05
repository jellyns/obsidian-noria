// Native final-build checks and cropped screenshots; no production vault access.
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("Use NoriaTest only");
  const p=app.plugins.plugins.noria,fs=require("fs"),remote=require("@electron/remote"),win=remote.getCurrentWindow(),root="F:/NoriaTest/_acceptance-c-adoption-20260915";
  const v={p,fs,root,checks:[],images:[],saved:{bounds:win.getBounds(),locale:p.getNoriaLocale,dark:document.body.classList.contains("theme-dark")}};
  globalThis.__noriaAdoptionVisual=v;
  v.wait=async(fn,label="view")=>{const until=Date.now()+15000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error("Timed out: "+label);};
  v.check=(name,ok)=>{v.checks.push({name,ok:!!ok});fs.writeFileSync(root+"/final-runtime-results.json",JSON.stringify(v.checks,null,2));if(!ok)throw Error(name);};
  v.show=async(mode,date,intent)=>{const opened=await p.openDiaryInHome({selection:{mode,anchorDate:date},intent});v.leaf=opened.leaf;v.w=v.leaf.view.workbench;app.workspace.setActiveLeaf(v.leaf,{focus:true});await v.wait(()=>!v.w.diary.root.inert);return v.w.diary;};
  v.controller=()=>v.w.diary.intent==="review"?v.w.diary.review.reviewWorkspace.taskAdoption:v.w.diary.taskAdoption;
  v.select=quote=>{
    const c=v.controller(),walker=document.createTreeWalker(c.host,NodeFilter.SHOW_TEXT),nodes=[];let node,text="";
    while(node=walker.nextNode())if(node.parentElement.checkVisibility()){nodes.push({node,start:text.length,end:text.length+node.textContent.length});text+=node.textContent;}
    const start=text.indexOf(quote);if(start<0)throw Error("Missing visible passage "+quote);
    const a=nodes.find(n=>n.start<=start&&n.end>start),b=nodes.find(n=>n.start<start+quote.length&&n.end>=start+quote.length),range=document.createRange();
    range.setStart(a.node,start-a.start);range.setEnd(b.node,start+quote.length-b.start);document.getSelection().removeAllRanges();document.getSelection().addRange(range);a.node.parentElement.scrollIntoView({block:"center"});
    const selection=c.capture();if(!selection)throw Error("Selection unavailable");return selection;
  };
  v.overlay=()=>document.querySelector(".tc-planner-te-overlay");
  v.discard=()=>v.overlay()?.querySelector(".tc-planner-te-discard").click();
  v.path="Noria/Projects/Noria 工作区/C采纳验收.md";
  v.nativeDateParts=async input=>{
    const debuggerApi=win.webContents.debugger,attachedHere=!debuggerApi.isAttached();
    if(attachedHere)debuggerApi.attach("1.3");
    try{
      const obj=await debuggerApi.sendCommand("Runtime.evaluate",{expression:"document.getElementById("+JSON.stringify(input.id)+")"});
      const tree=await debuggerApi.sendCommand("DOM.describeNode",{objectId:obj.result.objectId,depth:8,pierce:true});let node;
      const walk=n=>{if((n.attributes||[]).includes("-webkit-datetime-edit-year-field"))node=n;for(const child of [...(n.children||[]),...(n.shadowRoots||[])])walk(child);};walk(tree.node);
      if(!node)throw Error("Native date segments are unavailable");
      const target=await debuggerApi.sendCommand("DOM.resolveNode",{backendNodeId:node.backendNodeId});
      return (await debuggerApi.sendCommand("Runtime.callFunctionOn",{objectId:target.object.objectId,functionDeclaration:'function(){return [...this.parentElement.children].filter(el=>/datetime-edit-(year|month|day)-field/.test(el.getAttribute("pseudo")||"")).map(el=>({part:el.getAttribute("pseudo"),text:el.textContent,...el.getBoundingClientRect().toJSON()}));}',returnByValue:true})).result.value;
    }finally{if(attachedHere)debuggerApi.detach();}
  };
  v.final=async()=>{
    await v.show("daily","2003-02-03","review");const selection=v.select("给下次散步留一点时间。");
    v.check("Reading selection carries its actual custom heading",selection.heading==="想继续的");
    await v.controller().run("create",selection);await v.wait(v.overlay);
    v.check("An identical sentence in Record is not mistaken for this Review source",!!v.overlay().querySelector(".tc-planner-te-destination"));v.discard();
    await v.show("weekly","2003-02-10","review");const s=v.select("再去看看那");await v.controller().run("create",s);await v.wait(v.overlay);
    const file=app.vault.getAbstractFileByPath("Noria/Diary/2003/2003-W07.md"),before=await app.vault.cachedRead(file),changed=before.replace("再去看看那座小桥。","在家画画也不错。");
    try{
      await app.vault.modify(file,changed);v.overlay().querySelector(".tc-planner-te-btn--primary").click();await v.wait(()=>v.overlay()?.querySelector(".tc-planner-te-error")?.textContent);
      v.check("Changed source feedback is localized and the editor stays open",v.overlay().querySelector(".tc-planner-te-error").textContent.includes("原段落已经变化"));v.discard();
    }finally{await app.vault.process(file,current=>{if(current!==changed)throw Error("Fixture changed unexpectedly");return before;});}
    return v.finishNavigation();
  };
  v.finishNavigation=async()=>{
    const raw=await p.loadTextFromVault(v.path),lines=raw.split("\n"),line=lines.findIndex(l=>l.includes("周末去小桥边画一张速写")&&l.startsWith("- ["));
    await v.show("daily","2003-02-03","record");
    await p.openTaskDetails({path:v.path,line,rawText:lines[line]});await v.wait(v.overlay);
    const original=p.openTaskRecordOrigin;let navigation;
    p.openTaskRecordOrigin=function(...args){navigation=original.apply(this,args);return navigation;};
    try{v.overlay().querySelector(".tc-planner-te-origin").click();if(!navigation)throw Error("The source action did not run");await navigation;}finally{p.openTaskRecordOrigin=original;}
    v.check("Back to record changes date and focuses the cited passage",v.w.diary.selection.period==="2003-W07"&&v.w.diary.intent==="review"&&v.w.diary.review.reviewWorkspace.content.contains(document.activeElement)&&document.activeElement.textContent.includes("再去看看那座小桥"));
    const c=v.controller();v.select("再去看看");const more=[...c.moreButtons.keys()].find(el=>el.isConnected);
    await new Promise(r=>setTimeout(r,40));v.check("Selection reveals the existing ellipsis action",more&&getComputedStyle(more).visibility==="visible");
    more.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));more.click();await v.wait(()=>document.querySelector(".menu"));
    v.check("Native menu offers create and associate actions",document.querySelector(".menu").textContent.includes("从所选文字创建任务")&&document.querySelector(".menu").textContent.includes("关联到已有任务"));
    document.querySelector(".menu").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
    return {checks:v.checks.length};
  };
  v.appearance=async({width=1100,dark=false,locale="zh",kind="adoption"}={})=>{
    v.discard();p.getNoriaLocale=()=>locale;
    document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);
    win.setSize(1500,960);
    if(!v.w?.diary?.root.isConnected||v.w.diary.selection.period!=="2026-09-14"||v.w.diary.intent!=="review")await v.show("daily","2026-09-14","review");
    if(!Object.hasOwn(v.saved,"hostStyle")){v.saved.hostStyle=v.w.host.getAttribute("style")||"";v.saved.paneStyle=v.leaf.view.containerEl.getAttribute("style")||"";}
    v.w.host.style.width=width+"px";v.w.host.style.maxWidth="100%";v.leaf.view.containerEl.style.width=width+"px";v.leaf.view.containerEl.style.maxWidth="100%";
    if(kind==="adoption"){
      const selection=v.select("把出发前的准备压缩成一张小清单。");await v.controller().run("create",selection);await v.wait(v.overlay);
      const title=v.overlay().querySelector("#tc-planner-te-title");title.value=locale==="zh"?"写一张轻便的散步准备清单":"Make a light packing list for a city walk";title.dispatchEvent(new Event("input",{bubbles:true}));
    }else{
      const path="Noria/Projects/B2 城市漫步示例.md",raw=await p.loadTextFromVault(path),lines=raw.split("\n"),line=lines.findIndex(l=>l.includes("看不见的城市")&&l.startsWith("- ["));
      await p.openTaskDetails({path,line,rawText:lines[line]},{anchor:v.select("把出发前的准备").anchor});await v.wait(v.overlay);
      const title=v.overlay().querySelector("#tc-planner-te-title");title.value=locale==="zh"?"读完《看不见的城市》的一个章节":"Read a chapter of Invisible Cities";title.dispatchEvent(new Event("input",{bubbles:true}));
      const tags=v.overlay().querySelector("#tc-planner-te-tags");tags.value=locale==="zh"?"#生活 #阅读":"#life #reading";tags.dispatchEvent(new Event("input",{bubbles:true}));
    }
    const panel=v.overlay().querySelector(".tc-planner-te-panel");
    await Promise.all(panel.getAnimations().map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const rect=panel.getBoundingClientRect(),inputs=[...panel.querySelectorAll("input,textarea,select,button")].filter(el=>el.checkVisibility());
    const result={width,dark,locale,kind,panel:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},fits:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1&&panel.scrollWidth<=panel.clientWidth+1,fieldsFit:inputs.every(el=>{const r=el.getBoundingClientRect();return r.left>=rect.left-1&&r.right<=rect.right+1;}),background:getComputedStyle(panel).backgroundColor,text:getComputedStyle(panel).color};
    result.hiddenActionsAbsent=[...panel.querySelectorAll("button[hidden]")].every(el=>!el.getClientRects().length);
    result.labelsFit=[...panel.querySelectorAll(".tc-planner-te-dates > .tc-planner-te-field")].every(field=>{const label=field.querySelector(".tc-planner-te-label").getBoundingClientRect(),input=field.querySelector('input[type="date"]').getBoundingClientRect();return label.bottom<=input.top||label.right<=input.left;});
    const date=panel.querySelector("#tc-planner-te-scheduled-date"),dateRect=date.getBoundingClientRect();result.nativeDateParts=await v.nativeDateParts(date);
    result.nativeDatePartsFit=result.nativeDateParts.length===3&&result.nativeDateParts.every(part=>part.width>0&&part.left>=dateRect.left&&part.right<=dateRect.right);
    if(!result.fits||!result.fieldsFit||!result.labelsFit||!result.hiddenActionsAbsent||!result.nativeDatePartsFit||(width<500&&rect.width>width))throw Error("Native task editor has clipped controls or visible hidden actions: "+JSON.stringify(result));
    const clip={x:Math.max(0,Math.floor(rect.left-18)),y:Math.max(0,Math.floor(rect.top-18)),width:Math.min(innerWidth,Math.ceil(rect.width+36)),height:Math.min(innerHeight,Math.ceil(rect.height+36))};
    const name=kind+"-"+locale+"-"+(dark?"dark":"light")+"-"+(width<500?"narrow":"wide")+".png";
    fs.writeFileSync(root+"/"+name,(await win.webContents.capturePage(clip)).toPNG());v.images.push({...result,name});fs.writeFileSync(root+"/appearance-results.json",JSON.stringify(v.images,null,2));
    v.discard();return {...result,name};
  };
  v.restore=async()=>{v.discard();p.getNoriaLocale=v.saved.locale;document.body.classList.toggle("theme-dark",v.saved.dark);document.body.classList.toggle("theme-light",!v.saved.dark);v.w.host.setAttribute("style",v.saved.hostStyle||"");v.leaf.view.containerEl.setAttribute("style",v.saved.paneStyle||"");win.setBounds(v.saved.bounds);};
  return {ready:true};
})()
