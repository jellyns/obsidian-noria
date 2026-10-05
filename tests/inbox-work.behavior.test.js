const test = require("node:test");
const assert = require("node:assert/strict");
const { updateWork, parseWork } = require("../src/inbox-work.js");

function fixture() {
  const fm = { tags: ["研究"], "inbox-next": "03_Resources/文献", "inbox-work": "我：阅读" };
  const calls = [];
  const plugin = {
    getManagedPath: () => "Noria/Inbox",
    app: { vault: { getAbstractFileByPath: path => path === "Noria/Inbox/笔记.md" ? { path } : null },
      fileManager: { async processFrontMatter(file, edit) {
        const draft = structuredClone(fm);
        edit(draft);
        for (const key of Object.keys(fm)) delete fm[key];
        Object.assign(fm, draft);
      } } },
    requestNoriaRefresh: (...args) => calls.push(args)
  };
  return { fm, calls, plugin };
}

test("assignment, reassignment, custom work and clearing preserve unrelated properties", async () => {
  const { plugin, fm } = fixture();
  let currentWork = "我：阅读";
  for (const work of ["SI：整理", "我：比较两种结论", ""]) {
    const result = await updateWork(plugin, { path: "Noria/Inbox/笔记.md", currentWork, work });
    assert.equal(result.ok, true);
    assert.equal(fm["inbox-work"] ?? "", work);
    assert.deepEqual(fm.tags, ["研究"]);
    assert.equal(fm["inbox-next"], "03_Resources/文献");
    currentWork = work;
  }
  assert.equal(Object.hasOwn(fm, "inbox-work"), false);
});

test("a stale selection cannot overwrite another editor's next step", async () => {
  const { plugin, fm, calls } = fixture();
  const result = await updateWork(plugin, { path: "Noria/Inbox/笔记.md", currentWork: "SI：整理", work: "我：提炼" });
  assert.equal(result.reason, "conflict");
  assert.equal(fm["inbox-work"], "我：阅读");
  assert.equal(calls.length, 0);
});

test("work updates remain within Inbox and reject malformed assignments", async () => {
  const { plugin, fm } = fixture();
  for (const path of ["Noria/Projects/笔记.md", "Noria/Inbox/../private.md", "Noria/Inbox-other/笔记.md"]) {
    assert.equal((await updateWork(plugin, { path, work: "SI：提炼" })).ok, false);
  }
  for (const work of ["处理完", "SI：", "SI：整理\n任意内容", null]) {
    assert.equal((await updateWork(plugin, { path: "Noria/Inbox/笔记.md", work })).reason, "invalid-work");
  }
  assert.equal(fm["inbox-work"], "我：阅读");
  assert.equal(parseWork("SI: 整理").actor, "SI");
});
