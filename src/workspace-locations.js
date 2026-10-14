"use strict";

const {commitSettingsChange} = require('./settings-change.js');
const tr = (plugin, zh, en) => plugin.getNoriaLocale() === 'zh' ? zh : en;

function previewLocations(plugin, draft) {
  if (!['ipara', 'standard', 'custom'].includes(draft.profile)) throw Error('Invalid location preset');
  const {validatePath} = require('./workspace-setup.js');
  const workspaceRoot = draft.profile === 'standard'
    ? validatePath(draft.workspaceRoot, {folder:true})
    : plugin.settings.onboarding.workspaceRoot;
  const current = plugin.settings.onboarding;
  const unchanged = draft.profile === current.profile && (draft.profile !== 'standard' || workspaceRoot === current.workspaceRoot);
  const managedPaths = draft.profile === 'custom' || unchanged ? {...plugin.settings.managedPaths}
    : {...plugin.getStarterProfileManagedPaths(draft.profile, {workspaceRoot})};
  if(draft.profile === 'custom') for(const key of require('./workspace-setup.js').rootKeys) {
    if(Object.hasOwn(draft.roots || {},key)) managedPaths[key]=validatePath(draft.roots[key],{folder:true});
  }
  // A storage preset changes sources, not the user's chosen note templates.
  for (const key of require('./workspace-setup.js').templateKeys) managedPaths[key] = plugin.settings.managedPaths[key] || '';
  const changes = Object.entries(managedPaths).filter(([key, value]) => value !== plugin.settings.managedPaths[key])
    .map(([key, value]) => ({key, before:plugin.settings.managedPaths[key] || '', after:value}));
  return {profile:draft.profile, workspaceRoot, managedPaths, changes};
}

async function saveLocations(plugin, draft) {
  const next = previewLocations(plugin, draft);
  if(draft.expected && draft.expected !== JSON.stringify([plugin.settings.onboarding,plugin.settings.managedPaths])) throw Error(tr(plugin,'位置设置已变化，请重新打开。','Locations changed. Reopen this editor.'));
  if(next.profile === 'ipara') await require('./workspace-setup.js').ensureIPARAFolders(plugin);
  if (!plugin.settings.onboarding.locationsPending && !next.changes.length && next.profile === plugin.settings.onboarding.profile && next.workspaceRoot === plugin.settings.onboarding.workspaceRoot) return next;
  await commitSettingsChange(plugin, ['onboarding', 'managedPaths'], () => {
    if(draft.expected && draft.expected !== JSON.stringify([plugin.settings.onboarding,plugin.settings.managedPaths])) throw Error(tr(plugin,'位置设置已变化，请重新打开。','Locations changed. Reopen this editor.'));
    plugin.settings.onboarding = {...plugin.settings.onboarding, profile:next.profile, workspaceRoot:next.workspaceRoot, locationsPending:false};
    plugin.settings.managedPaths = {...next.managedPaths};
  });
  plugin.requestNoriaRefresh?.('all', 'settings:content-locations');
  return next;
}

function shouldOfferLocationSetup(onboarding, version) {
  return onboarding?.locationsPending === true && !onboarding.initializedAt && onboarding.dismissedVersion !== version;
}

function offerLocationSetup(plugin, obsidian) {
  if(shouldOfferLocationSetup(plugin.settings.onboarding,plugin.manifest.version)) return openLocationSetup(plugin,obsidian,{firstUse:true});
}

