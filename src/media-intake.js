"use strict";
const {parseYaml} = require('obsidian');
const {frontmatter} = require('./record-properties.js');
const {listMedia, mediaTypes} = require('./media-catalog.js');
const {normalizeISBN} = require('./media-lookup.js');
const queues = new WeakMap();
const fail = (code, message) => Object.assign(new Error(message), {code});
const titleKey = value => value.normalize('NFKC').trim().replace(/^《(.*)》$/u, '$1').replace(/\s+/gu, ' ').toLocaleLowerCase();

function mediaMetadata(value, kind) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || kind !== 'book') throw fail('invalid-input', 'Book metadata must be an object');
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (['author', 'publisher', 'isbn'].includes(key)) {
      const values = Array.isArray(raw) ? raw : [raw];
      if (!values.length || values.some(v => typeof v !== 'string' || !v.trim() || /[\r\n]/.test(v))) throw fail('invalid-input', `Invalid ${key}`);
      result[key] = [...new Set(values.map(v => v.trim()))];
      if (key === 'isbn') result.isbn = result.isbn.map(v => { const number = normalizeISBN(v); if (!number) throw fail('invalid-input', 'Invalid ISBN'); return number; });
    } else if (key === 'pagecount') {
      if (!Number.isInteger(raw) || raw <= 0) throw fail('invalid-input', 'Page count must be a positive integer');
      result[key] = raw;
    } else if (['source', 'cover', 'publish'].includes(key)) {
      if (typeof raw !== 'string' || !raw.trim() || /[\r\n]/.test(raw)) throw fail('invalid-input', `Invalid ${key}`);
      result[key] = raw.trim();
      if (key !== 'publish') {
        let url; try { url = new URL(raw); } catch (_) { throw fail('invalid-input', `Invalid ${key} URL`); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('invalid-input', `Invalid ${key} URL`);
        url.hash = ''; result[key] = url.href;
      }
    } else throw fail('invalid-input', `Unsupported media metadata: ${key}`);
  }
  return result;
}
function isbnIdentity(value) {
  try {
    const number = normalizeISBN(String(value));
    if (!number || number.length === 13) return number;
    const base = '978' + number.slice(0, 9);
    const sum = [...base].reduce((n,d,i) => n + Number(d) * (i % 2 ? 3 : 1), 0);
    return base + (10 - sum % 10) % 10;
  } catch (_) { return null; }
}

// Intake shares the native catalog and creates ordinary Markdown, without filling personal history.
async function createMedia(plugin, request = {}) {
  const {folder, searchFolder = folder, kind, title, status, filename, metadata, separate = false} = request;
  if (Object.keys(request).some(key => !['folder', 'searchFolder', 'kind', 'title', 'status', 'filename', 'metadata', 'separate'].includes(key)) ||
      typeof separate !== 'boolean' || typeof title !== 'string' || !title.trim() || /[\r\n\x00-\x1f]/.test(title) ||
      !['book', 'movie', 'game'].includes(kind) ||
      status !== undefined && (typeof status !== 'string' || !status.trim() || /[\r\n\x00-\x1f]/.test(status))) throw fail('invalid-input', 'Supply a title, media type and optional nonempty status');
  const details = mediaMetadata(metadata, kind);
  const name = filename === undefined ? `《${title.trim().replace(/^《(.*)》$/u, '$1').replace(/[<>:"/\\|?*]/g, ' ')}》.md` : filename;
  if (typeof name !== 'string' || !name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.length <= 3 || !name.endsWith('.md') || /[. ]\.md$/.test(name) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || /^(?:模板-|清单-)/.test(name)) throw fail('invalid-input', 'Choose a valid Markdown filename without folders');
  const operation = async () => {
    if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded; reconnect to the current plugin instance');
    const destination = listMedia(plugin, {folder, kind, limit: 1}).folder;
    let page = listMedia(plugin, {folder: searchFolder, kind, limit: 100}), matches = [], offset;
    const scope = page.folder, wanted = titleKey(title);
    const identifiers = (details.isbn || []).map(isbnIdentity).filter(Boolean);
    const match = item => {
      const props = item.properties || {}, existing = [props.isbn].flat().map(isbnIdentity).filter(Boolean);
      const exact = identifiers.some(id => existing.includes(id)) || details.source && props.source === details.source;
      const sameTitle = titleKey(item.title) === wanted;
      return exact ? 'identity' : sameTitle && !separate ? 'title' : '';
    };
    const appendMatch = item => { const reason = match(item); if (reason) matches.push({path:item.path,title:item.title,kinds:item.kinds,reason}); };
    if (destination !== scope && !destination.startsWith(scope + '/')) throw fail('invalid-input', 'The destination must be inside the search folder');
    do {
      page.items.forEach(appendMatch);
      offset = page.nextOffset;
      if (offset !== null) page = listMedia(plugin, {folder: searchFolder, kind, limit: 100, offset});
    } while (offset !== null);
    // Newly created notes may not yet be indexed. Read those candidates before creating another file.
    for (const file of plugin.filesUnderRoots([scope], ['.md'])) {
      if (!file.path.startsWith(scope + '/') || /^(?:模板-|清单-)/.test(file.basename) || plugin.app.metadataCache.getFileCache(file)) continue;
      const {value: fm} = frontmatter(await plugin.app.vault.read(file), parseYaml), types = mediaTypes(fm).types;
      const existingTitle = typeof fm.title === 'string' && fm.title.trim() ? fm.title : file.basename;
      if (types.includes(kind)) appendMatch({path:file.path,title:existingTitle,kinds:types,properties:fm});
    }
    if (matches.length) return {created: false, matches};
    const path = `${destination}/${name}`;
    if (plugin.app.vault.getAbstractFileByPath(path)) throw fail('conflict', 'This filename already exists; choose another filename or open the existing note');
    const properties = {title: title.trim(), tags: [kind], ...details};
    if (status !== undefined) properties.status = status.trim();
    const markdown = '---\n' + Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n';
    if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded; reconnect to the current plugin instance');
    try { await plugin.app.vault.create(path, markdown); }
    catch (error) { if (plugin.app.vault.getAbstractFileByPath(path)) throw fail('conflict', 'This filename was created elsewhere; read it before retrying'); throw error; }
    return {created: true, path, title: properties.title, kinds: [kind]};
  };
  const pending = (queues.get(plugin) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(plugin, pending);
  try { return await pending; } finally { if (queues.get(plugin) === pending) queues.delete(plugin); }
}
module.exports = {createMedia};
