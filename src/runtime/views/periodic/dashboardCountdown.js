const host = (input && input.mount) ? input.mount : this.container;
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const countdownPath = String(bridge.paths?.importantDatesPath || "Noria/Countdowns.md");
const runtimeFallbackMessages = {
  "runtime.common.cancel": "Cancel",
  "runtime.common.save": "Save",
  "runtime.common.delete": "Delete",
  "runtime.common.add": "Add",
  "runtime.common.optional": "optional",
  "runtime.countdown.managerTitle": "Countdown manager",
  "runtime.countdown.managerSubtitle": "Add, edit, and delete countdowns here. Rows are editable immediately; Enter saves the current row.",
  "runtime.countdown.fieldDate": "Date",
  "runtime.countdown.fieldName": "Name",
  "runtime.countdown.fieldType": "Type",
  "runtime.countdown.fieldActions": "Actions",
  "runtime.countdown.empty": "No manual countdowns yet. Add one above.",
  "runtime.countdown.noticeInvalid": "Enter a valid date and name.",
  "runtime.countdown.noticeSaveFailed": "Save failed.",
  "runtime.countdown.noticeSaved": "Saved.",
  "runtime.countdown.noticeDeleteFailed": "Delete failed.",
  "runtime.countdown.noticeDeleted": "Deleted.",
  "runtime.countdown.noticeAddFailed": "Add failed.",
  "runtime.countdown.noticeAdded": "Added.",
  "runtime.countdown.distance": "Until",
  "runtime.countdown.remaining": "left",
  "runtime.countdown.dayUnit": "days",
  "runtime.countdown.none": "No countdowns yet.",
  "runtime.countdown.noneAction": "Add countdown",
  "runtime.countdown.add": "Add countdown",
  "runtime.countdown.tooltip": "Target date {date} · {days} days left"
};
const runtimeBridgeMessages = bridge.i18n?.messages || {};
const runtimeBridgeFallback = bridge.i18n?.fallback || {};
const runtimeT = (key, params = {}) => {
  const fromBridge = typeof bridge.t === "function" ? String(bridge.t(key, params) || "") : "";
  const raw = fromBridge && fromBridge !== key
    ? fromBridge
    : runtimeBridgeMessages[key] || runtimeBridgeFallback[key] || runtimeFallbackMessages[key] || String(key || "");
  return String(raw).replace(/\{([^}]+)\}/g, (_, name) => {
    const value = params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : "";
    return String(value == null ? "" : value);
  });
};
const noriaTasksForScope = async () => {
  try {
    const rows = await bridge.runtime?.tasksForScope?.("tasks", ctx);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
};
const DAY_MS = 86400000;
const today = new Date();
const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

const normalizeName = (x) => String(x || "").replace(/\s+/g, " ").trim();
const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const sortRowsByDate = (rows) => rows.slice().sort((a, b) => a.date.localeCompare(b.date));
const HOME_REFRESH_BUS_KEY = "__noriaHomeRefreshBus";
const REFRESH_KEY = "__dashboard_refresh_timer_countdown";
const getHomeRefreshBus = () => {
  const g = globalThis;
  return g && g[HOME_REFRESH_BUS_KEY] ? g[HOME_REFRESH_BUS_KEY] : null;
};
const getManagerUiKit = () => {
  const shared = globalThis?.dashboardCore?.components?.ui?.managerPanel || globalThis?.__noriaManagerUiKit;
  if (shared) return shared;
  return {
    styles: {
      overlay: "position:fixed;inset:0;background:rgba(15,23,42,.32);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;",
      panel: "background:linear-gradient(180deg,color-mix(in srgb,var(--background-primary) 97%, rgba(255,255,255,.2)),color-mix(in srgb,var(--background-primary) 99%, rgba(224,231,255,.08)));border:1px solid color-mix(in srgb,var(--background-modifier-border) 78%, rgba(99,102,241,.24));border-radius:16px;box-shadow:0 14px 36px rgba(15,23,42,.24);",
      input: "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.2);padding:0 8px;background:color-mix(in srgb,var(--background-primary) 96%, rgba(255,255,255,.22));color:var(--text-normal);font-size:.82em;outline:none;box-sizing:border-box;",
      btn: {
        neutral: "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:color-mix(in srgb,var(--background-primary) 90%, rgba(241,245,249,.85));color:var(--text-muted);font-size:.75em;font-weight:620;cursor:pointer;",
        primary: "height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(67,56,202,.3);background:color-mix(in srgb,var(--background-primary) 84%, rgba(224,231,255,.92));color:#3730a3;font-size:.75em;font-weight:700;cursor:pointer;",
        danger: "height:26px;padding:0 9px;border-radius:8px;border:1px solid rgba(148,163,184,.28);background:color-mix(in srgb,var(--background-primary) 88%, rgba(226,232,240,.9));color:color-mix(in srgb,var(--text-normal) 72%, rgba(71,85,105,.82));font-size:.75em;font-weight:700;cursor:pointer;"
      }
    }
  };
};
const scheduleRefresh = (delay = 140) => {
  try {
    if (bridge.refresh?.requestRefresh) {
      bridge.refresh.requestRefresh("home", "important-dates-write");
      return;
    }
    const g = globalThis;
    if (g[REFRESH_KEY]) clearTimeout(g[REFRESH_KEY]);
    g[REFRESH_KEY] = setTimeout(() => {
      g[REFRESH_KEY] = null;
      try { getHomeRefreshBus()?.emit?.("countdown", 20); } catch (_) {}
    }, delay);
  } catch (_) {}
};
const daysLeft = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((d.getTime() - today0.getTime()) / DAY_MS);
};
const taskSourcePath = (task) =>
  String(task?.path || task?.sourcePath || task?._page?.file?.path || task?.file?.path || task?.link?.path || "")
    .replace(/\\/g, "/");
