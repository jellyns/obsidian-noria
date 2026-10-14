"use strict";
const {commitSettingsChange}=require('./settings-change.js');
const {readingTarget}=require('./link-target.js');
const key=entry=>`${entry.kind==='media'?'file':entry.kind}:${entry.target}`;
function normalize(entries){
 const seen=new Set();return (Array.isArray(entries)?entries:[]).filter(e=>e&&['file','media','page','url'].includes(e.kind)&&typeof e.target==='string'&&e.target.trim()).map(e=>({...e,target:e.target.trim()})).filter(e=>{const id=key(e);if(seen.has(id))return false;seen.add(id);return true;});
}
function renameEntries(entries,before,after){return entries.map(e=>{
 if(!['media','file'].includes(e.kind))return e;
 const [path,...location]=e.target.split('#');
 const next=path===before?after:path.startsWith(before+'/')?after+path.slice(before.length):path;
 return {...e,target:next+(location.length?'#'+location.join('#'):'')};
});}
function migrate(settings){
 settings.shortcuts=normalize([...(settings.shortcuts||[]),...(settings.mediaShelf||[]).map(target=>({kind:'media',target}))]);delete settings.mediaShelf;
 const visit=value=>{if(!value||typeof value!=='object')return;if(value.source==='noria:media-shortcuts')value.source='noria:shortcuts';for(const child of Object.values(value))visit(child);};
 for(const field of ['home','workbenchPages','cardLayouts'])visit(settings[field]);
 if(settings.shortcutsPlacementVersion===1)return;
 const widgets=settings.home.widgets;let card=widgets.find(w=>w.source==='noria:shortcuts');
 if(!card){card={id:'quick-access',type:'extension',source:'noria:shortcuts',title:'',enabled:true,size:'full',layout:{colSpan:12},props:{}};widgets.push(card);}
 const sorted=widgets.filter(w=>w!==card).sort((a,b)=>(a.order||0)-(b.order||0)),moc=sorted.findIndex(w=>(w.builtinId||w.id)==='moc-strip');
 sorted.splice(moc<0?sorted.length:moc,0,card);sorted.forEach((w,i)=>w.order=i*10);settings.shortcutsPlacementVersion=1;
}
class Shortcuts {
 constructor(plugin){this.plugin=plugin;this.listeners=new Set();plugin.registerEvent(plugin.app.vault.on('rename',(file,old)=>{
  if(JSON.stringify(renameEntries(this.entries(),old,file.path))!==JSON.stringify(this.entries()))void this.change(entries=>renameEntries(entries,old,file.path)).catch(e=>console.error('Noria shortcut rename',e));
 }));}
 entries(){return normalize(this.plugin.settings.shortcuts);}
 hasMedia(path){return this.entries().some(e=>key(e)===key({kind:'media',target:path}));}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 async initialize(){
  const s=this.plugin.settings;
  if(s.shortcutsPlacementVersion===1&&!Object.hasOwn(s,'mediaShelf'))return;
  await commitSettingsChange(this.plugin,['shortcuts','mediaShelf','home','workbenchPages','cardLayouts','shortcutsPlacementVersion'],()=>migrate(s));
 }
 async change(fn){
  let restored=false;
  await commitSettingsChange(this.plugin,['shortcuts','home'],()=>{this.plugin.settings.shortcuts=normalize(fn(this.entries()));if(this.entries().length){const card=this.plugin.settings.home.widgets.find(w=>w.source==='noria:shortcuts');if(card){restored=card.enabled===false;card.enabled=true;}}});
  for(const fn of this.listeners)fn();
  if(restored)await this.plugin.requestNoriaRefresh?.('home','shortcuts:restore',{immediate:true});
 }
 async put(entry,previous){
  if(!['media','file','page','url'].includes(entry.kind)||!entry.target?.trim())throw Error('请选择入口 / Choose a destination');
  if(entry.kind==='url'&&readingTarget(entry.target)?.type!=='url')throw Error('请输入有效链接 / Enter a valid link');
  await this.change(entries=>{if(entries.some(e=>key(e)===key(entry)&&key(e)!==previous))throw Error('此入口已添加 / Already added');const index=entries.findIndex(e=>key(e)===previous);if(index<0)entries.push(entry);else entries[index]=entry;return entries;});
 }
 remove(id){return this.change(entries=>entries.filter(e=>key(e)!==id));}
 toggleMedia(path){const id=key({kind:'media',target:path});return this.hasMedia(path)?this.remove(id):this.put({kind:'media',target:path});}
 move(id,target){return this.change(entries=>{const from=entries.findIndex(e=>key(e)===id),to=entries.findIndex(e=>key(e)===target);if(from>=0&&to>=0)entries.splice(to,0,...entries.splice(from,1));return entries;});}
}
module.exports={Shortcuts,key,normalize,renameEntries,migrate};
