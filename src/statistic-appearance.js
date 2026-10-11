"use strict";
const {commitSettingsChange}=require('./settings-change.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const PALETTE=['var(--color-cyan)','var(--color-purple)','var(--color-orange)','var(--color-green)','var(--color-blue)','var(--color-red)'];
const COLORS={purple:'var(--color-purple)',blue:'var(--color-blue)',green:'var(--color-green)',orange:'var(--color-orange)'};
const KEYS=['color','customColor','density','axis','min','max','showPoints','showLegend'];
const DEFAULTS={color:'auto',density:'normal',axis:'zero',showPoints:true,showLegend:true};
function appearance(value={}){value=value||{};return {...DEFAULTS,...Object.fromEntries(KEYS.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]))};}
function validateAppearance(value={},text=(zh,en)=>en){
 const a=appearance(value);
 if(!['auto','custom',...Object.keys(COLORS)].includes(a.color)||!['compact','normal','spacious'].includes(a.density)||!['auto','zero','fixed'].includes(a.axis))throw Error(text('请选择有效的统计外观。','Choose a valid chart appearance.'));
 if(a.color==='custom'&&!/^#[\da-f]{6}$/i.test(a.customColor||''))throw Error(text('自定义颜色需为六位十六进制颜色。','Custom colors require six hexadecimal digits.'));
 if(a.axis==='fixed'&&(!Number.isFinite(a.min)||!Number.isFinite(a.max)||a.min>=a.max))throw Error(text('刻度上限必须大于下限。','The axis maximum must be greater than its minimum.'));
 return a;
}
function accent(value={}){const a=appearance(value);return a.color==='custom'?a.customColor:COLORS[a.color]||null;}
function categoryColor(key,value={},configuredColor=''){
 const a=appearance(value);if(a.color==='auto'&&configuredColor)return configuredColor;
 let hash=2166136261;for(const char of String(key)){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}hash>>>=0;
 const color=accent(a);return color?`color-mix(in srgb,${color} ${[45,60,75,90,100][hash%5]}%,var(--background-primary))`:PALETTE[hash%PALETTE.length];
}
function axisDomain(values,value={},style='line',reference=null){
 const a=appearance(value),data=values.filter(Number.isFinite),refs=Number.isFinite(reference)?[reference]:[];
 if(!data.length)return null;
 const zero=style!=='line'||a.axis==='zero',all=[...data,...refs,...zero?[0]:[]];
 const low=Math.min(...all),high=Math.max(...all);
 let min=a.axis==='fixed'?a.min:low,max=a.axis==='fixed'?a.max:high;
 const expanded=a.axis==='fixed'&&(low<min||high>max);min=Math.min(min,low);max=Math.max(max,high);
 if(min===max){const pad=Math.abs(min)*.1||1;if(zero&&min===0)max=1;else{min-=pad;max+=pad;}}
 return {min,max,expanded};
}
function axisTicks(domain,integer=false){
 if(!domain)return [];
 const low=integer?Math.ceil(domain.min):domain.min,high=integer?Math.floor(domain.max):domain.max;
 if(low>high)return [];
 const mid=integer?Math.round((low+high)/2):(low+high)/2;
 return [...new Set([high,mid,low])];
}
function applyLook(config,look){return {...clone(config),appearance:clone(validateAppearance(look.appearance))};}
class StatisticLooks{
 constructor(plugin){this.plugin=plugin;}
 read(){const v=this.plugin.settings.statisticLooks;if(v?.version!=null&&v.version!==1)throw Error('Unsupported statistics appearance version');return clone(v?.items||[]);}
 async save(title,value){const name=String(title||'').trim();if(!name||name.length>80)throw Error('Appearance names must contain 1–80 characters');const item={id:globalThis.crypto.randomUUID(),title:name,appearance:clone(validateAppearance(value))};await commitSettingsChange(this.plugin,['statisticLooks'],()=>{this.plugin.settings.statisticLooks={version:1,items:[...this.read(),item]};});return clone(item);}
 async remove(id){await commitSettingsChange(this.plugin,['statisticLooks'],()=>{this.plugin.settings.statisticLooks={version:1,items:this.read().filter(v=>v.id!==id)};});}
}
module.exports={appearance,validateAppearance,accent,categoryColor,axisDomain,axisTicks,applyLook,StatisticLooks};
