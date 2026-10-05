"use strict";
const {setIcon}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {STYLES,dashboardTemplates,widgetFromTemplate}=require('./statistic-templates.js');
const clone=value=>JSON.parse(JSON.stringify(value));

function styleSample(host,style){
  const svg=host.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 160 42');svg.setAttribute('aria-hidden','true');svg.classList.add('noria-stat-template-sample');host.append(svg);
  const add=(name,attrs)=>{const el=host.ownerDocument.createElementNS(svg.namespaceURI,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);};
  if(style==='combo'){
    [12,25,18,34,23,30,21,37].forEach((height,i)=>add('rect',{x:3+i*20,y:40-height,width:12,height,rx:2,fill:'currentColor',opacity:.25}));
    add('path',{d:'M 3 31 L 27 20 L 50 25 L 77 8 L 101 17 L 128 12 L 156 20',fill:'none',stroke:'currentColor','stroke-width':2.5});
  }
  else if(style==='year'){for(let i=0;i<65;i++)add('rect',{x:3+(i%13)*12,y:2+Math.floor(i/13)*8,width:9,height:6,rx:1,fill:'currentColor',opacity:[.15,.45,.8,.3,.6][i%5]});}
  else if(style==='history'||style==='records'){for(let row=0;row<3;row++){add('circle',{cx:8,cy:8+row*13,r:4,fill:'currentColor',opacity:.7});for(let col=0;col<10;col++)add('rect',{x:24+col*13,y:4+row*13,width:10,height:8,rx:2,fill:'currentColor',opacity:[.2,.55,.9,.35][(row+col)%4]});}}
  else if(style==='line')add('path',{d:'M 3 31 L 27 20 L 50 25 L 77 8 L 101 17 L 128 12 L 156 20',fill:'none',stroke:'currentColor','stroke-width':2.5,'stroke-linejoin':'round'});
  else if(style==='composition'){let x=3;[70,49,35].forEach((width,i)=>{add('rect',{x,y:13,width:width-2,height:16,rx:2,fill:'currentColor',opacity:[1,.6,.3][i]});x+=width;});}
  else if(style==='donut'){add('circle',{cx:80,cy:21,r:15,fill:'none',stroke:'currentColor','stroke-width':8,opacity:.2});add('circle',{cx:80,cy:21,r:15,fill:'none',stroke:'currentColor','stroke-width':8,'stroke-dasharray':'62 95',transform:'rotate(-90 80 21)'});}
  else if(style==='heatmap'||style==='states'){for(let i=0;i<21;i++)add('rect',{x:4+(i%7)*22,y:2+Math.floor(i/7)*14,width:17,height:10,rx:2,fill:'currentColor',opacity:[.2,.5,.8,.35][i%4]});}
  else if(style==='strip'){for(let i=0;i<12;i++)add('rect',{x:3+i*13,y:14,width:10,height:14,rx:2,fill:'currentColor',opacity:[.25,.6,.85,.4][i%4]});}
  else if(style==='progress'){add('rect',{x:3,y:16,width:154,height:10,rx:5,fill:'currentColor',opacity:.15});add('rect',{x:3,y:16,width:105,height:10,rx:5,fill:'currentColor'});}
  else if(style==='bars'||style==='comparison'){[126,85,52].slice(0,style==='comparison'?2:3).forEach((width,i)=>add('rect',{x:3,y:5+i*13,width,height:8,rx:3,fill:'currentColor',opacity:i?.5:1}));}
  else if(style==='metric'){const value=host.ownerDocument.createElementNS(svg.namespaceURI,'text');value.setAttribute('x','80');value.setAttribute('y','30');value.setAttribute('text-anchor','middle');value.setAttribute('fill','currentColor');value.setAttribute('font-size','30');value.textContent='—';svg.append(value);}
  else [12,25,18,34,23,30,21,37].forEach((height,i)=>add('rect',{x:3+i*20,y:40-height,width:12,height,rx:2,fill:'currentColor'}));
}

