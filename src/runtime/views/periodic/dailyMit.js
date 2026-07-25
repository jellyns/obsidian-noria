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
const allTasks = (await noriaTasksForScope())
  .filter((t) => !t.completed)
  .filter((t) => !/(^|\s)#habit\b/i.test(String(t.text || "")));

const todays = allTasks
  .filter((t) => {
    if (!noteDate) return false;
    const due = taskDate(t, "due");
    const sch = taskDate(t, "scheduled");
    const sta = taskDate(t, "start");
    const dated = [due, sch, sta].filter(Boolean);
    // MIT 同时覆盖“今日任务 + 拉取任务（含逾期）”
    const inTodayOrOverdue = dated.some((d) => d <= noteDate);
    const fromCurrent = String(t.path || "") === notePath;
    return inTodayOrOverdue || fromCurrent;
  })
  .map((t) => ({ t, score: priorityScore(t), text: clean(t.text), key: `${t.path || ""}:${t.line || ""}` }))
  .filter((x) => !!x.text)
  .filter((x, i, arr) => arr.findIndex((y) => y.key === x.key) === i)
  .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "zh-CN"))
  .slice(0, 3);

if (todays.length === 0) {
  ctx.paragraph(`- ${noriaT("runtime.home.trends.none")}`);
} else {
  ctx.paragraph(todays.map((x) => `- [ ] ${x.text}`).join("\n"));
}
