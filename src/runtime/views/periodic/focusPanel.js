let { sourcePath } = input ?? {};
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
if (!sourcePath) sourcePath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");
const focusT = (key, params = {}) => {
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

const cur = ctx.current()?.file;
const notePath = String(cur?.path || "");
const noteName = String(cur?.name || "").replace(/\.md$/i, "");
const noteDate = input?.date || (
  /^\d{8}$/.test(noteName)
    ? `${noteName.slice(0, 4)}-${noteName.slice(4, 6)}-${noteName.slice(6, 8)}`
    : (/^\d{4}-\d{2}-\d{2}$/.test(noteName) ? noteName : ""));

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
const priorityScore = (t) => {
  const p = String(t?.priority || "").toLowerCase();
  const map = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 };
  if (map[p]) return map[p];
  const m = String(t?.text || "").match(/\[priority::\s*(highest|high|medium|low|lowest)\]/i);
  return m ? map[String(m[1]).toLowerCase()] || 0 : 0;
};
const markTaskDone = async (task) => {
  try {
    const path = String(task?.path || sourcePath || "");
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
      bridge.refresh?.requestRefresh?.("home", "focus-panel-task-done");
    } catch (_) {}
    return true;
  } catch (e) {
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
const allTasks = await noriaTasksForScope();
const mitTasks = allTasks
  .filter((t) => !t.completed && !/(^|\s)#habit\b/i.test(String(t.text || "")))
  .filter((t) => {
    if (!noteDate) return false;
    const due = taskDate(t, "due");
    const sch = taskDate(t, "scheduled");
    const sta = taskDate(t, "start");
    const inTodayOrOverdue = [due, sch, sta].filter(Boolean).some((d) => d <= noteDate);
    const inCurrent = String(t.path || "") === notePath;
    return inTodayOrOverdue || inCurrent;
  })
  .map((t) => ({ ...t, _clean: clean(t.text), _score: priorityScore(t), _key: `${String(t.path || "")}:${String(t.line || "")}` }))
  .filter((t) => !!t._clean)
  .filter((t, i, arr) => arr.findIndex((x) => x._key === t._key) === i)
  .sort((a, b) => b._score - a._score || a._clean.localeCompare(b._clean, "zh-CN"))
  .slice(0, 3);

const styleId = "daily-focus-panel-style";
let style = document.getElementById(styleId);
if (!style) {
  style = document.createElement("style");
  style.id = styleId;
  document.head.appendChild(style);
}
style.textContent = `
.daily-focus-panel{display:flex;gap:12px;align-items:stretch;direction:ltr;width:100%}
.daily-focus-card{flex:1 1 0;min-width:0;box-sizing:border-box;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.18);border-radius:10px;padding:10px;min-height:120px}
.daily-focus-card.mit{order:1}
.daily-focus-card.habit{order:2}
.daily-focus-title{font-size:.92em;font-weight:600;margin-bottom:6px;color:var(--text-muted)}
.daily-focus-list{display:flex;flex-direction:column;gap:6px}
.daily-focus-item{display:flex;gap:8px;align-items:center;min-height:24px}
.daily-focus-check{align-self:center}
.daily-focus-text{line-height:1.35}
@media (max-width:960px){.daily-focus-panel{flex-direction:column}}
`;

const root = ctx.el("div", "", { cls: "daily-focus-panel" });
root.style.cssText = "display:flex;flex-direction:row;gap:12px;align-items:stretch;width:100%;";
const mitCard = root.createEl("div", { cls: "daily-focus-card mit" });
mitCard.style.cssText = "order:1;flex:1 1 0;min-width:0;align-self:stretch;";
mitCard.createEl("div", { cls: "daily-focus-title", text: "MIT" });
const mitList = mitCard.createEl("div", { cls: "daily-focus-list" });
if (mitTasks.length === 0) {
  mitList.createEl("div", { cls: "daily-focus-text", text: focusT("runtime.periodic.focus.none") });
} else {
  mitTasks.forEach((t) => {
    const row = mitList.createEl("div", { cls: "daily-focus-item" });
    const btn = row.createEl("input", { cls: "task-list-item-checkbox daily-focus-check noria-themed-checkbox noria-themed-checkbox--home" });
    btn.type = "checkbox";
    btn.setAttr("data-state", t.completed ? "done" : "default");
    const text = row.createEl("span", { cls: "daily-focus-text", text: t._clean });
    btn.onchange = async () => {
      btn.disabled = true;
      const ok = await markTaskDone(t);
      if (ok) {
        btn.checked = true;
        btn.classList.add("done");
        text.style.textDecoration = "line-through";
        text.style.opacity = ".68";
      } else {
        btn.disabled = false;
        btn.checked = false;
      }
    };
  });
}

const habitCard = root.createEl("div", { cls: "daily-focus-card habit" });
habitCard.style.cssText = "order:2;flex:1 1 0;min-width:0;align-self:stretch;";
habitCard.createEl("div", { cls: "daily-focus-title", text: focusT("runtime.periodic.focus.habitCheckin") });
const habitList = habitCard.createEl("div", { cls: "daily-focus-list" });
await bridge.diaryHabits.render({container:habitList,date:noteDate,registryPath:sourcePath});
