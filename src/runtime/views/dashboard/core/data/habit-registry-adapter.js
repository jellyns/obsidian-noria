(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});

  const SECTION_ALIASES = [
    ["打卡中的习惯", "Active habits"],
    ["暂停的习惯", "Paused habits"],
    ["已养成习惯", "Established habits"],
    ["循环任务源（每日）", "Daily recurring task source"]
  ];

  function sectionBlock(content, title) {
    const source = String(content || "");
    const raw = String(title || "").trim();
    const aliases = SECTION_ALIASES.find((group) => group.includes(raw)) || [raw];
    for (const candidate of aliases) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const block = (source.match(new RegExp(`##\\s*${escaped}[\\s\\S]*?(?=\\n##\\s|$)`)) || [])[0] || "";
      if (block) return block;
    }
    return "";
  }

  function getSectionItems(content, title) {
    const block = sectionBlock(content, title);
    return [...new Set(
      block
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => /^-\s+/.test(x))
        .map((x) => x.replace(/^-+\s*/, "").trim())
        .filter((x) => x && x !== "（空）" && !/^\(?\s*empty\s*\)?$/i.test(x))
    )];
  }

  function getSectionTaskEntries(content, title) {
    const block = sectionBlock(content, title);
    return block
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => /^-\s+\[[ xX]\]\s+/.test(x))
      .map((x) => ({ completed: /^-\s+\[[xX]\]\s+/.test(x), text: x.replace(/^-\s+\[[ xX]\]\s+/, "").trim() }))
      .filter((x) => !!x.text);
  }

  function normalizeHabit(text) {
    return String(text || "")
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
  }

  function migrateHabitStatusTags(text) {
    return String(text || "")
      .split("\n")
      .map((line) => {
        const seen = new Set();
        return String(line || "")
          .replace(/#habit-active\b/gi, "#habit #active")
          .replace(/#habit-paused\b/gi, "#habit #paused")
          .replace(/#habit-done\b/gi, "#habit #paused #done")
          .replace(/(^|[ \t]+)(#(?:habit|active|paused|done))\b/gi, (_, gap, tag) => {
            const key = String(tag || "").toLowerCase();
            if (seen.has(key)) return "";
            seen.add(key);
            return `${gap}${key}`;
          })
          .replace(/[ \t]{2,}/g, " ")
          .trimEnd();
      })
      .join("\n");
  }

  function canonicalHabitName(text) {
    const name = normalizeHabit(text);
    let m = name.match(/^喝\s*(\d+(?:\.\d+)?)\s*杯水$/);
    if (m) return "喝水";
    m = name.match(/^运动\s*(\d+(?:\.\d+)?)\s*(大卡|千卡|kcal|卡)$/i);
    if (m) return "运动";
    return name;
  }

  function extractTaskDate(text) {
    const s = String(text || "");
    const pick = (re) => {
      const m = s.match(re);
      return m ? m[1] : "";
    };
    return pick(/\[due::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[scheduled::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[start::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/🛫\s*(\d{4}-\d{2}-\d{2})/)
      || pick(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/\[done::\s*(\d{4}-\d{2}-\d{2})\]/i)
      || pick(/✅\s*(\d{4}-\d{2}-\d{2})/);
  }

  async function loadHabitRegistryState({ ctx, path }) {
    const registry = migrateHabitStatusTags(await ctx.io.load(path));
    if (!registry) return null;

    const sourceRows = getSectionTaskEntries(registry, "循环任务源（每日）");
    const activeFromSource = new Set(
      sourceRows
        .filter((x) => /(^|\s)#habit\b/i.test(String(x.text || "")))
        .filter((x) => /#active\b/i.test(String(x.text || "")) && !/#paused\b/i.test(String(x.text || "")))
        .map((x) => canonicalHabitName(x.text))
        .filter(Boolean)
    );
    const pausedFromSource = new Set(
      sourceRows
        .filter((x) => /#paused\b/i.test(String(x.text || "")))
        .map((x) => canonicalHabitName(x.text))
        .filter(Boolean)
    );
    const activeFromSection = new Set(getSectionItems(registry, "打卡中的习惯").map(canonicalHabitName).filter(Boolean));
    const masteredSet = new Set(getSectionItems(registry, "已养成习惯").map(canonicalHabitName).filter(Boolean));
    const pausedSet = new Set([...getSectionItems(registry, "暂停的习惯").map(canonicalHabitName).filter(Boolean), ...pausedFromSource]);
    const activeNow = new Set([...activeFromSection, ...activeFromSource]);

    return { sourceRows, activeNow, pausedSet, masteredSet };
  }

  function buildWeeklyHabitState({ sourceRows, activeNow, pausedSet, masteredSet, dates }) {
    const weekSet = new Set(dates);
    const weekHabitSet = new Set();
    sourceRows.forEach((row) => {
      if (!row.completed) return;
      if (!/(^|\s)#habit\b/i.test(String(row.text || ""))) return;
      const name = canonicalHabitName(row.text);
      if (!name) return;
      const ds = extractTaskDate(row.text);
      if (weekSet.has(ds)) weekHabitSet.add(name);
    });

    const habits = [...new Set([
      ...[...activeNow].filter((h) => h && !masteredSet.has(h) && !pausedSet.has(h)),
      ...weekHabitSet
    ])].sort((a, b) => a.localeCompare(b, "zh-CN"));

    const doneMap = new Map(habits.map((h) => [h, {}]));
    sourceRows.forEach((row) => {
      if (!row.completed) return;
      if (!/(^|\s)#habit\b/i.test(String(row.text || ""))) return;
      if (/#paused\b/i.test(String(row.text || ""))) return;
      const name = canonicalHabitName(row.text);
      if (!doneMap.has(name)) return;
      const ds = extractTaskDate(row.text);
      if (weekSet.has(ds)) doneMap.get(name)[ds] = true;
    });

    return { habits, doneMap };
  }

  root.habitRegistryAdapter = {
    getSectionItems,
    getSectionTaskEntries,
    normalizeHabit,
    migrateHabitStatusTags,
    canonicalHabitName,
    extractTaskDate,
    loadHabitRegistryState,
    buildWeeklyHabitState
  };
})();
