/* Run in the isolated NoriaTest vault after creating __noriaC3. */
(async()=>{
  const c=globalThis.__noriaC3;if(app.vault.getName()!=="NoriaTest"||c?.date!=="2001-02-12")throw Error("Isolated fixture required");
  const checks=c.checks||(c.checks=[]),check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
  const wait=async fn=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,75));}throw Error("Timed out");};
  const read=async()=>app.vault.read(app.vault.getAbstractFileByPath(c.path));
  let d=c.diary,q=d.captureComposer;
  check("historical capture preserves links, hard break and nested text",(await read()).includes("  \n  先原样留下"));
  check("historical capture has no fabricated time",!(await read()).includes("- ["));
  check("reading surface shows one quick note",d.content.querySelectorAll(".noria-diary-quick-note").length===1);
  check("native Markdown link survives",!!d.content.querySelector("a.internal-link"));
  q.input.value="切换日期后继续写的念头";await q.preserve();
  await d.select({mode:"daily",anchorDate:"2001-02-13"});
  const next=await c.p.resolveCalendarNoteSpecAsync("daily","2001-02-13");
  check("browsing another empty date creates nothing",!app.vault.getAbstractFileByPath(next.path));
  await d.select({mode:"daily",anchorDate:c.date});d.toggleCapture();q=d.captureComposer;await q.ready;
  check("changing dates recovers capture text",q.input.value==="切换日期后继续写的念头");
  const original=c.p.appendHomeQuickCapture;
  try{c.p.appendHomeQuickCapture=async()=>{throw Error("Acceptance write failure");};await q.save();check("failed capture retains text",q.input.value==="切换日期后继续写的念头");}
  finally{c.p.appendHomeQuickCapture=original;}
  await q.save();check("retry appends once",(await read()).split("切换日期后继续写的念头").length===2);
  const mood=d.stateHost.querySelector('[data-state-field="mood"]');mood.click();
  check("state uses the native menu",!!document.querySelector(".menu .menu-item"));
  [...document.querySelectorAll(".menu .menu-item")].find(item=>item.innerText.includes("稳定"))?.click();
  await wait(async()=>/^mood: 稳定$/m.test(await read()));
  check("mood persists once without changing quick note",(await read()).split("切换日期后继续写的念头").length===2);
  d.stateHost.querySelector('[data-state-field="energy"]').click();
  [...document.querySelectorAll(".menu .menu-item")].find(item=>item.innerText.includes("4 / 5"))?.click();
  await wait(async()=>/^energy: 4$/m.test(await read()));
  check("energy persists with mood",/^mood: 稳定$/m.test(await read()));
  d.stateHost.querySelector('[data-state-field="energy"]').click();
  [...document.querySelectorAll(".menu .menu-item")].find(item=>item.innerText.includes("清除"))?.click();
  await wait(async()=>!/^energy: 4$/m.test(await read()));
  check("clear removes the metric rather than writing zero",!/^energy: 0$/m.test(await read()));
  check("committed capture leaves no recovery draft",!await c.p.loadReviewRecoveryEntry(q.targetKey));
  const fs=require("fs");fs.writeFileSync("F:/NoriaTest/_acceptance-c-diary-capture-20260916/runtime-results.json",JSON.stringify(checks,null,2));
  return checks;
})()
