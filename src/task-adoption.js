"use strict";
const O=require("obsidian");
const D=require("./task-adoption-document.js");
const T=require("./task-document.js");
const {saveTaskEditor}=require("./task-editor-writeback.js");
const {readReviewDocument}=require("./review-document.js");

function locateOrigin(plugin,source,selection){
  const heading=plugin.getReviewFinalSectionHeading(selection.selection.mode,source);
  const review=readReviewDocument(source,[heading]),options={taskSelection:selection.taskSelection,heading:selection.heading||""};
  if(selection.editorText){
    const positions=[],normalized=[];
    for(let i=0;i<source.length;i++)if(source[i]!=="\r"){positions.push(i);normalized.push(source[i]);}
    const text=normalized.join(""),index=text.indexOf(selection.editorText);
    if(index>=0&&text.indexOf(selection.editorText,index+1)<0)options.range={start:positions[index+selection.selectionStart],end:positions[index+selection.selectionEnd]??source.length};
  }
  if(!options.range&&review.exists){
    if(selection.intent==="review")options.range={start:review.contentStart,end:review.contentEnd};
    else options.excludeRange={start:review.contentStart,end:review.contentEnd};
  }
  const found=D.locateExcerpt(source,selection.quote,options);
  return {...found,intent:review.exists&&found.start>=review.contentStart&&found.end<=review.contentEnd?"review":"record"};
}

function choose(plugin,items,placeholder,describe=item=>item.label) {
  return new Promise(resolve=>{
    class Picker extends O.FuzzySuggestModal {
      getItems(){return items;}
      getItemText(item){return describe(item);}
      renderSuggestion(match,el){
        const item=match.item;
        el.createDiv({text:item.label||describe(item)});
        if(item.detail)el.createDiv({text:item.detail,cls:"noria-task-choice-detail"});
      }
      onChooseItem(item){this.chosen=true;resolve(item);}
      onClose(){setTimeout(()=>{if(!this.chosen)resolve(null);},0);}
    }
    const picker=new Picker(plugin.app);picker.setPlaceholder(placeholder);picker.open();
  });
}
function citationPath(plugin,citation,taskPath){
  const parsed=O.parseLinktext(citation.href);
  const file=plugin.app.metadataCache.getFirstLinkpathDest(parsed.path,taskPath);
  return {path:file?.path||parsed.path,subpath:parsed.subpath};
}
async function readTaskChoices(plugin){
  const service=await plugin.createDataService();
  const result=await service.getTasks({rangePolicy:"allFacts",status:"all"});
  return (result.items||[]).filter(item=>!item.classification?.isHabit).map(item=>{
    const rawText=item.source.rawLine||item.text.raw;
    const ref={path:item.source.path,line:item.source.line,rawText,text:rawText};
    let model;try{model=T.parseTaskLine(rawText);}catch(_){return null;}
    return {...ref,label:model.title,detail:item.source.path+" · "+plugin.t("runtime.tasksCalendar.status."+model.status)};
  }).filter(Boolean);
}
async function destinations(plugin,tasks,preferredPath){
  const spec=await plugin.resolveCalendarNoteSpecAsync("daily",plugin.getLocalYmd());
  const daily={label:plugin.t("workbench.adoptionDaily"),detail:spec.path,path:spec.path,daily:true,spec};
  const service=await plugin.createDataService();
  const snapshot=await service.getSnapshot({include:["projects"]});
  const items=[daily],seen=new Set([daily.path]);
  for(const project of snapshot.domains?.projects?.items||[]){
    if(!["active","planned"].includes(project.stage))continue;
    const target=String(project.targetPath||""),parts=target.split("#");
    let paths=[...new Set(tasks.filter(t=>t.path===project.root||t.path.startsWith(project.root.replace(/\/$/,"")+"/")).map(t=>t.path))];
    if(parts[1]||!paths.length)paths=[parts[0]];
    for(const path of paths){
      if(!path||seen.has(path)||!plugin.app.vault.getAbstractFileByPath(path))continue;
      seen.add(path);items.push({label:project.name,detail:path+(parts[1]?"#"+parts[1]:""),path,heading:parts[1]||""});
    }
  }
  return {items,selected:items.find(item=>item.path===preferredPath)||daily};
}
async function linkedChoices(plugin,origin,tasks){
  const links=plugin.app.metadataCache.resolvedLinks||{},candidates=new Map();
  for(const task of tasks)if(links[task.path]?.[origin.path])candidates.set(task.path,null);
  // A just-written backlink may not have reached MetadataCache yet.
  for(const path of plugin._adoptionRecentPaths||[])candidates.set(path,null);
  const found=[];
  for(const path of candidates.keys()){
    const source=await plugin.loadTextFromVault(path);
    for(const row of D.taskRows(source)){
      const ref={path,rawText:row.text,text:row.text,line:row.line};
      if(D.citationsAfter(source,row).some(c=>{const target=citationPath(plugin,c,path);return target.path===origin.path&&target.subpath===(origin.heading?"#"+origin.heading:"")&&c.quote===origin.quote;})){
        found.push({...ref,label:T.parseTaskLine(row.text).title,detail:path});
      }
    }
  }
  return found;
}
function citationFor(plugin,origin,targetPath){
  const file=plugin.app.vault.getAbstractFileByPath(origin.path);
  if(!file)throw Error("adoption-source-changed");
  const label=origin.selection.period+" · "+plugin.t("workbench."+origin.intent);
  const link=plugin.app.fileManager.generateMarkdownLink(file,targetPath,origin.heading?"#"+origin.heading:"",label);
  return {link,quote:origin.quote,label:plugin.t("workbench.adoptionSourceLabel")};
}
function showSaved(plugin,result){
  const fragment=document.createDocumentFragment();
  fragment.appendChild(document.createTextNode(plugin.t("workbench.adoptionSaved")+" "));
  const button=document.createElement("button");button.className="noria-review-text-action";button.textContent=plugin.t("workbench.adoptionViewTask");
  fragment.appendChild(button);
  const notice=new O.Notice(fragment,7000);
  button.onclick=()=>{notice.hide();void plugin.openTaskDetails(result,{presentation:"modal"}).catch(e=>new O.Notice(e.message));};
}
function adoptionError(plugin,error){
  const key="workbench.adoptionError."+error.message,message=plugin.t(key);
  return new Error(message===key?error.message:message);
}

