let { sourcePath } = input ?? {};
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
if (!sourcePath) sourcePath = String(bridge.paths?.habitRegistryPath || "Noria/Habits.md");
const habitCheckinT = (key, params = {}) => {
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

const source = ctx.page(sourcePath);
const curName = ctx.current()?.file?.name || "";
const dateMatch = curName.match(/^(\d{8}|\d{4}-\d{2}-\d{2})$/);
const noteDate = dateMatch
  ? (dateMatch[1].includes("-")
      ? dateMatch[1]
      : `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`)
  : null;

const getInlineDate = (text, key) => {
  const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})\\]`, "i"));
  return m ? m[1] : null;
};
const getEmojiDate = (text, emojiRegex) => {
  const m = String(text || "").match(emojiRegex);
  return m ? m[1] : null;
};
const cleanHabitText = (text) =>
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
const parseInlineFields = (text) => {
  const fields = {};
  String(text || "").replace(/\[([a-zA-Z_][a-zA-Z0-9_-]*)::\s*([^\]]*)\]/g, (_, key, value) => {
    fields[String(key || "").trim()] = String(value || "").trim();
    return "";
  });
  return fields;
};
const buildHabitConfigMap = (page) => {
  const map = new Map();
  const lists = Array.from(page?.file?.lists || []);
  for (const item of lists) {
    if (item?.task) continue;
    const raw = String(item?.text || item || "").trim();
    if (!raw) continue;
    const fields = parseInlineFields(raw);
    const name = cleanHabitText(raw);
    if (!name || !(fields.type || fields.target || fields.unit)) continue;
    const prev = map.get(name) || {};
    map.set(name, {
      type: String(fields.type || prev.type || "").trim(),
      target: String(fields.target || prev.target || "").trim(),
      unit: String(fields.unit || prev.unit || "").trim()
    });
  }
  return map;
};
const formatHabitTaskLabel = (task, configByName) => {
  const text = String(task?.text || "");
  const fields = parseInlineFields(text);
  const name = cleanHabitText(text);
  const cfg = configByName?.get(name) || {};
  const type = String(fields.type || cfg.type || "").trim();
  if (type === "number") {
    const amount = String(fields.value || fields.target || cfg.target || "").trim();
    const unit = String(fields.unit || cfg.unit || "").trim();
    if (amount) return `${name}${amount}${unit}`;
  }
  return name;
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
      bridge.refresh?.requestRefresh?.("home", "habit-checkin-done");
    } catch (_) {}
    return true;
  } catch (e) {
    return false;
  }
};

if (!source) {
  ctx.paragraph(habitCheckinT("runtime.habits.sourceMissing", { path: sourcePath }));
} else {
  const habitConfigByName = buildHabitConfigMap(source);
  const tasks = (source.file.tasks || []).filter((t) => {
    const txt = String(t.text || "");
    const tags = (t.tags || []).map((x) => String(x));
    if (!tags.includes("#active")) return false;
    if (tags.includes("#paused")) return false;

    const startDate =
      getInlineDate(txt, "start")
      || getInlineDate(txt, "scheduled")
      || getInlineDate(txt, "due")
      || getEmojiDate(txt, /🛫\s*(\d{4}-\d{2}-\d{2})/)
      || getEmojiDate(txt, /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/)
      || getEmojiDate(txt, /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/);
    const doneDate =
      getInlineDate(txt, "done")
      || getEmojiDate(txt, /✅\s*(\d{4}-\d{2}-\d{2})/)
      || (t.completion ? String(t.completion).slice(0, 10) : null);

    // 已完成任务：若有完成日期，仅完成当天显示；无完成日期也保留，避免勾选即消失
    if (t.completed) {
      return doneDate
        ? (!!noteDate && doneDate === noteDate)
        : (!noteDate || !startDate || startDate <= noteDate);
    }

    return !noteDate || !startDate || startDate <= noteDate;
  });

  if (tasks.length === 0) {
    ctx.paragraph(habitCheckinT("runtime.periodic.focus.noEnabledHabits"));
  } else {
    const list = ctx.el("div", "", { cls: "habit-checkin-list" });
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    for (const t of tasks) {
      const row = list.createEl("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;min-height:24px;padding:2px 0;";
      const btn = row.createEl("input", { cls: `task-list-item-checkbox noria-themed-checkbox noria-themed-checkbox--home${t.completed ? " done" : ""}` });
      btn.type = "checkbox";
      btn.checked = !!t.completed;
      btn.setAttr("data-state", t.completed ? "done" : "default");
      btn.disabled = !!t.completed;
      const text = row.createEl("span", { text: formatHabitTaskLabel(t, habitConfigByName) || habitCheckinT("runtime.periodic.focus.unnamedHabit") });
      text.style.cssText = "line-height:1.35;";
      if (t.completed) {
        text.style.textDecoration = "line-through";
        text.style.opacity = "0.68";
      }
      if (!t.completed) {
        btn.onchange = async () => {
          btn.disabled = true;
          const ok = await markTaskDone(t);
          if (ok) {
            btn.checked = true;
            btn.classList.add("done");
            text.style.textDecoration = "line-through";
            text.style.opacity = "0.68";
          } else {
            btn.disabled = false;
            btn.checked = false;
          }
        };
      }
    }
  }
}
