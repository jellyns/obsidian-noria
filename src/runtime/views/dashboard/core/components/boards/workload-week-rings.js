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

  function renderWorkloadWeekRings(parent, config) {
    const {
      title: rawTitle = "",
      dates = [],
      metrics = {}
    } = config || {};

    const title = rawTitle || boardT("runtime.board.workloadWeekTitle", {}, "Workload check-ins");
    const card = makeCard(parent, title);
    const frame = card.createDiv();
    frame.style.cssText = "overflow-x:auto;padding:6px 2px 4px;";
    const grid = frame.createDiv();
    grid.style.cssText = "display:grid;grid-template-columns:repeat(7,minmax(86px,1fr));gap:10px;min-width:670px;";

    dates.forEach((d) => {
      const done = Number(metrics[d]?.taskDone || 0);
      const total = Number(metrics[d]?.taskTotal || 0);
      const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
      const day = grid.createDiv();
      const glow = pct > 0 ? Math.min(0.22, 0.08 + (pct / 100) * 0.18) : 0.04;
      day.style.cssText = `padding:10px 6px;border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 92%,rgba(59,130,246,.08)),color-mix(in srgb,var(--background-secondary) 90%,rgba(59,130,246,.08)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 75%,rgba(59,130,246,.18));box-shadow:0 1px 10px rgba(37,99,235,${glow});display:flex;flex-direction:column;align-items:center;gap:8px;`;
      day.createDiv({ text: d.slice(5) }).style.cssText = "font-size:.8em;color:var(--text-muted);";
      const ring = day.createDiv();
      ring.style.cssText = `width:52px;height:103px;border-radius:999px;background:conic-gradient(from -90deg, rgba(6,182,212,.96) 0%, rgba(59,130,246,.95) ${pct}%, rgba(148,163,184,.22) ${pct}%, rgba(148,163,184,.22) 100%);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--background-primary) 68%,transparent);`;
      const inner = ring.createDiv({ text: `${done}/${total}` });
      inner.title = displayLabel("metric", "总量", "Total");
      inner.style.cssText = "width:30px;height:77px;border-radius:999px;background:color-mix(in srgb,var(--background-primary) 94%,rgba(59,130,246,.04));display:flex;align-items:center;justify-content:center;font-size:.72em;color:var(--text-normal);font-weight:700;border:1px solid color-mix(in srgb,var(--background-modifier-border) 70%,rgba(59,130,246,.16));";
    });

    return card;
  }

  root.components.boards.workloadWeekRings = {
    renderWorkloadWeekRings
  };
})();
