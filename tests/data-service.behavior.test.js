const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function loadDataService(extra = {}) {
  const code = fs.readFileSync(pluginPath("views/dashboard/core/data/data-service.js"), "utf8");
  const context = {
    console,
    Date,
    ...(extra.globals || {}),
    localStorage: {
      getItem(key) {
        return extra.localStorage?.[key] || "";
      }
    },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "data-service.js" });
  return context.dashboardCore.data.dataService;
}

test("data service derives review and snapshot cache paths from the runtime bridge", async () => {
  const data = loadDataService();
  const writes = [];
  const bridge = {
    runtimeBuildId: "custom-config-cache-build",
    storagePaths: {
      reviewEvidenceRoot: ".obsidian-custom/plugins/noria-preview/cache/stats/review",
      snapshotRoot: ".obsidian-custom/plugins/noria-preview/cache/stats/snapshots"
    },
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForScope() { return []; },
      filesForManagedPath() { return []; },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {
      vault: {
        adapter: {
          async write(pathText, text) {
            writes.push({ path: String(pathText), text: String(text) });
          }
        }
      }
    },
    now: "2026-07-15"
  });

  const periods = await service.getPeriods({ mode: "weekly", year: "2026" });
  assert.match(periods.items[0].review.evidencePath, /^\.obsidian-custom\/plugins\/noria-preview\/cache\/stats\/review\//);

  await service.export({
    kind: "tasks",
    request: { range: { mode: "custom", start: "2026-07-15", end: "2026-07-15" } }
  });
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /^\.obsidian-custom\/plugins\/noria-preview\/cache\/stats\/snapshots\//);
});

test("data service marks active home performance recorder for snapshot calls", async () => {
  const marks = [];
  const data = loadDataService({
    globals: {
      __noriaHomePerformanceCurrent: {
        markSnapshot(info) {
          marks.push(JSON.parse(JSON.stringify(info)));
        }
      }
    }
  });
  const bridge = {
    runtimeBuildId: "perf-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });
  const request = { preset: "home", range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" } };

  await service.getSnapshot(request);
  await service.getSnapshot(request);

  assert.equal(marks.length, 2);
  assert.equal(marks[0].cached, false);
  assert.equal(marks[1].cached, true);
  assert.equal(marks[0].request.preset, "home");
  assert.deepEqual(marks[0].request.views, ["home"]);
  assert.deepEqual(marks[0].request.range, { start: "2026-05-01", end: "2026-05-07", mode: "custom" });
});

test("data service coalesces concurrent identical snapshot requests", async () => {
  const marks = [];
  const data = loadDataService({
    globals: {
      __noriaHomePerformanceCurrent: {
        markSnapshot(info) {
          marks.push(JSON.parse(JSON.stringify(info)));
        }
      }
    }
  });
  const bridge = {
    runtimeBuildId: "snapshot-inflight-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForScope() { return []; },
      filesForManagedPath() { return []; },
      pagesForScope() { return []; },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return [
          {
            file: { path: "06_Diary/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] },
            weather: "晴",
            mood: "稳定",
            energy: 4,
            focus: "很专注"
          }
        ];
      },
      tasksForScope() { return []; }
    }
  };
  const reads = [];
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: {
      async readText(pathText) {
        reads.push(pathText);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "## 日记\n\n今天推进 Noria。";
      }
    }
  });
  const request = { preset: "home", range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" } };

  const [a, b] = await Promise.all([service.getSnapshot(request), service.getSnapshot(request)]);

  assert.equal(a, b);
  assert.deepEqual(reads, ["06_Diary/2026-05-01.md"]);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].cached, false);
  assert.equal(marks[1].cached, true);
});

test("data service reuses task source rows across task and project domains in one snapshot", async () => {
  const data = loadDataService();
  let taskScopeCalls = 0;
  const bridge = {
    runtimeBuildId: "task-source-domain-reuse-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() {
        taskScopeCalls += 1;
        return [
          { text: "Alpha done [completion:: 2026-05-02]", completed: true, path: "01_Projects/Alpha/tasks.md", line: 1 },
          { text: "Alpha open [due:: 2026-05-05]", completed: false, path: "01_Projects/Alpha/tasks.md", line: 2 }
        ];
      }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["tasks", "projects"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" }
  });

  assert.equal(snapshot.domains.tasks.completion.activityTotal, 2);
  assert.ok(snapshot.domains.projects);
  assert.equal(taskScopeCalls, 1);
});

test("data service reuses notes and daily state collection across compatible snapshots", async () => {
  const data = loadDataService();
  const reads = [];
  const bridge = {
    runtimeBuildId: "notes-daily-domain-reuse-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return [
          { file: { path: "06_Diary/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] } }
        ];
      },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return [
          {
            file: { path: "06_Diary/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] },
            weather: "晴",
            mood: "稳定",
            energy: 4,
            focus: "很专注"
          }
        ];
      },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: {
      async readText(pathText) {
        reads.push(pathText);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "## 日记\n\n今天推进 Noria 性能。";
      }
    }
  });
  const range = { mode: "custom", start: "2026-05-01", end: "2026-05-07" };

  const [home, extended] = await Promise.all([
    service.getSnapshot({ preset: "home", include: ["notes", "dailyState"], range }),
    service.getSnapshot({ preset: "home", include: ["notes", "dailyState", "vaultHealth"], range })
  ]);

  assert.equal(home.domains.notes.trend.totalDiaryWords, extended.domains.notes.trend.totalDiaryWords);
  assert.equal(extended.domains.dailyState.summary.validDays, 1);
  assert.deepEqual(reads, ["06_Diary/2026-05-01.md"]);
});

