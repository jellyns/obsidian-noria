"use strict";

const {createHash} = require('crypto');
const model = require('./runtime/core/adapters/timeline-actions-adapter.js');
const digest = text => createHash('sha256').update(text).digest('hex');
const keyOf = item => model.toSlug(item.timelineTag.replace(/^#(?:tl|timeline)\//i,''));
const signature = item => JSON.stringify([item.label,item.timelineTag,item.startTime,item.durationMin,!!item.crossDay]);
const pathOf = (plugin, value) => {
  const path=require('./workspace-setup.js').validatePath(value || plugin.getManagedPath('templateLibrary'));
  if(!/\.md$/i.test(path))throw Error('事件库需要使用 Markdown 文件。');
  return path;
};

function parse(text) {
  return model.parseEventTemplateLibrary(text).map(item => ({...item,key:keyOf(item)}));
}

async function read(plugin, path) {
  path = pathOf(plugin,path);
  const adapter=plugin.app.vault.adapter, exists=await adapter.exists(path);
  // Missing optional files use the same built-in content until the user creates one.
  // An intentionally empty file stays empty, including when all rows are unchecked.
  const text=exists ? await adapter.read(path) : plugin.getManagedNoteSeed('templateLibrary');
  const items=parse(text), keys=new Set();
  for(const item of items){
    if(keys.has(item.key)) throw Error(`事件库中有重复标签，请修改原文件：${item.timelineTag}`);
    keys.add(item.key);
  }
  return {path,exists,text,items,revision:digest(text),source:exists?'library':'builtin'};
}

function migrationPlan(text, quick) {
  const items=parse(text), additions=[], mapping=Object.create(null), selected=new Set(quick.pregenItems || []);
  for(const [oldKey, raw] of Object.entries(quick.items || {})){
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error(`时间块 ${oldKey} 格式无效，原配置已保留。`);
    const tags=String(raw.tags || '').match(/#(?:tl|timeline)\/[^\s#]+/i);
    const item=model.normalizeEventTemplate({...raw,label:raw.label || oldKey,timelineTag:raw.timelineTag || raw.tag || tags?.[0] || '#tl/'+model.toSlug(oldKey)});
    const original=signature(item);
    let match=items.find(row=>signature(row)===original);
    if(!match){
      const conflicts=items.some(row=>keyOf(row)===keyOf(item));
      if(conflicts){
        item.timelineTag+='-batch-'+digest(original).slice(0,8);
        item.label+=' · 原批量';
        match=items.find(row=>signature(row)===signature(item));
        if(!match && items.some(row=>keyOf(row)===keyOf(item))) throw Error('迁移条目标签已被修改，请先检查事件库。');
      }
      if(!match){match=item;items.push(item);additions.push(model.buildEventTemplateLine(item,true));}
    }
    mapping[oldKey]=keyOf(match);
  }
  // Unknown selections remain visible as missing references, rather than disappearing.
  return {text:additions.length?text+(text.endsWith('\n')?'\n':'\n\n')+additions.join('\n')+'\n':text,
    mapping,selected:[...selected].map(key=>mapping[key] || key),additions};
}

async function migrate(plugin, input) {
  const quick=input.timelineQuickSettings;
  if(input.migrations?.eventLibrary===1 && !quick?.items) return {settings:input,changed:false};
  const settings=structuredClone(input);
  if(quick?.items && Object.keys(quick.items).length){
    const normalized=plugin.normalizeSettings(input), path=pathOf(plugin,normalized.managedPaths.templateLibrary);
    const snapshot=await read(plugin,path), plan=migrationPlan(snapshot.text,quick), adapter=plugin.app.vault.adapter;
    const receipt={schema:1,path,source:snapshot.exists?snapshot.text:null,sourceHash:snapshot.exists?snapshot.revision:null,
      previous:quick,mapping:plan.mapping,resultHash:digest(plan.text)};
    const body=JSON.stringify(receipt,null,2)+'\n',dir=`${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/migrations`;
    if(!await adapter.exists(dir))await adapter.mkdir(dir);
    const receiptPath=dir+'/event-library-'+digest(body).slice(0,16)+'.json';
    if(!await adapter.exists(receiptPath))await adapter.write(receiptPath,body);
    if(await adapter.read(receiptPath)!==body)throw Error('事件库迁移恢复记录校验失败，未保存新配置。');
    if(plan.additions.length){
      if(snapshot.exists){
        const file=plugin.app.vault.getAbstractFileByPath(path);
        if(!file || typeof plugin.app.vault.process!=='function')throw Error('事件库尚未可用，请重新加载后迁移。');
        await plugin.app.vault.process(file,current=>{
          if(current!==snapshot.text)throw Error('事件库已变化，请重新加载后迁移。');
          return plan.text;
        });
      }else{
        await plugin.ensureVaultParent(path);
        await plugin.app.vault.create(path,plan.text);
      }
      if(await adapter.read(path)!==plan.text)throw Error('事件库迁移结果校验失败，原配置保留在恢复记录中。');
    }else if(snapshot.exists && await adapter.read(path)!==snapshot.text)throw Error('事件库已变化，请重新加载后迁移。');
    settings.timelineQuickSettings={...quick,pregenItems:plan.selected};
  }
  if(settings.timelineQuickSettings)delete settings.timelineQuickSettings.items;
  settings.migrations={...settings.migrations,eventLibrary:1};
  return {settings,changed:true};
}

async function open(plugin,path){
  const snapshot=await read(plugin,path);
  let file=plugin.app.vault.getAbstractFileByPath(snapshot.path);
  if(!snapshot.exists){await plugin.ensureVaultParent(snapshot.path);file=await plugin.app.vault.create(snapshot.path,snapshot.text);}
  if(!file)throw Error('事件库尚未可用，请稍后重新打开。');
  return plugin.app.workspace.getLeaf('tab').openFile(file);
}

module.exports={read,open,migrate,migrationPlan,parse,keyOf};
