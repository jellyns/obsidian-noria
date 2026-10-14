"use strict";

const templateKeys = ["dailyTemplate", "weeklyTemplate", "monthlyTemplate", "yearlyTemplate"];
const rootKeys = ["diaryRoot", "inboxRoot", "projectsRoot"];
const optionalKeys = [...templateKeys];
const iparaFolders = ['00_Inbox','01_Projects','02_Areas','03_Resources','04_Archives','05_MOC','06_Diary','99_Attachment'];
const text = (plugin, zh, en) => plugin.getNoriaLocale() === "zh" ? zh : en;

async function ensureIPARAFolders(plugin) {
  const vault = plugin.app.vault, missing = [];
  // Check all names before creating any folders. An existing note is never replaced.
  for (const path of iparaFolders) {
    const entry = vault.getAbstractFileByPath(path);
    const stat = entry ? {type:Array.isArray(entry.children) ? 'folder' : 'file'} : await vault.adapter.stat(path);
    if (stat && stat.type !== 'folder') throw Error(text(plugin, `“${path}”已被文件占用，请先更名。`, `“${path}” is a file. Rename it before creating the folders.`));
    if (!stat) missing.push(path);
  }
  for (const path of missing) {
    if (!await vault.adapter.exists(path)) await vault.createFolder(path);
  }
  return missing;
}

