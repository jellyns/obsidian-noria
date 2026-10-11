"use strict";
const {createHash} = require('node:crypto');
const {parseYaml} = require('obsidian');
const {frontmatter, writeProperty} = require('./record-properties.js');
const {mediaTypes, isMediaTemplate} = require('./media-catalog.js');
const {metadataFields, mediaMetadata} = require('./media-metadata.js');
const fail = (code, message) => Object.assign(Error(message), {code});

function sourceFile(plugin, path) {
  if (typeof path !== 'string' || !path.trim() || /(^|[\\/])\.\.?([\\/]|$)/.test(path) || /^[\\/]|^[a-z]:/i.test(path)) throw fail('invalid-input', 'Specify a vault-relative media note');
  const normalized = plugin.normalizePath(path.trim()), file = plugin.app.vault.getAbstractFileByPath(normalized);
  if (!file || file.extension !== 'md') throw fail('not-found', 'Media note not found');
  if (/^(?:模板-|清单-)/.test(file.basename) || isMediaTemplate(plugin, normalized)) throw fail('unsupported', 'Choose a work, not a list or template');
  return file;
}

function snapshot(plugin, file, raw) {
  const {value: fm} = frontmatter(raw, parseYaml);
  const {types} = mediaTypes(fm, (plugin.app.metadataCache.getFileCache(file)?.tags || []).map(row => row.tag));
  if (!types.length) throw fail('unsupported', 'The note has no supported media tag');
  const properties = {status: fm.status ?? null, pageprogress: fm.pageprogress ?? null, finishedAt:fm.finishedAt ?? null, image:fm.image ?? null, genre:fm.genre??null,tags:fm.tags??null, ...Object.fromEntries([...metadataFields,'description'].map(key=>[key,fm[key]??null]))};
  const revision = 'media-v1-' + createHash('sha256').update(JSON.stringify([file.path, types, ...['status', 'pageprogress', 'finishedAt'].map(key => [Object.hasOwn(fm, key), fm[key]])])).digest('hex');
  const metadataRevision = 'media-metadata-v1-' + createHash('sha256').update(JSON.stringify([file.path, types, ...metadataFields.map(key=>[Object.hasOwn(fm,key),fm[key]])])).digest('hex');
  const classificationRevision='media-classification-v1-'+createHash('sha256').update(JSON.stringify([file.path,...['genre','tags'].map(key=>[Object.hasOwn(fm,key),fm[key]])])).digest('hex');
  const inlineTags=mediaTypes({},(plugin.app.metadataCache.getFileCache(file)?.tags||[]).map(row=>row.tag)).tags.filter(tag=>!require('./media-classification.js').identity(tag));
  return {path: file.path, title: typeof fm.title === 'string' && fm.title.trim() ? fm.title : file.basename, kinds: types, properties, revision, metadataRevision,classificationRevision,inlineTags};
}

async function readMedia(plugin, request = {}) {
  const file = sourceFile(plugin, request.path);
  return snapshot(plugin, file, await plugin.app.vault.read(file));
}

