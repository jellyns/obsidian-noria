const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createRequire} = require('node:module');
const filename = path.resolve(__dirname, '../src/media-card.js'), local = createRequire(filename), entry = {exports: {}};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module: entry, URL, require: id => ['obsidian', './card-controls.js', './media-record.js', './media-editor.js', './media-intake-ui.js'].includes(id) ? {} : local(id)});
const {bookPosition, coverSource} = entry.exports, text = (_, en) => en;

test('book position reports stored pages without converting corrections or unknown totals into activity', () => {
  const book = properties => ({kinds: ['book'], properties});
  assert.equal(bookPosition(book({pageprogress: 24, pagecount: 180}), text), '24 / 180 pages');
  assert.equal(bookPosition(book({pageprogress: 24, pagecount: 0}), text), 'Page 24');
  assert.equal(bookPosition(book({pageprogress: 240, pagecount: 180}), text), 'Page 240');
  for (const value of [0, -1, NaN, Infinity, '24', null]) assert.equal(bookPosition(book({pageprogress: value}), text), '');
  assert.equal(bookPosition({kinds: ['game'], properties: {pageprogress: 24, playtime: 100}}, text), '');
});

test('covers preserve the existing image preference, resolve relative vault links and reject executable URLs', () => {
  const plugin = {app: {metadataCache: {getFirstLinkpathDest: (value, source) => {
    assert.equal(source, 'Media/A.md');
    return value === '../Art/cover.png' ? {path: 'Art/cover.png', extension: 'png'} : value === 'A.md' ? {path: 'A.md', extension: 'md'} : null;
  }}, vault: {getResourcePath: file => 'app://vault/' + file.path}}};
  const item = properties => ({path: 'Media/A.md', properties});
  assert.equal(coverSource(plugin, item({image: 'https://example.org/first.jpg', cover: 'https://example.org/second.jpg'})), 'https://example.org/first.jpg');
  assert.equal(coverSource(plugin, item({image: 'missing.png', cover: '![[../Art/cover.png|120]]'})), 'app://vault/Art/cover.png');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/secret.png', 'https://user:password@example.org/x', 'A.md']) assert.equal(coverSource(plugin, item({cover: value})), '');
});
