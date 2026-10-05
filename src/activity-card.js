"use strict";
const {Component,MarkdownRenderer,setIcon,Notice}=require("obsidian");
const {loadActivityPage}=require("./activity-model.js");
const {prepareReviewPreview}=require("./review-document.js");
const {decorateDiaryQuickNotes}=require("./quick-capture.js");
const {iconButton}=require("./card-controls.js");

function registerActivityCard(system){
  const {plugin}=system,text=(zh,en)=>system.text(zh,en);
  system.register({id:"noria:activity",title:text("活动记录","Activity"),icon:"list-collapse",supportsDate:true,
    description:text("按日期回看记录、闪念和任务动态，原内容仍在源笔记。","Browse notes, captures and task events by date, from their original sources."),
    fields:[{key:"records",label:text("日记与闪念","Diary and captures"),type:"checkbox",default:true},
      {key:"tasks",label:text("任务创建与完成","Task creation and completion"),type:"checkbox",default:true},
      {key:"ctime",label:text("笔记创建","Note creation"),type:"checkbox",default:false},
      {key:"mtime",label:text("笔记最后修改（非编辑历史）","Last note modification (not edit history)"),type:"checkbox",default:false},
      {key:"pageSize",label:text("每批日期数","Dates per batch"),type:"select",default:"14",options:[7,14,30].map(n=>({value:String(n),label:String(n)}))}],
    render:async({container,component,config,selection,openSource})=>{
      const selected=plugin.resolveReviewSelection(selection?.mode?selection:{mode:"weekly",anchorDate:plugin.getLocalYmd()});
      const diary=container.closest(".noria-diary"),excludePaths=[];
      if(diary){const spec=await plugin.resolveCalendarNoteSpecAsync(selected.mode,selected.anchorDate);excludePaths.push(spec.path);}
      const size=[7,14,30].includes(Number(config.pageSize))?Number(config.pageSize):14;
      let limit=size,generation=0,disposed=false,timer,child;
      container.addClass("noria-activity");
      const render=async()=>{
        const serial=++generation;
        try{
          const page=await loadActivityPage(plugin,{selection:selected,config,excludePaths,limit});
          if(disposed||serial!==generation)return;
          if(child)component.removeChild(child);child=new Component();component.addChild(child);container.empty();
          const summary=container.createDiv({cls:"noria-activity-summary"});summary.createSpan({text:`${page.range.start} — ${page.range.end}`});
          iconButton(summary,"refresh-cw",text("刷新活动记录","Refresh activity"),()=>void render());
          for(const group of page.groups){
            const section=container.createEl("section",{cls:"noria-activity-day"});
            section.createEl("h3",{text:group.date});
            for(const item of group.items){
              const row=section.createDiv({cls:"noria-activity-event",attr:{"data-activity-id":item.id,"data-activity-kind":item.kind}});
              if(item.kind==="record"){
                const prose=row.createDiv({cls:"markdown-rendered noria-activity-prose"});
                prose.addEventListener("click",event=>{const link=event.target.closest?.("a.internal-link");if(link?.dataset.href){event.preventDefault();void plugin.app.workspace.openLinkText(link.dataset.href,item.path,true).catch(error=>new Notice(error.message));}});
                await MarkdownRenderer.render(plugin.app,prepareReviewPreview(item.markdown,{sourcePath:item.path}),prose,item.path,child);
                if(disposed||serial!==generation)return;
                decorateDiaryQuickNotes(prose,text("未记录时间","Time not recorded"));
                prose.querySelectorAll('input[type="checkbox"]').forEach(el=>el.disabled=true);
                iconButton(row,"file-text",text("打开来源","Open source"),()=>void openSource(item.path));
              }else{
                const labels={"task-created":["创建任务","Task created"],"task-done":["完成任务","Task completed"],"note-created":["创建笔记","Note created"],"note-modified":["最后修改","Last modified"]};
                setIcon(row.createSpan({cls:"noria-activity-event-icon"}),item.kind==="task-done"?"check-check":item.kind==="task-created"?"list-plus":"file-pen");
                const body=row.createDiv({cls:"noria-activity-event-body"});body.createSpan({cls:"noria-card-secondary",text:[item.time,text(...labels[item.kind])].filter(Boolean).join(" · ")});
                const link=body.createEl("button",{cls:"noria-activity-link",text:item.title,attr:{type:"button"}});
                link.onclick=()=>Promise.resolve(openSource(item.path)).catch(error=>new Notice(error.message));
              }
            }
          }
          if(!page.groups.length)container.createDiv({cls:"noria-card-empty",text:diary?text("本期没有其他活动；当前日记内容保留在正文。","No other activity in this period. The current diary stays in its body."):text("本期没有符合条件的活动记录。","No matching activity in this period.")});
          if(page.ambiguous)container.createDiv({cls:"noria-card-secondary",text:text("部分日期或复盘范围不明确的来源未展开。","Some sources have ambiguous dates or review boundaries and were not expanded.")});
          if(page.hasMore){const more=container.createEl("button",{cls:"noria-activity-more",text:text("加载更早记录","Load earlier records")});more.onclick=()=>{more.disabled=true;limit+=size;void render();};}
        }catch(error){if(!disposed&&serial===generation){container.empty();container.createDiv({cls:"noria-card-error",text:error.message});const retry=container.createEl("button",{text:text("重试","Retry")});retry.onclick=()=>void render();}}
      };
      const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void render(),250);};
      component.registerEvent(plugin.app.metadataCache.on("changed",schedule));
      component.registerEvent(plugin.app.vault.on("delete",schedule));
      component.registerEvent(plugin.app.vault.on("rename",schedule));
      component.register(()=>{disposed=true;++generation;clearTimeout(timer);});
      await render();
    }});
}
module.exports={registerActivityCard};
