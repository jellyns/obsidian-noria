"use strict";
const fail = (code, message) => Object.assign(new Error(message), {code});
const fieldsByKind = Object.freeze({
  book: ['author', 'publisher', 'isbn', 'publish', 'pagecount', 'source', 'cover'],
  movie: ['director', 'year', 'source', 'cover'],
  music: ['artist', 'year', 'source', 'cover'],
  game: ['developer', 'year', 'source', 'cover']
});
const metadataFieldsFor = kinds => [...new Set([kinds].flat().flatMap(kind => fieldsByKind[kind] || []))];
const metadataFields = Object.freeze(metadataFieldsFor(Object.keys(fieldsByKind)));
const metadataListFields = Object.freeze(['author', 'publisher', 'isbn', 'director', 'artist', 'developer']);

function normalizeISBN(raw) {
  const value = raw.replace(/^ISBN(?:-1[03])?:?\s*/i, '').replace(/[ -]/g, '').toUpperCase();
  if (!/^(?:\d{9}[\dX]|97[89]\d{10})$/.test(value)) return null;
  const digits = [...value].map(x => x === 'X' ? 10 : Number(x));
  const sum = digits.reduce((n, d, i) => n + d * (value.length === 10 ? 10 - i : i % 2 ? 3 : 1), 0);
  if (sum % (value.length === 10 ? 11 : 10)) throw fail('invalid-input', 'ISBN checksum does not match');
  return value;
}

function mediaMetadata(value, kind, {allowClear = false} = {}) {
  if (value === undefined) return {};
  const supported = metadataFieldsFor(kind);
  if (!value || typeof value !== 'object' || Array.isArray(value) || !supported.length) throw fail('invalid-input', 'Supply metadata for a supported media type');
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!supported.includes(key)) throw fail('invalid-input', `Unsupported media metadata: ${key}`);
    if (allowClear && raw === null) { result[key] = null; continue; }
    if (metadataListFields.includes(key)) {
      const values = Array.isArray(raw) ? raw : [raw];
      if (!values.length || values.some(v => typeof v !== 'string' || !v.trim() || /[\r\n]/.test(v))) throw fail('invalid-input', `Invalid ${key}`);
      result[key] = [...new Set(values.map(v => v.trim()))];
      if (key === 'isbn') result.isbn = result.isbn.map(v => { const number = normalizeISBN(v); if (!number) throw fail('invalid-input', 'Invalid ISBN'); return number; });
    } else if (key === 'year') {
      const year = typeof raw === 'string' && /^\d{1,4}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
      if (!Number.isSafeInteger(year) || year < 1 || year > 9999) throw fail('invalid-input', 'Year must be an integer from 1 to 9999');
      result[key] = year;
    } else if (key === 'pagecount') {
      if (!Number.isInteger(raw) || raw <= 0) throw fail('invalid-input', 'Page count must be a positive integer');
      result[key] = raw;
    } else if (['source', 'cover', 'publish'].includes(key)) {
      if (typeof raw !== 'string' || !raw.trim() || /[\r\n]/.test(raw)) throw fail('invalid-input', `Invalid ${key}`);
      result[key] = raw.trim();
      if (key === 'cover' && !/^https?:\/\//i.test(result[key])) {
        const reference = result[key].replace(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1');
        if (/^[\/\\]|[:\\\[\]\x00-\x1f]/.test(reference) || reference.split('/').some(part => !part || part === '..' || part === '.') || !/\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(reference)) throw fail('invalid-input', 'Use a vault image path, wikilink, or HTTP(S) cover URL');
        continue;
      }
      if (key !== 'publish') {
        let url; try { url = new URL(raw); } catch (_) { throw fail('invalid-input', `Invalid ${key} URL`); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('invalid-input', `Invalid ${key} URL`);
        url.hash = ''; result[key] = url.href;
      }
    } else throw fail('invalid-input', `Unsupported media metadata: ${key}`);
  }
  return result;
}
module.exports = {metadataFields, metadataFieldsFor, metadataListFields, mediaMetadata, normalizeISBN};
