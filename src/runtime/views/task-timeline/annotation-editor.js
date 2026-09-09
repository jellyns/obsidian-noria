(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const COLORS = ["#8ab4f8", "#86b99d", "#c4b5fd", "#f6c77a", "#df9d88", "#94a3b8"];
  const text = value => String(value == null ? "" : value).trim();
  const isChinese = locale => locale === "zh" || locale === "zh-CN";

  function parseDate(value) {
    const day = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  }

  function prepareDraft(raw = {}) {
    const title = text(raw.title);
    if (!title) return { error: "name" };
    const start = parseDate(raw.start);
    const point = raw.type === "point";
    const end = point ? null : parseDate(raw.end);
    if (!Number.isFinite(start.getTime()) || (!point && !Number.isFinite(end.getTime()))) return { error: "time" };
    if (end && end <= start) return { error: "range" };
    const projectPath = text(raw.projectPath).replace(/\\/g, "/");
    return { error: "", annotation: {
      ...raw, title, type: point ? "point" : "span", start: start.toISOString(),
      ...(end ? { end: end.toISOString() } : { end: undefined }),
      projectPath, projectName: projectPath ? text(raw.projectName) : "",
      color: /^#[\da-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : COLORS[0]
    } };
  }

  function localTime(value) {
    const date = parseDate(value);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function node(document, parent, tag, className, label) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (label) element.textContent = label;
    parent.appendChild(element);
    return element;
  }

  function popover(options, className, title) {
    const document = options.document || globalThis.document;
    const window = document.defaultView || globalThis;
    const returnFocus = options.returnFocus || document.activeElement;
    const panel = node(document, document.body, "div", `noria-task-timeline-annotation-popover ${className}`);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    const anchor = options.anchor || {};
    const position = () => {
      const width = Math.max(160, Math.min(320, window.innerWidth - 16));
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${Math.max(100, window.innerHeight - 16)}px`;
      panel.style.left = `${Math.max(8, Math.min(Number(anchor.x) || 8, window.innerWidth - width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(Number(anchor.y) || 8, window.innerHeight - panel.offsetHeight - 8))}px`;
    };
    let closed = false;
    const close = (reason = "cancel", force = false) => {
      if (closed || (!force && options.canClose?.() === false)) return;
      closed = true;
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener?.("resize", position);
      panel.remove();
      if (reason !== "replace" && returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
      options.onClose?.(reason);
    };
    const outside = event => {
      if (panel.contains(event.target) || options.keepOpenFor?.(event.target)) return;
      close("cancel");
    };
    const keydown = event => {
      if (event.key === "Escape") { close("cancel"); event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener?.("resize", position);
    position();
    return { panel, position, close, get closed() { return closed; } };
  }

  function openEditor(options = {}) {
    const document = options.document || globalThis.document;
    const zh = isChinese(options.locale);
    const t = (en, cn) => zh ? cn : en;
    const original = { ...(options.annotation || {}) };
    const point = original.type === "point";
    let pending = false;
    let color = /^#[\da-f]{6}$/i.test(original.color) ? original.color : COLORS[0];
    const title = original.id ? t("Edit time annotation", "编辑时间标注") : t("New time annotation", "新建时间标注");
    const popup = popover({ ...options, document, canClose: () => !pending }, "noria-task-timeline-annotation-editor", title);
    const panel = popup.panel;
    node(document, panel, "div", "noria-task-timeline-annotation-heading", title);
    const form = node(document, panel, "form", "");
    form.noValidate = true;
    const field = (label, name, type = "text") => {
      const wrapper = node(document, form, "label", "noria-task-timeline-annotation-field");
      node(document, wrapper, "span", "", label);
      const input = node(document, wrapper, "input", "");
      input.type = type;
      input.name = name;
      return input;
    };
    const name = field(t("Name", "名称"), "title");
    name.value = text(original.title);
    name.placeholder = t("For example, field visits", "例如：实地采集");
    name.maxLength = 120;
    const projectLabel = node(document, form, "label", "noria-task-timeline-annotation-field");
    node(document, projectLabel, "span", "", t("Project", "项目"));
    const project = node(document, projectLabel, "select", "");
    project.name = "projectPath";
    const projects = new Map();
    const addProject = (path, label) => {
      if (projects.has(path)) return;
      projects.set(path, label);
      const option = node(document, project, "option", "", label);
      option.value = path;
    };
    addProject("", t("Global period", "全局时段"));
    if (original.projectPath) addProject(original.projectPath, original.projectName || original.projectPath);
    project.value = original.projectPath || "";
    const projectInfo = node(document, form, "div", "noria-task-timeline-annotation-help", t("Loading projects…", "正在读取项目…"));
    const start = field(t("Start", "开始"), "start", "datetime-local");
    start.value = localTime(original.start);
    start.step = "60";
    const end = point ? null : field(t("End", "结束"), "end", "datetime-local");
    if (end) { end.value = localTime(original.end); end.step = "60"; }
    const colors = node(document, form, "div", "noria-task-timeline-context-colors");
    colors.setAttribute("role", "group");
    colors.setAttribute("aria-label", t("Annotation color", "标注颜色"));
    const swatches = [];
    const updateSwatches = () => swatches.forEach(button => button.setAttribute("aria-pressed", button.dataset.color === color ? "true" : "false"));
    const draft = () => prepareDraft({
      ...original, title: name.value, start: start.value, ...(end ? { end: end.value } : {}),
      projectPath: project.value, projectName: project.value ? projects.get(project.value) || original.projectName || project.value : "", color
    });
    const preview = () => {
      const value = draft();
      if (value.error) return;
      error.hidden = true;
      popup.position();
      options.onPreview?.(value.annotation);
    };
    COLORS.forEach((value, index) => {
      const button = node(document, colors, "button", "noria-task-timeline-color-swatch");
      button.type = "button";
      button.dataset.color = value;
      button.style.backgroundColor = value;
      button.setAttribute("aria-label", t(["Blue", "Green", "Purple", "Gold", "Terracotta", "Slate"][index], ["蓝色", "绿色", "紫色", "金色", "陶红", "灰蓝"][index]));
      button.addEventListener("click", () => { color = value; updateSwatches(); preview(); });
      swatches.push(button);
    });
    updateSwatches();
    const error = node(document, form, "div", "noria-task-timeline-annotation-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    const actions = node(document, form, "div", "noria-task-timeline-annotation-actions");
    let remove = null;
    if (original.id && options.onDelete) {
      remove = node(document, actions, "button", "noria-task-timeline-annotation-delete", t("Delete", "删除标注"));
      remove.type = "button";
    }
    const cancel = node(document, actions, "button", "", t("Cancel", "取消"));
    cancel.type = "button";
    cancel.addEventListener("click", () => popup.close("cancel"));
    const save = node(document, actions, "button", "mod-cta", t("Save", "保存"));
    save.type = "submit";
    const setPending = value => {
      pending = value;
      form.querySelectorAll("input, select, button").forEach(input => { input.disabled = value; });
      panel.setAttribute("aria-busy", value ? "true" : "false");
      save.textContent = value ? t("Saving…", "正在保存…") : t("Save", "保存");
    };
    const commit = async deleting => {
      if (pending) return;
      const value = draft();
      error.hidden = true;
      if (!deleting && value.error) {
        error.textContent = value.error === "name" ? t("Enter a name.", "请填写名称。") : value.error === "range"
          ? t("End must be after start.", "结束时间应晚于开始时间。") : t("Enter valid dates and times.", "请填写有效的日期和时间。");
        error.hidden = false;
        (value.error === "name" ? name : end || start).focus();
        popup.position();
        return;
      }
      setPending(true);
      try {
        const result = deleting ? await options.onDelete(original.id) : await options.onSave(value.annotation);
        if (result !== true && result?.ok !== true) throw new Error(t("Please try again.", "请重试。"));
        setPending(false);
        popup.close(deleting ? "deleted" : "saved");
      } catch (failure) {
        setPending(false);
        error.textContent = `${t("Could not save. Your changes are still here.", "保存失败，填写内容已保留。")} ${text(failure?.message)}`;
        error.hidden = false;
        popup.position();
      }
    };
    form.addEventListener("submit", event => { event.preventDefault(); void commit(false); });
    remove?.addEventListener("click", () => { void commit(true); });
    [name, start, end].filter(Boolean).forEach(input => input.addEventListener("input", preview));
    project.addEventListener("change", () => {
      color = options.colorForProject?.(project.value) || color;
      updateSwatches(); preview();
    });
    Promise.resolve().then(() => options.loadProjects?.() || []).then(rows => {
      if (popup.closed) return;
      const selection = project.value;
      rows.forEach(row => addProject(text(row.path), text(row.name) || text(row.path)));
      project.value = selection;
      projectInfo.textContent = rows.length ? "" : t("Add projects on Home to list them here.", "在主页添加项目后，可在此选择。");
      projectInfo.hidden = rows.length > 0;
      popup.position();
    }).catch(() => {
      if (popup.closed) return;
      projectInfo.textContent = t("Projects could not be loaded. The current selection is preserved.", "项目暂时无法读取，已保留当前选择。");
      popup.position();
    });
    popup.position();
    name.focus();
    name.select();
    return {
      panel,
      close: reason => popup.close(reason || "cancel", true),
      updateRange(intent) {
        if (popup.closed || pending) return;
        start.value = localTime(intent.startMs);
        if (end) end.value = localTime(intent.endMs);
        preview();
      }
    };
  }

  function openList(options = {}) {
    const document = options.document || globalThis.document;
    const title = isChinese(options.locale) ? "更多阶段" : "More phases";
    const popup = popover({ ...options, document }, "noria-task-timeline-annotation-list", title);
    node(document, popup.panel, "div", "noria-task-timeline-annotation-heading", title);
    options.annotations.forEach(unit => {
      const button = node(document, popup.panel, "button", "noria-task-timeline-annotation-list-item", unit.label);
      button.type = "button";
      button.setAttribute("data-noria-annotation-list-id", unit.id);
      button.addEventListener("click", event => { popup.close("replace"); options.onSelect(unit.id, event); });
    });
    popup.position();
    popup.panel.querySelector("button")?.focus();
    return { close: () => popup.close("replace", true) };
  }

  root.annotationEditor = { prepareDraft, openEditor, openList };
})();
