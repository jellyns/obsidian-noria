"use strict";
const fail = (code, message) => Object.assign(new Error(message), {code});
const metadataFields = Object.freeze(['author', 'publisher', 'isbn', 'publish', 'pagecount', 'source', 'cover']);

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
  if (!value || typeof value !== 'object' || Array.isArray(value) || kind !== 'book') throw fail('invalid-input', 'Book metadata must be an object');
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!metadataFields.includes(key)) throw fail('invalid-input', `Unsupported media metadata: ${key}`);
    if (allowClear && raw === null) { result[key] = null; continue; }
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
module.exports = {metadataFields, mediaMetadata, normalizeISBN};
