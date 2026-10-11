"use strict";
const {recordPopover}=require('./record-popover.js');
const {iconButton}=require('./card-controls.js');
const V=require('./record-visual.js');
function editEntries(records,anchor,field,{state,date,onSave,report,title}){
  const text=(a,b)=>records.text(a,b);
  return recordPopover(anchor,title,(host,close)=>{
    host.addClass('noria-record-entry-editor');host.style.setProperty('--noria-record-color',records.color(field));
    const summary=host.createDiv({cls:'noria-entry-summary'});
    summary.createSpan({text:text(state.aggregation==='sum'?'当日合计':'最近一次',state.aggregation==='sum'?'Daily total':'Latest entry')});
    summary.createSpan({text:records.display(field,state.value)});
    const form=host.createEl('form'),inputs=form.createDiv({cls:'noria-entry-inputs'});
    const timeLabel=inputs.createEl('label',{text:text('时间','Time')}),time=timeLabel.createEl('input',{attr:{type:'time','aria-label':text('记录时间，可留空','Entry time, optional')}});
    const now=new Date();time.value=date===records.plugin.getLocalYmd()?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'):'';
    let selected=null,input,editing=null,saving=false;
    const valueLabel=inputs.createEl('label',{text:field.name+(field.type==='number'&&field.unit?' · '+field.unit:'')});
    if(field.type==='number'){input=valueLabel.createEl('input',{attr:{type:'number',step:'any',required:'','aria-label':field.name}});}
    else {
      inputs.addClass('has-state-choices');
      const choices=valueLabel.createDiv({cls:'noria-record-options'});choices.style.setProperty('--noria-options',String(Math.min(5,V.choices(field).length)));
      for(const value of V.choices(field)){const appearance=V.appearance(field,value),b=choices.createEl('button',{cls:'noria-record-choice',attr:{type:'button','aria-pressed':'false'}});b.style.setProperty('--noria-record-color',appearance.color||records.color(field));require('./picture-picker.js').renderPicture(records.plugin,b.createSpan({cls:'noria-record-choice-icon'}),appearance.icon);b.createSpan({text:records.display(field,value)});b.onclick=()=>{selected=value;for(const c of choices.children)c.setAttribute('aria-pressed',String(c===b));};b._entryValue=value;}
      input=choices;
    }
    const actions=form.createDiv({cls:'noria-record-actions'}),submit=actions.createEl('button',{text:text('新增','Add entry'),cls:'mod-cta',attr:{type:'submit'}});
    const cancel=actions.createEl('button',{text:text('取消修改','Cancel edit'),attr:{type:'button'}});cancel.hidden=true;
    const error=host.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
    const commit=async(value,options)=>{if(saving)return;saving=true;form.inert=true;list.inert=true;try{if(await onSave(value,options)!==false)close();}catch(e){error.setText(e.message);report?.(e);}finally{saving=false;form.inert=false;list.inert=false;}};
    form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const value=field.type==='number'?Number(input.value):selected;if(value==null){error.setText(text('选择此次状态','Choose the state for this entry'));return;}return commit(value,{operation:editing==null?'append':'edit',entry:editing,time:time.value});};
    cancel.onclick=()=>{editing=null;selected=null;if(field.type==='number')input.value='';else for(const b of input.children)b.setAttribute('aria-pressed','false');submit.setText(text('新增','Add entry'));cancel.hidden=true;error.setText('');};
    const list=host.createDiv({cls:'noria-entry-list'});
    state.entries.forEach((entry,index)=>{
      const row=list.createDiv({cls:'noria-entry-row'}),edit=row.createEl('button',{cls:'noria-entry-open',attr:{type:'button','aria-label':text('修改记录','Edit entry')+' · '+(entry.time||text('未记时间','No time'))+' · '+records.display(field,entry.value)}});
      edit.createSpan({cls:'noria-card-secondary',text:entry.time||text('未记时间','No time')});edit.createSpan({text:records.display(field,entry.value)});
      edit.onclick=()=>{editing=index;time.value=entry.time;selected=entry.value;if(field.type==='number')input.value=String(entry.value);else for(const b of input.children)b.setAttribute('aria-pressed',String(b._entryValue===entry.value));submit.setText(text('保存修改','Save changes'));cancel.hidden=false;error.setText('');(field.type==='number'?input:time).focus();};
      iconButton(row,'trash-2',text('删除这条记录','Delete this entry'),()=>void commit(undefined,{operation:'delete',entry:index}));
    });
  });
}
module.exports={editEntries};