function openLocationSetup(plugin, {Modal}, {firstUse=!plugin.settings.onboarding?.initializedAt,onSaved,anchor}={}) {
  if(plugin._locationSetupModal) {plugin._locationSetupModal.contentEl.querySelector('select')?.focus();return plugin._locationSetupModal;}
  const t=(zh,en)=>tr(plugin,zh,en), setup=require('./workspace-setup.js');
  const modal=new Modal(plugin.app);plugin._locationSetupModal=modal;
  modal.titleEl.setText(firstUse?t('内容放在哪里？','Where should your content live?'):t('更改存放位置','Change content locations'));
  modal.modalEl.addClass('noria-location-modal');
  const editor=modal.contentEl;editor.addClass('noria-location-editor');
  editor.createEl('p',{cls:'noria-location-intro',text:firstUse
    ? t('选择笔记的存放方式，之后可以在设置中更改。','Choose where notes live. You can change this later in settings.')
    : t('保存后从所选位置读取和新建内容。已有文件不搬动，自定义模板保留。','Read and create content in the selected locations. Existing files stay in place and custom templates are kept.')});
  const draft={profile:plugin.settings.onboarding.profile,workspaceRoot:plugin.settings.onboarding.workspaceRoot||'Noria',roots:{},expected:JSON.stringify([plugin.settings.onboarding,plugin.settings.managedPaths])};
  const label=editor.createEl('label',{cls:'noria-settings-field'});label.createSpan({text:t('存放方式','Layout')});
  const choice=label.createEl('select');
  for(const [id,name] of [['ipara',t('IPARA · 根目录（推荐）','IPARA · vault folders (recommended)')],['standard',t('集中存放','One workspace folder')],['custom',t('自定义位置','Custom locations')]]) choice.createEl('option',{value:id,text:name});
  choice.value=draft.profile;
  const root=editor.createEl('label',{cls:'noria-settings-field'});root.createSpan({text:t('集中目录','Workspace folder')});
  const input=root.createEl('input',{type:'text',value:draft.workspaceRoot});
  const custom=editor.createDiv({cls:'noria-location-custom'}), rootInputs=[];
  const rootNames={inboxRoot:'Inbox',projectsRoot:t('项目','Projects'),diaryRoot:t('日记','Diary')};
  for(const key of setup.rootKeys) {
    draft.roots[key]=plugin.settings.managedPaths[key];
    const row=custom.createEl('label',{cls:'noria-settings-field'});row.createSpan({text:rootNames[key]});
    const field=row.createEl('input',{type:'text',value:draft.roots[key]});rootInputs.push(field);
    field.oninput=()=>{draft.roots[key]=field.value;update();};
  }
  const preview=editor.createDiv({cls:'noria-location-preview'});
  let examples;
  if(firstUse) {
    const row=editor.createEl('label',{cls:'noria-start-examples'});
    examples=row.createEl('input',{type:'checkbox'});
    examples.checked=true;
    row.createSpan({text:t('添加入门示例','Add starter examples')});
    editor.createEl('p',{cls:'noria-location-example-hint',text:t('待办、习惯、倒计时、Inbox 与项目。都可以直接修改，不生成完成记录。','Tasks, habits, a countdown, Inbox and a project. All are editable, with no completed records.')});
  }
  const error=editor.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
  const actions=editor.createDiv({cls:'noria-start-actions'});
  const cancel=actions.createEl('button',{text:firstUse?t('稍后','Later'):t('取消','Cancel')});
  const save=actions.createEl('button',{text:firstUse?t('开始使用','Get started'):t('保存位置','Save locations'),cls:'mod-cta'});
  let busy=false,confirmed=false;
  const controls=[choice,input,...rootInputs,cancel,save,...(examples?[examples]:[])];
  const setBusy=value=>{busy=value;controls.forEach(control=>{control.disabled=value;});};
  const update=()=>{
    root.hidden=draft.profile!=='standard';custom.hidden=draft.profile!=='custom';preview.empty();error.setText('');
    try {
      const next=previewLocations(plugin,draft);save.disabled=false;
      if(draft.profile==='ipara') {
        preview.createEl('p',{text:t('确认后补齐以下目录，已有内容保持原样。','Confirm to create any missing folders. Existing content is kept.')});
        const list=preview.createEl('ul',{cls:'noria-location-folders'});
        for(const path of setup.iparaFolders)list.createEl('li',{text:path});
      } else if(draft.profile==='standard') {
        preview.createEl('p',{text:t('集中在一个目录内，保存内容时创建。','Keep content in one folder, created as you save.')});
      } else preview.createEl('p',{text:t('连接已有目录，也可以填写新的库内目录。其他位置保留，可在设置中逐项调整。','Use existing or new vault folders. Other locations are kept and can be changed individually in settings.')});
      const showPaths=(parent,rows)=>{
        if(!rows.length)return;
        const list=parent.createEl('dl');
        for(const item of rows) {
          list.createEl('dt',{text:rootNames[item.key]||plugin.t(`settings.path.${item.key}`)});
          const row=list.createEl('dd');
          if(!firstUse && item.before!==undefined){row.createSpan({cls:'noria-location-before',text:item.before||t('内置','Built-in')});row.createSpan({text:' → '});}
          row.createSpan({text:item.after||t('内置','Built-in')});
        }
      };
      if(draft.profile!=='custom') {
        const expected={diaryRoot:'06_Diary',inboxRoot:'00_Inbox',projectsRoot:'01_Projects'};
        const roots=setup.rootKeys.map(key=>next.changes.find(row=>row.key===key)||{key,after:next.managedPaths[key]});
        // The IPARA directory list already states the default paths; show overrides or actual changes only.
        showPaths(preview,roots.filter(row=>draft.profile!=='ipara'||row.before!==undefined||row.after!==expected[row.key]));
        const other=next.changes.filter(row=>!setup.rootKeys.includes(row.key));
        if(other.length) {
          const details=preview.createEl('details',{cls:'noria-location-more'});
          details.createEl('summary',{text:t(`同时调整 ${other.length} 项内容位置`,`Also change ${other.length} content locations`)});
          showPaths(details,other);
        }
      }
    }catch(e){error.setText(e.message);save.disabled=true;}
  };
  choice.onchange=()=>{draft.profile=choice.value;update();};input.oninput=()=>{draft.workspaceRoot=input.value;update();};
  const close=modal.close.bind(modal);
  modal.close=async(force=false)=>{
    if(busy&&!force)return;
    if(firstUse&&!confirmed&&!force) {
      setBusy(true);
      try {await commitSettingsChange(plugin,['onboarding'],()=>{plugin.settings.onboarding.dismissedVersion=plugin.manifest.version;});}
      catch(e){error.setText(e.message);setBusy(false);return;}
    }
    close();
  };
  cancel.onclick=()=>void modal.close();
  save.onclick=async()=>{
    if(busy)return;setBusy(true);error.setText('');
    try {
      await saveLocations(plugin,draft);
      // Keep retries valid if creating the optional notes fails after saving paths.
      draft.expected=JSON.stringify([plugin.settings.onboarding,plugin.settings.managedPaths]);
      if(firstUse){await setup.finishSetup(plugin,{examples:examples.checked});await plugin.openDashboardHomeLeaf?.();}
      confirmed=true;await modal.close(true);if(firstUse)plugin.app.setting?.close();onSaved?.();
    }catch(e){error.setText(e.message);setBusy(false);}
  };
  modal.onClose=()=>{delete plugin._locationSetupModal;if(anchor?.isConnected)anchor.focus();};
  plugin.register?.(()=>{if(plugin._locationSetupModal===modal)void modal.close(true);});
  update();modal.open();choice.focus();return modal;
}

