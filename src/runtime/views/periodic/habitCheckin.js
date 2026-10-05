const bridge=input?.noriaBridge || globalThis.__noriaRuntimeBridge || {};
const name=String(ctx.current()?.file?.name || '').replace(/\.md$/i,'');
const date=input?.date || (/^\d{8}$/.test(name)?name.slice(0,4)+'-'+name.slice(4,6)+'-'+name.slice(6):/^\d{4}-\d{2}-\d{2}$/.test(name)?name:'');
const container=ctx.el('div','',{cls:'habit-checkin-list'});
await bridge.diaryHabits.render({container,date,registryPath:input?.sourcePath || bridge.paths?.habitRegistryPath});
