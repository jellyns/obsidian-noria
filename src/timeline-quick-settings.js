"use strict";
const {Modal,Setting}=require('obsidian');
const {commitSettingsChange}=require('./settings-change.js');
const library=require('./event-library.js');

function openTimelineQuickSettings(plugin){
  const modal=new Modal(plugin.app),zh=plugin.getNoriaLocale()==='zh',t=(cn,en)=>zh?cn:en;
  modal.modalEl.addClass('noria-quick-settings-modal');modal.setTitle(t('快捷时间块','Quick time blocks'));
  const initial=JSON.stringify([plugin.settings.defaultStrategy,plugin.settings.timelineQuickSettings]);
  const draft=structuredClone(plugin.settings.timelineQuickSettings),selected=new Set(draft.pregenItems);
  let strategy=plugin.settings.defaultStrategy,busy=false,snapshot;
  const host=modal.contentEl.createDiv({cls:'noria-quick-settings-body'});
  host.createEl('p',{cls:'setting-item-description',text:t('单项与批量安排共用事件库。这里选择一起添加的时间块；名称和时间在原事件库编辑。','Single and batch additions share the event library. Choose blocks to add together here; edit names and times in the source library.')});
  const source=new Setting(host).setName(t('事件库','Event library')).setDesc(t('正在读取…','Loading…'));
  source.addButton(btn=>btn.setButtonText(t('编辑事件库','Edit library')).onClick(async()=>{
    try{
      btn.setDisabled(true);
      const result=await plugin.ensureManagedNote('templateLibrary');
      if(!result.file)throw Error(t('无法打开事件库。','Unable to open the event library.'));
      modal.close();plugin.app.setting?.close();await plugin.app.workspace.getLeaf('tab').openFile(result.file);
    }catch(e){error.setText(e.message);}finally{btn.setDisabled(false);}
  }));
  const scope=new Setting(host).setName(t('默认范围','Default scope'));
  const span=new Setting(host).setName(t('从选中日期起 · 天数','Days from selected date'));
  span.addText(input=>{input.setValue(String(draft.pregenSpanDays)).onChange(value=>draft.pregenSpanDays=Number(value));input.inputEl.type='number';input.inputEl.min='1';input.inputEl.max='366';});
  const syncScope=()=>{span.settingEl.hidden=strategy!=='mixed';};
  scope.addDropdown(dd=>dd.addOption('daily',t('当天','Selected day')).addOption('weekly',t('所在周','Selected week')).addOption('mixed',t('自选天数','Number of days')).setValue(strategy).onChange(value=>{strategy=value;syncScope();}));syncScope();
  const list=host.createDiv({cls:'noria-quick-settings-list'});
  const error=host.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
  const footer=modal.contentEl.createDiv({cls:'noria-card-form-footer'});
  const cancel=footer.createEl('button',{text:t('取消','Cancel')});cancel.onclick=()=>{if(!busy)modal.close();};
  const save=footer.createEl('button',{text:t('保存','Save'),cls:'mod-cta'});save.disabled=true;
  save.onclick=async()=>{
    if(busy||!snapshot)return;
    error.setText('');
    try{
      if(strategy==='mixed'&&(!Number.isInteger(draft.pregenSpanDays)||draft.pregenSpanDays<1||draft.pregenSpanDays>366))throw Error(t('天数请填写1–366。','Enter 1–366 days.'));
      busy=true;save.disabled=cancel.disabled=true;
      const fresh=await library.read(plugin);
      if(fresh.path!==snapshot.path||fresh.revision!==snapshot.revision)throw Error(t('事件库已变化，请重新打开。','The event library changed. Reopen this editor.'));
      draft.pregenItems=[...selected];
      await commitSettingsChange(plugin,['defaultStrategy','timelineQuickSettings'],()=>{
        if(JSON.stringify([plugin.settings.defaultStrategy,plugin.settings.timelineQuickSettings])!==initial)throw Error(t('设置已变化，请重新打开。','Settings changed. Reopen this editor.'));
        plugin.settings.defaultStrategy=strategy;plugin.settings.timelineQuickSettings=draft;
      });
      plugin.requestNoriaRefresh('all','settings:quick-blocks',{reloadViews:true});modal.close();
    }catch(e){error.setText(e.message);}finally{busy=false;save.disabled=cancel.disabled=false;}
  };
  modal.ready=(async()=>{
    try{
      snapshot=await library.read(plugin);
      source.setDesc(snapshot.exists?snapshot.path:t('内置 · 编辑时保存为事件库','Built-in · saved as a file when edited'));
      for(const item of snapshot.items){
        const duration=zh?(item.durationMin>=60?`${Math.floor(item.durationMin/60)}小时${item.durationMin%60?item.durationMin%60+'分':''}`:`${item.durationMin}分钟`):`${item.durationMin} min`;
        new Setting(list).setName(item.label).setDesc(item.startTime?`${item.startTime} · ${duration}${item.crossDay?t(' · 次日',' · next day'):''}`:t('全天','All day'))
          .addToggle(toggle=>toggle.setValue(selected.has(item.key)).onChange(value=>value?selected.add(item.key):selected.delete(item.key)));
      }
      for(const key of [...selected])if(!snapshot.items.some(item=>item.key===key)){
        const row=new Setting(list).setName(t('未找到的时间块','Missing time block')).setDesc(key);
        row.addButton(btn=>btn.setButtonText(t('取消选择','Deselect')).onClick(()=>{selected.delete(key);row.settingEl.remove();}));
      }
      if(!snapshot.items.length)list.createEl('p',{text:t('事件库还没有时间块，可打开原文件添加。','No time blocks yet. Open the library to add one.')});
      save.disabled=false;
    }catch(e){error.setText(e.message);}
  })();
  modal.open();return modal;
}
module.exports={openTimelineQuickSettings};
