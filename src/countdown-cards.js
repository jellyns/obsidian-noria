"use strict";
const {Notice,setTooltip}=require("obsidian");
const {RecordManager}=require("./record-manager.js");
const {readCountdowns,updateCountdown,dayNumber,countdownProgress}=require("./countdown-document.js");
const {cleanTaskTitle,getTaskDate}=require("./runtime/views/dashboard/core/utils/task-display.js");
const {iconButton}=require("./card-controls.js");

class CountdownCards {
  constructor(plugin){this.plugin=plugin;this.app=plugin.app;this.views=new Set();this.timer=null;
    plugin.registerEvent(this.app.metadataCache.on("changed",()=>this.schedule()));
    const stopDay=plugin.dayClock?.watch(()=>this.schedule());if(stopDay)plugin.register(stopDay);
    plugin.register(()=>{clearTimeout(this.timer);for(const view of [...this.views])view.dispose();});
  }
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  path(){return this.plugin.getManagedPath("importantDates");}
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{for(const view of [...this.views]){if(view.host.isConnected)void view.refresh();else view.dispose();}},180);}
  async records(){const file=this.app.vault.getAbstractFileByPath(this.path());return readCountdowns(file?await this.app.vault.read(file):"").rows;}
  async write(original,patch){
    await this.plugin.processTextAtVaultPath(this.path(),text=>updateCountdown(text,original,patch,{id:crypto.randomUUID(),zh:this.plugin.getNoriaLocale()==="zh"}));this.schedule();
  }
  manager(initial=false){
    const today=this.plugin.getLocalYmd();
    const manager=new RecordManager(this.plugin,{title:this.text("倒计时","Countdowns"),initial,initialFilter:"active",
      filters:[{value:"active",label:this.text("进行中","Active")},{value:"expired",label:this.text("已到期","Expired")},{value:"archived",label:this.text("已归档","Archived")}],
      list:async()=>(await this.records()).map(row=>({...row,id:row.id||`line-${row.line}`,recordId:row.id,stage:row.archived?"archived":row.date<today?"expired":"active"})),
      summary:row=>`${row.start?row.start+" → ":""}${row.date}${row.type?" · "+row.type:""}`,
      defaults:()=>({name:"",start:today,date:"",type:"",archived:false}),
      fields:[{key:"name",label:this.text("名称","Name"),required:true},{key:"start",label:this.text("开始日期","Start date"),type:"date"},
        {key:"date",label:this.text("截止日期","End date"),type:"date",required:true},{key:"type",label:this.text("类型（可选）","Type (optional)")},
        {key:"archived",label:this.text("归档","Archive"),type:"checkbox",when:row=>!!row.id}],
      save:(draft,original)=>this.write(original?{...original,id:original.recordId}:null,draft),
      actions:row=>[{label:this.text(row.archived?"恢复":"归档",row.archived?"Restore":"Archive"),icon:row.archived?"archive-restore":"archive",run:()=>this.write({...row,id:row.recordId},{archived:!row.archived})}]
    });manager.open();return manager;
  }
  async render(host,{actionsHost}={}){
    let disposed=false,generation=0;
    const view={host,refresh:async()=>{
      const serial=++generation,today=this.plugin.getLocalYmd();
      try{
        const [records,tasks]=await Promise.all([this.records(),this.plugin.getRuntimeTaskRows("tasks")]);
        if(disposed||serial!==generation)return;
          host.empty();host.addClass("noria-countdowns");
        const manual=records.filter(row=>!row.archived);
        const due=tasks.filter(task=>!task.completed&&/(^|\s)#due\b/.test(task.text||"")&&getTaskDate(task,"due")).map(task=>({task,date:getTaskDate(task,"due"),start:getTaskDate(task,"start"),name:cleanTaskTitle(task.text)}));
        const all=[...manual,...due].sort((a,b)=>a.date.localeCompare(b.date)),active=all.filter(row=>row.date>=today);
        for(const row of active)this.row(host,row,today);
        if(!active.length){host.createDiv({cls:"noria-card-empty",text:this.text("为下一件期待的事留一个日期。","Set a date for something you look forward to.")});}
        if(!actionsHost)host.append(add);
      }catch(error){if(!disposed&&serial===generation){host.empty();host.createDiv({cls:"noria-card-error",text:error.message});}}
    },dispose:()=>{if(disposed)return;disposed=true;++generation;add.remove();this.views.delete(view);}};
    const add=iconButton(actionsHost||host,"plus",this.text("新增倒计时","Add countdown"),()=>this.manager(true));add.addClass("dashboard-countdown-add-btn");
    const shell=host.closest(".dashboard-home-widget-shell");if(shell)shell._noriaConfigureWidget=()=>this.manager();
    this.views.add(view);await view.refresh();
    // Emptying a stand-alone body removes its button; keep the action after its content.
    if(!actionsHost)host.append(add);
    return view.dispose;
  }
  row(parent,row,today){
    const days=dayNumber(row.date)-dayNumber(today),progress=countdownProgress(row.start,row.date,today);
    const item=parent.createDiv({cls:"noria-countdown",attr:{"data-countdown-date":row.date,"data-countdown-kind":row.task?"due":"manual"}});
    const open=()=>row.task?this.plugin.openTaskDetails({...row.task,path:row.task.path||row.task.from,rawText:row.task.rawText||row.task.rawLine},{anchor:title,onSaved:()=>this.schedule()}):this.manager(row.id||`line-${row.line}`);
    const title=item.createEl("button",{cls:"noria-countdown-main",attr:{type:"button"}});title.createSpan({cls:"noria-countdown-name",text:row.name});
    const remaining=title.createSpan({cls:"noria-countdown-remaining"});
    if(days===0)remaining.createSpan({text:this.text("就是今天","Today")});
    else{remaining.createSpan({cls:"noria-countdown-unit",text:this.text(days<0?"已过":"还有",days<0?"Passed":"In")});remaining.createSpan({cls:"noria-countdown-number",text:String(Math.abs(days))});remaining.createSpan({cls:"noria-countdown-unit",text:this.text("天","days")});}
    title.onclick=()=>{Promise.resolve(open()).catch(e=>new Notice(e.message));};
    setTooltip(title,`${row.start?row.start+" → ":""}${row.date}`);
    const track=item.createDiv({cls:"noria-countdown-track"});track.dataset.progress=progress==null?"unknown":"known";
    track.title=progress==null?this.text("设置开始日期后显示进度","Set a start date to show progress"):Math.round(progress)+"%";
    const fill=track.createDiv({cls:"noria-countdown-fill"});fill.style.width=`${progress??0}%`;

  }
}
module.exports={CountdownCards};