function validatePath(value, {optional = false, folder = false} = {}) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/$/, "");
  if (!path && optional) return "";
  if (!path || /^(?:\/|[a-z]:)|(^|\/)\.{1,2}(\/|$)|[<>:"|?*]/i.test(path)) throw Error("请选择库内的有效位置 / Choose a valid vault path");
  if (!folder && !/\.(md|base)$/i.test(path)) throw Error("请选择 .md 或 .base 文件 / Choose an .md or .base file");
  return path;
}

function exampleFiles(plugin) {
  const p = plugin.settings.managedPaths;
  const zh = plugin.getNoriaLocale() === "zh";
  const project = `${p.projectsRoot}/${zh ? "开始使用 Noria" : "Getting started with Noria"}`;
  const name = zh ? "开始使用 Noria" : "Getting started with Noria";
  const today=plugin.getLocalYmd();
  const {writeHabitDefinition}=require('./habit-definition.js');
  const {updateCountdown,shiftDate}=require('./countdown-document.js');
  const intro=zh ? '这是一份入门示例，可以直接修改或移除。尚未记录任何完成情况。\n' : 'Starter examples you can edit or remove. No completions have been recorded.\n';
  let habits=intro;
  for(const [id,draft] of [
    ['noria-starter-reading',{name:zh?'阅读二十分钟':'Read for twenty minutes',type:'number',target:'20',unit:zh?'分钟':'minutes',icon:'book-open',color:'#6d5dfc'}],
    ['noria-starter-walk',{name:zh?'出门散步':'Go for a walk',type:'',icon:'footprints',color:'#08b94e'}]
  ]) habits=writeHabitDefinition(habits,null,{...draft,stage:'active',weekdays:'1234567',startedOn:today},{id,zh,today});
  const countdowns=updateCountdown(intro,null,{name:zh?'一周后回顾 · 示例':'One-week review · example',start:today,date:shiftDate(today,7),type:zh?'入门示例':'Starter example'},{id:'noria-starter-review',zh});
  // These are editable instructions, never invented personal history or completed tasks.
  return [
    {path: `${p.inboxRoot}/${zh ? "一个待整理的想法" : "An idea to revisit"}.md`, content: zh ? "## 一个待整理的想法\n\n这里可以记下想了解的问题，明确归属后再移动这篇笔记。\n" : "## An idea to revisit\n\nCapture a question here. Move this note when its destination is clear.\n"},
    {path: `${project}/${name}.md`, content: zh ? `## 目标\n\n熟悉自己的工作台。这是入门示例，可以替换成你的项目。\n\n## 下一步\n\n- [ ] 试着完成一条待办 [due:: ${today}]\n- [ ] 打开今天的日记，写下一个想法 [due:: ${today}]\n\n## 记录\n\n` : `## Goal\n\nGet familiar with your workspace. Replace this starter example with your own project.\n\n## Next step\n\n- [ ] Try completing a task [due:: ${today}]\n- [ ] Open today's diary and capture a thought [due:: ${today}]\n\n## Notes\n\n`},
    {path:p.habitRegistry,content:habits},
    {path:p.importantDates,content:countdowns},
  ];
}

async function finishSetup(plugin, {examples = false} = {}) {
  const created = [], skipped = [];
  const folders = plugin.settings.onboarding?.profile === 'ipara' ? await ensureIPARAFolders(plugin) : [];
  // Finish is idempotent, uses current edited paths, and never rewrites a user file.
  for (const item of examples ? exampleFiles(plugin) : []) {
    const path = validatePath(item.path);
    if (plugin.app.vault.getAbstractFileByPath(path) || await plugin.app.vault.adapter.exists(path)) {skipped.push(path); continue;}
    await plugin.ensureVaultParent(path);
    await plugin.app.vault.create(path, item.content);
    created.push(path);
  }
  const previous = plugin.settings.onboarding || {};
  plugin.settings.onboarding = {...previous, locationsPending:false, initializedAt: previous.initializedAt || new Date().toISOString(),
    lastInitializationResult: {action: "start", created, skipped, folders},
    examplePaths: [...new Set([...(previous.examplePaths || []), ...created])]};
  await plugin.saveSettings();
  plugin.requestNoriaRefresh?.('home', 'workspace:started');
  return {ok: true, created, skipped, folders, repaired: []};
}

function openHelp(plugin, obsidian, topic = "start") {
  const settingsEl=plugin.app.setting?.activeTab?.containerEl;
  const sourceDocument=settingsEl?.checkVisibility?.() ? settingsEl.ownerDocument : plugin.app.workspace.containerEl?.ownerDocument;
  const returnFocus=sourceDocument?.activeElement;
  const modal = new obsidian.Modal(plugin.app);
  modal.onClose=()=>{if(returnFocus?.isConnected)returnFocus.focus();};
  modal.titleEl.setText(text(plugin, "Noria 使用指南", "Noria guide"));
  modal.contentEl.addClass("noria-built-in-help");
  const topics = [
    ["start", "开始使用", "Getting started", "可以直接添加待办或收集箱笔记。确认使用 IPARA 后会补齐八个顶层目录，已有内容保持原样。也可以选择集中存放或已有位置；默认模板内置，无需生成说明文件。", "Add a task or Inbox note right away. Confirming IPARA creates its eight top-level folders while keeping existing content. You can also choose one workspace folder or your existing locations. Templates are built in."],
    ["inbox", "收集箱", "Inbox", "想法与待处理资料保存在所选收集箱目录。打开原笔记阅读或修改；按住条目可安排下一步，去向明确后移出收集箱。日记中的随手记仍留在日记，不自动复制到这里。", "Keep ideas and incoming material in your chosen Inbox folder. Open the original note to read or edit, hold an entry to assign a next step, and move it when its destination is clear. Diary notes are not copied here."],
    ["suggestions", "建议用法", "Using suggestions", "建议可以自己写，也可以来自 Codex 等外部助手。Noria 负责展示和修改；分析与对话仍在你使用的助手中进行。\n\n点击卡片的 ＋ 或“添加建议”，输入内容后保存。窗口会显示实际保存位置，内容写入对应日记的 ## 建议 段落；每条建议一项，可用 [[笔记名称]] 链接项目或其他原笔记。\n\n让助手写入时，先告诉它对应日记的路径和 ## 建议 标题，请它保留其他段落。助手能访问本库时可直接编辑原文；不能访问时，把结果粘贴到“添加建议”即可。直接写 Markdown 无需开启外部助手连接。\n\n每条建议的 … 可修改或删除，删除后可撤销；卡片的 … 可打开原文。有内容后，“建议用法”仍在卡片菜单里。查看此说明不会生成建议或说明笔记。", "Write suggestions yourself or bring them from an external assistant such as Codex. Noria displays and edits them; analysis and conversation stay in your assistant.\n\nSelect + or Add suggestion, enter the text, and save. The editor shows the actual destination: the ## 建议 section of the corresponding daily note. Use one list item per suggestion and [[Note name]] links to projects or other notes.\n\nTo have an assistant write suggestions, give it that daily note path and the ## 建议 heading, and ask it to preserve other sections. An assistant with vault access can edit the original Markdown; otherwise paste its response into Add suggestion. Direct Markdown editing does not require an external-assistant connection.\n\nUse an item's … menu to edit or delete it, with Undo after deletion. The card's … menu opens the source and always includes Using suggestions. Reading this guide creates no suggestions or guide notes."],
    ["templates", "笔记与模板", "Notes and templates", "日记默认使用内置模板，无需额外模板文件。可预览、另存为自定义模板，或选用已有 .md。修改模板只影响之后新建的笔记；已有内容保持原样。", "Diaries use built-in templates without extra files. Preview, save a custom copy, or choose an existing .md. Template edits affect new notes only."],
    ["data", "内容与数据", "Content and data", "项目、日记等读取原笔记。卡片布局保存在插件设置，不写入原笔记。Base 是可选的原生浏览方式，不需要生成它才能使用 Noria。", "Projects and diaries read their original notes. Card layouts live in plugin settings, not your notes. Base views are optional."],
  ];
  const input = modal.contentEl.createEl("input", {type:"search", placeholder:text(plugin,"搜索帮助","Search help"), attr:{"aria-label":text(plugin,"搜索帮助","Search help")}});
  const selected=topics.find(entry=>entry[0]===topic);
  if(topic!=="start"&&selected)input.value=text(plugin,selected[1],selected[2]);
  const body = modal.contentEl.createDiv();
  modal.contentEl.createEl('a',{text:text(plugin,'完整使用手册 ↗','Full user guide ↗'),attr:{href:'https://github.com/jellyns/obsidian-noria/blob/main/docs/'+(plugin.getNoriaLocale()==='zh'?'zh-CN/':'')+'USER-GUIDE.md',target:'_blank',rel:'noopener noreferrer'}});
  const draw = () => {
    body.empty();
    const query = input.value.trim().toLowerCase();
    let count = 0;
    for (const [id, zh, en, cn, english] of topics) {
      const title = text(plugin, zh, en), content = text(plugin, cn, english);
      if (query && !(title + content).toLowerCase().includes(query)) continue;
      count++;
      const section = body.createEl("section");section.dataset.topic = id;
      section.createEl("h3", {text:title});
      for(const paragraph of content.split('\n\n'))section.createEl("p", {text:paragraph});
      if(id==='suggestions'){
        section.createEl('small',{text:text(plugin,'写法示例（不会自动保存）','Writing example (not saved automatically)')});
        section.createEl('pre',{text:text(plugin,'## 建议\n\n- [[项目笔记]]：先列出目前最需要澄清的问题，再安排下一步。','## 建议\n\n- [[Project note]]: Identify the question to clarify before planning the next step.')});
      }
    }
    if (!count) body.createEl("p", {text:text(plugin,"没有找到相关说明。试试“模板”或“Inbox”。","No matching help. Try “templates” or “Inbox”.")});
  };
  input.addEventListener("input",draw);draw();modal.open();
  return modal;
}

function renderStart(tab, container, obsidian) {
  const plugin = tab.plugin, zh = plugin.getNoriaLocale() === "zh";
  if (plugin.settings.onboarding?.initializedAt) return;
  const host=container.createDiv({cls:'noria-start-panel'});
  host.createEl('h3',{text:zh?'从自己的内容开始':'Start with your content'});
  host.createEl('p',{text:zh?'确认存放位置后开始。也可以直接在主页添加待办、收集箱笔记或习惯。':'Choose content locations, or start adding tasks, Inbox notes and habits from Home.'});
  const button=host.createEl('button',{text:zh?'选择存放位置':'Choose content locations',cls:'mod-cta'});
  button.onclick=()=>require('./workspace-locations.js').openLocationSetup(plugin,obsidian,{firstUse:true,onSaved:()=>tab.display(),anchor:button});
}

function renderProfile(tab, container, obsidian) {
  return require('./workspace-locations.js').renderLocations(tab,container,obsidian);
}

function renderPath(tab, container, key, name, obsidian) {
  const plugin=tab.plugin, value=plugin.getManagedPath(key), isTemplate=templateKeys.includes(key), isRoot=rootKeys.includes(key);
  const setting=new obsidian.Setting(container).setName(name).setDesc(value || text(plugin,"内置","Built-in"));
  tab.decorateSettingsTarget(setting,`managedPaths.${key}`);
  if(isRoot) setting.descEl.appendText(text(plugin," · 保存内容时创建"," · Created when saving content"));
  let editor;
  if(isTemplate) setting.addButton(btn=>btn.setButtonText(text(plugin,"预览","Preview")).onClick(async()=>{
    if(value) return require('./template-file.js').openMarkdownTemplate(plugin,value);
    const modal=new obsidian.Modal(plugin.app);modal.titleEl.setText(name);modal.contentEl.createEl("pre",{text:plugin.getManagedNoteSeed(key)});modal.open();
  }));
  setting.addButton(btn=>btn.setButtonText(text(plugin,"更改","Change")).onClick(()=>{
    if(editor){editor.hidden=!editor.hidden;return;}
    editor=container.createDiv({cls:"noria-path-editor"});setting.settingEl.after(editor);
    const input=editor.createEl("input",{type:"text",value,placeholder:isTemplate?text(plugin,"留空使用内置模板","Leave empty for built-in"):value,attr:{"aria-label":name}});
    if(isTemplate) require('./template-file.js').attachMarkdownTemplateSuggest(plugin,input);
    const feedback=editor.createDiv({cls:"noria-card-error",attr:{role:"alert"}});
    const actions=editor.createDiv({cls:"noria-start-actions"});
    const cancel=actions.createEl("button",{text:text(plugin,"取消","Cancel")});cancel.onclick=()=>{editor.remove();editor=null;btn.buttonEl.focus();};
    const save=actions.createEl("button",{text:text(plugin,"保存","Save"),cls:"mod-cta"});
    let saving=false;
    const persist=async create=>{
      if(saving)return;saving=true;
      for(const button of actions.querySelectorAll('button'))button.disabled=true;feedback.setText("");
      try {
        const next=validatePath(input.value,{optional:optionalKeys.includes(key),folder:isRoot});
        if(isTemplate && next && !/\.md$/i.test(next))throw Error(text(plugin,"请选择 .md 模板文件","Choose a .md template file"));
        if(create && !next)throw Error(text(plugin,"请填写模板保存路径","Enter a template path"));
        if(create){
          if(await plugin.app.vault.adapter.exists(next))throw Error(text(plugin,"该位置已有文件，请选择它或另取名称","File exists. Select it or choose another name."));
          await plugin.ensureVaultParent(next);await plugin.app.vault.create(next,plugin.getManagedNoteSeed(key));
        } else if(isTemplate && next && plugin.app.vault.getAbstractFileByPath(next)?.extension?.toLowerCase()!=='md')throw Error(text(plugin,"模板不存在，请选择已有 Markdown 文件，或另存内置模板","Template not found. Choose an existing Markdown file or save a built-in copy."));
        const previous=plugin.settings.managedPaths[key];plugin.settings.managedPaths[key]=next;
        try{await plugin.saveSettings();}catch(e){plugin.settings.managedPaths[key]=previous;throw e;}
        tab.display();
      }catch(e){feedback.setText(e.message);for(const button of actions.querySelectorAll('button'))button.disabled=false;}finally{saving=false;}
    };
    save.onclick=()=>void persist(false);
    if(isTemplate){const copy=actions.createEl("button",{text:text(plugin,"另存内置模板","Save built-in copy")});copy.onclick=()=>void persist(true);}
    input.focus();
  }));
  if(!isRoot&&!isTemplate&&value) setting.addButton(btn=>btn.setButtonText(plugin.app.vault.getAbstractFileByPath(value)?text(plugin,"打开","Open"):text(plugin,"创建","Create")).onClick(async()=>{
    await tab.runSettingsActionButton(btn,async()=>{const result=await plugin.ensureManagedNote(key);if(result.file)await plugin.app.workspace.getLeaf('tab').openFile(result.file);});
  }));
  if(key==="inboxQueue") setting.addButton(btn=>btn.setButtonText(text(plugin,"检查更新","Check updates")).onClick(()=>plugin.openCompanionFileUpdates()));
}

module.exports={templateKeys,rootKeys,optionalKeys,iparaFolders,ensureIPARAFolders,validatePath,exampleFiles,finishSetup,openHelp,renderStart,renderProfile,renderPath};
