"use strict";
const A=require('./statistic-appearance.js');
function appearanceEditor(catalog,form){
 const t=(zh,en)=>catalog.text(zh,en),stats=catalog.plugin.propertyStats;
 const details=form.createEl('details',{cls:'noria-card-advanced noria-stat-appearance',attr:{'data-stat-appearance':''}});details.open=!!catalog.statAppearanceOpen;
 details.createEl('summary',{text:t('图表外观','Chart appearance')});details.addEventListener('toggle',()=>{catalog.statAppearanceOpen=details.open;});
 const body=details.createDiv(),feedback=details.createDiv({cls:'noria-card-secondary',attr:{role:'status','aria-live':'polite'}});
 const render=()=>{
  body.empty();const config=catalog.draft.props,a=A.appearance(config.appearance),style=config.display;
  const field=(key,label,type,options,refresh=false)=>{const input=catalog.field(body,label,type,a[key],value=>{catalog.draft.props.appearance={...A.appearance(catalog.draft.props.appearance),[key]:value};if(key==='color'&&value==='custom'&&!catalog.draft.props.appearance.customColor)catalog.draft.props.appearance.customColor='#7851c9';if(key==='axis'&&value==='fixed'){const field=catalog.plugin.records.definitions().find(f=>f.property===config.property);const next=catalog.draft.props.appearance;if(!Number.isFinite(next.min))next.min=0;if(!Number.isFinite(next.max))next.max=field?.max||5;}if(refresh){render();body.querySelector(`[data-stat-appearance-field="${key}"]`)?.focus();}},options);input.dataset.statAppearanceField=key;if(type==='checkbox'){input.parentElement.addClass('noria-stat-appearance-check');input.parentElement.prepend(input);}return input;};
  field('color',t('配色','Colors'),'select',[['auto',t('自动 · 沿用记录或分类色','Auto · record or category colors')],['purple',t('紫色','Purple')],['blue',t('蓝色','Blue')],['green',t('绿色','Green')],['orange',t('橙色','Orange')],['custom',t('自定义颜色','Custom color')]].map(([value,label])=>({value,label})),true);
  if(a.color==='custom')field('customColor',t('自定义颜色','Custom color'),'color');
  if(['line','columns','trend','heatmap','states','strip'].includes(style))field('density',t('显示密度','Density'),'select',[['compact',t('紧凑','Compact')],['normal',t('标准','Standard')],['spacious',t('舒展','Spacious')]].map(([value,label])=>({value,label})));
  if(['line','columns','trend'].includes(style)){
   field('axis',t('纵轴刻度','Vertical scale'),'select',[['zero',t('包含零点','Include zero')],['auto',t('自动适配数据','Fit the data')],['fixed',t('指定范围','Custom range')]].map(([value,label])=>({value,label})),true);
   if(a.axis==='fixed'){const limits=body.createDiv({cls:'noria-stat-axis-limits'});for(const [key,label] of [['min',t('刻度下限','Minimum')],['max',t('刻度上限','Maximum')]])limits.append(field(key,label,'number').parentElement);body.createDiv({cls:'noria-card-secondary',text:t('超出范围的值仍会完整显示，并提示扩展刻度。柱图始终包含零点。','Out-of-range values remain visible with an expanded-scale notice. Columns always include zero.')});}
   if(style==='line')field('showPoints',t('显示采样点','Show sample points'),'checkbox');
   const ref=catalog.field(body,t('参考线（可选，同统计单位）','Reference line (optional, same unit)'),'number',config.referenceValue,value=>{catalog.draft.props.referenceValue=value;});ref.dataset.statReference='true';
  }
  if(['donut','composition'].includes(style)||config.calculate==='distribution'&&['heatmap','states','strip'].includes(style))field('showLegend',['donut','composition'].includes(style)?t('显示分类明细','Show category details'):t('显示状态图例','Show state legend'),'checkbox');
  let looks;try{looks=stats.looks.read();}catch(e){feedback.setText(e.message);return;}
  if(looks.length){
   const choose=catalog.field(body,t('应用外观预设','Apply appearance preset'),'select','',id=>{const look=looks.find(v=>v.id===id);if(!look)return;catalog.draft.props=A.applyLook(catalog.draft.props,look);render();feedback.setText(t('已应用外观；数据、筛选和参考值保持不变。','Appearance applied; data, filters and reference value are unchanged.'));},[{value:'',label:t('选择已保存外观…','Choose saved appearance…')},...looks.map(v=>({value:v.id,label:v.title}))]);choose.dataset.statLook='true';
  }
  const actions=body.createDiv({cls:'noria-stat-look-actions'}),save=actions.createEl('button',{text:t('保存当前外观','Save appearance'),attr:{'data-save-stat-look':''}});
  save.onclick=()=>{
   if(body.querySelector('[data-stat-look-name]')){body.querySelector('[data-stat-look-name]').focus();return;}
   const box=body.createDiv({cls:'noria-stat-look-save'}),label=box.createEl('label',{cls:'noria-card-field'});label.createSpan({text:t('外观名称','Appearance name')});const name=label.createEl('input',{attr:{type:'text',maxlength:'80','data-stat-look-name':''}});
   const row=box.createDiv({cls:'noria-stat-look-actions'}),submit=row.createEl('button',{cls:'mod-cta',text:t('保存','Save')}),cancel=row.createEl('button',{text:t('取消','Cancel')});cancel.onclick=()=>{box.remove();save.focus();};
   submit.onclick=async()=>{if(!name.value.trim()){feedback.setText(t('请填写外观名称。','Enter an appearance name.'));name.focus();return;}submit.disabled=true;cancel.disabled=true;
    try{await stats.looks.save(name.value,catalog.draft.props.appearance);render();feedback.setText(t('外观已保存，可用于其他统计卡片。','Appearance saved for use on other statistics.'));body.querySelector('[data-stat-look]')?.focus();}
    catch(e){feedback.setText(e.message);submit.disabled=false;cancel.disabled=false;}};name.focus();
  };
  const reset=actions.createEl('button',{text:t('恢复默认外观','Reset appearance')});reset.onclick=()=>{delete catalog.draft.props.appearance;catalog.dirty=true;catalog.schedulePreview();render();feedback.setText(t('已恢复默认外观。','Default appearance restored.'));};
  if(looks.length){const manage=body.createEl('details',{cls:'noria-stat-look-library'});manage.createEl('summary',{text:t('管理已存外观','Manage saved appearances')});for(const look of looks){const row=manage.createDiv({cls:'noria-stat-look-actions'});row.createSpan({text:look.title});const remove=row.createEl('button',{text:t('移除','Remove'),attr:{'data-remove-stat-look':look.id}});remove.onclick=async()=>{remove.disabled=true;try{await stats.looks.remove(look.id);render();feedback.setText(t('外观预设已移除，已应用的卡片保持原样。','Preset removed; cards already using it are unchanged.'));}catch(e){feedback.setText(e.message);remove.disabled=false;}};}}
 };
 render();return details;
}
module.exports={appearanceEditor};
