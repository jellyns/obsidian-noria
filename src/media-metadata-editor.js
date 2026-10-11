"use strict";
const {Notice} = require('obsidian');
const {recordPopover} = require('./record-popover.js');
const {updateMediaMetadata} = require('./media-record.js');
const {mediaLookupResults, editionMetadata} = require('./media-lookup-ui.js');
const {metadataFieldsFor, metadataListFields} = require('./media-metadata.js');

function mediaMetadataEditor(plugin, anchor, snapshot, {onSaved, onClose, preferredImage} = {}) {
  const text = (zh, en) => plugin.getNoriaLocale() === 'zh' ? zh : en;
  const display = value => Array.isArray(value) ? value.join('；') : value == null ? '' : String(value);
  return recordPopover(anchor, snapshot.title, (host, close) => {
    host.addClass('noria-media-editor'); host.addClass('noria-media-metadata-editor');
    const form = host.createEl('form'); form.noValidate = true;
    const lookupSection=form.createEl('details',{cls:'noria-media-details'});
    lookupSection.hidden=!snapshot.kinds.includes('book');
    lookupSection.createEl('summary',{text:text('查找版本资料','Find edition details')});
    const query=lookupSection.createEl('input',{attr:{type:'text','aria-label':text('名称、ISBN 或版本链接','Title, ISBN or edition link')}});
    query.value=[snapshot.properties.isbn].flat().find(value=>typeof value==='string'&&value.trim())||snapshot.title;
    const searchActions=lookupSection.createDiv({cls:'noria-media-search'});
    const find=searchActions.createEl('button',{text:text('查找资料','Find details'),attr:{type:'button'}});
    const lookupStatus=lookupSection.createDiv({cls:'noria-card-secondary',attr:{role:'status'}});
    const candidates=lookupSection.createDiv({cls:'noria-media-matches'});
    const selection=form.createDiv({cls:'noria-media-selected-edition noria-card-secondary',attr:{tabindex:'-1'}});selection.hidden=true;
    const main=form.createDiv({cls:'noria-media-metadata-fields'});
    const links=form.createEl('details',{cls:'noria-media-details'});
    const linkSummary=links.createEl('summary',{text:text('来源与封面','Source and cover')});
    const fields = [];
    const supported = metadataFieldsFor(snapshot.kinds);
    for (const [key, zh, en] of [['author','作者','Author'], ['publisher','出版社','Publisher'], ['isbn','ISBN','ISBN'], ['pagecount','总页数','Pages'], ['publish','出版日期','Published'], ['director','导演','Director'], ['artist','艺人','Artist'], ['developer','开发者','Developer'], ['year','年份','Year'], ['source','来源链接','Source URL'], ['cover','封面','Cover']].filter(([key])=>supported.includes(key))) {
      const label = text(zh,en), row = (['source','cover'].includes(key)?links:main).createDiv({cls:'noria-card-field'});
      row.dataset.field=key;
      const id = `noria-media-field-${crypto.randomUUID()}`;
      row.createEl('label',{text:label,attr:{for:id}});
      const initial = display(snapshot.properties[key]);
      // Keep legacy values readable and unchanged until this field is edited.
      const input = row.createEl('input',{attr:{id,type:'text','aria-label':label,...(['pagecount','year'].includes(key)?{inputmode:'numeric'}:{})}});
      input.value = initial;
      if(key==='cover')input.placeholder=text('库内图片路径、双链或网页链接','Vault image path, wikilink, or web URL');
      if(key==='cover' && preferredImage)row.createSpan({cls:'noria-card-secondary',text:text('当前封面优先使用原笔记的 image 属性。','The original note’s image property takes priority for the cover.')});
      if (metadataListFields.includes(key)) input.placeholder=text('多项用中文分号分隔','Separate values with ；');
      const change = row.createDiv({cls:'noria-media-field-change'}); change.hidden=true;
      const previous=change.createSpan({cls:'noria-card-secondary',text:text(`原值：${initial||'未填写'}`,`Previously: ${initial||'Not recorded'}`),attr:{id:`${id}-before`}});
      input.setAttribute('aria-describedby',previous.id);
      const restore=change.createEl('button',{text:text('还原','Restore'),attr:{type:'button','aria-label':text(`还原${zh}`,`Restore ${en}`)}});
      const proposal=row.createDiv({cls:'noria-media-proposal'});proposal.hidden=true;
      fields.push({key,input,initial,change,restore,proposal,label});
      input.oninput=()=>{input.setCustomValidity('');refresh();};
      restore.onclick=()=>{input.value=initial;input.setCustomValidity('');refresh();input.focus();};
    }
    const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
    const actions=form.createDiv({cls:'noria-record-actions'});
    const cancel=actions.createEl('button',{text:text('取消','Cancel'),attr:{type:'button'}});cancel.onclick=()=>close();
    const save=actions.createEl('button',{cls:'mod-cta',text:text('保存修改','Save changes'),attr:{type:'submit'}});
    let saving=false;
    const {search,invalidate}=mediaLookupResults(plugin,{host,find,status:lookupStatus,candidates,isBusy:()=>saving,text,onChoose:item=>{
      invalidate();clearProposals();
      const proposed=editionMetadata(item);
      selection.setText([item.title,...(item.publishers||[]),item.publish,(!item.authorIds?.length||item.unresolvedAuthorIds?.length)?text('作者资料不全','Author details incomplete'):''].filter(Boolean).join(' · '));selection.hidden=false;
      let linkCount=0;
      for(const field of fields)if(Object.hasOwn(proposed,field.key)) {
        field.proposed=display(proposed[field.key]);field.proposal.hidden=false;
        field.proposal.createSpan({text:text(`来源：${field.proposed}`,`Source: ${field.proposed}`)});
        field.adopt=field.proposal.createEl('button',{text:text('采用','Use'),attr:{type:'button','aria-label':text(`采用${field.label}`,`Use ${field.label}`)}});
        field.adopt.onclick=()=>{if(saving)return;field.input.value=field.proposed;field.input.setCustomValidity('');refresh();field.input.focus();};
        if(['source','cover'].includes(field.key))linkCount++;
      }
      linkSummary.setText(text('来源与封面','Source and cover')+(linkCount?text(` · ${linkCount} 项可对照`,` · ${linkCount} suggestions`):''));
      lookupSection.open=false;refresh();selection.focus();
    }});
    function clearProposals() {
      selection.hidden=true;
      for(const field of fields){field.proposal.empty();field.proposal.hidden=true;delete field.adopt;delete field.proposed;}
      linkSummary.setText(text('来源与封面','Source and cover'));
    }
    query.oninput=()=>{invalidate();clearProposals();};
    find.onclick=()=>{if(saving||!query.value.trim())return;clearProposals();search(query.value.trim());};
    query.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();find.click();}};
    const changed=()=>fields.filter(field=>field.input.value!==field.initial);
    function refresh() {
      for(const field of fields){field.change.hidden=field.input.value===field.initial;if(field.adopt)field.adopt.disabled=saving||field.input.value===field.proposed;}
      save.disabled=saving||!changed().length;
    }
    refresh();
    form.onsubmit=async event=>{
      event.preventDefault(); if(saving||!changed().length)return;
      const patch={};
      for(const {key,input} of changed()) {
        const value=input.value.trim();
        if(key==='pagecount'&&value&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<=0)) {
          input.setCustomValidity(text('总页数须为正整数。','Page count must be a positive integer.'));input.reportValidity();input.focus();return;
        }
        if(key==='year'&&value&&(!/^\d{1,4}$/.test(value)||Number(value)<1)) {
          input.setCustomValidity(text('年份须为 1–9999 的整数。','Year must be an integer from 1 to 9999.'));input.reportValidity();input.focus();return;
        }
        patch[key]=!value?null:['pagecount','year'].includes(key)?Number(value):metadataListFields.includes(key)?value.split('；').map(x=>x.trim()).filter(Boolean):value;
      }
      invalidate();saving=true;error.setText('');query.disabled=find.disabled=true;
      for(const {input,restore} of fields)input.disabled=restore.disabled=true;
      save.disabled=cancel.disabled=true;refresh();
      try {
        const result=await updateMediaMetadata(plugin,{path:snapshot.path,revision:snapshot.metadataRevision,patch});
        const reveal=host.isConnected;
        await onSaved?.(result,reveal);
        if(!reveal)new Notice(text('作品资料已保存','Work details saved'));
        close();
      } catch(e) {
        const message=e.code==='conflict'?text('资料已在别处修改，当前输入未保存。请核对原笔记后重新打开。','Details changed elsewhere. Your input was not saved. Check the original note and reopen this editor.'):e.message;
        if(host.isConnected)error.setText(message);else new Notice(message);
      } finally {
        saving=false;for(const {input,restore} of fields)input.disabled=restore.disabled=false;
        cancel.disabled=query.disabled=find.disabled=false;refresh();
      }
    };
  },{onClose});
}
module.exports={mediaMetadataEditor};
