(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.components = root.components || {};
  root.components.cards = root.components.cards || {};

  function tonePalette(tone) {
    if (tone === "blue") return { fg: "#1e3a8a", bg: "rgba(99,102,241,.12)", bd: "rgba(99,102,241,.28)" };
    if (tone === "purple") return { fg: "#4338ca", bg: "rgba(99,102,241,.12)", bd: "rgba(99,102,241,.28)" };
    if (tone === "cyan") return { fg: "#0c4a6e", bg: "rgba(56,189,248,.12)", bd: "rgba(56,189,248,.28)" };
    if (tone === "green") return { fg: "#065f46", bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.28)" };
    return { fg: "#334155", bg: "rgba(59,130,246,.1)", bd: "rgba(59,130,246,.22)" };
  }

  function renderMetricChips(parent, chips = []) {
    const wrap = parent.createDiv();
    wrap.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    chips.forEach((item) => {
      const txt = typeof item === "string" ? item : String(item?.text || "");
      const tone = typeof item === "string" ? "neutral" : (item?.tone || "neutral");
      const p = tonePalette(tone);
      const chip = wrap.createEl("span", { text: txt });
      chip.style.cssText = `padding:2px 8px;border-radius:999px;font-size:.82em;color:${p.fg};background:${p.bg};border:1px solid ${p.bd};`;
    });
    return wrap;
  }

  root.components.cards.metricChips = {
    renderMetricChips
  };
})();
