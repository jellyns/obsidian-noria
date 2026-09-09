const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { sourcePath } = require("./source-paths.cjs");

function editor() {
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath("views/task-timeline/annotation-editor.js"), "utf8"), context);
  return context.noriaTaskTimeline.annotationEditor;
}

function store() {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const methods = source.slice(source.indexOf("  sanitizeTimelineAnnotationColor(value) {"), source.indexOf("  getPlannerLabControlsMeta() {"));
  return vm.runInNewContext(`new (class {
    constructor() { this.settings = { timelineAnnotations: [] }; this.writes = 0; }
    async saveSettings() { this.writes++; if (this.failWrite) throw Error('disk full'); }
    requestNoriaRefresh() {}
    ${methods}
  })()`, { stablePomodoroHash: value => String(value).replace(/\W/g, "").slice(-30) });
}

const phase = { id: "phase-a", type: "span", title: "Field visits", start: "2026-09-08T09:00:00Z",
  end: "2026-09-08T15:00:00Z", projectPath: "Projects/Garden guide", projectName: "Garden guide", note: "Keep this note", tags: ["#garden"] };

test("phase drafts require a name and ordered valid times before reaching persistence", () => {
  const api = editor();
  assert.equal(api.prepareDraft({ ...phase, title: "  " }).error, "name");
  assert.equal(api.prepareDraft({ ...phase, end: "invalid" }).error, "time");
  assert.equal(api.prepareDraft({ ...phase, end: phase.start }).error, "range");
  const valid = api.prepareDraft({ ...phase, title: "  Field visits  " });
  assert.equal(valid.error, "");
  assert.equal(valid.annotation.title, "Field visits");
  assert.equal(valid.annotation.projectPath, "Projects/Garden guide");
  assert.equal(valid.annotation.note, "Keep this note");
});

test("project identity and legacy global annotations survive save, read and edit", async () => {
  const api = store();
  await api.upsertTimelineAnnotation(phase);
  await api.upsertTimelineAnnotation({ id: "legacy", title: "Travel", start: "2026-09-10", end: "2026-09-11" });
  const saved = api.getTimelineAnnotations();
  assert.equal(saved[0].projectPath, "Projects/Garden guide");
  assert.equal(saved[0].projectName, "Garden guide");
  assert.equal(saved[1].projectPath, "");
  await api.upsertTimelineAnnotation({ ...saved[0], title: "Revised visits" });
  assert.equal(api.getTimelineAnnotations().length, 2);
  assert.equal(api.getTimelineAnnotations()[0].note, "Keep this note");
});

test("date-only phase drafts keep local midnight while explicit timestamps keep their instant", () => {
  const source = fs.readFileSync(sourcePath("views/task-timeline/annotation-editor.js"), "utf8");
  const output = execFileSync(process.execPath, ["-e", `${source}
    const draft = noriaTaskTimeline.annotationEditor.prepareDraft;
    process.stdout.write(JSON.stringify([
      draft({ title: 'Local day', start: '2026-09-08', end: '2026-09-09' }).annotation,
      draft({ title: 'Exact time', type: 'point', start: '2026-09-08T09:00:00Z' }).annotation
    ]));`], { env: { ...process.env, TZ: "Asia/Shanghai" }, encoding: "utf8" });
  const [day, exact] = JSON.parse(output);
  assert.equal(day.start, "2026-09-07T16:00:00.000Z");
  assert.equal(day.end, "2026-09-08T16:00:00.000Z");
  assert.equal(exact.start, "2026-09-08T09:00:00.000Z");
});

test("a failed annotation save restores the previously visible data", async () => {
  const api = store();
  await api.upsertTimelineAnnotation(phase);
  api.failWrite = true;
  await assert.rejects(() => api.upsertTimelineAnnotation({ ...phase, title: "Unsaved" }), /disk full/);
  assert.equal(api.getTimelineAnnotations()[0].title, "Field visits");
});