test("data service reads notes and daily diary texts in parallel while preserving day buckets", async () => {
  const data = loadDataService();
  const diaryPages = [
    { file: { path: "06_Diary/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] }, weather: "晴", mood: "稳定", energy: 4, focus: "基本专注" },
    { file: { path: "06_Diary/2026-05-02.md", name: "2026-05-02.md", ctime: "2026-05-02T08:00:00.000Z", tasks: [] }, weather: "多云", mood: "很好", energy: 5, focus: "很专注" },
    { file: { path: "06_Diary/2026-05-03.md", name: "2026-05-03.md", ctime: "2026-05-03T08:00:00.000Z", tasks: [] }, weather: "雨", mood: "稳定", energy: 3, focus: "基本专注" }
  ];
  const texts = {
    "06_Diary/2026-05-01.md": "第一天",
    "06_Diary/2026-05-02.md": "第二天",
    "06_Diary/2026-05-03.md": "第三天"
  };
  const reads = [];
  const resolvers = new Map();
  const bridge = {
    runtimeBuildId: "notes-daily-file-parallel-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return diaryPages;
      },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return diaryPages;
      },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: {
      async readText(pathText) {
        reads.push(pathText);
        return new Promise((resolve) => {
          resolvers.set(pathText, resolve);
        });
      }
    }
  });

  const snapshotPromise = service.getSnapshot({
    preset: "home",
    include: ["notes", "dailyState"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-03" }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlyReads = [...reads];
  for (const page of diaryPages) {
    const filePath = page.file.path;
    while (!resolvers.has(filePath)) await new Promise((resolve) => setTimeout(resolve, 0));
    resolvers.get(filePath)(texts[filePath]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const snapshot = await snapshotPromise;

  assert.deepEqual(earlyReads, diaryPages.map((page) => page.file.path));
  assert.equal(snapshot.domains.dailyState.summary.validDays, 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(snapshot.domains.notes.trend.series.map((row) => [row.key, row.words]))),
    [
      ["2026-05-01", 3],
      ["2026-05-02", 3],
      ["2026-05-03", 3]
    ]
  );
});

test("data service collects inbox domain from managed inbox pages", async () => {
  const data = loadDataService();
  const inboxPages = [
    {
      file: { path: "00_Inbox/Idea.md", name: "Idea.md", ctime: "2026-05-01T08:00:00.000Z", mtime: "2026-05-02T09:00:00.000Z", tasks: [] },
      "inbox-status": "triage",
      "inbox-action": "refine",
      "inbox-review": "2026-05-06",
      "inbox-next": "Split into project note"
    },
    {
      file: { path: "00_Inbox/Draft.md", name: "Draft.md", ctime: "2026-05-03T08:00:00.000Z", mtime: "2026-05-04T09:00:00.000Z", tasks: [] },
      "inbox-status": "processing",
      "inbox-action": "split"
    },
    {
      file: { path: "00_Inbox/Closed.md", name: "Closed.md", ctime: "2026-04-20T08:00:00.000Z", mtime: "2026-05-07T09:00:00.000Z", tasks: [] },
      "inbox-status": "已关闭",
      "inbox-action": "archive"
    }
  ];
  const bridge = {
    runtimeBuildId: "inbox-domain-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "triage", label: "Triage", aliases: ["待决"], terminal: false },
        { id: "processing", label: "Processing", terminal: false },
        { id: "closed", label: "Closed", aliases: ["已关闭"], terminal: true }
      ],
      defaultStatusId: "triage"
    },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath(pathKey) {
        return pathKey === "inboxRoot" ? inboxPages : [];
      },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["inbox"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" }
  });
  const inbox = snapshot.domains.inbox;

  assert.equal(inbox.summary.total, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.summary.byStatus)), { triage: 1, processing: 1, closed: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.summary.byAction)), { refine: 1, split: 1, archive: 1 });
  assert.equal(inbox.summary.createdInRange, 2);
  assert.equal(inbox.summary.processedInRange, 1);
  assert.equal(inbox.summary.staleCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.queues.triage.map((item) => item.path))), ["00_Inbox/Idea.md"]);
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.evidence.recentProcessed.map((item) => item.path))), ["00_Inbox/Closed.md"]);
  assert.deepEqual(JSON.parse(JSON.stringify(inbox.evidence.staleItems.map((item) => item.path))), ["00_Inbox/Idea.md"]);
});

test("data service collects projects domain from registry and task facts", async () => {
  const data = loadDataService();
  const registryText = [
    "## 项目隐藏清单",
    "- Hidden",
    "",
    "## 进行中的项目",
    "- [[01_Projects/Alpha/Alpha·MOC.md|Alpha]]",
    "- Beta",
    "",
    "## 计划中的项目",
    "- Gamma",
    "",
    "## 已完成的项目",
    "- Done"
  ].join("\n");
  const bridge = {
    runtimeBuildId: "projects-domain-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox", projectRegistryPath: "Noria/Projects.md" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() {
        return [
          { text: "Alpha done [completion:: 2026-05-02]", completed: true, path: "01_Projects/Alpha/tasks.md", line: 1 },
          { text: "Alpha open [due:: 2026-05-05]", completed: false, path: "01_Projects/Alpha/tasks.md", line: 2 },
          { text: "Beta old open [due:: 2026-04-01]", completed: false, path: "01_Projects/Beta/tasks.md", line: 1 },
          { text: "Beta cancelled [due:: 2026-05-04]", status: "cancelled", path: "01_Projects/Beta/tasks.md", line: 2 },
          { text: "Gamma planned [due:: 2026-05-06]", completed: false, path: "01_Projects/Gamma/tasks.md", line: 1 }
        ];
      }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: {
      async readText(pathText) {
        return pathText === "Noria/Projects.md" ? registryText : "";
      }
    }
  });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["projects"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" }
  });
  const projects = snapshot.domains.projects;
  const items = new Map(JSON.parse(JSON.stringify(projects.items)).map((item) => [item.name, item]));

  assert.deepEqual(JSON.parse(JSON.stringify(projects.summary)), {
    activeCount: 2,
    plannedCount: 1,
    doneCount: 1,
    hiddenCount: 1,
    taskTotal: 3,
    taskDone: 1,
    taskOpen: 2,
    completionRate: 33.3,
    staleProjectCount: 1
  });
  assert.equal(items.get("Alpha").taskTotal, 2);
  assert.equal(items.get("Alpha").completionRate, 50);
  assert.equal(items.get("Alpha").stale, false);
  assert.equal(items.get("Beta").taskTotal, 1);
  assert.equal(items.get("Beta").stale, true);
  assert.equal(items.get("Gamma").stage, "planned");
  assert.equal(projects.evidence.staleProjects[0].name, "Beta");
});

