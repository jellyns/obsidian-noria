"use strict";

// One local calendar clock per plugin. Each subscriber acknowledges its own day:
// a view with a draft may defer refreshing without delaying other views.
class DayClock {
  constructor(readToday){
    this.readToday=readToday;this.entries=new Set();this.windows=new Map();this.disposed=false;
    this.timer=setInterval(()=>void this.check(),30000);
  }
  watch(refresh,win){
    const entry={refresh,day:this.readToday(),busy:false};this.entries.add(entry);
    if(win){let scope=this.windows.get(win);if(!scope){
      const check=()=>void this.check();scope={count:0,check};this.windows.set(win,scope);
      win.addEventListener("focus",check);win.document.addEventListener("visibilitychange",check);win.document.addEventListener("focusout",check);
    }scope.count++;}
    return ()=>{this.entries.delete(entry);if(win){const scope=this.windows.get(win);if(scope&&!--scope.count){this.unbind(win,scope);this.windows.delete(win);}}};
  }
  unbind(win,scope){win.removeEventListener("focus",scope.check);win.document.removeEventListener("visibilitychange",scope.check);win.document.removeEventListener("focusout",scope.check);}
  async check(){
    if(this.disposed)return;
    const day=this.readToday();
    await Promise.all([...this.entries].map(async entry=>{
      if(entry.busy||entry.day===day)return;
      entry.busy=true;
      try{if(await entry.refresh(day)!==false&&this.entries.has(entry))entry.day=day;}
      catch(error){console.warn("[noria] day refresh deferred",error);}
      finally{entry.busy=false;}
    }));
  }
  dispose(){this.disposed=true;clearInterval(this.timer);this.entries.clear();for(const [win,scope] of this.windows)this.unbind(win,scope);this.windows.clear();}
}
function assertCurrentDay(plugin,expected){
  if(!expected||expected===plugin.getLocalYmd())return;
  void plugin.dayClock?.check();
  throw Error(plugin.getNoriaLocale?.()==="zh"?"日期已变化，请关闭面板，刷新后重新选择今天；本次未写入。":"The day has changed. Close this panel and select today again after refresh. Nothing was saved.");
}
module.exports={DayClock,assertCurrentDay};
