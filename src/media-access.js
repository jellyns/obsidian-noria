"use strict";
const {parseYaml} = require('obsidian');
const {createHash} = require('node:crypto');
const {frontmatter, writeProperty} = require('./record-properties.js');
const {readingTarget} = require('./media-workspace-model.js');
const {datedName} = require('./dated-notes.js');


const revision = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
async function readAccess(plugin, path) {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!file || file.extension !== 'md') throw Error('作品笔记不存在 / Work note not found');
  const {value} = frontmatter(await plugin.app.vault.read(file), parseYaml);
  return {path, value:value['media-open'] ?? '', revision:revision(value['media-open'])};
}
async function saveAccess(plugin, snapshot, value) {
  const target = readingTarget(value), file = plugin.app.vault.getAbstractFileByPath(snapshot.path);
  if (!file || file.extension !== 'md') throw Error('作品笔记不存在 / Work note not found');
  if (target?.type === 'file' && !plugin.app.metadataCache.getFirstLinkpathDest(target.value.split('#')[0], file.path))
    throw Error('找不到入口文件，请重新选择 / Destination file not found; choose again');
  const stored = target?.type === 'file' ? `[[${target.value}]]` : target?.value || null;
  await plugin.app.vault.process(file, raw => {
    if (file.path !== snapshot.path || plugin._noriaPluginDisposed) throw Error('页面已变化，请重新打开 / Reopen this work');
    const {value: current} = frontmatter(raw, parseYaml);
    if (revision(current['media-open']) !== snapshot.revision) throw Error('作品入口已在别处修改，请重新打开后保存 / Work destination changed elsewhere');
    if ((current['media-open'] ?? null) === stored || current['media-open'] === value.trim()) return raw;
    return writeProperty(raw, {property:'media-open', type:'option', options:[stored]}, stored, parseYaml);
  });
}
async function openReading(plugin, path) {
  const state = await readAccess(plugin, path);let target;
  try{
    if(typeof state.value!=='string')throw Error('入口格式无效，请重新关联 / Invalid destination; choose it again');
    target=readingTarget(state.value);
  }catch(error){throw Object.assign(error,{code:'media-destination'});}
  if (!target) return false;
  if (target.type === 'file') {
    if (!plugin.app.metadataCache.getFirstLinkpathDest(target.value.split('#')[0], path))
      throw Object.assign(Error('入口文件已移动或不可用，请重新关联 / Destination file unavailable; choose it again'),{code:'media-destination'});
    await openMediaLink(plugin,target.value,path);
  } else window.open(target.value, '_blank', 'noopener');
  return true;
}
// Returning to an open work keeps its reader position; explicit anchors still navigate.
async function openMediaLink(plugin, link, sourcePath) {
  const {workspace,metadataCache}=plugin.app;
  const target=metadataCache.getFirstLinkpathDest(link.split('#')[0],sourcePath);
  let existing;
  if(target)workspace.iterateAllLeaves?.(leaf=>{if(!existing&&leaf.view?.file?.path===target.path)existing=leaf;});
  if(existing){
    await workspace.revealLeaf(existing);
    workspace.setActiveLeaf(existing,{focus:true});
    if(link.includes('#'))await workspace.openLinkText(link,sourcePath,false);
  }else await workspace.openLinkText(link,sourcePath,true);
}
function linkedNotes(plugin, path) {
  const cache = plugin.app.metadataCache, file = plugin.app.vault.getAbstractFileByPath(path), found = new Map();
  if (!file) return [];
  const describe = (note, incoming) => {
    const dated=datedName(note.name || note.basename+'.md'),title=cache.getFileCache(note)?.frontmatter?.title;
    return {path:note.path,title:typeof title==='string'&&title.trim()?title.trim():dated?.title||note.basename,date:dated?.date||'',time:dated?.time||'',incoming};
  };
  const add = (target, source, incoming) => {
    const resolved = cache.getFirstLinkpathDest(target.split('#')[0], source);
    if (!resolved || resolved.extension !== 'md' || resolved.path === path) return;
    if (!found.has(resolved.path)) found.set(resolved.path, {...describe(resolved,incoming),link:resolved.path+(target.includes('#')?target.slice(target.indexOf('#')):'')});
  };
  const own = cache.getFileCache(file);
  for (const link of [...(own?.links || []), ...(own?.frontmatterLinks || []).filter(link => link.key !== 'media-open')]) add(link.link, path, false);
  // Resolved links cover both body and frontmatter and keep ordinary mentions out of experience counts.
  for (const [source, targets] of Object.entries(cache.resolvedLinks || {})) {
    if (!targets[path] || source === path || found.has(source)) continue;
    const note = plugin.app.vault.getAbstractFileByPath(source);
    if (!note || note.extension !== 'md') continue;
    const fm = cache.getFileCache(note)?.frontmatter;
    const explicit = [fm?.related].flat().some(value => {
      const match = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(String(value));
      return match && cache.getFirstLinkpathDest(match[1].split('#')[0], source)?.path === path;
    });
    found.set(source, describe(note,!explicit));
  }
  return [...found.values()].sort((a,b) => Number(a.incoming)-Number(b.incoming) || b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.title.localeCompare(b.title));
}
async function associateNote(plugin, workPath, notePath) {
  const work = plugin.app.vault.getAbstractFileByPath(workPath), note = plugin.app.vault.getAbstractFileByPath(notePath);
  if (!work || !note || note.extension !== 'md' || workPath === notePath) throw Error('请选择其他笔记 / Choose another note');
  await plugin.app.fileManager.processFrontMatter(work, fm => {
    const current = fm.related == null ? [] : Array.isArray(fm.related) ? fm.related : [fm.related];
    const exists = current.some(value => {
      const match = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(String(value));
      return match && plugin.app.metadataCache.getFirstLinkpathDest(match[1].split('#')[0], work.path)?.path === note.path;
    });
    if (!exists) fm.related = [...current, `[[${note.path.replace(/\.md$/, '')}]]`];
  });
}
async function createRelatedNote(plugin,workPath,name){
  const vault=plugin.app.vault,work=vault.getAbstractFileByPath(workPath);
  if(!work||work.extension!=='md')throw Error('作品笔记不存在 / Work note not found');
  const title=String(name||'').trim().replace(/\.md$/i,'');
  if(!title||/[<>:"/\\|?*\x00-\x1f]/.test(title)||/[. ]$/.test(title)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title))throw Error('请填写可用的笔记名称 / Enter a valid note name');
  if(/[\r\n[\]|#]/.test(workPath))throw Error('作品路径无法表示为链接 / Work path cannot be represented as a link');
  const folder=workPath.includes('/')?workPath.slice(0,workPath.lastIndexOf('/')+1):'',path=folder+title+'.md';
  if(vault.getAbstractFileByPath(path))throw Error('已有同名笔记，请使用关联已有笔记 / This note exists; link the existing note');
  const heading=datedName(title+'.md')?.title||title;
  const raw='---\nrelated: '+JSON.stringify(['[['+workPath.replace(/\.md$/i,'')+']]'])+'\n---\n\n## '+heading+'\n\n';
  await vault.create(path,raw);return {path};
}
module.exports = {readAccess, saveAccess, openReading, openMediaLink, linkedNotes, associateNote,createRelatedNote};
