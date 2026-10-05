"use strict";
const {Modal,Component,MarkdownRenderer,FuzzySuggestModal}=require('obsidian');
const {readReplyLibrary}=require('./suggestion-reply-library.js');
function openReplyLibrary(plugin){
 const t=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
 class ReplyLibrary extends Modal{
  constructor(){super(plugin.app);this.live=false;this.turn=0;this.release=()=>{};}
  onOpen(){this.live=true;this.setTitle(t('交流与草稿','Replies and drafts'));this.contentEl.addClass('noria-reply-library');void this.showList();}
  onClose(){this.live=false;this.turn++;this.release();this.contentEl.empty();}
  reset(){this.release();this.release=()=>{};this.contentEl.empty();return ++this.turn;}
  async openFile(path,status){
   const file=plugin.app.vault.getAbstractFileByPath(path);
   if(!file||file.extension!=='md'){status.setText(t('文件已不在原位置，请重新读取。','The file has moved. Reload this list.'));return;}
   try{await plugin.app.workspace.getLeaf(true).openFile(file);this.close();}catch{status.setText(t('文件暂时无法打开，请重试。','Could not open this file. Retry.'));}
  }
  async showList(){
   const turn=this.reset(),host=this.contentEl;
   const status=host.createDiv({cls:'noria-reply-library-status',text:t('正在读取…','Loading…'),attr:{role:'status'}});
   const reload=host.createEl('button',{text:t('重新读取','Reload')});reload.onclick=()=>void this.showList();
   try{
    const result=await readReplyLibrary(plugin);if(!this.live||turn!==this.turn)return;
    status.setText(result.draftError?t('本机草稿索引无法读取，原数据已保留。可重试。','The local draft index could not be read. Data is preserved; retry.'):result.items.length||result.unreadable.length?t('按原来源保留，不会自动转到另一篇日记。','Kept with the original source; never reassigned to another diary automatically.'):t('还没有交流记录或草稿。','No replies or drafts yet.'));
    const states={'available':t('来源可用','Source available'),'relocated':t('已接续来源','Source reconnected'),'missing':t('来源已移走或删除','Source moved or deleted'),'different-source':t('当前日记位置已改变','Diary location changed'),'missing-section':t('原建议已移除','Suggestions removed'),'unreadable':t('来源暂时无法读取','Source unavailable')};
    for(const item of result.items){
     const row=host.createDiv({cls:'noria-reply-library-item'});row.createEl('h3',{text:item.date});
     row.createDiv({cls:'noria-reply-library-path',text:item.path});
     const feedback=row.createDiv({cls:'noria-reply-library-status',text:states[item.sourceState],attr:{role:'status'}});
     const actions=row.createDiv({cls:'noria-reply-actions'});
     for(const record of item.conversations){const button=actions.createEl('button',{text:t(`交流 · ${record.count} 条`,`Replies · ${record.count}`)});button.onclick=()=>void this.openFile(record.path,feedback);}
     if(item.sourceState!=='missing'){const source=actions.createEl('button',{text:t('打开来源笔记','Open source note')});source.onclick=()=>void this.openFile(item.path,feedback);}
     else if(!item.draftError){const locate=actions.createEl('button',{text:t('定位来源','Locate source')});locate.onclick=()=>this.chooseSource(item);}
     if(item.draftError)row.createDiv({text:t('这份草稿暂时无法读取，原数据已保留。','This draft could not be read. Its data is preserved.')});
     if(item.draft){
      const details=row.createEl('details',{cls:'noria-reply-library-draft'});details.createEl('summary',{text:t('本机草稿','Draft on this device')});
      const text=details.createEl('textarea',{attr:{readonly:'',rows:'4','aria-label':t('草稿内容','Draft text')}});text.value=item.draft.markdown;
      const draftActions=details.createDiv({cls:'noria-reply-actions'}),copy=draftActions.createEl('button',{text:t('复制草稿','Copy draft')});
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);feedback.setText(t('已复制，原草稿仍保留。','Copied. The original draft is retained.'));}catch{text.focus();text.select();feedback.setText(t('未能自动复制，已选中草稿，请手动复制。','Could not copy automatically. Draft selected; copy it manually.'));}};
      if(['available','relocated'].includes(item.sourceState)){const resume=draftActions.createEl('button',{text:t('继续填写','Continue draft'),cls:'mod-cta'});resume.onclick=()=>void this.resume(item);}
     }
    }
    for(const path of result.unreadable){const row=host.createDiv({cls:'noria-reply-library-item'});row.createDiv({cls:'noria-reply-library-path',text:path});const feedback=row.createDiv({text:t('记录格式无法读取，文件未修改。','Could not read this record. The file was not changed.')});const open=row.createEl('button',{text:t('打开文件','Open file')});open.onclick=()=>void this.openFile(path,feedback);}
   }catch{if(this.live&&turn===this.turn)status.setText(t('暂时无法读取，请重试。','Could not load replies. Retry.'));}
  }
  chooseSource(item){
   const owner=this,turn=this.turn;
   class SourcePicker extends FuzzySuggestModal{
    getItems(){return plugin.app.vault.getMarkdownFiles().filter(f=>f.path!==item.path);}
    getItemText(file){return file.path;}
    onChooseItem(file){if(owner.live&&owner.turn===turn)void owner.previewSource(item,file.path);}
   }
   const picker=new SourcePicker(plugin.app);picker.setPlaceholder(t('选择移动后的笔记…','Choose the moved note…'));picker.open();
  }
  async previewSource(item,path){
   const turn=this.reset(),host=this.contentEl;
   host.createEl('h3',{text:t('确认新的来源','Confirm the new source')});
   host.createDiv({cls:'noria-reply-library-path',text:item.path+' → '+path});
   const status=host.createDiv({cls:'noria-reply-library-status',text:t('正在读取建议…','Loading suggestions…'),attr:{role:'status'}});
   const body=host.createDiv({cls:'markdown-rendered noria-reply-source-preview'});
   const actions=host.createDiv({cls:'noria-reply-actions'}),back=actions.createEl('button',{text:t('返回列表','Back to list')}),choose=actions.createEl('button',{text:t('重新选择','Choose another')});
   back.onclick=()=>void this.showList();choose.onclick=()=>this.chooseSource(item);
   const explain=error=>{
    const messages={
     'The original source is available again':t('原笔记已恢复，请返回列表继续。','The original note is available again. Return to the list.'),
     'The selected note has no Suggestions section':t('这篇笔记没有“建议”章节，请选择对应的来源笔记。','This note has no Suggestions section. Choose the source note.'),
     'A conversation already uses the destination':t('这篇笔记已有另一份交流，请选择其他来源。','This note already has a conversation. Choose another source.'),
     'A destination draft was preserved':t('这篇笔记已有草稿，已保留两边的内容。请先在列表中查看。','This note has a draft. Both are retained; review them in the list.'),
     'The preview changed; review the source again':t('预览后内容发生变化，请重新选择并核对。','Content changed after this preview. Select and review it again.')
    };
    return messages[error.message]||t('未能完成关联，请返回列表查看当前来源与草稿，再重试。','Could not finish linking. Review current sources and drafts in the list, then retry.');
   };
   try{
    const coordinator=require('./suggestion-reply-lifecycle.js').replyCoordinator(plugin),preview=await coordinator.previewRelink(item,path);
    if(!this.live||turn!==this.turn)return;
    status.setText(t(`${item.date} · ${preview.count} 条交流${preview.draft?'和本机草稿':''}将接续到此来源。旧回复与新笔记正文保持原样。`,`${item.date} · ${preview.count} replies${preview.draft?' and the local draft':''} will use this source. Past replies and the selected note stay unchanged.`));
    const component=new Component();component.load();this.release=()=>component.unload();
    await MarkdownRenderer.render(plugin.app,preview.target.markdown||t('此建议章节暂无内容。','This Suggestions section is empty.'),body,path,component);
    if(!this.live||turn!==this.turn)return;
    const confirm=actions.createEl('button',{text:t('确认关联','Link this source'),cls:'mod-cta'});
    confirm.onclick=async()=>{
     confirm.disabled=back.disabled=choose.disabled=true;status.setText(t('正在关联…','Linking…'));
     try{await coordinator.relink(preview);if(this.live&&turn===this.turn)await this.showList();}
     catch(error){if(this.live&&turn===this.turn){status.setText(explain(error));back.disabled=choose.disabled=false;}}
    };
   }catch(error){if(this.live&&turn===this.turn)status.setText(explain(error));}
  }
  async resume(item){
   const turn=this.reset(),host=this.contentEl,back=host.createEl('button',{text:t('返回列表','Back to list')});back.onclick=()=>void this.showList();
   const status=host.createDiv({attr:{role:'status'}});
   try{
    const source=(await plugin.api.suggestionReplies.read({date:item.date,sourcePath:item.path})).source;if(!this.live||turn!==this.turn)return;
    if(source.path!==item.path||!source.exists){status.setText(t('来源已变化，请返回列表。草稿仍保留。','The source changed. Return to the list; your draft is retained.'));return;}
    host.createEl('h3',{text:item.date});const body=host.createDiv({cls:'markdown-rendered'}),component=new Component();component.load();this.release=()=>component.unload();
    await MarkdownRenderer.render(plugin.app,source.markdown,body,source.path,component);if(!this.live||turn!==this.turn)return;
    const cleanup=await require('./suggestion-reply-ui.js').renderSuggestionReplies(plugin,host,{...source,heading:'建议'});
    if(!this.live||turn!==this.turn)cleanup();else this.release=()=>{cleanup();component.unload();};
   }catch{if(this.live&&turn===this.turn)status.setText(t('暂时无法打开，请返回列表重试。','Could not open this draft. Return to the list and retry.'));}
  }
 }
 const modal=new ReplyLibrary();modal.open();return modal;
}
module.exports={openReplyLibrary};