function templateGallery(catalog,tab='recommended'){
  catalog.clean();catalog.setTitle(catalog.text('添加统计','Add statistics'));
  const {contentEl,plugin}=catalog,stats=plugin.propertyStats,t=(zh,en)=>catalog.text(zh,en);
  const navigation=contentEl.createDiv({cls:'noria-stat-library-navigation'}),head=navigation.createDiv({cls:'noria-card-form-head'});
  const back=iconButton(head,'arrow-left',t('全部卡片','All cards'),()=>catalog.list());back.addClass('noria-card-back');back.createSpan({text:t('全部卡片','All cards')});
  const tabs=head.createDiv({cls:'noria-stat-template-tabs',attr:{'aria-label':t('统计模板','Statistics templates')}});
  const search=navigation.createEl('input',{cls:'noria-card-search',attr:{type:'search','aria-label':t('搜索统计模板','Search statistics templates'),placeholder:t('搜索模板名称、图形或用途','Search templates, chart types or purposes')}});search.value=catalog.statNavigation?.query||'';
  navigation.createDiv({cls:'noria-card-secondary noria-stat-template-note',text:t('选择模板后，可配置并预览真实数据。下方图形为样式示意。','Choose a template to configure and preview your data. Illustrations below show chart types.')});
  const gallery=contentEl.createDiv({cls:'noria-stat-template-gallery'}),groups=stats.templateGroups();
  const dashboard=dashboardTemplates(plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[],t);
  const periodic=require('./periodic-stat-cards.js').periodicTemplates(t);
  const acceptsDashboard=catalog.context.page==='home'||catalog.custom;
  const paint=()=>{
    catalog.statNavigation={tab,query:search.value};gallery.empty();for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
    let templates;try{templates=tab==='mine'?stats.templateLibrary.read():tab==='styles'?[...groups.styles,...periodic,...dashboard]:[...periodic,...dashboard,...groups.recommended];}catch(e){catalog.showError(e);return;}
    if(!templates.length){gallery.createDiv({cls:'noria-card-empty',text:t('还没有自己的模板。编辑统计后，选择“保存为模板”。','No saved templates yet. Edit a statistic and choose Save as template.')});return;}
    const query=search.value.trim().toLowerCase();templates=templates.filter(template=>{const style=STYLES.find(s=>s[0]===(template.style||template.props.display));return [template.title,template.description,style?.[1],style?.[2]].join(' ').toLowerCase().includes(query);});
    if(!templates.length){const empty=gallery.createDiv({cls:'noria-card-catalog-empty',attr:{role:'status'}});empty.createSpan({text:t('没有匹配的模板','No matching templates')});const clear=empty.createEl('button',{text:t('清除搜索','Clear search')});clear.onclick=()=>{search.value='';paint();search.focus();};return;}
    let section;
    for(const template of templates){
      const native=template.kind==='dashboard';
      const group=template.kind||'basic';
      if(tab!=='mine'&&section!==group){section=group;gallery.createEl('h3',{cls:'noria-stat-template-section',text:group==='periodic'?t('周期趋势 · 日记与页面通用','Period trends · Diaries and pages'):native?t('主页与趋势统计','Dashboard statistics'):tab==='styles'?t('基础图形 · 可自定义数据','Chart types · Choose your data'):t('按记录与用途创建','Start from records and goals')});}
      const type=STYLES.find(s=>s[0]===(template.props.display==='trend'?'columns':template.props.display)),tile=gallery.createDiv({cls:'noria-stat-template-tile'});
      const use=tile.createEl('button',{cls:'noria-stat-template-use',attr:{type:'button','data-stat-template':template.id}}),title=use.createDiv({cls:'noria-stat-template-title'});setIcon(title.createSpan(),template.icon||type?.[3]||'chart-no-axes-combined');title.createEl('strong',{text:template.title});
      const nativeNames={metric:t('指标概览','Metric overview'),combo:t('双轴组合图','Dual-axis combination'),year:t('年度热力图','Yearly heatmap'),history:t('打卡记录','Check-in history'),records:t('多项记录','Multiple records'),donut:t('环形分布','Donut distribution')};
      title.createSpan({cls:'noria-stat-template-kind',text:native||group==='periodic'?nativeNames[template.style]||t('统计','Statistics'):type?t(type[1],type[2]):t('统计','Statistics')});
      styleSample(use,template.style||template.props.display);
      if(template.description)use.createSpan({cls:'noria-card-secondary',text:template.description});
      if(native&&!acceptsDashboard&&!require('./dashboard-statistic-settings.js').supportsRange({builtinId:template.builtinId})){use.disabled=true;tile.createSpan({cls:'noria-card-secondary noria-stat-template-availability',text:template.builtinId==='habit-history-card'?t('日记使用已有的习惯记录卡','Use the diary’s existing habit card'):t('当前资料统计，可添加到主页或自定义页面','Current-library statistics, available on Home or custom pages')});}
      use.onclick=()=>{catalog.returnTo='statistics';catalog.statReturnId=template.id;catalog.edit(widgetFromTemplate(template,catalog.statBaseWidget,catalog.context.page==='diary'&&tab!=='mine'));catalog.dirty=true;};
      if(tab==='mine'){
        const remove=tile.createEl('button',{cls:'noria-stat-template-remove',attr:{'aria-label':t('移除模板：','Remove template: ')+template.title},text:t('移除','Remove')});
        remove.onclick=()=>{remove.hidden=true;const confirm=tile.createDiv({cls:'noria-stat-template-confirm'});confirm.createSpan({text:t('移除模板？已添加的卡片不受影响。','Remove template? Existing cards will stay.')});
          const yes=confirm.createEl('button',{text:t('移除','Remove')}),no=confirm.createEl('button',{text:t('保留','Keep')});no.onclick=()=>{confirm.remove();remove.hidden=false;remove.focus();};
          yes.onclick=async()=>{yes.disabled=true;no.disabled=true;try{await stats.templateLibrary.remove(template.id);paint();tabs.querySelector('[data-tab="mine"]').focus();}catch(e){catalog.showError(e);yes.disabled=false;no.disabled=false;}};no.focus();};
      }
    }
  };
  for(const [key,label] of [['recommended',t('推荐模板','Recommended')],['styles',t('全部样式','All styles')],['mine',t('我的模板','My templates')]]){const b=tabs.createEl('button',{text:label,attr:{type:'button','data-tab':key,'aria-pressed':String(tab===key)}});b.onclick=()=>{tab=key;paint();};}
  search.oninput=paint;paint();const selected=[...gallery.querySelectorAll('[data-stat-template]')].find(b=>b.dataset.statTemplate===catalog.statReturnId&&!b.disabled);if(selected)selected.focus();else tabs.querySelector('[aria-pressed="true"]').focus();
}

