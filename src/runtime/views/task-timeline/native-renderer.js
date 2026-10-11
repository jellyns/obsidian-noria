(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const overviewApi = root.nativeOverview;
  if (!overviewApi || typeof overviewApi.renderOverview !== "function") {
    throw new Error("Noria native overview must load before native renderer");
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function setAttribute(node, name, value) {
    if (!node || typeof node.setAttribute !== "function") return;
    if (value == null || value === "") node.removeAttribute?.(name);
    else node.setAttribute(name, String(value));
  }

  function setStyles(node, styles) {
    if (!node || !node.style) return;
    Object.entries(styles).forEach(([name, value]) => {
      node.style[name] = String(value);
    });
  }

  function applyBounds(node, bounds) {
    const rect = bounds || {};
    setStyles(node, {
      position: "absolute",
      left: `${finite(rect.left, 0)}px`,
      top: `${finite(rect.top, 0)}px`,
      width: `${Math.max(0, finite(rect.width, 0))}px`,
      height: `${Math.max(0, finite(rect.height, 0))}px`
    });
  }

  function createElement(documentRef, tagName, className, attributes = {}) {
    const node = documentRef.createElement(tagName || "div");
    node.className = className || "";
    Object.entries(attributes).forEach(([name, value]) => setAttribute(node, name, value));
    return node;
  }

  function createNativeTimelineHost(container, options = {}) {
    const documentRef = options.document || container?.ownerDocument || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== "function") {
      throw new Error("Native task timeline renderer requires a document");
    }
    const host = createElement(
      documentRef,
      "div",
      "timeline-default timeline-container timeline-horizontal noria-task-timeline-native-root",
      {
        "data-noria-task-timeline-source": "tasks",
        "data-noria-timeline-backend": "native",
        "data-noria-timeline-state": "idle"
      }
    );
    host.__noriaNativeTimelineState = null;
    container?.appendChild?.(host);
    return host;
  }

  function createMainBand(documentRef, plan) {
    const band = createElement(documentRef, "div", "timeline-band timeline-band-0 noria-task-timeline-native-main", {
      "data-noria-timeline-band": "main"
    });
    setStyles(band, {
      position: "relative",
      width: `${Math.max(0, finite(plan?.widthPx, 0))}px`,
      height: `${Math.max(0, finite(plan?.heightPx, 0))}px`,
      overflow: "hidden"
    });
    const background = createElement(documentRef, "div", "timeline-ether-bg noria-task-timeline-native-background");
    const weekends = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-weekends");
    const markers = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-markers");
    const events = createElement(documentRef, "div", "timeline-band-layer timeline-band-events noria-task-timeline-native-events");
    const annotations = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-annotations");
    const rangePreview = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-range-preview");
    const stateLayer = createElement(documentRef, "div", "timeline-band-layer noria-task-timeline-native-state-layer");
    [background, weekends, markers, events, annotations, rangePreview, stateLayer].forEach((node) => band.appendChild(node));
    return { band, background, weekends, markers, events, annotations, rangePreview, stateLayer };
  }

  function updateBandGeometry(state, mainPlan, overviewPlan) {
    const widthPx = Math.max(0, finite(mainPlan?.widthPx, overviewPlan?.widthPx || 0));
    const mainHeight = Math.max(0, finite(mainPlan?.heightPx, 0));
    const contentHeight=Math.max(mainHeight,finite(mainPlan?.contentHeightPx,mainHeight));
    const overviewHeight = Math.max(0, finite(overviewPlan?.heightPx, 0));
    const axisHeight = Math.max(0, finite(mainPlan?.axisHeightPx, 0));
    setAttribute(state.host,"data-noria-project-view",mainPlan?.projectMode?"true":null);
    setAttribute(state.host,"data-noria-scrollable-content",contentHeight>mainHeight?"true":null);
    setStyles(state.host, {
      position: "relative",
      width: `${finite(mainPlan?.outerWidthPx,widthPx)}px`,
      height: `${mainHeight + overviewHeight + axisHeight}px`,
      overflow: "hidden"
    });
    setStyles(state.main.band, { width: `${widthPx}px`, height: `${contentHeight}px` });
    setStyles(state.overviewBand, { width: `${widthPx}px`, height: `${overviewHeight}px` });
    state.overviewBand.hidden=overviewHeight===0;
    state.dateAxis.hidden=axisHeight===0;
    setStyles(state.dateAxis,{width:`${widthPx}px`,height:`${axisHeight}px`});
    if(state.projectFrame)setStyles(state.projectFrame,{height:`${mainHeight}px`});
    if(state.projectLabels)setStyles(state.projectLabels,{width:`${widthPx}px`,height:`${contentHeight}px`});
  }

  function renderProjectRows(state, plan) {
    if(!state.projectLabels)return;
    const keep=new Set();
    const zone=plan.timeZone?{timeZone:plan.timeZone}:{},year=new Intl.DateTimeFormat('en',{...zone,year:'numeric'}),nowYear=year.format(new Date());
    const shortDates=new Intl.DateTimeFormat(plan.locale,{...zone,month:'short',day:'numeric'}),fullDates=new Intl.DateTimeFormat(plan.locale,{...zone,year:'numeric',month:'short',day:'numeric'});
    const monthKey=new Intl.DateTimeFormat('en',{...zone,year:'numeric',month:'numeric'}),dayOnly=new Intl.DateTimeFormat(plan.locale,{...zone,day:'numeric'});
    for(const row of plan.projectRows || []){
      if(!row.project)continue;
      keep.add(row.key);
      let refs=state.projectNodes.get(row.key);
      if(!refs){
        const node=createElement(state.document,'div','noria-timeline-project-row');
        const toggle=createElement(state.document,'button','noria-timeline-project-toggle',{type:'button'});
        const title=createElement(state.document,'button','noria-timeline-project-name',{type:'button'});
        const reveal=createElement(state.document,'button','noria-timeline-project-reveal',{type:'button'});
        const revealIcon=createElement(state.document,'span','noria-timeline-project-reveal-icon',{'aria-hidden':'true'});
        const revealLabel=createElement(state.document,'span','noria-timeline-project-reveal-label');
        reveal.appendChild(revealIcon);reveal.appendChild(revealLabel);
        const unscheduled=createElement(state.document,'button','noria-timeline-project-unscheduled',{type:'button','aria-haspopup':'dialog'});
        node.appendChild(toggle);node.appendChild(title);node.appendChild(reveal);node.appendChild(unscheduled);state.projectLabels.appendChild(node);
        refs={node,toggle,title,reveal,revealIcon,revealLabel,unscheduled};state.projectNodes.set(row.key,refs);
      }
      applyBounds(refs.node,{left:8,top:row.top,width:Math.max(0,plan.widthPx-16),height:row.height});
      setAttribute(refs.node,'data-project-row',row.project?'project':'task');
      setAttribute(refs.node,'data-project-key',row.key);
      refs.toggle.hidden=!row.project;refs.toggle.textContent='';
      refs.toggle.disabled=!row.scheduledEventIds?.length;
      setAttribute(refs.toggle,'data-empty',refs.toggle.disabled?'true':null);
      setAttribute(refs.toggle,'aria-expanded',String(row.expanded===true));setAttribute(refs.toggle,'aria-label',`${plan.locale==='zh-CN'?(row.expanded?'收起':'展开'):(row.expanded?'Collapse':'Expand')} ${row.title}`);
      refs.toggle.onclick=()=>plan.onProjectToggle?.(row.key);
      refs.title.textContent=row.title;refs.title.title=`${row.title} · ${row.count} ${plan.locale==='zh-CN'?'项任务':'tasks'}`;
      refs.title.disabled=row.project&&!/\.md$/i.test(row.path||'');
      refs.title.onclick=()=>plan.onProjectOpen?.(row);
      refs.reveal.hidden=!(row.expanded&&row.schedule&&row.visibleTaskCount===0);
      const revealLabel=plan.locale==='zh-CN'?'查看安排':'Show schedule';
      const dates=row.schedule&&[row.schedule.startMs,row.schedule.endMs].some(ms=>year.format(new Date(ms))!==nowYear)?fullDates:shortDates;
      let dateLabel='';
      if(row.schedule){
        const start=new Date(row.schedule.startMs),end=new Date(row.schedule.endMs);
        if(plan.locale==='zh-CN'){
          const first=dates.format(start),last=dates.format(end);
          dateLabel=first===last?first:first+'–'+(monthKey.format(start)===monthKey.format(end)?dayOnly.format(end):last);
        }else dateLabel=dates.formatRange(start,end);
      }
      refs.revealIcon.textContent=dateLabel;
      refs.revealLabel.textContent='↗';setAttribute(refs.revealLabel,'aria-hidden','true');
      setAttribute(refs.reveal,'aria-label',`${row.title} · ${revealLabel} · ${dateLabel}`);
      refs.reveal.title=`${row.title} · ${revealLabel} · ${dateLabel}`;
      refs.reveal.onclick=()=>{refs.toggle.focus?.({preventScroll:true});plan.onProjectFit?.(row);};
      const unplaced=row.unplacedTasks||[];
      refs.unscheduled.hidden=!unplaced.length;
      refs.unscheduled.textContent=`${plan.locale==='zh-CN'?'未安排':'Unscheduled'} ${unplaced.length}`;
      refs.unscheduled.title=`${row.title} · ${refs.unscheduled.textContent}`;
      setAttribute(refs.unscheduled,'aria-label',refs.unscheduled.title);
      refs.unscheduled.onclick=()=>plan.onProjectUnscheduled?.(unplaced,refs.unscheduled,row.title);

    }
    for(const [key,refs] of state.projectNodes)if(!keep.has(key)){refs.node.remove();state.projectNodes.delete(key);}
    state.projectBars.replaceChildren();
    for(const summary of plan.projectSummaries||[]){
      const bar=createElement(state.document,'div','noria-timeline-project-span');applyBounds(bar,summary.bounds);
      setAttribute(bar,'data-clipped-start',summary.clippedStart?'true':null);
      setAttribute(bar,'data-clipped-end',summary.clippedEnd?'true':null);
      state.projectBars.appendChild(bar);
    }
  }

  function renderWeekendWashes(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (Array.isArray(plan?.weekendWashes) ? plan.weekendWashes : []).forEach((wash) => {
      const node = createElement(state.document, "div", "timeline-ether-weekends noria-task-timeline-native-weekend", {
        "data-noria-weekend-key": wash.key
      });
      applyBounds(node, wash.bounds);
      fragment.appendChild(node);
    });
    state.main.weekends.replaceChildren(fragment);
  }

  function renderMarkers(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (Array.isArray(plan?.markers) ? plan.markers : []).forEach((marker) => {
      const className = marker.kind === "now"
        ? "timeline-highlight-point-decorator noria-task-timeline-now-cursor noria-task-timeline-native-marker"
        : "timeline-highlight-decorator noria-task-timeline-native-today noria-task-timeline-native-marker";
      const node = createElement(state.document, "div", className, {
        "data-noria-timeline-marker": marker.kind,
        "aria-hidden": "true"
      });
      node.textContent = text(marker.text);
      applyBounds(node, marker.bounds);
      fragment.appendChild(node);
    });
    state.main.markers.replaceChildren(fragment);
  }

  function renderAnnotations(state, plan) {
    const fragment = state.document.createDocumentFragment();
    (plan.annotationUnits || []).forEach(unit => {
      const wrapper = createElement(state.document, "div", "noria-task-timeline-native-annotation", {
        "data-noria-annotation-id": unit.id, "data-noria-annotation-selected": unit.selected ? "true" : "false"
      });
      applyBounds(wrapper, unit.bounds);
      wrapper.style.setProperty?.("--noria-annotation-color", unit.color);
      const button = createElement(state.document, "button", "noria-task-timeline-native-annotation-label", {
        type: "button", "data-noria-annotation-id": unit.id, "aria-label": unit.label, title: unit.label
      });
      button.textContent = unit.label;
      wrapper.appendChild(button);
      if (unit.selected && !unit.isInstant) {
        ["start", "end"].forEach(role => {
          if ((role === "start" && unit.clippedStart) || (role === "end" && unit.clippedEnd)) return;
          const handle = createElement(state.document, "div", `noria-task-timeline-native-annotation-handle is-${role}`, {
            "data-noria-annotation-id": unit.id, "data-noria-annotation-handle": role, "aria-hidden": "true"
          });
          wrapper.appendChild(handle);
        });
      }
      fragment.appendChild(wrapper);
    });
    if (plan.hiddenAnnotations?.length) {
      const more = createElement(state.document, "button", "noria-task-timeline-native-annotation-more", {
        type: "button", "data-noria-timeline-action": "more-annotations"
      });
      more.textContent = plan.locale === "zh-CN" ? `另有 ${plan.hiddenAnnotations.length} 个阶段…` : `${plan.hiddenAnnotations.length} more phases…`;
      applyBounds(more, plan.annotationOverflowBounds);
      fragment.appendChild(more);
    }
    state.main.annotations.replaceChildren(fragment);
    state.main.rangePreview.replaceChildren();
    if (plan.rangePreview) {
      const preview = createElement(state.document, "div", "noria-task-timeline-native-selection", { "data-noria-range-preview": "active" });
      applyBounds(preview, plan.rangePreview.bounds);
      const label = createElement(state.document, "div", "noria-task-timeline-native-selection-label");
      const format = value => new Date(value).toLocaleString(plan.locale || "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      label.textContent = `${format(plan.rangePreview.startMs)} → ${format(plan.rangePreview.endMs)}`;
      preview.appendChild(label);
      state.main.rangePreview.appendChild(preview);
    }
  }

  function createTaskNode(state, unit) {
    const wrapper = createElement(state.document, "div", "noria-task-timeline-native-task-unit", {
      "data-noria-task-group-key": unit.taskKey
    });
    setStyles(wrapper, { position: "absolute", inset: "0", pointerEvents: "none" });
    const title = createElement(state.document, "div", "timeline-event-label noria-task-timeline-editable noria-task-timeline-native-title");
    wrapper.appendChild(title);
    const refs = { wrapper, title, point: null, rail: null, handleZone: null, handles: [] };
    wrapper.__noriaTaskRefs = refs;
    state.main.events.appendChild(wrapper);
    return refs;
  }

  function reconcilePointAndRail(state, refs, unit) {
    if (unit.point?.visible) {
      if (!refs.point) {
        refs.point = createElement(state.document, "div", "timeline-event-icon noria-task-timeline-native-point", { "aria-hidden": "true" });
        refs.wrapper.appendChild(refs.point);
      }
      setAttribute(refs.point, "data-noria-task-unit-key", unit.taskKey);
      setAttribute(refs.point, "data-noria-task-visual-role", unit.canOpenSource===false?"record-summary":unit.point.role || "point");
      const pointOwnsSourceAction = unit.title?.visible === false || unit.title?.bounds?.width < 16;
      setAttribute(refs.point, "aria-hidden", pointOwnsSourceAction ? "false" : "true");
      setAttribute(refs.point, "role", pointOwnsSourceAction ? "button" : "");
      setAttribute(refs.point, "tabindex", pointOwnsSourceAction ? "0" : "");
      setAttribute(refs.point, "aria-label", pointOwnsSourceAction ? (unit.title?.text || unit.taskKey) : "");
      applyBounds(refs.point, unit.point.bounds);
    } else if (refs.point) {
      refs.point.remove?.();
      refs.point = null;
    }

    if (unit.rail?.visible) {
      if (!refs.rail) {
        refs.rail = createElement(state.document, "div", "timeline-event-tape noria-task-timeline-native-rail");
        refs.wrapper.appendChild(refs.rail);
      }
      setAttribute(refs.rail, "data-noria-task-unit-key", unit.taskKey);
      setAttribute(refs.rail, "data-noria-task-visual-role", unit.rail.role || "duration-rail");
      setAttribute(refs.rail, "data-noria-source-action", "");
      setAttribute(refs.rail, "aria-hidden", "true");
      applyBounds(refs.rail, unit.rail.bounds);
    } else if (refs.rail) {
      refs.rail.remove?.();
      refs.rail = null;
    }
  }

  function reconcileHandleZone(state, refs, unit) {
    if (unit.readOnly || unit.isInstant || unit.title?.visible === false) {
      refs.handleZone?.remove?.();
      refs.handleZone = null;
      return;
    }
    if (!refs.handleZone) {
      refs.handleZone = createElement(
        state.document,
        "div",
        "noria-task-timeline-native-handle-zone",
        { "data-noria-task-handle-zone": "local-title", "aria-hidden": "true" }
      );
      refs.wrapper.appendChild(refs.handleZone);
    }
    setAttribute(refs.handleZone, "data-noria-task-unit-key", unit.taskKey);
    applyBounds(refs.handleZone, unit.handleZoneBounds || unit.title?.bounds);
  }

  function renderHandles(state, refs, unit) {
    refs.handles.forEach((node) => node.remove?.());
    refs.handles = [];
    if (unit.readOnly || unit.title?.visible === false) return;
    const definitions = unit.isInstant
      ? [["move", unit.handles?.move?.bounds]]
      : [
          ["start", unit.handles?.start?.bounds],
          ["move", unit.handles?.move?.bounds],
          ["end", unit.handles?.end?.bounds]
        ];
    definitions.forEach(([role, handleBounds]) => {
      if(unit.handles?.[role]?.visible===false)return;
      const node = createElement(
        state.document,
        "div",
        `noria-task-timeline-native-handle noria-task-timeline-native-handle--${role}`,
        {
          "data-noria-task-unit-key": unit.taskKey,
          "data-noria-task-visual-role": `handle-${role}`,
          "data-noria-task-handle-role": role,
          "aria-hidden": "true"
        }
      );
      applyBounds(node, handleBounds);
      refs.wrapper.appendChild(node);
      refs.handles.push(node);
    });
  }

  function updateTaskNode(state, refs, unit) {
    refs.unit = unit;
    const titleVisible = unit.title?.visible !== false;
    setAttribute(refs.wrapper, "data-noria-task-group-key", unit.taskKey);
    setAttribute(refs.wrapper, "data-noria-task-title-visible", titleVisible ? "true" : "false");
    refs.wrapper.className = `noria-task-timeline-native-task-unit ${unit.status === "done" ? "is-done" : "is-open"}`;
    setAttribute(refs.wrapper, "data-noria-event-layer", unit.layer||"task");
    setAttribute(refs.wrapper, "data-noria-event-kind", unit.kind||"");
    refs.wrapper.style.setProperty?.("--noria-event-color", unit.kind?.includes('break')?'var(--text-muted)':unit.color||"var(--interactive-accent)");
    setAttribute(refs.title, "data-noria-task-unit-key", unit.taskKey);
    setAttribute(refs.title, "data-noria-task-visual-role", unit.canOpenSource===false?"record-summary":unit.title?.role || "primary-title");
    setAttribute(refs.title, "data-noria-source-action", "");
    setAttribute(refs.title, "role", titleVisible ? (unit.canOpenSource===false?"group":"button") : "");
    setAttribute(refs.title, "tabindex", titleVisible ? "0" : "");
    const statusText = unit.readOnly ? (state.mainPlan?.locale === "zh-CN" ? (unit.layer==='pomodoro'?"实际记录":"活动记录") : (unit.layer==='pomodoro'?"Recorded time":"Activity")) : state.mainPlan?.locale === "zh-CN" ? (unit.status === "done" ? "已完成" : "未完成") : (unit.status === "done" ? "Completed" : "Open");
    setAttribute(refs.title, "aria-label", titleVisible ? `${unit.title?.text || unit.taskKey}${unit.title?.durationLabel?' · '+unit.title.durationLabel:''}${unit.title?.sourceLabel?' · '+unit.title.sourceLabel:''} · ${statusText}` : "");
    setAttribute(refs.title, "aria-hidden", titleVisible ? "" : "true");
    refs.title.hidden = !titleVisible;
    const sourceLabel=text(unit.title?.sourceLabel);
    if(sourceLabel){
      if(!refs.sourceLabel){refs.title.textContent='';refs.focusLabel=null;refs.nameLabel=createElement(state.document,'span','noria-task-timeline-native-name');refs.sourceLabel=createElement(state.document,'span','noria-task-timeline-native-source');refs.title.appendChild(refs.nameLabel);refs.title.appendChild(refs.sourceLabel);}
      refs.nameLabel.textContent=text(unit.title?.text);refs.sourceLabel.textContent=sourceLabel;
    }else if(unit.layer==='pomodoro'){
      if(!refs.focusLabel){refs.title.textContent='';refs.focusLabel=createElement(state.document,'span','noria-task-timeline-native-focus-label');refs.focusDuration=createElement(state.document,'span','noria-task-timeline-native-focus-duration');refs.title.appendChild(refs.focusLabel);refs.title.appendChild(refs.focusDuration);}
      refs.focusLabel.textContent=text(unit.title?.text);refs.focusDuration.textContent=text(unit.title?.durationLabel);
    }else refs.title.textContent = text(unit.title?.text);
    if(!sourceLabel)refs.sourceLabel=null;
    setAttribute(refs.title,'data-noria-source-caption',sourceLabel?'true':null);
    setAttribute(refs.title,'data-noria-title-lines',String(unit.title?.lines || 1));
    refs.title.style.setProperty?.('--noria-title-lines',String(unit.title?.lines || 1));
    applyBounds(refs.title, unit.title?.bounds);
    refs.title.style.fontWeight = "";
    setAttribute(refs.wrapper,"data-noria-project-task",unit.projectTask?"true":null);
    setAttribute(refs.wrapper,"data-noria-compact-project",unit.compactProject?"true":null);
    setAttribute(refs.wrapper,"data-noria-inline-title",unit.inlineTitle?"true":null);
    reconcilePointAndRail(state, refs, unit);
    reconcileHandleZone(state, refs, unit);
    renderHandles(state, refs, unit);
  }

  function reconcileTaskNodes(state, plan) {
    state.mainPlan = plan || {};
    const incoming = new Set();
    (Array.isArray(plan?.taskUnits) ? plan.taskUnits : []).forEach((unit) => {
      const taskKey = text(unit?.taskKey);
      if (!taskKey) return;
      incoming.add(taskKey);
      let refs = state.taskNodes.get(taskKey);
      if (!refs) {
        refs = createTaskNode(state, unit);
        state.taskNodes.set(taskKey, refs);
      }
      updateTaskNode(state, refs, unit);
    });
    Array.from(state.taskNodes.entries()).forEach(([taskKey, refs]) => {
      if (incoming.has(taskKey)) return;
      refs.wrapper.remove?.();
      state.taskNodes.delete(taskKey);
    });
  }

  function renderState(state, model) {
    const mode = text(model?.state || "ready") || "ready";
    setAttribute(state.host, "data-noria-timeline-state", mode);
    state.main.stateLayer.replaceChildren();
    if (mode === "ready") {
      const count = finite(model?.mainPlan?.hiddenTaskCount, 0);
      if (count > 0) {
        const node = createElement(state.document, "div", "noria-task-timeline-native-overflow", { role: "status" });
        node.textContent = model.mainPlan.locale === "zh-CN"
          ? `还有 ${count} 项 · 放大时间轴或增大视图查看`
          : `${count} more items · zoom in or enlarge this view`;
        state.main.stateLayer.appendChild(node);
      }
      return;
    }
    if (model?.showStateMessage === false) return;
    const node = createElement(
      state.document,
      "div",
      `noria-task-timeline-diagnostic-pill noria-task-timeline-native-state noria-task-timeline-native-state--${mode}`,
      { "data-noria-timeline-state": mode, role: mode === "error" ? "alert" : "status" }
    );
    node.textContent = text(model?.message || mode);
    state.main.stateLayer.appendChild(node);
  }

  let detailsId = 0;

  function showTaskDetails(state, taskKey) {
    const refs = state.taskNodes.get(taskKey);
    const unit = refs?.unit;
    const visible = !state.detailsSuppressed && unit && unit.title?.visible !== false;
    state.detailsKey = visible ? taskKey : "";
    state.taskNodes.forEach((item, key) => {
      setAttribute(item.wrapper, "data-noria-task-details", visible && key === taskKey ? "active" : "");
      setAttribute(item.title, "aria-describedby", visible && key === taskKey ? state.detailsTooltipId : "");
    });
    if (!visible) {
      if (state.detailsTooltip) state.detailsTooltip.hidden = true;
      return;
    }
    if (!state.detailsTooltip) {
      state.detailsTooltip = createElement(state.document, "div", "noria-task-timeline-native-tooltip", {
        role: "tooltip", id: state.detailsTooltipId
      });
      state.detailsTitle = createElement(state.document, "div", "noria-task-timeline-native-tooltip-title");
      state.detailsTime = createElement(state.document, "div", "noria-task-timeline-native-tooltip-time");
      state.detailsSource = createElement(state.document, "div", "noria-task-timeline-native-tooltip-source");
      state.detailsStatus = createElement(state.document, "div", "noria-task-timeline-native-tooltip-status");
      [state.detailsTitle, state.detailsTime, state.detailsStatus, state.detailsSource].forEach(node => state.detailsTooltip.appendChild(node));
      state.host.appendChild(state.detailsTooltip);
    }
    const locale = state.mainPlan?.locale === "zh-CN" ? "zh-CN" : "en";
    const dateOptions = { ...(state.mainPlan.timeZone ? {timeZone:state.mainPlan.timeZone} : {}), year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    const format = value => new Date(value).toLocaleString(locale, dateOptions);
    state.detailsTitle.textContent = text(unit.title.text);
    state.detailsTime.textContent = unit.isInstant ? format(unit.startMs) : `${format(unit.startMs)} → ${format(unit.endMs)}`;
    state.detailsStatus.textContent = unit.readOnly ? ((locale === "zh-CN" ? {pomodoro:"专注记录",note:"笔记",noria:"记录",git:"提交"} : {pomodoro:"Focus",note:"Note",noria:"Record",git:"Commit"})[unit.layer] || "") : locale === "zh-CN" ? (unit.status === "done" ? "已完成" : "未完成") : (unit.status === "done" ? "Completed" : "Open");
    const sourcePaths=unit.sourcePaths || [];
    state.detailsSource.textContent = sourcePaths.length>1
      ? sourcePaths.slice(0,3).map(path=>text(path).split('/').pop().replace(/\.md$/i,'')).join(' · ')+(sourcePaths.length>3?` · +${sourcePaths.length-3}`:'')
      : text(unit.sourcePath);
    state.detailsSource.hidden = !unit.sourcePath;
    const tooltip = state.detailsTooltip;
    tooltip.hidden = false;
    tooltip.style.width = `${Math.min(320, Math.max(80, state.mainPlan.widthPx - 16))}px`;
    // Use rendered coordinates: project/free content may be scrolled under the fixed axis.
    const hostRect = state.host.getBoundingClientRect();
    const titleRect = refs.title.getBoundingClientRect();
    const railRect = refs.rail?.getBoundingClientRect();
    const top = Math.min(titleRect.top, railRect?.top ?? titleRect.top) - hostRect.top;
    const bottom = Math.max(titleRect.bottom, railRect?.bottom ?? titleRect.bottom) - hostRect.top;
    const roomAbove = top - 8, roomBelow = hostRect.height - bottom - 8;
    const below = roomBelow >= Math.min(tooltip.scrollHeight, 160) || roomBelow >= roomAbove;
    const room = Math.max(0, (below ? roomBelow : roomAbove) - 8);
    // A tiny card cannot host a useful preview without covering the task. Its editor remains available.
    if (room < 48 || bottom < 0 || top > hostRect.height) { tooltip.hidden = true; return; }
    tooltip.style.maxHeight = `${room}px`;
    setStyles(tooltip, {
      left: `${Math.max(8, Math.min(titleRect.left-hostRect.left, hostRect.width-tooltip.offsetWidth-8))}px`,
      top: `${below ? bottom+8 : top-tooltip.offsetHeight-8}px`
    });
  }

  function attachTaskDetails(state) {
    if (!state.host.addEventListener) return;
    state.detailsTooltipId = `noria-timeline-details-${++detailsId}`;
    const taskKey = target => {
      for (let node = target; node && node !== state.host; node = node.parentElement) {
        const key = node.getAttribute?.("data-noria-task-group-key");
        if (key) return key;
      }
      return "";
    };
    const clearTimer = () => { globalThis.clearTimeout(state.detailsTimer); state.detailsTimer = null; };
    const dismiss = () => { clearTimer(); state.hoverKey = ""; state.focusedKey = ""; showTaskDetails(state, ""); };
    const handlers = {
      pointerdown: () => { state.detailsSuppressed = true; dismiss(); },
      pointerover: event => {
        const key = taskKey(event.target);
        if (state.detailsSuppressed || event.buttons || !key || key === taskKey(event.relatedTarget)) return;
        state.hoverKey = key;
        clearTimer();
        state.detailsTimer = globalThis.setTimeout(() => showTaskDetails(state, key), 400);
      },
      pointerout: event => {
        if (taskKey(event.target) === taskKey(event.relatedTarget)) return;
        state.hoverKey = "";
        clearTimer();
        showTaskDetails(state, state.focusedKey || "");
      },
      focusin: event => { state.focusedKey = taskKey(event.target); clearTimer(); showTaskDetails(state, state.focusedKey); },
      focusout: event => { state.focusedKey = taskKey(event.relatedTarget); showTaskDetails(state, state.focusedKey || state.hoverKey || ""); },
      keydown: event => {
        if (event.key !== "Escape") return;
        clearTimer(); state.hoverKey = ""; state.focusedKey = ""; showTaskDetails(state, "");
      }
    };
    Object.entries(handlers).forEach(([type, handler]) => state.host.addEventListener(type, handler, type === "pointerdown"));
    const release = () => { state.detailsSuppressed = false; };
    state.document.addEventListener?.("pointerup", release, true);
    state.document.addEventListener?.("pointercancel", release, true);
    state.projectFrame?.addEventListener?.("scroll", dismiss, {passive:true});
    state.disposeDetails = () => {
      state.document.removeEventListener?.("pointerup", release, true);
      state.document.removeEventListener?.("pointercancel", release, true);
      state.projectFrame?.removeEventListener?.("scroll", dismiss);
      clearTimer();
      Object.entries(handlers).forEach(([type, handler]) => state.host.removeEventListener(type, handler, type === "pointerdown"));
    };
  }

  function updateSurface(state, model) {
    const mainPlan = model?.mainPlan || {};
    const overviewPlan = model?.overviewPlan || {};
    const densityWidthPx = finite(mainPlan?.densityWidthPx, mainPlan?.widthPx || 0);
    const density = densityWidthPx > 560 ? "wide" : (densityWidthPx > 320 ? "normal" : "compact");
    setAttribute(state.host, "data-noria-timeline-density", density);
    updateBandGeometry(state, mainPlan, overviewPlan);
    renderWeekendWashes(state, mainPlan);
    renderMarkers(state, mainPlan);
    renderAnnotations(state, mainPlan);
    reconcileTaskNodes(state, mainPlan);
    renderProjectRows(state,mainPlan);
    overviewApi.renderOverview(state.overviewBand, overviewPlan);
    overviewApi.renderDateAxis(state.dateAxis,mainPlan.axisHeightPx?mainPlan.dateTicks||[]:[],mainPlan.axisHeightPx||0,state.document,mainPlan.onReturnWindow,mainPlan.locale);
    state.main.background.replaceChildren();
    for(const tick of mainPlan.dateTicks||[]){
      const guide=createElement(state.document,'div','noria-timeline-date-guide',{'aria-hidden':'true'});
      setStyles(guide,{position:'absolute',left:`${tick.px}px`,top:'0',height:'100%'});state.main.background.appendChild(guide);
    }
    renderState(state, model);
    state.model = model;
    if (state.detailsKey) showTaskDetails(state, state.detailsKey);
    return state.host;
  }

  function renderNativeTimeline(host, model = {}) {
    if (!host) return null;
    if (host.__noriaNativeTimelineState) return updateNativeTimeline(host, model);
    const documentRef = host.ownerDocument || globalThis.document;
    const main = createMainBand(documentRef, model.mainPlan || {});
    const overviewBand = createElement(documentRef, "div", "timeline-band timeline-band-1 noria-task-timeline-native-overview-band", {
      "data-noria-timeline-band": "overview"
    });
    const fragment = documentRef.createDocumentFragment();
    const dateAxis=createElement(documentRef,'div','noria-timeline-date-axis',{'data-noria-timeline-band':'axis',tabindex:'0',role:'group','aria-label':model.mainPlan?.locale==='zh-CN'?'日期轴：方向键平移，加减号缩放':'Date axis: arrow keys to pan, plus and minus to zoom'});
    fragment.appendChild(dateAxis);
    let projectFrame=createElement(documentRef,"div","noria-timeline-project-scroll"),projectLabels=null,projectBars=null;
    if(model.mainPlan?.projectMode){
      projectLabels=createElement(documentRef,'div','noria-timeline-project-labels');
      projectBars=createElement(documentRef,'div','noria-timeline-project-spans');
      main.band.appendChild(projectBars);main.band.appendChild(projectLabels);
    }
    projectFrame.appendChild(main.band);fragment.appendChild(projectFrame);
    fragment.appendChild(overviewBand);
    host.replaceChildren(fragment);
    const state = {
      host,
      document: documentRef,
      main,
      overviewBand,
      dateAxis,
      projectFrame,projectLabels,projectBars,projectNodes:new Map(),
      taskNodes: new Map(),
      model: null,
      disposed: false
    };
    attachTaskDetails(state);
    host.__noriaNativeTimelineState = state;
    host.removeAttribute?.("data-noria-timeline-disposed");
    return updateSurface(state, model);
  }

  function updateNativeTimeline(host, model = {}) {
    const state = host && host.__noriaNativeTimelineState;
    if (!state || state.disposed) return renderNativeTimeline(host, model);
    return updateSurface(state, model);
  }

  function disposeNativeTimeline(host) {
    if (!host) return;
    const state = host.__noriaNativeTimelineState;
    if (state && !state.disposed) {
      state.disposed = true;
      state.disposeDetails?.();
      state.taskNodes.clear();
    }
    host.replaceChildren?.();
    host.__noriaNativeTimelineState = null;
    host.setAttribute?.("data-noria-timeline-disposed", "true");
  }

  root.nativeRenderer = {
    createNativeTimelineHost,
    renderNativeTimeline,
    updateNativeTimeline,
    disposeNativeTimeline
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineRendererTestHooks = root.nativeRenderer;
  }
})();
