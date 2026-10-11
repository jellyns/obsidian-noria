"use strict";
const {dayNumber} = require('./countdown-document.js');

const datedPattern = /^(\d{4}-\d{2}-\d{2})(?: ([0-2]\d[0-5]\d))? (.+)\.md$/;
function datedName(name) {
  const match = datedPattern.exec(name);
  if (!match || !Number.isFinite(dayNumber(match[1])) || match[2]&&Number(match[2].slice(0,2))>23) return null;
  return {date:match[1],time:match[2]?match[2].slice(0,2)+':'+match[2].slice(2):null,title:match[3]};
}

// One native Base follows the containing daily/ISO-week/month/year filename.
// Opened independently it shows all dates. Unknown contexts never imply today.
function datedNotesBase(locale='zh') {
  const zh=locale==='zh';
  const daily='/^\\d{4}-\\d{2}-\\d{2}(?: |$)/.matches(formula.contextName)';
  const weekly='/^\\d{4}-W\\d{2}(?: |$)/.matches(formula.contextName)';
  const monthly='/^\\d{4}-\\d{2}(?: |$)/.matches(formula.contextName)';
  const yearly='/^\\d{4}(?: |$)/.matches(formula.contextName)';
  const timed='/^\\d{4}-\\d{2}-\\d{2} (?:[01]\\d|2[0-3])[0-5]\\d /.matches(file.name)';
  return [
    'filters:', '  and:', '    - file.ext == "md"',
    '    - '+JSON.stringify('/^(\\d{4}-\\d{2}-\\d{2})(?: ((?:[01]\\d|2[0-3])[0-5]\\d))? (.+)$/.matches(file.name)'),
    '    - '+JSON.stringify('!/^\\d{4}-\\d{2}-\\d{2} 2[4-9][0-5]\\d /.matches(file.name)'),
    '    - formula.day.format("YYYY-MM-DD") == file.name.slice(0, 10)',
    'formulas:',
    '  day: date(file.name.slice(0, 10))',
    '  contextName: this.file.name',
    '  contextPath: this.file.path',
    '  standalone: this.file.ext == '+JSON.stringify('base'),
    '  periodFormat: '+JSON.stringify(`if(${daily}, "YYYY-MM-DD", if(${weekly}, "GGGG-[W]WW", if(${monthly}, "YYYY-MM", if(${yearly}, "YYYY", ""))))`),
    '  group: '+JSON.stringify(`if(${daily}, "", formula.day.format("YYYY-MM-DD"))`),
    '  source: '+JSON.stringify(`link(file.path, file.name.slice(if(${timed}, 16, 11)))`),
    '  time: '+JSON.stringify(`if(${timed}, file.name.slice(11, 13) + ":" + file.name.slice(13, 15), "")`),
    'properties:', '  formula.source:', '    displayName: '+(zh?'原文':'Source'),
    '  formula.group:', '    displayName: '+(zh?'日期':'Date'),
    '  formula.time:', '    displayName: '+(zh?'时间':'Time'),
    '  formula.day:', '    displayName: '+(zh?'日期':'Date'),
    'views:', '  - type: list', '    name: '+(zh?'记录':'Records'),
    '    filters:',
    '      and:',
    '        - '+JSON.stringify('formula.standalone || (formula.periodFormat != "" && formula.day.format(formula.periodFormat) == formula.contextName.split(" ")[0])'),
    '        - file.path != formula.contextPath',
    '    order:', '      - formula.source', '      - formula.time',
    '    groupBy:', '      property: formula.group', '      direction: DESC',
    '    sort:', '      - property: file.name', '        direction: ASC',
    '  - type: table', '    name: '+(zh?'全部':'All'),
    '    order:', '      - formula.day', '      - file.name', '      - related',
    '    sort:', '      - property: formula.day', '        direction: DESC', ''
  ].join('\n');
}
// Bind only this template's explicit context formulas. Keep all user filters,
// columns, sorting and views; do not rewrite the shared file or create a diary.
function bindDatedBase(config,selection,path) {
  const f=config?.formulas;
  if(f?.contextName!=='this.file.name'||f.contextPath!=='this.file.path'||f.standalone!=='this.file.ext == "base"'||!f.periodFormat)return null;
  const {period,mode}=require('./review-center-core.js').normalizeReviewSelection(selection);
  const views=config.views?.map(view=>{
    if(mode!=='daily'||view.groupBy?.property!=='formula.group')return view;
    const {groupBy,...rest}=view;return rest;
  });
  return {...config,views,formulas:{...f,contextName:JSON.stringify(period),contextPath:JSON.stringify(path),standalone:'false'}};
}
module.exports={datedName,datedNotesBase,bindDatedBase};
