"use strict";
const modules=Object.freeze(typeof __NORIA_MODULES__==='undefined'?['media','rss','health','finance','inventory','travel']:__NORIA_MODULES__);
const pageModules={media:'media','page-health':'health','page-finance':'finance','page-inventory':'inventory','page-wardrobe':'inventory','page-travel':'travel'};
function cardAvailable(card){
 const match=/^noria:(media(?:-|$)|rss(?:-|$)|health(?:-|$)|finance(?:-|$)|inventory(?:-|$)|wardrobe(?:-|$)|travel(?:-|$))/.exec(card?.source||'');
 const module=match?.[1].replace(/-$/,'').replace('wardrobe','inventory');
 return !module||modules.includes(module);
}
function pageAvailable(page){return !pageModules[page.id]||modules.includes(pageModules[page.id]);}
function visiblePages(config){
 const pages=config.pages.filter(pageAvailable);
 if(!pages.some(page=>!page.hidden&&!['day','calendar'].includes(page.id))){const home=pages.find(page=>page.id==='home');if(home)home.hidden=false;}
 return {...config,pages,defaultPage:pages.some(page=>page.id===config.defaultPage&&!page.hidden)?config.defaultPage:(pages.find(page=>!page.hidden&&!['day','calendar'].includes(page.id))?.id||'home')};
}
function retainUnavailablePages(saved,next,before){
 const pages=next.pages.slice();
 for(const [index,page]of(saved?.pages||[]).entries())if(!pageAvailable(page)&&!pages.some(p=>p.id===page.id))pages.splice(Math.min(index,pages.length),0,page);
 const defaultPage=saved?.pages?.some(p=>p.id===saved.defaultPage&&!pageAvailable(p))&&next.defaultPage===before.defaultPage?saved.defaultPage:next.defaultPage;
 return {...next,pages,defaultPage};
}
module.exports={modules,cardAvailable,pageAvailable,visiblePages,retainUnavailablePages};
