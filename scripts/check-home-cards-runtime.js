// Native acceptance for the shared Home card changes. Run only in NoriaTest.
(async () => {
  if (app.vault.getName() !== "NoriaTest") throw Error("Use NoriaTest only");
  const fs = require("fs"), win = require("@electron/remote").getCurrentWindow();
  const root = "F:/NoriaTest/_acceptance-c-cards-20260916";
  const q = { fs, win, root, checks: [], baseline: JSON.parse(fs.readFileSync(root + "/baseline/runtime.json", "utf8")) };
  globalThis.__noriaCardChecks = q;
  Object.defineProperty(q, "p", { get: () => app.plugins.plugins.noria });
  q.check = (name, ok, detail) => {
    q.checks.push({ name, ok: !!ok, detail });
    fs.writeFileSync(root + "/runtime-results.json", JSON.stringify(q.checks, null, 2));
    if (!ok) throw Error(name + ": " + JSON.stringify(detail));
  };
  q.wait = async fn => { const end = Date.now() + 10000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 40)); } throw Error("Timed out waiting for Home"); };
  q.home = async () => {
    q.leaf = app.workspace.getLeavesOfType("noria-dashboard-home")[0];
    await app.workspace.revealLeaf(q.leaf); app.workspace.setActiveLeaf(q.leaf, { focus: true });
    await q.wait(() => q.leaf.view.containerEl.querySelectorAll(".dashboard-habit-21-date-head").length && q.leaf.view.containerEl.querySelector('[data-noria-overview-panel-state="ready"]'));
    q.host = q.leaf.view.containerEl;
    return q.host;
  };
  q.card = id => q.host.querySelector('.dashboard-home-widget-shell[data-noria-widget-id="' + id + '"]');
  q.capture = async (name, element) => {
    await new Promise(r => setTimeout(r, 200)); win.webContents.invalidate();
    const r = element?.getBoundingClientRect();
    const rect = r && { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    fs.writeFileSync(root + "/" + name + ".png", (await win.webContents.capturePage(rect)).toPNG());
  };
  q.geometry = async () => {
    await q.home();
    for (const id of ["today-tasks-card", "inbox-card", "countdown-card", "habit-history-card", "projects-card", "moc-strip", "trends-range"]) {
      const card=q.card(id), r=card.getBoundingClientRect(), button=card.querySelector('[data-noria-widget-shell-action="menu"]'), b=button.getBoundingClientRect();
      q.check(id+" menu stays inside its own header", b.x >= r.x && b.right <= r.right && b.y >= r.y && b.bottom <= r.y+52, {card:r.toJSON(),menu:b.toJSON()});
      q.check(id+" has one card menu", card.querySelectorAll('[data-noria-widget-shell-action="menu"]').length === 1);
    }
    const cards=[q.card("habit-history-card").querySelector(".dashboard-home-trends-habit-history"),q.card("projects-card").querySelector(".dashboard-guide-projects"),q.card("moc-strip").querySelector(".dashboard-moc-strip")];
    const heights=cards.map(c=>c.getBoundingClientRect().height);
    q.check("Visible habit, project and MOC cards stretch to equal row height",Math.max(...heights)-Math.min(...heights)<3,heights);
    q.check("MOC provides one keyboard-focusable height handle",q.card("moc-strip").querySelectorAll('.dashboard-tray-resize-handle[tabindex="0"]').length===1);
    const name=q.host.querySelector(".dashboard-habit-21-name .dashboard-task-title"), moc=q.host.querySelector(".dashboard-moc-chip");
    q.check("Habit names use MOC font size and weight",getComputedStyle(name).fontSize===getComputedStyle(moc).fontSize && getComputedStyle(name).fontWeight===getComputedStyle(moc).fontWeight,{habit:[getComputedStyle(name).fontSize,getComputedStyle(name).fontWeight],moc:[getComputedStyle(moc).fontSize,getComputedStyle(moc).fontWeight]});
    const head=[...q.host.querySelectorAll(".dashboard-habit-21-date-head")];
    q.check("21 historical days occupy one date row",head.length===21 && Math.max(...head.map(e=>e.getBoundingClientRect().top))-Math.min(...head.map(e=>e.getBoundingClientRect().top))<1);
    const today=head.at(-1).getBoundingClientRect(), sc=q.host.querySelector(".dashboard-habit-history-scroll"),sr=sc.getBoundingClientRect();
    q.check("Narrow habit history initially shows today",today.right<=sr.right+1 && today.left>=sr.left && sc.scrollLeft>0);
    const fixed=name.getBoundingClientRect().x;sc.scrollLeft=0;await new Promise(r=>requestAnimationFrame(r));
    q.check("Habit names remain fixed while all history can be reached",Math.abs(name.getBoundingClientRect().x-fixed)<1 && head[0].getBoundingClientRect().x>=sr.left+130);
    sc.scrollLeft=sc.scrollWidth;
    q.check("Card add icons all use native plus SVG",[...q.host.querySelectorAll(".dashboard-guide-toolbar-plus, .dashboard-moc-strip__toolbar button")].every(e=>e.querySelector('svg.lucide-plus')));
    return {passed:q.checks.length};
  };
  q.resize = async () => {
    await q.home();const card=q.card("moc-strip"), handle=card.querySelector(".dashboard-tray-resize-handle");
    handle.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
    q.check("MOC height adjusts with keyboard",Number(card.querySelector(".dashboard-moc-host").dataset.noriaTrayResizeHeight)>300);
    handle.dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));
    q.check("MOC returns to automatic height",!card.querySelector(".dashboard-moc-host").style.minHeight);
    return {passed:q.checks.length};
  };
  q.range = async () => {
    for(const days of [7,14,30,90,21]) {
      await q.p.editHomeWidget({widgetId:"habit-history-card",action:"history-days",value:days});
      await q.home();await q.wait(()=>q.host.querySelectorAll(".dashboard-habit-21-date-head").length===days);
      q.check("Habit history renders selected "+days+" day range",q.host.querySelectorAll(".dashboard-habit-21-date-head").length===days);
    }
    return {passed:q.checks.length};
  };
  q.navigation = async () => {
    await q.home();const draft=q.host.querySelector(".noria-project-next-input, .noria-project-next-step input, input[placeholder='记下一步']");
    if(!draft)throw Error("Project input missing");const original=draft.value;draft.value="Unsubmitted card acceptance draft";draft.dispatchEvent(new Event("input",{bubbles:true}));
    for(const kind of ["open-inbox-workflow","open-inbox-queue","open-project-registry"]) {
      await q.home();const action=q.host.querySelector('[data-noria-action-kind="'+kind+'"]');
      if(!action)throw Error("Missing "+kind);
      const path=action.dataset.noriaActionTarget;await action.onclick(new MouseEvent("click"));
      q.check(kind+" opens its source and preserves Home",app.workspace.activeLeaf.id!==q.leaf.id && app.workspace.activeLeaf.view.file?.path===path);
      const id=app.workspace.activeLeaf.id,type=app.workspace.activeLeaf.view.getViewType();
      await q.home();await q.host.querySelector('[data-noria-action-kind="'+kind+'"]').onclick(new MouseEvent("click"));
      q.check(kind+" reuses the open source tab",app.workspace.activeLeaf.id===id,{type,path});
    }
    await q.home();q.check("Source navigation retains the project input draft",q.host.querySelector("input[placeholder='记下一步']")?.value===draft.value);
    const restored=q.host.querySelector("input[placeholder='记下一步']");restored.value=original;restored.dispatchEvent(new Event("input",{bubbles:true}));
    return {passed:q.checks.length};
  };
  win.webContents.setBackgroundThrottling(false);
  await q.home();
  return {ready:true};
})();