const taskSourceLine = (task) => {
  for (const value of [task?.line, task?.lineNumber, task?.position?.start?.line, task?.position?.start?.lineNumber]) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
};

function dashboardLeafIsInSidePanel(leaf) {
  if (!leaf || typeof leaf.getRoot !== "function") return true;
  try {
    const r = leaf.getRoot();
    const ws = app.workspace;
    if (ws.leftSplit && r === ws.leftSplit) return true;
    if (ws.rightSplit && r === ws.rightSplit) return true;
  } catch (_) {}
  return false;
}

function dashboardPickLeafForMarkdownOpen() {
  const ws = app.workspace;
  if (!ws) return null;
  try {
    const al = ws.activeLeaf;
    if (al && !dashboardLeafIsInSidePanel(al)) {
      const vt = al.view && typeof al.view.getViewType === "function" ? al.view.getViewType() : "";
      if (vt === "markdown") return al;
    }
  } catch (_) {}
  try {
    return ws.getLeaf("tab");
  } catch (_) {
    try {
      return ws.getLeaf(false);
    } catch (e2) {
      return null;
    }
  }
}

const openCountdownSourceAtLine = async (item) => {
  const path = String(item?.path || "").replace(/\\/g, "/");
  if (!path) return false;
  const file = app.vault.getAbstractFileByPath(path);
  const leaf = file ? dashboardPickLeafForMarkdownOpen() : null;
  if (!file || !leaf || typeof leaf.openFile !== "function") return false;
  await leaf.openFile(file, { active: true });
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
  const ln = Math.max(0, Number(item?.line) || 0);
  try {
    if (leaf.view && typeof leaf.view.setEphemeralState === "function") {
      leaf.view.setEphemeralState({ line: ln });
    }
  } catch (_) {}
  try {
    const ed = leaf.view?.editor;
    if (ed && typeof ed.setCursor === "function") {
      ed.setCursor({ line: ln, ch: 0 });
      if (typeof ed.scrollIntoView === "function") {
        ed.scrollIntoView({ from: { line: ln, ch: 0 }, to: { line: ln, ch: 0 } }, true);
      }
    }
  } catch (_) {}
  return true;
};

const openCountdownItem = async (item, fallback) => {
  if (item?.kind === "due" && item?.path) {
    const opened = await openCountdownSourceAtLine(item);
    if (opened) return;
  }
  if (typeof fallback === "function") fallback();
};

