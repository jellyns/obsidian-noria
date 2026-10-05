// Run in the installed NoriaTest app. Synthetic notes and clock stay isolated.
// Each group is invoked separately so a failure leaves an inspectable UI.
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("Use NoriaTest only");
  if(document.querySelector(".tc-planner-te-overlay"))throw Error("Inspect the existing task editor first");
  const p=app.plugins.plugins.noria,fs=require("fs"),root="F:/NoriaTest/_acceptance-c-adoption-20260915";
  const q={p,fs,root,checks:[],owned:new Map(),clock:p.getLocalYmd,day:"2003-02-03",week:"2003-02-10",project:"Noria/Projects/Noria 工作区/C采纳验收.md"};
  globalThis.__noriaAdoptionAcceptance=q;
  q.check=(name,ok)=>{q.checks.push({name,ok:!!ok});fs.writeFileSync(root+"/runtime-results.json",JSON.stringify(q.checks,null,2));if(!ok)throw Error(name);};
  q.wait=async(fn,label="operation")=>{const until=Date.now()+15000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error("Timed out: "+label);};
  q.raw=path=>fs.existsSync("F:/NoriaTest/"+path)?fs.readFileSync("F:/NoriaTest/"+path,"utf8"):null;
  q.seed=async(path,text)=>{if(app.vault.getAbstractFileByPath(path)||fs.existsSync("F:/NoriaTest/"+path)){if(q.raw(path)!==text)throw Error("Changed fixture; inspect before rerunning: "+path);}else{await p.ensureVaultParent(path);await app.vault.create(path,text);}q.owned.set(path,text);fs.writeFileSync(root+"/fixture-before.json",JSON.stringify([...q.owned],null,2));};
  q.show=async(mode,date,intent="record")=>{const result=await p.openDiaryInHome({selection:{mode,anchorDate:date},intent});q.leaf=result.leaf;q.w=q.leaf.view.workbench;app.workspace.setActiveLeaf(q.leaf,{focus:true});await q.wait(()=>!q.w.diary.root.inert,"diary ready");return q.w.diary;};
  q.d=()=>q.w.diary;
  q.controller=()=>q.d().intent==="review"?q.d().review.reviewWorkspace.taskAdoption:q.d().taskAdoption;
  q.overlay=()=>document.querySelector(".tc-planner-te-overlay");
  q.field=id=>q.overlay()?.querySelector("#tc-planner-te-"+id);
  q.change=(id,value)=>{const el=q.field(id);el.value=value;el.dispatchEvent(new Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));};
  q.discard=()=>q.overlay()?.querySelector(".tc-planner-te-discard").click();
  q.close=()=>q.overlay()?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  q.save=async()=>{q.overlay().querySelector(".tc-planner-te-btn--primary").click();await q.wait(()=>!q.overlay()||q.overlay().querySelector(".tc-planner-te-error").textContent,"save task");if(q.overlay())throw Error(q.overlay().querySelector(".tc-planner-te-error").textContent);};
  q.select=quote=>{
    const c=q.controller(),editor=c.context().editor?.editor;
    if(editor){const start=editor.getValue().indexOf(quote);if(start<0)throw Error("Editor text missing: "+quote);editor.setSelection(editor.offsetToPos(start),editor.offsetToPos(start+quote.length));c.context().editor.focus();}
    else{
      const walker=document.createTreeWalker(c.host,NodeFilter.SHOW_TEXT),nodes=[];let node,text="";
      while(node=walker.nextNode())if(node.parentElement.checkVisibility()){nodes.push({node,start:text.length,end:text.length+node.textContent.length});text+=node.textContent;}
      const start=text.indexOf(quote);if(start<0)throw Error("Reading text missing: "+quote);
      const a=nodes.find(n=>n.start<=start&&n.end>start),b=nodes.find(n=>n.start<start+quote.length&&n.end>=start+quote.length),range=document.createRange();
      range.setStart(a.node,start-a.start);range.setEnd(b.node,start+quote.length-b.start);document.getSelection().removeAllRanges();document.getSelection().addRange(range);a.node.parentElement.scrollIntoView({block:"center"});
    }
    const selection=c.capture();if(!selection||selection.quote!==quote)throw Error("Selection did not survive: "+quote);return selection;
  };
  q.create=async quote=>{const selection=q.select(quote);await q.controller().run("create",selection);await q.wait(q.overlay,"create editor");return selection;};
  q.pick=async text=>{await q.wait(()=>document.querySelector(".prompt-input"),"native picker");const input=document.querySelector(".prompt-input");input.value=text;input.dispatchEvent(new Event("input",{bubbles:true}));await q.wait(()=>[...document.querySelectorAll(".suggestion-item")].some(el=>el.textContent.includes(text)),"picker result");[...document.querySelectorAll(".suggestion-item")].find(el=>el.textContent.includes(text)).click();await q.wait(()=>!document.querySelector(".prompt-input"),"picker close");};
  q.task=(path,needle)=>{const lines=q.raw(path).split("\n"),line=lines.findIndex(l=>/^\s*[-*+] \[/.test(l)&&l.includes(needle));if(line<0)throw Error("Missing task: "+needle);return {path,line,rawText:lines[line],text:lines[line]};};
  const daySpec=await p.resolveCalendarNoteSpecAsync("daily",q.day),weekSpec=await p.resolveCalendarNoteSpecAsync("weekly",q.week);
  q.dayPath=daySpec.path;q.weekPath=weekSpec.path;
  await q.seed(q.dayPath,"---\ntest_fixture: task-adoption\n---\n\n## 记录\n\n整理散步照片。\n\n给下次散步留一点时间。\n\n## 待办\n\n### 今日任务\n\n- [ ] 记录中已有任务 [due:: 2003-02-05]\n\n## 复盘\n\n### 想继续的\n\n给下次散步留一点时间。\n\n### 随手一想\n\n保留这段记录，不自动变成任务。\n");
  await q.seed(q.weekPath,"---\ntest_fixture: task-adoption\n---\n\n## 周记\n\n按自己的节奏记录。\n\n## 周复盘\n\n### 想继续的\n\n下周选出六张照片。\n\n### 还想试试\n\n再去看看那座小桥。\n\n# 附记\n\n后续一级标题完整保留。\n");
  await q.seed(q.project,"---\ntest_fixture: task-adoption\n---\n\n## 任务\n\n- [ ] 关联验收原任务 [due:: 2003-02-20] #生活 ^keep\n- [x] 关联验收完成项 [completion:: 2003-02-01]\n\n# 后续\n\n保留附记和末尾空格。  \n");
  p.requestNoriaRefresh("tasks","isolated-adoption-fixtures");
  await q.show("daily",q.day);
  q.initial=async()=>{
    await q.create("整理散步照片。");
    q.check("Reading selection opens the full shared editor",!!q.field("tags")&&!!q.field("repeat")&&!!q.field("status"));
    q.check("Default destination is the actual adoption day",q.overlay().querySelector(".tc-planner-te-destination button").title.includes(q.clock.call(p)));
    q.check("Adoption does not schedule the task",["start-date","start-time","end-date","scheduled-date"].every(id=>q.field(id).value===""));
    q.change("title","选出六张散步照片");
    q.overlay().querySelector(".tc-planner-te-destination button").click();await q.pick("C采纳验收");
    q.check("Project picker resolves the existing registry link and task note",q.overlay().querySelector(".tc-planner-te-destination button").title===q.project);
    q.close();await q.create("整理散步照片。");
    q.check("Closing keeps the task input and destination",q.field("title").value==="选出六张散步照片"&&q.overlay().querySelector(".tc-planner-te-destination button").title===q.project);
    await q.save();
    q.check("Creation preserves the source record byte for byte",q.raw(q.dayPath)===q.owned.get(q.dayPath));
    const saved=q.raw(q.project);q.check("Task is stored before the next level-one heading with a readable citation",saved.includes("选出六张散步照片")&&saved.includes("2003-02-03 · 记录")&&saved.includes("> 整理散步照片。")&&saved.indexOf("选出六张散步照片")<saved.indexOf("# 后续"));
    q.check("The created task has no implicit date",!/(?:due|start|scheduled)::/.test(q.task(q.project,"选出六张").rawText));
    q.check("Saving returns to the same record",q.d().selection.period===q.day&&q.d().intent==="record"&&!q.overlay());
    const selection=q.select("整理散步照片。"),pending=q.controller().run("create",selection);
    await q.pick("选出六张散步照片");await pending;await q.wait(q.overlay);
    q.check("Repeating the operation finds the original task",!q.overlay().querySelector(".tc-planner-te-destination")&&q.field("title").value==="选出六张散步照片");q.discard();
    return {passed:q.checks.length};
  };
  q.link=async()=>{
    const selection=q.select("给下次散步留一点时间。"),pending=q.controller().run("link",selection);
    await q.pick("关联验收原任务");await pending;
    q.check("Linking preserves the existing task and metadata",q.task(q.project,"关联验收原任务").rawText==="- [ ] 关联验收原任务 [due:: 2003-02-20] #生活 ^keep");
    q.check("Record selection excludes the identical review passage",q.raw(q.project).includes("#记录|2003-02-03 · 记录"));
    q.check("Linking leaves both record and review prose intact",q.raw(q.dayPath)===q.owned.get(q.dayPath));
    await q.create("记录中已有任务");
    q.check("Selecting an existing checkbox edits its original task",q.overlay().dataset.sourcePath===q.dayPath&&q.field("end-date").value==="2003-02-05"&&!q.overlay().querySelector(".tc-planner-te-destination"));q.discard();
    return {passed:q.checks.length};
  };
  q.review=async()=>{
    await q.show("weekly",q.week,"review");await q.create("下周选出六张照片。");
    q.change("title","为游记选出六张照片");q.overlay().querySelector(".tc-planner-te-destination button").click();await q.pick("C采纳验收");await q.save();
    q.check("Custom review section is captured as the source",q.raw(q.project).includes("#想继续的|2003-W07 · 复盘")&&q.raw(q.project).includes("> 下周选出六张照片。"));
    q.check("Review adoption preserves the following level-one heading",q.raw(q.weekPath)===q.owned.get(q.weekPath));
    await q.show("daily",q.day,"record");await p.openTaskDetails(q.task(q.project,"为游记"));await q.wait(q.overlay);
    const openOrigin=p.openTaskRecordOrigin;let navigation;
    p.openTaskRecordOrigin=function(...args){navigation=openOrigin.apply(this,args);return navigation;};
    try{q.overlay().querySelector(".tc-planner-te-origin").click();if(!navigation)throw Error("Source action did not run");await navigation;}finally{p.openTaskRecordOrigin=openOrigin;}
    q.check("Back to record opens the original week and review",q.d().intent==="review"&&q.d().selection.period==="2003-W07");
    return {passed:q.checks.length};
  };
  q.editor=async()=>{
    await q.show("daily",q.day);const d=q.d();if(!d.session.editing)await d.toggleEditing();
    const editor=d.editor,before=q.raw(q.dayPath);q.select("给下次散步留一点时间。");const position=editor.getPosition();
    const selection=q.controller().capture();q.check("Native editor selection exposes the same actions",!!selection&&selection.quote==="给下次散步留一点时间。");
    p.getLocalYmd=()=>q.day;
    try{
      // A different selected passage has no prior linked task.
      q.select("保留这段记录，不自动变成任务。");await q.controller().run("create");await q.wait(q.overlay);q.change("title","试一周轻松的生活记录");await q.save();
      q.check("Same-day adoption rebases the open native editor",d.editor===editor&&!d.session.dirty&&!d.session.blocked&&editor.editor.getValue().includes("试一周轻松的生活记录"));
      q.check("The selected review passage is classified correctly in the full diary editor",q.raw(q.dayPath).includes("#随手一想|2003-02-03 · 复盘"));
      q.check("Same-file creation preserves original prose",q.raw(q.dayPath).includes("保留这段记录，不自动变成任务。")&&q.raw(q.dayPath).includes("给下次散步留一点时间。"));
      q.check("Editor remains focused after saving",d.content.contains(document.activeElement));
    }finally{p.getLocalYmd=q.clock;}
    return {passed:q.checks.length};
  };
  q.failures=async()=>{
    await q.show("weekly",q.week,"review");await q.create("再去看看那座小桥。");
    q.change("title","周末去小桥边画一张速写");q.overlay().querySelector(".tc-planner-te-destination button").click();await q.pick("C采纳验收");
    const original=p.processTextAtVaultPath,before=q.raw(q.project);
    p.processTextAtVaultPath=async(path,...args)=>{if(path===q.project)throw Error("隔离验收：模拟写入失败");return original.call(p,path,...args);};
    try{
      q.overlay().querySelector(".tc-planner-te-btn--primary").click();await q.wait(()=>q.overlay()?.querySelector(".tc-planner-te-error")?.textContent,"failure message");
      q.check("Write failure leaves source and task input intact",q.raw(q.project)===before&&q.field("title").value==="周末去小桥边画一张速写");
    }finally{p.processTextAtVaultPath=original;}
    q.close();await q.create("再去看看那座小桥。");
    q.check("Failed creation can be resumed with its chosen destination",q.field("title").value==="周末去小桥边画一张速写"&&q.overlay().querySelector(".tc-planner-te-destination button").title===q.project);
    const save=q.overlay().querySelector(".tc-planner-te-btn--primary");save.click();save.click();await q.wait(()=>!q.overlay(),"retry save");
    q.check("Repeated save creates only one task",q.raw(q.project).split("周末去小桥边画一张速写").length===2);
    // Change only this fixture's selected source text while its task editor is open.
    await q.create("再去看看那座");q.change("title","外部改写保护");
    const file=app.vault.getAbstractFileByPath(q.weekPath),reviewBefore=q.raw(q.weekPath),reviewChanged=reviewBefore.replace("再去看看那座小桥。","已改为在家画画。");
    await app.vault.modify(file,reviewChanged);
    q.overlay().querySelector(".tc-planner-te-btn--primary").click();await q.wait(()=>q.overlay()?.querySelector(".tc-planner-te-error")?.textContent,"changed passage rejection");
    q.check("Changed source passage blocks creation and retains input",q.field("title").value==="外部改写保护"&&q.raw(q.weekPath)===reviewChanged&&!q.raw(q.project).includes("外部改写保护"));
    q.discard();await app.vault.process(file,current=>{if(current!==reviewChanged)throw Error("Fixture changed again");return reviewBefore;});
    await q.show("daily",q.day);const d=q.d();if(d.session.editing)await d.toggleEditing();
    q.select("整理散步照片");const controller=q.controller(),selection=controller.capture(),needed=d.session.needsAdoption;
    d.session.needsAdoption=true;
    try{await controller.run("create",selection);q.check("Adoption does not silently accept a recovery draft",!q.overlay()&&d.session.needsAdoption&&d.feedback.textContent.includes("恢复稿"));}
    finally{d.session.needsAdoption=needed;d.feedback.empty();}
    return {passed:q.checks.length};
  };
  q.missing=async()=>{
    await q.show("daily",q.day);const d=q.d();if(!d.session.editing)await d.toggleEditing();
    const date="2003-02-16",spec=await p.resolveCalendarNoteSpecAsync("daily",date);if(q.raw(spec.path)!==null)throw Error("Missing-day fixture already exists");q.owned.set(spec.path,null);
    p.getLocalYmd=()=>date;
    try{
      q.select("整理散步");app.commands.executeCommandById("noria:create-task-from-selection");await q.wait(q.overlay);
      q.check("Selection command opens the shared editor without writing a missing day",q.raw(spec.path)===null&&q.overlay().querySelector(".tc-planner-te-destination button").title===spec.path);
      q.change("title","做一本散步小册子");await q.save();
      q.check("First task creates the configured date template",q.raw(spec.path).includes("做一本散步小册子")&&/## (记录|Notes)/.test(q.raw(spec.path)));
      q.check("New-day task keeps optional dates blank",!/(?:due|start|scheduled)::/.test(q.task(spec.path,"做一本").rawText));
    }finally{p.getLocalYmd=q.clock;}
    return {passed:q.checks.length};
  };
  q.finish=()=>{p.getLocalYmd=q.clock;fs.writeFileSync(root+"/fixture-after.json",JSON.stringify([...q.owned.keys()].map(path=>[path,q.raw(path)]),null,2));return {checks:q.checks.length,passed:q.checks.filter(c=>c.ok).length,fixtures:[...q.owned.keys()]};};
  return {ready:true,fixtures:[...q.owned.keys()]};
})()
