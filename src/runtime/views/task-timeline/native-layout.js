(function () {
  const root = globalThis.noriaTaskTimeline || (globalThis.noriaTaskTimeline = {});
  const viewportApi = root.nativeViewport;
  const eventIndexApi = root.nativeEventIndex;
  if (!viewportApi || typeof viewportApi.dateMsToPx !== "function") {
    throw new Error("Noria native viewport must load before native layout");
  }
  if (!eventIndexApi || typeof eventIndexApi.createEventIndex !== "function") {
    throw new Error("Noria native event index must load before native layout");
  }

  const DEFAULT_METRICS = Object.freeze({
    safeTopPx: 12,
    safeBottomPx: 24,
    horizontalPaddingPx: 8,
    titleHeightPx: 16,
    laneGapPx: 6,
    laneStepPx: 22,
    markerSizePx: 7,
    markerGapPx: 3,
    railHeightPx: 2,
    handleWidthPx: 3,
    minTitleWidthPx: 44,
    maxTitleWidthPx: 220
  });

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function rect(left, top, width, height) {
    const safeWidth = Math.max(0, finite(width, 0));
    const safeHeight = Math.max(0, finite(height, 0));
    return {
      left,
      top,
      right: left + safeWidth,
      bottom: top + safeHeight,
      width: safeWidth,
      height: safeHeight
    };
  }

  function titleMaxWidth(widthPx) {
    if (widthPx < 240) return 140;
    return Math.min(360, widthPx - 24);
  }

  function titleFontSizePx(widthPx) {
    return widthPx > 320 ? 12 : 11;
  }

  function resolveMetrics(widthPx, overrides = {}) {
    return {
      ...DEFAULT_METRICS,
      ...overrides,
      maxTitleWidthPx: finite(overrides.maxTitleWidthPx, titleMaxWidth(widthPx))
    };
  }

  function normalizedStatus(event) {
    return text(event && event.status).toLowerCase();
  }

  function isDone(event) {
    return ["done", "completed", "complete", "x"].includes(normalizedStatus(event));
  }

  function groupTaskEvents(events) {
    const groups = new Map();
    events.forEach((event) => {
      if (!event || !["task","pomodoro","note","git","noria"].includes(text(event.layer))) return;
      const taskKey = text(event.layer)!=="task" ? text(event.id) : text(event.taskKey || event.id);
      if (!taskKey) return;
      if (!groups.has(taskKey)) groups.set(taskKey, []);
      groups.get(taskKey).push(event);
    });
    return Array.from(groups.entries()).map(([taskKey, items]) => {
      const sorted = items.slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || text(a.id).localeCompare(text(b.id)));
      const duration = sorted.find((event) => !event.isInstant && event.endMs > event.startMs);
      const primary = duration || sorted[0];
      return { taskKey, events: sorted, primary };
    }).sort((a, b) => a.primary.startMs - b.primary.startMs || text(a.primary.source?.path).localeCompare(text(b.primary.source?.path)) || finite(a.primary.source?.line,0)-finite(b.primary.source?.line,0) || a.taskKey.localeCompare(b.taskKey));
  }

  function measureTitleWidth(title, measureText, metrics, widthPx) {
    let measured = 0;
    try {
      measured = finite(measureText(title, "task-title", {
        widthPx,
        fontSizePx: titleFontSizePx(widthPx),
        fontWeight: 400
      }), 0);
    } catch (_) {}
    if (!(measured > 0)) measured = Math.max(1, text(title).length) * 7;
    return clamp(Math.ceil(measured) + 2, metrics.minTitleWidthPx, metrics.maxTitleWidthPx);
  }

  function distinguishSources(groups, locale) {
    const names = new Map();
    for (const group of groups) {
      if (group.primary.layer !== 'task') continue;
      const name = text(group.primary.title || group.primary.text);
      if (!names.has(name)) names.set(name, []);
      names.get(name).push(group);
    }
    for (const matches of names.values()) {
      if (matches.length < 2) continue;
      const paths = matches.map(group => text(group.primary.source?.path).replace(/\\/g, '/').replace(/\.md$/i, ''));
      // If the filenames repeat, the nearest distinct folder carries the useful context.
      const contexts = paths.map(path => {
        const parts=path.split('/');
        return parts.length>1 && paths.some(other=>other!==path && other.split('/').pop()===parts.at(-1)) ? parts.slice(0,-1) : parts;
      });
      matches.forEach((group, i) => {
        if (!paths[i] || (paths.every(path => path === paths[i]) && !Number.isInteger(group.primary.source?.line))) return;
        const parts = contexts[i];
        let count = 1;
        while (count < parts.length && contexts.some((other, j) => j !== i && paths[j] !== paths[i] && other.slice(-count).join('/') === parts.slice(-count).join('/'))) count++;
        let label = parts.slice(-count).join(' / ');
        if (paths.filter(path => path === paths[i]).length > 1 && Number.isInteger(group.primary.source?.line)) {
          label += ` · ${/^zh/.test(locale || '') ? '第' + (group.primary.source.line + 1) + '行' : 'line ' + (group.primary.source.line + 1)}`;
        }
        group.sourceLabel = label;
      });
    }
    return groups;
  }

  function visibleDraft(group, viewport, widthPx, heightPx, measureText, metrics) {
    const event = group.primary;
    const range = viewportApi.visibleRange(viewport);
    const instant = event.isInstant || event.endMs === event.startMs;
    if (instant && (event.startMs < range.startMs || event.startMs > range.endMs)) return null;
    if (!instant && (event.endMs < range.startMs || event.startMs > range.endMs)) return null;

    const rawStartX = viewportApi.dateMsToPx(viewport, event.startMs);
    const rawEndX = instant ? rawStartX : viewportApi.dateMsToPx(viewport, event.endMs);
    const visibleStartX = clamp(Math.min(rawStartX, rawEndX), 0, widthPx);
    const visibleEndX = clamp(Math.max(rawStartX, rawEndX), 0, widthPx);
    const anchorX = clamp(rawStartX, metrics.horizontalPaddingPx + metrics.markerSizePx / 2,
      Math.max(metrics.horizontalPaddingPx + metrics.markerSizePx / 2, widthPx - metrics.markerSizePx / 2));
    const title = text(event.title || event.text || group.taskKey);
    const afterMarker = anchorX + metrics.markerSizePx / 2 + metrics.markerGapPx;
    const durationLabel=text(event.presentation?.durationLabel);
    const sourceLabel=text(group.sourceLabel);
    const fullTitleWidth=measureTitleWidth(title+(durationLabel?' · '+durationLabel:''), measureText, {...metrics,maxTitleWidthPx:Infinity}, widthPx);
    const measuredTitleWidth=Math.min(metrics.maxTitleWidthPx,Math.max(fullTitleWidth,sourceLabel?measureTitleWidth(sourceLabel,measureText,metrics,widthPx):0));
    const availableAfter=Math.max(0,widthPx-metrics.horizontalPaddingPx-afterMarker);
    const beforeMarker=anchorX-metrics.markerSizePx/2-metrics.markerGapPx;
    const availableBefore=Math.max(0,beforeMarker-metrics.horizontalPaddingPx);
    const placeBefore=measuredTitleWidth>availableAfter&&availableBefore>availableAfter;
    const titleWidth=Math.min(measuredTitleWidth,placeBefore?availableBefore:availableAfter);
    const titleLeft=placeBefore?beforeMarker-titleWidth:afterMarker;

    return {
      taskKey: group.taskKey,
      eventId: text(event.id),
      sourcePath: text(event.source?.path),
      sourcePaths: event.payload?.burst?.paths || event.source?.paths || [],
      sourceLabel,
      layer: text(event.layer),
      color: /^#[\da-f]{6}$/i.test(event.color) ? event.color : "",
      kind: text(event.kind),
      detail: event.layer!=='task'&&event.layer!=='pomodoro'?text(event.presentation?.hoverText):'',
      title,
      durationLabel,
      status: isDone(event) ? "done" : normalizedStatus(event),
      startMs: event.startMs,
      endMs: event.endMs,
      isInstant: instant,
      anchorX,
      rawStartX,
      rawEndX,
      visibleStartX,
      visibleEndX,
      titleWidth,
      titleLeft,
      titleLines: fullTitleWidth > titleWidth ? 2 : 1,
      titleHeight: (fullTitleWidth > titleWidth ? 2 : 1) * metrics.titleHeightPx + (sourceLabel ? 16 : 0),
      baseTop: metrics.safeTopPx,
      heightPx,
      clippedStart: rawStartX < 0,
      clippedEnd: rawEndX > widthPx
    };
  }

  function collides(a, b, gapX = 0, gapY = 0) {
    if (!a || !b) return false;
    return a.left < b.right + gapX &&
      a.right + gapX > b.left &&
      a.top < b.bottom + gapY &&
      a.bottom + gapY > b.top;
  }

  function placeTaskTitles(drafts, heightPx, metrics) {
    const placed = [], lanes = [];
    drafts.forEach((draft) => {
      let lane = 0;
      const titleHeight = draft.titleHeight || metrics.titleHeightPx;
      const slots = Math.ceil((titleHeight + 4) / metrics.laneStepPx);
      let bounds = rect(draft.titleLeft, metrics.safeTopPx, draft.titleWidth, titleHeight);
      const occupiedBounds = () => {
        const left = Math.min(bounds.left - metrics.markerGapPx - metrics.markerSizePx, draft.visibleStartX);
        const right = Math.max(bounds.right, draft.visibleEndX);
        return rect(left, bounds.top, right - left, bounds.height);
      };
      const conflicts = () => Array.from({length:slots},(_,i)=>lanes[lane+i] || []).some(items=>items.some(bounds => collides(bounds, occupiedBounds(), metrics.laneGapPx, 1)));
      while (conflicts()) {
        lane += 1;
        bounds = rect(draft.titleLeft, metrics.safeTopPx + lane * metrics.laneStepPx, draft.titleWidth, titleHeight);
      }
      const occupied = occupiedBounds();
      for(let i=0;i<slots;i++)(lanes[lane+i] || (lanes[lane+i] = [])).push(occupied);
      placed.push({ ...draft, lane, titleBounds: bounds, occupiedBounds: occupied, titleVisible: true });
    });
    return placed;
  }

  function assignEventTracks(items, options = {}) {
    const metrics = { ...DEFAULT_METRICS, ...options };
    return placeTaskTitles(items.slice(), finite(options.heightPx, 315), metrics);
  }

  function buildHandles(taskKey, titleBounds, metrics, instant) {
    const start = rect(titleBounds.left - metrics.handleWidthPx, titleBounds.top, metrics.handleWidthPx, titleBounds.height);
    const end = rect(titleBounds.right, titleBounds.top, metrics.handleWidthPx, titleBounds.height);
    const move = rect(titleBounds.left, titleBounds.top, titleBounds.width, titleBounds.height);
    return {
      parentTaskKey: taskKey,
      instant,
      start: { role: instant ? "instant" : "start", bounds: start },
      move: { role: "move", bounds: move },
      end: { role: instant ? "instant" : "end", bounds: end }
    };
  }

  function buildTaskUnit(item, metrics) {
    const titleBounds = item.titleBounds;
    const centerY = titleBounds.top + Math.min(titleBounds.height, metrics.titleHeightPx) / 2;
    const pointLeft = item.anchorX - metrics.markerSizePx / 2;
    const pointBounds = rect(pointLeft, centerY - metrics.markerSizePx / 2, metrics.markerSizePx, metrics.markerSizePx);
    const railLeft = item.isInstant ? item.anchorX : item.visibleStartX;
    const railWidth = item.isInstant ? 0 : Math.max(0, item.visibleEndX - item.visibleStartX);
    const railBounds = rect(railLeft, titleBounds.bottom + 2, railWidth, metrics.railHeightPx);
    return {
      taskKey: item.taskKey,
      eventId: item.eventId,
      sourcePath: item.sourcePath,
      sourcePaths: item.sourcePaths,
      layer: item.layer,
      color: item.color,
      kind: item.kind,
      readOnly: item.layer !== "task",
      detail: item.detail,
      canOpenSource: item.layer==='task'||/\.md$/i.test(item.sourcePath),
      status: item.status,
      startMs: item.startMs,
      endMs: item.endMs,
      isInstant: item.isInstant,
      anchorX: item.anchorX,
      lane: item.lane,
      clippedStart: item.clippedStart,
      clippedEnd: item.clippedEnd,
      title: {
        role: "primary-title",
        text: item.title,
        durationLabel: item.durationLabel,
        sourceLabel: item.sourceLabel,
        lines: item.titleLines || 1,
        visible: item.titleVisible !== false,
        fontWeight: 400,
        bounds: titleBounds
      },
      point: {
        role: "point",
        visible: item.titleVisible !== false,
        bounds: pointBounds
      },
      rail: {
        role: item.isInstant ? "instant-anchor" : "duration-rail",
        visible: !item.isInstant && item.titleVisible !== false,
        bounds: railBounds
      },
      handles: buildHandles(item.taskKey, titleBounds, metrics, item.isInstant)
    };
  }

  function layoutAnnotations(events, viewport, widthPx, heightPx, selectedId) {
    const range = viewportApi.visibleRange(viewport);
    const laneCount = heightPx < 190 ? 1 : 2;
    const units = [];
    const hidden = [];
    const candidates = events.filter(event => text(event.layer) === "annotation" &&
      event.startMs <= range.endMs && event.endMs >= range.startMs)
      .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) ||
        a.startMs - b.startMs || text(a.id).localeCompare(text(b.id)));
    candidates.forEach(event => {
      const annotation = event.payload?.annotation || event;
      const projectPath = text(annotation.projectPath);
      const projectName = text(annotation.projectName) || projectPath.split("/").pop()?.replace(/\.md$/i, "");
      const label = projectPath ? `${projectName} · ${text(event.title)}` : text(event.title);
      const left = clamp(viewportApi.dateMsToPx(viewport, event.startMs), 8, Math.max(8, widthPx - 10));
      const right = clamp(viewportApi.dateMsToPx(viewport, event.endMs), left + 2, Math.max(left + 2, widthPx - 8));
      let lane = 0;
      while (lane < laneCount && units.some(unit => unit.lane === lane && left < unit.bounds.right + 6 && right + 6 > unit.bounds.left)) lane += 1;
      const unit = {
        id: event.id, label, annotation, lane, selected: event.id === selectedId,
        startMs: event.startMs, endMs: event.endMs, isInstant: event.isInstant,
        color: /^#[\da-f]{6}$/i.test(event.color) ? event.color : "#8ab4f8",
        clippedStart: event.startMs < range.startMs, clippedEnd: event.endMs > range.endMs,
        bounds: rect(left, 8 + lane * 25, right - left, 21)
      };
      if (lane < laneCount) units.push(unit);
      else hidden.push(unit);
    });
    const usedLanes = units.length ? Math.max(...units.map(unit => unit.lane)) + 1 : 0;
    const height = usedLanes ? 8 + usedLanes * 25 + (hidden.length ? 20 : 0) : 0;
    return {
      annotationUnits: units,
      hiddenAnnotations: hidden,
      annotationHeightPx: height,
      annotationOverflowBounds: hidden.length ? rect(8, 8 + usedLanes * 25, Math.max(0, widthPx - 16), 20) : null
    };
  }

  function projectRenderPlan(options, index, viewport, widthPx, heightPx, metrics) {
    const normalize = path => text(path).replace(/\\/g,"/").split("#")[0].replace(/\/$/,"");
    const projects = (options.projects || []).map(p=>({...p,root:normalize(p.root),path:normalize(p.targetPath || p.path || p.root),items:[]})).filter(p=>p.root);
    const other = {root:"__other__",name:options.locale==="zh-CN"?"其他任务":"Other tasks",items:[]};
    const expanded=new Set(options.expandedProjects || []);
    const groups=groupTaskEvents(index.events.filter(e=>e.layer==="task"));
    const datedKeys=new Set(groups.map(g=>g.taskKey));
    for(const task of options.unplaced || []) if(!datedKeys.has(task.id))groups.push({taskKey:task.id,events:[],primary:task});
    for(const group of groups){
      const path=normalize(group.primary.source?.path);
      const candidates=projects.filter(p=>path===p.root || (!p.root.endsWith('.md')&&path.startsWith(p.root+'/')));
      candidates.sort((a,b)=>b.root.length-a.root.length);
      (candidates[0] || other).items.push(group);
    }
    if(other.items.length)projects.push(other);
    const rows=[],units=[],summaries=[];
    let top=8;
    for(const project of projects){
      // No empty lanes in the combined view; an explicitly selected project
      // remains visible so its source note is still reachable.
      if(!project.items.length && normalize(options.projectRoot)!==project.root)continue;
      distinguishSources(project.items,options.locale);
      project.items.sort((a,b)=>normalize(a.primary.source?.path).localeCompare(normalize(b.primary.source?.path)) || finite(a.primary.source?.line,0)-finite(b.primary.source?.line,0) || a.taskKey.localeCompare(b.taskKey));
      const open=expanded.has(project.root),events=project.items.flatMap(g=>g.events);
      const range=viewportApi.visibleRange(viewport);
      const visibleTaskCount=project.items.filter(group=>group.events.some(event=>event.startMs<=range.endMs&&event.endMs>=range.startMs)).length;
      const schedule=events.length?{startMs:Math.min(...events.map(event=>event.startMs)),endMs:Math.max(...events.map(event=>event.endMs))}:null;
      const showSchedule=open&&schedule&&visibleTaskCount===0;
      const headerHeight=showSchedule?50:32;
      rows.push({key:project.root,title:project.name,path:project.path||"",top,height:headerHeight,project:true,expanded:open,count:project.items.length,
        scheduledEventIds:events.map(event=>event.id),schedule,visibleTaskCount,
        outsideDirection:schedule?(schedule.endMs<range.startMs?'earlier':schedule.startMs>range.endMs?'later':'both'):null,
        unplacedTasks:project.items.filter(g=>!g.events.length).map(g=>g.primary)});
      if(events.length&&!open){
        const start=Math.min(...events.map(e=>e.startMs)),end=Math.max(...events.map(e=>e.endMs));
        const a=viewportApi.dateMsToPx(viewport,start),b=viewportApi.dateMsToPx(viewport,end);
        if(b>=0&&a<=widthPx)summaries.push({key:project.root,startMs:start,endMs:end,clippedStart:a<0,clippedEnd:b>widthPx,bounds:rect(clamp(a,0,widthPx),top+29,Math.max(2,clamp(b,0,widthPx)-clamp(a,0,widthPx)),6)});
      }
      top+=headerHeight+2;
      if(open)for(const group of project.items){
        if(!group.events.length)continue;
        for(const event of group.events){
          const draft=visibleDraft({taskKey:event.id,primary:event,sourceLabel:group.sourceLabel},viewport,widthPx,heightPx,options.measureText,metrics);
          if(draft){
            // Preserve source order without reserving space for off-screen occurrences.
            const compact=widthPx<=480;
            const visibleWidth=draft.visibleEndX-draft.visibleStartX;
            const available=Math.max(0,widthPx-(compact?47:16));
            const measured=measureTitleWidth(draft.title,options.measureText,{...metrics,maxTitleWidthPx:Math.max(available*2,1)},widthPx*2);
            const titleWidth=compact?available:Math.min(measured,available);
            const twoLines=compact&&measured>available;
            const rowHeight=(compact?(twoLines?56:38):36)+(draft.sourceLabel?16:0);
            rows.push({key:event.id,task:group.primary,top,height:rowHeight,project:false});
            const inline=!compact&&!draft.sourceLabel&&!draft.isInstant&&visibleWidth>=titleWidth+16;
            const titleLeft=compact?35:clamp(draft.visibleStartX+8,8,Math.max(8,widthPx-titleWidth-8));
            const bounds=rect(titleLeft,top+4,titleWidth,(twoLines?36:18)+(draft.sourceLabel?16:0));
            const unit=buildTaskUnit({...draft,titleLines:twoLines?2:1,titleBounds:bounds,titleVisible:true,lane:rows.length-1},metrics);
            unit.projectTask=true;
            unit.compactProject=compact;
            unit.inlineTitle=inline;
            unit.point.visible=draft.isInstant;
            const railTop=top+rowHeight-11;
            unit.point.bounds=rect(clamp(draft.visibleStartX-3,0,Math.max(0,widthPx-6)),railTop-1,6,6);
            const railWidth=Math.max(4,visibleWidth);
            const railLeft=clamp(draft.visibleStartX-(railWidth-visibleWidth)/2,0,Math.max(0,widthPx-railWidth));
            unit.rail.bounds=rect(railLeft,inline?top:railTop,railWidth,inline?26:4);
            // Labels may expand or shift at an edge; resize grips still track actual dates.
            unit.handles.start.bounds=rect(draft.visibleStartX-metrics.handleWidthPx,railTop-10,metrics.handleWidthPx,24);
            unit.handles.end.bounds=rect(draft.visibleEndX,railTop-10,metrics.handleWidthPx,24);
            if(visibleWidth<24){unit.handles.start.visible=false;unit.handles.end.visible=false;}
            const hitLeft=Math.max(0,Math.min(bounds.left,draft.visibleStartX-metrics.handleWidthPx));
            const hitRight=Math.min(widthPx,Math.max(bounds.right,draft.visibleEndX+metrics.handleWidthPx));
            unit.handleZoneBounds=rect(hitLeft,top,hitRight-hitLeft,rowHeight-2);
            unit.handles.move.bounds=unit.handleZoneBounds;
            units.push(unit);
            top+=rowHeight;
          }
        }
      }
      top+=4;
    }
    return {widthPx,heightPx,contentHeightPx:Math.max(heightPx,top+8),visibleRange:viewportApi.visibleRange(viewport),metrics,taskUnits:units,projectRows:rows,projectSummaries:summaries,hiddenTaskCount:0,annotationUnits:[],hiddenAnnotations:[]};
  }

  function buildRenderPlan(options = {}) {
    const widthPx = Math.max(0, finite(options.widthPx, options.viewport && options.viewport.widthPx || 0));
    const heightPx = Math.max(0, finite(options.heightPx, 315));
    const viewport = options.viewport;
    if (!viewport) throw new Error("Native task timeline layout requires viewport");
    const metrics = resolveMetrics(widthPx, options.metrics);
    const index = options.eventIndex && Array.isArray(options.eventIndex.events)
      ? options.eventIndex
      : eventIndexApi.createEventIndex(Array.isArray(options.events) ? options.events : []);
    if(options.groupBy==="projects")return projectRenderPlan(options,index,viewport,widthPx,heightPx,metrics);
    const annotations = layoutAnnotations(index.events, viewport, widthPx, heightPx, options.selectedAnnotationId);
    metrics.safeTopPx += annotations.annotationHeightPx;
    const groups = distinguishSources(groupTaskEvents(index.events),options.locale);
    const drafts = groups
      .map((group) => visibleDraft(group, viewport, widthPx, heightPx, options.measureText, metrics))
      .filter(Boolean);
    const placed = placeTaskTitles(drafts, heightPx, metrics);
    const taskUnits = placed.map((item) => buildTaskUnit(item, metrics));
    return {
      widthPx,
      heightPx,
      visibleRange: viewportApi.visibleRange(viewport),
      metrics,
      ...annotations,
      taskUnits,
      contentHeightPx: Math.max(heightPx, ...taskUnits.map(unit => unit.title.bounds.bottom + metrics.safeBottomPx)),
      hiddenTaskCount: 0
    };
  }

  function findLayoutCollisions(plan) {
    const units = plan && Array.isArray(plan.taskUnits)
      ? plan.taskUnits.filter((unit) => unit.title?.visible !== false)
      : [];
    const collisions = [];
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        if (collides(units[i].title.bounds, units[j].title.bounds, 0, 0)) {
          collisions.push({ firstTaskKey: units[i].taskKey, secondTaskKey: units[j].taskKey });
        }
      }
    }
    return collisions;
  }

  root.nativeLayout = {
    buildRenderPlan,
    assignEventTracks,
    placeTaskTitles,
    buildTaskUnit,
    findLayoutCollisions
  };

  if (globalThis.__NORIA_TASK_TIMELINE_TEST__) {
    globalThis.__noriaTaskTimelineLayoutTestHooks = root.nativeLayout;
  }
})();
