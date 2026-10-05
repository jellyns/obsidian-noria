"use strict";
const {Notice} = require('obsidian');
const {recordPopover} = require('./record-popover.js');
const {createMedia} = require('./media-intake.js');

function mediaIntake(plugin, anchor, {root, draft, onCreated, openSource, onClose}) {
  draft.version = Symbol();
  const clearDraft = version => { if (draft.version === version) { draft.title = ''; draft.filename = ''; } };
  const text = (zh, en) => plugin.getNoriaLocale() === 'zh' ? zh : en;
  return recordPopover(anchor, text('添加作品', 'Add a work'), (host, close) => {
    host.addClass('noria-media-editor');
    const form = host.createEl('form');
    const field = (label, tag = 'input', attr = {}) => {
      const row = form.createEl('label', {cls: 'noria-card-field'}); row.createSpan({text: label});
      return row.createEl(tag, {attr: {'aria-label': label, ...attr}});
    };
    const title = field(text('名称', 'Title'), 'input', {type: 'text', required: ''}); title.value = draft.title;
    const kind = field(text('类型', 'Type'), 'select');
    for (const [value, label] of [['book', text('书籍', 'Book')], ['movie', text('影视', 'Film & TV')], ['game', text('游戏', 'Game')]]) kind.createEl('option', {value, text: label});
    kind.value = draft.kind;
    const listId = `noria-media-folders-${crypto.randomUUID()}`;
    const folder = field(text('保存到', 'Save in'), 'input', {type: 'text', required: '', list: listId}); folder.value = draft.folder;
    const folders = form.createEl('datalist', {attr: {id: listId}});
    for (const file of plugin.app.vault.getAllLoadedFiles()) if (file.children && (file.path === root || file.path.startsWith(root + '/'))) folders.createEl('option', {value: file.path});
    const filename = field(text('文件名', 'Filename'), 'input', {type: 'text'}); filename.value = draft.filename || ''; filename.parentElement.hidden = !draft.filename;
    const matches = form.createDiv({cls: 'noria-media-matches'});
    const error = form.createDiv({cls: 'noria-card-error', attr: {role: 'alert'}});
    const actions = form.createDiv({cls: 'noria-record-actions'});
    const cancel = actions.createEl('button', {text: text('取消', 'Cancel'), attr: {type: 'button'}}); cancel.onclick = () => close();
    const save = actions.createEl('button', {cls: 'mod-cta', text: text('添加', 'Add'), attr: {type: 'submit'}});
    let busy = false;
    const remember = () => { draft.version = Symbol(); draft.title = title.value; draft.kind = kind.value; draft.folder = folder.value; draft.filename = filename.value; matches.empty(); error.setText(''); };
    for (const input of [title, kind, folder, filename]) input.addEventListener(input === kind ? 'change' : 'input', remember);
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      const destination = plugin.normalizePath(folder.value.trim()).replace(/\/$/, '');
      if (destination !== root && !destination.startsWith(root + '/')) { error.setText(text('请选择作品目录或其子目录。', 'Choose the media folder or one of its subfolders.')); return; }
      const version = draft.version;
      let focusAfter;
      const request = {folder: destination, searchFolder: root, title: title.value.trim(), kind: kind.value};
      if (filename.value.trim()) request.filename = filename.value.trim();
      busy = true; for (const input of [title, kind, folder, filename, save, cancel]) input.disabled = true; error.setText(''); matches.empty();
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
          matches.querySelector('button')?.focus();
        } else new Notice(text('已有同名作品；重新打开添加入口可选择原记录。', 'Matching works exist. Reopen Add to choose the original.'));
      } catch (e) {
        if (host.isConnected) {
          error.setText(e.code === 'not-found' ? text('目录不存在，请选择已有目录。', 'Folder not found. Choose an existing folder.') : e.code === 'conflict' ? text('文件名已被占用，请换一个文件名或打开原笔记。', 'The filename is taken. Choose another filename or open the original note.') : e.message);
          if (e.code === 'conflict') { filename.parentElement.hidden = false; focusAfter = filename; }
        } else new Notice(e.message);
      } finally { busy = false; for (const input of [title, kind, folder, filename, save, cancel]) input.disabled = false; if (host.isConnected) focusAfter?.focus(); }
    };
  }, {onClose});
}
module.exports = {mediaIntake};
