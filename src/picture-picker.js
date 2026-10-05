"use strict";
const O=require("obsidian"),M=require("./picture-model.js");
function renderPicture(plugin,host,value,fallback="circle"){
 host.empty();host.addClass("noria-picture");host.removeAttribute("title");
 if(!M.validPicture(value))value=fallback;
 if(value.startsWith("emoji:")){host.setText(decodeURIComponent(value.slice(6)));return;}
 if(value.startsWith("asset:")){
  const path=plugin.settings.pictureAssets?.[value.slice(6)],file=path&&plugin.app.vault.getAbstractFileByPath(path);
  if(file&&M.imageExtensions.has(file.extension?.toLowerCase())){const img=host.createEl("img",{attr:{src:plugin.app.vault.getResourcePath(file),alt:"",draggable:"false"}});img.onerror=()=>{host.empty();O.setIcon(host,"image-off");host.title=path;};return;}
  O.setIcon(host,"image-off");host.title=(plugin.getNoriaLocale()==="zh"?"图样未找到，请重新选择：":"Image missing; choose another: ")+(path||value);return;
 }
 if(require("./record-pictures.js").renderRecordPicture(host,value))return;
 O.setIcon(host,value);if(!host.childNodes.length)O.setIcon(host,fallback);
}
class PicturePicker extends O.Modal{
 constructor(plugin,value,save){super(plugin.app);this.plugin=plugin;this.value=value;this.save=save;this.kind="icons";this.query="";this.limit=80;this.untrack=plugin.cards?.trackModal(this);}
 t(a,b){return this.plugin.getNoriaLocale()==="zh"?a:b;}
 onOpen(){this.modalEl.addClass("noria-picture-picker");this.setTitle(this.t("选择图样","Choose a picture"));this.paint();}
 paint(){
  this.contentEl.empty();const tabs=this.contentEl.createDiv({cls:"noria-record-tabs"});
  for(const [id,zh,en] of [["icons","通用图标","Icons"],["emoji","Emoji","Emoji"],["files","我的图样","My pictures"]]){const b=tabs.createEl("button",{text:this.t(zh,en),attr:{"aria-pressed":String(this.kind===id)}});b.onclick=()=>{this.kind=id;this.query="";this.limit=80;this.paint();};}
  const search=this.contentEl.createEl("input",{attr:{type:"search",placeholder:this.t("搜索名称","Search names"),"aria-label":this.t("搜索图样","Search pictures")}});search.value=this.query;
  const controls=this.contentEl.createDiv({cls:"noria-picture-options"}),grid=this.contentEl.createDiv({cls:"noria-picture-grid"});
  this.error=this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});
  const footer=this.contentEl.createDiv({cls:"noria-card-form-footer"}),reset=footer.createEl("button",{text:this.t("使用默认图样","Use default")});reset.onclick=()=>this.choose("");
  const choice=(value,label)=>{const b=grid.createEl("button",{cls:"noria-picture-choice",attr:{type:"button","aria-label":label,"aria-pressed":String(value===this.value)}});renderPicture(this.plugin,b.createSpan(),value);O.setTooltip(b,label);b.onclick=()=>this.choose(value);};
  let draw;
  if(this.kind==="icons"){
   const ids=[...Object.keys(require("./record-pictures.js").pictures),...(O.getIconIds?.()||[])];
   draw=()=>{grid.empty();const query=this.query.toLowerCase();const names=require("./record-visual.js");const rows=ids.filter(id=>(id+" "+names.iconLabel(id.replace(/^lucide-/,""),true)).toLowerCase().includes(query));
    for(const id of rows.slice(0,this.limit))choice(id,names.iconLabel(id.replace(/^lucide-/,""),this.plugin.getNoriaLocale()==="zh"));
    if(rows.length>this.limit){const more=grid.createEl("button",{text:this.t("更多","More")});more.onclick=()=>{this.limit+=80;draw();};}};
  }else if(this.kind==="emoji"){
   search.placeholder=this.t("输入或粘贴 Emoji","Type or paste an emoji");
   draw=()=>{grid.empty();const values=this.query?[this.query.trim()]:["🌱","📚","💧","🌙","☀️","🏃","🎨","🧘","🎯","❤️"];
    for(const text of values){const value="emoji:"+encodeURIComponent(text);if(M.validPicture(value))choice(value,text);}};
  }else{
   const path=controls.createEl("input",{attr:{type:"text",placeholder:this.t("选择仓库内图样目录","Choose a vault folder"),"aria-label":this.t("图样目录","Picture folder")}});path.value=this.plugin.settings.pictureFolder||"";
   const list=controls.createEl("datalist",{attr:{id:"noria-picture-folders-"+crypto.randomUUID()}});path.setAttribute("list",list.id);
   for(const folder of this.app.vault.getAllLoadedFiles().filter(f=>f.children&&f.path!=="/"))list.createEl("option",{value:folder.path});
   const label=controls.createEl("label"),recursive=label.createEl("input",{attr:{type:"checkbox"}});recursive.checked=true;label.appendText(this.t("包含子目录","Include subfolders"));
   draw=()=>{grid.empty();const root=this.app.vault.getAbstractFileByPath(path.value);if(!root?.children||root.path==="/"){grid.createSpan({text:this.t("先选择一个图样目录","Choose a picture folder first")});return;}
    const rows=[],visit=folder=>{for(const f of folder.children){if(f.children){if(recursive.checked)visit(f);}else if(M.imageExtensions.has(f.extension?.toLowerCase())&&f.name.toLowerCase().includes(this.query.toLowerCase()))rows.push(f);}};visit(root);rows.sort((a,b)=>a.path.localeCompare(b.path));
    for(const file of rows.slice(0,this.limit)){const b=grid.createEl("button",{cls:"noria-picture-choice",attr:{type:"button","aria-label":file.name}});b.createEl("img",{attr:{src:this.app.vault.getResourcePath(file),alt:"",loading:"lazy"}});O.setTooltip(b,file.path);b.onclick=()=>void this.chooseAsset(file,path.value);}
    if(!rows.length)grid.createSpan({text:this.t("此目录没有匹配的图样","No matching pictures in this folder")});
    if(rows.length>this.limit){const more=grid.createEl("button",{text:this.t("更多","More")});more.onclick=()=>{this.limit+=80;draw();};}};
   path.onchange=()=>{this.limit=80;draw();};recursive.onchange=()=>draw();
  }
  search.oninput=()=>{this.query=search.value;this.limit=80;draw();};draw();search.focus();
 }
 async chooseAsset(file,folder){
  const old=this.plugin.settings.pictureAssets,oldFolder=this.plugin.settings.pictureFolder;
  const assets={...old},id=Object.keys(assets).find(id=>assets[id]===file.path)||crypto.randomUUID();assets[id]=file.path;
  this.plugin.settings.pictureAssets=assets;this.plugin.settings.pictureFolder=folder;
  try{await this.plugin.saveSettings();await this.choose("asset:"+id);}catch(e){this.plugin.settings.pictureAssets=old;this.plugin.settings.pictureFolder=oldFolder;this.error.setText(e.message);}
 }
 async choose(value){try{await this.save(value);this.close();}catch(e){this.error.setText(e.message);}}
 onClose(){this.untrack?.();}
}
function pictureField(plugin,parent,value,onChange,label){
 const row=parent.createDiv({cls:"noria-card-field"});row.createSpan({text:label|| (plugin.getNoriaLocale()==="zh"?"图样":"Picture")});
 const b=row.createEl("button",{cls:"noria-picture-field",attr:{type:"button","aria-label":label||"Picture"}}),image=b.createSpan(),name=b.createSpan();
 const paint=()=>{renderPicture(plugin,image,value);name.setText(value?.startsWith("asset:")?plugin.settings.pictureAssets?.[value.slice(6)]?.split("/").pop()||"…":value?.startsWith("emoji:")?decodeURIComponent(value.slice(6)):value?require("./record-visual.js").iconLabel(value.replace(/^lucide-/,""),plugin.getNoriaLocale()==="zh"): (plugin.getNoriaLocale()==="zh"?"默认":"Default"));};paint();
 b.onclick=()=>new PicturePicker(plugin,value,async next=>{await onChange(next);value=next;paint();}).open();return b;
}
module.exports={PicturePicker,pictureField,renderPicture};
