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
  fs.copyFileSync(builder, path.join(root, "scripts/build-embedded-runtime.mjs"));
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
  assert.deepEqual(sources, {
    "config/example.md": "A public configuration",
    "views/example/view.js": "module.exports = 42;"
  });
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
