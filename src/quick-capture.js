"use strict";
const O = require("obsidian");
const { createReviewDraftId } = require("./review-center-core.js");
const { setActionIcon } = require("./workbench-controls.js");

// The diary and global command share the same small composer and recovery store.
class QuickCaptureComposer {
  constructor({plugin, host, date, beforeSave, onSaved}) {
    this.plugin=plugin;this.date=date;this.beforeSave=beforeSave;this.onSaved=onSaved;
    this.draftId=createReviewDraftId();this.targetKey=`capture:daily:${date}`;
    this.root=host.createDiv({cls:"noria-quick-capture"});
    this.root.createDiv({cls:"noria-quick-capture-date",text:this.t("quickCaptureFor",{date})});
    this.input=this.root.createEl("textarea",{cls:"noria-quick-capture-input",attr:{rows:"3","aria-label":this.t("quickCapture"),placeholder:this.t("quickCapturePlaceholder")}});
    const footer=this.root.createDiv({cls:"noria-quick-capture-footer"});
    const modifier=O.Platform?.isMacOS?"⌘":"Ctrl";
    footer.createSpan({cls:"noria-quick-capture-hint",text:this.t(date===plugin.getLocalYmd()?"quickCaptureHint":"quickCapturePastHint",{modifier})});
    this.submit=footer.createEl("button",{cls:"clickable-icon noria-workbench-icon",attr:{type:"button"}});
    setActionIcon(this.submit,"arrow-up",this.t("quickCaptureSave"));
    this.feedback=this.root.createDiv({cls:"noria-quick-capture-status",attr:{"aria-live":"polite"}});
    this.submit.disabled=true;
    this.input.addEventListener("input",()=>{this.submit.disabled=this.busy||!this.input.value.trim();clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.preserve().catch(e=>this.report(e));},250);});
    this.input.addEventListener("keydown",event=>{
      if(event.key==="Enter" && (event.ctrlKey||event.metaKey) && !event.isComposing){event.preventDefault();void this.save();}
    });
    this.submit.addEventListener("click",()=>{void this.save();});
    this.ready=this.load();
  }
  t(key,params){return this.plugin.t("workbench."+key,params);}
  report(error){if(!this.disposed)this.feedback.setText(String(error?.message||error));}
  async load(){
    this.spec=await this.plugin.resolveCalendarNoteSpecAsync("daily",this.date);
    const saved=await this.plugin.loadReviewRecoveryEntry(this.targetKey);
    if(this.disposed)return;
    const drafts=[...(saved?.preservedDrafts||[]),saved].filter(d=>d?.targetPath===this.spec.path&&d.payload?.format==="quick-capture");
    if(drafts.length && !this.input.value){
      this.recovered=drafts[drafts.length-1];this.input.value=this.recovered.payload.body||"";
      this.feedback.setText(this.t("quickCaptureRecovered"));
      if(drafts.length>1){
        const picker=this.root.createEl("select",{attr:{"aria-label":this.t("recover")}});
        drafts.forEach((draft,index)=>picker.createEl("option",{value:String(index),text:new Date(draft.updatedAt).toLocaleString()+" · "+String(draft.payload.body||"").slice(0,40)}));
        picker.value=String(drafts.length-1);
        picker.addEventListener("change",async()=>{try{await this.preserve();this.recovered=drafts[Number(picker.value)];this.input.value=this.recovered.payload.body||"";this.submit.disabled=!this.input.value.trim();}catch(error){this.report(error);}});
      }
    }
    this.submit.disabled=!this.input.value.trim();
  }
  async preserve(){
    await this.ready;
    const body=this.input.value;
    const entry={schemaVersion:1,draftId:this.draftId,targetKey:this.targetKey,targetPath:this.spec.path,
      baseFingerprint:"quick-capture:"+this.date,payload:{format:"quick-capture",body},updatedAt:Date.now()};
    if(!body.trim())return this.plugin.clearReviewRecoveryEntry(this.targetKey,[{draftId:this.draftId},this.recovered].filter(Boolean));
    return this.plugin.queueReviewRecoveryEntry(entry,this.recovered);
  }
  async save(){
    if(this.busy||this.disposed||!this.input.value.trim())return;
    let finishSave;this.saveCompletion=new Promise(resolve=>{finishSave=resolve;});
    this.busy=true;this.input.readOnly=true;this.submit.disabled=true;clearTimeout(this.timer);
    try {
      await this.ready;
      if(this.beforeSave && await this.beforeSave()===false){this.feedback.setText(this.t("conflict"));return;}
      await this.preserve();
      const result=await this.plugin.appendHomeQuickCapture({date:this.date,target:"diary-inbox",text:this.input.value,refresh:false});
      if(!result?.ok)throw new Error(this.t("quickCaptureFailed"));
      // A later refresh/recovery failure must never leave a saved note ready to append twice.
      this.input.value="";
      try{await this.plugin.clearReviewRecoveryEntry(this.targetKey,[{draftId:this.draftId},this.recovered].filter(Boolean));}
      catch(error){this.report(error);}
      this.recovered=null;this.draftId=createReviewDraftId();
      this.feedback.setText(this.t("quickCaptureSaved"));
      try{await this.onSaved?.(result);}catch(error){this.report(error);}
      try{this.plugin.requestNoriaRefresh("home","quick-capture");this.plugin.requestNoriaRefresh("timeline","quick-capture");}catch(error){this.report(error);}
      this.input.focus();
      return result;
    } catch(error){this.report(error);}
    finally{this.busy=false;this.input.readOnly=false;this.submit.disabled=!this.input.value.trim();finishSave();}
  }
  focus(){this.input.focus();}
  dispose(){
    if(this.disposal)return this.disposal;
    clearTimeout(this.timer);this.disposed=true;this.root.remove();
    this.disposal=(async()=>{await this.saveCompletion;await this.preserve();})().catch(error=>console.warn("[noria] capture recovery",error));
    return this.disposal;
  }
}

