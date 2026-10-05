/* Run inside the isolated Obsidian vault through the developer console/CLI. */
(() => {
  const q = globalThis.__noriaBoardChecks = { checks: [] };
  q.root = () => document.querySelector('.noria-tasks-host .tasksCalendar');
  q.check = (name, pass, detail) => { q.checks.push({ name, pass: !!pass, detail }); if (!pass) throw new Error(name + ': ' + JSON.stringify(detail)); };
  q.wait = async (predicate) => { for (let n=0; n<80; n++) { if (predicate()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Board condition timed out'); };
  q.frame = () => new Promise(resolve=>{ require('@electron/remote').getCurrentWindow().webContents.invalidate(); setTimeout(resolve,120); });
  q.weeks = () => [...q.root().querySelectorAll('.wrappers>.wrapper')];
  q.scroll = async () => {
    const weeks=q.weeks(), week=weeks.find(w=>w.scrollHeight-w.clientHeight>250);
    q.check('Dense week has an accessible shared scroll range', !!week);
    const original=weeks.map(w=>w.scrollTop);
    week.scrollTop=week.scrollHeight; await q.frame();
    const wr=week.getBoundingClientRect(), headers=[...week.querySelectorAll('.tc-month-date-header')];
    q.check('All seven date headers remain fixed while scrolling',headers.length===7 && headers.every(h=>Math.abs(h.getBoundingClientRect().top-wr.top)<2));
    q.check('Other weeks retain independent positions',weeks.every((w,i)=>w===week || w.scrollTop===original[i]));
    q.check('Day columns do not create nested scroll areas',[...week.querySelectorAll('.cellContent')].every(c=>getComputedStyle(c).overflowY==='visible' && c.scrollTop===0));
    const items=[...week.querySelectorAll('.tc-cal-item')], last=items.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
    q.check('Final task is reachable inside the week viewport',last.getBoundingClientRect().bottom<=wr.bottom+2,{last:last.innerText,task:last.getBoundingClientRect().toJSON(),week:wr.toJSON()});
    const firstHeader=headers[0].getBoundingClientRect();
    const hit=document.elementFromPoint(firstHeader.left+12,firstHeader.top+12);
    q.check('Scrolled task bars cannot cover the fixed date header',!!hit?.closest('.tc-month-date-header'));
    weeks.forEach((w,i)=>{w.scrollTop=original[i];}); await q.frame();
  };
  q.geometry = () => {
    let collisions=0, spanCount=0;
    for (const w of q.weeks()) {
      const bars=[...w.querySelectorAll('.tc-cal-item')].filter(n=>n.getBoundingClientRect().height>0);
      for (const n of w.querySelectorAll('.tc-month-span-overlay-item')) {
        spanCount++;
        q.check('Span uses computed absolute lane position',getComputedStyle(n).position==='absolute' && Math.abs(n.offsetTop-parseFloat(n.style.top))<1,{title:n.innerText,top:n.offsetTop,expected:n.style.top});
      }
      for(let i=0;i<bars.length;i++)for(let j=i+1;j<bars.length;j++) {
        const a=bars[i].getBoundingClientRect(),b=bars[j].getBoundingClientRect();
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) collisions++;
      }
    }
    q.check('Month contains real continuous multiday spans',spanCount>5,spanCount);
    q.check('Tasks never overlap within a week',collisions===0,collisions);
    const done=[...q.root().querySelectorAll('.tc-cal-item.done')];
    q.check('Completed titles remain fully readable',done.length>0 && done.every(n=>getComputedStyle(n).opacity==='1' && getComputedStyle(n.querySelector('.description,.internal-link')).opacity==='1'));
  };
  q.switching = async () => {
    const palette=[];
    for(const name of ['month','week','day','list']) {
      q.root().querySelector('.'+name+'View').click();
      await q.wait(()=>q.root().getAttribute('view')===name);
      q.root().querySelector('.tcNavToday').click();
      await q.frame();
      palette.push({view:name,background:getComputedStyle(q.root()).backgroundImage});
      const done=[...q.root().querySelectorAll('.tc-cal-item.done')];
      if(done.length) q.check(name+' completed tasks retain readable titles',done.every(n=>getComputedStyle(n).opacity==='1' && getComputedStyle(n.querySelector('.description,.internal-link')).opacity==='1'),done.map(n=>({text:n.innerText,opacity:getComputedStyle(n).opacity,title:getComputedStyle(n.querySelector('.description,.internal-link')).opacity})));
    }
    q.check('Month, week, day and quadrants share the same toolbar background',new Set(palette.map(p=>p.background)).size===1,palette);
    q.root().querySelector('.monthView').click(); await q.wait(()=>q.root().getAttribute('view')==='month'); await q.frame();
  };
  q.save = () => require('fs').writeFileSync('F:/NoriaTest/_acceptance-c-board-20260916/runtime-results.json',JSON.stringify({build:globalThis.__noriaRuntimeBuildId,checks:q.checks},null,2));
  q.appearance = async () => {
    const win=require('@electron/remote').getCurrentWindow(), bounds=win.getBounds(), maximized=win.isMaximized();
    const p=app.plugins.plugins.noria, locale=p.getNoriaLocale, wasDark=document.body.classList.contains('theme-dark');
    const oldBridge=globalThis.__noriaRuntimeBridge;
    const taskScope=structuredClone(p.settings.performance.queryScopes.tasks), momentLocale=moment.locale();
    const view=app.workspace.getLeavesOfType('noria-tasks-calendar')[0].view;
    const fs=require('fs'), dir='F:/NoriaTest/_acceptance-c-board-20260916';
    async function capture(name) {
      document.querySelectorAll('.tooltip').forEach(n=>n.remove());
      win.webContents.invalidate(); await q.frame();
      const r=q.root().getBoundingClientRect();
      fs.writeFileSync(dir+'/'+name+'.png',(await win.webContents.capturePage({x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height)})).toPNG());
    }
    try {
      // Actual dense month at a narrower desktop viewport, in both themes.
      if(maximized) { win.unmaximize(); await new Promise(r=>setTimeout(r,400)); }
      win.setBounds({x:0,y:0,width:1400,height:960}); await new Promise(r=>setTimeout(r,250));
      q.check('Narrow checks use an actual narrower native window',q.root().getBoundingClientRect().width<900,q.root().getBoundingClientRect().width);
      for(const dark of [false,true]) {
        document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('theme-light',!dark);
        await q.frame(); q.geometry(); await q.scroll(); await q.switching();
        await capture('month-narrow-'+(dark?'dark':'light'));
      }
      win.setBounds(bounds);document.body.classList.toggle('theme-dark',false);document.body.classList.toggle('theme-light',true);
      if(maximized)win.maximize();
      p.settings.performance.queryScopes.tasks={mode:'custom',customRoots:['Noria/Projects/Forum demo']};
      for(const lang of ['zh-CN','en']) {
        p.getNoriaLocale=()=>lang==='zh-CN'?'zh':'en';moment.locale(lang.toLowerCase());
        globalThis.__noriaRuntimeBridge=p.buildRuntimeBridgeConfig();
        view.cleanupNoriaTasksRuntime();view.hostEl.empty();
        await p.runNoriaView('tasksCalendar',{pages:'"Noria/Projects/Forum demo"',view:'month',startPosition:'2026-09-01'},view.hostEl);
        await q.wait(()=>q.root()?.querySelector('.tc-cal-item')); await q.frame();
        q.check(lang+' documentation uses only public demonstration tasks',[...q.root().querySelectorAll('.tc-cal-item')].every(n=>n.dataset.tcPath?.startsWith('Noria/Projects/Forum demo/')));
        for(const mode of ['month','week','day','list']) {
          q.root().querySelector('.'+mode+'View').click();await q.wait(()=>q.root()?.getAttribute('view')===mode);q.root().querySelector('.tcNavToday').click();await q.frame();
          await capture('public-'+lang+'-'+mode);
        }
      }
    } finally {
      p.getNoriaLocale=locale;p.settings.performance.queryScopes.tasks=taskScope;moment.locale(momentLocale);win.setBounds(bounds);if(maximized)win.maximize();
      globalThis.__noriaRuntimeBridge=oldBridge;
      document.body.classList.toggle('theme-dark',wasDark);document.body.classList.toggle('theme-light',!wasDark);
      await view.reload(); q.save();
    }
    return {checks:q.checks.length};
  };
  return 'Task board acceptance helpers ready';
})();
