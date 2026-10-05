// Adds read-only migration checks and a scoped visual fixture to the running acceptance.
(()=>{
  const q=window.__noriaHandoff,p=app.plugins.plugins.noria,fs=require('fs');
  q.historyCheck=async()=>{
    await p.ensureDataService();q.history=[];
    for(const version of ['before','after']){
      const root='_acceptance-b-handoff-20260914/migration-v2/'+version;
      const paths={diaryRoot:root+'/06_Diary',habitRegistryPath:root+'/02_Areas/Noria/Habits.md'};
      const bridge={...p.buildRuntimeBridgeConfig(),runtimeBuildId:'handoff-'+version,paths,
        runtime:{toArray:v=>Array.from(v||[]),filesForManagedPath:key=>app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(paths[key]+'/'))}};
      const service=globalThis.dashboardCore.data.dataService.createDataService({bridge,app});
      const data=await service.getSnapshot({include:['habits'],range:{mode:'custom',start:'2026-01-01',end:'2026-09-14'}});
      q.history.push(data.domains.habits);
    }
    q.check(JSON.stringify(q.history[0].summary)===JSON.stringify(q.history[1].summary),'migration copies preserve aggregate habit statistics');
    q.check(JSON.stringify(q.history[0].items)===JSON.stringify(q.history[1].items),'migration copies preserve each habit and its dated heatmap');
    fs.writeFileSync(q.base+'native-history.json',JSON.stringify(q.history,null,2));
    return {checked:q.history[1].summary.checked,checks:q.checks.length};
  };
  q.visual=async()=>{
    const file=await q.seed('_acceptance-b-handoff-20260914/fixtures/日期正文排版.md',
      '---\ncssclasses: [daily-clean]\n---\n## 九月留白\n\n给阅读和散步留出一段时间。记录可以很短，也可以顺着当时的想法写下去；不同的标题和段落仍然按原来的顺序展开。\n\n### 随手留下\n\n- 路边的小花店，换了一束向日葵。\n- 读到有意思的句子，先留下一点感想。\n\n> 记录本身就有价值，不必每一次都变成任务。\n\n## 一个小计划\n\n- [ ] 周末整理散步拍到的六张照片\n- [x] 读完一个短篇\n\n| 时间 | 留下的片段 |\n| --- | --- |\n| 周二 | 街角、雨后的树叶与短暂的安静 |\n| 周末 | 一本书、一段散步，给生活留一点余地 |\n\n![插件日期页面](../../../Noria/Diary/2026/no-such-image.png)\n');
    // Replace the fixture-only image with an existing public documentation asset.
    const asset='_acceptance-b-handoff-20260914/fixtures/diary-editor.png';
    if(app.vault.getAbstractFileByPath(asset))throw new Error('Existing visual asset');
    q.owned.add(asset);await app.vault.createBinary(asset,fs.readFileSync('F:/Noria/obsidian-noria/docs/assets/zh-CN/diary-editor.png'));
    await app.vault.process(file,raw=>raw.replace('../../../Noria/Diary/2026/no-such-image.png','diary-editor.png'));
    const leaf=app.workspace.getLeaf('tab');q.visualLeaf=leaf;
    const opening=leaf.openFile(file,{state:{mode:'preview'}});await app.workspace.revealLeaf(leaf);await opening;
    await q.wait(()=>leaf.view.contentEl.querySelector('h2'));
    return 'Typography fixture open';
  };
  q.inspectStyle=()=>{
    const reading=q.visualLeaf.view.getMode()==='preview';
    const root=q.visualLeaf.view.contentEl.querySelector(reading?'.markdown-preview-view':'.markdown-source-view');
    const h2=root.querySelector(reading?'h2':'.cm-header-2'),h3=root.querySelector(reading?'h3':'.cm-header-3');
    const describe=el=>{if(!el)return null;const s=getComputedStyle(el);return {font:s.fontSize,weight:s.fontWeight,before:getComputedStyle(el,'::before').content,background:s.backgroundColor};};
    const scroll=reading?root:root.querySelector('.cm-scroller');
    const result={mode:q.visualLeaf.view.getMode(),h2:describe(h2),h3:describe(h3),width:scroll.clientWidth,overflow:scroll.scrollWidth>scroll.clientWidth+2};
    q.styles=q.styles||[];q.styles.push(result);fs.writeFileSync(q.base+'native-styles.json',JSON.stringify(q.styles,null,2));return result;
  };
  return 'Preview checks ready';
})()
