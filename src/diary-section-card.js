"use strict";
const {Component,MarkdownRenderer,Notice,parseYaml}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {diarySection,diarySectionTitles}=require('./diary-section-model.js');

async function sectionTitlesForSelection(plugin,selection,{record=false}={}){
  if(!selection?.mode)return [];
  const spec=await plugin.resolveCalendarNoteSpecAsync(selection.mode,selection.anchorDate);
  const paths=[spec.path,spec.templatePath].filter(Boolean),raw=[];
  for(const path of paths){const file=plugin.app.vault.getAbstractFileByPath(path);if(file?.extension==='md')raw.push(await plugin.app.vault.cachedRead(file));}
  if(!record)return diarySectionTitles(...raw);
  return diarySectionTitles(...raw.map(source=>{
    let heading;try{heading=plugin.getReviewFinalSectionHeading(selection.mode,source);}catch(_){/* Keep ambiguous content visible. */}
    return require('./diary-prose.js').projectDiaryRecord(source,{reviewHeading:heading,habitDate:selection.mode==='daily'&&selection.anchorDate<=plugin.getLocalYmd()?selection.anchorDate:undefined}).markdown;
  }));
}
async function sectionSuggestions(plugin,input,selection){
  const titles=await sectionTitlesForSelection(plugin,selection);
  if(!input.isConnected)return;
  const id='noria-diary-headings-'+crypto.randomUUID(),list=input.parentElement.createEl('datalist',{attr:{id}});input.setAttribute('list',id);
  for(const title of titles)list.createEl('option',{value:title});
}
function registerDiarySection(system){
  const plugin=system.plugin,app=plugin.app,text=(zh,en)=>system.text(zh,en);
  system.register({id:'noria:diary-section',title:text('日记章节','Diary section'),icon:'text',supportsDate:true,
    description:text('显示当前日／周／月／年笔记中的指定章节。','Show a selected section from the current day, week, month or year note.'),
    fields:[{key:'heading',label:text('二级标题','Section heading (H2)'),type:'text',required:true}],
    validate:config=>{if(!config.projection&&(!config.heading?.trim()||/[\r\n]/.test(config.heading)))throw Error(text('请选择或填写二级标题名称','Choose or enter a section heading'));},
    render:async({container,component,config,selection,context})=>{
      if(!selection?.mode&&!config.path)throw Error(text('请在日记页面使用此卡片','Use this card on a diary page'));
      const spec=config.path?{path:config.path}:await plugin.resolveCalendarNoteSpecAsync(selection.mode,selection.anchorDate),heading=String(config.heading||'').trim();
      const shell=container.closest('.noria-diary-card,.dashboard-home-widget-shell'),tools=shell?.querySelector('.noria-diary-card-tools');
      let disposed=false,serial=0,child,edit;
      const open=async()=>{
        const result=config.path?{file:app.vault.getAbstractFileByPath(config.path)}:await plugin.createCalendarNoteIfMissing(spec);
        if(!result.file)throw Error(text('源笔记不存在','Source note not found'));
        const raw=await app.vault.read(result.file),section=diarySection(raw,heading);
        await app.workspace.openLinkText(result.file.path+(section.state==='found'?'#'+heading:''),spec.path,true);
      };
      if(!context.preview&&tools){edit=iconButton(tools,'pencil',text('编辑章节','Edit section'),()=>void open().catch(e=>new Notice(e.message)));tools.prepend(edit);component.register(()=>edit.remove());}
      const paint=async()=>{
        const token=++serial,file=app.vault.getAbstractFileByPath(spec.path),raw=file?await app.vault.cachedRead(file):'';
        if(disposed||token!==serial)return;
        if(child)component.removeChild(child);child=new Component();component.addChild(child);container.empty();container.addClass('noria-diary-section-content');
        const reviewHeading=config.projection?plugin.getReviewFinalSectionHeading(config.period||selection?.mode||'daily',raw):'';
        const parsed=config.projection==='record'?require('./record-properties.js').frontmatter(raw,parseYaml):null;
        const prose=parsed?.hit?raw.slice(parsed.hit[0].length):raw;
        const section=config.projection==='record'?{state:'found',content:require('./diary-prose.js').projectDiaryRecord(prose,{reviewHeading,sections:config.sections}).markdown}:diarySection(raw,config.projection==='review'?reviewHeading:heading);
        if((!heading&&!config.projection)||!file||section.state!=='found'||!section.content){
          const message=!heading?text('选择一个章节以预览','Choose a section to preview'):!file?text('本期尚未创建笔记','This period has no note yet'):section.state==='ambiguous'?text('存在同名二级标题，请在原笔记中区分','Duplicate section headings; distinguish them in the note'):section.state==='missing'?text('本期笔记没有这个章节','This note has no matching section'):text('尚未填写','No content yet');
          container.createDiv({cls:'noria-card-secondary',text:message});return;
        }
        const body=container.createDiv();await MarkdownRenderer.render(app,require('./diary-cards-document.js').withoutNoteCards(section.content),body,spec.path,child);
        // Reading projection only; edits use the original note's native editor.
        for(const checkbox of body.querySelectorAll('input[type=checkbox]'))checkbox.disabled=true;
      };
      const refresh=()=>void paint().catch(e=>{if(!disposed){container.empty();container.createDiv({cls:'noria-card-error',text:e.message});}});
      if(shell&&config.path)shell._noriaRecordActions=[{label:text('打开原笔记','Open source note'),icon:'file-text',run:open}];
      component.register(()=>{disposed=true;++serial;});
      for(const event of ['modify','create','delete'])component.registerEvent(app.vault.on(event,file=>{if(file.path===spec.path)refresh();}));
      component.registerEvent(app.vault.on('rename',(file,old)=>{if(file.path===spec.path||old===spec.path)refresh();}));
      component.registerDomEvent(container,'click',event=>{const link=event.target.closest?.('a.internal-link');if(link&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();void app.workspace.openLinkText(link.dataset.href||link.getAttribute('href'),spec.path,true);}},true);
      await paint();
    }});
}
module.exports={registerDiarySection,sectionSuggestions,sectionTitlesForSelection};
