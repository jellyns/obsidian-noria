(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});

  function scopeLabel(scopeName) {
    if (scopeName === "weekly") return "本周";
    if (scopeName === "monthly") return "本月";
    return "全年";
  }

  function seriesStats(arr) {
    const nums = (arr || []).map((x) => Number(x || 0));
    const total = nums.reduce((a, b) => a + b, 0);
    const peak = Math.max(0, ...nums);
    const avg = nums.length ? (total / nums.length) : 0;
    return { total, peak, avg };
  }

  function avgNonZero(arr) {
    const vals = (arr || []).filter((x) => Number(x) > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
  }

  function toPercent(numerator, denominator, digits = 0) {
    const d = Math.max(1, Number(denominator || 0));
    const v = (Number(numerator || 0) / d) * 100;
    return Number(v.toFixed(digits));
  }

  function monthKey(dateStr) {
    return String(dateStr || "").slice(0, 7);
  }

  root.formatters = {
    scopeLabel,
    seriesStats,
    avgNonZero,
    toPercent,
    monthKey
  };
})();
