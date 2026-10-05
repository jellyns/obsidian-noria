const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), {createRequire} = require('node:module');
const {createAgentConnection} = require('../src/agent-mcp.js');
const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const parse = raw => Object.fromEntries(raw.split('\n').filter(line => /^[a-z]+: /.test(line)).map(line => { const i = line.indexOf(': '); return [line.slice(0, i), JSON.parse(line.slice(i + 2))]; }));
function load(name, stubs) { const filename = path.resolve(__dirname, '../src/' + name), module = {exports: {}}, local = createRequire(filename); vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {module, URL, require: id => id in stubs ? stubs[id] : local(id)}); return module.exports; }
const intake = load('media-intake.js', {obsidian: {parseYaml: parse}});
const {createPublicApi} = load('public-api.js', {'./media-intake.js': intake});
function fixture() {
  const files = new Map(), cache = new Map(), contents = new Map(); let writes = 0;
  const add = (filePath, title, kind, indexed = true) => {
    const file = {path: filePath, basename: filePath.split('/').at(-1).replace(/\.md$/, ''), extension: 'md'};
    files.set(filePath, file); const fm = {title, tags: [kind]};
    const raw = `---\ntitle: ${JSON.stringify(title)}\ntags: ${JSON.stringify([kind])}\n---\n## My own words\nKeep this paragraph.\n`; contents.set(filePath, raw);
    if (indexed) cache.set(filePath, {frontmatter: fm}); return file;
  };
  const plugin = {normalizePath: p => p.replaceAll('\\', '/'), filesUnderRoots: () => [...files.values()], app: {
    metadataCache: {getFileCache: file => cache.get(file.path)}, vault: {
      getAbstractFileByPath: p => p === 'Media' ? {children: []} : files.get(p), read: async f => contents.get(f.path),
      create: async (p, raw) => { if (files.has(p)) throw Error('File already exists'); writes++; const fm = parse(raw); const f = add(p, fm.title, fm.tags[0], false); contents.set(p, raw); return f; }
    }
  }};
  return {plugin, add, files, contents, api: createPublicApi(plugin), get writes() {return writes;}};
}

test('intake creates only supplied facts and concurrent retries find the same unindexed work', async () => {
  const f = fixture(), request = {folder: 'Media', kind: 'book', title: 'A: new book'};
  const results = await Promise.all([f.api.media.create(request), f.api.media.create({...request, filename: 'Another.md'})]);
  assert.equal(f.writes, 1); assert.equal(results[0].created, true); assert.equal(results[1].created, false);
  assert.equal(results[1].matches[0].path, results[0].path);
  assert.equal(f.contents.get(results[0].path), '---\ntitle: "A: new book"\ntags: ["book"]\n---\n');
  assert.equal(f.contents.size, 1);
});

test('title matches return all existing editions without changing personal content or status', async () => {
  const f = fixture(); f.add('Media/old.md', '《Ａ Book》', 'book'); f.add('Media/new.md', 'A  Book', 'book', false); f.add('Elsewhere/other.md', 'A Book', 'book');
  const before = [...f.contents]; const result = await f.api.media.create({folder: 'Media', kind: 'book', title: 'a book', status: '想读'});
  assert.equal(result.created, false); assert.deepEqual(Array.from(result.matches, x => x.path).sort(), ['Media/new.md', 'Media/old.md']); assert.deepEqual([...f.contents], before); assert.equal(f.writes, 0);
  const movie = await f.api.media.create({folder: 'Media', kind: 'movie', title: 'A Book'}); assert.equal(movie.created, true);
});

