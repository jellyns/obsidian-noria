const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "noria-bundle-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "public");
  for (const dir of ["src", "scripts", "node_modules"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, "../scripts/build-plugin.mjs"), path.join(root, "scripts/build-plugin.mjs"));
  fs.symlinkSync(path.dirname(require.resolve("esbuild/package.json")), path.join(root, "node_modules/esbuild"), "junction");
  const output = path.join(root, "main.js");
  const previous = "module.exports = 'previous successful build';\n";
  fs.writeFileSync(output, previous);
  return {
    root, sandbox, output, previous,
    write(name, content) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); },
    run() { return spawnSync(process.execPath, [path.join(root, "scripts/build-plugin.mjs")], { cwd: root, encoding: "utf8" }); }
  };
}

test("public bundle runs with source data, an installed dependency and the Obsidian host", t => {
  const f = fixture(t);
  f.write("src/value.json", '{"value":40}');
  f.write("node_modules/example-dependency/index.js", "module.exports = 2;");
  f.write("src/main.js", "const {Plugin}=require('obsidian');module.exports=class extends Plugin { answer(){return require('./value.json').value + require('example-dependency');} };");
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  const context = { module: { exports: {} }, require(id) { assert.equal(id, "obsidian"); return { Plugin: class {} }; } };
  vm.runInNewContext(fs.readFileSync(f.output, "utf8"), context);
  assert.equal(new context.module.exports().answer(), 42);
});

test("imports outside public source scope fail without replacing the last bundle", async t => {
  for (const name of ["local-data.json", "../personal/data.json"]) {
    await t.test(name, t => {
      const f = fixture(t);
      f.write(name, '{"privateFixture":"do-not-bundle"}');
      const input = path.join(f.root, name);
      f.write("src/main.js", `module.exports=require(${JSON.stringify(input)});`);
      const run = f.run();
      assert.notEqual(run.status, 0, "private data was bundled");
      assert.match(run.stderr, /outside public bundle scope/);
      assert.equal(fs.readFileSync(f.output, "utf8"), f.previous);
    });
  }
});

test("a source junction cannot bring a private directory into the public bundle", t => {
  const f = fixture(t);
  f.write("../personal/data.json", '{"privateFixture":"do-not-bundle"}');
  fs.symlinkSync(path.join(f.sandbox, "personal"), path.join(f.root, "src/linked"), "junction");
  f.write("src/main.js", "module.exports=require('./linked/data.json');");
  const run = f.run();
  assert.notEqual(run.status, 0, "private junction data was bundled");
  assert.match(run.stderr, /outside public bundle scope/);
  assert.equal(fs.readFileSync(f.output, "utf8"), f.previous);
});
