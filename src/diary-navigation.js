"use strict";
const {diaryNavigationItems,shiftPeriod,diaryRange}=require("./diary-tasks.js");
function shiftGroup(selection,direction){return shiftPeriod(selection,direction*({daily:7,weekly:7,monthly:12,yearly:7}[selection.mode]||1));}
function pickerState(selection){return {selectedDate:selection.anchorDate,anchor:selection.anchorDate.slice(0,7),mode:selection.mode==="monthly"?"months":selection.mode==="yearly"?"years":"days",selectionMode:selection.mode,selectedRange:diaryRange(selection),yearStart:Math.floor(Number(selection.anchorDate.slice(0,4))/12)*12,weekOffset:null};}
function rangeLabel(selection,locale){
 const items=diaryNavigationItems(selection),first=diaryRange(items[0]).start,last=diaryRange(items.at(-1)).end;
 const format=d=>new Intl.DateTimeFormat(locale,{year:"numeric",month:"short",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));
 if(selection.mode==="yearly")return first.slice(0,4)+"–"+last.slice(0,4);
 if(selection.mode==="monthly")return selection.anchorDate.slice(0,4);
 return first.slice(0,7)===last.slice(0,7)?format(first):format(first)+" – "+format(last);
}
module.exports={shiftGroup,pickerState,rangeLabel};