const makeOverlayForm = (title, fields, onSubmit) => {
  const ui = getManagerUiKit();
  if (ui?.openPanel) {
    const inputs = {};
    let firstInput = null;
    ui.openPanel({
      title,
      size: "sm",
      render: ({ body, footer, close }) => {
        fields.forEach((f) => {
          const row = body.appendChild(document.createElement("label"));
          row.style.cssText = "display:flex;flex-direction:column;gap:5px;margin:0 0 9px 0;";
          const lb = row.appendChild(document.createElement("span"));
          lb.textContent = f.label;
          lb.style.cssText = "font-size:.78em;color:var(--text-muted);";
          const ip = ui.input({ value: f.value || "", placeholder: f.placeholder || "" });
          ip.style.width = "100%";
          row.appendChild(ip);
          inputs[f.key] = ip;
          if (!firstInput) firstInput = ip;
        });
        const cancel = ui.button(runtimeT("runtime.common.cancel"), "neutral");
        const ok = ui.button(runtimeT("runtime.common.save"), "primary");
        footer.append(cancel, ok);
        cancel.onclick = close;
        const runSubmit = async () => {
          const data = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v.value || "").trim()]));
          const done = await onSubmit(data);
          if (done) close();
        };
        ok.onclick = () => runSubmit();
        Object.values(inputs).forEach((ip) => {
          ip.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              runSubmit();
            }
          });
        });
      }
    });
    setTimeout(() => firstInput?.focus(), 0);
    return;
  }
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;";
  const panel = document.createElement("div");
  panel.style.cssText =
    "width:min(460px,92vw);background:var(--background-primary);border:1px solid rgba(99,102,241,.24);border-radius:12px;box-shadow:0 12px 34px rgba(15,23,42,.3);padding:12px 12px 10px;";
  overlay.appendChild(panel);
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText = "font-size:.95em;font-weight:760;color:var(--text-normal);margin:0 0 10px 0;";
  panel.appendChild(h);
  const inputs = {};
  fields.forEach((f) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;flex-direction:column;gap:4px;margin:0 0 8px 0;";
    const lb = document.createElement("span");
    lb.textContent = f.label;
    lb.style.cssText = "font-size:.78em;color:var(--text-muted);";
    const ip = document.createElement("input");
    ip.type = "text";
    ip.value = f.value || "";
    ip.placeholder = f.placeholder || "";
    ip.style.cssText =
      "height:30px;border-radius:8px;border:1px solid rgba(99,102,241,.26);background:var(--background-primary);color:var(--text-normal);padding:0 8px;font-size:.86em;outline:none;";
    row.append(lb, ip);
    panel.appendChild(row);
    inputs[f.key] = ip;
  });
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:8px;";
  const cancel = document.createElement("button");
  cancel.textContent = runtimeT("runtime.common.cancel");
  cancel.style.cssText = "height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(99,102,241,.22);background:transparent;cursor:pointer;";
  const ok = document.createElement("button");
  ok.textContent = runtimeT("runtime.common.save");
  ok.style.cssText =
    "height:30px;padding:0 14px;border-radius:8px;border:1px solid rgba(67,56,202,.35);background:rgba(99,102,241,.14);cursor:pointer;";
  actions.append(cancel, ok);
  panel.appendChild(actions);
  const close = () => overlay.remove();
  cancel.onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
  const runSubmit = async () => {
    const data = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v.value || "").trim()]));
    const done = await onSubmit(data);
    if (done) close();
  };
  ok.onclick = () => runSubmit();
  Object.values(inputs).forEach((ip) => {
    ip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runSubmit();
      }
    });
  });
  document.body.appendChild(overlay);
  const first = fields[0]?.key;
  if (first && inputs[first]) setTimeout(() => inputs[first].focus(), 0);
};

