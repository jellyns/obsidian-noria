(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});

  function enumerateDates(start, end, momentApi) {
    const out = [];
    const d = start.clone();
    while (!d.isAfter(end, "day")) {
      out.push(d.format("YYYY-MM-DD"));
      d.add(1, "day");
    }
    return out;
  }

  function normalizeDiaryName(raw) {
    if (/^\d{8}$/.test(String(raw || ""))) {
      return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
    return String(raw || "");
  }

  function inferScopeFromFile(fileName) {
    const name = String(fileName || "").replace(".md", "");
    if (/^\d{4}-W\d{1,2}$/i.test(name)) return "weekly";
    if (/^\d{4}-\d{2}$/.test(name)) return "monthly";
    if (/^\d{4}$/.test(name)) return "yearly";
    return "monthly";
  }

  function getDateRange({ scope, fileName, filePath, momentApi }) {
    const name = String(fileName || "").replace(".md", "");
    const path = String(filePath || "");
    const yearMatch = path.match(/(?:^|\/|\\)(\d{4})(?:\/|\\)[^/\\]+\.md$/);
    const yearFromPath = yearMatch ? yearMatch[1] : "";
    const today = momentApi().startOf("day");

    if (scope === "weekly") {
      const wk = name.match(/^(\d{4})-W(\d{1,2})$/i);
      if (!wk) return null;
      const weekYear = Number(wk[1]);
      const weekNum = Number(wk[2]);
      const start = momentApi().isoWeekYear(weekYear).isoWeek(weekNum).startOf("isoWeek");
      return { scope: "weekly", year: weekYear, start, end: start.clone().add(6, "days") };
    }

    if (scope === "monthly") {
      const m = name.match(/^(\d{4})-(\d{2})$/);
      if (!m) return null;
      const start = momentApi(`${m[1]}-${m[2]}-01`, "YYYY-MM-DD").startOf("day");
      return { scope: "monthly", year: Number(m[1]), start, end: start.clone().endOf("month").startOf("day") };
    }

    const yearName = /^\d{4}$/.test(name) ? name : yearFromPath;
    if (!yearName) return null;
    const start = momentApi(`${yearName}-01-01`, "YYYY-MM-DD");
    return { scope: "yearly", year: Number(yearName), start, end: start.clone().endOf("year").startOf("day") };
  }

  function buildWeeklyBuckets(dates, metrics, fields, momentApi) {
    const map = new Map();
    dates.forEach((ds) => {
      const m = momentApi(ds, "YYYY-MM-DD", true);
      if (!m.isValid()) return;
      const weekStart = m.clone().startOf("isoWeek");
      const key = `${weekStart.format("YYYY")}-W${weekStart.format("WW")}`;
      if (!map.has(key)) {
        const base = { key, label: `W${weekStart.format("WW")}`, start: weekStart.clone(), count: 0 };
        fields.forEach((f) => { base[f] = 0; });
        map.set(key, base);
      }
      const row = map.get(key);
      row.count += 1;
      fields.forEach((f) => { row[f] += Number(metrics[ds]?.[f] || 0); });
    });
    return Array.from(map.values()).sort((a, b) => a.start.valueOf() - b.start.valueOf());
  }

  root.dateRange = {
    enumerateDates,
    normalizeDiaryName,
    inferScopeFromFile,
    getDateRange,
    buildWeeklyBuckets
  };
})();
