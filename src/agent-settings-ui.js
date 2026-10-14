"use strict";
function renderAgentSettings(tab, parent, {Setting,Notice,setIcon}) {
  const service=tab.plugin.agentIntegration;
  const zh=tab.plugin.getNoriaLocale()==='zh';
  const text=(cn,en)=>zh?cn:en;
  const host=parent.createDiv({cls:'noria-agent-settings'});
  let busy=false,painting=false,expanded=false,actionError='',format='codex',portDirty=false,client,toggle,copy,retry,port,save,reset,configure;
  const entry=new Setting(host).setName(text('外部助手','External assistants'))
    .setDesc(text('让 Codex 等本机助手读取或更新 Noria 数据。建议卡和普通笔记无需开启。','Allow local assistants such as Codex to read or update Noria data. Suggestions and ordinary notes work without this connection.'))
    .addButton(button=>{configure=button;button.setButtonText(text('设置连接','Set up connection')).onClick(()=>{expanded=!expanded;paint();if(expanded)toggle.toggleEl.focus();});});
  tab.decorateSettingsTarget(entry,'agentConnection.enabled');
  const status=host.createDiv({cls:'setting-item-description noria-agent-status',attr:{role:'status','aria-live':'polite'}});
  const panel=host.createDiv({cls:'noria-settings-editor noria-agent-editor'});panel.hidden=true;
  const panelId=`noria-agent-editor-${Math.random().toString(36).slice(2)}`;panel.id=panelId;
  configure.buttonEl.setAttribute('aria-controls',panelId);
  const row=new Setting(panel).setName(text('允许本机连接','Allow local connections'))
    .setDesc(text('通过 MCP 连接；开启后随本库启动，关闭 Obsidian 后停止。不会自动运行助手。','Connect through MCP. Starts with this vault when enabled and stops with Obsidian. Does not run an assistant automatically.'))
    .addToggle(control=>{toggle=control;control.onChange(value=>{if(!painting)void act(()=>service.setEnabled(value));});});
  const controls=panel.createDiv();
  const actions=new Setting(controls).setName(text('连接客户端','Connect a client'))
    .addDropdown(control=>{client=control;control.addOption('json','MCP JSON').addOption('codex','Codex · TOML').setValue(format).onChange(value=>{format=value;describeConfig();});control.selectEl.setAttribute('aria-label',text('配置格式','Configuration format'));})
    .addButton(button=>{copy=button;button.setButtonText(text('复制配置','Copy configuration')).onClick(()=>void act(async()=>{const config=service.clientConfig(format);try{await navigator.clipboard.writeText(typeof config==='string'?config:JSON.stringify(config,null,2));}catch{throw Object.assign(Error('clipboard-failed'),{code:'clipboard-failed'});}new Notice(text('连接配置已复制','Connection configuration copied'));}));})
    .addButton(button=>{retry=button;button.setButtonText(text('重试连接','Retry connection')).onClick(()=>void act(()=>service.setEnabled(true)));});
  tab.decorateSettingsTarget(actions,'agentConnection.config');
  function describeConfig(){actions.setDesc(format==='codex'
    ?text('将片段加入 Codex 的 config.toml；已有 noria 配置时替换该段。配置含凭据，请勿分享。','Add this section to Codex config.toml, replacing an existing noria section. It contains a credential; do not share it.')
    :text('适用于接受 mcpServers JSON 的本机 HTTP 客户端。配置含凭据，请只粘贴到可信客户端。','For local HTTP clients accepting mcpServers JSON. Contains a credential; paste only into a trusted client.'));}
  describeConfig();
  const details=panel.createEl('details',{cls:'noria-settings-disclosure'});
  const summary=details.createEl('summary',{cls:'noria-settings-disclosure-summary'});
  summary.createSpan({cls:'noria-settings-disclosure-title',text:text('端口与凭据','Port and credential')});
  const chevron=summary.createSpan({cls:'noria-settings-disclosure-chevron',attr:{'aria-hidden':'true'}});setIcon(chevron,'chevron-right');
  const portRow=new Setting(details).setName(text('本机端口','Local port'))
    .setDesc(text('首次自动分配并记住。关闭连接后可修改；0 表示重新自动分配。','Assigned automatically on first use, then remembered. Disable the connection to change it; 0 selects a new port.'))
    .addText(control=>{port=control;control.inputEl.type='number';control.inputEl.min='0';control.inputEl.max='65535';control.inputEl.setAttribute('aria-label',text('本机端口','Local port'));control.onChange(()=>{portDirty=true;});})
    .addButton(button=>{save=button;button.setButtonText(text('保存','Save')).onClick(()=>{
      const value=port.getValue().trim();
      void act(async()=>{await service.setPort(value?Number(value):NaN);portDirty=false;});
    });});
  port.inputEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save.buttonEl.click();}});
  tab.decorateSettingsTarget(portRow,'agentConnection.port');
  new Setting(details).setName(text('连接凭据','Connection credential'))
    .setDesc(text('保存在本机 SecretStorage。重置后旧配置失效，需要重新复制。','Stored in local SecretStorage. Reset invalidates the old configuration; copy it again afterward.'))
    .addButton(button=>{reset=button;button.setButtonText(text('重置凭据','Reset credential')).onClick(()=>void act(async()=>{await service.resetCredential();new Notice(text('凭据已重置，请重新复制配置','Credential reset; copy the configuration again'));}));});
  const errors={
    'clipboard-failed':text('未能复制到剪贴板，请重试；连接仍可用。','Could not copy to the clipboard. Retry; the connection is still available.'),
    'storage-unavailable':text('当前版本不支持本机凭据存储，请更新 Obsidian。','Update Obsidian to use local credential storage.'),
    'preferences-save-failed':text('连接设置未保存，请重试。','Connection settings were not saved. Retry.'),
    'credential-save-failed':text('凭据未保存，请重试。','Credential was not saved. Retry.'),
    'credential-invalid':text('凭据无效，请在下方重置。','Invalid credential. Reset it below.'),
    'invalid-port':text('端口应为 0–65535 的整数。','Port must be an integer from 0 to 65535.'),
    'EADDRINUSE':text('端口被占用，请关闭连接并修改端口。','Port is in use. Disable the connection and change its port.'),
    'unsupported':text('请更新 Obsidian 安装程序后再连接。','Update the Obsidian installer before connecting.')
  };
  function paint(){
    const s=service.status(),running=s.state==='listening',failure=actionError||s.error;
    painting=true;
    toggle.setValue(s.enabled).setDisabled(busy||(!s.available&&!s.enabled));
    painting=false;
    panel.hidden=!expanded;controls.hidden=!s.enabled;
    configure.setButtonText(expanded?text('收起','Close setup'):s.enabled?text('管理连接','Manage connection'):text('设置连接','Set up connection'));
    configure.buttonEl.setAttribute('aria-expanded',String(expanded));
    status.setText(failure?(errors[failure]||text('连接操作失败，请重试。','Connection operation failed. Retry.')):running?text('已开启 · 可供本机助手连接','On · available to local assistants'):s.available?text('未开启','Off'):errors['storage-unavailable']);
    status.classList.toggle('is-error',!!failure);
    client.setDisabled(busy);copy.setDisabled(busy||!s.canCopy);reset.setDisabled(busy||!s.available);
    retry.buttonEl.hidden=!(s.enabled&&!running);retry.setDisabled(busy);
    port.setDisabled(busy||s.enabled);save.setDisabled(busy||s.enabled);
    if(s.enabled)portDirty=false;
    if(!portDirty&&host.ownerDocument.activeElement!==port.inputEl)port.setValue(String(s.port));
  }
  async function act(fn){
    if(busy)return;busy=true;actionError='';paint();
    try{await fn();}catch(e){actionError=e.code||e.message;}finally{busy=false;paint();}
  }
  paint();const unsubscribe=service.subscribe(paint);void service.ready.then(paint);
  return unsubscribe;
}
module.exports={renderAgentSettings};