const parseImportantRows = async () => {
  const normalized = normPath(countdownPath);
  const file = app.vault.getAbstractFileByPath(normalized);
  let content = "";
  try {
    if (file) content = String(await app.vault.read(file) || "");
    else content = String(await ctx.io.load(countdownPath) || "");
  } catch (_) {
    try {
      content = String(await ctx.io.load(countdownPath) || "");
    } catch (_) {
      content = "";
    }
  }
  if (!content) return { rows: [], raw: "" };
  const rows = content
    .split("\n")
    .map((l, line) => ({ line, text: l.trim() }))
    .filter((entry) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(entry.text))
    .map((entry) => {
      const l = entry.text;
      const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
      return {
        date: cells[0],
        name: normalizeName(cells[1] || "(未命名)"),
        type: normalizeName(cells[2] || ""),
        kind: "manual",
        path: normalized,
        line: entry.line
      };
    })
    .filter((r) => isValidDate(r.date));
  return { rows, raw: String(content || "") };
};

const writeImportantRows = async (rows) => {
  const normalized = normPath(countdownPath);
  const outRows = rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `| ${r.date} | ${r.name || "(未命名)"} | ${r.type || ""} |`);
  const tableBlock = [
    "| 日期         | 名称       | 类型  |",
    "| ---------- | -------- | --- |",
    ...outRows,
    "|            |          |     |"
  ].join("\n");
  const buildNext = (current) => {
    const raw = String(current || "");
    const hdrIdx = raw.search(/^\|\s*日期\s*\|/m);
    if (hdrIdx >= 0) {
      const before = raw.slice(0, hdrIdx);
      const after = raw.slice(hdrIdx).split("\n");
      let end = 0;
      while (end < after.length && /^\|/.test(after[end].trim())) end++;
      return `${before}${tableBlock}\n${after.slice(end).join("\n")}`.replace(/\n{3,}/g, "\n\n");
    }
    return `${raw.replace(/\s*$/, "")}\n\n${tableBlock}\n`;
  };
  let file = app.vault.getAbstractFileByPath(normalized);
  if (!file) {
    const parts = normalized.split("/").filter(Boolean);
    parts.pop();
    let cursor = "";
    for (const part of parts) {
      cursor = cursor ? `${cursor}/${part}` : part;
      if (app.vault.adapter?.exists && !(await app.vault.adapter.exists(cursor))) {
        await app.vault.createFolder(cursor);
      }
    }
    try {
      file = await app.vault.create(normalized, buildNext("## 重要日期\n"));
      scheduleRefresh();
      return true;
    } catch (error) {
      const message = String(error?.message || error || "");
      file = app.vault.getAbstractFileByPath(normalized);
      if (!file && /File already exists|already exists/i.test(message)) {
        await Promise.resolve();
        file = app.vault.getAbstractFileByPath(normalized);
      }
      if (!file) throw error;
    }
  }
  if (typeof app.vault.process === "function") {
    await app.vault.process(file, buildNext);
  } else {
    const current = String(await app.vault.read(file) || "");
    const nextText = buildNext(current);
    if (nextText !== current) await app.vault.modify(file, nextText);
  }
  scheduleRefresh();
  return true;
};

