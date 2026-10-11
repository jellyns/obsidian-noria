"use strict";
const {setIcon, Notice} = require('obsidian');
const {iconButton} = require('./card-controls.js');
const {listMedia} = require('./media-catalog.js');
const {readMedia} = require('./media-record.js');
const {mediaEditor} = require('./media-editor.js');
const {mediaMetadataEditor} = require('./media-metadata-editor.js');
const {mediaIntake} = require('./media-intake-ui.js');
const {bookProgress} = require('./media-display.js');
const {bindCoverImage,watchCoverImages}=require('./media-cover.js');

function bookPosition(item, text) {
  const progress = bookProgress(item);
  if (!progress) return '';
  const {page, total} = progress;
  return total !== null && total >= page
    ? text(`${page} / ${total} 页`, `${page} / ${total} pages`)
    : text(`第 ${page} 页`, `Page ${page}`);
}

function coverSource(plugin, item) {
  for (let value of [item.properties.image, item.properties.cover]) {
    if (typeof value !== 'string' || !value.trim()) continue;
    value = value.trim();
    if (/^https?:\/\//i.test(value)) {
      try { const url = new URL(value); if (!url.username && !url.password) return url.href; } catch {}
      continue;
    }
    value = value.replace(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1');
    const file = plugin.app.metadataCache.getFirstLinkpathDest(value, item.path);
    if (file && /^(png|jpe?g|webp|gif|avif|svg)$/i.test(file.extension || '')) return plugin.app.vault.getResourcePath(file);
  }
  return '';
}

function registerMediaCard(system) {
  const {plugin} = system, text = (zh, en) => system.text(zh, en);
  const types = [['', text('全部类型', 'All types')], ['book', text('书籍', 'Books')], ['movie', text('影视', 'Film & TV')], ['music', text('音乐', 'Music')], ['game', text('游戏', 'Games')]];
  const load = config => {
    const items = []; let offset = 0, page;
    do { page = listMedia(plugin, {folder: config.folder, recursive: config.recursive !== false, offset, limit: 100}); items.push(...page.items); offset = page.nextOffset; } while (offset !== null);
    return {items, unindexed: page.unindexed};
  };
  system.register({id: 'noria:media', title: text('作品列表', 'Works list'), icon: 'library',
    description: text('继续正在读、看、玩的作品，搜索收藏并打开原笔记。', 'Continue your books, films and games, or browse their original notes.'),
    fields: [
      {key: 'folder', label: text('作品目录', 'Media folder'), type: 'folder', required: true},
      {key: 'recursive', label: text('包含子目录', 'Include subfolders'), type: 'checkbox', default: true},
      {key: 'kind', label: text('默认类型', 'Default type'), type: 'select', default: '', options: types.map(([value, label]) => ({value, label}))},
      {key: 'status', label: text('默认状态（留空显示全部）', 'Default status (empty for all)'), type: 'text', default: '进行中'},
      {key: 'display', label: text('显示方式', 'Display'), type: 'select', default: 'covers', options: [{value: 'covers', label: text('封面', 'Covers')}, {value: 'list', label: text('列表', 'List')}]}],
    validate: config => { listMedia(plugin, {folder: config.folder, limit: 1}); },
    render: ({container, component, config, openSource, context = {}}) => {
      container.addClass('noria-media');
      if (!config.folder?.trim()) { container.createDiv({cls: 'noria-card-empty', text: text('在卡片设置中选择作品目录。', 'Choose a media folder in card settings.')}); return; }
      let items = [], kind = config.kind || '', status = config.status ?? '进行中', limit = 24, timer, disposed = false, unindexed = 0, editing = false, closeEditor, refreshPending = false;
      const toolbar = container.createDiv({cls: 'noria-media-toolbar'});
      const search = toolbar.createEl('input', {attr: {type: 'search', placeholder: text('搜索作品或作者', 'Search titles or creators'), 'aria-label': text('搜索作品或作者', 'Search titles or creators')}});
      const filters = toolbar.createDiv({cls: 'noria-media-filters'});
      const typeSelect = filters.createEl('select', {attr: {'aria-label': text('作品类型', 'Media type')}});
      for (const [value, label] of types) typeSelect.createEl('option', {value, text: label});
      typeSelect.value = kind;
      const statusSelect = filters.createEl('select', {attr: {'aria-label': text('作品状态', 'Media status')}});
      const feedback = container.createDiv({cls: 'noria-media-feedback noria-card-secondary', attr: {role: 'status'}});
      const viewport = container.createDiv({cls: 'noria-media-viewport'});
      const shelf = viewport.createDiv({cls: 'noria-media-shelf'}); shelf.dataset.display = config.display === 'list' ? 'list' : 'covers';
      const more = container.createEl('button', {cls: 'noria-media-more', text: text('显示更多', 'Show more'), attr: {type: 'button'}});
      const finishEditing = (focus, changed = false) => {
        editing = false; closeEditor = null;
        const refresh = () => { if (disposed || editing) return; if (refreshPending) { refreshPending = false; reload(); } else if (changed) paint(); };
        if (focus) refresh();
        else if (!disposed && (refreshPending || changed)) {
          // Let the outside click reach its target before rebuilding the shelf.
          const clicked = () => queueMicrotask(refresh), doc = container.ownerDocument;
          doc.addEventListener('click', clicked, {once: true});
          component.register(() => doc.removeEventListener('click', clicked));
        }
      };
      const paint = () => {
        if (disposed) return;
        const scroll = viewport.scrollTop, focusedPath = shelf.contains(container.ownerDocument.activeElement) ? container.ownerDocument.activeElement.dataset.path : null;
        const focusedEdit = shelf.contains(container.ownerDocument.activeElement) ? container.ownerDocument.activeElement.dataset.editPath : null;
        const focusedMetadata = shelf.contains(container.ownerDocument.activeElement) ? container.ownerDocument.activeElement.dataset.metadataPath : null;
        const needle = search.value.trim().toLocaleLowerCase();
        const matches = items.filter(item => (!kind || item.kinds.includes(kind)) && (!status || item.properties.status === status) &&
          (!needle || [item.title, item.properties.author, item.properties.director].flat().filter(v => typeof v === 'string').join(' ').toLocaleLowerCase().includes(needle)));
        shelf.empty();
        for (const item of matches.slice(0, limit)) {
          const work = shelf.createDiv({cls: 'noria-media-work'}); work.dataset.path = item.path;
          const button = work.createEl('button', {cls: 'noria-media-open', attr: {type: 'button', title: item.title, 'aria-label': text(`打开 ${item.title}`, `Open ${item.title}`)}});
          button.dataset.path = item.path;
          const cover = button.createSpan({cls: 'noria-media-cover', attr: {'aria-hidden': 'true'}});
          setIcon(cover, item.kinds.includes('book') ? 'book-open' : item.kinds.includes('game') ? 'gamepad-2' : 'clapperboard');
          bindCoverImage(cover,()=>coverSource(plugin,item));
          const body = button.createSpan({cls: 'noria-media-work-body'});
          body.createSpan({cls: 'noria-media-title', text: item.title});
          const detail = [item.properties.status, bookPosition(item, text)].filter(v => typeof v === 'string' && v.trim()).join(' · ');
          const id = `noria-media-detail-${crypto.randomUUID()}`;
          if (context.preview) {
            if (detail) work.createSpan({cls: 'noria-media-detail', text: detail, attr: {id}});
          } else {
            const position = work.createEl('button', {cls: 'noria-media-position noria-media-detail', text: detail || text('填写状态', 'Set status'), attr: {id, type: 'button', 'aria-haspopup': 'dialog', 'aria-label': text(`更新 ${item.title} · ${detail || '状态'}`, `Update ${item.title} · ${detail || 'status'}`)}});
            position.dataset.editPath = item.path;
            const pages = bookPosition(item, text);
            if (pages) {
              position.empty();
              if (typeof item.properties.status === 'string' && item.properties.status.trim()) {
                position.createSpan({text: item.properties.status});
                position.createSpan({cls: 'noria-media-position-separator', text: ' · '});
              }
              position.createSpan({cls: 'noria-media-pages', text: pages});
            }
            position.onclick = async () => {
              if (editing) return; editing = true; position.disabled = true;
              let changed = false;
              try {
                const state = await readMedia(plugin, {path: item.path});
                if (disposed || !position.isConnected) { editing = false; return; }
                closeEditor = mediaEditor(plugin, position, state, {statuses: items.map(row => row.properties.status),
                  onSaved: result => { changed = result.changed; const row = items.find(row => row.path === result.path); if (row) Object.assign(row.properties, result.properties); if (!editing && !disposed) paint(); },
                  onClose: focus => finishEditing(focus, changed)
                });
              } catch (error) { editing = false; new Notice(error.message); }
              finally { position.disabled = false; }
            };
          }
          if (!context.preview && item.kinds.includes('book')) {
            const details = iconButton(work, 'file-pen-line', text('编辑作品资料', 'Edit work details'), async () => {
              if (editing) return; editing = true; details.disabled = true;
              let changed = false;
              try {
                const state = await readMedia(plugin, {path: item.path});
                if (disposed || !details.isConnected) { editing = false; return; }
                closeEditor = mediaMetadataEditor(plugin, details, state, {preferredImage: item.properties.image,
                  onSaved: result => { changed = result.changed; const row = items.find(row => row.path === result.path); if (row) Object.assign(row.properties, result.properties); if (!editing && !disposed) paint(); },
                  onClose: focus => finishEditing(focus, changed)
                });
              } catch (error) { editing = false; new Notice(error.message); }
              finally { details.disabled = false; }
            });
            details.classList.add('noria-media-edit-details'); details.dataset.metadataPath = item.path;
            details.setAttribute('aria-haspopup', 'dialog');
          }
          if (detail) button.setAttribute('aria-describedby', id);
          button.onclick = () => Promise.resolve().then(() => context.preview
            ? plugin.propertyStats.openRows([{path: item.path, title: item.title}], {recorded: 1, summary: ''}, item.title, false, {preview: true})
            : openSource(item.path)).catch(error => new Notice(error.message));
        }
        if (!matches.length) {
          const empty = shelf.createDiv({cls: 'noria-media-empty'});
          empty.createSpan({text: items.length ? text('没有符合当前筛选的作品。', 'No works match these filters.') : text('此目录没有已标记的作品。', 'No tagged works in this folder.')});
          if (items.length) {
            const reset = empty.createEl('button', {text: text('查看全部', 'View all'), attr: {type: 'button'}});
            reset.onclick = () => { kind = status = ''; search.value = ''; typeSelect.value = statusSelect.value = ''; limit = 24; viewport.scrollTop = 0; paint(); search.focus(); };
          } else empty.createSpan({cls: 'noria-card-secondary', text: text('作品笔记使用 book、movie／tv／anime、music 或 game 标签。', 'Use book, movie / tv / anime, music, or game tags on media notes.')});
        }
        more.hidden = matches.length <= limit;
        if (!more.hidden) more.setText(text(`显示更多 · 还有 ${matches.length - limit} 项`, `Show more · ${matches.length - limit} remaining`));
        viewport.scrollTop = scroll;
        if (focusedPath) [...shelf.querySelectorAll('button[data-path]')].find(button => button.dataset.path === focusedPath)?.focus({preventScroll: true});
        if (focusedEdit) ([...shelf.querySelectorAll('button[data-edit-path]')].find(button => button.dataset.editPath === focusedEdit) || search).focus({preventScroll: true});
        if (focusedMetadata) ([...shelf.querySelectorAll('[data-metadata-path]')].find(button => button.dataset.metadataPath === focusedMetadata) || search).focus({preventScroll: true});
      };
      const reload = () => {
        if (disposed) return;
        if (editing) { refreshPending = true; return; }
        try {
          const result = load(config); items = result.items; unindexed = result.unindexed;
          statusSelect.empty(); statusSelect.createEl('option', {value: '', text: text('全部状态', 'All statuses')});
          const states = [...new Set([status, ...items.map(item => item.properties.status)].filter(v => typeof v === 'string' && v.trim()))];
          for (const value of states) statusSelect.createEl('option', {value, text: value});
          statusSelect.value = status;
          feedback.setText(result.unindexed ? text(`${result.unindexed} 篇笔记尚未完成索引`, `${result.unindexed} notes are not indexed yet`) : ''); feedback.hidden = !result.unindexed;
          paint();
        } catch (error) {
          items = []; shelf.empty(); more.hidden = true; feedback.hidden = false;
          feedback.setText(text('无法读取作品目录；请核对卡片设置后重试。', 'Cannot read the media folder. Check card settings and retry.') + ' ' + error.message);
        }
      };
      iconButton(filters, 'refresh-cw', text('刷新作品', 'Refresh works'), reload);
      const intakeDraft = {title: '', kind: kind || 'book', folder: plugin.normalizePath(config.folder.trim()).replace(/\/$/, '')};
      if (!context.preview) {
        const add = iconButton(filters, 'plus', text('添加作品', 'Add a work'), () => {
          if (editing) return;
          editing = true;
          if (!intakeDraft.title) intakeDraft.title = search.value;
          closeEditor = mediaIntake(plugin, add, {root: plugin.normalizePath(config.folder.trim()).replace(/\/$/, ''), draft: intakeDraft, openSource,
            onClose: finishEditing,
            onCreated: (result, reveal) => {
              if (disposed) return;
              if (reveal) { kind = status = ''; typeSelect.value = statusSelect.value = ''; search.value = result.title; limit = 24; viewport.scrollTop = 0; }
              reload();
              if (reveal && !items.some(item => item.path === result.path)) { items.unshift({...result, tags: result.kinds, properties: {}}); paint(); }
            }
          });
        });
      }

      search.oninput = () => { limit = 24; viewport.scrollTop = 0; paint(); };
      typeSelect.onchange = () => { kind = typeSelect.value; limit = 24; viewport.scrollTop = 0; paint(); };
      statusSelect.onchange = () => { status = statusSelect.value; limit = 24; viewport.scrollTop = 0; paint(); };
      more.onclick = () => { limit += 24; paint(); };
      const root = plugin.normalizePath(config.folder.trim()).replace(/\/$/, '');
      const related = path => path && (path === root || path.startsWith(root + '/') || root.startsWith(path + '/'));
      const schedule = (file, oldPath) => { if (!related(file?.path) && !related(typeof oldPath === 'string' ? oldPath : '')) return; clearTimeout(timer); timer = setTimeout(reload, 180); };
      component.registerEvent(plugin.app.metadataCache.on('changed', schedule));
      component.registerEvent(plugin.app.metadataCache.on('resolved', () => { if (unindexed) reload(); }));
      component.registerEvent(plugin.app.vault.on('delete', schedule));
      component.registerEvent(plugin.app.vault.on('rename', schedule));
      watchCoverImages(plugin,component,container);
      component.register(() => { disposed = true; clearTimeout(timer); closeEditor?.(false); });
      reload();
    }});
}
module.exports = {registerMediaCard, bookPosition, coverSource};
