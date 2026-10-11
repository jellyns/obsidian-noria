"use strict";
const {sectionTitlesForSelection}=require('./diary-section-card.js');

function recordScopeSettings(catalog,form){
  const text=(zh,en)=>catalog.text(zh,en),draft=catalog.draft;
  let selected=[...(draft.props.sections||[])],titles=[...selected];
  const clearError=()=>{if(catalog.errorEl)catalog.errorEl.hidden=true;};
  const mode=catalog.field(form,text('展示范围','Display scope'),'select',Array.isArray(draft.props.sections)?'sections':'full',value=>{
    if(value==='sections')draft.props.sections=[...selected];else delete draft.props.sections;
    area.hidden=value!=='sections';
    clearError();
  },[{value:'full',label:text('整篇','Full note')},{value:'sections',label:text('指定章节','Selected sections')}]);
  mode.dataset.recordScope='true';
  const area=form.createDiv({cls:'noria-record-scope'});area.hidden=mode.value!=='sections';
  const list=area.createDiv({cls:'noria-record-scope-choices',attr:{role:'group','aria-label':text('展示章节','Visible sections')}});
  const paint=()=>{
    list.empty();
    for(const title of titles)catalog.field(list,title,'checkbox',selected.includes(title),checked=>{
      selected=checked?[...selected,title]:selected.filter(v=>v!==title);
      if(mode.value==='sections')draft.props.sections=[...selected];
      clearError();
    });
  };
  paint();
  const custom=area.createDiv({cls:'noria-record-scope-add'});
  const input=custom.createEl('input',{attr:{type:'text',placeholder:text('其他二级标题','Another section heading'),'aria-label':text('其他二级标题','Another section heading')}});
  const add=custom.createEl('button',{text:text('添加','Add'),attr:{type:'button'}});
  const append=()=>{
    const title=input.value.trim();if(!title||/[\r\n]/.test(title))return;
    if(!titles.includes(title))titles.push(title);if(!selected.includes(title))selected.push(title);
    draft.props.sections=[...selected];catalog.dirty=true;clearError();input.value='';paint();input.focus();
  };
  add.onclick=append;input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();append();}});
  form.createDiv({cls:'noria-card-secondary',text:text('仅影响阅读展示，编辑时仍打开完整原文。','Only changes the reading view. Editing opens the full note.')});
  void sectionTitlesForSelection(catalog.plugin,catalog.context.selection,{record:true}).then(values=>{
    if(!area.isConnected||catalog.draft!==draft)return;
    titles=[...new Set([...values,...titles])];paint();
  }).catch(error=>{if(area.isConnected&&catalog.draft===draft)catalog.showError(error);});
}
module.exports={recordScopeSettings};