const openCountdownManagePanel = async (onChanged) => {
  const ui = getManagerUiKit();
  const mkPanelBtn = (text, variant = "neutral") => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    const styles = ui.styles.btn;
    b.style.cssText = `${styles[variant] || styles.neutral}transition:border-color .12s ease,background .12s ease;`;
    b.onmouseenter = () => { b.style.filter = "brightness(1.03)"; };
    b.onmouseleave = () => { b.style.filter = ""; };
    b.onfocus = () => { b.style.boxShadow = "0 0 0 2px rgba(99,102,241,.22)"; };
    b.onblur = () => { b.style.boxShadow = ""; };
    return b;
  };
  const overlay = document.createElement("div");
  overlay.style.cssText = ui.styles.overlay;
  const panel = document.createElement("div");
  const narrowPanel = window.innerWidth < 680;
  panel.style.cssText = `width:${narrowPanel ? "min(520px, calc(100vw - 28px))" : "min(760px, calc(100vw - 28px))"};max-height:min(84vh,820px);display:flex;flex-direction:column;padding:14px 15px 12px;${ui.styles.panel}`;
  overlay.appendChild(panel);
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px 0;";
  const title = document.createElement("div");
  title.textContent = runtimeT("runtime.countdown.managerTitle");
  title.style.cssText = "font-size:1.01em;font-weight:800;color:var(--text-normal);letter-spacing:.01em;";
  const closeBtn = ui.iconButton ? ui.iconButton("x", "关闭") : mkPanelBtn("×", "neutral");
  closeBtn.style.width = "28px";
  closeBtn.style.height = "28px";
  closeBtn.style.padding = "0";
  closeBtn.style.lineHeight = "1";
  const close = () => {
    document.removeEventListener("keydown", onEsc, true);
    overlay.remove();
  };
  const onEsc = (ev) => {
    if (ev.key === "Escape") close();
  };
  closeBtn.onclick = close;
  head.append(title, closeBtn);
  panel.appendChild(head);
  const subtitle = document.createElement("div");
  subtitle.textContent = runtimeT("runtime.countdown.managerSubtitle");
  subtitle.style.cssText = "font-size:.78em;color:var(--text-muted);margin:0 0 10px 0;line-height:1.38;";
  panel.appendChild(subtitle);

  const addRow = document.createElement("div");
  addRow.style.cssText = narrowPanel
    ? "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 10px 0;align-items:center;"
    : "display:grid;grid-template-columns:120px minmax(0,1fr) 110px auto;gap:6px;margin:0 0 10px 0;align-items:center;";
  const mkInput = (ph) => {
    const ip = document.createElement("input");
    ip.type = "text";
    ip.placeholder = ph;
    ip.style.cssText = ui.styles.input;
    ip.onfocus = () => { ip.style.boxShadow = "0 0 0 2px rgba(99,102,241,.16)"; };
    ip.onblur = () => { ip.style.boxShadow = ""; };
    return ip;
  };
  const dateIp = mkInput("YYYY-MM-DD");
  const nameIp = mkInput(runtimeT("runtime.countdown.fieldName"));
  const typeIp = mkInput(`${runtimeT("runtime.countdown.fieldType")} (${runtimeT("runtime.common.optional")})`);
  const addBtn2 = mkPanelBtn(runtimeT("runtime.common.add"), "primary");
  addRow.append(dateIp, nameIp, typeIp, addBtn2);
  panel.appendChild(addRow);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:0;max-height:min(56vh,520px);overflow:auto;padding:1px 1px 1px 0;min-height:0;";
  const listHead = document.createElement("div");
  listHead.style.cssText = narrowPanel
    ? "display:none;"
    : "display:grid;grid-template-columns:120px minmax(0,1fr) 110px 96px;gap:6px;padding:0 1px 6px;color:var(--text-muted);font-size:.72em;font-weight:650;letter-spacing:.02em;";
  const hDate = document.createElement("div");
  hDate.textContent = runtimeT("runtime.countdown.fieldDate");
  const hName = document.createElement("div");
  hName.textContent = runtimeT("runtime.countdown.fieldName");
  const hType = document.createElement("div");
  hType.textContent = runtimeT("runtime.countdown.fieldType");
  const hAct = document.createElement("div");
  hAct.textContent = runtimeT("runtime.countdown.fieldActions");
  hAct.style.textAlign = "right";
  listHead.append(hDate, hName, hType, hAct);
  panel.appendChild(listHead);
  panel.appendChild(list);
  let manualRows = [];
  const rowKey = (r) => `${r.date}||${normalizeName(r.name)}`;

  const renderList = () => {
    list.innerHTML = "";
    if (!manualRows.length) {
      const empty = document.createElement("div");
      empty.textContent = runtimeT("runtime.countdown.empty");
      empty.style.cssText = "font-size:.84em;color:var(--text-muted);padding:6px 2px;";
      list.appendChild(empty);
      return;
    }
    manualRows.forEach((r) => {
      const key = rowKey(r);
      const row = document.createElement("div");
      row.style.cssText = narrowPanel
        ? "display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;"
        : "display:grid;grid-template-columns:120px minmax(0,1fr) 110px auto;gap:6px;align-items:center;padding:8px 1px;border-bottom:1px solid color-mix(in srgb,var(--background-modifier-border) 58%, transparent);background:transparent;";
      const mkInput = (val, ph) => {
        const ip = document.createElement("input");
        ip.type = "text";
        ip.value = val || "";
        ip.placeholder = ph;
        if (ui.enhanceInput) ui.enhanceInput(ip);
        else ip.style.cssText =
          "height:28px;border-radius:8px;border:1px solid rgba(99,102,241,.2);padding:0 8px;background:color-mix(in srgb,var(--background-primary) 96%, rgba(255,255,255,.22));color:var(--text-normal);font-size:.82em;outline:none;";
        ip.onfocus = () => { ip.style.boxShadow = "0 0 0 2px rgba(99,102,241,.16)"; };
        ip.onblur = () => { ip.style.boxShadow = ""; };
        return ip;
      };
      const dateIp2 = mkInput(r.date, "YYYY-MM-DD");
      const nameIp2 = mkInput(r.name, runtimeT("runtime.countdown.fieldName"));
      const typeIp2 = mkInput(r.type || "", runtimeT("runtime.countdown.fieldType"));
      const act = document.createElement("div");
      act.style.cssText = "display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;";
      const save = mkPanelBtn(runtimeT("runtime.common.save"), "primary");
      const del = mkPanelBtn(runtimeT("runtime.common.delete"), "danger");
      save.style.minWidth = "44px";
      del.style.minWidth = "44px";
      const runSave = async () => {
        const date = String(dateIp2.value || "").trim();
        const name = normalizeName(nameIp2.value);
        const type = normalizeName(typeIp2.value);
        if (!isValidDate(date) || !name) return new Notice(runtimeT("runtime.countdown.noticeInvalid"), 2200);
        const next = sortRowsByDate(manualRows.filter((x) => rowKey(x) !== key).concat([{ date, name, type }]));
        const ok = await writeImportantRows(next);
        if (!ok) return new Notice(runtimeT("runtime.countdown.noticeSaveFailed"), 2200);
        manualRows = next;
        renderList();
        new Notice(runtimeT("runtime.countdown.noticeSaved"), 1400);
        if (typeof onChanged === "function") await onChanged();
      };
      [dateIp2, nameIp2, typeIp2].forEach((ip) => {
        ip.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            runSave();
          }
        });
      });
      save.onclick = runSave;
      del.onclick = async () => {
        const next = sortRowsByDate(manualRows.filter((x) => rowKey(x) !== key));
        const ok = await writeImportantRows(next);
        if (!ok) return new Notice(runtimeT("runtime.countdown.noticeDeleteFailed"), 2200);
        manualRows = next;
        renderList();
        new Notice(runtimeT("runtime.countdown.noticeDeleted"), 1400);
        if (typeof onChanged === "function") await onChanged();
      };
      act.append(save, del);
      row.append(dateIp2, nameIp2, typeIp2, act);
      list.appendChild(row);
    });
  };
  const refreshPanel = async () => {
    const latest = await parseImportantRows();
    manualRows = sortRowsByDate(latest.rows);
    renderList();
  };

  const runAdd = async () => {
    const date = String(dateIp.value || "").trim();
    const name = normalizeName(nameIp.value);
    const type = normalizeName(typeIp.value);
    if (!isValidDate(date) || !name) return new Notice(runtimeT("runtime.countdown.noticeInvalid"), 2200);
    const next = sortRowsByDate([...manualRows, { date, name, type }]);
    const ok = await writeImportantRows(next);
    if (!ok) return new Notice(runtimeT("runtime.countdown.noticeAddFailed"), 2200);
    dateIp.value = "";
    nameIp.value = "";
    typeIp.value = "";
    manualRows = next;
    renderList();
    new Notice(runtimeT("runtime.countdown.noticeAdded"), 1400);
    if (typeof onChanged === "function") await onChanged();
  };
  addBtn2.onclick = runAdd;
  [dateIp, nameIp, typeIp].forEach((ip) =>
    ip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runAdd();
      }
    })
  );

  await refreshPanel();

  overlay.onclick = (ev) => {
    if (ev.target === overlay) close();
  };
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onEsc, true);
  setTimeout(() => dateIp.focus(), 0);
};

