(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.boards = root.components.boards || {};

  function boardT(key, params = {}, fallback = key) {
    try {
      const bridge = globalThis.__noriaRuntimeBridge || {};
      if (typeof bridge.t === "function") return bridge.t(key, params);
    } catch (_) {}
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
  }

  function displayLabel(domain, value, fallback = value) {
    try {
      const fn = globalThis.__noriaRuntimeBridge?.runtime?.displayLabel;
      if (typeof fn === "function") return fn(domain, value, fallback);
    } catch (_) {}
    return fallback == null ? "" : String(fallback);
  }

  function makeCard(parent, title) {
    const card = parent.createDiv();
    card.style.cssText = "padding:12px;border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.05)),color-mix(in srgb,var(--background-secondary) 88%,rgba(59,130,246,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 74%,rgba(59,130,246,.2));box-shadow:0 2px 10px rgba(15,23,42,.05),inset 0 1px 0 color-mix(in srgb,var(--background-primary) 70%,transparent);";
    card.createDiv({ text: title }).style.cssText = "font-weight:760;margin-bottom:8px;letter-spacing:.2px;color:var(--text-normal);";
    return card;
  }

  function renderHabitWeekMatrix(parent, config) {
    const {
      title: rawTitle = "",
      dates = [],
      habits = [],
      doneMap = new Map(),
      activeNow = new Set()
    } = config || {};

    const title = rawTitle || boardT("runtime.board.habitWeekTitle", {}, "Habit check-ins");
    const card = makeCard(parent, title);
    if (!habits.length) {
      card.createDiv({ text: boardT("runtime.board.habitWeekEmpty", {}, "No habit records yet.") }).style.cssText = "color:var(--text-muted);font-size:.9em;";
      return card;
    }

    const wrap = card.createDiv();
    wrap.style.cssText = "overflow-x:auto;padding:8px;border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 90%,rgba(16,185,129,.08)),color-mix(in srgb,var(--background-secondary) 92%,rgba(6,182,212,.05)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 72%,rgba(16,185,129,.20));box-shadow:inset 0 1px 0 color-mix(in srgb,var(--background-primary) 65%,transparent);";
    const table = wrap.createEl("table");
    table.style.cssText = "width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 3px;font-size:.92em;";

    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    [
      boardT("runtime.habits.name", {}, "Habit"),
      displayLabel("weekday", "一", "Mon"),
      displayLabel("weekday", "二", "Tue"),
      displayLabel("weekday", "三", "Wed"),
      displayLabel("weekday", "四", "Thu"),
      displayLabel("weekday", "五", "Fri"),
      displayLabel("weekday", "六", "Sat"),
      displayLabel("weekday", "日", "Sun")
    ].forEach((h, idx) => {
      const th = hr.createEl("th", { text: h });
      th.style.cssText = idx === 0
        ? "text-align:left;padding:2px 6px 4px 6px;width:40%;border-bottom:1px solid rgba(16,185,129,.28);color:var(--text-normal);"
        : "text-align:center;padding:2px 1px 4px 1px;width:8.57%;border-bottom:1px solid rgba(16,185,129,.28);color:var(--text-muted);";
    });

    const tbody = table.createEl("tbody");
    habits.forEach((habit) => {
          const tr = tbody.createEl("tr");
          const isActiveNow = activeNow.has(habit);
          tr.createEl("td", { text: habit }).style.cssText = `padding:5px 6px;vertical-align:top;word-break:break-word;line-height:1.25;background:${isActiveNow ? "color-mix(in srgb,var(--background-primary) 84%,rgba(16,185,129,.08))" : "color-mix(in srgb,var(--background-secondary) 90%,transparent)"};border-top-left-radius:8px;border-bottom-left-radius:8px;color:${isActiveNow ? "var(--text-normal)" : "var(--text-muted)"};`;
      dates.forEach((ds, idx) => {
        const done = !!doneMap.get(habit)?.[ds];
        const td = tr.createEl("td");
        td.style.cssText = `text-align:center;padding:3px 1px;vertical-align:middle;background:color-mix(in srgb,var(--background-primary) 82%,transparent);${idx === 6 ? "border-top-right-radius:8px;border-bottom-right-radius:8px;" : ""}`;
        const dot = td.createEl("span");
        dot.style.cssText = done
          ? "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(160deg, rgba(16,185,129,.96), rgba(6,182,212,.9));color:white;font-size:.78em;font-weight:700;box-shadow:0 1px 6px rgba(16,185,129,.35);"
          : "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(148,163,184,.16);border:1px solid rgba(100,116,139,.35);";
        if (done) dot.textContent = "✓";
      });
    });

    return card;
  }

  root.components.boards.habitWeekMatrix = {
    renderHabitWeekMatrix
  };
})();