function templateSaveAction(catalog){
  const t=(zh,en)=>catalog.text(zh,en),button=catalog.footer.createEl('button',{cls:'noria-stat-template-save',text:t('保存为模板','Save as template')});catalog.footer.prepend(button);
  button.onclick=()=>{
    if(catalog.templateSaveEl?.isConnected){catalog.templateSaveEl.querySelector('input').focus();return;}
    const panel=catalog.contentEl.createDiv({cls:'noria-stat-template-save-form'});catalog.templateSaveEl=panel;catalog.footer.before(panel);
    const label=panel.createEl('label',{cls:'noria-card-field'});label.createSpan({text:t('模板名称','Template name')});const name=label.createEl('input',{attr:{type:'text',maxlength:'80'}});name.value=catalog.draft.title||'';
    panel.createSpan({cls:'noria-card-secondary',text:t('保存配置供再次添加，不保存数据副本。','Save the setup for reuse, without copying source data.')});
    const actions=panel.createDiv({cls:'noria-card-form-head'}),save=actions.createEl('button',{text:t('保存','Save'),cls:'mod-cta'}),cancel=actions.createEl('button',{text:t('取消','Cancel')});cancel.onclick=()=>{panel.remove();button.focus();};
    const feedback=panel.createDiv({attr:{role:'status','aria-live':'polite'}});
    save.onclick=async()=>{
      if(!name.value.trim()){feedback.setText(t('请填写模板名称。','Enter a template name.'));name.focus();return;}
      save.disabled=true;cancel.disabled=true;
      try{const draft=clone(catalog.draft);await catalog.validateDraft(draft);await catalog.plugin.propertyStats.templateLibrary.save(draft,name.value);panel.empty();panel.createSpan({text:t('已保存到“我的模板”。','Saved to My templates.'),attr:{role:'status'}});const done=panel.createEl('button',{text:t('完成','Done')});done.onclick=()=>{panel.remove();button.focus();};done.focus();}
      catch(e){feedback.setText(e.message||String(e));feedback.addClass('noria-card-error');save.disabled=false;cancel.disabled=false;}
    };name.focus();name.select();
  };
}
module.exports={templateGallery,templateSaveAction};
