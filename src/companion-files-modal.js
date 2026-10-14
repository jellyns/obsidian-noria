"use strict";
const {Modal}=require("obsidian");
const files=require("./companion-files.js");
class CompanionFilesModal extends Modal{
  constructor(plugin){super(plugin.app);this.plugin=plugin;this.busy=false;this.message="";}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  onOpen(){this.modalEl.addClass("noria-companion-modal");this.setTitle(this.text("配套文件","Companion files"));void this.refresh();}
  async refresh(){
    try{
      const results=await files.syncUnchanged(this.plugin);
      this.plugin._companionSyncError=results.filter(r=>r.error).map(r=>r.error).join("\n");
      this.items=await files.preview(this.plugin);this.render();
    }catch(e){this.contentEl.empty();this.showError(e);const retry=this.contentEl.createEl("button",{text:this.text("重试","Retry")});retry.onclick=()=>this.refresh();}
  }
  showError(error){this.contentEl.createDiv({cls:"noria-card-error",text:error.message,attr:{role:"alert"}});}
  async run(action,message){
    if(this.busy)return;this.busy=true;this.contentEl.querySelectorAll("button").forEach(el=>el.disabled=true);
    try{await action();this.message=message;await this.refresh();}
    catch(e){this.message="";await this.refresh();this.showError(e);}
    finally{this.busy=false;}
  }
  button(host,label,action,message){const button=host.createEl("button",{text:label});button.onclick=()=>this.run(action,message);return button;}
  render(){
    const host=this.contentEl;host.empty();
    host.createEl("p",{cls:"setting-item-description",text:this.text("默认文件自动更新，你修改过的内容照常保留。这里的操作都是可选的。","Default files update automatically. Your edits are kept. Actions here are optional.")});
    if(this.message)host.createDiv({cls:"noria-companion-receipt",text:this.message,attr:{role:"status"}});
    if(this.plugin._companionSyncError)this.showError(Error(this.plugin._companionSyncError));
    for(const item of this.items){
      const row=host.createDiv({cls:"noria-companion-item"}),head=row.createDiv({cls:"noria-companion-heading"});
      head.createEl("strong",{text:this.text("Inbox 队列","Inbox queue")});
      const preserved=item.keep||["custom","unknown"].includes(item.status);
      head.createSpan({text:preserved?this.text("保留你的版本","Your version is kept"):item.status==="missing"?this.text("尚未创建","Not present"):item.status==="safe"?this.text("待更新","Update pending"):this.text("已是最新","Up to date"),cls:"setting-item-description"});
      row.createDiv({text:item.path,cls:"noria-companion-path"});
      if(item.status!=="current"){
        const details=row.createEl("details");details.createEl("summary",{text:this.text("查看变化","See changes")});
        const diff=files.changedBlock(item.before,item.content),columns=details.createDiv({cls:"noria-companion-diff"});
        for(const [title,content] of [[this.text("当前内容","Current"),diff.before],[this.text("新版内容","New version"),diff.after]]){const col=columns.createDiv();col.createEl("h4",{text:title});col.createEl("pre",{text:content||this.text("（空）","(empty)")});}
        row.createEl("p",{cls:"setting-item-description",text:item.status==="missing"?this.text("删除过的文件不会自动重建。","Deleted files are not recreated automatically."):this.text("采用新版会替换此文件，原内容会备份。","Using the new version replaces this file and backs up the original.")});
      }
      const actions=row.createDiv({cls:"noria-companion-actions"});
      if(preserved&&!item.keep)this.button(actions,this.text("保留我的版本","Keep my version"),()=>files.keepCurrent(this.plugin,item),this.text("已保留，后续更新也不会覆盖。","Kept. Future updates will not overwrite it."));
      if(item.status!=="current"||item.keep)this.button(actions,item.status==="missing"?this.text("创建文件","Create file"):item.status==="current"?this.text("恢复自动更新","Resume automatic updates"):this.text("采用新版","Use new version"),()=>files.apply(this.plugin,item,{replaceCustom:true}),this.text("已更新，可在这里恢复原内容。","Updated. You can restore the original here."));
      if(item.canRestore)this.button(actions,this.text("恢复上次更新前的内容","Restore previous version"),()=>files.restore(this.plugin,item),this.text("已恢复并保留，不会再次自动覆盖。","Restored and kept. It will not be overwritten automatically."));
      if(item.backup){const backup=row.createEl("details");backup.createEl("summary",{text:this.text("备份详情","Backup details")});backup.createDiv({text:item.backup,cls:"noria-companion-path"});if(!item.canRestore)backup.createEl("p",{cls:"setting-item-description",text:this.text("当前文件已有后续变化，自动恢复已停用，备份仍保留。","The file has changed since the update. Automatic restore is disabled; the backup is still available.")});}
    }
    const footer=host.createDiv({cls:"noria-card-form-footer"});const retry=footer.createEl("button",{text:this.text("重新查看","Refresh")});retry.onclick=()=>this.refresh();
  }
}
module.exports={CompanionFilesModal};