function renderLocations(tab, container, obsidian) {
  const {Setting}=obsidian;
  const plugin = tab.plugin, t = (zh,en) => tr(plugin,zh,en);
  const names = {ipara:t('IPARA · 根目录','IPARA · vault folders'), standard:t('集中存放','One workspace folder'), custom:t('自定义位置','Custom locations')};
  const profile = plugin.settings.onboarding?.profile || 'ipara';
  const setting = new Setting(container).setName(t('存放位置','Content locations'))
    .setDesc(names[profile] + (profile === 'standard' ? ` · ${plugin.settings.onboarding.workspaceRoot}` : ''));
  if(profile === 'ipara' && plugin.settings.onboarding?.initializedAt && require('./workspace-setup.js').iparaFolders.some(path=>!plugin.app.vault.getAbstractFileByPath(path))) {
    setting.addButton(button=>button.setButtonText(t('补齐目录','Complete folders')).onClick(()=>void tab.runSettingsActionButton(button,async()=>{
      await require('./workspace-setup.js').ensureIPARAFolders(plugin);tab.display();
    })));
  }
  setting.addButton(button=>button.setButtonText(t('更改','Change')).onClick(()=>openLocationSetup(plugin,obsidian,{onSaved:()=>tab.display(),anchor:button.buttonEl})));
}

