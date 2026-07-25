const file = ctx.current()?.file;
const notePath = String(file?.path || "");
const noteName = String(file?.name || "").replace(/\.md$/i, "");

const noteDate =
  /^\d{8}$/.test(noteName)
    ? `${noteName.slice(0, 4)}-${noteName.slice(4, 6)}-${noteName.slice(6, 8)}`
    : (/^\d{4}-\d{2}-\d{2}$/.test(noteName) ? noteName : "");

const parseInlineDate = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})\\]`, "i"));
  return m ? m[1] : "";
};
const parseEmojiDate = (text, re) => {
  const m = String(text || "").match(re);
  return m ? m[1] : "";
};
const taskDate = (t, key) => {
  const txt = String(t?.text || "");
  if (key === "due") return String(t?.due || "").slice(0, 10) || parseInlineDate(txt, "due") || parseEmojiDate(txt, /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "scheduled") return String(t?.scheduled || "").slice(0, 10) || parseInlineDate(txt, "scheduled") || parseEmojiDate(txt, /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "start") return String(t?.start || "").slice(0, 10) || parseInlineDate(txt, "start") || parseEmojiDate(txt, /🛫\s*(\d{4}-\d{2}-\d{2})/);
  if (key === "done") return String(t?.completion || "").slice(0, 10) || parseInlineDate(txt, "done") || parseEmojiDate(txt, /✅\s*(\d{4}-\d{2}-\d{2})/);
  return "";
};
const priorityScore = (t) => {
  const p = String(t?.priority || "").toLowerCase();
  if (p === "highest") return 5;
  if (p === "high") return 4;
  if (p === "medium") return 3;
  if (p === "low") return 2;
  if (p === "lowest") return 1;
  const m = String(t?.text || "").match(/\[priority::\s*(highest|high|medium|low|lowest)\]/i);
  if (!m) return 0;
  return priorityScore({ priority: m[1] });
};
const clean = (text) =>
  String(text || "")
    .replace(/#habit-active\b/gi, "")
    .replace(/#habit-paused\b/gi, "")
    .replace(/#habit-done\b/gi, "")
    .replace(/#active\b/gi, "")
    .replace(/#paused\b/gi, "")
    .replace(/#done\b/gi, "")
    .replace(/#habit\b/gi, "")
    .replace(/#[一-龥\w/-]+/g, "")
    .replace(/(?:📅|⏳|🛫|✅)\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/🔁\s*[^#\[\]\n]+/g, "")
    .replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
const escapeRegExp = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function loadTaskDisplayUtils() {
  if (globalThis.dashboardCore?.utils?.taskDisplay) return globalThis.dashboardCore.utils.taskDisplay;
  const p = ".obsidian/plugins/noria/views/dashboard/core/utils/task-display.js";
  let code = "";
  try {
    code = String(await ctx.io.load(p) || "");
  } catch (_) {}
  if (!code) {
    try {
      code = String(await app.vault.adapter.read(p) || "");
    } catch (_) {}
  }
  if (code) (0, eval)(code);
  return globalThis.dashboardCore?.utils?.taskDisplay || null;
}
const markTaskDone = async (task) => {
  try {
    const path = String(task?.path || "");
    if (!path) return false;
    const result = await noriaBridge.tasks?.updateStatus?.({
      path,
      line: task?.line,
      rawText: task?.rawText,
      text: task?.text,
      done: true
    });
    if (!result?.ok) return false;
    try {
      noriaBridge.refresh?.requestRefresh?.("stats", "daily-other-task-done");
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
};

const noriaInput = typeof input !== "undefined" ? input : {};
const noriaBridge = noriaInput?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const noriaT = (key, params = {}) => {
  try {
    if (noriaBridge && typeof noriaBridge.t === "function") return noriaBridge.t(key, params);
    const messages = noriaBridge?.i18n?.messages || {};
    const fallback = noriaBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
const noriaTasksForScope = async () => {
  try {
    const rows = await noriaBridge.runtime?.tasksForScope?.("tasks", ctx);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
};
const isTaskRow = (t) => !!(t && typeof t === "object" && String(t.text || t.task || "").trim());
const taskDone = (t) => t && t.completed === true;
const allTasks = (await noriaTasksForScope())
  .filter(isTaskRow)
  .filter((t) => !/(^|\s)#habit\b/i.test(String(t.text || "")));

const pool = allTasks
  .filter((t) => String(t.path || "") !== notePath)
  .filter((t) => {
    if (!noteDate) return false;
    const due = taskDate(t, "due");
    const sch = taskDate(t, "scheduled");
    const sta = taskDate(t, "start");
    const relatedDate = [due, sch, sta].filter(Boolean);
    const isTodayOrOverdue = relatedDate.some((d) => d <= noteDate);
    if (!isTodayOrOverdue) return false;

    // 已完成任务也显示：只保留今天完成（或无完成日期）的项，避免历史噪音
    if (taskDone(t)) {
      const done = taskDate(t, "done");
      return !done || done === noteDate;
    }
    return true;
  })
  .map((t) => ({
    t,
    score: priorityScore(t),
    text: clean(t.text),
    due: taskDate(t, "due"),
    dateStamp: [taskDate(t, "due"), taskDate(t, "scheduled"), taskDate(t, "start")].filter(Boolean).sort()[0] || "9999-12-31"
  }))
  .filter((x) => !!x.text)
  .sort((a, b) =>
    Number(taskDone(a.t)) - Number(taskDone(b.t))
    || b.score - a.score
    || a.dateStamp.localeCompare(b.dateStamp)
    || a.text.localeCompare(b.text, "zh-CN")
  )
  .slice(0, 12);

const taskDisplay = await loadTaskDisplayUtils();
if (pool.length === 0) {
  ctx.paragraph(`- ${noriaT("runtime.home.trends.none")}`);
} else {
  const root = ctx.el("div", "", { cls: "noria-periodic-task-list daily-other-today" });
  for (const x of pool) {
    if (taskDisplay?.renderTaskRow) {
      taskDisplay.renderTaskRow(root, { ...x.t, due: x.due }, {
        title: x.text,
        anchorDate: noteDate,
        onToggle: markTaskDone
      });
    } else {
      root.createEl("div", { text: clean(x.text) });
    }
  }
}
