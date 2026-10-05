// Evaluate in the real NoriaTest renderer. Fixtures are owned, isolated notes.
(async()=>{
  if(app.vault.getName()!=='NoriaTest')throw new Error('NoriaTest required');
  const fs=require('fs'),crypto=require('crypto'),p=app.plugins.plugins.noria;
  const base='F:/NoriaTest/_acceptance-b-handoff-20260914/',q=window.__noriaHandoff={checks:[],owned:new Set(),base};
  q.check=(ok,name)=>{q.checks.push({name,passed:!!ok});if(!ok)throw new Error(name);};
  q.wait=async fn=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+fn.toString());};
  q.raw=relative=>fs.readFileSync('F:/NoriaTest/'+relative,'utf8');
  q.seed=async(relative,text)=>{if(app.vault.getAbstractFileByPath(relative))throw new Error('Existing fixture: '+relative);q.owned.add(relative);await p.ensureVaultParent(relative);return app.vault.create(relative,text);};
  q.registry='_acceptance-b-handoff-20260914/fixtures/Habits.md';
  q.registryText='## Active habits\n- 散步\n- 阅读 [type::number] [target::20] [unit::分钟]\n## Daily recurring task source\n- [ ] 散步 #habit [due::2003-06-01]\n- [x] 阅读 #habit [type::number] [target::20] [unit::分钟] [due::2003-06-02]\n';
  await q.seed(q.registry,q.registryText);
  q.show=async(date,view)=>{
    const spec=await p.resolveCalendarNoteSpecAsync('daily',date);
    const text='---\ncssclasses: [daily-clean]\n---\n## 记录\n保留这段原文。\n\n```noria-view\n'+JSON.stringify({view,props:{sourcePath:q.registry}})+'\n```\n';
    const file=await q.seed(spec.path,text),leaf=app.workspace.getLeaf('tab');
    await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});q.leaf=leaf;
    await q.wait(()=>leaf.view.contentEl.querySelector('.noria-diary-habit-row'));
    return {spec,text,leaf};
  };
  q.embedded=async()=>{
    const first=await q.show('2003-06-01','focusPanel');
    let check=first.leaf.view.contentEl.querySelector('.daily-focus-card.habit input[type=checkbox]');
    q.check(!!check&&!check.checked,'focusPanel reads the explicitly configured registry');check.click();
    await q.wait(()=>q.raw(first.spec.path).includes('- [x] 散步'));
    q.check(q.raw(q.registry)===q.registryText,'legacy registry stays byte-identical after check-in');
    q.check(q.raw(first.spec.path).includes(first.text),'embedded check-in preserves the original note');
    await q.wait(()=>first.leaf.view.contentEl.querySelector('.daily-focus-card.habit input[type=checkbox]')?.checked);
    first.leaf.view.contentEl.querySelector('.daily-focus-card.habit input[type=checkbox]').click();
    await q.wait(()=>q.raw(first.spec.path).includes('- [ ] 散步'));
    q.check(!q.raw(first.spec.path).includes('- [x] 散步'),'embedded check-in can withdraw a dated result');
    const second=await q.show('2003-06-02','habitCheckin');
    let row=second.leaf.view.contentEl.querySelector('.noria-diary-habit-row');
    q.check(row.querySelector('.noria-diary-habit-value').textContent==='—','legacy completion does not fabricate the target as an actual value');
    row.querySelector('button').click();let input=row.querySelector('input');input.value='0';row.querySelector('form').requestSubmit();
    await q.wait(()=>q.raw(second.spec.path).includes('[value:: 0]'));
    q.check(q.raw(second.spec.path).includes('- [ ] 阅读'),'actual zero is saved without marking the target achieved');
    q.check(q.raw(q.registry)===q.registryText,'quantitative entry also leaves the old registry unchanged');
    await p.openDiaryInHome({period:'daily',date:'2003-06-02',intent:'record'});
    const home=app.workspace.getLeavesOfType('noria-dashboard-home').find(l=>l.view.workbench?.active==='diary');q.home=home;
    await q.wait(()=>home.view.workbench.diary.habitHost.querySelector('[data-habit="阅读"]'));
    row=home.view.workbench.diary.habitHost.querySelector('[data-habit="阅读"]');
    q.check(row.querySelector('.noria-diary-habit-value').textContent==='0分钟','Diary reads the same actual value written from the embedded control');
    row.querySelector('button').click();input=row.querySelector('input');input.value='25';row.querySelector('form').requestSubmit();
    await q.wait(()=>q.raw(second.spec.path).includes('[value:: 25]'));
    q.check(q.raw(second.spec.path).includes('- [x] 阅读'),'shared Diary control writes the updated result to the same source');
    await q.wait(()=>!home.view.workbench.diary.session.dirty);
    return {checks:q.checks.length};
  };
  q.finish=async()=>{
    await app.plugins.plugins.noria.openDiaryInHome({period:'daily',date:'2026-09-14',intent:'record'});
    for(const leaf of app.workspace.getLeavesOfType('markdown'))if(q.owned.has(leaf.view.file?.path))leaf.detach();
    for(const relative of q.owned){const file=app.vault.getAbstractFileByPath(relative);if(file)await app.vault.delete(file);}
    q.check(fs.readFileSync(base+'habits-before.md','utf8')===q.raw('Noria/Habits.md'),'configured test habit registry is unchanged');
    const before=JSON.parse(fs.readFileSync(base+'before.json','utf8'));
    const mismatches=before.notes.filter(entry=>crypto.createHash('sha256').update(q.raw(entry.path)).digest('hex')!==entry.sha256);
    q.check(!mismatches.length,'all pre-existing isolated diary notes remain byte-identical');
    fs.writeFileSync(base+'runtime-results.json',JSON.stringify({checks:q.checks,cleaned:[...q.owned],mismatches},null,2));
    return {passed:q.checks.length,cleaned:q.owned.size};
  };
  return 'Embedded habit acceptance ready';
})()