async function updateMedia(plugin, request = {}) {
  const {revision, patch} = request;
  if (typeof revision !== 'string' || !revision || !patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !['status', 'pageprogress', 'finishedAt'].includes(key))) throw fail('invalid-input', 'Read the current revision and supply status, pageprogress or finishedAt');
  if (Object.hasOwn(patch,'finishedAt') && patch.finishedAt !== null && !require('./media-workspace-model.js').validDate(patch.finishedAt)) throw fail('invalid-input','Use a valid YYYY-MM-DD completion date, or null');
  if (Object.hasOwn(patch, 'status') && patch.status !== null && (typeof patch.status !== 'string' || !patch.status.trim() || /[\r\n]/.test(patch.status))) throw fail('invalid-input', 'Status must be nonempty text, or null to clear');
  if (Object.hasOwn(patch, 'pageprogress') && patch.pageprogress !== null && (!Number.isSafeInteger(patch.pageprogress) || patch.pageprogress < 0)) throw fail('invalid-input', 'Current page must be a nonnegative integer, or null to clear');
  const file = sourceFile(plugin, request.path), originalPath = file.path;
  let result;
  await plugin.app.vault.process(file, raw => {
    if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded; reconnect to the current plugin instance');
    if (file.path !== originalPath) throw fail('conflict', 'The source moved; open it again');
    const before = snapshot(plugin, file, raw);
    if (before.revision !== revision) throw fail('conflict', 'The status or page changed elsewhere. Reopen the editor before saving.');
    if (Object.hasOwn(patch, 'pageprogress') && !before.kinds.includes('book')) throw fail('invalid-input', 'Page position applies to books');
    let next = raw;
    for (const [key, value] of Object.entries(patch)) {
      if (before.properties[key] === value) continue;
      next = writeProperty(next, {property: key, type: key === 'pageprogress' ? 'number' : 'option', options: [value]}, value, parseYaml);
    }
    result = {ok: true, changed: next !== raw, ...snapshot(plugin, file, next)};
    return next;
  });
  return result;
}
async function updateMediaMetadata(plugin, request = {}) {
  const {revision, patch} = request;
  if (Object.keys(request).some(key=>!['path','revision','patch'].includes(key)) || typeof revision !== 'string' || !revision || !patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) throw fail('invalid-input', 'Read metadataRevision and supply the selected metadata fields');
  const file = sourceFile(plugin, request.path), originalPath = file.path;
  let result;
  await plugin.app.vault.process(file, raw => {
    if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded; reconnect to the current plugin instance');
    if (file.path !== originalPath) throw fail('conflict', 'The source moved; open it again');
    const before = snapshot(plugin, file, raw);
    if (before.metadataRevision !== revision) throw fail('conflict', 'The work metadata changed elsewhere; read it again before saving');
    const values = mediaMetadata(patch, before.kinds, {allowClear:true});
    let next = raw;
    for (const [key,value] of Object.entries(values)) {
      if (JSON.stringify(before.properties[key]) === JSON.stringify(value)) continue;
      next = writeProperty(next,{property:key,type:Array.isArray(value)?'list':['pagecount','year'].includes(key)?'number':'option',options:[value]},value,parseYaml);
    }
    const original = frontmatter(raw,parseYaml).value, updated = frontmatter(next,parseYaml).value;
    for (const key of new Set([...Object.keys(original),...Object.keys(updated),...Object.keys(values)])) {
      const expected = Object.hasOwn(values,key)?values[key]:original[key];
      if (!Object.hasOwn(values,key) && Object.hasOwn(original,key)!==Object.hasOwn(updated,key) || JSON.stringify(updated[key]??null) !== JSON.stringify(expected??null)) throw fail('conflict', 'Could not preserve the other properties; check the source frontmatter');
    }
    result = {ok:true,changed:next!==raw,...snapshot(plugin,file,next)};
    return next;
  });
  return result;
}
async function updateMediaClassification(plugin,{path,revision,patch}={}){
 if(typeof revision!=='string'||!revision)throw fail('invalid-input','Read classificationRevision before saving');
 const file=sourceFile(plugin,path),originalPath=file.path;let result;
 await plugin.app.vault.process(file,raw=>{
  if(plugin._noriaPluginDisposed)throw fail('unsupported','Noria is unloaded');
  if(file.path!==originalPath)throw fail('conflict','The source moved; open it again');
  const before=snapshot(plugin,file,raw);
  if(before.classificationRevision!==revision)throw fail('conflict','Classification changed elsewhere');
  const original=frontmatter(raw,parseYaml).value,values=require('./media-classification.js').classificationPatch(patch,original);let next=raw;
  for(const [key,value] of Object.entries(values)){
   if(JSON.stringify(before.properties[key])===JSON.stringify(value))continue;
   next=writeProperty(next,{property:key,type:'list'},value,parseYaml);
  }
  const updated=frontmatter(next,parseYaml).value;
  for(const key of new Set([...Object.keys(original),...Object.keys(updated),...Object.keys(values)])){
   const expected=Object.hasOwn(values,key)?values[key]:original[key];
   if(!Object.hasOwn(values,key)&&Object.hasOwn(original,key)!==Object.hasOwn(updated,key)||JSON.stringify(updated[key]??null)!==JSON.stringify(expected??null))throw fail('conflict','Could not preserve the source properties');
  }
  result={ok:true,changed:next!==raw,...snapshot(plugin,file,next)};return next;
 });return result;
}
module.exports = {readMedia, updateMedia, updateMediaMetadata,updateMediaClassification};
