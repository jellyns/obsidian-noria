"use strict";
const {commitSettingsChange}=require('./settings-change.js');

function displayPreferences(value={}) {
  const preset=mode=>Object.fromEntries(['creator','progress','summary'].map(key=>[key,typeof value?.[mode]?.[key]==='boolean'?value[mode][key]:mode==='details']));
  return {view:value?.view==='details'?'details':'covers',size:Number.isFinite(value?.size)?Math.max(120,Math.min(220,value.size)):160,covers:preset('covers'),details:preset('details')};
}
function displayKey(context,id,kind){return JSON.stringify([context.pageId||context.page||'home',id,kind||'']);}
function readDisplay(plugin,key){return displayPreferences(plugin.settings.mediaLibraryDisplay?.[key]);}
async function saveDisplay(plugin,key,patch){
  await commitSettingsChange(plugin,['mediaLibraryDisplay'],()=>{
    const previous=readDisplay(plugin,key);
    const next=displayPreferences({...previous,...patch,covers:{...previous.covers,...patch.covers},details:{...previous.details,...patch.details}});
    plugin.settings.mediaLibraryDisplay={...plugin.settings.mediaLibraryDisplay,[key]:next};
  });
  plugin.app.workspace.trigger('noria:media-display',key);
}
function bookProgress(item){
  if(!item.kinds.includes('book'))return null;
  const {pageprogress:page,pagecount:total}=item.properties;
  if(!Number.isSafeInteger(page)||page<0)return null;
  return {page,total:Number.isSafeInteger(total)&&total>0?total:null,
    ratio:Number.isSafeInteger(total)&&total>0&&page<=total?page/total:null};
}
module.exports={displayPreferences,displayKey,readDisplay,saveDisplay,bookProgress};
