"use strict";
const {Modal,FuzzySuggestModal,Notice}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {contentProfile,sectionTitles,loadTemplate}=require('./media-content-model.js');
const {commitSettingsChange}=require('./settings-change.js');
function configureMediaContent(plugin,kind='book',sample=()=>null){
  const text=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
  class Picker extends FuzzySuggestModal{
    getItems(){return plugin.app.vault.getMarkdownFiles();}getItemText(file){return file.path;}
    onChooseItem(file){template.value=file.path;syncEdit();void headings();}
  }
  const modal=new Modal(plugin.app);modal.setTitle(text('作品模板','Work template'));
  const host=modal.contentEl;host.addClass('noria-media-content-settings');
  const form=host.createEl('form'),field=(label,tag='input',parent=form)=>{const row=parent.createEl('label',{cls:'noria-card-field'});row.createSpan({text:label});return row.createEl(tag,{attr:{'aria-label':label,...(tag==='input'?{type:'text'}:{})}});};
  const type=field(text('作品类别','Media type'),'select');
  for(const [value,zh,en]of [['book','图书','Books'],['movie','影视','Film & TV'],['music','音乐','Music'],['game','游戏','Games']])type.createEl('option',{value,text:text(zh,en)});
  type.value=kind||'book';
  const template=field(text('模板文件','Template file'));template.placeholder=text('选择库内 Markdown 文件','Choose a Markdown file in this vault');
  const templateRow=template.parentElement.createDiv({cls:'noria-template-file-row'});templateRow.append(template);
  iconButton(templateRow,'folder-open',text('选择模板','Choose template'),()=>new Picker(plugin.app).open());
  const edit=iconButton(templateRow,'file-pen-line',text('保存并编辑模板','Save and edit template'),()=>void apply(true));
  const syncEdit=()=>{edit.disabled=!template.value.trim();};template.oninput=syncEdit;
  form.createDiv({cls:'noria-card-secondary',text:text('在 Obsidian 中编辑模板，后续新作品沿用它的内容与结构。','Edit the template in Obsidian. New works use its content and structure.')});
  const advanced=form.createEl('details',{cls:'noria-card-advanced'});advanced.createEl('summary',{text:text('展示与摘要','Display and excerpts')});
  const scope=field(text('正文展示','Note content'),'select',advanced);
  for(const [value,zh,en]of [['all','跟随笔记','Follow the note'],['selected','指定章节','Selected sections']])scope.createEl('option',{value,text:text(zh,en)});
  const intro=field(text('简介章节','Description heading'),'input',advanced),review=field(text('评语章节','Review heading'),'input',advanced);
  const list=form.createEl('datalist'),id='noria-media-heading-'+Date.now();list.id=id;intro.setAttribute('list',id);review.setAttribute('list',id);
  const extras=advanced.createDiv({cls:'noria-media-content-extras'}),error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),actions=form.createDiv({cls:'noria-record-actions'});
  const cancel=actions.createEl('button',{text:text('取消','Cancel'),attr:{type:'button'}});cancel.onclick=()=>modal.close();
  const save=actions.createEl('button',{text:text('保存','Save'),cls:'mod-cta',attr:{type:'submit'}});
  const drafts=new Map();let profile,serial=0,available=[],busy=false;
  const capture=()=>({template:template.value.trim(),intro:intro.value.trim(),review:review.value.trim(),sections:[...profile.sections],sectionMode:scope.value});
  const draw=()=>{
    list.empty();for(const name of available)list.createEl('option',{value:name});extras.empty();extras.hidden=scope.value!=='selected';
    const names=[...new Set([...profile.sections,...available])].filter(name=>name!==intro.value.trim()&&name!==review.value.trim());
    if(!names.length)return;
    extras.createEl('div',{cls:'noria-card-secondary',text:text('其他展示章节','Additional sections')});
    for(const name of names){const row=extras.createEl('label',{cls:'noria-library-display-option'}),input=row.createEl('input',{attr:{type:'checkbox'}});input.checked=profile.sections.includes(name);row.createSpan({text:name});input.onchange=()=>{profile.sections=input.checked?[...profile.sections,name]:profile.sections.filter(n=>n!==name);};}
  };
  const headings=async()=>{
    const token=++serial;error.setText('');const names=[];
    try{
      if(template.value.trim())names.push(...sectionTitles(await loadTemplate(plugin,template.value.trim())));
      const file=sample(type.value);if(file)names.push(...sectionTitles(await plugin.app.vault.read(file)));
      if(token!==serial||!host.isConnected)return;available=[...new Set(names)];draw();
    }catch(e){if(token===serial&&host.isConnected){available=[];draw();error.setText(e.message);}}
  };
  let previous=type.value;
  const load=()=>{profile=drafts.get(type.value)||contentProfile(plugin,type.value);template.value=profile.template;intro.value=profile.intro;review.value=profile.review;scope.value=profile.sectionMode;syncEdit();draw();void headings();};
  type.onchange=()=>{drafts.set(previous,capture());previous=type.value;load();};template.onchange=headings;intro.onchange=draw;review.onchange=draw;scope.onchange=draw;
  const apply=async open=>{
    if(busy)return;const value=capture(),selected=type.value;
    if(!value.intro||!value.review||/[\r\n]/.test(value.intro+value.review)||value.intro===value.review){advanced.open=true;error.setText(text('请选择两个不同的章节名称','Choose two different section headings'));return;}
    drafts.set(selected,value);busy=true;for(const el of form.querySelectorAll('input,select,button'))el.disabled=true;
    try{for(const draft of drafts.values()){
        if(!draft.intro||!draft.review||draft.intro===draft.review)throw Error(text('简介与评语需使用不同的章节名称','Description and review need different headings'));
        draft.sections=draft.sections.filter(name=>name!==draft.intro&&name!==draft.review);if(draft.template)await loadTemplate(plugin,draft.template);
      }
      await commitSettingsChange(plugin,['mediaContent'],()=>{plugin.settings.mediaContent={...plugin.settings.mediaContent,...Object.fromEntries(drafts)};});
      for(const selected of drafts.keys())plugin.app.workspace.trigger('noria:media-content',selected);
      if(open)await require('./template-file.js').openMarkdownTemplate(plugin,value.template);
      modal.close(true);
    }catch(e){error.setText(e.message);new Notice(e.message);}finally{busy=false;for(const el of form.querySelectorAll('input,select,button'))el.disabled=false;syncEdit();}
  };
  form.onsubmit=event=>{event.preventDefault();void apply(false);};
  const close=modal.close.bind(modal);modal.close=(force=false)=>{if(!busy||force)close();};
  modal.open();load();return modal;
}
module.exports={configureMediaContent};