function renderObsidianSync(tab, parent, {Setting, Modal}) {
  const plugin=tab.plugin,t=(zh,en)=>tr(plugin,zh,en);
  const settings=plugin.settings.calendar || {};
  // When Daily Notes owns the source, copying Noria's settings back would reverse that relationship.
  if(settings.calendarIntegrationMode!=='noria')return;
  const row=new Setting(parent).setName(t('同步给 Obsidian 日记','Use these settings in Obsidian Daily Notes'))
    .setDesc(t('需要从 Obsidian 创建相同日记时使用。先查看目录、日期格式与模板的变化。','Use when creating the same daily notes from Obsidian. Review folder, date format and template changes first.'));
  if(!plugin.getManagedPath('dailyTemplate')){
    row.setDesc(t('Obsidian 使用文件模板。需要共用时，先将上方的内置日记模板另存为 .md。','Obsidian uses template files. To share a template, save the built-in daily template as .md above.'));
    return;
  }
  row.addButton(button=>button.setButtonText(t('查看改动','Review changes')).onClick(()=>void tab.runSettingsActionButton(button,async()=>{
    const expected=plugin.getObsidianTemplateConfigExpected();
    const before=await plugin.readObsidianJsonConfig(plugin.getObsidianConfigPath('daily-notes.json')) || {};
    const modal=new Modal(plugin.app);modal.titleEl.setText(t('同步日记设置','Sync daily note settings'));
    const list=modal.contentEl.createEl('dl',{cls:'noria-sync-preview'});
    for(const [key,name] of [['folder',t('目录','Folder')],['format',t('日期格式','Date format')],['template',t('模板','Template')]]){
      list.createEl('dt',{text:name});list.createEl('dd',{text:`${before[key]||t('未设置','Not set')} → ${expected.dailyNotes[key]||t('未设置','Not set')}`});
    }
    const templatesBefore=await plugin.readObsidianJsonConfig(plugin.getObsidianConfigPath('templates.json')) || {};
    list.createEl('dt',{text:t('模板目录','Templates folder')});
    list.createEl('dd',{text:`${templatesBefore.folder||t('未设置','Not set')} → ${expected.templates.folder||t('库根目录','Vault root')}`});
    modal.contentEl.createEl('p',{text:t('同时更新 Obsidian 模板插件的模板目录。不会修改已有日记。','Also updates the Templates plugin folder. Existing notes stay unchanged.')});
    const error=modal.contentEl.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
    const actions=modal.contentEl.createDiv({cls:'noria-start-actions'});
    actions.createEl('button',{text:t('取消','Cancel')}).onclick=()=>modal.close();
    const apply=actions.createEl('button',{text:t('同步设置','Sync settings'),cls:'mod-cta'});
    apply.onclick=async()=>{apply.disabled=true;try{await plugin.syncObsidianTemplateConfigs();modal.close();}catch(e){error.setText(e.message);apply.disabled=false;}};
    modal.open();
  })));
}

module.exports={previewLocations,saveLocations,shouldOfferLocationSetup,offerLocationSetup,openLocationSetup,renderLocations,renderObsidianSync};
