(async () => {
  const homeIdentityBridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
  const homeIdentityT = (key, params = {}) => {
    try {
      if (homeIdentityBridge && typeof homeIdentityBridge.t === "function") {
        return homeIdentityBridge.t(key, params);
      }
      const messages = homeIdentityBridge?.i18n?.messages || {};
      const fallback = homeIdentityBridge?.i18n?.fallback || {};
      let template = messages[key] || fallback[key] || key;
      Object.entries(params || {}).forEach(([k, v]) => {
        template = String(template).replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      });
      return String(template);
    } catch (_) {
      return String(key || "");
    }
  };
  async function loadText(path) {
    try {
      const txt = await ctx.io.load(path);
      if (txt) return String(txt);
    } catch (_) {}
    try {
      const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return String(await app.vault.adapter.read(normalized) || "");
    } catch (_) {
      return "";
    }
  }
  const HOME_IDENTITY_WEATHER_SERVICE_PATH = ".obsidian/plugins/noria/views/dashboard/core/utils/weather-service.js";
  const HOME_IDENTITY_RUNTIME_BUILD_ID = String(
    homeIdentityBridge?.runtimeBuildId ||
    globalThis.__noriaRuntimeBridge?.runtimeBuildId ||
    "unknown"
  );
  function getHomeIdentityServiceLoadState() {
    let state = globalThis.__noriaPeriodicStatusServiceLoadState;
    if (!state || state.runtimeBuildId !== HOME_IDENTITY_RUNTIME_BUILD_ID) {
      state = {
        runtimeBuildId: HOME_IDENTITY_RUNTIME_BUILD_ID,
        weather: {
          runtimeBuildId: HOME_IDENTITY_RUNTIME_BUILD_ID,
          status: "idle",
          pending: null,
          lastError: "",
          sourcePath: HOME_IDENTITY_WEATHER_SERVICE_PATH
        }
      };
      globalThis.__noriaPeriodicStatusServiceLoadState = state;
    }
    if (!state.weather || state.weather.runtimeBuildId !== HOME_IDENTITY_RUNTIME_BUILD_ID) {
      state.weather = {
        runtimeBuildId: HOME_IDENTITY_RUNTIME_BUILD_ID,
        status: "idle",
        pending: null,
        lastError: "",
        sourcePath: HOME_IDENTITY_WEATHER_SERVICE_PATH
      };
    }
    return state;
  }
  function recordHomeIdentityWeatherServiceLoad(patch = {}) {
    const state = getHomeIdentityServiceLoadState().weather;
    Object.assign(state, patch, {
      runtimeBuildId: HOME_IDENTITY_RUNTIME_BUILD_ID,
      sourcePath: HOME_IDENTITY_WEATHER_SERVICE_PATH
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

  const container = input?.mount || ((typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null));
  if (!container || typeof container.createDiv !== "function") {
    ctx.paragraph(homeIdentityT("runtime.home.noContainer"));
    return;
  }

  const homeIdentitySettings = homeIdentityBridge?.homeSettings?.identity || {};
  const idTheme = globalThis.dashboardCore?.theme?.home?.overview?.identity || {};
  const quotePath = String(homeIdentitySettings.quoteListPath || idTheme.quoteListPath || "Noria/Quotes.md").trim();
  const displayName = String(homeIdentitySettings.displayName || idTheme.displayName || "").trim();
  const greetingName = String(homeIdentitySettings.greetingName || "").trim();
  const greetingLabel = greetingName || displayName;
  const avatarPath = String(homeIdentitySettings.avatarPath || idTheme.avatarPath || "").trim();
  const snippetRoots = Array.isArray(idTheme.snippetVaultRoots) && idTheme.snippetVaultRoots.length
    ? idTheme.snippetVaultRoots.map((x) => String(x || "").replace(/\\/g, "/").replace(/\/?$/, "/"))
    : ["02_Areas/", "03_Resources/", "04_Archives/", "05_MOC/"];
  const snippetMaxLen = Math.max(200, Math.min(900, Number(idTheme.snippetMaxLength) || 480));

  const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const normQuotePath = normPath(quotePath);
  const isAvatarExt = (file) => /^(png|jpe?g|webp|gif|svg)$/i.test(String(file?.extension || "").replace(/^\./, ""));
  const avatarMimeType = (file) => {
    const ext = String(file?.extension || file?.path || "").split(".").pop().toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    return "application/octet-stream";
  };
  const bytesToBase64 = (bytes) => {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let out = "";
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
      out += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    try {
      if (typeof btoa === "function") return btoa(out);
    } catch (_) {}
    try {
      const B = globalThis?.Buffer;
      if (B && typeof B.from === "function") return B.from(arr).toString("base64");
    } catch (_) {}
    return "";
  };

  function renderAvatarFallback(parent, reason = "") {
    try { parent.empty?.(); } catch (_) {}
    const ph = parent.createDiv();
    ph.addClass("dashboard-identity-avatar");
    ph.textContent = displayName ? displayName.slice(0, 2) : "C";
    if (reason) ph.setAttr("title", reason);
    return ph;
  }

  const binaryToDataUrl = (raw, mime) => {
    if (!raw) return "";
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const b64 = bytesToBase64(bytes);
    return b64 ? `data:${mime};base64,${b64}` : "";
  };

  async function avatarSourceCandidates(file, triedSources) {
    const pathText = normPath(file?.path || "");
    const mime = avatarMimeType(file);
    const candidates = [];
    const pushSource = (label) => {
      if (label && !triedSources.includes(label)) triedSources.push(label);
    };
    const pushCandidate = (source, kind, method, resolveSource = null) => {
      const src = String(source || "");
      if (!src && typeof resolveSource !== "function") return;
      if (src && candidates.some((item) => item.source === src)) return;
      candidates.push({ source: src, kind, method, resolveSource });
    };
    try {
      pushSource("vault.getResourcePath");
      const resourcePath = typeof app.vault.getResourcePath === "function"
        ? app.vault.getResourcePath(file)
        : "";
      pushCandidate(resourcePath, "vault-resource", "vault.getResourcePath");
    } catch (_) {}
    try {
      pushSource("adapter.getResourcePath");
      const adapterSource = typeof app.vault.adapter?.getResourcePath === "function"
        ? app.vault.adapter.getResourcePath(pathText)
        : "";
      pushCandidate(adapterSource, "adapter-resource", "adapter.getResourcePath");
    } catch (_) {}
    try {
      if (typeof app.vault.readBinary === "function") {
        pushCandidate("", "data-url", "vault.readBinary", async () => {
          pushSource("vault.readBinary");
          const raw = await app.vault.readBinary(file);
          return binaryToDataUrl(raw, mime);
        });
      }
    } catch (_) {}
    try {
      if (typeof app.vault.adapter?.readBinary === "function") {
        pushCandidate("", "data-url", "adapter.readBinary", async () => {
          pushSource("adapter.readBinary");
          const raw = await app.vault.adapter.readBinary(pathText);
          return binaryToDataUrl(raw, mime);
        });
      }
    } catch (_) {}
    try {
      if (typeof app.vault.adapter?.read === "function" && mime === "image/svg+xml") {
        pushCandidate("", "data-url-text", "adapter.read", async () => {
          pushSource("adapter.read");
          const txt = await app.vault.adapter.read(pathText);
          return txt ? `data:${mime};utf8,${encodeURIComponent(String(txt))}` : "";
        });
      }
    } catch (_) {}
    return candidates;
  }

  async function resolveAvatarCandidateSource(candidate) {
    if (!candidate) return "";
    if (candidate.source) return String(candidate.source || "");
    if (typeof candidate.resolveSource !== "function") return "";
    const source = String(await candidate.resolveSource() || "");
    candidate.source = source;
    return source;
  }

  async function resolveAvatarResource(rawPath) {
    const base = normPath(rawPath);
    const tried = [];
    const triedSources = [];
    const push = (p) => {
      const v = normPath(p);
      if (v && !tried.includes(v)) tried.push(v);
    };
    push(base);
    try {
      const exactName = base.replace(/\.(png|jpe?g|webp|gif|svg)$/i, "");
      const linked = app.metadataCache?.getFirstLinkpathDest?.(exactName || base, "");
      if (linked?.path) push(linked.path);
    } catch (_) {}
    if (/^Attachment\//i.test(base)) push(base.replace(/^Attachment\//i, "99_Attachment/"));
    if (base) push(`99_Attachment/${base.split("/").pop()}`);
    try {
      const basename = base.split("/").pop() || base;
      const linkedBase = app.metadataCache?.getFirstLinkpathDest?.(basename, "");
      if (linkedBase?.path) push(linkedBase.path);
    } catch (_) {}

    for (const p of tried) {
      try {
        const af = app.vault.getAbstractFileByPath(p);
        if (!af || !isAvatarExt(af)) continue;
        const candidates = await avatarSourceCandidates(af, triedSources);
        if (candidates.length) {
          return { resourcePath: candidates[0].source, sourceKind: candidates[0].kind, candidates, file: af, tried, triedSources };
        }
      } catch (_) {}
    }
    return { resourcePath: "", sourceKind: "", candidates: [], file: null, tried, triedSources };
  }

  function isSkippedForSnippet(path) {
    const p = normPath(path);
    if (!p || !/\.md$/i.test(p)) return true;
    if (p.startsWith(".obsidian/")) return true;
    if (p.startsWith(".cursor/")) return true;
    if (p.startsWith("assets/")) return true;
    if (p.includes("00_Templates/")) return true;
    if (p.includes("/.specstory/")) return true;
    if (p.includes("/.history/")) return true;
    if (/\/README\.md$/i.test(p)) return true;
    if (normQuotePath && p === normQuotePath) return true;
    return false;
  }

  function inSnippetRoots(path) {
    const p = normPath(path);
    return snippetRoots.some((r) => {
      const prefix = r.endsWith("/") ? r : `${r}/`;
      return p.startsWith(prefix) || p === prefix.slice(0, -1);
    });
  }

  function stripFrontmatterBlock(text) {
    const s = String(text || "").trimStart();
    if (!s.startsWith("---")) return String(text || "");
    const end = s.indexOf("\n---", 3);
    if (end === -1) return String(text || "");
    return s.slice(end + 4).replace(/^\s+/, "");
  }

  /** 保留 Markdown（加粗、行内代码、wikilink 等），仅剔 frontmatter / 任务行 / 装饰线；供 Obsidian 渲染 */
  function extractMarkdownExcerpt(raw) {
    let body = stripFrontmatterBlock(raw);
    if (!body.trim()) return "";
    body = body.replace(/\r\n/g, "\n");
    body = body.replace(/```[\s\S]*?```/g, "\n\n");
    body = body.replace(/(^|\n)\s*\$\$[\s\S]*?\$\$\s*(?=\n|$)/g, "\n\n");
    const lines = body.split("\n");
    const kept = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        if (kept.length && kept[kept.length - 1] !== "") kept.push("");
        continue;
      }
      if (/^#{1,6}\s/.test(t)) continue;
      if (/^(---+|\*\*\*+)\s*$/.test(t)) continue;
      if (/^-\s*\[[ xX]\]/.test(t)) continue;
      kept.push(line);
    }
    let md = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    md = md.replace(/(^|\s)#[\w\u4e00-\u9fff/-]+(?=\s|$)/gm, "");
    if (md.replace(/\s/g, "").length < 12) return "";
    if (md.length > snippetMaxLen) {
      md = md.slice(0, snippetMaxLen);
      md = md.replace(/\n[^\n]*$/, "");
      md = md.replace(/\s+\S*$/, "") + "\n\n*…*";
    }
    return md;
  }

  async function ensureWeatherService() {
    const existing = globalThis.dashboardCore?.utils?.weatherService;
    if (existing) {
      recordHomeIdentityWeatherServiceLoad({ status: "ready", pending: null, service: existing, lastError: "" });
      return existing;
    }
    const state = getHomeIdentityServiceLoadState().weather;
    if (state.status === "ready" && state.service) return state.service;
    if (state.pending) return state.pending;
    if (state.status === "missing" || state.status === "failed") {
      if (state.lastError) globalThis.__noriaWeatherServiceLoadError = state.lastError;
      return null;
    }
    state.pending = (async () => {
      recordHomeIdentityWeatherServiceLoad({ status: "loading", pending: state.pending, lastError: "" });
      const code = await loadText(HOME_IDENTITY_WEATHER_SERVICE_PATH);
      if (!code) {
        recordHomeIdentityWeatherServiceLoad({
          status: "missing",
          pending: null,
          lastError: "weatherService source missing"
        });
        return null;
      }
      try {
        (0, eval)(String(code));
      } catch (e) {
        try {
          (new Function(String(code)))();
        } catch (e2) {
          recordHomeIdentityWeatherServiceLoad({
            status: "failed",
            pending: null,
            lastError: String(e2?.message || e?.message || e2 || e || "unknown")
          });
          return null;
        }
      }
      const service = globalThis.dashboardCore?.utils?.weatherService || null;
      if (!service) {
        recordHomeIdentityWeatherServiceLoad({
          status: "failed",
          pending: null,
          lastError: "weatherService missing after eval"
        });
        return null;
      }
      recordHomeIdentityWeatherServiceLoad({ status: "ready", pending: null, service, lastError: "" });
      return service;
    })();
    recordHomeIdentityWeatherServiceLoad({ status: "loading", pending: state.pending, lastError: "" });
    return state.pending;
  }

  function nextHomeWeatherFrame() {
    return new Promise((resolve) => {
      const host = (typeof window !== "undefined" && window) ? window : globalThis;
      const delay =
        (typeof host?.setTimeout === "function" ? host.setTimeout.bind(host) : null) ||
        (typeof setTimeout === "function" ? setTimeout : null);
      const frame =
        (typeof host?.requestAnimationFrame === "function" ? host.requestAnimationFrame.bind(host) : null) ||
        (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      if (delay) delay(finish, 120);
      if (frame) frame(finish);
      else if (delay) delay(finish, 0);
      else finish();
    });
  }

  const homeWeatherSetInterval = typeof setInterval === "function" ? setInterval : globalThis.setInterval;
  const homeWeatherClearInterval = typeof clearInterval === "function" ? clearInterval : globalThis.clearInterval;
  const homeWeatherSetTimeout = typeof setTimeout === "function" ? setTimeout : globalThis.setTimeout;
  const homeWeatherClearTimeout = typeof clearTimeout === "function" ? clearTimeout : globalThis.clearTimeout;

  function clearHomeWeatherTimer() {
    try {
      if (globalThis.__noriaHomeWeatherTimer) {
        if (typeof homeWeatherClearInterval === "function") homeWeatherClearInterval(globalThis.__noriaHomeWeatherTimer);
        globalThis.__noriaHomeWeatherTimer = null;
      }
      if (globalThis.__noriaHomeWeatherRetryTimer) {
        if (typeof homeWeatherClearTimeout === "function") homeWeatherClearTimeout(globalThis.__noriaHomeWeatherRetryTimer);
        globalThis.__noriaHomeWeatherRetryTimer = null;
      }
    } catch (_) {}
  }

  async function renderMarkdownInto(el, markdown, sourcePath) {
    while (el.firstChild) el.removeChild(el.firstChild);
    const md = String(markdown || "").trim();
    if (!md) return;
    el.classList?.add?.("markdown-preview-view");
    el.classList?.add?.("markdown-rendered");
    try {
      const obsidianApi =
        globalThis?.obsidian ||
        window?.obsidian ||
        ((typeof window?.require === "function") ? window.require("obsidian") : null);
      const MarkdownRenderer = obsidianApi?.MarkdownRenderer || globalThis?.MarkdownRenderer || window?.MarkdownRenderer;
      const CompCtor = obsidianApi?.Component || globalThis?.Component || window?.Component;
      if (!MarkdownRenderer) throw new Error("no MarkdownRenderer");
      const comp = CompCtor ? new CompCtor() : null;
      if (comp && typeof comp.load === "function") comp.load();
      const src = String(sourcePath || "").replace(/\\/g, "/");
      if (typeof MarkdownRenderer.render === "function") {
        await MarkdownRenderer.render(app, md, el, src, comp || undefined);
      } else if (typeof MarkdownRenderer.renderMarkdown === "function") {
        await MarkdownRenderer.renderMarkdown(md, el, src, comp || undefined);
      } else {
        throw new Error("no render fn");
      }
    } catch (_) {
      el.textContent = md;
    }
  }

  const raw = await loadText(quotePath);
  const lines = [];
  let inFront = false;
  for (const line of String(raw || "").split(/\n/)) {
    const t = line.trim();
    if (t === "---") {
      inFront = !inFront;
      continue;
    }
    if (inFront) continue;
    if (!t || /^#+\s/.test(t)) continue;
    const stripped = t.replace(/^[-*]\s+/, "").trim();
    if (stripped) lines.push(stripped);
  }
  const quote = lines.length ? lines[Math.floor(Math.random() * lines.length)] : "";
  const fallback = homeIdentityT("runtime.home.identity.quoteFallback");
  const shown = quote || fallback;

  const welcomeTop = container.createDiv();
  welcomeTop.addClass("dashboard-hero-strip__welcome-top");

  const row = welcomeTop.createDiv();
  row.addClass("dashboard-identity-strip");

  const av = row.createDiv();
  av.addClass("dashboard-identity-avatar-wrap");
  if (avatarPath) {
    const resolved = await resolveAvatarResource(avatarPath);
    const candidates = Array.isArray(resolved.candidates) ? resolved.candidates : [];
    if (candidates.length) {
      const img = av.createEl("img");
      img.addClass("dashboard-identity-avatar-img");
      img.setAttr("alt", displayName ? homeIdentityT("runtime.home.identity.avatarAlt", { name: displayName }) : "avatar");
      img.setAttr("decoding", "async");
      img.setAttr("loading", "eager");
      const setAvatarState = (state, candidate) => {
        av.setAttr("data-avatar-state", state);
        if (candidate?.kind) {
          av.setAttr("data-avatar-source-kind", candidate.kind);
          img.setAttr("data-avatar-source-kind", candidate.kind);
        }
      };
      const recordAvatarError = (state, reason, failedCandidate = null) => {
        globalThis.__noriaHomeAvatarLastError = {
          state,
          path: avatarPath,
          tried: resolved.tried,
          triedSources: resolved.triedSources,
          candidates: candidates.map((item) => ({ kind: item.kind, method: item.method || "", sourcePrefix: String(item.source || "").slice(0, 48) })),
          sourceKind: failedCandidate?.kind || resolved.sourceKind,
          failedCandidate: failedCandidate ? { kind: failedCandidate.kind, method: failedCandidate.method || "" } : null,
          reason
        };
      };
      const recordAvatarLoaded = (candidate) => {
        globalThis.__noriaHomeAvatarLastError = {
          state: "loaded",
          path: avatarPath,
          tried: resolved.tried,
          triedSources: resolved.triedSources,
          candidates: candidates.map((item) => ({ kind: item.kind, method: item.method || "", sourcePrefix: String(item.source || "").slice(0, 48) })),
          sourceKind: candidate?.kind || resolved.sourceKind,
          failedCandidate: null,
          reason: "loaded"
        };
      };
      const applyCandidate = async (index) => {
        const candidate = candidates[index];
        if (!candidate) {
          recordAvatarError("fallback", "all-image-sources-failed");
          renderAvatarFallback(av, "all-image-sources-failed");
          return;
        }
        setAvatarState(index === 0 ? "loading" : "retrying", candidate);
        let source = "";
        try {
          source = await resolveAvatarCandidateSource(candidate);
        } catch (e) {
          recordAvatarError("retrying", String(e?.message || e || "avatar-source-error"), candidate);
          await applyCandidate(index + 1);
          return;
        }
        if (!source) {
          recordAvatarError("retrying", "empty-image-source", candidate);
          await applyCandidate(index + 1);
          return;
        }
        img.onerror = async () => {
          recordAvatarError("retrying", "image-load-error", candidate);
          await applyCandidate(index + 1);
        };
        img.onload = () => {
          setAvatarState("loaded", candidate);
          recordAvatarLoaded(candidate);
        };
        img.setAttr("src", source);
      };
      await applyCandidate(0);
    } else {
      globalThis.__noriaHomeAvatarLastError = {
        state: "fallback",
        path: avatarPath,
        tried: resolved.tried,
        triedSources: resolved.triedSources,
        reason: "not-found-or-unsupported"
      };
      renderAvatarFallback(av, "not-found-or-unsupported");
    }
  } else {
    renderAvatarFallback(av);
  }

  const textCol = row.createDiv();
  textCol.addClass("dashboard-identity-textcol");

  if (greetingLabel) {
    const welcome = textCol.createDiv();
    welcome.addClass("dashboard-identity-welcome");
    welcome.textContent = homeIdentityT("runtime.home.identity.welcome", { name: greetingLabel });
  } else {
    const welcome = textCol.createDiv();
    welcome.addClass("dashboard-identity-welcome");
    welcome.textContent = homeIdentityT("runtime.home.identity.welcomeAnonymous");
  }

  const q = textCol.createDiv();
  q.addClass("dashboard-identity-quote");
  q.textContent = `「${shown}」`;
  q.setAttr("title", shown.length > 80 ? shown : "");

  const weatherHost = textCol.createDiv();
  weatherHost.addClass("dashboard-hero-weather-inline");
  const weatherLine = weatherHost.createDiv({ cls: "dashboard-hero-weather-inline__line", text: homeIdentityT("runtime.home.weather.loading") });
  const setWeatherAttr = (name, value) => {
    try {
      weatherLine.setAttr(name, String(value || "").trim());
    } catch (_) {}
  };
  const setWeatherState = (state, detail = "") => {
    setWeatherAttr("data-noria-weather-state", state);
    if (detail) {
      setWeatherAttr("data-noria-weather-error", detail);
    }
  };
  setWeatherState("loading");
  const todayIso = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const runtimeWeather = globalThis.__noriaRuntimeBridge?.weather || {};
  const existingWeatherService = globalThis.dashboardCore?.utils?.weatherService || null;
  const weatherEnabled = !!runtimeWeather.enabled;
  if (!weatherEnabled) {
    clearHomeWeatherTimer();
    setWeatherState("disabled");
    weatherLine.textContent = homeIdentityT("runtime.home.weather.disabled");
  } else {
    clearHomeWeatherTimer();
    const weatherSeq = Number(globalThis.__noriaHomeWeatherHydrationSeq || 0) + 1;
    globalThis.__noriaHomeWeatherHydrationSeq = weatherSeq;
    const isCurrentWeatherRun = () => Number(globalThis.__noriaHomeWeatherHydrationSeq || 0) === weatherSeq;
    const scheduleHomeWeatherHydration = async () => {
      setWeatherState("scheduled");
      await nextHomeWeatherFrame();
      if (!isCurrentWeatherRun()) return;
      const service = existingWeatherService || await ensureWeatherService();
      if (!isCurrentWeatherRun()) return;
      if (!service || typeof service.getWeatherForHome !== "function") {
        const why = String(globalThis.__noriaWeatherServiceLoadError || "").trim();
        setWeatherState("unavailable", why);
        weatherLine.textContent = homeIdentityT("runtime.home.weather.unavailableShort");
        weatherLine.title = why
          ? homeIdentityT("runtime.home.weather.serviceMissingWithReason", { reason: why })
          : homeIdentityT("runtime.home.weather.serviceMissing");
        return;
      }
      const renderWeather = async () => {
        if (!isCurrentWeatherRun()) return;
        try {
          const payload = typeof service.getWeatherForDate === "function"
            ? await service.getWeatherForDate(runtimeWeather, { targetDate: todayIso() })
            : await service.getWeatherForHome(runtimeWeather);
          if (!isCurrentWeatherRun()) return;
          const city = String(payload?.city || homeIdentityT("runtime.home.weather.autoLocation"));
          const mapped = String(payload?.mappedWeather || "").trim();
          const currentTemp = String(payload?.currentTemp || payload?.temp || "").trim();
          const tempMin = String(payload?.tempMin || "").trim();
          const tempMax = String(payload?.tempMax || "").trim();
          const iconMap = { "晴": "☀️", "暴晒": "🥵", "多云": "⛅", "阴": "☁️", "雨": "🌧️", "风": "🌬️", "雪": "❄️" };
          const tempRangeText = tempMin && tempMax ? `${tempMin}~${tempMax}℃` : "";
          const tempSingleText = !tempRangeText && (currentTemp || tempMax) ? `${currentTemp || tempMax}℃` : "";
          const icon = iconMap[mapped] || "🌤️";
          const humidity = String(payload?.humidity || "").trim();
          const ip = String(payload?.ip || "").trim();
          const lineText = [
            `${icon} ${city}`,
            currentTemp ? `${currentTemp}℃` : "",
            tempRangeText || (!currentTemp ? tempSingleText : ""),
            humidity ? homeIdentityT("runtime.home.weather.humidity", { value: humidity }) : ""
          ].filter(Boolean).join(" · ");
          setWeatherState(lineText ? "ready" : "unavailable");
          setWeatherAttr("data-noria-weather-city", city);
          setWeatherAttr("data-noria-weather-condition", mapped);
          setWeatherAttr("data-noria-weather-current-temp", currentTemp);
          setWeatherAttr("data-noria-weather-temp-min", tempMin);
          setWeatherAttr("data-noria-weather-temp-max", tempMax);
          setWeatherAttr("data-noria-weather-temp-range", tempRangeText.replace(/℃$/, ""));
          setWeatherAttr("data-noria-weather-humidity", humidity);
          setWeatherAttr("data-noria-weather-ip", ip);
          setWeatherAttr("data-noria-weather-source", payload?.source || "");
          weatherLine.textContent = lineText || homeIdentityT("runtime.home.weather.unavailableShort");
          weatherLine.title = lineText || "";

          const autoWriteDaily = runtimeWeather.autoWriteDaily !== false;
          if (autoWriteDaily && typeof service.readWriteDailyWeather === "function") {
            await service.readWriteDailyWeather(todayIso(), mapped, {
              skipIfExists: false,
              forceOverwrite: true,
              payload
            });
          }
          return true;
        } catch (e) {
          if (!isCurrentWeatherRun()) return;
          const reason = String(e?.message || e || homeIdentityT("runtime.home.weather.requestFailed"));
          setWeatherState("failed", reason);
          weatherLine.textContent = homeIdentityT("runtime.home.weather.unavailableShort");
          weatherLine.title = reason;
          return false;
        }
      };

      const initialWeatherReady = await renderWeather();
      if (!isCurrentWeatherRun()) return;
      if (!initialWeatherReady && typeof homeWeatherSetTimeout === "function") {
        globalThis.__noriaHomeWeatherRetryTimer = homeWeatherSetTimeout(() => {
          globalThis.__noriaHomeWeatherRetryTimer = null;
          renderWeather().catch(() => {});
        }, 15000);
      }
      const refreshMs = Math.max(5, Number(runtimeWeather.cacheMinutes) || 120) * 60 * 1000;
      if (typeof homeWeatherSetInterval === "function") {
        globalThis.__noriaHomeWeatherTimer = homeWeatherSetInterval(() => {
          renderWeather().catch(() => {});
        }, refreshMs);
      }
    };
    void scheduleHomeWeatherHydration().catch((e) => {
      if (!isCurrentWeatherRun()) return;
      const reason = String(e?.message || e || homeIdentityT("runtime.home.weather.requestFailed"));
      setWeatherState("failed", reason);
      weatherLine.textContent = homeIdentityT("runtime.home.weather.unavailableShort");
      weatherLine.title = reason;
    });
  }

  // 摘录区改为放置在概览四卡区域（避免与头像悬停复盘交互冲突）。

})();
