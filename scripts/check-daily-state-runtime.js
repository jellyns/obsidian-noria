/* Synthetic input to the real state view, mounted in NoriaTest; no note writes. */
(async()=>{
  if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest required");
  const p=app.plugins.plugins.noria,fs=require("fs"),win=require("@electron/remote").getCurrentWindow();
  const dir="F:/NoriaTest/_acceptance-c-diary-capture-20260916",checks=[],cleanups=[];
  const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});if(!ok)throw Error(name);};
  const host=document.body.createDiv({cls:"dashboard-home-root"});host.style.cssText="display:block;position:fixed;left:100px;top:140px;width:740px;z-index:5000;background:var(--background-primary);padding:16px;border-radius:12px";
  const locale=p.getNoriaLocale,wasDark=document.body.classList.contains("theme-dark");
  const base=p.buildRuntimeBridgeConfig();let clicked="";
  const row=(date,mood,energy,focus="",weather="")=>({file:{name:date,path:"isolated-state-fixture/"+date+".md"},mood,energy,focus,weather});
  try{
    for(const lang of ["zh-CN","en"]){p.getNoriaLocale=()=>lang==="en"?"en":"zh";
      for(const kind of ["empty","sparse","dense"]){
        cleanups.splice(0).forEach(fn=>fn());host.empty();
        const rows=kind==="empty"?[]:kind==="sparse"?[row("2001-02-12","稳定",4),row("2001-02-14","很好","")]:Array.from({length:12},(_,i)=>row("2001-02-"+String(i+10).padStart(2,"0"),["稳定","很好","一般"][i%3],i===4?"":i%5+1));
        const bridge=p.buildRuntimeBridgeConfig();bridge.runtime={...bridge.runtime,pagesForManagedPath:()=>rows};bridge.openDiary=async date=>{clicked=date;return base.openDiary(date);};
        const code=fs.readFileSync("F:/Noria/obsidian-noria/src/runtime/views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js","utf8");
        await new Function("input","ctx","return "+code)({mount:host,noriaBridge:bridge,statsRange:{start:"2001-02-10",end:"2001-02-24"},registerCleanup:fn=>cleanups.push(fn)},{container:host,io:{load:async()=>""}});
        if(kind==="empty")check(lang+" empty state has a direct record action",!!host.querySelector(".dashboard-daily-state-empty")&&!host.textContent.includes("0.0"));
        if(kind==="sparse"){
          check(lang+" sparse records are readable date rows",host.querySelectorAll(".dashboard-daily-state-record").length===2,host.textContent);
          check(lang+" mean includes only one recorded energy",host.textContent.includes("4.0")||host.textContent.includes("4 / 5")||host.textContent.includes("4.0/5"),host.textContent);
          host.querySelector('[data-date="2001-02-12"]').click();await new Promise(r=>setTimeout(r,300));
          const d=app.workspace.getLeavesOfType("noria-dashboard-home")[0].view.workbench.diary;
          check(lang+" clicking a state opens the matching diary",clicked==="2001-02-12"&&d.selection.anchorDate===clicked);
        }
        if(kind==="dense"){
          check(lang+" dense grid has a cell for every date",host.querySelectorAll(".dashboard-daily-state-day").length===15);
          check(lang+" missing energy remains an unknown dash",host.querySelector('[data-date="2001-02-14"] .dashboard-daily-state-energy')?.textContent==="—");
        }
        for(const dark of [false,true]){
          document.body.classList.toggle("theme-dark",dark);document.body.classList.toggle("theme-light",!dark);
          host.style.width=dark?"360px":"740px";win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));
          check(lang+" "+kind+" "+(dark?"narrow dark":"wide light")+" stays in its card",host.scrollWidth<=host.clientWidth+1);
          const r=host.getBoundingClientRect();fs.writeFileSync(dir+"/state-"+kind+"-"+lang+"-"+(dark?"dark":"light")+".png",(await win.webContents.capturePage({x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height)})).toPNG());
        }
      }
    }
    return {checks:checks.length,failed:checks.filter(c=>!c.ok)};
  }finally{
    cleanups.forEach(fn=>fn());host.remove();p.getNoriaLocale=locale;
    document.body.classList.toggle("theme-dark",wasDark);document.body.classList.toggle("theme-light",!wasDark);
    fs.writeFileSync(dir+"/state-results.json",JSON.stringify({build:globalThis.__noriaRuntimeBuildId,fixture:"synthetic rendering input; no files written",checks},null,2));
  }
})()
