const page = ctx.current();
const filePath = String(page?.file?.path || "");
const statusBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const statusT = (key, params = {}) => {
  try {
    if (statusBridge && typeof statusBridge.t === "function") return statusBridge.t(key, params);
    const messages = statusBridge?.i18n?.messages || {};
    const fallback = statusBridge?.i18n?.fallback || {};
    let template = messages[key] || fallback[key] || key;
    Object.entries(params || {}).forEach(([k, v]) => {
      template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
    });
    return String(template);
  } catch (_) {
    return String(key || "");
  }
};
const statusLabel = (domain, value, fallback = value) => {
  try {
    if (statusBridge?.runtime && typeof statusBridge.runtime.displayLabel === "function") {
      return statusBridge.runtime.displayLabel(domain, value, fallback);
    }
  } catch (_) {}
  return fallback == null ? "" : String(fallback);
};
const STATUS_DIARY_DAY_BLOCKS_PATH = ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js";
const STATUS_WEATHER_SERVICE_PATH = ".obsidian/plugins/noria/views/dashboard/core/utils/weather-service.js";
const STATUS_RUNTIME_BUILD_ID = String(
  statusBridge?.runtimeBuildId ||
  globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
  "unknown"
);
function getStatusServiceLoadState() {
  let state = globalThis.__noriaPeriodicStatusServiceLoadState;
  if (!state || state.runtimeBuildId !== STATUS_RUNTIME_BUILD_ID) {
    state = {
      runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
      diaryDayBlocks: {
        runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
        status: "idle",
        pending: null,
        lastError: "",
        sourcePath: STATUS_DIARY_DAY_BLOCKS_PATH
      },
      weather: {
        runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
        status: "idle",
        pending: null,
        lastError: "",
        sourcePath: STATUS_WEATHER_SERVICE_PATH
      }
    };
    globalThis.__noriaPeriodicStatusServiceLoadState = state;
  }
  if (!state.weather || state.weather.runtimeBuildId !== STATUS_RUNTIME_BUILD_ID) {
    state.weather = {
      runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
      status: "idle",
      pending: null,
      lastError: "",
      sourcePath: STATUS_WEATHER_SERVICE_PATH
    };
  }
  if (!state.diaryDayBlocks || state.diaryDayBlocks.runtimeBuildId !== STATUS_RUNTIME_BUILD_ID) {
    state.diaryDayBlocks = {
      runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
      status: "idle",
      pending: null,
      lastError: "",
      sourcePath: STATUS_DIARY_DAY_BLOCKS_PATH
    };
  }
  return state;
}
function recordDiaryDayBlocksLoad(patch = {}) {
  const state = getStatusServiceLoadState().diaryDayBlocks;
  Object.assign(state, patch, {
    runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
    sourcePath: STATUS_DIARY_DAY_BLOCKS_PATH
  });
  return state;
}
function recordWeatherServiceLoad(patch = {}) {
  const state = getStatusServiceLoadState().weather;
  Object.assign(state, patch, {
    runtimeBuildId: STATUS_RUNTIME_BUILD_ID,
    sourcePath: STATUS_WEATHER_SERVICE_PATH
  });
  if (state.lastError) globalThis.__noriaWeatherServiceLoadError = state.lastError;
  else {
    try {
      delete globalThis.__noriaWeatherServiceLoadError;
    } catch (_) {
      globalThis.__noriaWeatherServiceLoadError = "";
    }
  }
  return state;
}
async function loadStatusRuntimeText(path) {
  let code = "";
  try {
    code = String(await ctx.io.load(path) || "");
  } catch (_) {}
  if (!code) {
    try {
      code = String(await app.vault.adapter.read(path) || "");
    } catch (_) {}
  }
  return code;
}
if (!filePath) {
  ctx.paragraph(statusT("runtime.home.facade.missingContainer"));
  return;
}