class TaskAdoptionActions {
  constructor({plugin,host,context,flush,afterSaved,report}){
    Object.assign(this,{plugin,host,context,flush,afterSaved,report});
    this.contextMenu=event=>{
      if(this.context()?.editor)return;
      const selection=this.capture();if(!selection)return;
      event.preventDefault();event.stopPropagation();
      const menu=new O.Menu();
      menu.addItem(item=>item.setTitle(plugin.t("workbench.copy")).setIcon("copy").onClick(()=>navigator.clipboard.writeText(selection.quote)));
      menu.addSeparator();this.addMenuItems(menu,selection);
      menu.showAtPosition({x:event.clientX,y:event.clientY},host.ownerDocument);
    };
    host.addEventListener("contextmenu",this.contextMenu);
    this.moreButtons=new Map();
    this.selectionChanged=()=>{for(const [button,always] of this.moreButtons)button.style.visibility=(always||this.capture())?"visible":"hidden";};
    host.ownerDocument.addEventListener("selectionchange",this.selectionChanged);
    this.editorMenu=plugin.app.workspace.on("editor-menu",(menu,editor)=>{
      if(this.context()?.editor?.editor!==editor)return;
      const selection=this.capture();if(selection){menu.addSeparator();this.addMenuItems(menu,selection);}
    });
    (plugin._taskAdoptionActions||(plugin._taskAdoptionActions=new Set())).add(this);
  }
  capture(){
    const context=this.context();
    if(!context||!this.host.isConnected||!this.host.checkVisibility()||context.editor?.isComposing())return null;
    let quote,anchor,heading="",taskSelection=false;
    if(context.editor){
      quote=D.visibleSource(context.editor.editor.getSelection()).text;
      const cursor=context.editor.editor.getCursor("from");
      taskSelection=/^\s*[-*+]\s+\[[^\]]\]/.test(context.editor.editor.getLine(cursor.line));
      anchor=this.host;
    }else{
      const selection=this.host.ownerDocument.getSelection();
      if(!selection?.rangeCount||selection.isCollapsed)return null;
      const range=selection.getRangeAt(0);
      if(!this.host.contains(range.startContainer)||!this.host.contains(range.endContainer))return null;
      anchor=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
      const preceding=[...this.host.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(el=>el.contains(anchor)||(el.compareDocumentPosition(anchor)&Node.DOCUMENT_POSITION_FOLLOWING));
      heading=preceding.at(-1)?.getAttribute("data-heading")||preceding.at(-1)?.textContent||"";
      taskSelection=!!anchor.closest("li.task-list-item");
      quote=selection.toString();
    }
    quote=D.compact(quote);if(!quote)return null;
    const editor=context.editor?.editor;
    return {...context,quote,anchor,heading,taskSelection,position:context.editor?.getPosition(),
      editorText:editor?.getValue(),selectionStart:editor?.posToOffset(editor.getCursor("from")),selectionEnd:editor?.posToOffset(editor.getCursor("to"))};
  }
  addMenuItems(menu,selection=this.capture()){
    if(!selection)return;
    for(const [action,key,icon] of [["create","adoptionCreate","list-plus"],["link","adoptionLink","link"]]){
      menu.addItem(item=>item.setTitle(this.plugin.t("workbench."+key)).setIcon(icon).onClick(()=>this.run(action,selection)));
    }
  }
  bindMoreButton(button,always=false){
    for(const old of this.moreButtons.keys())if(!old.isConnected)this.moreButtons.delete(old);
    this.moreButtons.set(button,always);
    button.addEventListener("pointerdown",()=>{this.menuSelection=this.capture();});
    button.addEventListener("keydown",()=>{this.menuSelection=null;});
    this.selectionChanged();
  }
  takeMenuSelection(){const selection=this.menuSelection||this.capture();this.menuSelection=null;return selection;}
  async run(action,selection=this.capture()){
    if(!selection||this.busy)return;
    this.busy=true;
    try{
      await this.flush();
      const current=this.context();
      if(!current||current.key!==selection.key||current.blocked||!this.host.checkVisibility())throw Error("adoption-source-unsaved");
      const source=await this.plugin.loadTextFromVault(selection.path);
      const located=locateOrigin(this.plugin,source,selection);
      const origin={...selection,...located};
      const scrolls=[];
      for(let el=this.host;el;el=el.parentElement)if(el.scrollHeight>el.clientHeight)scrolls.push({el,top:el.scrollTop,left:el.scrollLeft});
      const restore=()=>{
        if(this.context()?.key!==selection.key)return;
        const editor=this.context()?.editor;
        if(editor&&selection.position){editor.editor.setSelection(selection.position.anchor,selection.position.head);editor.focus();}
        else if(selection.anchor?.isConnected){selection.anchor.tabIndex=-1;selection.anchor.focus({preventScroll:true});}
        scrolls.forEach(({el,top,left})=>{if(el.isConnected){el.scrollTop=top;el.scrollLeft=left;}});
      };
      if(located.task){await this.plugin.openTaskDetails({path:origin.path,rawText:located.task.text,line:located.task.line},{anchor:selection.anchor,restoreFocus:restore});return;}
      const tasks=await readTaskChoices(this.plugin);
      const linked=await linkedChoices(this.plugin,origin,tasks);
      if(this.disposed||this.context()?.key!==origin.key||!this.host.checkVisibility())return;
      if(action==="create"&&linked.length){
        const picked=await choose(this.plugin,[...linked,{label:this.plugin.t("workbench.adoptionCreateAnother"),create:true}],this.plugin.t("workbench.adoptionAlreadyLinked"));
        if(!picked){restore();return;}
        if(this.disposed||this.context()?.key!==origin.key||!this.host.checkVisibility())return;
        if(!picked.create){await this.plugin.openTaskDetails(picked,{anchor:selection.anchor,restoreFocus:restore});return;}
      }
      if(action==="link"){
        const target=await choose(this.plugin,tasks,this.plugin.t("workbench.adoptionFindTask"),item=>item.label+" "+item.detail);
        if(!target){restore();return;}
        await this.validate(origin);
        const result=await saveTaskEditor({identity:target,patch:{},citation:citationFor(this.plugin,origin,target.path),today:this.plugin.getLocalYmd(),read:path=>this.plugin.loadTextFromVault(path),process:(path,fn)=>this.plugin.processTextAtVaultPath(path,fn)});
        await this.saved(result);restore();showSaved(this.plugin,result);return;
      }
      const choices=await destinations(this.plugin,tasks,selection.projectPath);
      if(this.disposed||this.context()?.key!==origin.key||!this.host.checkVisibility())return;
      await this.openCreate(origin,choices,restore);
    }catch(error){this.report?.(adoptionError(this.plugin,error));}
    finally{this.busy=false;}
  }
  async validate(origin){
    await this.flush();
    if(this.disposed||this.context()?.key!==origin.key||this.context()?.blocked||!this.host.checkVisibility())throw Error("adoption-source-unsaved");
    return locateOrigin(this.plugin,await this.plugin.loadTextFromVault(origin.path),origin);
  }
  async saved(result){
    (this.plugin._adoptionRecentPaths||(this.plugin._adoptionRecentPaths=new Set())).add(result.path);
    await this.afterSaved?.(result);
    this.plugin.requestNoriaRefresh("tasks","record-task-adoption");
  }
  async openCreate(origin,choices,restore){
    const plugin=this.plugin,drafts=plugin._taskAdoptionDrafts||(plugin._taskAdoptionDrafts=new Map());
    const key=origin.path+"\n"+origin.heading+"\n"+origin.quote;
    const savedDraft=drafts.get(key),id=savedDraft?.operationId||globalThis.crypto.randomUUID().replace(/-/g,"");
    let target=choices.items.find(item=>item.path===savedDraft?.targetPath)||choices.selected,savedResult=null;
    const line=T.patchTaskLine("- [ ] "+origin.quote,{id},plugin.getLocalYmd()),model=T.parseTaskLine(line);
    await plugin.ensureTaskDateTimeEditorApi();
    if(this.disposed||this.context()?.key!==origin.key||!this.host.checkVisibility())return;
    globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditorFromMarkdownLine({filePath:target.path,lineIndex:0,rawLine:line,returnFocusEl:origin.anchor,workbench:{
      create:true,model,anchor:origin.anchor,draft:savedDraft,restoreFocus:restore,
      onDraft:value=>drafts.set(key,{...value,targetPath:target.path,operationId:id}),onDiscard:()=>drafts.delete(key),
      destination:{label:()=>target.label,detail:()=>target.detail,choose:async()=>{
        const selected=await choose(plugin,choices.items,plugin.t("workbench.adoptionDestination"),item=>item.label+" "+item.detail);
        if(selected)target=selected;
      }},
      onSave:async value=>{
        try{
        if(!savedResult){
          await this.validate(origin);
          const exists=!!plugin.app.vault.getAbstractFileByPath(target.path);
          if(!target.daily&&!exists)throw Error("adoption-target-missing");
          const seed=target.daily&&!exists?await plugin.buildCalendarNoteContent(target.spec):"";
          const append=(source,raw)=>{
            if(!target.daily)return T.appendProjectTask(source,raw,target.heading);
            const text=D.appendDailyTask(source,raw,plugin.getNoriaLocale()).text;
            const row=D.findTaskById(text,id);
            if(!row)throw Error("adoption-target-missing");
            return {text,rawText:row.text,line:row.line};
          };
          savedResult=await saveTaskEditor({identity:{path:target.path},patch:value.patch,dependencies:value.dependencies,today:plugin.getLocalYmd(),createId:()=>globalThis.crypto.randomUUID().replace(/-/g,"").slice(0,8),
            create:{id,line,seed,append},citation:citationFor(plugin,origin,target.path),read:path=>plugin.loadTextFromVault(path),process:(path,fn)=>plugin.processTextAtVaultPath(path,fn)});
        }
        drafts.delete(key);
        await this.saved(savedResult);showSaved(plugin,savedResult);
        return savedResult;
        }catch(error){throw adoptionError(plugin,error);}
      }
    }});
  }
  dispose(){this.disposed=true;this.host.removeEventListener("contextmenu",this.contextMenu);this.host.ownerDocument.removeEventListener("selectionchange",this.selectionChanged);this.plugin.app.workspace.offref(this.editorMenu);this.plugin._taskAdoptionActions?.delete(this);}
}
module.exports={TaskAdoptionActions,citationPath,choose};
