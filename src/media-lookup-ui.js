"use strict";
const {lookupMedia} = require('./media-lookup.js');

// Both intake and existing-work editing choose an edition through this reader.
function mediaLookupResults(plugin, {host, find, status, candidates, isBusy, onChoose, text}) {
  let serialNumber=0;
  const invalidate=()=>{serialNumber++;find.disabled=false;status.setText('');candidates.empty();};
  const search = async (query, offset=0, append=false) => {
      if(isBusy() || !query.trim())return;
      const serial=++serialNumber;find.disabled=true;status.setText(text('正在查询…','Searching…'));if(!append)candidates.empty();
      try {
        const result=await lookupMedia(plugin,{kind:'book',query,offset,limit:5});
        if(!host.isConnected||serial!==serialNumber||isBusy())return;
        status.setText(result.candidates.length?text('选择作品或版本','Choose a work or edition'):text('没有找到，可重试或手动填写。','No matches. Retry or enter details manually.'));
        for(const item of result.candidates){
          const button=candidates.createEl('button',{cls:'noria-media-match',attr:{type:'button'}});
          button.createEl('strong',{text:item.title});
          const detail=item.level==='work'?[...(item.contributors||[]).slice(0,2),item.editionCount?text(`${item.editionCount} 个版本`,`${item.editionCount} editions`):'']:[...(item.authors||[]).slice(0,2),...(item.publishers||[]),item.publish,...(item.languages||[]),item.pagecount?text(`${item.pagecount} 页`,`${item.pagecount} pages`):'',item.isbn?.[0]];
          button.createSpan({cls:'noria-card-secondary',text:detail.filter(Boolean).join(' · ')});
          button.onclick=()=>{if(isBusy())return;item.level==='work'?search(item.source.url):onChoose(item);};
        }
        if(result.nextOffset!==null){const more=candidates.createEl('button',{text:text('更多版本或作品','More results'),attr:{type:'button'}});more.onclick=()=>{more.remove();search(query,result.nextOffset,true);};}
      }catch(e){if(host.isConnected&&serial===serialNumber)status.setText(e.code==='rate-limited'?text('来源暂时限流，可稍后再查或手动填写。','The source is rate-limited. Try later or enter details manually.'):text('暂时无法查询，可重试或手动填写。','Unable to search. Retry or enter details manually.'));}
      finally{if(host.isConnected&&serial===serialNumber)find.disabled=false;}
    };
  return {search, invalidate};
}
function editionMetadata(item) {
  const result={source:item.source.url};
  for(const key of ['isbn','publish','pagecount','cover'])if(item[key] && (!Array.isArray(item[key])||item[key].length))result[key]=item[key];
  if(item.publishers?.length)result.publisher=item.publishers;
  if(item.authors?.length)result.author=item.authors;
  return result;
}
module.exports={mediaLookupResults,editionMetadata};
