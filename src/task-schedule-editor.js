"use strict";

function schedulePatch(initial,rows){
  const kept=new Set(),commands=[];
  for(const row of rows){
    if(row.index!=null&&(!Number.isInteger(row.index)||!initial[row.index]))throw new Error("invalid-schedule-index");
    const old=Number.isInteger(row.index)?initial[row.index]:null;
    if(old)kept.add(row.index);
    const empty=!row.start&&!row.end;
    if(old?.error&&empty)continue; // Keep unreadable source until explicitly edited or removed.
    if(old){
      if(empty)commands.push({action:"remove",index:row.index});
      else if(old.error||old.start!==row.start||old.end!==row.end)commands.push({action:"update",index:row.index,start:row.start,end:row.end});
    }else if(!empty)commands.push({action:"add",start:row.start,end:row.end});
  }
  initial.forEach((_,index)=>{if(!kept.has(index))commands.push({action:"remove",index});});
  return commands;
}

function createTaskScheduleEditor({document,initial=[],createDateField,iconButton,t,onChange=()=>{},closeTimePopover=()=>{},getDeadline=()=>""}){
  const root=document.createElement("section");root.className="tc-planner-te-schedules";
  const head=document.createElement("div");head.className="tc-planner-te-schedule-head";
  const label=document.createElement("span");label.className="tc-planner-te-label";label.textContent=t("workbench.schedule");
  const add=iconButton("ghost","plus",t("workbench.scheduleAdd"));add.classList.add("tc-planner-te-schedule-add");
  head.append(label,add);root.append(head);
  const list=document.createElement("div");list.className="tc-planner-te-schedule-list";root.append(list);
  let rows=[],serial=0;
  const snapshot=()=>rows.map(row=>({index:row.index,startDate:row.start.dateInput.value,startTime:row.start.timeInput.value,endDate:row.end.dateInput.value,endTime:row.end.timeInput.value,expanded:!row.end.field.hidden}));
  function append(data={},focus=false){
    const id=++serial,old=Number.isInteger(data.index)?initial[data.index]:null;
    const el=document.createElement("div");el.className="tc-planner-te-schedule-row";
    const start=createDateField(t("workbench.scheduleStart"),"tc-schedule-"+id+"-start",old?.start||"",true);
    const end=createDateField(t("workbench.scheduleEnd"),"tc-schedule-"+id+"-end",old?.end||"",true);
    if(Object.hasOwn(data,"startDate")){
      start.dateInput.value=data.startDate;start.timeInput.value=data.startTime||"";
      end.dateInput.value=data.endDate||"";end.timeInput.value=data.endTime||"";
    }
    end.field.hidden=!(data.expanded||end.dateInput.value||end.timeInput.value||start.timeInput.value);
    const row={index:data.index,el,start,end};rows.push(row);
    const actions=document.createElement("div");actions.className="tc-planner-te-schedule-actions";
    const expand=iconButton("ghost","move-right",t("workbench.scheduleAddEnd"));expand.classList.add("tc-planner-te-schedule-expand");
    const remove=iconButton("ghost","x",t("workbench.scheduleRemove"));remove.classList.add("tc-planner-te-schedule-remove");
    const warning=document.createElement("div");warning.className="tc-planner-te-schedule-warning";
    warning.setAttribute("role","status");
    row.refreshDeadline=()=>{
      const startValue=start.readDateTimeString(),endValue=end.readDateTimeString(),last=endValue||startValue,deadline=getDeadline();
      const past=last&&deadline&&(last.length>10&&deadline.length>10?last>deadline:last.slice(0,10)>deadline.slice(0,10));
      warning.textContent=old?.error&&!startValue&&!endValue?t("workbench.scheduleUnreadable")+" · "+old.raw:past?t("workbench.schedulePastDue"):"";
      warning.hidden=!warning.textContent;
    };
    const sync=()=>{
      if(start.timeInput.value)end.field.hidden=false;
      expand.hidden=!end.field.hidden;expand.setAttribute("aria-expanded",String(!end.field.hidden));
      for(const parts of [start,end]){parts.dateInput.classList.toggle("is-empty",!parts.dateInput.value);parts.timeInput.classList.toggle("is-empty",!parts.timeInput.value);}
      row.refreshDeadline();
      onChange();
    };
    expand.onclick=()=>{end.field.hidden=false;sync();end.dateInput.focus();};
    remove.onclick=()=>{
      closeTimePopover();const at=rows.indexOf(row);rows.splice(at,1);el.remove();onChange();
      (rows[at]?.start.dateInput||rows[at-1]?.start.dateInput||add).focus();
    };
    // Filling only an end time means the selected start date, not today's date.
    end.timeInput.addEventListener("input",()=>{if(end.timeInput.value&&!end.dateInput.value&&start.dateInput.value)end.dateInput.value=start.dateInput.value;});
    el.addEventListener("input",sync);
    actions.append(expand,remove);el.append(start.field,end.field,actions,warning);list.append(el);sync();
    if(focus)start.dateInput.focus();
  }
  function restore(draft){closeTimePopover();rows=[];list.replaceChildren();for(const row of draft)append(row);onChange();}
  add.onclick=()=>append({},true);
  for(let index=0;index<initial.length;index++)append({index});
  return {element:root,snapshot,restore,
    refreshDeadline:()=>rows.forEach(row=>row.refreshDeadline()),
    dateParts:()=>rows.flatMap(row=>[row.start,row.end]),
    patch:()=>schedulePatch(initial,rows.map(row=>({index:row.index,start:row.start.readDateTimeString(),end:row.end.readDateTimeString()})))
  };
}
module.exports={createTaskScheduleEditor,schedulePatch};
