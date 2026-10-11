"use strict";
const {readTaskLines,parseTaskLine}=require('./task-document.js');

// Display projection only: original task lines remain the writeback identity.
const taskFields=new Set(['start','due','date','scheduled','created','completion','done','cancelled','repeat','recurrence','every','priority','id','dependson','duration_min']);
function projectDiaryProse(source,lineOffset=0){
  const tasks=[],changes=[];
  for(const row of readTaskLines(source)){
    const parsed=parseTaskLine(row.text),fields=parsed.tokens.filter(token=>taskFields.has(token.key)&&
      !(/\\+$/.exec(parsed.body.slice(0,token.start))?.[0].length%2)&&
      parsed.body[token.end]!== '[');
    if(!fields.length)continue;
    let body=parsed.body;
    for(const token of fields.slice().reverse())body=body.slice(0,token.start)+body.slice(token.end);
    const index=tasks.length;
    tasks.push({rawText:row.text,line:row.line+lineOffset,parsed});
    changes.push({start:row.start,end:row.start+row.text.length,text:parsed.prefix+body.trimEnd()+` <span class="noria-diary-task-anchor" data-noria-prose-task="${index}"></span>`});
  }
  let markdown=source;
  for(const change of changes.reverse())markdown=markdown.slice(0,change.start)+change.text+markdown.slice(change.end);
  return {markdown,tasks};
}
function decorateDiaryTasks(prose,tasks,{label,open,onError}){
  for(const marker of prose.querySelectorAll('.noria-diary-task-anchor[data-noria-prose-task]')){
    const task=tasks[Number(marker.dataset.noriaProseTask)];if(!task)continue;
    const button=marker.ownerDocument.createElement('button');
    button.type='button';button.className='noria-diary-prose-task-details';button.textContent='…';
    button.setAttribute('aria-label',label);button.title=label;
    marker.replaceWith(button);
    button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();button.disabled=true;
      try{await open(task,button);}catch(error){onError(error);}finally{button.disabled=false;}
    });
  }
}
function projectDiaryRecord(source,{sections,reviewHeading,habitDate,lineOffset=0}={}){
  let displayed=require('./diary-cards-document.js').withoutNoteCards(source);
  if(reviewHeading)try{
    const {readReviewDocument,reviewPresentation}=require('./review-document.js');
    const review=readReviewDocument(displayed,[reviewHeading]);
    if(review.exists){
      const leading=reviewPresentation(review.markdown,reviewHeading).leading;
      const removed=displayed.slice(review.start,review.end);
      const padding=Math.max(0,(removed.match(/\r\n|\r|\n/g)||[]).length-(leading.match(/\r\n|\r|\n/g)||[]).length);
      displayed=displayed.slice(0,review.start)+leading+'\n'.repeat(padding)+displayed.slice(review.end);
    }
  }catch(_){/* Ambiguous review boundaries remain in the original reading content. */}
  // Preserve source line positions, and inspect habit dates before task fields
  // are replaced by display markers.
  if(habitDate)displayed=require('./diary-habits.js').withoutHabitRecords(displayed,habitDate,{preserveLines:true});
  const projection=projectDiaryProse(displayed,lineOffset);
  return {...require('./diary-section-model.js').projectRecordSections(projection.markdown,sections),tasks:projection.tasks};
}
module.exports={projectDiaryProse,decorateDiaryTasks,projectDiaryRecord};