test('intake does not overwrite collisions or create folders and rejects invented unsupported facts', async () => {
  const f = fixture();f.add('Media/Occupied.md', 'Something else', 'game'); const before = [...f.contents];
  await assert.rejects(f.api.media.create({folder: 'Media', kind: 'book', title: 'New', filename: 'Occupied.md'}), e => e.code === 'conflict');
  await assert.rejects(f.api.media.create({folder: 'Missing', kind: 'book', title: 'New'}), e => e.code === 'not-found');
  for (const patch of [{title: ''}, {title: 'a\nb'}, {filename: '../x.md'}, {filename: 'CON.md'}, {filename: '.md'}, {folder: '../Media'}, {kind: 'music'}, {rating: 0}, {status: ''}]) await assert.rejects(f.api.media.create({folder: 'Media', kind: 'book', title: 'New', ...patch}), e => e.code === 'invalid-input');
  assert.deepEqual([...f.contents], before); assert.equal(f.writes, 0);
  f.plugin._noriaPluginDisposed = true; await assert.rejects(f.api.media.create({folder: 'Media', kind: 'book', title: 'New'}), e => e.code === 'unsupported');
});

test('actual MCP intake writes once and returns the existing source on replay', async t => {
  const f = fixture(), connection = createAgentConnection({getApi: () => f.api, version: 'test'}); t.after(() => connection.stop());
  const endpoint = await connection.start(), client = new Client({name: 'media-intake', version: '1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url), {requestInit: {headers: {Authorization: `Bearer ${endpoint.token}`}}}));t.after(() => client.close());
  const request = {name: 'noria_media_create', arguments: {folder: 'Media', title: 'Existing space', kind: 'game', status: '想玩'}};
  const first = await client.callTool(request); assert.equal(first.structuredContent.created, true);
  const second = await client.callTool(request); assert.equal(second.structuredContent.created, false); assert.equal(second.structuredContent.matches[0].path, first.structuredContent.path);
  assert.equal(f.writes, 1); assert.equal(parse(f.contents.get(first.structuredContent.path)).status, '想玩');
});


test('metadata creates a version without personal history; ISBN-10/13 and source identity prevent renamed duplicates',async()=>{
 const f=fixture(),metadata={source:'https://openlibrary.org/books/OL7353617M',isbn:['9780140328721'],publisher:['Puffin'],publish:'1988',pagecount:96};
 const created=await f.api.media.create({folder:'Media',kind:'book',title:'Fantastic Mr. Fox',metadata});
 const properties=parse(f.contents.get(created.path));assert.equal(properties.pagecount,96);assert.deepEqual(properties.publisher,['Puffin']);assert.equal(properties.source,metadata.source);assert.equal(properties.rating,undefined);assert.equal(properties.finishedAt,undefined);assert.equal(properties.status,undefined);
 const duplicate=await f.api.media.create({folder:'Media',kind:'book',title:'A translated title',metadata:{isbn:'0140328726'},separate:true});assert.equal(duplicate.created,false);assert.equal(duplicate.matches[0].reason,'identity');assert.equal(duplicate.matches[0].path,created.path);
 const linked=await f.api.media.create({folder:'Media',kind:'book',title:'Another title',metadata:{source:metadata.source}});assert.equal(linked.created,false);assert.equal(f.writes,1);
});

test('another edition requires an explicit separate choice and never overwrites the same filename',async()=>{
 const f=fixture();f.add('Media/old.md','Same book','book');const previous=f.contents.get('Media/old.md');
 const request={folder:'Media',kind:'book',title:'Same book',metadata:{isbn:'9780140328721'}};
 assert.equal((await f.api.media.create(request)).created,false);
 await assert.rejects(f.api.media.create({...request,separate:true,filename:'old.md'}),e=>e.code==='conflict');
 assert.equal((await f.api.media.create({...request,separate:true,filename:'Another edition.md'})).created,true);assert.equal(f.contents.get('Media/old.md'),previous);
 const before=f.writes;
 for(const metadata of [{rating:5},{pagecount:0},{source:'javascript:alert(1)'},{isbn:'9780140328722'}])await assert.rejects(f.api.media.create({...request,title:'Invalid',metadata}),e=>e.code==='invalid-input');
 assert.equal(f.writes,before);
});
