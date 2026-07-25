const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { pluginRoot, sourcePath } = require("./source-paths.cjs");

function loadEngineModules() {
  const context = {
    globalThis: null,
    __NORIA_TASK_TIMELINE_TEST__: true
  };
  context.globalThis = context;
  vm.createContext(context);
  const code = fs.readFileSync(sourcePath("views/task-timeline/engine-contract.js"), "utf8");
  vm.runInContext(code, context, { filename: "views/task-timeline/engine-contract.js" });
  return context.__noriaTaskTimelineEngineTestHooks;
}

test("task timeline engine validates and registers explicit backends", async () => {
  const engine = loadEngineModules();
  assert.equal(typeof engine.createTimelineBackend, "function");
  assert.equal(typeof engine.registerTimelineBackend, "function");
  assert.equal(typeof engine.mountTimelineBackend, "function");
  assert.throws(() => engine.createTimelineBackend({ id: "broken" }), /mount/);

  let mounted = 0;
  let disposed = 0;
  engine.registerTimelineBackend(engine.createTimelineBackend({
    id: "test",
    async mount(context) {
      mounted += 1;
      assert.equal(context.token, "explicit");
      return { dispose() { disposed += 1; } };
    }
  }));

  const instance = await engine.mountTimelineBackend("test", { token: "explicit" });
  assert.equal(mounted, 1);
  instance.dispose();
  assert.equal(disposed, 1);
});

test("formal task timeline mounts only the Noria native backend from its own route", () => {
  const main = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const view = fs.readFileSync(sourcePath("views/task-timeline/view.js"), "utf8");
  assert.match(main, /tasksTimeline:\s*"\.obsidian\/plugins\/noria\/views\/task-timeline\/view\.js"/);
  assert.match(view, /TASK_TIMELINE_ENGINE_CONTRACT_PATH/);
  assert.match(view, /TASK_TIMELINE_NATIVE_INTERACTIONS_PATH/);
  assert.match(view, /TASK_TIMELINE_NATIVE_BACKEND_PATH/);
  assert.match(view, /mountTimelineBackend\("native"/);
  assert.doesNotMatch(view, /TASK_TIMELINE_LEGACY_BACKEND_PATH|mountTimelineBackend\("legacy"|mountTimelineBackend\("compare"/);
  [
    ["si", "mile", "EnsureVendorRuntime"].join(""),
    ["TimelineRef", "create"].join("."),
    ["Si", "mile", "Ajax"].join(""),
    ["Default", "EventSource"].join(""),
    ["createHotZone", "BandInfo"].join(""),
    ["data", ["jfk", "xml"].join(".")].join("/"),
    ["si", "mile-timeline/view.js"].join(""),
    ["legacy", "backend.js"].join("-")
  ].forEach((token) => assert.equal(view.includes(token), false));
  assert.doesNotMatch(main, /timelineEngineSelector|Task Timeline Engine/);
});
