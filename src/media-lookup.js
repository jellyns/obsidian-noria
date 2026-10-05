"use strict";
const states = new WeakMap();
const fail = (code, message) => Object.assign(new Error(message), {code});
const text = value => typeof value === 'string' ? value.trim() : '';
const strings = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const copy = value => JSON.parse(JSON.stringify(value));

function isbn(raw) {
  const value = raw.replace(/^ISBN(?:-1[03])?:?\s*/i, '').replace(/[ -]/g, '').toUpperCase();
  if (!/^(?:\d{9}[\dX]|97[89]\d{10})$/.test(value)) return null;
  const digits = [...value].map(x => x === 'X' ? 10 : Number(x));
  const sum = digits.reduce((n, d, i) => n + d * (value.length === 10 ? 10 - i : i % 2 ? 3 : 1), 0);
  if (sum % (value.length === 10 ? 11 : 10)) throw fail('invalid-input', 'ISBN checksum does not match');
  return value;
}

function queryPath(query, limit, offset) {
  if (/^https?:\/\//i.test(query)) {
    let url; try { url = new URL(query); } catch (_) { throw fail('invalid-input', 'Invalid work link'); }
    if (url.hostname !== 'openlibrary.org' || url.username || url.password || url.port) throw fail('unsupported', 'Use an Open Library work or edition link, an ISBN or a book title');
    const match = url.pathname.replace(/\.json$/, '').match(/^\/(works\/OL\d+W|books\/OL\d+M|isbn\/[^/]+)(?:\/[^/]*)?$/);
    if (!match) throw fail('unsupported', 'Use a work, edition or ISBN link');
    if (match[1].startsWith('isbn/')) {
      const number = isbn(match[1].slice(5));
      if (!number) throw fail('invalid-input', 'Invalid ISBN');
      return `/isbn/${number}.json`;
    }
    return match[1].startsWith('works/') ? `/${match[1]}/editions.json?limit=${limit}&offset=${offset}` : `/${match[1]}.json`;
  }
  const number = isbn(query);
  if (number) return `/isbn/${number}.json`;
  if (/^ISBN/i.test(query) || /^[\d Xx-]{10,}$/.test(query)) throw fail('invalid-input', 'Invalid ISBN');
  const params = new URLSearchParams({title: query, fields: 'key,title,author_name,edition_count,cover_i', limit: String(limit), offset: String(offset)});
  return `/search.json?${params}`;
}

async function json(plugin, path) {
  let state = states.get(plugin);
  if (!state) { state = {queue: Promise.resolve(), last: 0, cache: new Map(), pending: new Map()}; states.set(plugin, state); }
  const cached = state.cache.get(path);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) return copy(cached.data);
  if (state.pending.has(path)) return copy(await state.pending.get(path));
  const active = () => { if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded'); };
  const job = state.queue.catch(() => {}).then(async () => {
    if (state.retryAt > Date.now()) throw fail('rate-limited', 'Open Library is busy; try again later');
    const wait = Math.max(0, 1000 - (Date.now() - state.last));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    active(); state.last = Date.now();
    const {requestUrl} = require('obsidian');
    let response;
    try { response = await requestUrl({url: `https://openlibrary.org${path}`, headers: {'User-Agent': 'Noria book lookup', Accept: 'application/json'}, throw: false}); }
    catch (_) { throw fail('network-error', 'Could not reach Open Library; your note has not been changed'); }
    active();
    if (response.status === 429) {
      const retry = response.headers?.['retry-after'];
      const seconds = Number(retry), date = Date.parse(retry);
      state.retryAt = Date.now() + (seconds > 0 ? seconds * 1000 : date > Date.now() ? date - Date.now() : 60000);
      throw fail('rate-limited', 'Open Library is busy; try again later');
    }
    if (response.status === 404) return null;
    if (response.status !== 200) throw fail('source-error', `Open Library returned ${response.status}`);
    let data; try { data = response.json; } catch (_) { throw fail('source-error', 'Open Library returned invalid JSON'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('source-error', 'Open Library returned invalid data');
    state.cache.set(path, {at: Date.now(), data});
    if (state.cache.size > 50) state.cache.delete(state.cache.keys().next().value);
    return data;
  });
  state.queue = job; state.pending.set(path, job);
  try { return copy(await job); } finally { if (state.pending.get(path) === job) state.pending.delete(path); }
}

function candidate(row, level) {
  if (!row || typeof row !== 'object') return null;
  const key = text(row.key), title = text(row.title);
  if (!title || !(level === 'edition' ? /^\/books\/OL\d+M$/ : /^\/works\/OL\d+W$/).test(key)) return null;
  const result = {kind: 'book', level, title, source: {provider: 'openlibrary', id: key, url: `https://openlibrary.org${key}`}};
  const coverId = level === 'edition' ? row.covers?.find(id => Number.isInteger(id) && id > 0) : row.cover_i;
  if (Number.isInteger(coverId) && coverId > 0) result.cover = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  if (level === 'work') {
    result.contributors = strings(row.author_name);
    if (Number.isInteger(row.edition_count)) result.editionCount = row.edition_count;
  } else {
    result.publishers = strings(row.publishers);
    result.publish = text(row.publish_date);
    result.isbn = [...strings(row.isbn_13), ...strings(row.isbn_10)];
    result.authorIds = (Array.isArray(row.authors) ? row.authors : []).map(item => text(item?.key)).filter(key => /^\/authors\/OL\d+A$/.test(key));
    result.languages = (Array.isArray(row.languages) ? row.languages : []).map(item => text(item?.key).replace(/^\/languages\//, '')).filter(Boolean);
    if (Number.isInteger(row.number_of_pages) && row.number_of_pages > 0) result.pagecount = row.number_of_pages;
  }
  return result;
}

async function lookupMedia(plugin, request = {}) {
  const {kind, query, limit = 5, offset = 0} = request;
  if (Object.keys(request).some(key => !['kind', 'query', 'limit', 'offset'].includes(key)) || kind !== 'book' || typeof query !== 'string' || !query.trim() || !Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(offset) || offset < 0) throw fail('invalid-input', 'Supply book, a title / ISBN / Open Library link, and a valid page range');
  if (plugin._noriaPluginDisposed) throw fail('unsupported', 'Noria is unloaded');
  const path = queryPath(query.trim(), limit, offset), data = await json(plugin, path);
  const search = path.startsWith('/search.json'), editions = path.includes('/editions.json');
  const rows = data === null ? [] : search ? data.docs : editions ? data.entries : [data];
  if (!Array.isArray(rows)) throw fail('source-error', 'Open Library returned no result list');
  const candidates = rows.map(row => candidate(row, search ? 'work' : 'edition')).filter(Boolean);
  if (rows.length && !candidates.length) throw fail('source-error', 'Open Library returned no identifiable works or editions');
  const total = Number(search ? data?.numFound ?? data?.num_found : editions ? data?.size : rows.length);
  return {provider: 'openlibrary', candidates, nextOffset: (search || editions) && rows.length && offset + rows.length < total ? offset + rows.length : null};
}
module.exports = {lookupMedia, normalizeISBN: isbn};
