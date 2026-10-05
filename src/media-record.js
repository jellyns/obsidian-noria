"use strict";
const {createHash} = require('node:crypto');
const {parseYaml} = require('obsidian');
const {frontmatter, writeProperty} = require('./record-properties.js');
const {mediaTypes} = require('./media-catalog.js');
const fail = (code, message) => Object.assign(Error(message), {code});

function sourceFile(plugin, path) {
  if (typeof path !== 'string' || !path.trim() || /(^|[\\/])\.\.?([\\/]|$)/.test(path) || /^[\\/]|^[a-z]:/i.test(path)) throw fail('invalid-input', 'Specify a vault-relative media note');
  const normalized = plugin.normalizePath(path.trim()), file = plugin.app.vault.getAbstractFileByPath(normalized);
  if (!file || file.extension !== 'md') throw fail('not-found', 'Media note not found');
  if (/^(?:模板-|清单-)/.test(file.basename)) throw fail('unsupported', 'Choose a work, not a list or template');
  return file;
}

function snapshot(plugin, file, raw) {
  const {value: fm} = frontmatter(raw, parseYaml);
  const {types} = mediaTypes(fm, (plugin.app.metadataCache.getFileCache(file)?.tags || []).map(row => row.tag));
  if (!types.length) throw fail('unsupported', 'The note has no supported media tag');
  const properties = {status: fm.status ?? null, pageprogress: fm.pageprogress ?? null, pagecount: fm.pagecount ?? null};
  const revision = 'media-v1-' + createHash('sha256').update(JSON.stringify([file.path, types, ...['status', 'pageprogress'].map(key => [Object.hasOwn(fm, key), fm[key]])])).digest('hex');
  return {path: file.path, title: typeof fm.title === 'string' && fm.title.trim() ? fm.title : file.basename, kinds: types, properties, revision};
}

async function readMedia(plugin, request = {}) {
  const file = sourceFile(plugin, request.path);
  return snapshot(plugin, file, await plugin.app.vault.read(file));
}

async function updateMedia(plugin, request = {}) {
  const {revision, patch} = request;
  if (typeof revision !== 'string' || !revision || !patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !['status', 'pageprogress'].includes(key))) throw fail('invalid-input', 'Read the current revision and supply status or pageprogress');
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
module.exports = {readMedia, updateMedia};
