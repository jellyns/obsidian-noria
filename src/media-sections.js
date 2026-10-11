"use strict";
const {Component,MarkdownRenderer,Notice,parseYaml}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {contentProfile,readSection,writeSection,mediaReadingParts}=require('./media-content-model.js');
const {frontmatter,writeProperty}=require('./record-properties.js');
const {introDisclosure}=require('./media-intro-disclosure.js');

function mediaSections(plugin,host,path,kind){
  const app=plugin.app,text=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en,component=new Component();component.load();
  let active,pending,disposed=false,closing=false,timer,serial=0,rendered;const rows=new Map();
  const error=host.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),content=host.createDiv({cls:'noria-media-section-list'});
  const report=e=>{if(host.isConnected)error.setText(e.message);else new Notice(e.message);};
  const source=()=>{const file=app.vault.getAbstractFileByPath(path);if(!file||file.extension!=='md')throw Error(text('作品笔记不存在','Work note not found'));return file;};
  const backup=async()=>{
    const entry=active;if(!entry||entry.input.value===entry.original)return false;
    if(typeof app.fileManager.storeTextFileBackup!=='function')throw Error(text('无法备份当前输入，请先复制内容','Unable to back up this draft; copy it before leaving'));
    const value=entry.input.value,raw=entry.property?writeProperty(entry.raw,{property:'description',type:'option',options:[value]},value,parseYaml):writeSection(entry.raw,entry.binding,value);
    await app.fileManager.storeTextFileBackup(path,raw);return true;
  };
  const flush=async()=>{
    await ready;clearTimeout(timer);if(pending){await pending;return flush();}
    const entry=active;if(!entry||entry.input.value===entry.original)return;
    const value=entry.input.value;
    pending=(async()=>{
      let saved;
      try{const file=source();await app.vault.process(file,raw=>{
        if(plugin._noriaPluginDisposed||file.path!==path)throw Error(text('作品笔记已移动或插件已关闭','The work moved or the plugin closed'));
        if(entry.property){const current=frontmatter(raw,parseYaml).value.description;if(current!==entry.original)throw Error(text('简介已在别处修改，当前输入已保留','Description changed elsewhere; your input is retained'));
          saved=writeProperty(raw,{property:'description',type:'option',options:[value]},value,parseYaml);
        }else saved=writeSection(raw,entry.binding,value);
        return saved;
      });entry.raw=saved;entry.original=value;entry.binding=readSection(saved,entry.name);error.setText('');}
      catch(e){
        try{const backup=entry.property?writeProperty(entry.raw,{property:'description',type:'option',options:[value]},value,parseYaml):writeSection(entry.raw,entry.binding,value);app.fileManager.storeTextFileBackup?.(path,backup);}catch{}
        throw e;
      }
    })();try{await pending;}finally{pending=null;}
    if(active===entry&&entry.input.value!==entry.original)return flush();
  };
  const finish=async()=>{const name=active?.name;await flush();active=null;await render();const row=rows.get(name);(row?.add||row?.edit)?.focus({preventScroll:true});};
  const begin=async name=>{
    await flush();if(disposed||closing)return;active=null;await render();const row=rows.get(name);if(!row||disposed)return;
    row.reveal?.();row.body.empty();row.edit.hidden=true;row.section.classList.remove('is-empty');row.section.classList.add('is-editing');
    row.head.querySelector('.noria-media-section-add')?.remove();if(!row.head.querySelector('h3'))row.head.createEl('h3',{text:name});
    const input=row.body.createEl('textarea',{cls:'noria-media-section-input',attr:{'aria-label':name}});input.value=row.value;
    active={...row,name,input,original:row.value};
    const size=()=>{input.style.height='auto';input.style.height=Math.max(110,input.scrollHeight)+'px';};size();
    let composing=false;const schedule=()=>{size();clearTimeout(timer);if(!composing)timer=setTimeout(()=>void flush().catch(report),650);};
    input.oninput=event=>{if(event.isComposing)composing=true;schedule();};
    input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});input.addEventListener('compositionend',()=>{composing=false;schedule();});
    const done=iconButton(row.head,'check',text('完成编辑','Finish editing'),()=>void finish().catch(report));
    input.onkeydown=e=>{if(!e.isComposing&&!composing&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();done.click();}};input.focus();
  };
  const render=async()=>{
    if(disposed||active)return;const token=++serial,file=source(),raw=await app.vault.read(file);if(disposed||token!==serial||active)return;
    const profile=contentProfile(plugin,kind),fm=frontmatter(raw,parseYaml).value;
    rendered?.unload();rendered=new Component();rendered.load();const owner=rendered;rows.clear();content.empty();
    for(const part of mediaReadingParts(raw,profile,parseYaml)){
      if(part.kind==='prose'){
        const prose=content.createDiv({cls:'noria-media-section noria-media-section-body markdown-rendered'});
        await MarkdownRenderer.render(app,part.content,prose,path,owner);
        if(disposed||token!==serial||active)return;
        continue;
      }
      const name=part.name;
      let binding;try{binding=readSection(raw,name);}catch(e){report(e);continue;}
      const property=name===profile.intro&&!binding.exists&&typeof fm.description==='string',value=property?fm.description:binding.content;
      if(!value.trim()&&name!==profile.review&&!binding.exists&&profile.sectionMode!=='selected')continue;
      const section=content.createEl('section',{cls:'noria-media-section'}),head=section.createDiv({cls:'noria-media-section-head'});
      if(value.trim())head.createEl('h3',{text:name});
      const edit=iconButton(head,'pencil',text('编辑','Edit ')+name,()=>void begin(name).catch(report));
      const body=section.createDiv({cls:'noria-media-section-body'});
      rows.set(name,{section,head,edit,body,binding,property,value,raw});
      if(!value.trim()){
        section.classList.add('is-empty');edit.hidden=true;
        const add=head.createEl('button',{cls:'noria-media-section-add',text:text('添加','Add ')+name,attr:{type:'button'}});
        rows.get(name).add=add;add.onclick=()=>void begin(name).catch(report);
      }else await MarkdownRenderer.render(app,value,body,path,owner);
      if(disposed||token!==serial||active)return;
      if(name===profile.intro&&value.trim())rows.get(name).reveal=introDisclosure(section,body,owner,text);
    }
  };
  const ready=render();ready.catch(report);
  component.registerEvent(app.vault.on('modify',file=>{if(file.path===path&&!active)void render().catch(report);}));
  component.registerEvent(app.workspace.on('noria:media-content',changed=>{if(changed===kind)void finish().catch(report);}));
  const api={ready,flush,backup,get editing(){return !!active;},setPath(next){path=next;},async setKind(next){if(disposed||closing||kind===next)return;kind=next;await render();},async dispose({save=true}={}){if(disposed||closing)return;closing=true;clearTimeout(timer);try{if(save)await flush();}catch(e){report(e);}finally{disposed=true;++serial;rendered?.unload();component.unload();delete host._noriaMediaSections;}}};
  host._noriaMediaSections=api;return api;
}
module.exports={mediaSections};
