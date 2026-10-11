"use strict";
const {Modal,Menu}=require("obsidian");
const {iconButton}=require("./card-controls.js");
const clone=value=>JSON.parse(JSON.stringify(value));

// A single list/detail panel for record management. Adapters own record writes.
class RecordManager extends Modal {
  constructor(plugin,options){super(plugin.app);this.plugin=plugin;this.options=options;this.filter=options.initialFilter||"";this.query="";this.listTop=0;this.untrack=plugin.cards?.trackModal(this);}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  onOpen(){this.modalEl.addClass("noria-record-manager");this.setTitle(this.options.title);void this.load().then(()=>this.options.initial?this.edit(this.options.initial===true?null:this.rows.find(row=>row.id===this.options.initial)):this.list()).catch(e=>this.error(e));}
  async load(){this.rows=await this.options.list();}
  error(error){const el=this.errorEl||this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});el.setText(error.message||String(error));el.hidden=false;}
  list(){
    this.dirty=false;this.draft=null;this.contentEl.empty();
    const toolbar=this.contentEl.createDiv({cls:"noria-record-toolbar"});
    const search=toolbar.createEl("input",{attr:{type:"search",placeholder:this.text("搜索","Search")}});search.value=this.query;
    iconButton(toolbar,"plus",this.text("新增","Add"),()=>{this.listTop=list.scrollTop;this.edit(null);});
    const tabs=this.contentEl.createDiv({cls:"noria-record-tabs",attr:{role:"tablist"}});
    for(const item of this.options.filters||[]){const button=tabs.createEl("button",{text:item.label,attr:{role:"tab","aria-selected":String(item.value===this.filter)}});button.onclick=()=>{this.query=search.value;this.filter=item.value;this.listTop=0;this.list();};}
    const list=this.contentEl.createDiv({cls:"noria-record-list"});
    const paint=()=>{
      list.empty();const matching=this.rows.filter(row=>(!this.filter||row.stage===this.filter)&&(`${row.name} ${row.path||""} ${this.options.summary?.(row)||""}`).toLowerCase().includes(this.query.trim().toLowerCase()));
      for(const row of matching){
        const line=list.createDiv({cls:"noria-record-row"});
        const button=line.createEl("button",{cls:"noria-record-open"});button.createEl("strong",{text:this.options.label?.(row)||row.name});
        const description=this.options.summary?.(row);if(description)button.createSpan({cls:"noria-card-secondary",text:description});
        button.onclick=()=>{this.listTop=list.scrollTop;this.edit(row);};
        if(this.options.actions||this.options.remove){const more=iconButton(line,"ellipsis",this.text("更多","More"),()=>{
          const menu=new Menu();for(const item of this.options.actions?.(row)||[])menu.addItem(i=>i.setTitle(item.label).setIcon(item.icon||"arrow-right").onClick(()=>this.perform(()=>item.run(row))));
          if(this.options.remove)menu.addItem(i=>i.setTitle(this.options.removeLabel||this.text("移除入口","Remove entry")).setIcon("unlink").onClick(()=>this.edit(row,true)));
          const r=more.getBoundingClientRect();menu.showAtPosition({x:r.right,y:r.bottom,left:true},more.ownerDocument);
        });}
      }
      if(!matching.length)list.createDiv({cls:"noria-card-empty",text:this.query.trim()?this.text("没有匹配的记录","No matching records"):this.text("这里还没有记录","No records here yet")});list.scrollTop=this.listTop;
    };
    search.oninput=()=>{this.query=search.value;this.listTop=0;paint();};paint();
    this.errorEl=this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});this.errorEl.hidden=true;
  }
  async perform(action){try{await action();await this.load();this.list();}catch(e){this.error(e);}}
  edit(record,remove=false){
    this.contentEl.empty();this.original=record?clone(record):null;this.draft=clone(record||this.options.defaults?.()||{});this.dirty=false;
    const top=this.contentEl.createDiv({cls:"noria-card-form-head"});iconButton(top,"arrow-left",this.text("返回列表","Back to list"),()=>this.discard(()=>this.list()));
    top.createSpan({text:remove?this.options.removeLabel||this.text("移除入口","Remove entry"):record?this.text("编辑","Edit"):this.text("新增","Add")});
    const form=this.contentEl.createDiv({cls:"noria-record-form"});this.inputs=new Map();
    if(remove)form.createEl("p",{text:this.options.removeDescription||this.text("从此清单移除，源笔记保留。","Remove this entry from the list. The source note is kept.")});
    else this.renderFields(form);
    this.errorEl=this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});this.errorEl.hidden=true;
    const footer=this.contentEl.createDiv({cls:"noria-card-form-footer"});
    const cancel=footer.createEl("button",{text:this.text("取消","Cancel")});cancel.onclick=()=>this.discard(()=>this.list());
    const save=footer.createEl("button",{cls:"mod-cta",text:remove?(this.options.removeLabel||this.text("移除入口","Remove entry")):this.text("保存","Save")});
    save.onclick=async()=>{
      if(this.saving||save.disabled)return;this.errorEl.hidden=true;
      try{
        if(!remove)for(const [key,input] of this.inputs)if(!input.reportValidity())throw Error(this.text("请检查输入","Check the input"));
        this.saving=true;save.disabled=true;save.setText(this.text("正在保存…","Saving…"));this.contentEl.inert=true;
        await (remove?this.options.remove(this.original):this.options.save(clone(this.draft),this.original));
        this.dirty=false;await this.load();this.list();
      }catch(e){this.error(e);}
      finally{this.saving=false;this.contentEl.inert=false;save.disabled=false;save.setText(remove?(this.options.removeLabel||this.text("移除入口","Remove entry")):this.text("保存","Save"));}
    };
    form.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();save.click();}});
    this.inputs.values().next().value?.focus();
  }
  renderFields(parent){
    const fields=typeof this.options.fields==="function"?this.options.fields(this.draft):this.options.fields;
    for(const field of fields||[]){
      if(field.when&&!field.when(this.draft))continue;
      if(field.render){field.render(parent,this.draft,()=>{this.dirty=true;});continue;}
      if(field.type==="picture"){require("./picture-picker.js").pictureField(this.plugin,parent,this.draft[field.key],value=>{this.draft[field.key]=value;this.dirty=true;field.onChange?.(this.draft,this.inputs);},field.label);continue;}
      const label=parent.createEl("label",{cls:field.type==="checkbox"?"noria-card-field noria-card-field-check":"noria-card-field"});label.createSpan({text:field.label});
      let input;
      if(field.type==="select"){
        input=label.createEl("select");for(const option of field.options||[])input.createEl("option",{value:option.value,text:option.label});
      }else input=label.createEl("input",{attr:{type:["date","time","number","checkbox","color"].includes(field.type)?field.type:"text"}});
      input.required=!!field.required;input.disabled=!!field.disabled;
      if(field.type==="checkbox")input.checked=!!this.draft[field.key];else input.value=this.draft[field.key]??field.default??"";
      if(field.type==="color"&&!/^#[\da-f]{6}$/i.test(this.draft[field.key]||"")){
        const probe=label.createSpan();probe.style.color=field.preview||"var(--interactive-accent)";
        const rgb=label.ownerDocument.defaultView.getComputedStyle(probe).color.match(/[\d.]+/g);
        if(rgb?.length>=3)input.value="#"+rgb.slice(0,3).map(n=>Math.round(Number(n)).toString(16).padStart(2,"0")).join("");probe.remove();
      }
      if(field.min!=null)input.min=field.min;if(field.max!=null)input.max=field.max;if(field.step!=null)input.step=field.step;
      if(field.description)label.createSpan({cls:"noria-card-secondary",text:field.description});
      this.inputs.set(field.key,input);
      const change=()=>{
        const previousValue=this.draft[field.key];
        this.draft[field.key]=field.type==="checkbox"?input.checked:field.type==="number"?(input.value===""?null:Number(input.value)):input.value;this.dirty=true;
        field.onChange?.(this.draft,this.inputs,previousValue);
        if(field.refresh){parent.empty();this.inputs.clear();this.renderFields(parent);this.inputs.get(field.key)?.focus();}
      };
      input.addEventListener(field.type==="select"||field.type==="checkbox"||field.refresh?"change":"input",change);
      if(field.type==="file")this.plugin.attachHomeWidgetSourceSuggest(input,()=>field.fileType||"markdown");
      if(field.type==="property"){
        const id=`noria-property-${crypto.randomUUID()}`,list=label.createEl("datalist",{attr:{id}});input.setAttribute("list",id);
        const names=new Set(this.plugin.filesUnderRoots(this.plugin.getScopeSpec("notes").roots,[".md"]).flatMap(f=>Object.keys(this.app.metadataCache.getFileCache(f)?.frontmatter||{})).filter(k=>k!=="position"));
        for(const value of [...names].sort())list.createEl("option",{value});
      }
    }
  }
  discard(action){
    if(this.saving)return;
    if(!this.dirty){action();return;}
    if(this.discardEl?.isConnected)return;
    this.discardEl=this.contentEl.createDiv({cls:"noria-card-discard",attr:{role:"alert"}});this.discardEl.createSpan({text:this.text("有尚未保存的修改。","There are unsaved changes.")});
    const keep=this.discardEl.createEl("button",{text:this.text("继续编辑","Keep editing")});keep.onclick=()=>this.discardEl.remove();
    const discard=this.discardEl.createEl("button",{text:this.text("放弃修改","Discard changes")});discard.onclick=()=>{this.dirty=false;action();};keep.focus();
  }
  close(force=false){if(this.saving&&!force)return;if(force){this.dirty=false;super.close();}else this.discard(()=>super.close());}
  onClose(){this.untrack?.();}
}
module.exports={RecordManager};
