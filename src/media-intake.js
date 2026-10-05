"use strict";
const {parseYaml} = require('obsidian');
const {frontmatter} = require('./record-properties.js');
const {listMedia, mediaTypes} = require('./media-catalog.js');
const queues = new WeakMap();
const fail = (code, message) => Object.assign(new Error(message), {code});
const titleKey = value => value.normalize('NFKC').trim().replace(/^《(.*)》$/u, '$1').replace(/\s+/gu, ' ').toLocaleLowerCase();

// Intake shares the native catalog and creates ordinary Markdown, without filling personal history.
async function createMedia(plugin, request = {}) {
  const {folder, searchFolder = folder, kind, title, status, filename} = request;
  if (Object.keys(request).some(key => !['folder', 'searchFolder', 'kind', 'title', 'status', 'filename'].includes(key)) ||
      typeof title !== 'string' || !title.trim() || /[\r\n\x00-\x1f]/.test(title) ||
      !['book', 'movie', 'game'].includes(kind) ||
      status !== undefined && (typeof status !== 'string' || !status.trim() || /[\r\n\x00-\x1f]/.test(status))) throw fail('invalid-input', 'Supply a title, media type and optional nonempty status');
  const name = filename === undefined ? `《${title.trim().replace(/^《(.*)》$/u, '$1').replace(/[<>:"/\\|?*]/g, ' ')}》.md` : filename;
  if (typeof name !== 'string' || !name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.length <= 3 || !name.endsWith('.md') || /[. ]\.md$/.test(name) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || /^(?:模板-|清单-)/.test(name)) throw fail('invalid-input', 'Choose a valid Markdown filename without folders');
  const operation = async () => {
    if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded; reconnect to the current plugin instance');
    const destination = listMedia(plugin, {folder, kind, limit: 1}).folder;
    let page = listMedia(plugin, {folder: searchFolder, kind, limit: 100}), matches = [], offset;
    const scope = page.folder, wanted = titleKey(title);
    if (destination !== scope && !destination.startsWith(scope + '/')) throw fail('invalid-input', 'The destination must be inside the search folder');
    do {
      matches.push(...page.items.filter(item => titleKey(item.title) === wanted).map(({path, title, kinds}) => ({path, title, kinds})));
      offset = page.nextOffset;
      if (offset !== null) page = listMedia(plugin, {folder: searchFolder, kind, limit: 100, offset});
    } while (offset !== null);
    // Newly created notes may not yet be indexed. Read those candidates before creating another file.
    for (const file of plugin.filesUnderRoots([scope], ['.md'])) {
      if (!file.path.startsWith(scope + '/') || /^(?:模板-|清单-)/.test(file.basename) || plugin.app.metadataCache.getFileCache(file)) continue;
      const {value: fm} = frontmatter(await plugin.app.vault.read(file), parseYaml), types = mediaTypes(fm).types;
      const existingTitle = typeof fm.title === 'string' && fm.title.trim() ? fm.title : file.basename;
      if (types.includes(kind) && titleKey(existingTitle) === wanted) matches.push({path: file.path, title: existingTitle, kinds: types});
    }
    if (matches.length) return {created: false, matches};
    const path = `${destination}/${name}`;
    if (plugin.app.vault.getAbstractFileByPath(path)) throw fail('conflict', 'This filename already exists; choose another filename or open the existing note');
    const properties = {title: title.trim(), tags: [kind]};
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
