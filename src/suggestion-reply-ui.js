"use strict";
const {Component,MarkdownRenderer,setIcon,Scope}=require('obsidian');
const {createReplyDraft,draftKey}=require('./suggestion-reply-draft.js');
async function renderSuggestionReplies(plugin,host,selection){
 if(selection.heading!=='建议')return()=>{};
 const slot=host.createDiv(),zh=plugin.getNoriaLocale()==='zh';let disposed=false,cleanup=()=>{};
 async function load(){
  slot.empty();
  try{
   const source=selection.originPath?(await plugin.api.suggestionReplies.read({date:selection.date,sourcePath:selection.path})).source:await plugin.api.suggestions.read({date:selection.date});
   if(disposed||source.path!==selection.path)return;
   const releaseActions=await require('./suggestion-actions.js').mountSuggestionActions(plugin,host,selection);
   let releaseReplies;try{releaseReplies=source.exists?await mountSuggestionReplies(plugin,slot,selection,source):()=>{};}catch(error){releaseActions();throw error;}
   const release=()=>{releaseReplies();releaseActions();};
   if(disposed)release();else cleanup=release;
  }catch{
   if(disposed)return;
   const error=slot.createDiv({cls:'noria-reply-footer'});
   error.createSpan({text:zh?'补充暂时无法读取，建议正文已保留。':'Replies could not be loaded. Suggestions are still available.',attr:{role:'status'}});
   const retry=error.createEl('button',{text:zh?'重新读取':'Reload'});
   retry.onclick=()=>{retry.disabled=true;void load();};
  }
 }
 await load();return()=>{disposed=true;cleanup();};
}
async function mountSuggestionReplies(plugin,host,selection,source){
 const cache=plugin._suggestionReplyDrafts||(plugin._suggestionReplyDrafts=new Map()),key=draftKey(source);
 let model=cache.get(key);if(!model){model=createReplyDraft({app:plugin.app,source,getApi:()=>plugin.api});cache.set(key,model);}else model.setSource(source);
 const zh=plugin.getNoriaLocale()==='zh',t=(cn,en)=>zh?cn:en;
 const area=host.createDiv({cls:'noria-suggestion-replies'});let disposed=false,lastHistory='',historyComponent,expiryTimer,refreshTimer,reloadTurn=0;
 const responseView=area.createDiv({cls:'noria-reply-response'});responseView.hidden=true;
 const form=area.createDiv({cls:'noria-reply-compose'});
 const input=form.createEl('textarea',{attr:{rows:'3',maxlength:'12000','aria-label':t(`补充 ${source.date} 的建议`,`Reply to suggestions for ${source.date}`),placeholder:t('补充限制、纠正建议，或说明你的想法…','Add a constraint, correction, or thought…')}});
 const conflict=form.createEl('details',{cls:'noria-reply-conflict'});conflict.createEl('summary',{text:t('建议已更新 · 查看最新内容','Suggestions changed · Read the latest version')});
 const latest=conflict.createDiv({cls:'noria-reply-latest'}),confirm=conflict.createEl('button',{text:t('已核对，按最新内容保存','Reviewed; use the latest context')});confirm.type='button';
 const actions=form.createDiv({cls:'noria-reply-actions'});
 const collapse=actions.createEl('button',{text:t('收起','Collapse')}),save=actions.createEl('button',{text:t('保存补充','Save reply'),cls:'mod-cta'});
 save.setAttribute('title',t('保存补充 · Ctrl / ⌘ + Enter','Save reply · Ctrl / ⌘ + Enter'));save.setAttribute('aria-keyshortcuts','Control+Enter Meta+Enter');
 const footer=area.createDiv({cls:'noria-reply-footer'}),summary=footer.createEl('button',{cls:'noria-reply-history-toggle',attr:{'aria-expanded':'false'}});
 const status=footer.createSpan({attr:{role:'status','aria-live':'polite'}}),open=footer.createEl('button',{cls:'noria-reply-open'});
 const icon=open.createSpan();setIcon(icon,'message-square');const openLabel=open.createSpan();
 const recovery=footer.createEl('button',{text:t('重新读取','Reload')});
 const library=footer.createEl('button',{cls:'clickable-icon',attr:{'aria-label':t('交流与草稿','Replies and drafts'),title:t('交流与草稿','Replies and drafts')}});setIcon(library,'history');
 library.onclick=()=>require('./suggestion-reply-library-ui.js').openReplyLibrary(plugin);
 const history=area.createDiv({cls:'noria-reply-history'}),entries=history.createDiv();history.hidden=true;
 history.id='noria-reply-history-'+require('node:crypto').randomUUID();summary.setAttribute('aria-controls',history.id);
 summary.onclick=()=>{history.hidden=!history.hidden;summary.setAttribute('aria-expanded',String(!history.hidden));};
 const errors={
  'draft-load':t('本机草稿无法读取，已保留原数据。','The local draft could not be read; the original data is preserved.'),
  'draft-save':t('草稿未存到本机，请保留当前页面并重试。','Draft not saved on this device. Keep this page open and retry.'),
  'conflict':t('保存遇到冲突，输入已保留。请核对最新建议或打开交流记录。','Save conflict. Your input is retained; check the latest suggestions or the reply note.'),
  'invalid-input':t('请检查内容长度及未闭合的代码块或注释。','Check the reply length and unclosed code blocks or comments.'),
  'not-found':t('原建议已不存在，输入已保留。','Suggestions are missing; your input is retained.')
 };
 let readError='',viewedMarkdown=selection.markdown;
 async function reload(){
  const turn=++reloadTurn;
  try{const current=model.snapshot().source,record=await plugin.api.suggestionReplies.read({date:current.date,sourcePath:current.path}),next=record.source;
   if(disposed||turn!==reloadTurn)return;if(next.path!==model.snapshot().source.path)throw Error('source-moved');model.setSource(next);model.setHistory(record);readError='';
  }catch(e){if(!disposed&&turn===reloadTurn)readError=t('交流记录暂时无法读取，请重试。','Could not read the reply note. Retry.');}finally{if(!disposed&&turn===reloadTurn)paint();}
 }
 const labels={saved:t('已保存 · 待领取','Saved · awaiting claim'),claimed:t('Agent 已领取','Claimed by Agent'),uncertain:t('处理状态待确认','Processing status unconfirmed'),responded:t('已回应','Responded')};
 function paint(){
  if(disposed)return;const s=model.snapshot(),d=s.draft;
  form.hidden=!d.expanded;open.hidden=d.expanded;input.disabled=s.busy||s.error==='draft-load';
  if(input.value!==d.markdown)input.value=d.markdown;
  openLabel.setText(d.markdown?t('继续填写','Continue draft'):t('补充','Reply'));
  const unseen=viewedMarkdown!==undefined&&viewedMarkdown!==s.source.markdown;
  save.disabled=s.busy||s.stale||unseen||!!readError||!d.markdown.trim()||s.error==='draft-load';collapse.disabled=s.busy;confirm.disabled=s.busy||s.error==='draft-load';
  save.setText(s.busy?t('保存中…','Saving…'):t('保存补充','Save reply'));
  conflict.hidden=!s.stale&&!unseen;latest.setText(s.source.markdown);
  const state=s.history?.replies.at(-1)?.state,processing=state&&state!=='responded'?labels[state]:'';
  status.setText(readError||(s.error?(errors[s.error]||t('保存未确认，输入已保留。可重试核对。','Save not confirmed. Input retained; retry to check.')):[d.markdown?t('草稿 · 仅本机','Draft · on this device'):'',processing].filter(Boolean).join(' · ')));
  status.hidden=!status.textContent;
  status.classList.toggle('is-error',!!readError||!!s.error);recovery.hidden=!readError&&s.error!=='draft-load';
  const replies=s.history?.replies||[];summary.hidden=!replies.length;if(!replies.length){history.hidden=true;summary.setAttribute('aria-expanded','false');}
  area.hidden=footer.hidden=!d.expanded&&!d.markdown&&!replies.length&&!status.textContent;
  library.hidden=!replies.length&&!d.markdown;
  clearTimeout(expiryTimer);const expires=replies.filter(r=>r.state==='claimed').map(r=>Date.parse(r.claim.expiresAt));if(expires.length)expiryTimer=setTimeout(()=>void reload(),Math.max(1,Math.min(...expires)-Date.now()+20));
  const signature=JSON.stringify(replies);if(signature!==lastHistory){lastHistory=signature;summary.setText(t(`交流 ${replies.length}`,`Replies ${replies.length}`));entries.empty();responseView.empty();historyComponent?.unload();historyComponent=new Component();historyComponent.load();
   const newest=[...replies].reverse().find(r=>r.response);responseView.hidden=!newest;
   const renderResponse=(parent,reply,latest)=>{const response=reply.response;
    parent.createDiv({cls:'noria-reply-meta',text:(latest&&reply!==replies.at(-1)?t('回应较早补充 · ','Response to an earlier reply · '):'')+response.agent});
    const body=parent.createDiv({cls:'markdown-rendered'});void MarkdownRenderer.render(plugin.app,response.markdown,body,s.history.path,historyComponent).catch(()=>body.setText(response.markdown));
   };
   if(newest)renderResponse(responseView,newest,true);
   for(const reply of replies){const item=entries.createDiv({cls:'noria-reply-entry'});item.createDiv({cls:'noria-reply-meta',text:t('我的补充','My reply')+' · '+new Date(reply.createdAt).toLocaleString(zh?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})});
    const body=item.createDiv({cls:'markdown-rendered'});void MarkdownRenderer.render(plugin.app,reply.markdown,body,s.history.path,historyComponent).catch(()=>body.setText(reply.markdown));
    if(reply.sourceChanged)item.createDiv({cls:'noria-reply-meta',text:t('原建议已更新','Original suggestions changed')});
    if(reply.state!=='responded')item.createDiv({cls:'noria-reply-meta',text:labels[reply.state]});
    if(reply.response&&reply!==newest)renderResponse(item,reply,false);
   }
   if(s.history?.path){const link=entries.createEl('button',{text:t('打开交流记录','Open reply note')});link.onclick=()=>plugin.app.workspace.openLinkText(s.history.path,'',true);}
  }
 }
 const act=fn=>{try{fn();}catch{paint();}};
 input.addEventListener('input',()=>act(()=>model.edit(input.value)));
 open.onclick=()=>{act(()=>model.expand(true));input.focus();};collapse.onclick=()=>{act(()=>model.expand(false));if(!footer.hidden)open.focus();else shell?.querySelector('[data-noria-widget-shell-action="menu"],.noria-diary-card-menu')?.focus();};
 const shell=host.closest('.dashboard-home-widget-shell,.noria-diary-card'),replyAction={label:t('补充想法','Add a thought'),icon:'message-square',run:()=>open.onclick()};
 if(shell)shell._noriaRecordActions=[...shell._noriaRecordActions||[],replyAction];
 confirm.onclick=()=>act(()=>{viewedMarkdown=model.snapshot().source.markdown;model.rebase();});
 recovery.onclick=()=>{if(model.snapshot().error==='draft-load')model.reloadDraft();void reload();};
 save.onclick=async()=>{if(save.disabled)return;try{await model.save();if(!disposed)open.focus();}catch{await reload();}};
 const scope=new Scope(plugin.app.scope);let scopeActive=false,composing=false;
 scope.register(['Mod'],'Enter',event=>{if(!composing&&!event.isComposing&&!save.disabled)save.click();return false;});
 const releaseScope=()=>{if(scopeActive)plugin.app.keymap.popScope(scope);scopeActive=false;};
 input.addEventListener('focus',()=>{if(!scopeActive){plugin.app.keymap.pushScope(scope);scopeActive=true;}});
 input.addEventListener('blur',releaseScope);
 input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;});
 const unsubscribe=model.subscribe(paint);
 // Coalesce file changes without rebuilding the card or moving keyboard focus.
 const modified=plugin.app.vault.on('modify',file=>{const s=model.snapshot();if(file.path===s.history?.path||file.path===s.source.path){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(!disposed)void reload();},0);}});
 paint();await reload();
 return()=>{disposed=true;if(shell)shell._noriaRecordActions=(shell._noriaRecordActions||[]).filter(action=>action!==replyAction);releaseScope();clearTimeout(expiryTimer);clearTimeout(refreshTimer);plugin.app.vault.offref(modified);unsubscribe();historyComponent?.unload();};
}
module.exports={renderSuggestionReplies};
