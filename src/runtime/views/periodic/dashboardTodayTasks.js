const host = (input && input.mount) ? input.mount : this.container;
const habitTags = ["#habit", "#健康", "#运动", "#作息"];
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const normalizeVaultPath = (value) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
const getConfiguredDiaryRoot = () =>
  normalizeVaultPath(bridge?.paths?.diaryRoot || bridge?.settings?.managedPaths?.diaryRoot || "06_Diary") || "06_Diary";
const ensureParentFolder = async (filePath) => {
  const normalized = normalizeVaultPath(filePath);
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return;
  const parts = normalized.slice(0, slash).split("/").filter(Boolean);
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cursor)) {
      try {
        await app.vault.createFolder(cursor);
      } catch (_) {}
    }
  }
};
const periodicTasksT = (key, params = {}) => {
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
const noriaTasksForScope = async () => {
  try {
    const scoped = await bridge.runtime?.tasksForScope?.("tasks", ctx);
    if (scoped) return scoped;
    return typeof bridge.runtime?.tasksForScope === "function"
      ? await bridge.runtime.tasksForScope("tasks", ctx)
      : [];
  } catch (_) { return []; }
};

const pad2 = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoWeek = (d) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
};

const dayOfWeek = now.getDay();
const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
const weekStartDate = new Date(now);
weekStartDate.setHours(0, 0, 0, 0);
weekStartDate.setDate(now.getDate() + mondayOffset);
const weekEndDate = new Date(weekStartDate);
weekEndDate.setDate(weekStartDate.getDate() + 6);
const weekStartStr = toDateStr(weekStartDate);
const weekEndStr = toDateStr(weekEndDate);

const monthStartStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
const monthEndStr = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const yearStartStr = `${now.getFullYear()}-01-01`;
const yearEndStr = `${now.getFullYear()}-12-31`;

