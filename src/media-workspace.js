"use strict";
const {FuzzySuggestModal, Menu, Notice, setTooltip} = require('obsidian');
const {iconButton} = require('./card-controls.js');
const {recordPopover} = require('./record-popover.js');
const {listMedia} = require('./media-catalog.js');
const {readMedia} = require('./media-record.js');
const {coverSource, bookPosition} = require('./media-card.js');
const {bindCoverImage,watchCoverImages}=require('./media-cover.js');
const {mediaEditor} = require('./media-editor.js');
const {mediaMetadataEditor} = require('./media-metadata-editor.js');
const {mediaIntake} = require('./media-intake-ui.js');
const {mediaSections} = require('./media-sections.js');
const {configureMediaContent}=require('./media-content-settings.js');
const {contentProfile}=require('./media-content-model.js');
const {mediaExcerpt}=require('./media-excerpt.js');
const {readAccess, saveAccess, openReading, openMediaLink, linkedNotes, associateNote,createRelatedNote} = require('./media-access.js');
const {completionGroups,completionScope} = require('./media-workspace-model.js');
const {renderChart} = require('./statistic-charts.js');
const {mediaMotion} = require('./media-motion.js');
const {displayKey,readDisplay,saveDisplay,bookProgress}=require('./media-display.js');
const {preview:notePreview} = require('./inbox-card-model.js');

