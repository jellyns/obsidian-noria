"use strict";
const {recordPopover} = require('./record-popover.js');
const {updateMedia} = require('./media-record.js');
const {Notice} = require('obsidian');

function mediaEditor(plugin, anchor, snapshot, {statuses = [], onSaved, onClose} = {}) {
  const text = (zh, en) => plugin.getNoriaLocale() === 'zh' ? zh : en;
  return recordPopover(anchor, snapshot.title, (host, close) => {
    host.addClass('noria-media-editor');
    const form = host.createEl('form'), error = form.createDiv({cls: 'noria-card-error', attr: {role: 'alert'}});
    const statusLabel = form.createEl('label', {cls: 'noria-card-field'}); statusLabel.createSpan({text: text('状态', 'Status')});
    const id = `noria-media-states-${crypto.randomUUID()}`;
    const status = statusLabel.createEl('input', {attr: {type: 'text', list: id, 'aria-label': text('状态', 'Status'), placeholder: text('填写或选择已有状态', 'Enter or choose a status')}});
    status.value = snapshot.properties.status ?? '';
    const choices = form.createEl('datalist', {attr: {id}});
    for (const value of [...new Set(statuses)].filter(v => typeof v === 'string' && v.trim())) choices.createEl('option', {value});
    let page;
    if (snapshot.kinds.includes('book')) {
      const label = form.createEl('label', {cls: 'noria-card-field'}); label.createSpan({text: text('当前页', 'Current page')});
      page = label.createEl('input', {attr: {type: 'number', min: '0', step: '1', 'aria-label': text('当前页', 'Current page'), placeholder: text('未填写', 'Not recorded')}});
      page.value = snapshot.properties.pageprogress ?? '';
      const total = snapshot.properties.pagecount;
      if (typeof total === 'number' && total > 0) label.createSpan({cls: 'noria-card-secondary', text: text(`全书 ${total} 页`, `${total} pages in this edition`)});
    }
    const initial = {status: status.value, page: page?.value};
    const actions = form.createDiv({cls: 'noria-record-actions'});
    const cancel = actions.createEl('button', {text: text('取消', 'Cancel'), attr: {type: 'button'}}); cancel.onclick = () => close();
    const save = actions.createEl('button', {cls: 'mod-cta', text: text('保存', 'Save'), attr: {type: 'submit'}});
    let saving = false;
    form.onsubmit = async event => {
      event.preventDefault(); if (saving || !form.reportValidity()) return;
      const patch = {};
      if (status.value !== initial.status) patch.status = status.value.trim() || null;
      if (page && page.value !== initial.page) patch.pageprogress = page.value === '' ? null : Number(page.value);
      if (!Object.keys(patch).length) { close(); return; }
      saving = true; save.disabled = cancel.disabled = true; error.setText('');
      try {
        const result = await updateMedia(plugin, {path: snapshot.path, revision: snapshot.revision, patch});
        onSaved?.(result);
        if (!host.isConnected) new Notice(text('作品记录已保存', 'Media record saved'));
        close();
      } catch (e) {
        const message = e.code === 'conflict' ? text('原记录已在别处修改，当前输入未保存。请核对原笔记后重新打开编辑。', 'This record changed elsewhere. Your input was not saved. Check the original note and reopen this editor.') : e.message;
        if (host.isConnected) error.setText(message); else new Notice(message);
      } finally { saving = false; save.disabled = cancel.disabled = false; }
    };
  }, {onClose});
}
module.exports = {mediaEditor};
