(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});

  function toPlainArray(value) {
    try {
      const runtime = globalThis.__noriaRuntimeBridge?.runtime;
      if (typeof runtime?.toArray === "function") return runtime.toArray(value);
    } catch (_) {}
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      if (typeof value.array === "function") return value.array();
    } catch (_) {}
    try {
      return Array.from(value || []);
    } catch (_) {
      return [];
    }
  }

  async function buildDiaryMetrics({
    ctx,
    dates,
      diaryRoot = "",
    habitTags = ["#habit", "#健康", "#运动", "#作息"],
    normalizeDiaryName
  }) {
    const daySet = new Set(dates);
    const metrics = {};
    dates.forEach((d) => {
      metrics[d] = {
        notes: 0,
        words: 0,
        taskDone: 0,
        taskTotal: 0,
        habitDone: 0,
        weather: "",
        mood: "",
        focus: "",
        energy: 0
      };
    });

    const sourcePages = globalThis.__noriaRuntimeBridge?.runtime?.pagesForManagedPath?.("diaryRoot", ctx) || [];
    const diaryPages = toPlainArray(sourcePages).filter((p) => {
      const n = String(p.file.name || "").replace(".md", "");
      const ds = normalizeDiaryName(n);
      return /^\d{4}-\d{2}-\d{2}$/.test(ds) && daySet.has(ds);
    });

    for (const p of diaryPages) {
      const n = String(p.file.name || "").replace(".md", "");
      const ds = normalizeDiaryName(n);
      if (!metrics[ds]) continue;

      metrics[ds].notes += 1;
      const tasks = p.file.tasks || [];
      const work = tasks.filter((t) => t.text && !habitTags.some((tag) => String(t.text).includes(tag)));
      metrics[ds].taskTotal += work.length;
      metrics[ds].taskDone += work.filter((t) => t.completed).length;
      metrics[ds].habitDone += tasks.filter((t) => t.completed && habitTags.some((tag) => String(t.text).includes(tag))).length;
      metrics[ds].weather = String(p.weather || "").trim();
      metrics[ds].mood = String(p.mood || "").trim();
      metrics[ds].focus = String(p.focus || "").trim();
      metrics[ds].energy = Math.max(0, Math.min(5, Number(p.energy) || 0));
      try {
        const c = await ctx.io.load(p.file.path);
        metrics[ds].words += String(c || "").replace(/\s+/g, "").length;
      } catch (_) {}
    }

    return metrics;
  }

  function buildSeries({ dates, metrics, focusScoreMap }) {
    return {
      labels: dates.map((d) => d.slice(5)),
      noteSeriesDaily: dates.map((d) => Number(metrics[d]?.notes || 0)),
      wordSeriesDaily: dates.map((d) => Number(metrics[d]?.words || 0)),
      taskDoneSeriesDaily: dates.map((d) => Number(metrics[d]?.taskDone || 0)),
      taskRateSeriesDaily: dates.map((d) => {
        const done = Number(metrics[d]?.taskDone || 0);
        const total = Number(metrics[d]?.taskTotal || 0);
        return total > 0 ? Math.round((done / total) * 100) : 0;
      }),
      habitDoneSeriesDaily: dates.map((d) => Number(metrics[d]?.habitDone || 0)),
      energySeriesDaily: dates.map((d) => Number(metrics[d]?.energy || 0)),
      focusSeriesDaily: dates.map((d) => Number(focusScoreMap[String(metrics[d]?.focus || "")] || 0))
    };
  }

  root.diaryMetricsAdapter = {
    buildDiaryMetrics,
    buildSeries
  };
})();
