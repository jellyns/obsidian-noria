import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import inboxSeeds from '../src/inbox-seeds.js';
import habitDefinition from '../src/habit-definition.js';
import focusDocument from '../src/focus-document.js';
import {workspaceStory} from './demo-assets/workspace-story.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=message=>{console.error(`Noria demo vault: ${message}`);process.exit(1);};
const targetArg=process.argv[2];if(!targetArg)fail('pass a new empty target directory');
const targetRoot=path.resolve(targetArg);
const date=process.argv.find(x=>x.startsWith('--date='))?.slice(7)||new Date().toISOString().slice(0,10);
const locale=process.argv.find(x=>x.startsWith('--locale='))?.slice(9)||'en';
if(!['zh-CN','en'].includes(locale))fail('--locale must be en or zh-CN');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('--date must be a valid YYYY-MM-DD');
if(fs.existsSync(targetRoot)&&fs.readdirSync(targetRoot).length)fail(`target directory is not empty: ${targetRoot}`);
for(const name of ['main.js','manifest.json','styles.css'])if(!fs.existsSync(path.join(repoRoot,name)))fail(`missing ${name}; build the public plugin first`);
const zh=locale==='zh-CN',tx=(en,cn)=>zh?cn:en;
const day=offset=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const story=workspaceStory({date,day,tx,zh});
const write=(rel,content)=>{const dest=path.join(targetRoot,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,String(content).replace(/\r\n/g,'\n'),'utf8');};
const note=(rel,body,offset=-13,extra={})=>write(rel,'---\n'+Object.entries({created:day(offset),tags:['noria-demo'],...extra}).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n\n'+body+'\n');
for(const name of ['00_Inbox','01_Projects','02_Areas','03_Resources','04_Archives','05_MOC','06_Diary','99_Attachment'])fs.mkdirSync(path.join(targetRoot,name),{recursive:true});
for(const name of ['main.js','manifest.json','styles.css']){const dest=path.join(targetRoot,'.obsidian/plugins/noria',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(repoRoot,name),dest);}
write('.noria-demo-vault',`Noria release demo\nScenario: portfolio-and-offline-reader\nDate: ${date}\nLocale: ${locale}\n`);
write('.gitignore','.obsidian/workspace*.json\n.obsidian/plugins/noria/main.js\n.obsidian/plugins/noria/manifest.json\n.obsidian/plugins/noria/styles.css\n.trash/\n');
write('.obsidian/community-plugins.json',JSON.stringify(['noria']));
write('.obsidian/appearance.json',JSON.stringify({baseFontSize:16,theme:'moonstone'}));
write('.obsidian/app.json',JSON.stringify({attachmentFolderPath:'99_Attachment',newFileLocation:'folder',newFileFolderPath:'00_Inbox'}));
const workflow=`05_MOC/${tx('Workflow','工作流')}·MOC.md`,craft=`05_MOC/${tx('Design notes','设计笔记')}·MOC.md`;
const managedPaths={templateLibrary:'02_Areas/Noria/Event library.md',importantDates:'02_Areas/Noria/Countdowns.md',habitRegistry:'02_Areas/Noria/Habits.md',projectRegistry:'02_Areas/Noria/Projects.md',inboxQueue:'02_Areas/Noria/Inbox queue.base',inboxRoot:'00_Inbox',projectsRoot:'01_Projects',diaryRoot:'06_Diary',dailyTemplate:'',weeklyTemplate:'',monthlyTemplate:'',yearlyTemplate:''};
const data={managedPaths,shortcuts:[{kind:'file',target:story.portfolioPath},{kind:'file',target:craft}],
  onboarding:{profile:'ipara',workspaceRoot:'02_Areas/Noria',initializedAt:date+'T08:00:00.000Z',dismissedVersion:''},
  home:{profilePreset:'default',identity:{displayName:'Noria',greetingName:'Noria',avatarPath:'99_Attachment/noria.svg',quoteListPath:'02_Areas/Noria/Quotes.md'},guidePanels:{inbox:true,projects:true,moc:true,reviewCenter:true,reviewCenterExpanded:false}},
  homeDashboard:{mocEntryPaths:[workflow,craft],mocEntries:[{path:workflow,color:'#8b78be'},{path:craft,color:'#4286b9'}]},
  workbenchPages:{version:1,defaultPage:'home',pages:['home','diary','day','calendar'].map(id=>({id}))},
  tasksCalendar:{defaultView:'week',taskTimelineOpenMode:'main-tab',activeHours:{start:480,end:1080,fullDay:false}},
  appearance:{tagColorMap:{work:'#7082c5',life:'#4c9f8a',review:'#b5844c'}},
  performance:{queryScopes:{tasks:{mode:'managed',customRoots:[]},notes:{mode:'managed',customRoots:[]}}},
  weather:{enabled:false,provider:'open-meteo',qweatherSecretName:'noria-weather-qweather-key',manualCity:tx('Berlin','北京'),cacheMinutes:45},
  features:{modules:{home:true,tasksBoard:true,taskTimeline:true,pomodoro:true,diaryStats:true,calendar:true}},
  recordFields:[{id:'mood',property:'mood',name:tx('Mood','心情'),type:'option',options:['很好','稳定','一般','偏低','很差'],icon:'smile',enabled:true,legacy:'mood'},{id:'energy',property:'energy',name:tx('Energy','精力'),type:'level',min:1,max:5,icon:'battery-medium',enabled:true,legacy:'energy'},{id:'sleep',property:'sleep_hours',name:tx('Sleep','睡眠时长'),type:'number',unit:tx('h','小时'),icon:'moon',color:'#8b78be',enabled:true}]};
write('.obsidian/plugins/noria/data.json',JSON.stringify(data,null,2)+'\n');
write('99_Attachment/noria.svg',fs.readFileSync(path.join(repoRoot,'docs/assets/brand/noria-avatar.svg'),'utf8'));
note('02_Areas/Noria/Quotes.md',`- ${tx('Leave room for the work that matters.','给重要的事留出空间。')}\n- ${tx('Make the next step clear.','让下一步清楚一点。')}`);
note(story.portfolioPath,`## ${tx('Outcome','完成时是什么样子')}\n\n${tx('Publish three case studies that explain the problem, design choices and result. Share a preview with a colleague before launch.','发布三个能讲清问题、设计取舍与结果的案例。上线前先请同事看一遍预览。')}\n\n## ${tx('Next actions','行动')}\n\n${story.portfolioTasks.join('\n')}\n\n## ${tx('Decisions','取舍')}\n\n${tx('Keep the original bookshop lettering as a familiar landmark. Explain that choice with a before-and-after image. Homepage animation is outside this release.','保留书店原有字形作为熟悉的识别点，用前后对照图解释这项选择。首页动效不在这轮范围里。')}`,-13,{project:story.portfolio,status:'active',tags:['project/work','noria-demo']});
note(story.readerPath,`## ${tx('Outcome','完成条件')}\n\n${tx('Ship a small desktop reader that imports an article, saves it locally and resumes reading after a restart without a network connection. Two readers must finish this flow before version 1.0 ships.','交付一个桌面阅读应用：导入文章、本地保存，断网重启后能从上次位置继续阅读。邀请两位读者独立走通这条路径后发布 1.0。')}\n\n## ${tx('Prototype','原型')}\n\n${story.readerTasks.slice(0,2).join('\n')}\n\n## ${tx('Build and verify','开发与验证')}\n\n${story.readerTasks.slice(2,6).join('\n')}\n\n## ${tx('Beta and release','试用与发布')}\n\n${story.readerTasks.slice(6,8).join('\n')}\n\n## ${tx('Later','后续考虑')}\n\n${story.readerTasks.slice(8).join('\n')}\n\n## ${tx('Scope decisions','范围与取舍')}\n\n${tx('The first release supports article text and reading position on one device. Cloud sync, recommendations and full-text search remain outside this release. The saved-state feedback came from a prototype trial; verify it again with imported articles.','首版只做单设备正文阅读与进度恢复。云同步、内容推荐、全文搜索不进入首版。保存成功的反馈来自原型试用，导入真实文章后再检查一次。')}`,-13,{project:story.reader,status:'active',tags:['project/work','noria-demo']});
const archive=`04_Archives/01_Projects/${tx('Publish a wayfinding article','发表导视设计文章')}/${tx('Publish a wayfinding article','发表导视设计文章')}.md`;
note(archive,`## ${tx('Done','已完成')}\n\n${tx('Published an illustrated article explaining three wayfinding decisions, with image permission and a final editorial check. The public version is complete; future feedback belongs in a new revision.','发表一篇图文文章，解释三个导视设计取舍，已确认图片许可并完成编辑校对。公开稿已交付，后续反馈留待另一次修订。')}\n\n${story.task(tx('Confirm the image permissions','确认配图许可'),{done:-9})}\n${story.task(tx('Proofread and publish the final article','校对并发表终稿'),{done:-3})}`,-10,{status:'archived',completed:day(-3)});
note(managedPaths.projectRegistry,`## ${tx('Active projects','进行中的项目')}\n\n- [[${story.portfolioPath}|${story.portfolio}]]\n- [[${story.readerPath}|${story.reader}]]\n\n## ${tx('Completed projects','已完成项目')}\n\n- [[${archive}|${tx('Publish a wayfinding article','发表导视设计文章')}]]`);
let registry=tx('Fictional definitions. Check-ins live in their dated notes.','虚构示例定义。每次打卡保存在对应日期笔记。');
for(const h of story.habits)registry=habitDefinition.writeHabitDefinition(registry,null,{...h,type:'',stage:'active',startedOn:day(-13)},{id:h.id,zh,today:date});
write(managedPaths.habitRegistry,registry);
note(managedPaths.importantDates,`## ${tx('Important dates','重要日期')}\n\n| ${tx('Date','日期')} | ${tx('Name','名称')} | ${tx('Type','类型')} | ${tx('Note','说明')} |\n| --- | --- | --- | --- |\n| ${day(16)} | ${tx('Reader 1.0 release','阅读应用 1.0 发布')} | project | [[${story.readerPath}]] |\n| ${day(9)} | ${tx('Portfolio launch','作品集上线')} | project | [[${story.portfolioPath}]] |`);
note(managedPaths.templateLibrary,`## ${tx('Time blocks','时间块')}\n\n- [x] ${tx('Write a case study','案例写作')} [default_tag:: #work] [default_start::09:30] [default_duration_min::75] #tl/template\n- [x] ${tx('Weekly review','每周回顾')} [default_tag:: #review] [default_start::17:00] [default_duration_min::30] #tl/template`);
write(managedPaths.inboxQueue,inboxSeeds.inboxQueueSeed({locale:zh?'zh':'en',root:'00_Inbox'}));
const inbox=[
 [tx('The bookshop feedback','书店的反馈'),'我：整理',tx('The owner liked keeping the familiar lettering. Save the exact feedback beside the case study before editing the introduction.','店主很喜欢保留熟悉字形的处理。先把原话放到案例旁边，再改开头。')],
 [tx('Questions from the portfolio review','作品集试读问题'),'SI：提炼',tx('Group the questions about navigation, image order and the opening paragraph. Keep the original wording; do not turn every suggestion into a task.','把关于导航、图片顺序和开头段落的问题整理一下，保留原话，不把所有建议直接变成任务。')],
 [tx('A weekend ceramics class','周末陶艺课'),'',tx('A friend mentioned a nearby studio. I may want to try it after the portfolio is published. No booking or date yet.','朋友提到附近有家工作室，作品集发完以后也许可以去试试。目前还没决定，不安排日期。')],
 [tx('Readable signs in old streets','旧街里好读的招牌'),'我：阅读',tx('Look at the photo notes from the evening walk. Which signs were readable from across the road, and what made the difference?','回看傍晚散步时记下的照片。哪些招牌隔着马路也容易认出来，差别在哪里？')]
];
for(const [name,work,body] of inbox)note(`00_Inbox/${name}.md`,`## ${name}\n\n${body}`,-1,work?{'inbox-work':work}:{});
const source=`03_Resources/${tx('Design','设计')}/${tx('The questions a case study should answer','案例需要回答的问题')}.md`;
note(source,`## ${tx('A reading checklist','阅读时检查什么')}\n\n${tx('What was difficult before the change? What alternatives were considered? Why was this choice made? What evidence shows the result? Keep observations separate from claims that still need support.','调整之前难在哪里？考虑过哪些做法？为什么选这一种？结果由什么支撑？把观察与还需要依据的判断分开。')}`,-6);
note(workflow,`## ${tx('Working notes','常用原文')}\n\n- [[${managedPaths.projectRegistry}|${tx('Projects','项目')}]]\n- [[${managedPaths.habitRegistry}|${tx('Habits','习惯')}]]\n- [[${managedPaths.inboxQueue}|${tx('Inbox','收集箱')}]]`);
note(craft,`## ${tx('Use in a project','在项目里用')}\n\n- [[${story.portfolioPath}|${story.portfolio}]]\n\n## ${tx('Keep for later','留待下次使用')}\n\n- [[${source}|${tx('Questions for a case study','案例需要回答的问题')}]]`);
for(const entry of story.diaries){
 const ymd=entry.date;
 let raw='---\n'+Object.entries({date:ymd,created:ymd,tags:['daily-plan','noria-demo'],mood:entry.mood,energy:entry.energy,sleep_hours:entry.sleep}).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n\n'+entry.body+'\n';
 for(const [offset,start,duration] of [[-6,'09:30',25],[-2,'10:00',40],[0,'09:30',25],[0,'10:05',25]])if(entry.offset===offset){
   const begin=new Date(ymd+'T'+start+':00'),end=new Date(+begin+duration*60000);
   raw=focusDocument.appendFocusRecord(raw,{record:{path:story.portfolioPath,titleSnapshot:tx('Explain the bookshop design decisions','补齐书店案例的设计取舍')},session:{start:begin.toISOString(),segments:[{start:begin.toISOString(),end:end.toISOString()}],completed:true},day:ymd,heading:tx('Focus','专注')});
 }
 if(entry.offset===0)raw+=`\n## 建议\n\n- ${tx('Before sharing','发预览前')} [[${story.portfolioPath}|${tx('the portfolio preview',story.portfolio)}]]${tx(', add the comparison image from the feedback. Animation can wait.','，先补上试读反馈里提到的对照图。动效继续留在未安排里即可。')}\n`;
 write(`06_Diary/${ymd.slice(0,4)}/${ymd}.md`,raw);
}
// A weekly review links to the records behind its decisions, rather than copying tasks.
const thursday=new Date(date+'T12:00:00Z');thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
const isoYear=thursday.getUTCFullYear(),isoWeek=Math.ceil((((thursday-new Date(Date.UTC(isoYear,0,1)))/86400000)+1)/7);
const week=`${isoYear}-W${String(isoWeek).padStart(2,'0')}`;
note(`06_Diary/${isoYear}/${week}.md`,`## ${tx('This week','本周')}\n\n${tx('The portfolio is clearer after removing a weak case. The next review should focus on the explanation and mobile reading order, not more pages.','删去一个讲不清过程的案例以后，作品集主线清楚了。下一轮只检查取舍的说明和移动端阅读顺序，不继续加页。')}\n\n## ${tx('Weekly review','周复盘')}\n\n${tx('The feedback on','同事对')} [[${day(-2)}]] ${tx('pointed out a missing explanation. Two focus blocks today addressed it.','的反馈指出一段遗漏的解释，今天的两个专注时段围绕这段展开。')}\n\n${tx('The reader can save articles, but restoring reading position still needs work. Verify offline use before inviting the two beta readers. On Friday, share the portfolio preview before making more visual changes.','阅读应用已能保存文章，还要处理阅读位置恢复。断网流程验证通过后，再邀请两位读者试用。周五先发作品集预览，再决定是否继续修改视觉。')}`,-2,{tags:['weekly-review','noria-demo']});
write('README.md',`# ${tx('Noria demonstration vault','Noria 展示库')}\n\n${tx('These are fictional records, written for documentation. They do not describe the plugin author or its user. Two active projects, three habits and fourteen dated notes share the same sources across Home, the calendar, timeline and statistics.','这是为文档编写的虚构记录，不代表作者或用户的真实生活。两个进行中的项目、三项习惯和十四篇日记，在主页、日历、时间轴与统计中共用同一份原文。')}\n\n## ${tx('Start here','从这里开始')}\n\n1. ${tx('Open Home and follow the portfolio project to its original note.','打开主页，从作品集项目进入原笔记。')}\n2. ${tx('Compare scheduled work, deadlines and undated next actions in Task Board and Timeline.','在任务看板和时间轴区分安排好的时段、截止日与未安排的下一步。')}\n3. ${tx('Read today’s note, then the weekly review; check the sources behind the next decision.','读今天的日记，再看周回顾，核对下一步决定来自什么记录。')}\n4. ${tx('Check the habits: strength training has rest days, and the history includes missed targets.','查看习惯：力量训练有休息日，历史也保留没有完成的目标。')}\n\n${tx('This public example does not include private media, RSS, health, finance, inventory, wardrobe or travel views. Interface language follows Obsidian.','公开示例不含自用的藏馆、RSS、健康、财务、物品、衣橱或旅行界面。界面语言跟随 Obsidian。')}\n`);
console.log(`Noria release demo vault created: ${targetRoot}`);
