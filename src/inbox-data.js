"use strict";
const {FIELD, parseWork} = require("./inbox-work.js");
const {loadEntries} = require("./inbox-entries.js");

// One inventory for the card, statistics and integrations. A list-only Inbox.md
// is a container, not an additional item. Entry creation dates are unknown.
function collectItems(plugin, store) {
  const root = plugin.getManagedPath("inboxRoot").replace(/\/+$/, "") + "/";
  return plugin.filesUnderRoots([root], [".md"])
    .filter(file => file.path !== store.file?.path || store.showFile)
    .map(file => ({path:file.path, name:file.basename, mtime:file.stat.mtime, ctime:file.stat.ctime,
      work:parseWork(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[FIELD]).value}))
    .concat(store.entries.map(entry => ({path:store.file.path+"#"+entry.line, sourcePath:store.file.path,
      entry, name:entry.name, work:entry.work, mtime:store.file.stat.mtime, ctime:null})))
    .sort((a,b) => b.mtime-a.mtime || a.path.localeCompare(b.path));
}

async function inventory(plugin) {
  return collectItems(plugin, await loadEntries(plugin));
}

async function statisticsItems(plugin) {
  return (await inventory(plugin)).map(({entry, ...item}) => {
    const {actor, action} = parseWork(item.work);
    return {...item, actor, action, kind:entry ? "entry" : "note"};
  });
}

module.exports = {collectItems, inventory, statisticsItems};
