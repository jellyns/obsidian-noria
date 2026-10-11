"use strict";
const {createHash} = require('node:crypto');
const {parseYaml} = require('obsidian');
const {readMedia} = require('./media-record.js');
const {datedName,experienceName,experienceMarkdown,readExperience} = require('./media-experience-document.js');
const {dayNumber} = require('./countdown-document.js');
const queues = new WeakMap();
const fail = (code,message,reason) => Object.assign(Error(message),{code,reason});
function checkDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayNumber(date))) throw fail('invalid-input','请选择有效日期 / Choose a valid date');
}
function folderOf(path) { return path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : ''; }
async function collect(plugin,work,start,end) {
  const items = [], unreadable = [];
  const files = plugin.app.vault.getMarkdownFiles().filter(file => {
    const date = datedName(file.name || file.path.split('/').at(-1));
    return date && date.date >= start && date.date <= end && file.path !== work.path;
  });
  // Dates bound the read; the explicit related link owns the association.
  // Read source frontmatter rather than trusting a possibly stale metadata tag.
  for (let i=0;i<files.length;i+=24) await Promise.all(files.slice(i,i+24).map(async file => {
    try {
      const raw = await plugin.app.vault.read(file);
      const item = readExperience(raw,{path:file.path,workPath:work.path,parseYaml,resolve:link => {
        const resolved = plugin.app.metadataCache.getFirstLinkpathDest(link,file.path);
        return resolved?.path || (link.replace(/\.md$/i,'') === work.path.replace(/\.md$/i,'') ? work.path : null);
      }});
      if (item) items.push({...item,sourceRevision:createHash('sha256').update(raw).digest('hex')});
    } catch (error) { unreadable.push({path:file.path,message:error.message}); }
  }));
  items.sort((a,b)=>b.date.localeCompare(a.date)||(a.time||'').localeCompare(b.time||'')||a.path.localeCompare(b.path));
  return {items,unreadable};
}
async function readExperienceDay(plugin,{path,date}) {
  checkDate(date);
  const work = await readMedia(plugin,{path}), found = await collect(plugin,work,date,date);
  const revision = 'media-experience-v2-'+createHash('sha256').update(JSON.stringify([work.path,date,found.items.map(i=>[i.path,i.sourceRevision])])).digest('hex');
  return {work,workPath:work.path,date,revision,...found};
}
async function addExperience(plugin,request) {
  const {path,date,revision,body,time} = request;
  checkDate(date);
  if (date > plugin.getLocalYmd()) throw fail('invalid-input','不能把未来日期作为已发生的体验 / Experiences cannot be in the future');
  if (typeof revision !== 'string' || !revision || Object.keys(request).some(k=>!['path','date','revision','body','title','time'].includes(k))) throw fail('invalid-input','请先读取当天记录 / Read this date first');
  const operation = async () => {
    if (plugin._noriaPluginDisposed) throw fail('unsupported','Noria is unloaded');
    const before = await readExperienceDay(plugin,{path,date});
    if (before.unreadable.length) throw fail('conflict','有笔记读取失败，请核对后重试 / Some notes could not be read; retry after checking them');
    if (before.revision !== revision) throw fail('conflict','已有记录改变，请重新读取 / Experiences changed; reload before saving');
    const work = before.work;
    const title = request.title === undefined ? work.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').trim()+(plugin.getNoriaLocale()==='zh'?'感受':' experience') : request.title;
    const name = experienceName({date,title,time}), folder = folderOf(work.path), target = folder ? folder+'/'+name : name;
    const markdown = experienceMarkdown({workPath:work.path,title:title.trim(),body});
    const vault = plugin.app.vault;
    if (!vault.getAbstractFileByPath(work.path)) throw fail('conflict','作品已移动，请重新打开 / The work moved; reopen it');
    if (vault.getAbstractFileByPath(target)) throw fail('conflict','当日已有同名笔记，可打开原文补充，或调整名称／时间 / This note exists; open it or choose a different title or time','filename');
    if (plugin._noriaPluginDisposed) throw fail('unsupported','Noria is unloaded');
    try { await vault.create(target,markdown); }
    catch (error) {
      if (vault.getAbstractFileByPath(target)) throw fail('conflict','同名笔记已存在，请核对原文 / The note already exists; check the original','filename');
      throw error;
    }
    // The note is committed. A refresh failure must not invite a duplicate save.
    let refreshWarning;
    try { plugin.requestNoriaRefresh('review','media:experience'); } catch (_) { refreshWarning='Saved; reopen the view to refresh'; }
    return {ok:true,path:target,date,workPath:work.path,refreshWarning};
  };
  const pending = (queues.get(plugin)||Promise.resolve()).catch(()=>{}).then(operation);
  queues.set(plugin,pending);
  try { return await pending; } finally { if (queues.get(plugin)===pending) queues.delete(plugin); }
}
async function listExperiences(plugin,{path,start,end}) {
  checkDate(start);checkDate(end);
  if (start>end || dayNumber(end)-dayNumber(start)>366) throw fail('invalid-input','请选择不超过367天的范围 / Choose a date range of at most 367 days');
  const work = await readMedia(plugin,{path});
  return {start,end,...await collect(plugin,work,start,end)};
}
module.exports = {readExperienceDay,addExperience,listExperiences};
