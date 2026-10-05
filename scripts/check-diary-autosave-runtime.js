/* Evaluate in the running NoriaTest Obsidian renderer via its CLI. */
(async () => {
  if(app.vault.getName()!=="NoriaTest")throw new Error("This acceptance requires NoriaTest");
  const fs=require("fs"),crypto=require("crypto"),p=app.plugins.plugins.noria;
  const base="F:/NoriaTest/_acceptance-diary-autosave-20260914/";
  const before=JSON.parse(fs.readFileSync(base+"before.json","utf8"));
  const baseline=new Set(before.notes.map(n=>n.path));
  const previous=window.__noriaAutosaveCheck;
  const q=window.__noriaAutosaveCheck={checks:previous?.checks||[],owned:new Set(previous?.owned||[]),base};
  q.check=(ok,name)=>{q.checks.push({name,passed:!!ok});if(!ok)throw new Error(name);};
  q.wait=async(fn)=>{const end=Date.now()+7000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error("Timed out: "+fn.toString().slice(0,150));};
  q.quiet=()=>new Promise(r=>setTimeout(r,650));
  q.claim=async(mode,date)=>{const spec=await p.resolveCalendarNoteSpecAsync(mode,date);if(baseline.has(spec.path))throw new Error("Test date overlaps an existing note");if(!q.owned.has(spec.path)&&app.vault.getAbstractFileByPath(spec.path))throw new Error("Unowned existing test note: "+spec.path);q.owned.add(spec.path);return spec;};
  q.show=async(mode,date,intent="record")=>{
    await q.claim(mode,date);await p.openDiaryInHome({period:mode,date,intent});
    q.leaf=app.workspace.getLeavesOfType("noria-dashboard-home").find(l=>l.view.workbench?.active==="diary");
    if(!q.leaf)throw new Error("Diary view did not open");q.w=q.leaf.view.workbench;
    await q.w.show("diary",{mode,anchorDate:date},intent);app.workspace.setActiveLeaf(q.leaf,{focus:true});
    await q.wait(()=>!q.d().root.inert);return q.d();
  };
  q.d=()=>q.w.diary;
  q.raw=path=>fs.existsSync("F:/NoriaTest/"+path)?fs.readFileSync("F:/NoriaTest/"+path,"utf8"):null;
  q.edit=async(text)=>{const d=q.d();if(!d.session.editing)await d.toggleEditing();d.editor.focus();d.editor.editor.setValue(text);await q.wait(()=>d.session.body===text);};
  q.saved=async()=>{await q.wait(()=>!q.d().session.dirty&&!q.d().session.savePromise);};
  q.seed=async(mode,date,text)=>{const spec=await q.claim(mode,date);await p.ensureVaultParent(spec.path);await app.vault.create(spec.path,text);return spec.path;};
  q.templates=async()=>{
    for(const [mode,date] of [["daily","2001-02-03"],["weekly","2001-02-12"],["monthly","2001-04-03"],["yearly","2002-02-03"]]){
      const d=await q.show(mode,date),path=d.session.model.path;
      q.check(!d.session.model.exists&&!!d.editor,mode+" missing date opens its template editor");
      await q.quiet();q.check(q.raw(path)===null,mode+" browsing does not create a note");
      const editor=d.editor,body=d.session.body+"\n首写验收：保留这一段。\n";
      await q.edit(body);await q.saved();q.check(q.raw(path).includes("首写验收：保留这一段。"),mode+" autosaves to its source");
      q.check(d.editor===editor&&d.session.editing,mode+" autosave keeps the editor");
      q.check(d.editor.editor.getValue()===body,mode+" autosave keeps text unchanged");
    }
    const path=await q.seed("daily","2001-02-04","");await q.show("daily","2001-02-04");
    q.check(q.d().session.body===""&&!q.d().session.dirty,"existing empty date does not refill a template");
    const fm="---\ncustom: retain\ncssclasses: [daily-clean]\n---\n";
    await q.seed("daily","2001-02-05",fm);await q.show("daily","2001-02-05");
    await q.edit("只补充正文。\n");await q.saved();q.check(q.raw(q.d().session.model.path)===fm+"只补充正文。\n","existing properties are preserved exactly");
    return {passed:q.checks.length,emptyPath:path};
  };
  q.typing=async()=>{
    const d=await q.show("daily","2001-02-03");if(!d.session.editing)await d.toggleEditing();const editor=d.editor,storeSave=d.store.save;
    let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let count=0;
    d.store.save=async(model,body)=>{if(++count===1){entered();await gate;}return storeSave.call(d.store,model,body);};
    try{
      const first=d.session.body+"\n第一段输入。",second=first+"\n保存中继续输入。";
      await q.edit(first);await started;await q.edit(second);const cursor=editor.getPosition();release();await q.saved();
      q.check(d.editor===editor,"late typing retains the same native editor");
      q.check(q.raw(d.session.model.path).includes("第一段输入。\n保存中继续输入。"),"late typing survives the earlier write");
      q.check(JSON.stringify(editor.getPosition())===JSON.stringify(cursor),"late save leaves the cursor and selection in place");
      q.check(count===2,"late typing is drained as a second source write");
    }finally{release();d.store.save=storeSave;}
    const changed=d.session.body+"\n切换日期前的最后一句。";await q.edit(changed);
    const path=d.session.model.path;await q.show("daily","2001-02-04");
    q.check(q.raw(path).includes("切换日期前的最后一句。"),"navigation flushes to the original date");
    q.check(q.raw(q.d().session.model.path)==="","navigation does not write the old text into the next date");
    return {passed:q.checks.length};
  };
  q.review=async()=>{
    const d=await q.show("daily","2001-02-06","review"),r=d.review,x=r.reviewWorkspace,path=r.state.final.model.targetPath;
    await q.quiet();q.check(q.raw(path)===null,"opening an unwritten review does not create the date");
    const editor=x.editor,text="## 复盘\n\n### 值得记住的事\n\n散步时发现一条安静的小路。\n\n### 接下来\n\n下次带相机再走一次。";
    editor.focus();editor.editor.setValue(text);await q.wait(()=>!r.state.final.dirty&&q.raw(path)?.includes("散步时"));
    q.check(x.editor===editor&&x.mode==="edit","review autosave keeps the native editor mounted");
    q.check(q.raw(path).includes("## 记录")&&q.raw(path).includes("下次带相机"),"review-first creation retains the period template");
    const oldSave=p.saveReviewFinal;let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let calls=0;
    p.saveReviewFinal=async(model,payload)=>{if(++calls===1){entered();await gate;}return oldSave.call(p,model,payload);};
    try{editor.editor.setValue(text+"\n第一句。");await started;editor.editor.setValue(text+"\n第一句。\n后续输入。");release();await q.wait(()=>!r.state.final.dirty&&!r.state.final.pendingSave);q.check(q.raw(path).includes("后续输入。"),"review retains typing during a save");}
    finally{release();p.saveReviewFinal=oldSave;}
    await x.showOverview();q.check(x.mode==="browse","review returns to reading after flushing");
    await d.setIntent("record");await q.edit(d.session.body+"\n复盘之后再写记录。\n");await q.saved();
    q.check(q.raw(path).includes("复盘之后再写记录。")&&q.raw(path).includes("后续输入。"),"record and review retain one another in the same date file");
    return {passed:q.checks.length};
  };
  q.habits=async()=>{
    const d=await q.show("daily","2001-02-07"),config={name:"验收散步",type:"boolean"};
    const session=d.session,result=await d.habitStore.write({config,date:"2001-02-07",done:true});await d.adoptOwnWrite(session,result);await d.refresh();
    q.check(q.raw(session.model.path).includes("## 记录")&&q.raw(session.model.path).includes("验收散步"),"habit-first creation uses the period template");
    await q.edit(d.session.body+"\n边写日记，边更新散步记录。\n");
    const check=d.habitHost.querySelector('input[type="checkbox"]');q.check(!!check,"the actual dated habit checkbox is available");check.click();
    await q.wait(()=>!d.session.dirty&&!d.session.savePromise&&q.raw(session.model.path).includes("- [ ] 验收散步"));
    q.check(q.raw(session.model.path).includes("边写日记"),"habit interaction preserves the current prose");
    await q.claim("daily","2001-02-08");const capture=await p.appendHomeQuickCapture({date:"2001-02-08",text:"先留下一条速记，再继续写日记。"});
    await q.show("daily","2001-02-08");q.check(q.d().session.body.includes("先留下一条速记"),"quick-capture-first content opens in the same diary");
    return {passed:q.checks.length,path:capture.path};
  };
  q.errors=async()=>{
    await q.seed("daily","2001-02-09","## 记录\n\n原文保留。\n");const d=await q.show("daily","2001-02-09"),path=d.session.model.path;
    const original=p.processTextAtVaultPath;
    p.processTextAtVaultPath=async(target,...args)=>{if(target===path)throw new Error("验收模拟保存失败");return original.call(p,target,...args);};
    try{await q.edit("## 记录\n\n保存失败也要保留输入。\n");await q.wait(()=>d.session.blocked);q.check(q.raw(path).includes("原文保留"),"failed save leaves the source unchanged");q.check(d.editor.editor.getValue().includes("保存失败也要保留"),"failed save keeps the editor input");}
    finally{p.processTextAtVaultPath=original;}
    await d.save({retry:true});q.check(q.raw(path).includes("保存失败也要保留"),"retry writes the retained input");
    await q.edit("## 记录\n\n本地冲突草稿。\n");await app.vault.modify(app.vault.getAbstractFileByPath(path),"## 记录\n\n另一个窗口修改的原文。\n");
    await q.wait(()=>d.session.blocked);q.check(q.raw(path).includes("另一个窗口"),"conflict does not overwrite the external source");
    const recovery=await p.loadReviewRecoveryEntry(d.session.model.targetKey);q.check(recovery.payload.body.includes("本地冲突草稿"),"conflict keeps a recoverable draft");
    d.sessions.delete(`${d.selection.mode}:${d.selection.period}`);await d.select(d.selection);
    q.check(d.session.model.preservedDrafts.some(x=>x.payload.body.includes("本地冲突草稿")),"reloading leaves the conflicting draft available for comparison");
    return {passed:q.checks.length};
  };
  q.keyboard=async()=>{await q.show("daily","2001-02-03");if(!q.d().session.editing)await q.d().toggleEditing();q.d().editor.focus();q.keyboardEditor=q.d().editor;q.expectedTextCount=(q.raw(q.d().session.model.path).match(/真实键盘输入验收/g)||[]).length+1;return {ready:true};};
  q.afterKeyboardText=async()=>{await q.wait(()=>(q.raw(q.d().session.model.path)?.match(/真实键盘输入验收/g)||[]).length===q.expectedTextCount);q.check(q.d().editor===q.keyboardEditor,"CDP text entry autosaves without replacing the editor");return true;};
  q.afterKeyboardToggle=async(editing)=>{await q.wait(()=>q.d().session.editing===editing);q.check(q.d().session.editing===editing,editing?"native preview shortcut returns from reading to editing":"native preview shortcut enters reading");return true;};
  q.beforeComposition=()=>{q.compositionBefore=q.raw(q.d().session.model.path);const editor=q.d().editor.editor;const lines=editor.getValue().split("\n");editor.setCursor({line:lines.length-1,ch:lines.at(-1).length});q.d().editor.focus();return true;};
  q.duringComposition=async()=>{await q.quiet();q.check(q.d().editor.isComposing(),"the actual native editor is composing");q.check(q.raw(q.d().session.model.path)===q.compositionBefore,"uncommitted IME composition is not saved");return true;};
  q.afterComposition=async()=>{await q.wait(()=>!q.d().session.dirty&&q.raw(q.d().session.model.path).includes("输入法合成验收"));q.check(!q.d().editor.isComposing(),"IME composition commits before autosave");return true;};
  q.createSource=async()=>{const d=await q.show("weekly","2001-05-07"),path=d.session.model.path;const confirm=window.confirm;window.confirm=()=>true;try{d.sourceButton.click();await q.wait(()=>!!q.raw(path)&&app.workspace.activeLeaf?.view?.file?.path===path);q.check(q.raw(path).includes("## 记录"),"source icon explicitly creates and opens the configured template");}finally{window.confirm=confirm;}return {passed:q.checks.length};};
  q.recovery=async()=>{
    for(const [intent,date] of [["record","2001-02-10"],["review","2001-02-11"]]){
      const originalText="## 记录\n\n恢复前的源文件。\n",path=await q.seed("daily",date,originalText);
      let d=await q.show("daily",date,intent);
      const method=intent==="record"?"processTextAtVaultPath":"saveReviewFinal",original=p[method];
      p[method]=async()=>{throw new Error("验收关闭前的未完成保存");};
      try{
        if(intent==="record")await q.edit("## 记录\n\n关闭前尚未保存的记录。\n");
        else d.review.reviewWorkspace.editor.editor.setValue("## 复盘\n\n关闭前尚未保存的复盘。\n");
        await q.wait(()=>intent==="record"?d.session.blocked:d.review.state.final.blocked);
        q.leaf.detach();await q.quiet();
      }finally{p[method]=original;}
      d=await q.show("daily",date,intent);await q.quiet();
      const state=intent==="record"?d.session:d.review.state.final;
      q.check(state.needsAdoption,intent+" reopens the persisted recovery for inspection");
      q.check(q.raw(path)===originalText,intent+" recovered text is not automatically written on reopen");
      const root=intent==="record"?d.actions:d.review.reviewWorkspace.layout;
      const button=[...root.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")===p.t("workbench.useDraft"));
      q.check(!!button,intent+" offers an explicit draft adoption icon");button.click();
      await q.wait(()=>!state.dirty&&q.raw(path).includes("关闭前尚未保存"));
      q.check(!state.needsAdoption,intent+" adoption resumes source saving");
    }
    return {passed:q.checks.length};
  };
  q.visual=async(v)=>{
    const leaf=app.workspace.getLeavesOfType("noria-dashboard-home")[0],w=leaf.view.workbench;
    q.appearance||={locale:p.getNoriaLocale,dark:document.body.classList.contains("theme-dark"),width:w.host.style.width,maxWidth:w.host.style.maxWidth};
    p.getNoriaLocale=()=>v.locale||"zh";
    document.body.classList.toggle("theme-dark",v.dark===true);document.body.classList.toggle("theme-light",v.dark!==true);
    w.host.style.width=v.width+"px";w.host.style.maxWidth="100%";await app.workspace.revealLeaf(leaf);
    if(v.missing)await q.claim("daily","2001-02-14");
    await w.show("diary",{mode:"daily",anchorDate:v.missing?"2001-02-14":"2026-09-14"},v.intent||"record");
    const d=w.diary,r=d.review?.reviewWorkspace;
    if(v.intent==="review"){if(v.edit)r.startEditing();else await r.showOverview();}
    else if(d.session.editing!==!!(v.edit||v.missing))await d.toggleEditing();
    await q.quiet();const panel=w.pages.get("diary").panel;panel.scrollTop=0;
    const box=w.host.getBoundingClientRect(),toolbar=v.intent==="review"?r.toolbar:d.actions;
    return JSON.stringify({name:v.name,clip:{x:box.x,y:box.y,width:Math.ceil(box.width),height:Math.min(Math.ceil(box.height),900),scale:1},width:panel.clientWidth,scrollWidth:panel.scrollWidth,
      actions:[...toolbar.querySelectorAll("button")].map(b=>({label:b.getAttribute("aria-label")||b.textContent,icon:!!b.querySelector("svg"),width:b.offsetWidth,height:b.offsetHeight})),missingFileCreated:v.missing?!!app.vault.getAbstractFileByPath(d.session.model.path):false});
  };
  q.restoreAppearance=async()=>{
    if(!q.appearance)return;const a=q.appearance,w=app.workspace.getLeavesOfType("noria-dashboard-home")[0].view.workbench;
    p.getNoriaLocale=a.locale;document.body.classList.toggle("theme-dark",a.dark);document.body.classList.toggle("theme-light",!a.dark);
    w.host.style.width=a.width;w.host.style.maxWidth=a.maxWidth;delete q.appearance;
  };
  q.finish=async()=>{
    await q.d().flush();await q.w.show("home");
    const store=await p.readReviewRecoveryStore(true);
    for(const [key,drafts] of Object.entries(store.entries||{})){const owned=drafts.filter(d=>q.owned.has(d.targetPath));if(owned.length)await p.clearReviewRecoveryEntry(key,owned);}
    for(const leaf of app.workspace.getLeavesOfType("markdown")){if(q.owned.has(leaf.view.file?.path))leaf.detach();}
    for(const path of q.owned){if(baseline.has(path))throw new Error("Cleanup rejected a baseline note");const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}
    const current=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(p.getManagedPath("diaryRoot")+"/"));
    q.check(current.length===before.notes.length,"all isolated acceptance notes were removed");
    const changed=before.notes.filter(n=>crypto.createHash("sha256").update(fs.readFileSync("F:/NoriaTest/"+n.path)).digest("hex")!==n.sha256);
    q.check(!changed.length,"all pre-existing date notes remain byte-for-byte unchanged");
    q.check(fs.readFileSync(base+"installed-before/data.json").equals(fs.readFileSync("F:/NoriaTest/.obsidian/plugins/noria/data.json")),"plugin settings remain unchanged");
    const previous=before.states.find(s=>s.id===q.leaf.id)||before.states[0];if(previous)await q.leaf.view.setState(previous.state,{});
    fs.writeFileSync(base+"runtime-results.json",JSON.stringify({checks:q.checks,ownedPaths:[...q.owned],baselineNotes:before.notes.length},null,2));
    return {passed:q.checks.length,total:q.checks.length,baselineNotes:before.notes.length};
  };
  return JSON.stringify({ready:true,cases:["templates","typing","review","habits","errors","keyboard","createSource","recovery","finish"]});
})()
