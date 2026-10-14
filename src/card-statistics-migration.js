'use strict';
// Persisted instances move to the replacement; no retired renderer is kept alive.
function migrateStatisticCalendars(settings){
 let changed=false;
 function visit(value){
  if(!value||typeof value!=='object')return;
  if(value.props&&['heatmap','states'].includes(value.props.display)&&(!value.source||value.source==='noria:statistics')){
   value.props.display='calendar';if(['heatmap','states'].includes(value.style))value.style='calendar';changed=true;
  }
  for(const child of Object.values(value))visit(child);
 }
 visit(settings.home);visit(settings.workbenchPages);visit(settings.cardLayouts);visit(settings.statisticTemplates);
 return changed;
}
module.exports={migrateStatisticCalendars};