const parseDueTasks = async () => {
  const all = await noriaTasksForScope();
  return all
    .filter((t) => !t.completed && t.due && t.text && /#due\b/i.test(String(t.text || "")))
    .map((t) => {
      const date = String(t.due).slice(0, 10);
      const path = taskSourcePath(t);
      const name = normalizeName(
        String(t.text || "")
          .replace(/#due\b/gi, "")
          .replace(/#proj:[^\s]+/gi, "")
          .replace(/#habit\b/gi, "")
          .replace(/#[一-龥\w/-]+/g, "")
          .replace(/(?:📅|⏳|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/g, "")
          .replace(/\s{2,}/g, " ")
      ) || "(未命名任务)";
      return { date, name, priority: 1, kind: "due", path, line: taskSourceLine(t), rawLine: String(t.rawLine || "") };
    });
};

const progressFillPercent = (d) => {
  const maxWindow = 90;
  return Math.max(8, Math.min(100, Math.round((1 - Math.min(d, maxWindow) / maxWindow) * 100)));
};

const palette = (d) =>
  d <= 3
    ? {
        remainingColor: "color-mix(in srgb, var(--text-normal) 74%, rgb(185 28 28))",
        rowSurface: "linear-gradient(90deg, color-mix(in srgb, var(--background-primary) 80%, rgb(254 202 202)) 0%, color-mix(in srgb, var(--background-primary) 91%, rgb(254 226 226)) 62%, color-mix(in srgb, var(--background-primary) 96%, rgb(254 242 242)) 100%)",
        progressTrack: "color-mix(in srgb, var(--background-primary) 76%, rgb(254 226 226))",
        progressFill: "linear-gradient(90deg, rgb(248 113 113), rgb(244 63 94))"
      }
    : d <= 14
      ? {
          remainingColor: "color-mix(in srgb, var(--text-normal) 76%, rgb(146 64 14))",
          rowSurface: "linear-gradient(90deg, color-mix(in srgb, var(--background-primary) 78%, rgb(254 240 138)) 0%, color-mix(in srgb, var(--background-primary) 90%, rgb(253 224 71)) 62%, color-mix(in srgb, var(--background-primary) 96%, rgb(254 249 195)) 100%)",
          progressTrack: "color-mix(in srgb, var(--background-primary) 74%, rgb(254 240 138))",
          progressFill: "linear-gradient(90deg, rgb(251 191 36), rgb(245 158 11))"
        }
      : {
          remainingColor: "color-mix(in srgb, var(--text-normal) 74%, rgb(4 120 87))",
          rowSurface: "linear-gradient(90deg, color-mix(in srgb, var(--background-primary) 79%, rgb(167 243 208)) 0%, color-mix(in srgb, var(--background-primary) 91%, rgb(110 231 183)) 62%, color-mix(in srgb, var(--background-primary) 96%, rgb(209 250 229)) 100%)",
          progressTrack: "color-mix(in srgb, var(--background-primary) 75%, rgb(167 243 208))",
          progressFill: "linear-gradient(90deg, rgb(52 211 153), rgb(16 185 129))"
        };

const renderCountdownTray = async () => {
  host.empty?.();
  const [{ rows: importantRows }, dueTasks] = await Promise.all([
    parseImportantRows(),
    parseDueTasks()
  ]);
  const merged = [
    ...importantRows.map((x) => ({ ...x, priority: 0, kind: "manual" })),
    ...dueTasks
  ].filter((x) => isValidDate(x.date));

  const best = new Map();
  for (const it of merged) {
    const key = `${it.date}||${it.name}`;
    if (!best.has(key) || it.priority < best.get(key).priority) best.set(key, it);
  }
  const upcoming = [...best.values()]
    .map((x) => ({ ...x, d: daysLeft(x.date) }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => a.d - b.d);

  const box = host.createDiv();
  box.addClass("dashboard-countdown-tray");
  box.style.cssText = "display:flex;flex-direction:column;gap:7px;";
  const openManager = () => {
    openCountdownManagePanel(async () => {
      await renderCountdownTray();
      const bus = getHomeRefreshBus();
      if (bus && typeof bus.emit === "function") bus.emit("countdown", 20);
    });
  };
  if (upcoming.length === 0) {
    const empty = box.createDiv();
    empty.addClass("dashboard-countdown-empty");
    const copy = empty.createDiv();
    copy.addClass("dashboard-countdown-empty-copy");
    const text = copy.createEl("span", { text: runtimeT("runtime.countdown.none") });
    text.addClass("dashboard-countdown-empty-text");
    const action = copy.createEl("button", { text: runtimeT("runtime.countdown.noneAction") });
    action.type = "button";
    action.addClass("dashboard-countdown-empty-action");
    action.onclick = openManager;
  }

  for (const x of upcoming.slice(0, 6)) {
    const c = palette(x.d);
    const pct = progressFillPercent(x.d);
    const tip = runtimeT("runtime.countdown.tooltip", { date: x.date, days: x.d });

    const card = box.createEl("button");
    card.type = "button";
    card.addClass("dashboard-countdown-card");
    card.style.setProperty("--countdown-remaining-color", c.remainingColor);
    card.style.setProperty("--countdown-row-surface", c.rowSurface);
    card.style.setProperty("--countdown-progress-track", c.progressTrack);
    card.style.setProperty("--countdown-progress-fill", c.progressFill);
    card.style.setProperty("--countdown-progress-width", `${pct}%`);
    card.setAttr("data-countdown-layout", "hero-days");
    card.setAttr("data-countdown-visual", "hero-days-v2");
    card.setAttr("data-countdown-urgency", x.d <= 3 ? "urgent" : x.d <= 14 ? "soon" : "later");
    card.setAttr("data-countdown-kind", x.kind || "manual");
    card.setAttr("data-countdown-date", x.date);
    card.setAttr("data-noria-action-kind", x.kind === "due" ? "open-countdown-source" : "manage-countdown");
    card.setAttr("data-noria-action-source", "home-countdown");
    if (x.path) {
      card.setAttr("data-countdown-source-path", x.path);
      card.setAttr("data-countdown-source-line", String(x.line || 0));
    }
    card.setAttr("title", tip);
    card.setAttr("aria-label", `${x.name} · ${tip}`);
    card.onclick = () => openCountdownItem(x, openManager);
    const row = card.createDiv();
    row.addClass("dashboard-countdown-row");
    const titleRun = row.createDiv();
    titleRun.addClass("dashboard-countdown-title");
    const nameEl = titleRun.createEl("span", { text: x.name });
    nameEl.addClass("dashboard-countdown-name");
    const remaining = row.createEl("span");
    remaining.addClass("dashboard-countdown-days-figure");
    remaining.setAttr("aria-label", `${runtimeT("runtime.countdown.remaining")} ${x.d} ${runtimeT("runtime.countdown.dayUnit")}`);
    remaining.createEl("span", { text: String(x.d) }).addClass("dashboard-countdown-days-number");
    const label = remaining.createEl("span");
    label.addClass("dashboard-countdown-days-label");
    label.createEl("span", { text: runtimeT("runtime.countdown.remaining") }).addClass("dashboard-countdown-days-prefix");
    label.createEl("span", { text: runtimeT("runtime.countdown.dayUnit") }).addClass("dashboard-countdown-days-unit");
    const progress = card.createDiv();
    progress.addClass("dashboard-countdown-progress");
    progress.createDiv().addClass("dashboard-countdown-progress-fill");
  }

  const actionsHost = input?.actionsHost && typeof input.actionsHost.createEl === "function" ? input.actionsHost : null;
  if (actionsHost && typeof actionsHost.querySelectorAll === "function") {
    actionsHost.querySelectorAll(".dashboard-countdown-add-btn").forEach((el) => el.remove());
  }
  const addBtn = (actionsHost || box).createEl("button", { text: "+" });
  addBtn.type = "button";
  addBtn.setAttr("title", runtimeT("runtime.countdown.add"));
  addBtn.addClass("dashboard-guide-icon-btn");
  addBtn.addClass("dashboard-guide-toolbar-plus");
  addBtn.addClass("dashboard-countdown-add-btn");
  if (!actionsHost) {
    addBtn.style.marginTop = "6px";
    addBtn.style.alignSelf = "flex-end";
  }
  addBtn.onclick = openManager;
};

await renderCountdownTray();
const bus = getHomeRefreshBus();
if (bus && typeof bus.on === "function") {
  bus.on("countdown", renderCountdownTray);
}