const PERIOD_RANGES = {
  day: { start: todayStr, end: todayStr },
  week: { start: weekStartStr, end: weekEndStr },
  month: { start: monthStartStr, end: monthEndStr },
  year: { start: yearStartStr, end: yearEndStr }
};
const PERIOD_TASK_HEADINGS = {
  day: "今日任务",
  week: "本周任务",
  month: "本月任务",
  year: "本年任务"
};
const getDiaryPathByPeriod = (periodKey) => {
  const y = now.getFullYear();
  const root = getConfiguredDiaryRoot();
  if (periodKey === "day") return `${root}/${y}/${todayStr}.md`;
  if (periodKey === "week") return `${root}/${y}/${y}-W${String(isoWeek(now)).padStart(2, "0")}.md`;
  if (periodKey === "month") return `${root}/${y}/${y}-${pad2(now.getMonth() + 1)}.md`;
  return `${root}/${y}/${y}.md`;
};
/** 任务日期：日与起止同日；周/月/年为该周期末日（与周期计划语义一致） */
const buildDiaryTaskLine = (lineRaw, periodKey) => {
  const taskText = String(lineRaw || "").trim().replace(/\n/g, " ");
  if (!taskText) return "";
  let s;
  let d;
  if (periodKey === "day") {
    s = todayStr;
    d = todayStr;
  } else if (periodKey === "week") {
    s = weekEndStr;
    d = weekEndStr;
  } else if (periodKey === "month") {
    s = monthEndStr;
    d = monthEndStr;
  } else {
    s = yearEndStr;
    d = yearEndStr;
  }
  return `- [ ] ${taskText} [start:: ${s}] [due:: ${d}]`;
};
const appendTaskLineToDiary = (text, heading, fullLine) => {
  const line = String(fullLine || "").trim();
  if (!line) return String(text || "");
  const re = new RegExp(`^(###\\s*${heading}\\s*(?:\\r?\\n)+)([\\s\\S]*?)(?=^(?:###|##)\\s|^\\\`\\\`\\\`)`, "m");
  if (re.test(text)) {
    return String(text || "").replace(re, (_, head, body) => `${head}${String(body || "").trimEnd()}\n${line}\n`);
  }
  const todo = /^(##\s*待办\s*(?:\r?\n)+)/m;
  if (todo.test(text)) {
    return String(text || "").replace(todo, `$1\n### ${heading}\n\n${line}\n\n`);
  }
  return String(text || "").trimEnd() + `\n\n## 待办\n\n### ${heading}\n\n${line}\n`;
};
const processPeriodDiaryText = async (path, seed, transform) => {
  let file = app.vault.getAbstractFileByPath(path);
  const apply = (current) => {
    const source = String(current || "");
    const next = transform(source);
    return next == null ? source : String(next);
  };
  if (!file) {
    await ensureParentFolder(path);
    const initial = apply(seed);
    try {
      file = await app.vault.create(path, initial);
      return { file, text: initial, created: true };
    } catch (error) {
      const message = String(error?.message || error || "");
      file = app.vault.getAbstractFileByPath(path);
      if (!file && /File already exists|already exists/i.test(message)) {
        await Promise.resolve();
        file = app.vault.getAbstractFileByPath(path);
      }
      if (!file) throw error;
    }
  }
  let nextText = "";
  let currentText = "";
  if (typeof app.vault.process === "function") {
    await app.vault.process(file, (current) => {
      currentText = String(current || "");
      nextText = apply(currentText);
      return nextText;
    });
  } else {
    currentText = String(await app.vault.read(file) || "");
    nextText = apply(currentText);
    if (nextText !== currentText) await app.vault.modify(file, nextText);
  }
  return { file, text: nextText, created: false, unchanged: nextText === currentText };
};
const addTaskToPeriodDiary = async (periodKey, taskText) => {
  const path = getDiaryPathByPeriod(periodKey);
  const built = buildDiaryTaskLine(taskText, periodKey);
  if (!built) return false;
  const seed = `---\ntags:\n  - daily-plan\n---\n\n`;
  await processPeriodDiaryText(path, seed, (current) => {
    return appendTaskLineToDiary(current, PERIOD_TASK_HEADINGS[periodKey] || "今日任务", built);
  });
  try {
    globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("home", "dashboard-period-task-add");
  } catch (_) {}
  return true;
};

const cleanTaskText = (txt) =>
  String(txt || "")
    .replace(/(?:^|\s)[#＃][^\s#＃]+/g, " ")
    .replace(/(?:📅|⏳|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/(?:⏫|🔼|🔽|⏬)/g, "")
    .replace(/🆔\s*[^\s]+/g, "")
    .replace(/⛔\s*[^\s]+/g, "")
    .replace(/🔁\s*[^#\[\]\n]+/g, "")
    .replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, p1) => String(p1 || "").split("/").pop())
    .replace(/\s{2,}/g, " ")
    .trim();

const toDate = (v) => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const getInlineDate = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})\\]`, "i"));
  return m ? m[1] : null;
};
const getTaskDates = (t) => {
  const txt = String(t?.text || "");
  return {
    due: toDate(t?.due) || getInlineDate(txt, "due"),
    scheduled: toDate(t?.scheduled) || getInlineDate(txt, "scheduled"),
    start: toDate(t?.start) || getInlineDate(txt, "start"),
  };
};
const getDoneDate = (t) => {
  const txt = String(t?.text || "");
  return toDate(t?.completion) || getInlineDate(txt, "done");
};

/** 从正文解析 [due:: …] 的可选时间；无时间则返回 null */
const getDueInstantFromTask = (task) => {
  const txt = String(task?.text || "");
  const m = txt.match(/\[due::\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\]/i);
  if (!m) return null;
  const y = +m[1].slice(0, 4);
  const mo = +m[1].slice(5, 7) - 1;
  const da = +m[1].slice(8, 10);
  if (m[2] != null) {
    const h = +m[2];
    const mi = +(m[3] || 0);
    const se = +(m[4] || 0);
    return new Date(y, mo, da, h, mi, se, 0).getTime();
  }
  return null;
};

const isOverdueOpenTask = (task, d, done) => {
  if (done || !d.due) return false;
  const inst = getDueInstantFromTask(task);
  if (inst != null) return inst < now.getTime();
  return d.due < todayStr;
};

function dashboardLeafIsInSidePanel(leaf) {
  if (!leaf || typeof leaf.getRoot !== "function") return true;
  try {
    const r = leaf.getRoot();
    const ws = app.workspace;
    if (ws.leftSplit && r === ws.leftSplit) return true;
    if (ws.rightSplit && r === ws.rightSplit) return true;
  } catch (_) {}
  return false;
}

function dashboardPickLeafForMarkdownOpen() {
  const ws = app.workspace;
  if (!ws) return null;
  try {
    const al = ws.activeLeaf;
    if (al && !dashboardLeafIsInSidePanel(al)) {
      const vt = al.view && typeof al.view.getViewType === "function" ? al.view.getViewType() : "";
      if (vt === "markdown") {
        return al;
      }
    }
  } catch (_) {}
  try {
    return ws.getLeaf("tab");
  } catch (_) {
    try {
      return ws.getLeaf(false);
    } catch (e2) {
      return null;
    }
  }
}

async function openTaskAtLine(task) {
  const path = String(task?.path || task?._page?.file?.path || "").replace(/\\/g, "/");
  if (!path) return;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) {
    bridge.runtime?.notice?.("runtime.periodic.todayTasks.missingPath", { path }, 4200)
      || new Notice(periodicTasksT("runtime.periodic.todayTasks.missingPath", { path }), 4200);
    return;
  }
  const leaf = dashboardPickLeafForMarkdownOpen();
  if (!leaf) return;
  await leaf.openFile(file, { active: true });
  await new Promise((r) => requestAnimationFrame(r));
  const view = leaf.view;
  const ln = Math.max(0, Number(task.line) || 0);
  try {
    if (view && typeof view.setEphemeralState === "function") {
      view.setEphemeralState({ line: ln });
    }
  } catch (_) {}
  try {
    const ed = view?.editor;
    if (ed && typeof ed.setCursor === "function") {
      ed.setCursor({ line: ln, ch: 0 });
      if (typeof ed.scrollIntoView === "function") {
        ed.scrollIntoView({ from: { line: ln, ch: 0 }, to: { line: ln, ch: 0 } }, true);
      }
    }
  } catch (_) {}
}
const priorityScore = (task) => {
  const map = { lowest: 0, low: 1, normal: 2, medium: 3, high: 4, highest: 5 };
  const raw = task?.priority ?? task?.priorityName ?? task?.priorityLabel;
  const text = String(task?.text || "");
  const inlineMatch = text.match(/\[priority::\s*([^\]]+)\]/i);
  const source = String(raw ?? (inlineMatch ? inlineMatch[1] : "")).toLowerCase().trim();
  if (source in map) return map[source];
  if (source.includes("highest")) return map.highest;
  if (source.includes("high")) return map.high;
  if (source.includes("medium")) return map.medium;
  if (source.includes("normal")) return map.normal;
  if (source.includes("low")) return map.low;
  if (source.includes("lowest")) return map.lowest;
  return map.normal;
};
const dateStamp = (task) => {
  const dates = getTaskDates(task);
  const d = dates.due ?? dates.scheduled ?? dates.start ?? null;
  if (!d) return "9999-12-31";
  return String(d).slice(0, 10);
};
const isNotTemplate = (t) => {
  const sp = `${t.section?.subpath ?? t.section?.path ?? ""}`;
  return !sp.includes("Inbox") && !sp.includes("项目推进记录");
};
/** 主页待办不展示带 #tl 的任务（时间线/列表类标签） */
const isTlTagged = (t) => /(?:^|\s)#tl\b/i.test(String(t?.text || ""));
const isRelevantTask = (t) =>
  t.text &&
  !isTlTagged(t) &&
  !habitTags.some((tag) => String(t.text).includes(tag)) &&
  isNotTemplate(t);
const isActionable = (t) => {
  const d = getTaskDates(t);
  return (d.due && d.due <= todayStr) || (d.scheduled && d.scheduled <= todayStr) || (d.start && d.start <= todayStr);
};
const isUndatedOpenTask = (t) => {
  if (!t || t.completed) return false;
  const d = getTaskDates(t);
  return !d.due && !d.scheduled && !d.start;
};
const isTodayAnchoredTask = (task) => {
  const d = getTaskDates(task);
  return d.due === todayStr || d.scheduled === todayStr || d.start === todayStr;
};
const isFutureAnchoredTask = (task) => {
  const d = getTaskDates(task);
  const stamps = [d.due, d.scheduled, d.start].filter(Boolean);
  return stamps.length > 0 && stamps.every((x) => x > todayStr);
};
const taskRhythmKind = (task) => {
  if (!task || task.completed) return "done";
  if (isFutureAnchoredTask(task)) return "later";
  if (isActionable(task) || isTodayAnchoredTask(task) || priorityScore(task) >= 4) return "now";
  if (isUndatedOpenTask(task)) return "next";
  return "next";
};
const TASK_GROUPS = [
  { kind: "now", labelKey: "runtime.periodic.todayTasks.rhythmNow" },
  { kind: "next", labelKey: "runtime.periodic.todayTasks.rhythmNext" },
  { kind: "later", labelKey: "runtime.periodic.todayTasks.rhythmLater" }
];
const taskDateHint = (d) => d.due || d.scheduled || d.start || "";
const taskHoverTitle = (task, label, d, done = !!task?.completed) => {
  if (!isOverdueOpenTask(task, d, done)) return label;
  return periodicTasksT("runtime.periodic.todayTasks.overdueTitle", { label, date: taskDateHint(d) });
};
const escapeRegExp = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const markTaskStatus = async (task, done = true) => {
  try {
    const path = String(task?.path || task?._page?.file?.path || "");
    if (!path) return false;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return false;
    let updated = false;
    const expectedText = String(task?.rawText || task?.text || "")
      .trim()
      .replace(/^\s*[-*]\s*\[[^\]\r\n]?\]\s*/, "")
      .trim();
    if (!expectedText) return false;
    const applyMutation = (current) => {
      updated = false;
      const source = String(current || "");
      const lines = source.split(/\r?\n/);
      const stateRe = done ? /^\s*[-*]\s*\[\s\]\s*/ : /^\s*[-*]\s*\[[xX]\]\s*/;
      const normalize = (line) => String(line || "")
        .replace(/^\s*[-*]\s*\[[^\]\r\n]?\]\s*/, "")
        .trim();
      const matches = (idx) => idx >= 0
        && idx < lines.length
        && stateRe.test(lines[idx])
        && normalize(lines[idx]) === expectedText;
      const candidates = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (matches(i)) candidates.push(i);
      }
      if (candidates.length !== 1) return source;
      const idx = candidates[0];
      lines[idx] = done
        ? lines[idx].replace(/^(\s*[-*]\s*)\[\s\]/, "$1[x]")
        : lines[idx].replace(/^(\s*[-*]\s*)\[[xX]\]/, "$1[ ]");
      updated = true;
      return lines.join("\n");
    };
    if (typeof app.vault.process === "function") {
      await app.vault.process(file, applyMutation);
    } else {
      const raw = await app.vault.read(file);
      const next = applyMutation(raw);
      if (updated) await app.vault.modify(file, next);
    }
    if (!updated) return false;
    try {
      globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("home", "dashboard-task-status");
    } catch (_) {}
    return true;
  } catch (e) {
    return false;
  }
};

const anchorInRange = (t, start, end) => {
  const { due, scheduled, start: st } = getTaskDates(t);
  return [due, scheduled, st].filter(Boolean).some((d) => d >= start && d <= end);
};

/** 本日：与原先一致（今日可行动 ∪ 今日完成） */
const matchesDayLogic = (t) => {
  if (t.completed) return getDoneDate(t) === todayStr;
  return isActionable(t);
};

/**
 * 按日历带匹配：未完成看 due/scheduled/start 是否落在 [start,end]；已完成看完成日是否落在带内。
 * 用于在「本日」之外扩展周/月/年。
 */
const matchesCalendarBand = (t, start, end) => {
  if (t.completed) {
    const dd = getDoneDate(t);
    return !!(dd && dd >= start && dd <= end);
  }
  return anchorInRange(t, start, end);
};

/**
 * 嵌套包含：本周 ⊇ 本日，本月 ⊇ 本周，本年 ⊇ 本月。
 * 即长周期在短周期基础上并上「落在该周期日历内」的任务（含未来排期、周期内完成等）。
 */
const matchesPeriod = (t, periodKey) => {
  if (!isRelevantTask(t)) return false;
  if (periodKey === "day") return matchesDayLogic(t) || isUndatedOpenTask(t);
  if (periodKey === "week") {
    return matchesDayLogic(t) || matchesCalendarBand(t, weekStartStr, weekEndStr) || isUndatedOpenTask(t);
  }
  if (periodKey === "month") {
    return matchesPeriod(t, "week") || matchesCalendarBand(t, monthStartStr, monthEndStr);
  }
  if (periodKey === "year") {
    return matchesPeriod(t, "month") || matchesCalendarBand(t, yearStartStr, yearEndStr);
  }
  return false;
};

const allTasksRawFromData = (await noriaTasksForScope()).map((t) => ({
  ...t,
  _page: t?._page || { file: { path: String(t?.path || "") } }
}));
const allTasksRaw = allTasksRawFromData;
const uniq = new Set();
const allTasks = allTasksRaw.filter((t) => {
  const k = `${String(t.path || t?._page?.file?.path || "")}::${String(t.line ?? "")}::${String(t.text || "")}`;
  if (uniq.has(k)) return false;
  uniq.add(k);
  return true;
});

const PERIODS = [
  { key: "day", label: periodicTasksT("runtime.tasksCalendar.view.shortDay"), empty: periodicTasksT("runtime.periodic.todayTasks.emptyDay") },
  { key: "week", label: periodicTasksT("runtime.tasksCalendar.view.shortWeek"), empty: periodicTasksT("runtime.periodic.todayTasks.emptyWeek") },
  { key: "month", label: periodicTasksT("runtime.tasksCalendar.view.shortMonth"), empty: periodicTasksT("runtime.periodic.todayTasks.emptyMonth") },
  { key: "year", label: periodicTasksT("runtime.tasksCalendar.view.shortYear"), empty: periodicTasksT("runtime.periodic.todayTasks.emptyYear") }
];

const setTabStyle = (btn, active) => {
  if (active) btn.addClass("is-active");
  else btn.removeClass("is-active");
  try { btn.setAttribute("aria-pressed", active ? "true" : "false"); } catch (_) {}
};

const shell = host.createDiv();
shell.addClass("dashboard-period-task-shell");
shell.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;width:100%;";
const actionsHost = input?.actionsHost && typeof input.actionsHost.createEl === "function" ? input.actionsHost : null;
const periodHost = input?.periodHost && typeof input.periodHost.createDiv === "function" ? input.periodHost : null;
const tabLeft = (periodHost || shell).createDiv();
tabLeft.addClass("dashboard-segment-tabs");
if (periodHost) tabLeft.style.padding = "0";
let currentPeriod = "day";
const addBtn = (actionsHost || shell).createEl("button", { text: "+" });
addBtn.type = "button";
addBtn.addClass("dashboard-guide-icon-btn");
addBtn.addClass("dashboard-guide-toolbar-plus");
addBtn.setAttr("title", periodicTasksT("runtime.periodic.todayTasks.add"));
if (!actionsHost) {
  addBtn.style.width = "24px";
  addBtn.style.height = "24px";
  addBtn.style.alignSelf = "flex-end";
}
const openAddPanel = () => {
  const _dates = buildDiaryTaskLine("·", currentPeriod).match(/\[start:: ([^\]]+)\] \[due:: ([^\]]+)\]/);
  const _dh =
    _dates && _dates[1] === _dates[2]
      ? `[start]/[due] 均为 ${_dates[1]}`
      : _dates
        ? `[start] ${_dates[1]} · [due] ${_dates[2]}`
        : "";
  const ui = globalThis.dashboardCore?.components?.ui?.managerPanel || globalThis.__noriaManagerUiKit;
  if (ui?.openPanel) {
    let inputEl = null;
    const api = ui.openPanel({
      title: periodicTasksT("runtime.periodic.todayTasks.addTitle", {
        period: PERIODS.find((p) => p.key === currentPeriod)?.label || periodicTasksT("runtime.tasksCalendar.view.shortDay")
      }),
      subtitle: `${getDiaryPathByPeriod(currentPeriod)} · ${PERIOD_TASK_HEADINGS[currentPeriod]} · ${_dh}`,
      size: "sm",
      hideFooter: true,
      render: ({ body, close }) => {
        inputEl = ui.input({ placeholder: periodicTasksT("runtime.periodic.todayTasks.inputPlaceholder") });
        inputEl.style.width = "100%";
        inputEl.style.height = "34px";
        const meta = body.appendChild(document.createElement("div"));
        meta.className = "noria-manager-muted";
        meta.textContent = periodicTasksT("runtime.periodic.todayTasks.metadata");
        meta.style.marginTop = "7px";
        body.insertBefore(inputEl, meta);
        inputEl.onkeydown = async (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            const v = String(inputEl.value || "").trim();
            if (!v) return;
            const ok = await addTaskToPeriodDiary(currentPeriod, v);
            if (ok) close();
          }
        };
      }
    });
    setTimeout(() => inputEl?.focus(), 0);
    return api;
  }
  const v = window.prompt(periodicTasksT("runtime.periodic.todayTasks.addTitle", {
    period: PERIODS.find((p) => p.key === currentPeriod)?.label || periodicTasksT("runtime.tasksCalendar.view.shortDay")
  }));
  if (String(v || "").trim()) {
    addTaskToPeriodDiary(currentPeriod, String(v || "").trim());
  }
};
addBtn.onclick = () => openAddPanel();

const scroll = shell.createDiv();
scroll.addClass("dashboard-period-task-scroll");
scroll.style.cssText = "flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding-right:2px;";

const countPeriod = (periodKey) => {
  const tasks = allTasks.filter((t) => matchesPeriod(t, periodKey));
  const done = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  return { done, total };
};

const renderForPeriod = (periodKey) => {
  scroll.empty();
  const tasks = allTasks.filter((t) => matchesPeriod(t, periodKey));
  const meta = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];
  const cc = countPeriod(periodKey);

  if (tasks.length === 0) {
    const empty = scroll.createDiv({ text: meta.empty });
    empty.addClass("dashboard-period-task-empty");
    return;
  }

  const sorted = [...tasks].sort((a, b) => {
    const doneDiff = Number(a.completed) - Number(b.completed);
    if (doneDiff !== 0) return doneDiff;
    const p = priorityScore(b) - priorityScore(a);
    if (p !== 0) return p;
    return dateStamp(a).localeCompare(dateStamp(b));
  });

  const openTasks = sorted.filter((t) => !t.completed);
  const doneTasks = sorted.filter((t) => t.completed);
  const wrap = scroll.createDiv();
  wrap.addClass("dashboard-period-task-list");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";

  const renderTask = (task, container = wrap) => {
    const row = container.createDiv();
    row.addClass("dashboard-task-row");
    const fullLabel = cleanTaskText(task.text);
    row.style.cssText = "display:flex;align-items:center;gap:7px;padding:3px 3px 3px 0;min-width:0;";
    const d = getTaskDates(task);
    let done = !!task.completed;
    const btn = row.createEl("input");
    btn.type = "checkbox";
    btn.addClass("task-list-item-checkbox");
    btn.addClass("noria-themed-checkbox");
    btn.addClass("noria-themed-checkbox--home");
    btn.setAttr("aria-label", done ? periodicTasksT("runtime.periodic.todayTasks.toggleOpen") : periodicTasksT("runtime.periodic.todayTasks.toggleDone"));
    const getCheckboxState = () => {
      if (done) return "done";
      if (isOverdueOpenTask(task, d, done)) return "due";
      if (d.due === todayStr || d.scheduled === todayStr || d.start === todayStr) return "due";
      return "default";
    };
    const syncCheckVisual = () => {
      btn.checked = done;
      btn.setAttr("data-state", getCheckboxState());
    };
    syncCheckVisual();

    const overdue = isOverdueOpenTask(task, d, done);
    const path = String(task.path || task._page?.file?.path || "");
    const dateHint = taskDateHint(d);
    row.setAttr("data-noria-task-rhythm", taskRhythmKind({ ...task, completed: done }));
    row.setAttr("data-noria-task-overdue", overdue ? "true" : "false");
    row.setAttr("data-noria-task-date", dateHint);
    row.setAttr("data-noria-task-priority", String(priorityScore(task)));
    row.setAttr("data-noria-task-source-path", path);
    row.title = taskHoverTitle(task, fullLabel, d, done);
    const textRow = row.createDiv();
    textRow.addClass("dashboard-task-row__content");
    textRow.style.cssText =
      "flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-start;gap:6px;overflow:hidden;min-height:0;";
    const textMain = document.createElement("a");
    textMain.className = "internal-link dashboard-task-title dashboard-task-title--one-line dashboard-task-title--link";
    textMain.textContent = fullLabel;
    textMain.setAttr("href", path || "#");
    textMain.setAttr("data-href", path);
    textMain.setAttr("aria-label", row.title);
    textMain.style.cssText =
      "font-size:var(--dash-text-row-size,.86em);line-height:var(--dash-text-row-line,1.25);font-weight:var(--dash-text-row-weight,500);";
    textMain.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void openTaskAtLine(task);
    });
    textRow.appendChild(textMain);
    row.appendChild(textRow);

    if (done) {
      textMain.style.textDecoration = "line-through";
      textMain.style.opacity = ".65";
    }

    btn.onchange = async (ev) => {
      ev.stopPropagation();
      const nextDone = !!btn.checked;
      btn.disabled = true;
      const ok = await markTaskStatus(task, nextDone);
      if (ok) {
        done = nextDone;
        syncCheckVisual();
        textMain.style.textDecoration = done ? "line-through" : "none";
        textMain.style.opacity = done ? ".65" : "1";
        const nextOverdue = isOverdueOpenTask(task, d, done);
        row.setAttr("data-noria-task-rhythm", taskRhythmKind({ ...task, completed: done }));
        row.setAttr("data-noria-task-overdue", nextOverdue ? "true" : "false");
        row.title = taskHoverTitle(task, fullLabel, d, done);
        textMain.setAttr("aria-label", row.title);
      } else {
        btn.checked = done;
        syncCheckVisual();
      }
      btn.disabled = false;
    };
  };

  const summaryRow = wrap.createDiv();
  summaryRow.addClass("dashboard-period-task-summary");
  const summaryMain = summaryRow.createDiv();
  summaryMain.addClass("dashboard-period-task-summary-main");
  const summaryLabel = summaryMain.createDiv({ text: periodicTasksT("runtime.periodic.todayTasks.groupOpen") });
  summaryLabel.addClass("dashboard-period-task-summary-label");
  const summaryMeta = summaryMain.createDiv({
    text: periodicTasksT("runtime.periodic.todayTasks.openSummary", {
      open: openTasks.length,
      done: cc.done,
      total: cc.total
    })
  });
  summaryMeta.addClass("dashboard-period-task-summary-meta");
  const summaryCount = summaryRow.createDiv({ text: String(openTasks.length) });
  summaryCount.addClass("dashboard-inline-count");
  summaryCount.addClass("dashboard-period-task-count");
  summaryCount.addClass("dashboard-period-task-summary-count");
  summaryCount.setAttr("title", periodicTasksT("runtime.periodic.todayTasks.countTitle"));

  const groupedOpenTasks = openTasks.reduce((acc, task) => {
    const kind = taskRhythmKind(task);
    if (!acc[kind]) acc[kind] = [];
    acc[kind].push(task);
    return acc;
  }, {});
  const renderTaskGroup = (group) => {
    const items = groupedOpenTasks[group.kind] || [];
    if (!items.length) return;
    const groupEl = wrap.createDiv();
    groupEl.addClass("dashboard-period-task-group");
    groupEl.addClass(`dashboard-period-task-group--${group.kind}`);
    const head = groupEl.createDiv();
    head.addClass("dashboard-period-task-group-head");
    const labelWrap = head.createDiv();
    labelWrap.addClass("dashboard-period-task-group-label");
    const label = labelWrap.createDiv({ text: periodicTasksT(group.labelKey) });
    label.addClass("dashboard-period-task-section-label");
    const count = labelWrap.createDiv({ text: String(items.length) });
    count.addClass("dashboard-inline-count");
    count.addClass("dashboard-period-task-count");
    count.addClass("dashboard-period-task-group-count");
    const body = groupEl.createDiv();
    body.addClass("dashboard-period-task-group-body");
    items.forEach((t) => renderTask(t, body));
  };
  TASK_GROUPS.forEach(renderTaskGroup);

  if (doneTasks.length > 0) {
    const doneWrap = wrap.createDiv();
    doneWrap.addClass("dashboard-period-task-completed");
    doneWrap.style.cssText = "display:flex;flex-direction:column;gap:3px;";
    const head = doneWrap.createEl("button", { text: `${periodicTasksT("runtime.periodic.todayTasks.completed", { count: doneTasks.length })} ▸` });
    head.addClass("dashboard-period-task-completed-toggle");
    const body = doneWrap.createDiv();
    body.addClass("dashboard-period-task-completed-list");
    body.style.cssText = "display:none;flex-direction:column;gap:3px;";
    doneTasks.forEach((t) => renderTask(t, body));
    let expanded = false;
    head.onclick = () => {
      expanded = !expanded;
      head.textContent = `${periodicTasksT("runtime.periodic.todayTasks.completed", { count: doneTasks.length })} ${expanded ? "▾" : "▸"}`;
      body.style.display = expanded ? "flex" : "none";
    };
  }
};

const tabButtons = [];
PERIODS.forEach((p) => {
  const btn = tabLeft.createEl("button", { text: p.label });
  btn.type = "button";
  btn.addClass("dashboard-segment-tab");
  btn.addClass("dashboard-heatmap-mode-button");
  tabButtons.push({ key: p.key, btn });
  btn.onclick = () => {
    tabButtons.forEach((x) => setTabStyle(x.btn, x.key === p.key));
    currentPeriod = p.key;
    renderForPeriod(p.key);
  };
});

/** 工具栏顺序：日/周/月/年 → 打开任务看板 → +（父视图先看板后本视图追加分段与添加） */
if (periodHost === actionsHost && periodHost && tabLeft.parentNode === periodHost) {
  periodHost.insertBefore(tabLeft, periodHost.firstChild);
}

let initial = String(input?.todoPeriod || "day");
if (!PERIOD_RANGES[initial]) initial = "day";
tabButtons.forEach((x) => setTabStyle(x.btn, x.key === initial));
currentPeriod = initial;
renderForPeriod(initial);