test("data service accepts English project registry section titles", async () => {
  const data = loadDataService();
  const registryText = [
    "## Hidden projects",
    "- Hidden",
    "",
    "## Active projects",
    "- Alpha",
    "",
    "## Planned projects",
    "- Beta",
    "",
    "## Completed projects",
    "- Done"
  ].join("\n");
  const bridge = {
    runtimeBuildId: "projects-domain-english-build",
    paths: { projectsRoot: "Projects", projectRegistryPath: "Noria/Projects.md" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: { async readText(pathText) { return pathText === "Noria/Projects.md" ? registryText : ""; } }
  });

  const snapshot = await service.getSnapshot({ preset: "home", include: ["projects"] });

  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.domains.projects.summary)), {
    activeCount: 1,
    plannedCount: 1,
    doneCount: 1,
    hiddenCount: 1,
    taskTotal: 0,
    taskDone: 0,
    taskOpen: 0,
    completionRate: 0,
    staleProjectCount: 1
  });
});

test("data service collects habits domain from registry and diary habit records", async () => {
  const data = loadDataService();
  const registryText = [
    "## 打卡中的习惯",
    "- 早间整理",
    "- 阅读摘录",
    "",
    "## 暂停的习惯",
    "- 旧习惯",
    "",
    "## 循环任务源（每日）",
    "- [ ] 早间整理 #habit #active",
    "- [ ] 阅读摘录 #habit #active",
    "- [ ] 旧习惯 #habit #paused"
  ].join("\n");
  const files = [
    { path: "06_Diary/2026/2026-05-01.md", stat: { mtime: 1 } },
    { path: "06_Diary/2026/2026-05-02.md", stat: { mtime: 2 } },
    { path: "06_Diary/2026/2026-05-03.md", stat: { mtime: 3 } }
  ];
  const texts = {
    "06_Diary/2026/2026-05-01.md": [
      "- [x] 早间整理 #habit [due:: 2026-05-01] [completion:: 2026-05-01]",
      "- [x] 阅读摘录 #habit [due:: 2026-05-01] [completion:: 2026-05-01]"
    ].join("\n"),
    "06_Diary/2026/2026-05-02.md": [
      "- [x] 早间整理 #habit [due:: 2026-05-02] [completion:: 2026-05-02]",
      "- [ ] 阅读摘录 #habit [due:: 2026-05-02]"
    ].join("\n"),
    "06_Diary/2026/2026-05-03.md": [
      "- [ ] 早间整理 #habit [due:: 2026-05-03]",
      "- [x] 阅读摘录 #habit [due:: 2026-05-03] [completion:: 2026-05-03]",
      "- [x] 旧习惯 #habit #paused [due:: 2026-05-03] [completion:: 2026-05-03]"
    ].join("\n")
  };
  const bridge = {
    runtimeBuildId: "habits-domain-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox", habitRegistryPath: "Noria/Habits.md" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForManagedPath(pathKey) { return pathKey === "diaryRoot" ? files : []; },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: {
        async read(pathText) { return texts[pathText] || ""; }
      }
    }
  };
  const service = data.createDataService({
    bridge,
    app,
    now: "2026-05-03",
    ctx: {
      async readText(pathText) {
        return pathText === "Noria/Habits.md" ? registryText : (texts[pathText] || "");
      }
    }
  });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["habits"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-03" }
  });
  const habits = snapshot.domains.habits;
  const items = new Map(JSON.parse(JSON.stringify(habits.items)).map((item) => [item.name, item]));

  assert.equal(habits.summary.activeCount, 2);
  assert.equal(habits.summary.scheduled, 6);
  assert.equal(habits.summary.checked, 4);
  assert.equal(habits.summary.completionRate, 66.7);
  assert.equal(habits.summary.currentStreak, 3);
  assert.equal(habits.summary.streak, 3);
  assert.deepEqual(Array.from(habits.heatmap.series, (row) => [row.key, row.checked, row.scheduled, row.completionRate]), [
    ["2026-05-01", 2, 2, 100],
    ["2026-05-02", 1, 2, 50],
    ["2026-05-03", 1, 2, 50]
  ]);
  assert.deepEqual(Array.from(items.keys()).sort(), ["早间整理", "阅读摘录"]);
  assert.equal(items.get("早间整理").checked, 2);
  assert.equal(items.get("阅读摘录").checked, 2);
  assert.deepEqual(Array.from(items.get("早间整理").heatmap.series, (row) => [row.key, row.checked, row.value]), [
    ["2026-05-01", 1, 1],
    ["2026-05-02", 1, 1],
    ["2026-05-03", 0, 0]
  ]);
  assert.deepEqual(Array.from(items.get("阅读摘录").heatmap.series, (row) => [row.key, row.checked, row.value]), [
    ["2026-05-01", 1, 1],
    ["2026-05-02", 0, 0],
    ["2026-05-03", 1, 1]
  ]);
});

test("data service keeps zero-hit active habits selectable with an empty heatmap series", async () => {
  const data = loadDataService();
  const registryText = [
    "## 打卡中的习惯",
    "- 冥想",
    "",
    "## 循环任务源（每日）",
    "- [ ] 冥想 #habit #active"
  ].join("\n");
  const bridge = {
    runtimeBuildId: "habits-zero-hit-build",
    paths: { diaryRoot: "06_Diary", habitRegistryPath: "Noria/Habits.md" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForManagedPath() { return []; },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: { vault: {} },
    now: "2026-05-03",
    ctx: { async readText(pathText) { return pathText === "Noria/Habits.md" ? registryText : ""; } }
  });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["habits"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-03" }
  });
  const habit = snapshot.domains.habits.items[0];

  assert.equal(habit.name, "冥想");
  assert.equal(habit.checked, 0);
  assert.deepEqual(Array.from(habit.heatmap.series, (row) => [row.key, row.value]), [
    ["2026-05-01", 0],
    ["2026-05-02", 0],
    ["2026-05-03", 0]
  ]);
});

test("data service accepts English habit registry section titles", async () => {
  const data = loadDataService();
  const registryText = [
    "## Active habits",
    "- Morning reset",
    "",
    "## Paused habits",
    "- Old habit",
    "",
    "## Established habits",
    "- Weekly review",
    "",
    "## Daily recurring task source",
    "- [ ] Morning reset #habit #active"
  ].join("\n");
  const bridge = {
    runtimeBuildId: "habits-domain-english-build",
    paths: { diaryRoot: "Diary", habitRegistryPath: "Noria/Habits.md" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForManagedPath() { return []; },
      pagesForManagedPath() { return []; },
      pagesForScope() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: { vault: {} },
    now: "2026-05-08",
    ctx: { async readText(pathText) { return pathText === "Noria/Habits.md" ? registryText : ""; } }
  });

  const snapshot = await service.getSnapshot({ preset: "home", include: ["habits"] });

  assert.equal(snapshot.domains.habits.summary.activeCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.domains.habits.items.map((item) => item.name))), ["Morning reset"]);
});

