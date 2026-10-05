"use strict";
const {Notice} = require('obsidian');
const {recordPopover} = require('./record-popover.js');
const {lookupMedia} = require('./media-lookup.js');
const {createMedia} = require('./media-intake.js');

function mediaIntake(plugin, anchor, {root, draft, onCreated, openSource, onClose}) {
  draft.version = Symbol();
  const clearDraft = version => { if (draft.version === version) { draft.title = ''; draft.filename = ''; delete draft.metadata; delete draft.separate; } };
  const text = (zh, en) => plugin.getNoriaLocale() === 'zh' ? zh : en;
  return recordPopover(anchor, text('添加作品', 'Add a work'), (host, close) => {
    host.addClass('noria-media-editor');
    const form = host.createEl('form');
    const field = (label, tag = 'input', attr = {}) => {
      const row = form.createEl('label', {cls: 'noria-card-field'}); row.createSpan({text: label});
      return row.createEl(tag, {attr: {'aria-label': label, ...attr}});
    };
    const title = field(text('名称', 'Title'), 'input', {type: 'text', required: ''}); title.value = draft.title;
    title.placeholder = text('名称、ISBN 或 Open Library 链接', 'Title, ISBN or Open Library link');
    const searchActions = form.createDiv({cls:'noria-media-search'});
    const find = searchActions.createEl('button',{text:text('查找资料','Find details'),attr:{type:'button'}});
    const lookupStatus = form.createDiv({cls:'noria-card-secondary',attr:{role:'status'}});
    const candidates = form.createDiv({cls:'noria-media-matches'});
    const kind = field(text('类型', 'Type'), 'select');
    for (const [value, label] of [['book', text('书籍', 'Book')], ['movie', text('影视', 'Film & TV')], ['game', text('游戏', 'Game')]]) kind.createEl('option', {value, text: label});
    kind.value = draft.kind;
    const listId = `noria-media-folders-${crypto.randomUUID()}`;
    const folder = field(text('保存到', 'Save in'), 'input', {type: 'text', required: '', list: listId}); folder.value = draft.folder;
    const folders = form.createEl('datalist', {attr: {id: listId}});
    for (const file of plugin.app.vault.getAllLoadedFiles()) if (file.children && (file.path === root || file.path.startsWith(root + '/'))) folders.createEl('option', {value: file.path});
    const filename = field(text('文件名', 'Filename'), 'input', {type: 'text'}); filename.value = draft.filename || ''; filename.parentElement.hidden = !draft.filename;
    const metadata = form.createEl('details', {cls:'noria-media-details'});
    const metadataSummary=metadata.createEl('summary',{text:text('作品资料','Work details')});
    const metadataInputs = {};
    for(const [key,zh,en] of [['isbn','ISBN','ISBN'],['author','作者','Author'],['publisher','出版社','Publisher'],['publish','出版日期','Published'],['pagecount','总页数','Pages'],['source','来源链接','Source URL'],['cover','封面链接','Cover URL']]) {
      const row=metadata.createEl('label',{cls:'noria-card-field'});row.createSpan({text:text(zh,en)});
      const input=row.createEl('input',{attr:{'aria-label':text(zh,en),type:key==='pagecount'?'number':'text',...(key==='pagecount'?{min:'1',step:'1'}:{})}});
      metadataInputs[key]=input;
      input.addEventListener('input',()=>{draft.version=Symbol();draft.metadata ||= {};const value=input.value.trim();if(value)draft.metadata[key]=key==='pagecount'?Number(value):['isbn','author','publisher'].includes(key)?value.split('；').map(x=>x.trim()).filter(Boolean):value;else delete draft.metadata[key];});
    }
    const clearMetadata=()=>{delete draft.metadata;metadata.hidden=true;};
    const removeMetadata=metadata.createEl('button',{text:text('不使用这些资料','Remove these details'),attr:{type:'button'}});removeMetadata.onclick=()=>{draft.version=Symbol();clearMetadata();};
    const renderMetadata=()=>{metadata.hidden=!draft.metadata;metadataSummary.setText([text('作品资料','Work details'),[draft.metadata?.publisher].flat().filter(Boolean).join('、'),draft.metadata?.pagecount?text(`${draft.metadata.pagecount} 页`,`${draft.metadata.pagecount} pages`):''].filter(Boolean).join(' · '));for(const [key,input] of Object.entries(metadataInputs))input.value=Array.isArray(draft.metadata?.[key])?draft.metadata[key].join('；'):draft.metadata?.[key]??'';};renderMetadata();
    const matches = form.createDiv({cls: 'noria-media-matches'});
    const error = form.createDiv({cls: 'noria-card-error', attr: {role: 'alert'}});
    const actions = form.createDiv({cls: 'noria-record-actions'});
    const cancel = actions.createEl('button', {text: text('取消', 'Cancel'), attr: {type: 'button'}}); cancel.onclick = () => close();
    const save = actions.createEl('button', {cls: 'mod-cta', text: text('添加', 'Add'), attr: {type: 'submit'}});
    let busy = false, lookupSerial = 0;
    const invalidateLookup=()=>{lookupSerial++;find.disabled=false;lookupStatus.setText('');candidates.empty();};
    const choose = item => {
      invalidateLookup();draft.version=Symbol();title.value=draft.title=item.title;
      draft.metadata={source:item.source.url};
      for(const key of ['isbn','publish','pagecount','cover'])if(item[key] && (!Array.isArray(item[key])||item[key].length))draft.metadata[key]=item[key];
      if(item.publishers?.length)draft.metadata.publisher=item.publishers;
      draft.separate=false;renderMetadata();metadata.open=false;metadataSummary.focus();
    };
    const search = async (query, offset=0, append=false) => {
      if(busy || !query.trim())return;
      const serial=++lookupSerial;find.disabled=true;lookupStatus.setText(text('正在查询…','Searching…'));if(!append)candidates.empty();
      try {
        const result=await lookupMedia(plugin,{kind:'book',query,offset,limit:5});
        if(!host.isConnected||serial!==lookupSerial||busy)return;
        lookupStatus.setText(result.candidates.length?text('选择作品或版本','Choose a work or edition'):text('没有找到，可直接填写名称后添加。','No matches. You can still add a title manually.'));
        for(const item of result.candidates){
          const button=candidates.createEl('button',{cls:'noria-media-match',attr:{type:'button'}});
          button.createEl('strong',{text:item.title});
          const detail=item.level==='work'?[...(item.contributors||[]).slice(0,2),item.editionCount?text(`${item.editionCount} 个版本`,`${item.editionCount} editions`):'']:[...(item.publishers||[]),item.publish,...(item.languages||[]),item.pagecount?text(`${item.pagecount} 页`,`${item.pagecount} pages`):'',item.isbn?.[0]];
          button.createSpan({cls:'noria-card-secondary',text:detail.filter(Boolean).join(' · ')});
          button.onclick=()=>{if(busy)return;item.level==='work'?search(item.source.url):choose(item);};
        }
        if(result.nextOffset!==null){const more=candidates.createEl('button',{text:text('更多版本或作品','More results'),attr:{type:'button'}});more.onclick=()=>{more.remove();search(query,result.nextOffset,true);};}
      }catch(e){if(host.isConnected&&serial===lookupSerial)lookupStatus.setText(e.code==='rate-limited'?text('来源暂时限流，可稍后再查或手动填写。','The source is rate-limited. Try later or enter details manually.'):text('暂时无法查询，可重试或手动填写。','Unable to search. Retry or enter details manually.'));}
      finally{if(host.isConnected&&serial===lookupSerial)find.disabled=false;}
    };
    find.onclick=()=>search(title.value.trim());find.hidden=kind.value!=='book';
    const remember = () => { draft.version = Symbol(); draft.title = title.value; draft.kind = kind.value; draft.folder = folder.value; draft.filename = filename.value; matches.empty(); error.setText(''); };
    for (const input of [title, kind, folder, filename]) input.addEventListener(input === kind ? 'change' : 'input', () => {remember();if(input===title||input===kind){invalidateLookup();draft.separate=false;}if(input===kind){find.hidden=kind.value!=='book';if(kind.value!=='book')clearMetadata();}});
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      const destination = plugin.normalizePath(folder.value.trim()).replace(/\/$/, '');
      if (destination !== root && !destination.startsWith(root + '/')) { error.setText(text('请选择作品目录或其子目录。', 'Choose the media folder or one of its subfolders.')); return; }
      const version = draft.version;
      let focusAfter;
      const request = {folder: destination, searchFolder: root, title: title.value.trim(), kind: kind.value};
      if (filename.value.trim()) request.filename = filename.value.trim();
      if(draft.metadata)request.metadata=JSON.parse(JSON.stringify(draft.metadata));
      if(draft.separate)request.separate=true;
      invalidateLookup();
      busy = true; for (const input of [title, kind, folder, filename, find, ...Object.values(metadataInputs), removeMetadata, save, cancel]) input.disabled = true; error.setText(''); matches.empty();
      try {
        const result = await createMedia(plugin, request);
        if (result.created) {
          const reveal = host.isConnected;
          clearDraft(version);
          close(); onCreated(result, reveal);
          if (!reveal) new Notice(text(`已收录 ${result.title}`, `Added ${result.title}`));
        } else if (host.isConnected) {
          matches.createDiv({cls: 'noria-card-secondary', text: text('已有同名作品', 'Matching works already exist')});
          for (const item of result.matches) {
            const button = matches.createEl('button', {cls: 'noria-media-match', attr: {type: 'button'}});
            button.createEl('strong', {text: item.title}); button.createSpan({cls: 'noria-card-secondary', text: item.path});
            button.onclick = () => { const openingVersion = draft.version; Promise.resolve().then(() => openSource(item.path)).then(() => { clearDraft(openingVersion); close(); }).catch(e => { if (host.isConnected) error.setText(e.message); else new Notice(e.message); }); };
          }
          if(result.matches.every(item=>item.reason!=='identity')) {
            const separate=matches.createEl('button',{text:text('另存一个版本','Add a separate edition'),attr:{type:'button'}});
            separate.onclick=()=>{draft.version=Symbol();draft.separate=true;filename.parentElement.hidden=false;filename.focus();separate.remove();};
          }
          matches.querySelector('button')?.focus();
        } else new Notice(text('已有同名作品；重新打开添加入口可选择原记录。', 'Matching works exist. Reopen Add to choose the original.'));
      } catch (e) {
        if (host.isConnected) {
          error.setText(e.code === 'not-found' ? text('目录不存在，请选择已有目录。', 'Folder not found. Choose an existing folder.') : e.code === 'conflict' ? text('文件名已被占用，请换一个文件名或打开原笔记。', 'The filename is taken. Choose another filename or open the original note.') : e.message);
          if (e.code === 'conflict') { filename.parentElement.hidden = false; focusAfter = filename; }
        } else new Notice(e.message);
      } finally { busy = false; for (const input of [title, kind, folder, filename, find, ...Object.values(metadataInputs), removeMetadata, save, cancel]) input.disabled = false; if (host.isConnected) focusAfter?.focus(); }
    };
  }, {onClose});
}
module.exports = {mediaIntake};
