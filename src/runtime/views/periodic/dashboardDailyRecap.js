/**
 * 主页「今日复盘」：按工作流分步、单 pane，写入 SSOT = 当日日记正文块。
 * 依赖 globalThis.dashboardCore.utils.diaryDayBlocks（主页会预加载；否则下方 ensure）。
 */
const recapInput = input || {};
const bridge = recapInput?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const periodicRecapT = (key, params = {}) => {
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
const host =
  (recapInput && recapInput.mount) ? recapInput.mount : (typeof this !== "undefined" && this && this.container) ? this.container : (ctx.container || null);
if (!host || typeof host.createDiv !== "function") {
  ctx.paragraph(periodicRecapT("runtime.home.noContainer"));
  return;
}
const periodicRecapLabel = (domain, value, fallback = value) => {
  try {
    if (bridge?.runtime && typeof bridge.runtime.displayLabel === "function") {
      return bridge.runtime.displayLabel(domain, value, fallback);
    }
  } catch (_) {}
  return fallback == null ? "" : String(fallback);
};

const DIARY_UTILS_REL = ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js";
const LUCIDE_UTILS_REL = ".obsidian/plugins/noria/views/dashboard/core/utils/dashboard-lucide-inline.js";

const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");

async function loadText(path) {
  const p = norm(path);
  try {
    const txt = await ctx.io.load(p);
    if (txt) return String(txt);
  } catch (_) {}
  try {
    return String(await app.vault.adapter.read(p) || "");
  } catch (_) {
    return "";
  }
}

async function ensureDiaryDayBlocks() {
  if (globalThis.dashboardCore?.utils?.diaryDayBlocks) return globalThis.dashboardCore.utils.diaryDayBlocks;
  const code = await loadText(DIARY_UTILS_REL);
  if (!code) {
    bridge.runtime?.notice?.("runtime.periodic.dailyRecap.blocksMissing", {}, 5000)
      || new Notice(periodicRecapT("runtime.periodic.dailyRecap.blocksMissing"), 5000);
    return null;
  }
  (0, eval)(String(code));
  return globalThis.dashboardCore?.utils?.diaryDayBlocks || null;
}

async function ensureLucideInline() {
  if (globalThis.dashboardCore?.utils?.applyLucideIcon) return;
  const code = await loadText(LUCIDE_UTILS_REL);
  if (code) (0, eval)(String(code));
}

function setSafeIcon(el, iconId) {
  const fn = globalThis.dashboardCore?.utils?.applyLucideIcon;
  if (typeof fn === "function") {
    fn(el, iconId);
    return true;
  }
  el.textContent = "✓";
  return false;
}

const RECAP_STEPS = [
  { id: "inbox", label: "Inbox", iconId: "inbox", aria: periodicRecapT("runtime.periodic.dailyRecap.stepInboxAria") },
  { id: "state", label: periodicRecapT("runtime.periodic.dailyRecap.stepState"), iconId: "gauge", aria: periodicRecapT("runtime.periodic.dailyRecap.stepStateAria") },
  { id: "gdd", label: "GDD", iconId: "sparkles", aria: periodicRecapT("runtime.periodic.dailyRecap.stepGddAria") },
  { id: "thought", label: periodicRecapT("runtime.periodic.dailyRecap.stepThought"), iconId: "pen-line", aria: periodicRecapT("runtime.periodic.dailyRecap.stepThoughtAria") }
];
const requestedStepIdsRaw = Array.isArray(recapInput.steps)
  ? recapInput.steps
  : Array.isArray(recapInput.recapSteps)
    ? recapInput.recapSteps
    : null;
const requestedStepIds = requestedStepIdsRaw
  ? new Set(requestedStepIdsRaw.map((x) => String(x || "").trim()).filter(Boolean))
  : null;
const activeRecapSteps = requestedStepIds
  ? RECAP_STEPS.filter((x) => requestedStepIds.has(x.id))
  : RECAP_STEPS.slice();
if (activeRecapSteps.length === 0) activeRecapSteps.push(...RECAP_STEPS);
const recapLayout = String(recapInput.layout || recapInput.recapLayout || "").trim();
const hideStepChrome = activeRecapSteps.length === 1 || recapLayout === "single";

const STATE_GROUPS = [
  {
    key: "weather",
    titleKey: "runtime.periodic.status.weather",
    options: [
      { value: "晴", label: "☀️" },
      { value: "暴晒", label: "🥵" },
      { value: "多云", label: "⛅" },
      { value: "阴", label: "☁️" },
      { value: "雨", label: "🌧️" },
      { value: "风", label: "🌬️" },
      { value: "雪", label: "❄️" }
    ]
  },
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
  }
];

