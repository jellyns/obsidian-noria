(() => {
  globalThis.dashboardPeriodicStatsFallbackBoardsFactory = function createFallbackBoards(ctx) {
    const ctx = ctx?.ctx;
    const makeCard = ctx?.makeCard;
    const habitRegistryPath = ctx?.habitRegistryPath;
    const getSectionTaskEntries = ctx?.getSectionTaskEntries;
    const getSectionItems = ctx?.getSectionItems;
    const normalizeHabit = ctx?.normalizeHabit;
    const extractTaskDate = ctx?.extractTaskDate;
    const bridge = ctx?.bridge || globalThis.__noriaRuntimeBridge || {};
    const diaryRoot = ctx?.diaryRoot || "";
    const boardT = (key, params = {}) => {
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
    const toPlainArray = (value) => {
      if (bridge.runtime && typeof bridge.runtime.toArray === "function") return bridge.runtime.toArray(value);
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
    };

    async function renderHeatmap(parent, title, year, map) {
      const card = makeCard(parent, title);
      const render = globalThis.dashboardCore?.components?.charts?.yearHeatmapCalendar?.renderYearHeatmapCalendar;
      if (typeof render !== "function") {
        card.createDiv({ text: boardT("runtime.stats.fallbackNativeHeatmapMissing") }).style.cssText = "color:var(--text-muted);font-size:.9em;";
        return;
      }
      const host = card.createDiv();
      host.style.cssText = "padding:6px;border-radius:10px;background:color-mix(in srgb,var(--background-primary) 88%,rgba(59,130,246,.05));border:1px solid color-mix(in srgb,var(--background-modifier-border) 76%,rgba(59,130,246,.14));";
      const entries = Object.entries(map).map(([date, intensity]) => ({ date, intensity }));
      render(host, {
        year,
        entries,
        weekStartDay: 1,
        levels: 6,
        paletteKey: /习惯/.test(String(title || "")) ? "habit" : "work"
      });
    }

    async function renderWeeklyHabitBoard(parent, title, dates) {
      const card = makeCard(parent, title);
      const weekSet = new Set(dates);
      let registry = "";
      try {
        registry = await ctx.io.load(habitRegistryPath);
      } catch (_) {}
      const migrateHabitStatusTags = globalThis.dashboardCore?.utils?.habitParsing?.migrateHabitStatusTags;
      if (typeof migrateHabitStatusTags === "function") registry = migrateHabitStatusTags(registry || "");
      if (!registry) {
        card.createDiv({ text: boardT("runtime.stats.fallbackHabitRegistryMissing") }).style.cssText = "color:var(--text-muted);font-size:.9em;";
        return;
      }

      const sourceRows = getSectionTaskEntries(registry, "循环任务源（每日）");
      const activeFromSource = new Set(
        sourceRows
          .filter((x) => /(^|\s)#habit\b/i.test(String(x.text || "")))
          .filter((x) => /#active\b/i.test(String(x.text || "")) && !/#paused\b/i.test(String(x.text || "")))
          .map((x) => normalizeHabit(x.text))
          .filter(Boolean)
      );
      const pausedFromSource = new Set(
        sourceRows
          .filter((x) => /#paused\b/i.test(String(x.text || "")))
          .map((x) => normalizeHabit(x.text))
          .filter(Boolean)
      );
      const habitParsing = globalThis.dashboardCore?.utils?.habitParsing || {};
      const inferHabitConfig = habitParsing.inferLegacyHabitConfig || ((text) => ({ name: normalizeHabit(text) }));
      const activeHabitConfigs = getSectionItems(registry, "打卡中的习惯").map(inferHabitConfig).filter((x) => x.name);
      const normalizeItems = (title) => getSectionItems(registry, title).map((x) => normalizeHabit(x)).filter(Boolean);
      const activeFromSection = new Set(activeHabitConfigs.map((x) => normalizeHabit(x.name)).filter(Boolean));
      const masteredSet = new Set(normalizeItems("已养成习惯"));
      const pausedSet = new Set([...normalizeItems("暂停的习惯"), ...pausedFromSource]);
      const baseActive = new Set([...activeFromSection, ...activeFromSource]);
      const weekHabitSet = new Set();
      sourceRows.forEach((row) => {
        if (!row.completed) return;
        if (!/(^|\s)#habit\b/i.test(String(row.text || ""))) return;
        const name = normalizeHabit(row.text);
        if (!name) return;
        const ds = extractTaskDate(row.text);
        if (weekSet.has(ds)) weekHabitSet.add(name);
      });
      const habits = [...new Set([
        ...[...baseActive].filter((h) => h && !masteredSet.has(h) && !pausedSet.has(h)),
        ...weekHabitSet
      ])]
        .sort((a, b) => a.localeCompare(b, "zh-CN"));

      if (!habits.length) {
        card.createDiv({ text: boardT("runtime.stats.fallbackHabitWeekEmpty") }).style.cssText = "color:var(--text-muted);font-size:.9em;";
        return;
      }

      const doneMap = new Map(habits.map((h) => [h, {}]));
      sourceRows.forEach((row) => {
        if (!row.completed) return;
        if (!/(^|\s)#habit\b/i.test(String(row.text || ""))) return;
        if (/#paused\b/i.test(String(row.text || ""))) return;
        const name = normalizeHabit(row.text);
        if (!doneMap.has(name)) return;
        const ds = extractTaskDate(row.text);
        if (weekSet.has(ds)) doneMap.get(name)[ds] = true;
      });
      const sleepConfig = activeHabitConfigs.find((x) => x.type === "sleep" || /睡/.test(x.name));
      const sleepHabitName = sleepConfig ? normalizeHabit(sleepConfig.name) : "";
      if (sleepHabitName && doneMap.has(sleepHabitName)) {
        const getInlineField = habitParsing.extractInlineField || ((text, key) => {
          const m = String(text || "").match(new RegExp(`\\[${key}::\\s*([^\\]]*)\\]`, "i"));
          return m ? String(m[1] || "").trim() : "";
        });
        const getSleepHabitDate = habitParsing.getSleepHabitDate || (() => "");
        const isSleepBeforeTarget = habitParsing.isSleepBeforeTarget || (() => false);
        const clockFromDateTime = (value) => {
          const m = String(value || "").match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/);
          return m ? m[1] : String(value || "");
        };
        const dateTimeToText = (value) => {
          if (!value) return "";
          try {
            if (typeof value.toFormat === "function") return value.toFormat("yyyy-MM-dd HH:mm");
          } catch (_) {}
          return String(value || "");
        };
        const diaryPages = toPlainArray(bridge.runtime?.pagesForManagedPath?.("diaryRoot", ctx)).filter((p) => {
          const n = String(p.file?.name || "").replace(".md", "");
          return /^\d{8}$/.test(n) || /^\d{4}-\d{2}-\d{2}$/.test(n);
        });
        for (const p of diaryPages) {
          for (const t of p.file?.tasks || []) {
            const txt = String(t?.text || "");
            if (!/#tl\/sleep\b/i.test(txt)) continue;
            const rawStart = getInlineField(txt, "start") || dateTimeToText(t?.start);
            const habitDate = getSleepHabitDate(rawStart);
            if (!weekSet.has(habitDate)) continue;
            const target = getInlineField(txt, "target") || sleepConfig.target || "00:30";
            if (isSleepBeforeTarget(clockFromDateTime(rawStart), target)) doneMap.get(sleepHabitName)[habitDate] = true;
          }
        }
      }

      const activeNow = new Set([...baseActive].filter((h) => h && !masteredSet.has(h) && !pausedSet.has(h)));
      const renderHabitWeekMatrix = globalThis.dashboardCore?.components?.boards?.habitWeekMatrix?.renderHabitWeekMatrix;
      if (typeof renderHabitWeekMatrix === "function") {
        card.remove?.();
        renderHabitWeekMatrix(parent, {
          title,
          dates: dates.slice(0, 7),
          habits,
          doneMap,
          activeNow
        });
        return;
      }
      card.createDiv({ text: boardT("runtime.stats.fallbackHabitMatrixMissing") }).style.cssText = "color:var(--text-muted);font-size:.9em;";
    }

    return {
      renderHeatmap,
      renderWeeklyHabitBoard
    };
  };
})();
