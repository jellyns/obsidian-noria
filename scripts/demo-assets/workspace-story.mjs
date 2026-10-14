// Fictional, hand-written records for documentation. Dates are relative to the
// demonstration day; each task has one owner and a distinct reason for its date.
export function workspaceStory({date, day, tx, zh}) {
  const portfolio=tx('Publish my portfolio','发布个人作品集');
  const reader=tx('Build an offline reader','开发离线阅读应用');
  const projectPath=name=>`01_Projects/${name}/${name}.md`;
  const portfolioPath=projectPath(portfolio),readerPath=projectPath(reader);
  const task=(name,{start,due,scheduled,done,priority='',tag='work'}={})=>`- [${done===undefined?' ':'x'}] ${name}${priority?' '+priority:''}${start?` [start:: ${day(start[0])}${start[1]?' '+start[1]:''}]`:''}${scheduled?` [scheduled:: ${day(scheduled[0])}${scheduled[1]?' '+scheduled[1]:''}]`:''}${due?` [due:: ${day(due[0])}${due[1]?' '+due[1]:''}]`:''}${done!==undefined?` [completion:: ${day(done)}]`:''} #${tag}`;
  const portfolioTasks=[
    task(tx('Choose three projects for the portfolio','选定作品集的三个案例'),{done:-11}),
    task(tx('Get permission to use the bookshop photos','确认书店照片的展示许可'),{done:-9}),
    task(tx('Outline the bookshop wayfinding case study','列出书店导视案例的叙事提纲'),{done:-6}),
    task(tx('Prepare images for the three case studies','整理三组案例配图'),{start:[1],due:[1]}),
    task(tx('Explain the bookshop design decisions','补齐书店案例的设计取舍'),{start:[0,'09:30'],due:[0,'10:45'],priority:'⏫'}),
    task(tx('Check the mobile layout','检查移动端排版'),{scheduled:[1,'14:00']}),
    task(tx('Send the preview to a colleague','发预览链接给同事'),{due:[2]}),
    task(tx('Publish the updated portfolio','发布新版作品集'),{due:[9],priority:'⏫'}),
    task(tx('Organize the original project files','归整案例源文件'))
  ];
  const readerTasks=[
    task(tx('Define the first-release scope','确定首版功能与验收条件'),{done:-10}),
    task(tx('Review the import and reading prototype','走通导入与阅读原型'),{done:-5}),
    task(tx('Implement local article storage','实现文章本地保存'),{done:-1}),
    task(tx('Restore the last reading position','恢复上次阅读位置'),{start:[0,'14:00'],due:[0,'15:30']}),
    task(tx('Test import with three real articles','用三篇文章检查导入结果'),{scheduled:[2,'10:00']}),
    task(tx('Test airplane mode and restart recovery','验证断网阅读与重启恢复'),{start:[5],due:[6]}),
    task(tx('Share the beta with two readers','邀请两位读者试用'),{due:[7]}),
    task(tx('Ship version 1.0 with a short guide','发布 1.0 和使用说明'),{due:[16],priority:'⏫'}),
    task(tx('Compare full-text search options','比较全文搜索方案'))
  ];
  const habits=[
    {id:'demo-reading',name:tx('Read for 20 minutes','阅读二十分钟'),weekdays:'1234567',icon:'book-open',color:'#4286b9',missed:[-11,-7,-2],today:false},
    {id:'demo-strength',name:tx('Strength training','力量训练'),weekdays:'135',icon:'dumbbell',color:'#3c9b83',missed:[-5],today:true},
    {id:'demo-stretch',name:tx('Stretch before bed','睡前拉伸'),weekdays:'1234567',icon:'moon',color:'#8b78be',missed:[-9,-4],today:false}
  ];
  // The entries develop a small story. Missing check-ins and unfinished work
  // remain missing and unfinished; this is not a streak or KPI fixture.
  const entries=[
    ['先把作品摊开','Lay out the work',
      '把去年做的项目都铺在桌上，先留下四个候选。书店导视的照片不算最漂亮，但最能解释我为什么这样设计。',
      'I spread last year’s projects across the desk and kept four candidates. The bookshop photos are not the prettiest, but they show why I made each design decision.',
      '作品集先回答“我解决了什么”，再考虑版式。','Explain the problem I solved before choosing the layout.'],
    ['傍晚的旧街','An evening on the old street',
      '下班绕去旧街，看到一块手写菜单。字有些歪，远处却很好认，拍下来留作导视案例的对照。',
      'I took the long way home past a handwritten menu. The lettering was uneven but easy to read from a distance. I kept a photo as a contrast for the wayfinding case.',
      '观察可以先记下来，不必立刻变成任务。','An observation can stay a note without becoming a task.'],
    ['删掉一个案例','One fewer case study',
      '删掉了只有成品图、讲不清过程的案例。少一个项目以后，整份作品集反而有了清楚的主线。',
      'I removed a project that had finished images but no clear process. With one fewer case, the portfolio has a stronger thread.',
      '选定的三个案例足够了，这周不再补项目。','Three cases are enough. I will not add another this week.'],
    ['慢一点的午饭','A slower lunch',
      '午饭没带电脑，和朋友聊了周末想出去走走。先选交通简单的湖边路线，不追求走得远。',
      'I left the laptop behind at lunch. A friend suggested a weekend walk. We want an easy journey to the lake, not a long distance to cover.',
      '休息日留一些空白，不把每个小时都排满。','Leave some unplanned time in the weekend.'],
    ['照片的许可','Photo permission',
      '书店回复可以展示照片，但希望不要露出顾客正脸。我在素材旁记了这个限制，免得排版时忘掉。',
      'The bookshop approved the photos as long as customers’ faces are not visible. I wrote that restriction beside the images so it survives the layout work.',
      '许可与素材放在一起，下一步只处理需要裁切的两张。','Keep permission with the images; only two need cropping.'],
    ['先试一个页面','Try one page first',
      '只试排了一页，没有继续选字体。把设计前后的标识放在一起，比写一大段介绍更能说明变化。',
      'I laid out a single page instead of comparing more fonts. Showing the signs before and after explains the change better than a long introduction.',
      '先用这一页验证阅读顺序，再展开其余页面。','Check the reading order on this page before extending the layout.'],
    ['没读完也没关系','An unfinished chapter',
      '晚上回来有些累，读了几页就放下书。今天没有补打阅读；把书留在桌边，明天接着看。',
      'I was tired in the evening and stopped after a few pages. I left the reading check-in incomplete and kept the book on the desk for tomorrow.',
      '今天先早点睡，明天接着读这一章。','Get to bed early and continue this chapter tomorrow.'],
    ['案例有了骨架','A case study takes shape',
      '提纲改成了问题、尝试、选择、结果四段。原来放在开头的六张照片，最后只留下两张。',
      'The outline now follows the problem, attempts, choices and result. Of six opening photos, only two remain.',
      '明天写取舍，不继续找素材。','Write the design decisions next; stop gathering more material.'],
    ['从导入到读完','From import to reading',
      '把离线阅读应用的原型给朋友试了一遍。他找到导入按钮，却不知道文章有没有保存成功。我给保存结果补了反馈，也删去了还用不上的分类设置。',
      'A friend tried the offline-reader prototype. He found Import but could not tell whether the article had been saved. I added a saved state and removed category settings that the first release does not need.',
      '先做好导入、保存和继续阅读这条路径，再考虑全文搜索。','Finish import, local storage and resume reading before considering full-text search.'],
    ['被打断的下午','An interrupted afternoon',
      '下午接连回消息，案例只改了两段。晚上没有继续追进度，先把明天要写的那句话留在文档里。',
      'Messages broke up the afternoon and I revised only two paragraphs. I did not extend the work into the evening; I left a starting sentence for tomorrow.',
      '下次把消息集中到写作时段之后处理。','Handle messages after the writing block next time.'],
    ['文章终于发出去了','The article is published',
      '导视设计文章的终稿发出去了。编辑最后删掉了两段重复的背景，三张对照图也补齐了说明。把校对记录留在项目笔记里，这一版可以收尾。',
      'The wayfinding article is published. The editor removed two repetitive background paragraphs, and the three comparison images now have captions. I kept the proof notes in the project; this version is complete.',
      '发表稿已经交付，后续反馈单独收下，不继续改动这一版。','The published version is delivered. Collect new feedback separately instead of reopening it.'],
    ['一页比一套更有用','One page is enough to review',
      '把试排页给同事看，他先问的是为什么保留旧标识。我才发现这段取舍还没有写出来。',
      'A colleague saw the draft page and asked why I kept the old sign. That question exposed the design decision I had not explained.',
      '下次专注时先补这段，动效和封面都往后放。','Explain that decision in the next focus block; leave animation and the cover until later.'],
    ['保存以后还能打开','Reopen a saved article',
      '离线阅读应用终于可以重新打开保存的文章。先关掉网络试了一次，正文还在，但阅读位置回到了开头。把这个问题记到项目里，晚上照常做饭。',
      'The reader can reopen a saved article now. With the network off, the text remained but the reading position returned to the top. I recorded that issue in the project and stopped for dinner.',
      '明天先处理阅读位置，再用完整流程检查断网和重启。','Restore the reading position next, then check the full flow offline and after a restart.'],
    ['把理由讲清楚','Explain the decision',
      '上午用两个专注时段重写了书店案例。第一版一直在讲做了什么，第二版才说清为什么保留原有字形。下午留了一个半小时，处理阅读应用的进度恢复。',
      'Two focus blocks helped me rewrite the bookshop case this morning. The first version listed what changed; the second explains why the original lettering stayed. I have set aside ninety minutes this afternoon to restore reading progress in the app.',
      '还需要补一张对照图，再发预览。这轮先不做首页动效。','Add one comparison image before sharing the preview. Homepage animation can wait.']
  ];
  const moods=[3,4,4,4,3,4,2,4,4,2,4,4,4,4],energy=[3,3,4,4,3,4,2,4,4,2,3,4,3,4];
  const incidental=new Map([
    [-12,[task(tx('Return the borrowed camera','归还借来的相机'),{done:-12,tag:'life'})]],
    [-8,[task(tx('Book a dental check-up','预约口腔检查'),{done:-8,tag:'life'})]],
    [-3,[task(tx('Drop off the old cables for recycling','送旧线缆去回收点'),{done:-3,tag:'life'})]],
    [0,[task(tx('Send the return parcel','寄出退换货包裹'),{start:[0,'08:20'],due:[0,'08:35'],done:0,tag:'life'}),task(tx('Book a bicycle service','预约自行车检修'),{scheduled:[0],tag:'life',priority:'🔽'})]]
  ]);
  const diaries=entries.map((e,i)=>{
    const offset=i-13,ymd=day(offset),weekday=new Date(ymd+'T12:00:00').getDay()||7;
    const checks=habits.filter(h=>h.weekdays.includes(String(weekday))).map(h=>{
      const done=offset===0?h.today:!h.missed.includes(offset);
      return `- [${done?'x':' '}] ${h.name} #habit #active [due:: ${ymd}]${done?` [completion:: ${ymd}]`:''}`;
    });
    const body=[`## ${zh?e[0]:e[1]}`,zh?e[2]:e[3],...(incidental.has(offset)?[`## ${tx('Today','今日')}`,...incidental.get(offset)]:[]),...checks,
      ...(offset===0?['## Inbox',`- [11:20] ${tx('Try placing the old sign beside the new one; the comparison may explain more than another paragraph.','试着把旧标识和新版并排放，可能比再加一段文字更清楚。')}`]:[]),
      `## ${tx('Review','复盘')}`,zh?e[4]:e[5]].join('\n\n');
    return {offset,date:ymd,mood:moods[i]===2?'一般':moods[i]===4?'很好':'稳定',energy:energy[i],sleep:[7.2,7.5,8,7.1,6.8,7.6,6.2,7.8,8.1,6.4,7.5,7.2,7.8,7.3][i],body};
  });
  return {portfolio,reader,portfolioPath,readerPath,portfolioTasks,readerTasks,habits,diaries,task};
}
