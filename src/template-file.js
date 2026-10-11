"use strict";
async function openMarkdownTemplate(plugin,path){
  const zh=plugin.getNoriaLocale()==='zh';
  if(!path)throw Error(zh?'请先选择模板文件':'Choose a template file first');
  const normalized=plugin.normalizePath(path),file=plugin.app.vault.getAbstractFileByPath(/\.md$/i.test(normalized)?normalized:normalized+'.md');
  if(!file||file.extension!=='md')throw Error(zh?'模板文件不存在，请重新选择':'Template file not found; choose it again');
  return plugin.app.workspace.getLeaf('tab').openFile(file,{state:{mode:'source'}});
}
function diaryTemplateSettingsTarget(integration,period){
  if(integration==='daily-notes'&&period==='daily')return {core:'daily-notes'};
  const keys={daily:'dailyTemplate',weekly:'weeklyTemplate',monthly:'monthlyTemplate',yearly:'yearlyTemplate'};
  if(integration!=='custom')return {tab:'overview',target:'managedPaths.'+keys[period]};
  const custom={daily:'calendarCustomFilePattern',weekly:'calendarCustomWeekTemplate',monthly:'calendarCustomMonthTemplate',yearly:'calendarCustomYearTemplate'};
  return {tab:'calendar',target:'calendar.'+custom[period]};
}
function openDiaryTemplateSettings(plugin,period){
  const target=diaryTemplateSettingsTarget(plugin.getCalendarSettings().calendarIntegrationMode,period);
  if(target.core){plugin.app.setting.open();plugin.app.setting.openTabById(target.core);}
  else plugin.openNoriaSettings(target.tab,target.target);
}
function attachMarkdownTemplateSuggest(plugin,input){
  const {AbstractInputSuggest}=require('obsidian');
  class TemplateSuggest extends AbstractInputSuggest{
    getSuggestions(query){const q=String(query||'').toLowerCase();return plugin.app.vault.getMarkdownFiles().map(f=>f.path).filter(path=>path.toLowerCase().includes(q)).sort((a,b)=>a.localeCompare(b)).slice(0,30);}
    renderSuggestion(path,el){el.setText(path);}
    selectSuggestion(path){input.value=path;const EventClass=input.ownerDocument.defaultView.Event;input.dispatchEvent(new EventClass('input',{bubbles:true}));input.dispatchEvent(new EventClass('change',{bubbles:true}));this.close();}
  }
  return new TemplateSuggest(plugin.app,input);
}
module.exports={openMarkdownTemplate,diaryTemplateSettingsTarget,openDiaryTemplateSettings,attachMarkdownTemplateSuggest};