(async () => {
  const U = await ensureDiaryDayBlocks();
  if (!U) return;
  await ensureLucideInline();

  const diaryPath = U.getTodayDiaryPath();
  let activeStepId =
    activeRecapSteps.some((x) => x.id === String(recapInput.initialStep || "").trim())
      ? String(recapInput.initialStep).trim()
      : activeRecapSteps[0].id;

  const wrap = host.createDiv();
  wrap.addClass("dashboard-recap-panel");
  if (recapLayout) wrap.addClass(`dashboard-recap-panel--${recapLayout}`);
  if (hideStepChrome) wrap.addClass("dashboard-recap-panel--single-step");
  wrap.setAttr("title", periodicRecapT("runtime.periodic.dailyRecap.panelHint", { path: diaryPath }));

  const bodyRow = wrap.createDiv();
  bodyRow.addClass("dashboard-recap-body");
  const stepRow = bodyRow.createDiv();
  stepRow.addClass("dashboard-recap-steps");
  stepRow.addClass("dashboard-recap-steps--vertical");
  if (hideStepChrome) {
    stepRow.addClass("dashboard-recap-steps--hidden");
    stepRow.style.display = "none";
  }
  stepRow.setAttr("role", "tablist");
  stepRow.setAttr("aria-orientation", "vertical");
  stepRow.setAttr("title", periodicRecapT("runtime.periodic.dailyRecap.stepHint"));

  const paneWrap = bodyRow.createDiv();
  paneWrap.addClass("dashboard-recap-pane-wrap");

  let diaryRaw = "";
  let fillFlags = {};

  async function readDiary() {
    const f = app.vault.getAbstractFileByPath(diaryPath);
    if (!f) {
      diaryRaw = "";
      fillFlags = U.getRecapFillFlags("");
      return null;
    }
    diaryRaw = await app.vault.read(f);
    fillFlags = U.getRecapFillFlags(diaryRaw);
    return f;
  }

  async function ensureDiaryFile() {
    let f = app.vault.getAbstractFileByPath(diaryPath);
    if (!f) {
      const recapLocale = String(bridge.locale || bridge.i18n?.locale || "en");
      const reviewHeading = /^zh(?:-|$)/i.test(recapLocale) ? "复盘" : "Review";
      const seed = `---\ntags:\n  - daily-plan\n---\n\n## ${reviewHeading}\n\n`;
      let created = null;
      try {
        created = await app.vault.create(diaryPath, seed);
      } catch (error) {
        const message = String(error?.message || error || "");
        if (!/File already exists|already exists/i.test(message)) throw error;
      }
      f = app.vault.getAbstractFileByPath(diaryPath) || created;
    }
    if (!f) throw new Error(`Diary file unavailable: ${diaryPath}`);
    return f;
  }

  async function writeDiary(mutator) {
    const f = await ensureDiaryFile();
    let t = "";
    const applyMutation = (current) => {
      const source = String(current || "");
      const transformed = mutator(source);
      t = transformed == null ? source : String(transformed);
      return t;
    };
    if (typeof app.vault.process === "function") {
      await app.vault.process(f, applyMutation);
    } else {
      const current = await app.vault.read(f);
      applyMutation(current);
      if (t !== String(current || "")) await app.vault.modify(f, t);
    }
    diaryRaw = t;
    fillFlags = U.getRecapFillFlags(diaryRaw);
    try {
      globalThis.__noriaRuntimeBridge?.refresh?.requestRefresh?.("review", "daily-recap-write");
    } catch (_) {}
  }

  await readDiary();

  function stepIndex(id) {
    const i = activeRecapSteps.findIndex((x) => x.id === id);
    return i < 0 ? 0 : i;
  }

  function focusStepAt(delta) {
    const ids = activeRecapSteps.map((x) => x.id);
    const i = stepIndex(activeStepId);
    const next = Math.max(0, Math.min(ids.length - 1, i + delta));
    activeStepId = ids[next];
    renderStepChrome();
    renderPane();
  }

  function renderStepChrome() {
    const keepStepFocus = stepRow.contains(document.activeElement);
    stepRow.empty();
    if (hideStepChrome) return;
    activeRecapSteps.forEach((s) => {
      const b = stepRow.createEl("button");
      b.type = "button";
      b.addClass("dashboard-recap-step");
      if (s.id === "inbox") b.addClass("dashboard-recap-step--inbox");
      b.setAttr("role", "tab");
      b.setAttr("aria-label", s.aria);
      b.setAttr("aria-selected", s.id === activeStepId ? "true" : "false");
      b.tabIndex = s.id === activeStepId ? 0 : -1;
      if (s.id === activeStepId) b.addClass("is-active");

      if (s.id === "inbox") {
        const icon = b.createSpan();
        icon.addClass("dashboard-recap-step__icon");
        setSafeIcon(icon, "inbox");
      } else {
        const lb = b.createSpan();
        lb.addClass("dashboard-recap-step__label");
        lb.textContent = s.label;
      }

      const activate = () => {
        activeStepId = s.id;
        renderStepChrome();
        renderPane();
      };

      b.onclick = () => activate();

      b.onkeydown = (ev) => {
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
          ev.preventDefault();
          focusStepAt(1);
        } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
          ev.preventDefault();
          focusStepAt(-1);
        }
      };

      if (s.id === activeStepId) {
        queueMicrotask(() => {
          const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
          try {
            b.scrollIntoView({ behavior: smooth ? "smooth" : "auto", inline: "center", block: "nearest" });
          } catch (_) {
            b.scrollIntoView({ inline: "center", block: "nearest" });
          }
        });
      }
    });

    if (keepStepFocus) {
      queueMicrotask(() => stepRow.querySelector("button.is-active")?.focus());
    }
  }

  function attachInlineSubmitRow(box, opts, onCommit) {
    const row = box.createDiv();
    row.addClass("dashboard-recap-inline-input");
    const input = row.createEl("input");
    input.type = "text";
    input.className = "dashboard-recap-input";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.enterkeyhint) input.setAttribute("enterkeyhint", opts.enterkeyhint);

    const submit = row.createEl("button");
    submit.type = "button";
    submit.addClass("dashboard-recap-icon-submit");
    submit.setAttr("aria-label", opts.submitAria || periodicRecapT("runtime.periodic.dailyRecap.submit"));
    if (!setSafeIcon(submit, "check")) submit.textContent = "✓";

    const run = async () => {
      const v = String(input.value || "").trim();
      if (!v) return;
      await onCommit(v);
      input.value = "";
      renderStepChrome();
    };

    submit.onclick = () => run();
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") run();
    };
  }

  function attachRailSaveButton(railHost, title, onSave) {
    const btn = railHost.createEl("button");
    btn.type = "button";
    btn.addClass("dashboard-recap-icon-submit");
    btn.addClass("dashboard-recap-icon-submit--rail");
    btn.setAttr("aria-label", title || periodicRecapT("runtime.periodic.dailyRecap.save"));
    btn.setAttr("title", title || periodicRecapT("runtime.periodic.dailyRecap.save"));
    if (!setSafeIcon(btn, "check")) btn.textContent = "✓";
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await onSave();
      } finally {
        btn.disabled = false;
      }
    };
    return btn;
  }

  /** --- Pane builders --- */
  function renderPane() {
    paneWrap.empty();
    if (activeStepId === "inbox") return renderPaneInbox();
    if (activeStepId === "state") return renderPaneState();
    if (activeStepId === "gdd") return renderPaneGdd();
    return renderPaneThought();
  }

  function renderPaneInbox() {
    const box = paneWrap.createDiv();
    box.addClass("dashboard-recap-pane");
    box.addClass("dashboard-recap-pane--inbox");
    const split = box.createDiv();
    split.addClass("dashboard-recap-save-split");
    split.addClass("dashboard-recap-save-split--fill");
    const left = split.createDiv();
    left.addClass("dashboard-recap-fill-main");
    left.style.cssText = "min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;gap:8px;";
    const right = split.createDiv();
    right.addClass("dashboard-recap-save-rail");
    const ta = left.createEl("textarea");
    ta.addClass("dashboard-gdd-textarea");
    ta.addClass("dashboard-recap-textarea-fill");
    ta.rows = 3;
    ta.placeholder = periodicRecapT("runtime.periodic.dailyRecap.inboxPlaceholder");
    const doSave = async () => {
      const raw = String(ta.value || "").trim();
      if (!raw) return;
      const oneLine = raw.replace(/\s*\n+\s*/g, " / ").trim();
      if (!oneLine) return;
      await writeDiary((t) => U.appendDiaryInboxLine(t, oneLine));
      ta.value = "";
      renderStepChrome();
    };
    attachRailSaveButton(right, periodicRecapT("runtime.periodic.dailyRecap.saveInbox"), doSave);
    ta.onkeydown = (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        doSave();
      }
    };
  }

  function renderPaneState() {
    const parsed = typeof U.parseDailyState === "function" ? U.parseDailyState(diaryRaw) : U.parseDailyStateFromBody(diaryRaw);
    const state = {
      weather: parsed.weather,
      mood: parsed.mood,
      energy: parsed.energy,
      focus: parsed.focus
    };
    let saving = false;

    const box = paneWrap.createDiv();
    box.addClass("dashboard-recap-pane");
    box.addClass("dashboard-recap-pane--state");

    const grid = box.createDiv();
    grid.addClass("dashboard-recap-state-grid");

    const setField = async (key, value) => {
      if (saving) return;
      saving = true;
      try {
        state[key] = value;
        await writeDiary((t) => U.upsertDailyStateSection(t, state));
      } finally {
        saving = false;
      }
      renderStepChrome();
      if (activeStepId === "state") renderPane();
    };

    for (const g of STATE_GROUPS) {
      const card = grid.createDiv();
      card.addClass("dashboard-recap-state-card");
      if (g.key === "weather") card.addClass("dashboard-recap-state-card--weather");
      if (g.key === "mood") card.addClass("dashboard-recap-state-card--mood");
      const row = card.createDiv();
      row.addClass("dashboard-recap-state-row");
      row.createSpan({ cls: "dashboard-recap-state-title-inline", text: periodicRecapT(g.titleKey) });
      const opts = row.createDiv();
      opts.addClass("dashboard-recap-pills");
      if (g.key === "weather") opts.addClass("dashboard-recap-pills--weather");
      else if (g.key === "mood") opts.addClass("dashboard-recap-pills--mood");
      else opts.addClass("dashboard-recap-pills--hscroll");
      opts.setAttr(
        "title",
        g.key === "weather"
          ? periodicRecapT("runtime.periodic.dailyRecap.weatherHoverHint")
          : periodicRecapT("runtime.periodic.dailyRecap.choiceScrollHint")
      );
      for (const op of g.options) {
        const btn = opts.createEl("button");
        btn.type = "button";
        btn.addClass("dashboard-recap-pill");
        btn.textContent = op.label;
        const display = periodicRecapLabel(g.key, op.value, op.value);
        btn.setAttr("aria-label", display);
        btn.setAttr("title", display);
        if (state[g.key] === op.value) btn.addClass("is-active");
        btn.onclick = async () => {
          await setField(g.key, op.value);
        };
      }
    }

    const energyCard = grid.createDiv();
    energyCard.addClass("dashboard-recap-state-card");
    energyCard.addClass("dashboard-recap-state-card--energy");
    const erow = energyCard.createDiv();
    erow.addClass("dashboard-recap-state-row");
    erow.createSpan({ cls: "dashboard-recap-state-title-inline", text: periodicRecapT("runtime.periodic.status.energy") });
    const track = erow.createDiv();
    track.addClass("dashboard-recap-energy");
    track.addClass("dashboard-recap-energy--compact");
    const level = Math.max(0, Math.min(5, Number(state.energy) || 0));
    for (let i = 1; i <= 5; i += 1) {
      const cell = track.createEl("button");
      cell.type = "button";
      cell.addClass("dashboard-recap-energy-cell");
      const icon = cell.createSpan();
      icon.addClass("dashboard-recap-energy-icon");
      icon.textContent = i === 1 ? "🪫" : "🔋";
      if (i <= level) cell.addClass("is-on");
      cell.setAttr("data-energy-level", String(i));
      cell.title = `${i}/5`;
        cell.setAttr("aria-label", periodicRecapT("runtime.periodic.energyValue", { value: i }));
      cell.onclick = async () => {
        await setField("energy", String(i));
      };
    }
  }

  function renderPaneGdd() {
    const g = U.parseGdd(diaryRaw);
    const box = paneWrap.createDiv();
    box.addClass("dashboard-recap-pane");
    box.addClass("dashboard-recap-pane--gdd");
    const split = box.createDiv();
    split.addClass("dashboard-recap-save-split");
    const left = split.createDiv();
    left.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:8px;";
    const right = split.createDiv();
    right.addClass("dashboard-recap-save-rail");
    const grid = box.createDiv();
    grid.addClass("dashboard-recap-gdd-grid");
    left.appendChild(grid);

    const mk = (label, full) => {
      const col = grid.createDiv();
      if (full) col.addClass("dashboard-recap-gdd-full");
      const ta = col.createEl("textarea");
      ta.addClass("dashboard-gdd-textarea");
      ta.setAttr("aria-label", label);
      ta.placeholder = periodicRecapT("runtime.periodic.dailyRecap.fieldPlaceholder", { label });
      ta.rows = 1;
      return ta;
    };

    const taHi = mk(periodicRecapT("runtime.periodic.dailyRecap.gddHighlight"));
    taHi.value = g.hi;
    const taDev = mk(periodicRecapT("runtime.periodic.dailyRecap.gddDeviation"));
    taDev.value = g.dev;
    const taBlk = mk(periodicRecapT("runtime.periodic.dailyRecap.gddBlocker"), true);
    taBlk.value = g.blk;

    const doSave = async () => {
      const s = { hi: taHi.value, dev: taDev.value, blk: taBlk.value };
      await writeDiary((t) => U.upsertGdd(t, s));
      renderStepChrome();
    };
    attachRailSaveButton(right, periodicRecapT("runtime.periodic.dailyRecap.saveGdd"), doSave);
    [taHi, taDev, taBlk].forEach((ta) => {
      ta.onkeydown = (ev) => {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          doSave();
        }
      };
    });
  }

  function renderPaneThought() {
    const body = U.parseThought(diaryRaw);
    const box = paneWrap.createDiv();
    box.addClass("dashboard-recap-pane");
    box.addClass("dashboard-recap-pane--thought");
    const split = box.createDiv();
    split.addClass("dashboard-recap-save-split");
    split.addClass("dashboard-recap-save-split--fill");
    const left = split.createDiv();
    left.addClass("dashboard-recap-fill-main");
    left.style.cssText = "min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;gap:8px;";
    const right = split.createDiv();
    right.addClass("dashboard-recap-save-rail");
    const ta = left.createEl("textarea");
    ta.addClass("dashboard-gdd-textarea");
    ta.addClass("dashboard-recap-textarea-fill");
    ta.rows = 3;
    ta.placeholder = periodicRecapT("runtime.periodic.dailyRecap.thoughtPlaceholder");
    ta.value = body;
    const doSave = async () => {
      await writeDiary((t) => U.upsertThoughtSection(t, ta.value));
      renderStepChrome();
    };
    attachRailSaveButton(right, periodicRecapT("runtime.periodic.dailyRecap.saveThought"), doSave);
    ta.onkeydown = (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        doSave();
      }
    };
  }

  renderStepChrome();
  renderPane();
})();