const host = ctx.el("div", "", { cls: "daily-status-wrap" });
const styleId = "daily-status-selector-style";
let style = document.getElementById(styleId);
if (!style) {
  style = document.createElement("style");
  style.id = styleId;
  document.head.appendChild(style);
}
style.textContent = `
.daily-status-wrap {
  width: 100%;
  overflow-x: auto;
  --ds-gap: 10px;
  --ds-card-radius: 10px;
  --ds-hit: 30px;
  --ds-pill-radius: 8px;
  --ds-active-bg: color-mix(in srgb, rgba(59,130,246,.22) 78%, transparent);
  --ds-active-bd: color-mix(in srgb, rgba(37,99,235,.58) 75%, transparent);
}
.daily-status-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-gap);
  width: 100%;
  min-width: 760px;
  align-items: stretch;
}
@media (max-width: 860px) {
  .daily-status-row {
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }
}
.daily-status-wrap .dashboard-recap-state-card {
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, rgba(99,102,241,.22));
  border-radius: var(--ds-card-radius);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background-primary) 97%, var(--background-secondary)),
    color-mix(in srgb, var(--background-primary) 98%, rgba(99,102,241,.05))
  );
  padding: 6px 8px;
  min-width: 0;
}
.daily-status-wrap .dashboard-recap-state-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.daily-status-wrap .dashboard-recap-state-title-inline {
  font-size: .8rem;
  font-weight: 650;
  color: color-mix(in srgb, var(--text-normal) 62%, var(--text-muted) 38%);
  white-space: nowrap;
  flex: 0 0 auto;
}
.daily-status-wrap .dashboard-recap-pills,
.daily-status-wrap .dashboard-recap-energy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}
.daily-status-wrap .dashboard-recap-pills--hscroll,
.daily-status-wrap .dashboard-recap-pills--weather,
.daily-status-wrap .dashboard-recap-pills--mood,
.daily-status-wrap .dashboard-recap-energy--hscroll {
  /* 日态区不使用边缘渐隐，避免首尾图标被视觉裁切 */
  padding-inline: 2px;
}
.daily-status-wrap .dashboard-recap-pill,
.daily-status-wrap .dashboard-recap-energy-cell {
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, rgba(99,102,241,.2));
  background: color-mix(in srgb, var(--background-primary) 94%, rgba(99,102,241,.05));
  color: var(--text-normal);
  border-radius: var(--ds-pill-radius);
  width: var(--ds-hit);
  height: var(--ds-hit);
  min-width: var(--ds-hit);
  min-height: var(--ds-hit);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
}
.daily-status-wrap .dashboard-recap-pill:hover:not(.is-active),
.daily-status-wrap .dashboard-recap-energy-cell:hover:not(.is-on) {
  background: color-mix(in srgb, var(--background-primary) 88%, rgba(99,102,241,.1));
}
.daily-status-wrap .dashboard-recap-pill:active,
.daily-status-wrap .dashboard-recap-energy-cell:active {
  transform: scale(0.96);
}
.daily-status-wrap .dashboard-recap-pill.is-active,
.daily-status-wrap .dashboard-recap-energy-cell.is-on {
  border-color: var(--ds-active-bd);
  background: var(--ds-active-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ds-active-bd) 68%, transparent);
}
.daily-status-wrap .dashboard-recap-energy-icon {
  opacity: .92;
  line-height: 1;
}
.daily-status-wrap .dashboard-recap-icon-submit {
  box-sizing: border-box;
  width: var(--ds-hit);
  height: var(--ds-hit);
  min-width: var(--ds-hit);
  min-height: var(--ds-hit);
  border-radius: var(--ds-pill-radius);
  border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, rgba(99,102,241,.2));
  background: color-mix(in srgb, var(--background-primary) 94%, rgba(99,102,241,.05));
  color: color-mix(in srgb, var(--text-normal) 78%, var(--text-muted) 22%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.daily-status-wrap .dashboard-recap-icon-submit:hover {
  background: color-mix(in srgb, var(--background-primary) 88%, rgba(99,102,241,.1));
}
.daily-status-hint {
  font-size: .74rem;
  color: var(--text-muted);
  line-height: 1.35;
  margin: 0 0 8px;
  max-width: 760px;
  width: 100%;
}
.daily-status-weather-text {
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-text);
  font-size: var(--dash-text-row-size, .86em);
  line-height: var(--dash-text-row-line, 1.25);
  font-weight: var(--dash-text-row-weight, 500);
}
.daily-status-ops {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
`;

