const cur = ctx.current();
const fileName = String(cur?.file?.name || "").replace(".md", "");
const filePath = String(cur?.file?.path || "");
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const normalizeVaultRoot = (value) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
const diaryRoot = normalizeVaultRoot(bridge?.paths?.diaryRoot || bridge?.settings?.managedPaths?.diaryRoot || "06_Diary") || "06_Diary";
const yearUnderDiaryRoot = (path) => {
  const p = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${diaryRoot}/`;
  if (!p.startsWith(prefix)) return "";
  const first = p.slice(prefix.length).split("/").filter(Boolean)[0] || "";
  return /^\d{4}$/.test(first) ? first : "";
};
const weeklyOtherT = (key, params = {}) => {
  try {
    if (bridge && typeof bridge.t === "function") return bridge.t(key, params);
    const messages = bridge?.i18n?.messages || {};
    const fallback = bridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
const yearFromPath = yearUnderDiaryRoot(filePath);
const weekMatch = fileName.match(/^(\d{4})-W(\d{2})$/i);
if (!yearFromPath || !weekMatch) {
  ctx.paragraph(weeklyOtherT("runtime.periodic.otherTasks.weekNameInvalid"));
  return;
}

const year = Number(weekMatch[1]);
if (String(year) !== String(yearFromPath)) {
  ctx.paragraph(weeklyOtherT("runtime.periodic.otherTasks.weekYearMismatch"));
  return;
}
const weekNum = Number(weekMatch[2]);
const start = window.moment().isoWeekYear(year).isoWeek(weekNum).startOf("isoWeek");
const end = start.clone().endOf("isoWeek");
const currentPath = String(ctx.current()?.file?.path || "");

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
  const map = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 };
  if (map[p]) return map[p];
  const m = String(t?.text || "").match(/\[priority::\s*(highest|high|medium|low|lowest)\]/i);
  return m ? map[String(m[1]).toLowerCase()] || 0 : 0;
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
const inRange = (ds) => !!ds && window.moment(ds, "YYYY-MM-DD", true).isBetween(start, end, "day", "[]");
const beforeOrInEnd = (ds) => !!ds && window.moment(ds, "YYYY-MM-DD", true).isSameOrBefore(end, "day");
const markTaskDone = async (task) => {
  try {
    const path = String(task?.path || "");
    if (!path) return false;
    const result = await bridge.tasks?.updateStatus?.({
      path,
      line: task?.line,
      rawText: task?.rawText,
      text: task?.text,
      done: true
    });
    if (!result?.ok) return false;
    try {
      bridge.refresh?.requestRefresh?.("stats", "weekly-other-task-done");
    } catch (_) {}
    return true;
  } catch {
    return false;
  }
};

const noriaInput = typeof input !== "undefined" ? input : {};
const noriaBridge = noriaInput?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
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
const tasks = (await noriaTasksForScope())
  .filter(isTaskRow)
  .filter((t) => String(t.path || "") !== currentPath)
  .filter((t) => !/(^|\s)#habit\b/i.test(String(t.text || "")))
  .filter((t) => {
    const due = taskDate(t, "due");
    const sch = taskDate(t, "scheduled");
    const sta = taskDate(t, "start");
    const done = taskDate(t, "done");
    if (taskDone(t)) return inRange(done);
    return inRange(due) || inRange(sch) || inRange(sta) || beforeOrInEnd(due) || beforeOrInEnd(sch) || beforeOrInEnd(sta);
  })
  .map((t) => ({
    ...t,
    _clean: clean(t.text),
    _score: priorityScore(t),
    _date: taskDate(t, "due") || taskDate(t, "scheduled") || taskDate(t, "start") || "9999-12-31"
  }))
  .filter((t) => !!t._clean)
  .sort((a, b) =>
    Number(taskDone(a)) - Number(taskDone(b))
    || b._score - a._score
    || String(a._date).localeCompare(String(b._date))
    || a._clean.localeCompare(b._clean, "zh-CN")
  )
  .slice(0, 20);

const taskDisplay = await loadTaskDisplayUtils();
const root = ctx.el("div", "", { cls: "noria-periodic-task-list weekly-other-tasks" });
if (tasks.length === 0) {
  root.createEl("div", { text: weeklyOtherT("runtime.periodic.otherTasks.weekEmpty") }).style.cssText = "color:var(--text-muted);";
  return;
}
for (const t of tasks) {
  if (taskDisplay?.renderTaskRow) {
    taskDisplay.renderTaskRow(root, t, {
      title: t._clean,
      anchorDate: end.format("YYYY-MM-DD"),
      onToggle: markTaskDone
    });
  } else {
    root.createEl("div", { text: t._clean });
  }
}
