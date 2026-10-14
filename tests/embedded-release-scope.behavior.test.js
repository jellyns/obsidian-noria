const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const builder = path.resolve(__dirname, "../scripts/build-embedded-runtime.mjs");

function fixture(t, files, declared) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "noria-public-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  // The isolated source fixture uses the repository's real build dependency.
  const esbuildUrl = require('node:url').pathToFileURL(require.resolve('esbuild')).href;
  fs.writeFileSync(path.join(root, "scripts/build-embedded-runtime.mjs"),fs.readFileSync(builder,'utf8').replace('from "esbuild"',`from ${JSON.stringify(esbuildUrl)}`));
  fs.writeFileSync(path.join(root, "scripts/public-runtime-files.json"), JSON.stringify(declared));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, "src/runtime", name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const output = path.join(root, "src/generated/embedded-runtime-sources.js");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "// previous successful build\n");
  return {
    output,
    run: () => spawnSync(process.execPath, [path.join(root, "scripts/build-embedded-runtime.mjs")], {
      cwd: root, encoding: "utf8"
    })
  };
}

test("public runtime build embeds declared code and its configuration", (t) => {
  const f = fixture(t, {
    "views/example/view.js": "module.exports = 42;",
    "config/example.md": "A public configuration"
  }, ["views/example/view.js", "config/example.md"]);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const { NORIA_EMBEDDED_SOURCES: sources } = require(f.output);
  assert.equal(sources['config/example.md'],'A public configuration');
  const sandbox={module:{exports:{}}};require('node:vm').runInNewContext(sources['views/example/view.js'],sandbox);
  assert.equal(sandbox.module.exports,42);
});

test('embedded compaction preserves await, return, injected bindings and license notices',async(t)=>{
  const raw='/*! Test fixture license */\n// ordinary comment\nconst result = await Promise.resolve(input.value);\nreturn `${ctx.prefix}: ${result}`;';
  const f=fixture(t,{'views/example/view.js':raw},['views/example/view.js']);const r=f.run();assert.equal(r.status,0,r.stderr);
  const code=require(f.output).NORIA_EMBEDDED_SOURCES['views/example/view.js'];
  assert.match(code,/Test fixture license/);assert.doesNotMatch(code,/ordinary comment/);assert.ok(code.length<raw.length);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  assert.equal(await new AsyncFunction('ctx','input',code)({prefix:'Read'},{value:42}),'Read: 42');
});

test("unclassified runtime content stops a public build before overwriting its output", (t) => {
  const f = fixture(t, {
    "views/example/view.js": "module.exports = 42;",
    "config/personal-health.json": "{\"privateFixture\":true}"
  }, ["views/example/view.js"]);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not declared for public embedding.*config\/personal-health\.json/s);
  assert.equal(fs.readFileSync(f.output, "utf8"), "// previous successful build\n");
});

test("missing declared runtime content stops the build instead of producing an incomplete release", (t) => {
  const f = fixture(t, {
    "views/example/view.js": "module.exports = 42;"
  }, ["views/example/view.js", "config/example.md"]);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /declared public runtime files are missing.*config\/example\.md/s);
  assert.equal(fs.readFileSync(f.output, "utf8"), "// previous successful build\n");
});