const locale = plugin => (zh,en) => plugin.getNoriaLocale() === 'zh' ? zh : en;
const run = fn => void Promise.resolve().then(fn).catch(error=>new Notice(error.message));
class FileChoice extends FuzzySuggestModal {
  constructor(app, files, title, choose) { super(app); this.files=files; this.choose=choose; this.setPlaceholder(title); }
  getItems() { return this.files; }
  getItemText(file) { return file.path; }
  onChooseItem(file) { run(()=>this.choose(file)); }
}
function works(plugin, folder) {
  const items=[]; let offset=0, result;
  do { result=listMedia(plugin,{folder,offset,limit:100}); items.push(...result.items); offset=result.nextOffset; } while(offset!==null);
  return {items,unindexed:result.unindexed};
}
function cover(plugin, parent, item) {
  const slot=parent.createSpan({cls:'noria-library-cover',attr:{'aria-hidden':'true'}});
  slot.dataset.kind=item.kinds[0];
  const placeholder=slot.createSpan({cls:'noria-library-cover-title',text:item.title});
  bindCoverImage(slot,()=>coverSource(plugin,item),{placeholder});
  return slot;
}
function renderMediaSources(plugin,host,items,{text,dates=false}){
  for(const item of items){
    const row=host.createDiv({cls:'noria-media-stat-work'}),b=row.createEl('button',{cls:'noria-media-stat-open',attr:{type:'button','aria-label':item.title}});b.dataset.completionPath=item.path;
    cover(plugin,b,item);const info=b.createSpan({cls:'noria-media-stat-info'});info.createSpan({cls:'noria-media-stat-title',text:item.title});
    const meta=info.createSpan({cls:'noria-media-stat-meta noria-card-secondary'});
    if(dates)meta.createEl('time',{text:item.properties.finishedAt,attr:{datetime:item.properties.finishedAt,title:text('完成日期','Completion date')}});
    if(item.properties.status)meta.createSpan({text:String(item.properties.status),attr:{title:text('当前状态：','Current status: ')+item.properties.status}});
    b.onclick=()=>run(()=>openWork(plugin,item.path));
    const source=iconButton(row,'file-text',text('打开原笔记：','Open source note: ')+item.title,()=>run(()=>plugin.app.workspace.openLinkText(item.path,'',true)));source.dataset.sourcePath=item.path;
  }
}
async function openWork(plugin,path,notes=false,destinationError='') {
  const leaf=await plugin.openDashboardHomeLeaf(false);
  if(!leaf?.view?.workbench) await leaf?.view?.renderHome();
  await leaf?.view?.workbench?.show('media');
  const wb=leaf?.view?.workbench,item=await readMedia(plugin,{path});
  if(wb?.mediaKind&&!item.kinds.includes(wb.mediaKind))await wb.pages.get('media')?.panel._noriaMediaPage?.show(item.kinds[0]);
  plugin.app.workspace.trigger('noria:media-open',{path,notes,destinationError});
}
function menuAt(anchor, build) {
  const menu=new Menu(); build(menu);
  const r=anchor.getBoundingClientRect();menu.onHide(()=>anchor.isConnected&&anchor.focus({preventScroll:true}));menu.showAtPosition({x:r.left,y:r.bottom});
}
function editAccess(plugin,anchor,path,onSaved,prefill,destinationError='') {
  const text=locale(plugin);
  return recordPopover(anchor,text('作品入口','Work destination'),(host,close)=>{
    const form=host.createEl('form');
    const field=form.createDiv({cls:'noria-library-entry-field'});
    const input=field.createEl('input',{attr:{type:'text','aria-label':text('文件或链接','File or link'),placeholder:text('选择文件或粘贴链接','Choose a file or paste a link')}});
    const fileButton=iconButton(field,'folder-open',text('选择文件','Choose file'));
    fileButton.onclick=()=>{close();new FileChoice(plugin.app,plugin.app.vault.getFiles(),text('选择文件','Choose file'),file=>{if(anchor.isConnected&&anchor.getClientRects().length)editAccess(plugin,anchor,path,onSaved,`[[${file.path}]]`);}).open();};
    const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),actions=form.createDiv({cls:'noria-record-actions'});
    error.setText(destinationError?text('入口不可用，请重新选择文件或链接。','Destination unavailable. Choose a file or link.'):'');
    const cancel=actions.createEl('button',{text:text('取消','Cancel'),attr:{type:'button'}});cancel.onclick=()=>close();
    const save=actions.createEl('button',{text:text('保存','Save'),cls:'mod-cta',attr:{type:'submit'}});save.disabled=true;
    let state,busy=false;
    input.disabled=true;fileButton.disabled=true;
    readAccess(plugin,path).then(value=>{if(!host.isConnected)return;state=value;input.value=prefill??value.value;input.disabled=false;fileButton.disabled=false;save.disabled=false;input.focus();}).catch(e=>{if(host.isConnected)error.setText(e.message);});
    const controls=[input,fileButton,cancel,save];
    form.onsubmit=async event=>{event.preventDefault();if(!state||busy)return;busy=true;for(const control of controls)control.disabled=true;error.setText('');
      try{await saveAccess(plugin,state,input.value);const reveal=host.isConnected;await onSaved?.(reveal);if(!reveal)new Notice(text('作品入口已保存','Work destination saved'));close();}
      catch(e){if(host.isConnected)error.setText(e.message);else new Notice(e.message);}finally{busy=false;for(const control of controls)control.disabled=false;}};
  });
}
function newRelatedNote(plugin,anchor,path,onSaved){
  const text=locale(plugin);
  return recordPopover(anchor,text('新建关联笔记','New linked note'),(host,close)=>{
    const form=host.createEl('form'),input=form.createEl('input',{attr:{type:'text',required:'',placeholder:text('笔记名称','Note name'),'aria-label':text('笔记名称','Note name')}});
    const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),actions=form.createDiv({cls:'noria-record-actions'});
    const cancel=actions.createEl('button',{text:text('取消','Cancel'),attr:{type:'button'}});cancel.onclick=()=>close();
    const save=actions.createEl('button',{text:text('创建并打开','Create and open'),cls:'mod-cta',attr:{type:'submit'}});let busy=false;
    form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;for(const el of [input,cancel,save])el.disabled=true;
      try{const result=await createRelatedNote(plugin,path,input.value);const reveal=host.isConnected;close();onSaved();if(reveal)await openMediaLink(plugin,result.path,path);else new Notice(text('关联笔记已创建','Linked note created'));}
      catch(e){if(host.isConnected)error.setText(e.message);else new Notice(e.message);}finally{busy=false;for(const el of [input,cancel,save])el.disabled=false;}};
  });
}
function registerMediaWorkspace(system) {
  const plugin=system.plugin,text=locale(plugin),shelf=plugin.shortcuts;
  const folder=()=>system.pages.get('media')?.widgets.find(w=>w.source==='noria:media-library')?.props?.folder || '';
  require('./media-distribution.js').registerMediaDistribution(system,{plugin,text,folder,works,renderSources:(host,items)=>renderMediaSources(plugin,host,items,{text})});
  system.register({id:'noria:media-library',title:text('作品','Works'),icon:'library',
    description:text('浏览作品、直接阅读并查看自己的记录。','Browse your collection, open a work and find your notes.'),
    fields:[{key:'folder',label:text('作品目录（留空跟随藏馆）','Media folder (empty follows library)'),type:'folder'}],
    validate:config=>{if(config.folder)listMedia(plugin,{folder:config.folder,limit:1});},
    render:({container,component,config,context,widgetId})=>{
      container.addClass('noria-library');
      const motion=mediaMotion(container);component.register(()=>motion.dispose());
      if(!config.folder)config.folder=folder();
      let items=[],kind=context.mediaKind||'',status='',query='',limit=30,shownPath='',timer,disposed=false,closeEditor,scroll=0,focusPath='',pendingRefresh=false,detailToken=0,initialSelection=true;
      const intakeDrafts=new Map();
      let prose,excerptToken=0;
      const hydrateExcerpts=async(entries,token)=>{
        let index=0;
        await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
          while(index<entries.length&&!disposed&&token===excerptToken){
            const {item,host}=entries[index++];
            try{
              const file=plugin.app.vault.getAbstractFileByPath(item.path);if(!file)continue;
              const raw=await plugin.app.vault.cachedRead(file);
              if(disposed||token!==excerptToken||!host.isConnected)return;
              const result=mediaExcerpt(raw,contentProfile(plugin,item.kinds[0]),item.properties.description);
              if(!result)continue;
              host.hidden=false;host.dataset.excerptKind=result.kind;
              host.createSpan({cls:'noria-library-excerpt-label',text:result.label+' · '});host.createSpan({text:result.text});
            }catch(e){if(!disposed&&token===excerptToken&&host.isConnected){host.hidden=false;host.setText(text('摘要暂不可用','Preview unavailable'));host.title=e.message;}}
          }
        }));
      };
      const preferenceKey=()=>displayKey(context,widgetId,kind);
      let display=readDisplay(plugin,preferenceKey());
      const browse=container.createDiv({cls:'noria-library-browser'}),detail=container.createDiv({cls:'noria-library-detail'});detail.hidden=true;
      const toolbar=browse.createDiv({cls:'noria-library-toolbar'}),types=context.mediaPage?null:toolbar.createDiv({cls:'noria-library-types',attr:{role:'group','aria-label':text('作品类型','Media type')}});
      const counts=toolbar.createDiv({cls:'noria-library-statuses',attr:{role:'group','aria-label':text('作品状态','Status')}});
      const searchTools=toolbar.createDiv({cls:'noria-library-search-tools'});
      const search=searchTools.createEl('input',{attr:{type:'search',placeholder:text('搜索收藏','Search library'),'aria-label':text('搜索收藏','Search library')}});
      const filterSummary=browse.createDiv({cls:'noria-media-filter-summary'});filterSummary.hidden=true;
      const classifications=require('./media-filter-ui.js').mediaFilters({tools:searchTools,summary:filterSummary,text,getItems:()=>items.filter(i=>!kind||i.kinds.includes(kind)),onChange:()=>filtered()});
      component.register(()=>classifications.dispose());
      const feedback=browse.createDiv({cls:'noria-card-secondary',attr:{role:'status'}});
      const grid=browse.createDiv({cls:'noria-library-grid'}),more=browse.createEl('button',{text:text('显示更多','Show more'),cls:'noria-media-more'});
      const pageTools=context.mediaPage?container.closest('.noria-media-subpage')?._noriaMediaTools:null;
      const displayTools=(pageTools&&!pageTools.children.length?pageTools:searchTools).createDiv({cls:'noria-library-display-tools'});
      component.register(()=>displayTools.remove());
      for(const [value,icon,label]of [['covers','layout-grid',text('封面视图','Cover view')],['details','list',text('详细视图','Detail view')]]){
        const b=iconButton(displayTools,icon,label,()=>run(()=>saveDisplay(plugin,preferenceKey(),{view:value})));b.dataset.mediaView=value;b.setAttribute('aria-pressed',String(display.view===value));
      }
      const displayButton=iconButton(displayTools,'sliders-horizontal',text('显示设置','Display settings'),()=>{
        closeEditor=recordPopover(displayButton,text('显示设置','Display settings'),(host,close)=>{
          const view=display.view;
          for(const [key,label]of [['creator',text('作者／创作者','Creator')],['progress',text('进度','Progress')],['summary',text('评语／简介','Review / description')]]){
            const row=host.createEl('label',{cls:'noria-library-display-option'}),input=row.createEl('input',{attr:{type:'checkbox'}});input.checked=display[view][key];row.createSpan({text:label});
            input.onchange=async()=>{input.disabled=true;try{await saveDisplay(plugin,preferenceKey(),{[view]:{[key]:input.checked}});}catch(e){input.checked=readDisplay(plugin,preferenceKey())[view][key];new Notice(e.message);}finally{input.disabled=false;}};
          }
          if(view==='covers'){
            const row=host.createEl('label',{cls:'noria-library-display-size'});row.createSpan({text:text('封面大小','Cover size')});
            const input=row.createEl('input',{attr:{type:'range',min:'120',max:'220',step:'10','aria-label':text('封面大小','Cover size')}});input.value=String(display.size);
            input.oninput=()=>grid.style.setProperty('--noria-cover-size',input.value+'px');
            input.onchange=async()=>{try{await saveDisplay(plugin,preferenceKey(),{size:Number(input.value)});}catch(e){input.value=String(readDisplay(plugin,preferenceKey()).size);grid.style.setProperty('--noria-cover-size',input.value+'px');new Notice(e.message);}};
          }
          const configure=host.createEl('button',{cls:'noria-media-template-configure',text:text('作品模板…','Work template…'),attr:{type:'button'}});
          configure.onclick=()=>{close();configureMediaContent(plugin,kind||'book',selected=>plugin.app.vault.getAbstractFileByPath(items.find(i=>i.kinds.includes(selected))?.path||''));};
        });
      });
      const scopeItems=()=>items.filter(item=>!kind||item.kinds.includes(kind));
      const candidates=()=>classifications.filter(scopeItems().filter(item=>!query||[item.title,item.properties.author,item.properties.director,item.properties.artist,item.properties.developer].flat().some(v=>String(v||'').toLocaleLowerCase().includes(query))));
      const filtered=()=>{initialSelection=false;limit=30;paint();};
      if(types)for(const [value,icon,label] of [['','library',text('全部作品','All works')],['book','book-open',text('图书','Books')],['movie','film',text('影视','Film & TV')],['music','disc-3',text('音乐','Music')],['game','gamepad-2',text('游戏','Games')]]) {
        const b=iconButton(types,icon,label);b.dataset.kind=value;b.setAttribute('aria-pressed',String(value===kind));b.setAttribute('title',label);
        b.onclick=()=>{kind=value;for(const other of types.children)other.setAttribute('aria-pressed',String(other===b));filtered();};
      }
      if(types)types.onkeydown=event=>{
        const buttons=[...types.children],index=buttons.indexOf(event.target);if(index<0)return;
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowRight'?(index+1)%buttons.length:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:-1;
        if(next<0)return;event.preventDefault();buttons[next].focus();buttons[next].click();
      };
      search.oninput=()=>{query=search.value.trim().toLocaleLowerCase();filtered();};
      iconButton(searchTools,'plus',text('添加作品','Add a work'),()=>{
        if(!config.folder){system.catalog(context,widgetId);return;}
        let draft=intakeDrafts.get(kind);
        if(!draft){draft={title:search.value,kind:kind||'book',folder:config.folder};intakeDrafts.set(kind,draft);}
        const anchor=toolbar.querySelector('[aria-label="'+text('添加作品','Add a work')+'"]');
        const openIntake=()=>{
          if(disposed||!anchor.isConnected||!anchor.getClientRects().length)return;
          closeEditor=mediaIntake(plugin,anchor,{root:config.folder,draft,fixedKind:context.mediaKind,openSource:path=>openDetail(path),onCreated:async(result,reveal)=>{await refresh();if(reveal&&!disposed)await openDetail(result.path);},onClose:()=>{},
            configureTemplate:selected=>{
              const modal=configureMediaContent(plugin,selected,type=>plugin.app.vault.getAbstractFileByPath(items.find(i=>i.kinds.includes(type))?.path||''));
              // Reopen after the modal removes its focus scope, keeping the intake draft.
              modal.onClose=()=>queueMicrotask(openIntake);closeEditor=()=>modal.close();
            }});
        };openIntake();
      });
      const refreshButton=iconButton(searchTools,'refresh-cw',text('刷新作品','Refresh works'),()=>refresh());
      const paint=()=>{
        if(disposed)return;
        const token=++excerptToken,excerpts=[];
        display=readDisplay(plugin,preferenceKey());grid.dataset.view=display.view;grid.style.setProperty('--noria-cover-size',display.size+'px');
        for(const b of displayTools.querySelectorAll('[data-media-view]'))b.setAttribute('aria-pressed',String(b.dataset.mediaView===display.view));
        const active=container.ownerDocument.activeElement;
        const focusedPin=grid.contains(active)?active.dataset.pinPath:null,focusedWork=grid.contains(active)?active.dataset.path:null;
        const focusedProgress=grid.contains(active)?active.dataset.progressPath:null;
        const focusedStatus=counts.contains(active)?active.dataset.status:undefined;
        counts.empty();grid.empty();
        const eligible=candidates(),stateCounts=new Map();for(const item of scopeItems()){const value=item.properties.status;if(value)stateCounts.set(value,0);}
        for(const item of eligible){const value=item.properties.status;if(value)stateCounts.set(value,stateCounts.get(value)+1);}
        // A type may use different status names. Never retain an invisible filter.
        if(status&&!stateCounts.has(status))status='';
        for(const [value,count] of [['',eligible.length],...stateCounts]) {
          const b=counts.createEl('button',{attr:{type:'button','aria-pressed':String(status===value)}});
          b.dataset.status=value;
          b.createSpan({text:value||text('全部','All')});b.createSpan({cls:'noria-card-secondary',text:String(count)});
          b.onclick=()=>{status=value;filtered();};
        }
        const results=eligible.filter(item=>!status||item.properties.status===status);
        for(const item of results.slice(0,limit)) {
          const tile=grid.createDiv({cls:'noria-library-item'}),button=tile.createEl('button',{cls:'noria-library-open',attr:{type:'button','aria-label':item.title,title:item.title}});
          tile.dataset.workPath=item.path;button.dataset.path=item.path;cover(plugin,button,item);
          const information=tile.createDiv({cls:'noria-library-item-info'}),title=information.createEl('button',{cls:'noria-library-item-title',text:item.title,attr:{type:'button',title:item.title}});title.dataset.path=item.path;title.onclick=()=>run(()=>openDetail(item.path));
          button.onclick=()=>run(()=>openDetail(item.path));
          const fields=display[display.view];
          const creator=[item.properties.author||item.properties.director||item.properties.artist||item.properties.developer].flat().filter(Boolean).join(' · ');
          if(fields.creator&&creator)information.createDiv({cls:'noria-library-item-creator noria-card-secondary',text:creator});
          const position=[item.properties.status,bookPosition(item,text)].filter(Boolean).join(' · ');
          if(fields.progress&&position){
            const progress=bookProgress(item);
            const b=information.createEl('button',{cls:'noria-library-item-progress',text:position,attr:{type:'button','aria-label':text('更新进度：','Update progress: ')+item.title}});b.dataset.progressPath=item.path;
            b.onclick=()=>run(async()=>{const snapshot=await readMedia(plugin,{path:item.path});if(!b.isConnected)return;closeEditor=mediaEditor(plugin,b,snapshot,{statuses:items.map(i=>i.properties.status),onSaved:async()=>{await refresh();const target=[...grid.querySelectorAll('[data-progress-path]')].find(el=>el.dataset.progressPath===item.path)||[...grid.querySelectorAll('.noria-library-item-title')].find(el=>el.dataset.path===item.path);target?.focus({preventScroll:true});}});});
            if(progress?.ratio!=null&&progress.ratio<1){const bar=information.createEl('progress',{cls:'noria-library-position-bar',attr:{max:progress.total,value:progress.page,'aria-label':position}});bar.title=position;}
          }
          if(fields.summary){const host=information.createDiv({cls:'noria-library-item-summary'});host.hidden=true;excerpts.push({item,host});}
          const pin=iconButton(tile,shelf.hasMedia(item.path)?'pin-off':'pin',shelf.hasMedia(item.path)?text('移出快捷入口','Remove shortcut'):text('添加到快捷入口','Add to shortcuts'),()=>run(()=>shelf.toggleMedia(item.path)));
          pin.addClass('noria-library-pin');tile.classList.toggle('is-pinned',shelf.hasMedia(item.path));
          pin.dataset.pinPath=item.path;
        }
        if(!results.length) {
          const hasWorks=items.some(item=>!kind||item.kinds.includes(kind));
          const empty=grid.createDiv({cls:'noria-library-empty'});
          empty.createDiv({text:!config.folder?text('选择已有作品所在的目录','Choose your existing media folder'):hasWorks?text('没有符合筛选的作品','No matching works'):text('还没有作品','No works yet')});
          const b=empty.createEl('button',{text:!config.folder?text('选择目录','Choose folder'):hasWorks?text('清除筛选','Clear filters'):text('添加作品','Add a work')});
          b.onclick=()=>{
            if(!config.folder){system.catalog(context,widgetId);return;}
            if(!hasWorks){toolbar.querySelector('[aria-label="'+text('添加作品','Add a work')+'"]').click();return;}
            status='';query='';search.value='';classifications.reset();
            if(!context.mediaPage&&!items.some(i=>!kind||i.kinds.includes(kind))){kind='';for(const button of types.children)button.setAttribute('aria-pressed',String(button===types.firstElementChild));}
            filtered();search.focus({preventScroll:true});
          };
        }
        more.hidden=results.length<=limit;
        classifications.refresh();
        void hydrateExcerpts(excerpts,token);
        const target=focusedPin?[...grid.querySelectorAll('[data-pin-path]')].find(b=>b.dataset.pinPath===focusedPin):focusedProgress?[...grid.querySelectorAll('[data-progress-path]')].find(b=>b.dataset.progressPath===focusedProgress)||[...grid.querySelectorAll('.noria-library-item-title')].find(b=>b.dataset.path===focusedProgress):focusedWork?[...grid.querySelectorAll('[data-path]')].find(b=>b.dataset.path===focusedWork):focusedStatus!==undefined?[...counts.children].find(b=>b.dataset.status===focusedStatus)||counts.querySelector('[aria-pressed=true]'):null;
        target?.focus({preventScroll:true});
      };
      const refresh=async()=>{
        if(disposed)return;if(shownPath){pendingRefresh=true;return;}
        try {const result=config.folder?works(plugin,config.folder):{items:[],unindexed:0};items=result.items;
          if(initialSelection&&items.length){initialSelection=false;status=require('./media-workspace-model.js').initialMediaStatus(items,plugin.getNoriaLocale());}
          feedback.setText(result.unindexed?text('部分笔记仍在索引，稍后刷新即可。','Some notes are still indexing. Refresh shortly.'):'');paint();}
        catch(e){feedback.setText(e.message);}
      };
      const back=async()=>{
        const previous=shownPath;
        if(!plugin.app.vault.getAbstractFileByPath(previous)){if(await prose?.backup())new Notice(text('当前输入已保存到 Obsidian 文本备份','Your draft was saved to Obsidian text backups'));}
        else await prose?.flush();if(disposed||shownPath!==previous)return;
        void prose?.dispose({save:false});prose=null;
        const frame=motion.capture(detail.querySelector('.noria-library-cover'));
        ++detailToken;closeEditor?.(false);shownPath='';detail.empty();detail.hidden=true;browse.hidden=false;displayTools.hidden=false;
        if(pendingRefresh){pendingRefresh=false;await refresh();}else paint();
        const panel=container.closest('.noria-workbench-page');if(panel)panel.scrollTop=scroll;
        const target=[...grid.querySelectorAll('[data-path]')].find(b=>b.dataset.path===focusPath);target?.focus({preventScroll:true});
        motion.move(frame,target?.querySelector('.noria-library-cover'),null,true);
      };
      const openDetail=async(path,notes=false,focus='back',destinationError='')=>{
        if(disposed)return;
        await prose?.flush();if(disposed)return;
        const token=++detailToken;let item=await readMedia(plugin,{path});
        let access=await readAccess(plugin,path);if(disposed||token!==detailToken)return;
        const entering=!shownPath,frame=entering?motion.capture([...grid.querySelectorAll('[data-path]')].find(b=>b.dataset.path===path)?.querySelector('.noria-library-cover')):null;
        if(!shownPath){scroll=container.closest('.noria-workbench-page')?.scrollTop||0;focusPath=path;}
        void prose?.dispose();prose=null;
        shownPath=path;browse.hidden=true;detail.hidden=false;detail.empty();displayTools.hidden=true;
        const nav=detail.createDiv({cls:'noria-library-detail-nav'}),backButton=iconButton(nav,'arrow-left',text('返回藏馆','Back to library'),()=>run(back));
        const sourceState=detail.createDiv({cls:'noria-card-secondary',attr:{role:'status'}});sourceState.hidden=true;
        const header=detail.createDiv({cls:'noria-library-work-header'});let artwork=cover(plugin,header,item),artworkKey=JSON.stringify([item.title,item.kinds[0],coverSource(plugin,item)]);
        const info=header.createDiv({cls:'noria-library-work-info'});const heading=info.createEl('h2',{text:item.title});
        const creator=info.createDiv({cls:'noria-library-creator noria-card-secondary'});
        const classification=info.createEl('button',{cls:'noria-library-classification',attr:{type:'button','aria-label':text('编辑分类','Edit categories')}});
        classification.onclick=()=>run(async()=>{await prose?.flush();closeEditor=require('./media-classification-editor.js').classificationEditor(plugin,classification,await readMedia(plugin,{path}),{items:items.filter(i=>i.kinds.some(k=>item.kinds.includes(k))),onSaved:async(_result,reveal)=>{pendingRefresh=true;if(shownPath===path&&!disposed)await openDetail(path,false,reveal?'.noria-library-classification':null);}});});
        const position=info.createEl('button',{cls:'noria-library-progress',attr:{type:'button'}});
        position.onclick=()=>run(async()=>{await prose?.flush();const snapshot=await readMedia(plugin,{path});closeEditor=mediaEditor(plugin,position,snapshot,{statuses:items.map(i=>i.properties.status),onSaved:async(_result,reveal)=>{pendingRefresh=true;if(shownPath===path)await openDetail(path,false,reveal?'.noria-library-progress':null);}});});
        const actions=info.createDiv({cls:'noria-library-work-actions'});
        const verb=()=>item.kinds.includes('game')?text('启动','Play'):item.kinds.includes('movie')?text('观看','Watch'):item.kinds.includes('music')?text('聆听','Listen'):text('阅读','Read');
        const reading=actions.createEl('button',{text:access.value?verb():text('关联入口','Link destination'),cls:access.value?'mod-cta':''});
        reading.dataset.action='open-work';
        const editDestination=(anchor,error='')=>run(async()=>{await prose?.flush();if(disposed||shownPath!==path)return;closeEditor=editAccess(plugin,anchor,path,async reveal=>{if(shownPath===path&&!disposed)await openDetail(path,false,reveal?'.noria-library-work-actions [data-action="open-work"]':null);},undefined,error);});
        reading.onclick=()=>access.value?run(async()=>{try{await openReading(plugin,path);}catch(error){if(error.code!=='media-destination')throw error;editDestination(reading,error.message);}}):editDestination(reading);
        const pin=iconButton(actions,shelf.hasMedia(path)?'pin-off':'pin',shelf.hasMedia(path)?text('移出快捷入口','Remove shortcut'):text('添加到快捷入口','Add to shortcuts'),()=>run(async()=>{await shelf.toggleMedia(path);if(shownPath===path)await openDetail(path);}));
        const menu=iconButton(actions,'ellipsis',text('作品菜单','Work menu'),()=>menuAt(menu,m=>{
          m.addItem(i=>i.setTitle(text('更改入口','Change destination')).setIcon('link').onClick(()=>editDestination(menu)));
          m.addItem(i=>i.setTitle(text('作品模板…','Work template…')).setIcon('file-cog').onClick(()=>run(async()=>{await prose?.flush();configureMediaContent(plugin,item.kinds[0],()=>plugin.app.vault.getAbstractFileByPath(path));})));
          m.addItem(i=>i.setTitle(text('编辑作品资料','Edit work details')).setIcon('file-pen-line').onClick(()=>run(async()=>{await prose?.flush();closeEditor=mediaMetadataEditor(plugin,menu,await readMedia(plugin,{path}),{preferredImage:item.properties.image,onSaved:async(_result,reveal)=>{pendingRefresh=true;if(shownPath===path)await openDetail(path,false,reveal?'.noria-library-work-actions [aria-haspopup="menu"]':null);}});})));
        }));
        menu.setAttribute('aria-haspopup','menu');
        reading.after(position);
        const bar=info.createEl('progress',{cls:'noria-library-position-bar'});
        const paintHeader=()=>{
          heading.setText(item.title);
          creator.setText([item.properties.author||item.properties.director||item.properties.artist||item.properties.developer].flat().filter(Boolean).join(' · '));creator.hidden=!creator.textContent;
          let categories=[item.properties.genre].flat().filter(v=>typeof v==='string'&&v.trim());
          try{categories.push(...require('./media-classification.js').storedTags(item.properties.tags).filter(v=>!require('./media-classification.js').identity(v)));}catch{/* Original malformed values remain editable. */}
          categories=[...new Set([...categories,...item.inlineTags])];classification.setText(categories.join(' · ')||text('添加分类','Add categories'));
          const positionText=[item.properties.status,bookPosition(item,text)].filter(Boolean).join(' · ');
          const positionAction=item.kinds.includes('book')?text('记录阅读进度','Record reading progress'):text('设置状态','Set status');
          position.setText(positionText||(item.kinds.includes('book')?text('进度','Progress'):text('状态','Status')));
          position.setAttribute('aria-label',positionAction+(positionText?'：'+positionText:''));position.title=positionAction;
          const progress=bookProgress(item);bar.hidden=progress?.ratio==null||progress.ratio>=1;
          if(!bar.hidden){bar.max=progress.total;bar.value=progress.page;bar.title=position.textContent;bar.setAttribute('aria-label',position.textContent);}
          reading.setText(access.value?verb():text('关联入口','Link destination'));reading.classList.toggle('mod-cta',!!access.value);
          reading.title=typeof access.value==='string'?access.value.replace(/^!?\[\[|\]\]$/g,''):'';
          const nextArtworkKey=JSON.stringify([item.title,item.kinds[0],coverSource(plugin,item)]);
          if(nextArtworkKey!==artworkKey){artwork.remove();artwork=cover(plugin,header,item);header.prepend(artwork);artworkKey=nextArtworkKey;}
        };
        paintHeader();
        prose=mediaSections(plugin,detail.createDiv({cls:'noria-media-sections'}),path,item.kinds[0]);
        const notesSection=detail.createDiv({cls:'noria-library-notes'}),notesHead=notesSection.createDiv({cls:'noria-library-section-head'});
        notesHead.createEl('h3',{text:text('关联笔记','Linked notes')});
        const sourceLabel=()=>text('打开作品笔记：','Open work note: ')+item.title;
        const original=iconButton(notesHead,'file-text',sourceLabel(),()=>run(async()=>{await prose?.flush();await openMediaLink(plugin,path,'');}));
        original.classList.add('noria-library-source-note');
        let headerVersion=0;
        const unavailable=async message=>{
          pendingRefresh=true;closeEditor?.(false);
          if(!prose?.editing){await back();feedback.setText(message);return;}
          sourceState.hidden=false;sourceState.setText(message+text(' 当前编辑仍保留。',' Your current edit is retained.'));
          for(const button of [reading,position,classification,pin,menu,original])button.disabled=true;
        };
        detail._retarget=async next=>{path=next;shownPath=next;focusPath=next;prose?.setPath(next);await detail._refreshHeader();};
        detail._refreshHeader=async()=>{
          const version=++headerVersion;
          if(!path.startsWith(plugin.normalizePath(config.folder).replace(/\/$/,'')+'/'))return unavailable(text('作品笔记已移出当前目录','The work note moved outside this collection'));
          let next,nextAccess;
          try{[next,nextAccess]=await Promise.all([readMedia(plugin,{path}),readAccess(plugin,path)]);}
          catch(error){
            if(disposed||token!==detailToken||version!==headerVersion||shownPath!==path)return;
            if(error.code==='not-found'||error.code==='unsupported')return unavailable(error.code==='not-found'?text('作品笔记已删除','The work note was deleted'):text('这篇笔记已不属于作品','This note is no longer a work'));
            throw error;
          }
          if(disposed||token!==detailToken||version!==headerVersion||shownPath!==path)return;
          sourceState.hidden=true;sourceState.setText('');for(const button of [reading,position,classification,pin,menu,original])button.disabled=false;
          item=next;access=nextAccess;paintHeader();setTooltip(original,sourceLabel());await prose?.setKind(item.kinds[0]);
        };
        const add=iconButton(notesHead,'plus',text('添加关联笔记','Add linked note'),()=>menuAt(add,m=>{
          m.addItem(i=>i.setTitle(text('新建关联笔记','New linked note')).setIcon('file-plus').onClick(()=>{closeEditor=newRelatedNote(plugin,add,path,paintNotes);}));
          m.addItem(i=>i.setTitle(text('关联已有笔记','Link an existing note')).setIcon('link').onClick(()=>new FileChoice(plugin.app,plugin.app.vault.getMarkdownFiles().filter(f=>f.path!==path),text('关联已有笔记','Link an existing note'),async file=>{await prose?.flush();await associateNote(plugin,path,file.path);paintNotes();}).open()));
        }));add.setAttribute('aria-haspopup','menu');
        const list=notesSection.createDiv({cls:'noria-library-note-list'});
        let notesVersion=0;
        const paintNotes=()=>{
          const version=++notesVersion,focused=list.contains(container.ownerDocument.activeElement)?container.ownerDocument.activeElement.dataset.notePath:null,expanded=!!list.querySelector('details')?.open;
          list.empty();const rows=linkedNotes(plugin,path),direct=rows.filter(r=>!r.incoming),mentions=rows.filter(r=>r.incoming);
          const render=(parent,row)=>{
            const b=parent.createEl('button',{cls:'noria-library-note',attr:{type:'button',title:row.link||row.path}});b.dataset.notePath=row.path;
            const heading=b.createSpan({cls:'noria-library-note-heading'});heading.createSpan({cls:'noria-library-note-title',text:row.title});
            if(row.date)heading.createEl('time',{cls:'noria-card-secondary',text:row.date+(row.time?' · '+row.time:''),attr:{datetime:row.date+(row.time?'T'+row.time:'')}});
            const excerpt=b.createSpan({cls:'noria-library-note-excerpt noria-card-secondary'});excerpt.hidden=true;
            b.onclick=()=>run(async()=>{await prose?.flush();await openMediaLink(plugin,row.link||row.path,path);});return {row,b,excerpt};
          };
          const hydrate=async entries=>{
            for(let i=0;i<entries.length;i+=4){
              if(disposed||version!==notesVersion||!list.isConnected)return;
              await Promise.all(entries.slice(i,i+4).map(async({row,b,excerpt})=>{
                let value;try{const file=plugin.app.vault.getAbstractFileByPath(row.path);if(!file)throw Error('missing');const raw=await plugin.app.vault.cachedRead(file);value=notePreview(raw.replace(/^ {0,3}#{1,6}\s+.*$/gm,''),row.title);}
                catch{value=text('摘要暂不可用，点击打开原文','Preview unavailable; open the note');}
                if(disposed||version!==notesVersion||!b.isConnected)return;excerpt.setText(value);excerpt.hidden=!value;
              }));
            }
          };
          void hydrate(direct.map(row=>render(list,row)));
          if(mentions.length){const more=list.createEl('details');more.open=expanded;more.createEl('summary',{text:text(`其他提及 · ${mentions.length}`,`Other mentions · ${mentions.length}`)});const entries=mentions.map(row=>render(more,row));let loaded=false;more.ontoggle=()=>{if(more.open&&!loaded){loaded=true;void hydrate(entries);}};if(expanded){loaded=true;void hydrate(entries);}}
          if(focused)[...list.querySelectorAll('[data-note-path]')].find(b=>b.dataset.notePath===focused)?.focus({preventScroll:true});
        };
        paintNotes();detail._refreshNotes=paintNotes;
        if(entering)motion.move(frame,header.querySelector('.noria-library-cover'),info);
        if(notes){notesSection.scrollIntoView({block:'nearest'});add.focus({preventScroll:true});}else if(focus)(focus==='back'?backButton:detail.querySelector(focus))?.focus({preventScroll:true});
        if(destinationError)editDestination(reading,destinationError);
      };
      more.onclick=()=>{limit+=30;paint();};
      component.register(shelf.subscribe(()=>{if(!shownPath)paint();}));
      component.registerEvent(plugin.app.workspace.on('noria:media-display',key=>{
        if(key!==preferenceKey()||shownPath)return;
        const panel=container.closest('.noria-workbench-page'),top=panel?.getBoundingClientRect().top||0;
        const anchor=[...grid.children].find(el=>el.dataset.workPath&&el.getBoundingClientRect().bottom>top),before=anchor?.getBoundingClientRect().top;
        const path=anchor?.dataset.workPath,previous=display.view;motion.stop();paint();
        const next=[...grid.children].find(el=>el.dataset.workPath===path);
        if(panel&&next)panel.scrollTop+=next.getBoundingClientRect().top-before;
        if(previous!==display.view&&!container.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches){
          grid.getAnimations().forEach(a=>a.cancel());grid.animate([{opacity:.65},{opacity:1}],{duration:140,easing:'ease-out'});
        }
      }));
      component.registerEvent(plugin.app.workspace.on('noria:media-open',request=>{if(context.mediaPage&&!context.preview&&!container.closest('.noria-media-subpage')?.hidden)run(()=>openDetail(request.path,request.notes,'back',request.destinationError));}));
      component.registerEvent(plugin.app.workspace.on('noria:media-content',()=>{if(shownPath)pendingRefresh=true;else void refresh();}));
      component.registerEvent(plugin.app.metadataCache.on('changed',file=>{if(shownPath===file.path)run(()=>detail._refreshHeader?.());clearTimeout(timer);timer=setTimeout(()=>{if(shownPath){pendingRefresh=true;detail._refreshNotes?.();}else void refresh();},180);}));
      watchCoverImages(plugin,component,container);
      component.registerEvent(plugin.app.vault.on('delete',file=>{if(/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file.path))return;pendingRefresh=true;if(shownPath){detail._refreshNotes?.();run(()=>detail._refreshHeader?.());}else void refresh();}));
      component.registerEvent(plugin.app.vault.on('rename',(file,old)=>{if(shownPath===old||shownPath.startsWith(old+'/')){const next=file.path+shownPath.slice(old.length);items=[];pendingRefresh=true;run(()=>detail._retarget(next));}else if(shownPath)detail._refreshNotes?.();else void refresh();}));
      component.register(()=>{disposed=true;++detailToken;clearTimeout(timer);closeEditor?.(false);void prose?.dispose();});
      void refresh();
    }});

  system.register({id:'noria:media-summary',title:text('近期完成','Recent completions'),icon:'chart-no-axes-combined',
    statistics:{topic:'library',style:'columns',recommended:true,props:{chartStyle:'dots',months:6}},
    description:text('按明确记录的完成日期回看作品。','Review works by their recorded completion dates.'),
    fields:[{key:'folder',label:text('作品目录（留空跟随藏馆）','Media folder (empty follows library)'),type:'folder'},
      {key:'chartStyle',label:text('图表样式','Chart style'),type:'select',default:'dots',options:[{value:'dots',label:text('点阵','Dot matrix')},{value:'columns',label:text('柱形','Columns')}]},
      {key:'months',label:text('最近月数','Recent months'),type:'select',default:6,options:[3,6,12].map(value=>({value,label:String(value)}))}],
    render:({container,component,config,context})=>{
      let timer,disposed=false,selectedMonth='',selectedKind='';const chartState={};
      const paint=()=>{if(disposed)return;
        const active=container.ownerDocument.activeElement,focus=container.contains(active)?{kind:active.dataset.summaryKind,month:active.dataset.month,path:active.dataset.sourcePath,work:active.dataset.completionPath,close:active.dataset.closeSources}:null;
        container.empty();container.addClass('noria-statistic','noria-media-summary');
        const restoreFocus=()=>{if(focus){const buttons=[...container.querySelectorAll('button')],target=buttons.find(b=>focus.kind?b.dataset.summaryKind===focus.kind:focus.path?b.dataset.sourcePath===focus.path:focus.work?b.dataset.completionPath===focus.work:focus.month?b.dataset.month===focus.month:focus.close?b.dataset.closeSources: false)||buttons.find(b=>b.dataset.month===selectedMonth);target?.focus({preventScroll:true});}};
        try{const root=config.folder||folder();if(!root){container.createSpan({cls:'noria-card-secondary',text:text('选择作品目录后即可查看。','Choose a media folder to see statistics.')});return;}
          const result=works(plugin,root),today=plugin.getLocalYmd(),months=Number(config.months)||6;
          selectedKind=completionScope(result.items,context.mediaKind,selectedKind,today,months);
          const items=result.items.filter(item=>item.kinds.includes(selectedKind)),groups=completionGroups(items,today,months),rows=groups.flatMap(g=>g.rows),unit=text(selectedKind==='book'?'本':selectedKind==='music'?'项':'部','works');
          const explanation=container.createDiv({attr:{'data-noria-card-explanation':text('统计口径','Calculation details')},text:text('每部作品按 finishedAt 的明确完成日期计入一次；当前状态不用于推断完成日期，不代表阅读、观看或游玩的次数。未填、无效及未来日期不计入。','Each work is counted once by its explicit finishedAt date. Current status does not imply a completion date or the number of reading, viewing or playing sessions. Missing, invalid and future dates are excluded.')});explanation.hidden=true;
          if(!groups.some(g=>g.key===selectedMonth))selectedMonth='';
          const summary=container.createDiv({cls:'noria-media-stat-range'});
          const scope=summary.createDiv({cls:'noria-media-stat-scope'});
          if(!context.mediaKind){
            const choices=scope.createDiv({cls:'noria-library-types',attr:{role:'group','aria-label':text('完成统计的作品类型','Completion statistics media type')}});
            for(const [kind,icon,zh,en] of [['book','book-open','图书','Books'],['movie','film','影视','Film & TV'],['game','gamepad-2','游戏','Games']]){
              const b=iconButton(choices,icon,text(zh,en),()=>{selectedKind=kind;selectedMonth='';paint();container.querySelector('[data-summary-kind="'+kind+'"]').focus({preventScroll:true});});b.dataset.summaryKind=kind;b.setAttribute('aria-pressed',String(kind===selectedKind));b.tabIndex=kind===selectedKind?0:-1;
            }
            choices.onkeydown=e=>{const buttons=[...choices.children],index=buttons.indexOf(e.target);if(index<0)return;const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowRight'?(index+1)%buttons.length:e.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:-1;if(next>=0){e.preventDefault();buttons[next].click();}};
          }
          scope.createSpan({cls:'noria-media-stat-total',text:`${rows.length} ${unit}`});
          summary.createSpan({cls:'noria-card-secondary',text:`${groups[0].key} – ${today.slice(0,7)}`,attr:{title:`${groups[0].key}-01 – ${today}`}});
          if(!rows.length&&!selectedMonth){container.createDiv({cls:'noria-card-secondary',text:result.unindexed?text('部分笔记仍在索引，稍后刷新即可。','Some notes are still indexing. Refresh shortly.'):text('所选月份暂无完成记录。','No recorded completions in these months.')});restoreFocus();return;}
          const chart=container.createDiv(),list=container.createDiv({cls:'noria-media-stat-works'});
          const reveal=()=>{
            list.empty();list.hidden=!selectedMonth;
            for(const bar of chart.querySelectorAll('[data-month]'))bar.setAttribute('aria-pressed',String(bar.dataset.month===selectedMonth));
            const group=groups.find(g=>g.key===selectedMonth);if(!group)return;
            const head=list.createDiv({cls:'noria-media-stat-heading'});
            head.createEl('h3',{text:group.key});head.createSpan({cls:'noria-card-secondary',text:`${group.value} ${unit}`});
            const close=iconButton(head,'chevron-up',text('收起作品','Hide works'),()=>{const month=selectedMonth;selectedMonth='';reveal();[...chart.querySelectorAll('[data-month]')].find(b=>b.dataset.month===month)?.focus({preventScroll:true});});close.dataset.closeSources='true';
            if(!group.rows.length)list.createSpan({cls:'noria-card-secondary',text:text('这个月份没有已记录的完成作品。','No recorded completions in this month.')});
            renderMediaSources(plugin,list,group.rows,{text,dates:true});
          };
          renderChart(chart,{periods:groups,rows,value:rows.length,recorded:rows.length},{display:'columns',calculate:'count',periodStyle:config.chartStyle||'dots'},
            {text,number:n=>String(n),viewState:chartState,unit,source:()=>{},activate:(_anchor,_selected,month)=>{selectedMonth=month;reveal();}});
          for(const b of chart.querySelectorAll('[data-period]'))b.dataset.month=b.dataset.period;
          reveal();
          if(result.unindexed)container.createDiv({cls:'noria-card-secondary',text:text('部分笔记仍在索引，统计可能不完整。','Some notes are still indexing; statistics may be incomplete.')});
          restoreFocus();
        }catch(e){container.createDiv({cls:'noria-card-error',text:e.message});}};
      const refresh=()=>{clearTimeout(timer);timer=setTimeout(paint,180);};
      component.registerEvent(plugin.app.metadataCache.on('changed',refresh));
      component.registerEvent(plugin.app.vault.on('delete',refresh));
      component.registerEvent(plugin.app.vault.on('rename',refresh));
      component.registerEvent(plugin.app.workspace.on('noria:media-content',refresh));
      watchCoverImages(plugin,component,container);
      component.register(()=>{disposed=true;clearTimeout(timer);});paint();
    }});
}
module.exports={registerMediaWorkspace,openWork};
