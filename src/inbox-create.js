"use strict";
const {validatePath} = require('./workspace-setup.js');

async function createInboxNote(plugin, {title, body = ''}) {
  title = String(title || '').trim();
  if (!title || /[\\/<>:"|?*\r\n]/.test(title) || /[. ]$/.test(title) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)) {
    throw Error(plugin.getNoriaLocale() === 'zh' ? '请填写有效的笔记名称，不使用路径或特殊字符。' : 'Enter a valid note name without a path or special characters.');
  }
  const root = validatePath(plugin.getManagedPath('inboxRoot'), {folder:true});
  const path = `${root}/${title}.md`;
  if (await plugin.app.vault.adapter.exists(path)) throw Error(plugin.getNoriaLocale() === 'zh' ? '已有同名笔记，请换一个名称。' : 'A note with this name exists. Choose another name.');
  await plugin.ensureVaultParent(path);
  const file = await plugin.app.vault.create(path, `## ${title}\n\n${String(body).trim()}\n`);
  plugin.requestNoriaRefresh('home', 'inbox:create-note', {immediate:true});
  return file;
}

function openInboxCreate(plugin, anchor) {
  const {Modal} = require('obsidian');
  if (plugin._inboxCreateModal) {plugin._inboxCreateModal.open();return;}
  const zh=plugin.getNoriaLocale()==='zh', draft=plugin._inboxCreateDraft||{};
  const modal=new Modal(plugin.app);plugin._inboxCreateModal=modal;
  modal.titleEl.setText(zh?'添加到收集箱':'Add to Inbox');
  modal.contentEl.addClass('noria-inbox-create');
  const form=modal.contentEl.createEl('form');
  const nameLabel=form.createEl('label',{cls:'noria-settings-field'});nameLabel.createSpan({text:zh?'笔记名称':'Note name'});
  const name=nameLabel.createEl('input',{type:'text',value:draft.title||'',attr:{required:'',placeholder:zh?'想记下什么？':'What would you like to capture?'}});
  const bodyLabel=form.createEl('label',{cls:'noria-settings-field'});bodyLabel.createSpan({text:zh?'内容 · 可选':'Content · optional'});
  const body=bodyLabel.createEl('textarea',{attr:{rows:'4'}});body.value=draft.body||'';
  const location=form.createDiv({cls:'noria-capture-location'});
  location.createSpan({text:(zh?'保存到 ':'Save to ')+plugin.getManagedPath('inboxRoot')});
  location.createEl('button',{text:zh?'更改':'Change',attr:{type:'button'}}).onclick=()=>{modal.close();plugin.openNoriaSettings('content','managedPaths.inboxRoot');};
  const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
  const actions=form.createDiv({cls:'noria-start-actions'});
  const cancel=actions.createEl('button',{text:zh?'取消':'Cancel',attr:{type:'button'}});cancel.onclick=()=>modal.close();
  const save=actions.createEl('button',{text:zh?'创建笔记':'Create note',cls:'mod-cta',attr:{type:'submit'}});
  let saving=false,created=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;saving=true;save.disabled=true;error.setText('');
    try {const file=await createInboxNote(plugin,{title:name.value,body:body.value});created=true;delete plugin._inboxCreateDraft;modal.close();await plugin.app.workspace.getLeaf(false).openFile(file);}
    catch(e){error.setText(e.message);}finally{saving=false;save.disabled=false;}
  };
  body.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
  modal.onClose=()=>{if(!created)plugin._inboxCreateDraft={title:name.value,body:body.value};delete plugin._inboxCreateModal;if(anchor?.isConnected)anchor.focus({preventScroll:true});};
  modal.open();name.focus();return modal;
}
module.exports={createInboxNote,openInboxCreate};
