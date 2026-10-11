"use strict";
const {frontmatter} = require('./record-properties.js');
const {datedName} = require('./dated-notes.js');
const fail = message => Object.assign(Error(message), {code:'invalid-input'});

function experienceName({date, title, time}) {
  if (typeof title !== 'string' || !title.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(title) || /[. ]$/.test(title)) throw fail('请填写可用的笔记名称 / Enter a valid note title');
  if (time != null && time !== '' && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw fail('时间应为 HH:mm / Use HH:mm for time');
  const name = date+(time ? ' '+time.replace(':','') : '')+' '+title.trim()+'.md';
  if (!datedName(name)) throw fail('请选择有效日期 / Choose a valid date');
  return name;
}
function experienceMarkdown({workPath, title, body}) {
  if (typeof body !== 'string' || !body.trim()) throw fail('写下这次感受 / Write something about this experience');
  if (/[\r\n[\]|#]/.test(workPath)) throw fail('作品路径无法表示为普通链接 / Work path cannot be represented as a wikilink');
  const related = '[['+workPath.replace(/\.md$/i,'')+']]';
  return '---\ntags: ["media/experience"]\nrelated: '+JSON.stringify([related])+'\n---\n\n## '+title+'\n\n'+body.trim()+'\n';
}
function readExperience(raw, {path, workPath, parseYaml, resolve}) {
  const date = datedName(path.split('/').at(-1));
  if (!date) return null;
  const {value,hit} = frontmatter(raw,parseYaml);
  if (![value.tags].flat().some(tag => String(tag).replace(/^#/,'') === 'media/experience')) return null;
  const linked = [value.related].flat().some(link => {
    const match = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(String(link));
    return match && resolve(match[1]) === workPath;
  });
  if (!linked) return null;
  const content = raw.slice(hit[0].length).trim();
  const heading = /^## [^\r\n]*(?:\r?\n|$)/.exec(content);
  return {...date,path,line:raw.slice(0,raw.indexOf(content,hit[0].length)).split('\n').length,body:(heading ? content.slice(heading[0].length) : content).trim()};
}
module.exports = {datedName,experienceName,experienceMarkdown,readExperience};
