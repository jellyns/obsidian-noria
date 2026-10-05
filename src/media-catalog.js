"use strict";

const kinds = {
  book: new Set(['book', 'arts/books']),
  movie: new Set(['movie', 'film', 'tv', 'anime', 'arts/film', 'arts/television', 'arts/animation']),
  game: new Set(['game', 'arts/games'])
};
const fields = ['source', 'publisher', 'status', 'rating', 'grade', 'description', 'cover', 'image', 'author', 'director', 'publish', 'year', 'releaseDate', 'isbn', 'country', 'platform', 'genre', 'pagecount', 'pageprogress', 'playtime', 'viewtime', 'finishedAt', 'created'];
const invalid = message => Object.assign(new Error(message), {code: 'invalid-input'});
const clone = value => JSON.parse(JSON.stringify(value));
function mediaTypes(fm, inlineTags = []) {
  const raw = Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(/[\s,]+/) : [];
  const tags = [...new Set([...raw, ...inlineTags].filter(tag => typeof tag === 'string').map(tag => tag.replace(/^#/, '')))];
  const normalized = tags.map(tag => tag.toLowerCase());
  return {tags, types: Object.entries(kinds).filter(([, aliases]) => normalized.some(tag => aliases.has(tag))).map(([type]) => type)};
}

// Read the native metadata index. Original field values and note locations remain authoritative.
function listMedia(plugin, request = {}) {
  const {folder, kind, status, query = '', recursive = true, offset = 0, limit = 50} = request;
  if (typeof folder !== 'string' || !folder.trim() || /(^|[\\/])\.\.?([\\/]|$)/.test(folder) || /^[\\/]|^[a-z]:/i.test(folder)) throw invalid('Choose a vault-relative media folder');
  if (kind != null && !Object.hasOwn(kinds, kind)) throw invalid('Choose book, movie or game');
  if (status != null && typeof status !== 'string' || typeof query !== 'string' || typeof recursive !== 'boolean') throw invalid('Use text filters and a boolean recursive option');
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('Use a nonnegative offset and a limit from 1 to 100');
  const scope = plugin.normalizePath(folder.trim()).replace(/\/$/, '');
  const directory = plugin.app.vault.getAbstractFileByPath(scope);
  if (!directory?.children) throw Object.assign(new Error('Media folder not found'), {code: 'not-found'});
  const needle = query.trim().toLocaleLowerCase(), items = [];
  let unindexed = 0;
  for (const file of plugin.filesUnderRoots([scope], ['.md'])) {
    if (!file.path.startsWith(scope + '/') || !recursive && file.path.slice(scope.length + 1).includes('/')) continue;
    const name = file.basename || file.path.split('/').at(-1).replace(/\.md$/i, '');
    // Existing Library templates and list pages carry the same media tags as entries.
    if (/^(?:模板-|清单-)/.test(name)) continue;
    const cache = plugin.app.metadataCache.getFileCache(file);
    if (!cache) { unindexed++; continue; }
    const fm = cache.frontmatter || {}, {tags, types} = mediaTypes(fm, (cache.tags || []).map(row => row.tag));
    if (!types.length || kind && !types.includes(kind) || status != null && fm.status !== status) continue;
    const title = typeof fm.title === 'string' && fm.title.trim() ? fm.title : name;
    if (needle && ![title, fm.author, fm.director, fm.aliases].flat().filter(value => typeof value === 'string').join('\n').toLocaleLowerCase().includes(needle)) continue;
    items.push({path: file.path, title, kinds: types, tags, properties: clone(Object.fromEntries(fields.filter(key => Object.hasOwn(fm, key)).map(key => [key, fm[key]])))});
  }
  items.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const page = items.slice(offset, offset + limit);
  return {folder: scope, items: page, total: items.length, unindexed, nextOffset: offset + page.length < items.length ? offset + page.length : null};
}

module.exports = {listMedia, mediaTypes};