test("data service reuses habits collection across compatible snapshots", async () => {
  const data = loadDataService();
  const registryText = [
    "## 打卡中的习惯",
    "- 早间整理",
    "",
    "## 循环任务源（每日）",
    "- [ ] 早间整理 #habit #active"
  ].join("\n");
  const files = [
    { path: "06_Diary/2026/2026-05-01.md", stat: { mtime: 1 } }
  ];
  const texts = {
    "Noria/Habits.md": registryText,
    "06_Diary/2026/2026-05-01.md": "- [x] 早间整理 #habit [due:: 2026-05-01] [completion:: 2026-05-01]"
  };
  const reads = [];
  const bridge = {
    runtimeBuildId: "habits-domain-reuse-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox", habitRegistryPath: "Noria/Habits.md" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForManagedPath(pathKey) { return pathKey === "diaryRoot" ? files : []; },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: {
        async read(pathText) {
          reads.push(pathText);
          await new Promise((resolve) => setTimeout(resolve, 20));
          return texts[pathText] || "";
        }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });
  const range = { mode: "custom", start: "2026-05-01", end: "2026-05-07" };

  const [habitsOnly, habitsPlusHealth] = await Promise.all([
    service.getSnapshot({ preset: "home", include: ["habits"], range }),
    service.getSnapshot({ preset: "home", include: ["habits", "vaultHealth"], range })
  ]);

  assert.equal(habitsOnly.domains.habits.summary.checked, 1);
  assert.equal(habitsPlusHealth.domains.habits.summary.checked, 1);
  assert.deepEqual(reads.sort(), ["06_Diary/2026/2026-05-01.md", "Noria/Habits.md"].sort());
});