const isTemplateFile = /(^|[\\/])00_Templates([\\/]|$)/i.test(filePath);

const groups = [
  {
    key: "mood",
    titleKey: "runtime.periodic.status.mood",
    options: [
      { value: "很好", label: "😀" },
      { value: "稳定", label: "🙂" },
      { value: "一般", label: "😐" },
      { value: "偏低", label: "😣" },
      { value: "很差", label: "😫" }
    ]
  },
  {
    key: "focus",
    titleKey: "runtime.periodic.status.focus",
    options: [
      { value: "很专注", label: "🟢" },
      { value: "基本专注", label: "🟡" },
      { value: "易分心", label: "🟠" },
      { value: "难进入状态", label: "🔴" }
    ]
  },
];

(async () => {
  async function ensureDiaryDayBlocks() {
    const existing = globalThis.dashboardCore?.utils?.diaryDayBlocks;
    if (existing) {
      recordDiaryDayBlocksLoad({ status: "ready", pending: null, service: existing, lastError: "" });
      return existing;
    }
    const state = getStatusServiceLoadState().diaryDayBlocks;
    if (state.status === "ready" && state.service) return state.service;
    if (state.pending) return state.pending;
    if (state.status === "missing" || state.status === "failed") return null;
    state.pending = (async () => {
      recordDiaryDayBlocksLoad({ status: "loading", pending: state.pending, lastError: "" });
      const code = await loadStatusRuntimeText(STATUS_DIARY_DAY_BLOCKS_PATH);
      if (!code) {
        recordDiaryDayBlocksLoad({
          status: "missing",
          pending: null,
          lastError: "diaryDayBlocks source missing"
        });
        host.createEl("div", { cls: "daily-status-hint", text: statusT("runtime.periodic.dailyRecap.blocksMissing") });
        return null;
      }
      try {
        (0, eval)(code);
      } catch (e) {
        recordDiaryDayBlocksLoad({
          status: "failed",
          pending: null,
          lastError: String(e?.message || e || "unknown")
        });
        return null;
      }
      const service = globalThis.dashboardCore?.utils?.diaryDayBlocks || null;
      if (!service) {
        recordDiaryDayBlocksLoad({
          status: "failed",
          pending: null,
          lastError: "diaryDayBlocks missing after eval"
        });
        return null;
      }
      recordDiaryDayBlocksLoad({ status: "ready", pending: null, service, lastError: "" });
      return service;
    })();
    recordDiaryDayBlocksLoad({ status: "loading", pending: state.pending, lastError: "" });
    return state.pending;
  }

  async function ensureWeatherService() {
    const existing = globalThis.dashboardCore?.utils?.weatherService;
    if (existing) {
      recordWeatherServiceLoad({ status: "ready", pending: null, service: existing, lastError: "" });
      return existing;
    }
    const state = getStatusServiceLoadState().weather;
    if (state.status === "ready" && state.service) return state.service;
    if (state.pending) return state.pending;
    if (state.status === "missing" || state.status === "failed") {
      if (state.lastError) globalThis.__noriaWeatherServiceLoadError = state.lastError;
      return null;
    }
    state.pending = (async () => {
      recordWeatherServiceLoad({ status: "loading", pending: state.pending, lastError: "" });
      const code = await loadStatusRuntimeText(STATUS_WEATHER_SERVICE_PATH);
      if (!code) {
        recordWeatherServiceLoad({
          status: "missing",
          pending: null,
          lastError: "weatherService source missing"
        });
        return null;
      }
      try {
        (0, eval)(code);
      } catch (e) {
        try {
          (new Function(String(code)))();
        } catch (e2) {
          recordWeatherServiceLoad({
            status: "failed",
            pending: null,
            lastError: String(e2?.message || e?.message || e2 || e || "unknown")
          });
          return null;
        }
      }
      const service = globalThis.dashboardCore?.utils?.weatherService || null;
      if (!service) {
        recordWeatherServiceLoad({
          status: "failed",
          pending: null,
          lastError: "weatherService missing after eval"
        });
        return null;
      }
      recordWeatherServiceLoad({ status: "ready", pending: null, service, lastError: "" });
      return service;
    })();
    recordWeatherServiceLoad({ status: "loading", pending: state.pending, lastError: "" });
    return state.pending;
  }

  const U = await ensureDiaryDayBlocks();
  if (!U) return;

  const file = app.vault.getAbstractFileByPath(filePath);
  const raw = file && "path" in file ? await app.vault.read(file) : "";
  const parsed = typeof U.parseDailyState === "function"
    ? U.parseDailyState(raw, page)
    : U.parseDailyStateFromBody(raw);

  const state = {
    mood: U.pickField(parsed.mood, page?.mood),
    energy: U.pickField(parsed.energy, page?.energy),
    focus: U.pickField(parsed.focus, page?.focus),
    weather: U.pickField(parsed.weather, page?.weather),
    weather_status: U.pickField(parsed.weather_status, page?.weather_status),
    weather_temp: U.pickField(parsed.weather_temp, page?.weather_temp),
    weather_humidity: U.pickField(parsed.weather_humidity, page?.weather_humidity),
    weather_aqi: U.pickField(parsed.weather_aqi, page?.weather_aqi),
    weather_ip: U.pickField(parsed.weather_ip, page?.weather_ip),
    weather_city: U.pickField(parsed.weather_city, page?.weather_city),
    weather_source: U.pickField(parsed.weather_source, page?.weather_source)
  };

  const hint = host.createEl("div", { cls: "daily-status-hint" });
  hint.textContent = isTemplateFile
    ? statusT("runtime.periodic.status.templatePreview")
    : statusT("runtime.periodic.status.writeHint");

  let saving = false;
  const setField = async (key, value) => {
    if (isTemplateFile) return;
    if (saving) return;
    saving = true;
    try {
      state[key] = value;
      const dateMatch = String(filePath || "").match(/(\d{4})-?(\d{2})-?(\d{2})\.md$/);
      const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
      if (date && typeof statusBridge?.saveDailyStateForDate === "function") {
        const result = await statusBridge.saveDailyStateForDate(date, { [key]: value }, { refresh: false });
        if (result?.ok) return;
      }
      const af = app.vault.getAbstractFileByPath(filePath);
      if (!af || !("path" in af) || typeof app.vault.process !== "function") return;
      await app.vault.process(af, (current) => {
        const latest = typeof U.parseDailyStateFromBody === "function"
          ? U.parseDailyStateFromBody(current)
          : {};
        return U.upsertDailyStateSection(current, { ...latest, [key]: value });
      });
    } finally {
      saving = false;
    }
  };

  const row = host.createEl("div", { cls: "daily-status-row dashboard-recap-state-grid" });
  const weatherIconByState = {
    "晴": "☀️",
    "暴晒": "🥵",
    "多云": "⛅",
    "阴": "☁️",
    "雨": "🌧️",
    "风": "🌬️",
    "雪": "❄️"
  };
  const parseDateFromFilePathFallback = (p) => {
    const s = String(p || "").replace(/\\/g, "/");
    const m1 = s.match(/(\d{4})-(\d{2})-(\d{2})\.md$/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    const m2 = s.match(/(\d{4})(\d{2})(\d{2})\.md$/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const renderWeatherCard = async () => {
    const service = await ensureWeatherService();
    const card = row.createEl("div", { cls: "dashboard-recap-state-card dashboard-recap-state-card--weather" });
    const r = card.createEl("div", { cls: "dashboard-recap-state-row" });
    r.createEl("span", { cls: "dashboard-recap-state-title-inline", text: statusT("runtime.periodic.status.weather") });
    const pills = r.createEl("div", { cls: "dashboard-recap-pills dashboard-recap-pills--weather" });
    const weatherBtn = pills.createEl("span", { cls: "daily-status-weather-text", text: statusT("runtime.periodic.status.loading") });
    const ops = r.createEl("div", { cls: "daily-status-ops" });
    const edit = ops.createEl("button", { cls: "dashboard-recap-icon-submit dashboard-recap-icon-submit--rail", text: "↻" });
    edit.title = statusT("runtime.periodic.status.refreshWeatherTitle");
    const meta = card.createEl("div", { cls: "daily-status-hint" });
    meta.style.margin = "4px 0 0";
    const targetDate = (typeof service?.parseDateFromPath === "function")
      ? service.parseDateFromPath(filePath) || parseDateFromFilePathFallback(filePath)
      : parseDateFromFilePathFallback(filePath);

    const applyPayload = (payload) => {
      const mapped = String(payload?.mappedWeather || state.weather || "").trim();
      const icon = weatherIconByState[mapped] || "🌤️";
      const mappedLabel = statusLabel("weather", mapped, mapped || "N/A");
      const city = String(payload?.city || state.weather_city || "").trim();
      const tMin = String(payload?.tempMin || "").trim();
      const tMax = String(payload?.tempMax || "").trim();
      const tempSingle = String(payload?.tempMax || "").trim();
      const humidity = String(payload?.humidity || state.weather_humidity || "").trim();
      const temp = tMin && tMax
        ? `${tMin}~${tMax}℃`
        : (tempSingle ? `${tempSingle}℃` : (String(state.weather_temp || "").trim() ? `${state.weather_temp}℃` : ""));
      weatherBtn.textContent = `${icon} ${mappedLabel}${temp ? ` ${temp}` : ""}${humidity ? ` ${statusT("runtime.home.weather.humidity", { value: humidity })}` : ""}`;
      const aqi = String(payload?.aqi || state.weather_aqi || "").trim();
      const ip = String(payload?.ip || state.weather_ip || "").trim();
      meta.textContent = [city, humidity ? statusT("runtime.home.weather.humidity", { value: humidity }) : "", aqi ? `AQI ${aqi}` : "", ip ? `IP ${ip}` : ""].filter(Boolean).join(" · ") || statusT("runtime.periodic.status.weatherNoExtra");
      state.weather = mapped || state.weather;
      state.weather_status = String(payload?.statusText || payload?.rawText || "").trim() || state.weather_status;
      state.weather_temp = tMin && tMax ? `${tMin}~${tMax}` : (tempSingle || state.weather_temp);
      state.weather_humidity = humidity || state.weather_humidity;
      state.weather_aqi = aqi || state.weather_aqi;
      state.weather_ip = ip || state.weather_ip;
      state.weather_city = city || state.weather_city;
      state.weather_source = String(payload?.source || state.weather_source || "qweather").trim();
    };

    const renderFromCurrentState = () => {
      const icon = weatherIconByState[state.weather] || "🌤️";
      const temp = String(state.weather_temp || "").trim();
      const humidity = String(state.weather_humidity || "").trim();
      const weatherLabel = statusLabel("weather", state.weather, state.weather || "N/A");
      weatherBtn.textContent = `${icon} ${weatherLabel}${temp ? ` ${temp}℃` : ""}${humidity ? ` ${statusT("runtime.home.weather.humidity", { value: humidity })}` : ""}`;
      meta.textContent = [
        String(state.weather_city || "").trim(),
        humidity ? statusT("runtime.home.weather.humidity", { value: humidity }) : "",
        String(state.weather_aqi || "").trim() ? `AQI ${state.weather_aqi}` : "",
        String(state.weather_ip || "").trim() ? `IP ${state.weather_ip}` : ""
      ].filter(Boolean).join(" · ") || statusT("runtime.periodic.status.weatherRefreshHint");
    };

    const refreshWeather = async (forceOverwrite = false) => {
      if (!service || (typeof service.getWeatherForDate !== "function" && typeof service.getWeatherForHome !== "function")) {
        weatherBtn.textContent = `⚠ ${statusT("runtime.periodic.status.weatherUnavailable")}`;
        const why = String(globalThis.__noriaWeatherServiceLoadError || "").trim();
        meta.textContent = why
          ? statusT("runtime.periodic.status.weatherServiceMissingWithReason", { reason: why })
          : statusT("runtime.periodic.status.weatherServiceMissing");
        return;
      }
      weatherBtn.textContent = statusT("runtime.periodic.status.refreshing");
      try {
        const runtimeWeather = globalThis.__noriaRuntimeBridge?.weather || {};
        const anchor = {
          city: String(state.weather_city || "").trim(),
          ip: String(state.weather_ip || "").trim()
        };
        const payload = (typeof service.getWeatherForDate === "function")
          ? await service.getWeatherForDate(runtimeWeather, { targetDate, filePath, anchor })
          : await service.getWeatherForHome(runtimeWeather);
        applyPayload(payload);
        if (typeof service.readWriteDailyWeather === "function") {
          await service.readWriteDailyWeather(targetDate, state.weather, {
            payload,
            filePath,
            skipIfExists: false,
            forceOverwrite
          });
        }
      } catch (e) {
        weatherBtn.textContent = `⚠ ${statusT("runtime.periodic.status.weatherFailed")}`;
        meta.textContent = String(e?.message || e || statusT("runtime.periodic.status.weatherRequestFailed"));
      }
    };

    edit.onclick = async () => {
      await refreshWeather(true);
      renderFromCurrentState();
    };

    renderFromCurrentState();
    if (!String(state.weather || "").trim()) {
      await refreshWeather();
    }
  };

  const renderChoiceCard = (group) => {
    const card = row.createEl("div", { cls: `dashboard-recap-state-card ${group.key === "mood" ? "dashboard-recap-state-card--mood" : ""}` });
    const r = card.createEl("div", { cls: "dashboard-recap-state-row" });
    r.createEl("span", { cls: "dashboard-recap-state-title-inline", text: statusT(group.titleKey) });
    const body = r.createEl("div", { cls: `dashboard-recap-pills ${group.key === "mood" ? "dashboard-recap-pills--mood" : "dashboard-recap-pills--hscroll"}` });

    const render = () => {
      body.empty();
      const current = state[group.key];
      for (const op of group.options) {
        const btn = body.createEl("button", { cls: "dashboard-recap-pill", text: op.label });
        const display = statusLabel(group.key, op.value, op.value);
        btn.setAttr("title", display);
        btn.setAttr("aria-label", display);
        if (current === op.value) btn.addClass("is-active");
        btn.onclick = async () => {
          await setField(group.key, op.value);
          render();
        };
      }
    };

    render();
  };

  const renderEnergyCard = () => {
    const card = row.createEl("div", { cls: "dashboard-recap-state-card dashboard-recap-state-card--energy" });
    const r = card.createEl("div", { cls: "dashboard-recap-state-row" });
    r.createEl("span", { cls: "dashboard-recap-state-title-inline", text: statusT("runtime.periodic.status.energy") });
    const body = r.createEl("div", { cls: "dashboard-recap-energy dashboard-recap-energy--compact dashboard-recap-energy--hscroll" });

    const render = () => {
      body.empty();
      const level = Math.max(0, Math.min(5, Number(state.energy) || 0));

      for (let i = 1; i <= 5; i += 1) {
        const cell = body.createEl("button", { cls: "dashboard-recap-energy-cell" });
        const icon = cell.createEl("span", { cls: "dashboard-recap-energy-icon", text: i === 1 ? "🪫" : "🔋" });
        icon.setAttr("aria-hidden", "true");
        if (i <= level) cell.addClass("is-on");
        cell.setAttr("data-energy-level", String(i));
        cell.title = statusT("runtime.periodic.energyValue", { value: i });
        cell.setAttr("aria-label", statusT("runtime.periodic.energyValue", { value: i }));
        cell.onclick = async () => {
          await setField("energy", String(i));
          render();
        };
      }
    };

    render();
  };

  await renderWeatherCard();
  renderChoiceCard(groups[0]);
  renderEnergyCard();
  renderChoiceCard(groups[1]);
})();
