(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.utils = root.utils || {};

  function asDateText(value) {
    if (!value) return "";
    try {
      if (typeof value.toISODate === "function") return String(value.toISODate() || "");
      if (typeof value.toISO === "function") return String(value.toISO() || "").slice(0, 10);
    } catch (_) {}
    const s = String(value || "").trim();
    const m = s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }

  function pickInlineDate(text, key) {
    const m = String(text || "").match(new RegExp(`\\[${key}::\\s*(\\d{4}-\\d{2}-\\d{2})`, "i"));
    return m ? m[1] : "";
  }

  function getTaskDate(task, key) {
    const text = String(task?.text || "");
    if (key === "due") return asDateText(task?.due) || pickInlineDate(text, "due") || pickInlineDate(text, "date");
    if (key === "scheduled") return asDateText(task?.scheduled) || pickInlineDate(text, "scheduled");
    if (key === "start") return asDateText(task?.start) || pickInlineDate(text, "start");
    if (key === "done") return asDateText(task?.completion) || pickInlineDate(text, "completion") || pickInlineDate(text, "done");
    return "";
  }

  function cleanTaskTitle(text, options = {}) {
    let out = String(text || "");
    out = out.replace(/^\s*[-*]\s*\[[ xX]\]\s*/g, "");
    out = out.replace(/^[\s\uFEFF]*(?:⚠️|⚠|❗|!)+\s*/u, "");
    out = out.replace(/\s*(?:⚠️|⚠|❗|!)+[\s\uFEFF]*$/u, "");
    out = out.replace(/(?:📅|📆|🗓|⏳|⌛|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/gu, " ");
    out = out.replace(/(?:⏫|🔼|🔽|⏬)/gu, " ");
    out = out.replace(/(?:🆔|⛔)\s*[^\s]+/gu, " ");
    out = out.replace(/🔁\s*[^#\[\]\n]+/gu, " ");
    out = out.replace(/\[[a-zA-Z_][a-zA-Z0-9_-]*::\s*[^\]]*\]/g, " ");
    out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
    out = out.replace(/\[\[([^\]]+)\]\]/g, (_, p1) => String(p1 || "").split("/").pop());
    out = out.replace(/\s\^[A-Za-z0-9_-]+\s*$/g, " ");
    if (options.keepTags !== true) out = out.replace(/(?:^|\s)[#＃][^\s#＃]+/g, " ");
    out = out.replace(/\s{2,}/g, " ").trim();
    out = out.replace(/^[\s\uFEFF]*(?:⚠️|⚠|❗|!)+\s*/u, "").replace(/\s*(?:⚠️|⚠|❗|!)+[\s\uFEFF]*$/u, "").trim();
    return out;
  }

  function getTaskVisualState(task, anchorDate) {
    if (task?.completed) return "done";
    const anchor = asDateText(anchorDate) || asDateText(new Date());
    const due = getTaskDate(task, "due");
    if (due && anchor && due < anchor) return "overdue";
    return "open";
  }

  function renderTaskRow(parent, task, options = {}) {
    if (!parent || typeof parent.createEl !== "function") return null;
    const state = options.state || getTaskVisualState(task, options.anchorDate);
    const row = parent.createEl("div", {
      cls: `noria-periodic-task-row noria-periodic-task-row--${state}`
    });
    const checkSlot = row.createEl("span", {
      cls: "noria-periodic-task-check-slot"
    });
    const button = checkSlot.createEl("input", {
      cls: "task-list-item-checkbox noria-periodic-task-check"
    });
    button.type = "checkbox";
    button.checked = !!task?.completed;
    button.disabled = !!task?.completed || options.readonly === true;

    const body = row.createEl("div", { cls: "noria-periodic-task-body" });
    const title = body.createEl("span", {
      cls: "noria-periodic-task-title",
      text: cleanTaskTitle(options.title ?? task?.text ?? "")
    });
    if (options.showStateBadge === true) {
      body.createEl("span", { cls: "noria-periodic-task-badge", text: String(options.stateLabel || state) });
    }
    if (task?.completed) {
      title.style.textDecoration = "line-through";
      title.style.opacity = "0.68";
    }

    if (!button.disabled && typeof options.onToggle === "function") {
      button.onchange = async () => {
        const requested = !!button.checked;
        button.disabled = true;
        try {
          const ok = await options.onToggle(task, requested);
          if (ok) {
            task.completed = requested;
            row.classList.remove("noria-periodic-task-row--open", "noria-periodic-task-row--overdue");
            row.classList.add("noria-periodic-task-row--done");
            button.checked = requested;
            button.disabled = requested;
            title.style.textDecoration = "line-through";
            title.style.opacity = "0.68";
            const badge = row.querySelector?.(".noria-periodic-task-badge");
            if (badge) badge.remove();
          } else {
            button.disabled = false;
            button.checked = !requested;
          }
        } catch (_) {
          button.disabled = false;
          button.checked = !requested;
        }
      };
    }
    return row;
  }

  root.utils.taskDisplay = {
    asDateText,
    cleanTaskTitle,
    getTaskDate,
    getTaskVisualState,
    renderTaskRow
  };
})();