test("data service starts independent snapshot domain collectors without waiting for diary reads", async () => {
  const data = loadDataService();
  const reads = [];
  const resolvers = new Map();
  const bridge = {
    runtimeBuildId: "snapshot-domain-parallel-build",
    paths: {
      diaryRoot: "06_Diary",
      projectsRoot: "01_Projects",
      inboxRoot: "00_Inbox",
      habitRegistryPath: "Noria/Habits.md"
    },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForManagedPath() { return []; },
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return [
          { file: { path: "06_Diary/2026/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] } }
        ];
      },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return [
          {
            file: { path: "06_Diary/2026/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", tasks: [] },
            weather: "晴",
            mood: "稳定",
            energy: 4,
            focus: "基本专注"
          }
        ];
      },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({
    bridge,
    app: {},
    now: "2026-05-08",
    ctx: {
      async readText(pathText) {
        reads.push(pathText);
        return new Promise((resolve) => {
          resolvers.set(pathText, resolve);
        });
      }
    }
  });

  const snapshotPromise = service.getSnapshot({
    preset: "home",
    include: ["notes", "dailyState", "habits"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlyReads = [...reads];

  resolvers.get("06_Diary/2026/2026-05-01.md")?.("## 日记\n\n今天推进 Noria 性能。");
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolvers.get("Noria/Habits.md")?.("- [ ] 喝水 #habit #active");
  const snapshot = await snapshotPromise;

  assert.ok(snapshot.domains.notes);
  assert.ok(snapshot.domains.habits);
  assert.ok(earlyReads.includes("06_Diary/2026/2026-05-01.md"));
  assert.ok(
    earlyReads.includes("Noria/Habits.md"),
    "habits registry read should start before notes/daily diary read settles"
  );
});

test("data service collects vault health domain from markdown metadata and unresolved links", async () => {
  const data = loadDataService();
  const files = [
    { path: "01_Projects/Alpha.md", name: "Alpha.md", stat: { ctime: 1, mtime: 1 } },
    { path: "02_Areas/Tagged.md", name: "Tagged.md", stat: { ctime: 2, mtime: 2 } },
    { path: "02_Areas/Untagged.md", name: "Untagged.md", stat: { ctime: 3, mtime: 3 } },
    { path: "03_Resources/Reference.md", name: "Reference.md", stat: { ctime: 4, mtime: 4 } },
    { path: "00_Templates/Daily.md", name: "Daily.md", stat: { ctime: 5, mtime: 5 } },
    { path: "README.md", name: "README.md", stat: { ctime: 6, mtime: 6 } }
  ];
  const bridge = {
    runtimeBuildId: "vault-health-domain-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForScope(scopeId) { return scopeId === "notes" ? files : []; },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: { async read() { return ""; } }
    },
    metadataCache: {
      unresolvedLinks: {
        "01_Projects/Alpha.md": {
          "Missing project note": 1,
          "https://example.com": 1,
          "image.png": 1,
          "{{template-var}}": 1
        },
        "02_Areas/Untagged.md": {
          "Missing area note": 1
        },
        "00_Templates/Daily.md": {
          "Ignored template miss": 1
        }
      },
      getFileCache(file) {
        if (file.path === "01_Projects/Alpha.md") return { frontmatter: { tags: ["project"] } };
        if (file.path === "02_Areas/Tagged.md") return { tags: [{ tag: "#area" }] };
        if (file.path === "03_Resources/Reference.md") return { frontmatter: { tags: "#resource" } };
        return {};
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const snapshot = await service.getSnapshot({
    preset: "home",
    include: ["vaultHealth"],
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" }
  });
  const health = snapshot.domains.vaultHealth;

  assert.deepEqual(JSON.parse(JSON.stringify(health.summary)), {
    markdownFiles: 4,
    taggedFiles: 3,
    missingTags: 1,
    tagCoverage: 75,
    brokenLinks: 2,
    brokenLinkSources: 2
  });
  assert.deepEqual(JSON.parse(JSON.stringify(health.evidence.missingTagFiles.map((item) => item.path))), ["02_Areas/Untagged.md"]);
  assert.deepEqual(JSON.parse(JSON.stringify(health.evidence.brokenLinks.map((item) => [item.source, item.target]))), [
    ["01_Projects/Alpha.md", "Missing project note"],
    ["02_Areas/Untagged.md", "Missing area note"]
  ]);
});

test("data service resolves ranges and builds schema-versioned home and review snapshots", async () => {
  const data = loadDataService({
    localStorage: {
      "noria.home.trends.range.v2": JSON.stringify({ mode: "custom", start: "2026-05-01", end: "2026-05-07" })
    }
  });
  const bridge = {
    runtimeBuildId: "test-build",
    paths: {
      diaryRoot: "06_Diary",
      inboxRoot: "00_Inbox",
      projectRegistryPath: "Noria/Projects.md"
    },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return [
          { file: { path: "06_Diary/2026/2026-05-01.md", name: "2026-05-01.md", ctime: "2026-05-01T08:00:00.000Z", mtime: "1", tasks: [] }, weather: "晴", mood: "稳定", energy: 4, focus: "很专注" },
          { file: { path: "01_Projects/A.md", name: "A.md", ctime: "2026-05-02T08:00:00.000Z", mtime: "2", tasks: [] } }
        ];
      },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return [
          { file: { path: "06_Diary/2026/2026-05-01.md", name: "2026-05-01.md", tasks: [] }, weather: "晴", mood: "稳定", energy: 4, focus: "很专注" },
          { file: { path: "06_Diary/2026/2026-05-02.md", name: "2026-05-02.md", tasks: [] }, weather: "多云", mood: "很好", energy: 5, focus: "基本专注" }
        ];
      },
      tasksForScope() {
        return [
          { text: "Completed explicit [completion:: 2026-05-02]", completed: true, path: "01_Projects/A.md", line: 10 },
          { text: "Completed tasks-plugin ✅ 2026-05-03", completed: true, path: "01_Projects/B.md", line: 5 },
          { text: "Completed from diary without date", completed: true, path: "06_Diary/2026/2026-05-04.md", line: 9 },
          { text: "Completed without date", completed: true, path: "01_Projects/C.md", line: 1 },
          { text: "Open due [due:: 2026-05-05]", completed: false, path: "01_Projects/D.md", line: 2 }
        ];
      }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });

  assert.equal(service.resolveRange({ mode: "homeCurrent" }).start, "2026-05-01");
  assert.equal(service.resolveRange({ range: { mode: "year", anchor: "2026-05-08" }, granularity: "month" }).granularity, "month");
  assert.equal(service.resolveRange({ range: { mode: "year", anchor: "2026-05-08" } }).granularity, "week");

  const home = await service.getSnapshot({ preset: "home", range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" } });
  assert.equal(home.meta.schemaVersion, 1);
  assert.equal(home.meta.resolvedRequest.preset, "home");
  assert.equal(home.range.start, "2026-05-01");
  assert.ok(home.domains.notes.trend.series.length);
  assert.equal(home.domains.tasks.completion.completed, 3);
  assert.equal(home.domains.tasks.completion.undatedCompleted, 1);
  assert.equal(home.domains.dailyState.summary.validDays, 2);
  assert.equal(home.views.home.noteTrend, home.domains.notes.trend);
  assert.equal(home.views.home.taskTrend, home.domains.tasks.completion);
  assert.equal(Object.prototype.hasOwnProperty.call(home, "homeMetrics"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(home, "taskBoardStats"), false);

  const review = await service.getSnapshot({ preset: "review", range: { mode: "custom", start: "2026-05-01", end: "2026-05-07" } });
  assert.ok(review.domains.git);
  assert.ok(review.domains.inbox);
  assert.ok(review.domains.projects);
  assert.ok(review.domains.focus);
  assert.ok(review.domains.pomodoro);
  assert.equal(review.views.review.snapshot, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(review.views.review.domains)), Object.keys(review.domains));
  assert.equal(review.views.review.range.start, "2026-05-01");
  assert.equal(review.views.review.granularity, review.granularity);
  assert.doesNotThrow(() => JSON.stringify(review));
  assert.equal(review.sourceCompleteness.tasks.available, true);
  assert.deepEqual(review.meta.resolvedRequest.include.includes("git"), true);
});

test("data service resolves homeCurrent range from synced home settings before legacy localStorage", () => {
  const data = loadDataService({
    localStorage: {
      "noria.home.trends.range.v2": JSON.stringify({ mode: "custom", start: "2026-05-01", end: "2026-05-07" })
    }
  });
  const bridge = {
    homeSettings: {
      trendsRange: { mode: "year", start: "", end: "", yearGranularity: "month" }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });

  const resolved = service.resolveRange({ mode: "homeCurrent" });
  assert.equal(resolved.start, "2026-01-01");
  assert.equal(resolved.end, "2026-12-31");
  assert.equal(resolved.granularity, "month");
});

test("data service reads fresh markdown task facts from vault files without external index rows", async () => {
  const data = loadDataService();
  const files = [
    { path: "06_Diary/2026/2026-05-08.md" },
    { path: "06_Diary/2026/2026-05-08-review.md" },
    { path: "01_Projects/A.md" }
  ];
  const texts = {
    "06_Diary/2026/2026-05-08.md": [
      "- [x] 测试完成任务 [completion:: 2026-05-08]",
      "- [x] 测试 Tasks 完成 ✅ 2026-05-08",
      "- [ ] 测试计划任务 [due:: 2026-05-08]",
      "- [/] 进行中任务 [due:: 2026-05-08]",
      "- [-] 已取消任务 [due:: 2026-05-08]",
      "- [x] 习惯打卡 #habit [completion:: 2026-05-08]",
      "```",
      "- [x] 代码块里的任务 [completion:: 2026-05-08]",
      "```"
    ].join("\n"),
    "06_Diary/2026/2026-05-08-review.md": "- [x] 复盘 artifact 任务 [completion:: 2026-05-08]",
    "01_Projects/A.md": "- [ ] 项目计划任务 [due:: 2026-05-08]"
  };
  const bridge = {
    runtimeBuildId: "test-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      filesForScope(scopeId) {
        assert.equal(scopeId, "tasks");
        return files;
      },
      scopeFor(scopeId) {
        assert.equal(scopeId, "tasks");
        return { isAllVault: false, roots: ["06_Diary", "01_Projects", "00_Inbox"] };
      },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: {
        async read(pathText) { return texts[pathText] || ""; }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const home = await service.getSnapshot({ preset: "home", range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" } });
  const tasks = home.domains.tasks.completion;

  assert.equal(tasks.completed, 2);
  assert.equal(tasks.open, 3);
  assert.equal(tasks.activityTotal, 5);
  assert.equal(tasks.completionRate, 40);
  assert.equal(tasks.series[0].done, 2);
  assert.equal(tasks.series[0].planned, 5);
  assert.equal(tasks.series[0].open, 3);

  const normalized = await service.getTasks({ range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" }, bucketBy: "board", status: "all" });
  const byTitle = new Map(normalized.items.map((item) => [item.title, item]));
  assert.equal(byTitle.get("测试完成任务")?.checkbox.state, "done");
  assert.equal(byTitle.get("测试计划任务")?.checkbox.state, "todo");
  assert.equal(byTitle.get("进行中任务")?.checkbox.state, "in_progress");
  assert.equal(byTitle.get("已取消任务")?.checkbox.state, "cancelled");
  assert.equal(byTitle.get("已取消任务")?.checked, true);
  assert.equal(normalized.summary.cancelled, 1);
  assert.equal(normalized.summary.open, 3);
});

test("data service reads task source markdown files in parallel while preserving source order", async () => {
  const data = loadDataService();
  const files = [
    { path: "01_Projects/A.md", stat: { mtime: 1 } },
    { path: "01_Projects/B.md", stat: { mtime: 2 } },
    { path: "01_Projects/C.md", stat: { mtime: 3 } }
  ];
  const texts = {
    "01_Projects/A.md": "- [ ] Alpha [due:: 2026-05-08]",
    "01_Projects/B.md": "- [ ] Beta [due:: 2026-05-08]",
    "01_Projects/C.md": "- [ ] Gamma [due:: 2026-05-08]"
  };
  const reads = [];
  const resolvers = new Map();
  const bridge = {
    runtimeBuildId: "task-source-file-parallel-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      scopeFor(scopeId) {
        assert.equal(scopeId, "tasks");
        return { isAllVault: false, roots: ["01_Projects"] };
      },
      filesForScope(scopeId) {
        assert.equal(scopeId, "tasks");
        return files;
      },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: {
        async read(pathText) {
          reads.push(pathText);
          return new Promise((resolve) => {
            resolvers.set(pathText, resolve);
          });
        }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const tasksPromise = service.getTasks({
    range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" },
    bucketBy: "board",
    status: "all"
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlyReads = [...reads];
  for (const file of files) {
    while (!resolvers.has(file.path)) await new Promise((resolve) => setTimeout(resolve, 0));
    resolvers.get(file.path)(texts[file.path]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const tasks = await tasksPromise;

  assert.deepEqual(earlyReads, files.map((file) => file.path));
  assert.deepEqual(JSON.parse(JSON.stringify(tasks.items.map((item) => item.title))), ["Alpha", "Beta", "Gamma"]);
  assert.equal(tasks.meta.performance.sourceState, "cold");
  assert.equal(tasks.meta.performance.fileCount, 3);
  assert.equal(typeof tasks.meta.performance.enumerateMs, "number");
  assert.equal(typeof tasks.meta.performance.readMs, "number");
  assert.equal(typeof tasks.meta.performance.normalizeMs, "number");
  assert.equal(typeof tasks.meta.performance.filterMs, "number");

  const cached = await service.getTasks({
    range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" },
    bucketBy: "board",
    status: "all"
  });
  assert.equal(cached.meta.performance.sourceState, "hit");
  assert.deepEqual(reads, files.map((file) => file.path));
});

test("data service uses the initialized metadata task index before reading markdown", async () => {
  const data = loadDataService();
  const files = [
    { path: "01_Projects/A.md", stat: { mtime: 1 } },
    { path: "01_Projects/B.md", stat: { mtime: 2 } },
    { path: "01_Projects/C.md", stat: { mtime: 3 } }
  ];
  const texts = {
    "01_Projects/A.md": "- [ ] Alpha [due:: 2026-05-08]",
    "01_Projects/B.md": "No task here",
    "01_Projects/C.md": "- [ ] Gamma [due:: 2026-05-08]"
  };
  const reads = [];
  const bridge = {
    runtimeBuildId: "task-source-metadata-index-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      scopeFor() { return { isAllVault: false, roots: ["01_Projects"] }; },
      filesForScope(scopeId) {
        assert.equal(scopeId, "tasks");
        return files;
      },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    metadataCache: {
      initialized: true,
      getFileCache(file) {
        return file.path === "01_Projects/B.md"
          ? { listItems: [] }
          : { listItems: [{ task: " ", position: { start: { line: 0 } } }] };
      }
    },
    vault: {
      adapter: {
        async read(pathText) {
          reads.push(pathText);
          return texts[pathText];
        }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });
  const tasks = await service.getTasks({
    range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" },
    bucketBy: "board",
    status: "all"
  });

  assert.deepEqual(reads, ["01_Projects/A.md", "01_Projects/C.md"]);
  assert.deepEqual(JSON.parse(JSON.stringify(tasks.items.map((item) => item.title))), ["Alpha", "Gamma"]);
  assert.equal(tasks.meta.performance.indexState, "metadata-cache");
  assert.equal(tasks.meta.performance.scopeFileCount, 3);
  assert.equal(tasks.meta.performance.fileCount, 2);
});

test("data service resets global caches when runtime build changes", async () => {
  const data = loadDataService();
  const files = [{ path: "01_Projects/A.md", stat: { mtime: 1 } }];
  const reads = [];
  const app = {
    vault: {
      adapter: {
        async read(pathText) {
          reads.push(pathText);
          return "- [ ] Build scoped task [due:: 2026-05-08]";
        }
      }
    }
  };
  const makeBridge = (runtimeBuildId) => ({
    runtimeBuildId,
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    taskQueryContext: { taskTagFilter: { includeTags: [], excludeTags: ["#habit"] } },
    runtime: {
      toArray: (value) => Array.from(value || []),
      scopeFor(scopeId) {
        assert.equal(scopeId, "tasks");
        return { isAllVault: false, roots: ["01_Projects"] };
      },
      filesForScope(scopeId) {
        assert.equal(scopeId, "tasks");
        return files;
      },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  });
  const request = {
    range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" },
    bucketBy: "board",
    status: "all"
  };

  await data.createDataService({ bridge: makeBridge("build-a"), app, now: "2026-05-08" }).getTasks(request);
  await data.createDataService({ bridge: makeBridge("build-a"), app, now: "2026-05-08" }).getTasks(request);
  await data.createDataService({ bridge: makeBridge("build-b"), app, now: "2026-05-08" }).getTasks(request);

  assert.deepEqual(reads, ["01_Projects/A.md", "01_Projects/A.md"]);
});

test("data service normalizes mixed note ctime values for trend and distribution", async () => {
  const data = loadDataService();
  const bridge = {
    runtimeBuildId: "test-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return [
          { file: { path: "01_Projects/A.md", name: "A.md", ctime: new Date(2026, 4, 1, 9, 0), tasks: [] } },
          { file: { path: "02_Areas/B.md", name: "B.md", ctime: Number(new Date(2026, 4, 2, 9, 0)), tasks: [] } },
          { file: { path: "06_Diary/2026/2026-05-03.md", name: "2026-05-03.md", ctime: "2026-05-03T09:00:00.000Z", tasks: [] } }
        ];
      },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const service = data.createDataService({ bridge, app: {}, now: "2026-05-08" });

  const snapshot = await service.getSnapshot({
    preset: "home",
    range: { mode: "custom", start: "2026-05-01", end: "2026-05-03" }
  });

  assert.equal(snapshot.domains.notes.trend.totalCreated, 3);
  assert.deepEqual(Array.from(snapshot.domains.notes.trend.series, (row) => row.notes), [1, 1, 1]);
  assert.equal(snapshot.domains.notes.distribution.total, 3);
  assert.deepEqual(
    Array.from(snapshot.domains.notes.distribution.items, (item) => [item.key, item.count]).sort(),
    [["01_Projects", 1], ["02_Areas", 1], ["06_Diary", 1]]
  );
});

test("data service allFacts range policy returns full task facts while bucketing current range", async () => {
  const data = loadDataService();
  const files = [
    { path: "06_Diary/2026/2026-05-01.md", stat: { mtime: 1 } },
    { path: "06_Diary/2026/2026-05-08.md", stat: { mtime: 2 } }
  ];
  const reads = [];
  const texts = {
    "06_Diary/2026/2026-05-01.md": "- [ ] 早期逾期任务 [due:: 2026-05-01]",
    "06_Diary/2026/2026-05-08.md": "- [ ] 当天任务 [due:: 2026-05-08]"
  };
  const bridge = {
    runtimeBuildId: "test-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects", inboxRoot: "00_Inbox" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      scopeFor() { return { isAllVault: false, roots: ["06_Diary"] }; },
      filesForScope(scopeId) {
        assert.equal(scopeId, "tasks");
        return files;
      },
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() { return []; }
    }
  };
  const app = {
    vault: {
      adapter: {
        async read(pathText) {
          reads.push(pathText);
          return texts[pathText] || "";
        }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const ranged = await service.getTasks({ range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" }, bucketBy: "board" });
  assert.deepEqual(Array.from(ranged.items, (item) => item.title), ["当天任务"]);

  const allFacts = await service.getTasks({ range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" }, bucketBy: "board", rangePolicy: "allFacts" });
  assert.deepEqual(Array.from(allFacts.items, (item) => item.title).sort(), ["当天任务", "早期逾期任务"]);
  assert.deepEqual(Array.from(allFacts.buckets).filter((bucket) => bucket.items.length).map((bucket) => bucket.key), ["2026-05-08"]);
  assert.equal(reads.length, 2);

  await service.getTasks({ range: { mode: "custom", start: "2026-05-08", end: "2026-05-08" }, bucketBy: "board", rangePolicy: "allFacts" });
  assert.equal(reads.length, 2);
});

test("data service returns normalized tasks, periods, review evidence, and export envelopes", async () => {
  const data = loadDataService();
  const bridge = {
    runtimeBuildId: "test-build",
    paths: { diaryRoot: "06_Diary" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope() { return []; },
      pagesForManagedPath() { return []; },
      tasksForScope() {
        return [
          { text: "Done task [completion:: 2026-05-02]", completed: true, path: "06_Diary/2026/2026-05-02.md", line: 3 },
          { text: "Open task [due:: 2026-05-03]", completed: false, path: "01_Projects/A.md", line: 7 }
        ];
      }
    }
  };
  const writes = [];
  const app = {
    vault: {
      getAbstractFileByPath(pathText) {
        return pathText === "06_Diary/2026/2026-W19.md" ? { path: pathText } : null;
      },
      adapter: {
        async write(pathText, text) { writes.push({ path: pathText, text }); },
        async exists(pathText) { return pathText === "06_Diary/2026/2026-W19.md"; }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const tasks = await service.getTasks({ range: { mode: "week", anchor: "2026-05-02" }, bucketBy: "board", status: "all" });
  assert.equal(tasks.items.length, 2);
  assert.equal(tasks.items[0].identity.identityKind, "source-location");
  assert.equal(tasks.items[0].source.path, "06_Diary/2026/2026-05-02.md");
  assert.equal(tasks.items[0].text.clean, "Done task");
  assert.equal(tasks.summary.done, 1);
  assert.equal(tasks.summary.open, 1);
  assert.equal(tasks.undated.completed.length, 0);

  const periods = await service.getPeriods({ mode: "weekly", year: "2026", range: { start: "2026-05-04", end: "2026-05-10" } });
  assert.equal(periods.items[0].period, "2026-W19");
  assert.equal(periods.items[0].note.path, "06_Diary/2026/2026-W19.md");
  assert.equal(periods.items[0].review.artifactPath, "06_Diary/2026/2026-W19-review.md");
  assert.equal(periods.items[0].review.evidencePath, ".obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json");

  const weeklyEvidence = await service.getReviewEvidence({ mode: "weekly", period: "2026-W19" });
  assert.equal(weeklyEvidence.range.start, "2026-05-04");
  assert.equal(weeklyEvidence.range.end, "2026-05-10");
  assert.equal(weeklyEvidence.range.dayCount, 7);
  assert.equal(weeklyEvidence.sourceTrace.periodMode, "weekly");
  assert.equal(weeklyEvidence.sourceTrace.dailyNoteCount, 7);
  assert.equal(weeklyEvidence.evidence.dailyNotes.length, 7);
  assert.equal(weeklyEvidence.evidence.dailyNotes[0].date, "2026-05-04");
  assert.equal(weeklyEvidence.evidence.dailyNotes[0].path, "06_Diary/2026/2026-05-04.md");
  assert.equal(weeklyEvidence.evidence.dailyNotes[6].date, "2026-05-10");
  assert.equal(weeklyEvidence.evidence.dailyNotes[6].path, "06_Diary/2026/2026-05-10.md");
  assert.equal(weeklyEvidence.evidence.suggestedReadOrder[0], "06_Diary/2026/2026-W19.md");
  assert.equal(weeklyEvidence.evidence.suggestedReadOrder[1], "06_Diary/2026/2026-05-04.md");

  const yearlyWeek = await service.getReviewEvidence({ mode: "yearly", period: "2026", granularity: "week" });
  assert.equal(yearlyWeek.mode, "yearly");
  assert.equal(yearlyWeek.period, "2026");
  assert.equal(yearlyWeek.artifactPath, "06_Diary/2026/2026-review-week.md");
  assert.equal(yearlyWeek.evidencePath, ".obsidian/plugins/noria/cache/stats/review/2026/2026.week.json");
  assert.equal(yearlyWeek.aiGuidance.principles.includes("metrics-as-evidence-not-judgment"), true);

  const exported = await service.export({
    kind: "reviewEvidence",
    request: { mode: "weekly", period: "2026-W19" },
    outputPath: ".obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json"
  });
  assert.equal(exported.exportKind, "noria.reviewEvidence");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, ".obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json");
  assert.equal(JSON.parse(writes[0].text).payload.period, "2026-W19");
});

test("period review evidence exposes daily evidence source map and gaps", async () => {
  const data = loadDataService();
  const existingPaths = new Set([
    "06_Diary/2026/2026-W19.md",
    "06_Diary/2026/2026-05-04.md",
    "06_Diary/2026/2026-05-06.md"
  ]);
  const texts = {
    "06_Diary/2026/2026-05-04.md": "## 日记\n\n完成关键实验。",
    "06_Diary/2026/2026-05-06.md": "## 日记\n\n项目推进受阻。"
  };
  const bridge = {
    runtimeBuildId: "period-source-map-build",
    paths: { diaryRoot: "06_Diary", projectsRoot: "01_Projects" },
    runtime: {
      toArray: (value) => Array.from(value || []),
      pagesForScope(scopeId) {
        if (scopeId !== "notes") return [];
        return [
          { file: { path: "06_Diary/2026/2026-05-04.md", name: "2026-05-04.md", ctime: "2026-05-04T08:00:00.000Z", tasks: [] }, weather: "晴", mood: "稳定", energy: 4, focus: "很专注" },
          { file: { path: "06_Diary/2026/2026-05-06.md", name: "2026-05-06.md", ctime: "2026-05-06T08:00:00.000Z", tasks: [] }, weather: "", mood: "", energy: 0, focus: "" }
        ];
      },
      pagesForManagedPath(pathKey) {
        if (pathKey !== "diaryRoot") return [];
        return [
          { file: { path: "06_Diary/2026/2026-05-04.md", name: "2026-05-04.md", tasks: [] }, weather: "晴", mood: "稳定", energy: 4, focus: "很专注" },
          { file: { path: "06_Diary/2026/2026-05-06.md", name: "2026-05-06.md", tasks: [] }, weather: "", mood: "", energy: 0, focus: "" }
        ];
      },
      tasksForScope() {
        return [
          { text: "完成关键实验 [completion:: 2026-05-04]", completed: true, path: "06_Diary/2026/2026-05-04.md", line: 12 },
          { text: "推进论文修改 [due:: 2026-05-06]", completed: false, path: "01_Projects/Paper.md", line: 7 }
        ];
      }
    }
  };
  const app = {
    vault: {
      getAbstractFileByPath(pathText) {
        return existingPaths.has(pathText) ? { path: pathText } : null;
      },
      adapter: {
        async read(pathText) {
          return texts[pathText] || "";
        }
      }
    }
  };
  const service = data.createDataService({ bridge, app, now: "2026-05-08" });

  const evidence = await service.getReviewEvidence({ mode: "weekly", period: "2026-W19" });
  const may4 = evidence.evidence.dailyNotes.find((item) => item.date === "2026-05-04");
  const may5 = evidence.evidence.dailyNotes.find((item) => item.date === "2026-05-05");
  const may6 = evidence.evidence.dailyNotes.find((item) => item.date === "2026-05-06");
  const projectSource = evidence.evidence.taskSourceNotes.find((item) => item.path === "01_Projects/Paper.md");
  const diarySource = evidence.evidence.taskSourceNotes.find((item) => item.path === "06_Diary/2026/2026-05-04.md");

  assert.equal(evidence.sourceTrace.dailyNoteCount, 7);
  assert.equal(evidence.sourceTrace.existingDailyNoteCount, 2);
  assert.equal(evidence.sourceTrace.missingDailyNoteCount, 5);
  assert.deepEqual(Array.from(evidence.sourceTrace.missingDailyNotes, (item) => item.date), [
    "2026-05-05",
    "2026-05-07",
    "2026-05-08",
    "2026-05-09",
    "2026-05-10"
  ]);
  assert.equal(evidence.sourceTrace.dailyEvidenceTotals.tasksDone, 1);
  assert.equal(evidence.sourceTrace.dailyEvidenceTotals.tasksOpen, 1);
  assert.equal(evidence.sourceTrace.dailyEvidenceTotals.dailyStateDays, 1);
  assert.equal(may4.exists, true);
  assert.equal(may4.tasksDone, 1);
  assert.equal(may4.tasksOpen, 0);
  assert.equal(may4.diaryWords > 0, true);
  assert.equal(may4.dailyStateRecorded, true);
  assert.equal(may5.exists, false);
  assert.equal(may5.tasksDone, 0);
  assert.equal(may5.diaryWords, 0);
  assert.equal(may6.exists, true);
  assert.equal(may6.tasksOpen, 1);
  assert.equal(projectSource.tasksOpen, 1);
  assert.equal(diarySource.tasksDone, 1);
});