function openQuickCapture(plugin){
  class CaptureModal extends O.Modal {
    onOpen(){this.titleEl.setText(plugin.t("workbench.quickCapture"));this.composer=new QuickCaptureComposer({plugin,host:this.contentEl,date:plugin.getLocalYmd()});void this.composer.ready.then(()=>this.composer.focus()).catch(e=>this.composer.report(e));}
    onClose(){this.composer?.dispose();}
  }
  const modal=new CaptureModal(plugin.app);modal.open();return modal;
}

// Keep MarkdownRenderer's actual links, paragraphs and lists. Only give the
// timestamp its own quiet column at the original Inbox position.
function decorateDiaryQuickNotes(prose,untimedLabel){
  const heading=[...prose.querySelectorAll("h2")].find(h=>h.textContent.trim().toLowerCase()==="inbox");
  if(!heading)return;
  for(let node=heading.nextElementSibling;node&&!/^H[1-6]$/.test(node.tagName);node=node.nextElementSibling){
    if(node.tagName!=="UL")continue;
    node.classList.add("noria-diary-quick-notes");
    const ordered=[];
    for(const li of [...node.children]){
      if(li.tagName!=="LI"||li.classList.contains("task-list-item"))continue;
      const first=li.firstElementChild?.tagName==="P"?li.firstElementChild:li;
      const text=first.firstChild,match=text?.nodeType===3?/^\[((?:[01]\d|2[0-3]):[0-5]\d)\]\s/.exec(text.textContent):null;
      if(match)text.textContent=text.textContent.slice(match[0].length);
      const body=document.createElement("div");body.className="noria-diary-quick-note-body";
      while(li.firstChild)body.appendChild(li.firstChild);
      li.appendChild(body);li.classList.add("noria-diary-quick-note");
      const time=document.createElement("time");time.className="noria-diary-quick-note-time";time.textContent=match?.[1]||"—";
      if(match)time.setAttribute("datetime",match[1]);else time.setAttribute("aria-label",untimedLabel);
      li.insertBefore(time,body);
      ordered.push({li,time:match?.[1]||"99:99",index:ordered.length});
    }
    if(ordered.length===node.children.length)ordered.sort((a,b)=>a.time.localeCompare(b.time)||a.index-b.index).forEach(({li})=>node.appendChild(li));
  }
}
module.exports={QuickCaptureComposer,openQuickCapture,decorateDiaryQuickNotes};
