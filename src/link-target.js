"use strict";
// Explicit file/web destinations shared by shortcuts and optional domain views.
function readingTarget(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (/[\x00-\x1f]/.test(raw)) throw Error('阅读入口包含无效字符 / Invalid reading link');
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const url = new URL(raw);
    if (!['https:', 'http:', 'obsidian:', 'steam:', 'zotero:'].includes(url.protocol) || url.username || url.password)
      throw Error('请选择库内文件、网页或支持的应用链接 / Choose a vault file, web or supported app link');
    return {type: 'url', value: url.href};
  }
  const link = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(raw);
  const path = link ? link[1] : raw;
  if (!path || /^[\\/]/.test(path) || /[\[\]\\]/.test(path)) throw Error('请选择库内文件 / Choose a vault file');
  return {type: 'file', value: path};
}
// Returning to an open work keeps its reader position; explicit anchors still navigate.
async function openVaultLink(plugin, link, sourcePath, origin) {
  const {workspace,metadataCache}=plugin.app;
  const target=metadataCache.getFirstLinkpathDest(link.split('#')[0],sourcePath);
  let existing;
  if(target)workspace.iterateAllLeaves?.(leaf=>{if(!existing&&leaf.view?.file?.path===target.path)existing=leaf;});
  const cancelReturn=require('./source-navigation.js').rememberSourceReturn(plugin,origin);
  try{if(existing){
    await workspace.revealLeaf(existing);
    workspace.setActiveLeaf(existing,{focus:true});
    if(link.includes('#'))await workspace.openLinkText(link,sourcePath,false);
  }else await workspace.openLinkText(link,sourcePath,true);
  }catch(error){cancelReturn();throw error;}
}
module.exports={readingTarget,openVaultLink};
