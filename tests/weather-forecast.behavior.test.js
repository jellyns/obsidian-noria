const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('src/runtime/views/dashboard/core/utils/weather-service.js', 'utf8');
function fixture(respond) {
 const calls=[],context={Date,Map,URL,URLSearchParams,console,obsidian:{requestUrl:async({url})=>{calls.push(url);return {text:JSON.stringify(await respond(url))};}}};
 vm.runInNewContext(source,context);return {api:context.dashboardCore.utils.weatherService,calls};
}
const cfg={provider:'open-meteo',manualCity:'Test city',enabled:true};
function meteo(url) {
 if(url.includes('geocoding'))return {results:[{name:'Test city',latitude:40,longitude:116}]};
 if(url.includes('/forecast?'))return {current:{temperature_2m:20,weather_code:0},daily:{time:['2031-01-01','2031-01-02','2031-01-03'],weather_code:[0,3,61],temperature_2m_min:[0,-3,null],temperature_2m_max:[21.3,4.7,null]}};
 throw Error('Unexpected endpoint '+url);
}
test('forecast retains exact provider dates, legitimate zero and negative temperatures, with missing values blank',async()=>{
 const {api,calls}=fixture(meteo),rows=await api.getForecast(cfg);
 assert.deepEqual(JSON.parse(JSON.stringify(rows.map(d=>[d.date,d.tempMax,d.tempMin]))),[['2031-01-01','21','0'],['2031-01-02','5','-3'],['2031-01-03','','']]);
 assert.equal(rows[0].city,'Test city');assert(calls.find(url=>url.includes('forecast_days=7')));
 assert.deepEqual(JSON.parse(JSON.stringify(api.normalizeForecastDays({currentTemp:20}))),[]);
 assert.equal(api.normalizeForecastDays({forecast:[{date:'2031-02-30'},{date:''},{date:'2032-02-29',tempMax:0}]}).length,1);
});
test('home and calendar coalesce requests and reuse dated forecast cache',async()=>{
 const {api,calls}=fixture(async url=>{await new Promise(r=>setTimeout(r,5));return meteo(url);});
 const [home,rows]=await Promise.all([api.getWeatherForHome(cfg),api.getForecast(cfg)]);
 assert.equal(home.currentTemp,'20');assert.equal(rows.length,3);assert.equal(calls.length,2);
 await api.getForecast(cfg);assert.equal(calls.length,2);
 await api.getForecast({...cfg,manualCity:'Another city'});assert.equal(calls.length,4);
});
test('disabled service performs no requests, failures can retry without retaining rejected promises',async()=>{
 let fail=true;const {api,calls}=fixture(url=>{if(fail&&url.includes('/forecast?'))throw Error('offline');return meteo(url);});
 await assert.rejects(api.getForecast({...cfg,enabled:false}),/disabled/);assert.equal(calls.length,0);
 await assert.rejects(api.getForecast(cfg),/offline/);fail=false;
 assert.equal((await api.getForecast(cfg)).length,3);
});
test('QWeather retains dated daily rows even if optional air quality is unavailable',async()=>{
 const {api}=fixture(url=>{
  if(url.includes('ipwho'))return {success:true,city:'Beijing',ip:'local',latitude:40,longitude:116};
  if(url.includes('/city/lookup'))return {code:'200',location:[{id:'101010100',name:'Beijing'}]};
  if(url.includes('/weather/3d'))return {code:'200',daily:[{fxDate:'2031-02-01',tempMin:'-2',tempMax:'5',textDay:'晴',iconDay:'100'},{fxDate:'2031-02-02',tempMin:'0',tempMax:'6',textDay:'阴',iconDay:'104'}]};
  if(url.includes('/weather/now'))return {code:'200',now:{temp:'3',text:'晴',icon:'100'}};
  if(url.includes('/air/now'))throw Error('Air endpoint unavailable');
  throw Error(url);
 });
 const rows=await api.getForecast({provider:'qweather',manualCity:'Beijing',qweatherKey:'unit-test-key',qweatherApiHost:'test.qweatherapi.com'});
 assert.deepEqual(JSON.parse(JSON.stringify(rows.map(d=>[d.date,d.tempMin,d.mappedWeather]))),[['2031-02-01','-2','晴'],['2031-02-02','0','阴']]);
});

const today = () => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const day = n => new Date(Date.parse(today()) + n*86400000).toISOString().slice(0,10);
function rangeMeteo(url) {
 if(url.includes('geocoding')) return {results:[{name:'Test city',latitude:40,longitude:116}]};
 const q=new URL(url).searchParams,start=q.get('start_date'),end=q.get('end_date'),time=[];
 for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000)time.push(new Date(d).toISOString().slice(0,10));
 return {daily:{time,weather_code:time.map(()=>0),temperature_2m_min:time.map(()=>0),temperature_2m_max:time.map(()=>18)}};
}
test('calendar range includes configured past and future days, batches requests and coalesces cache',async()=>{
 const {api,calls}=fixture(rangeMeteo),options={dates:[-8,-7,-1,0,7,8].map(day),pastDays:7,futureDays:7};
 const [rows,again]=await Promise.all([api.getCalendarWeather(cfg,options),api.getCalendarWeather(cfg,options)]);
 assert.deepEqual(Array.from(rows,d=>d.date),[-7,-1,0,7].map(day));assert.equal(rows,again);assert.equal(calls.length,2);
 assert.equal(rows[0].historical,true);assert.equal(rows[0].tempMin,'0');assert.equal(rows.at(-1).historical,false);
 await api.getCalendarWeather(cfg,options);assert.equal(calls.length,2);
 const none=await api.getCalendarWeather(cfg,{dates:[day(-1),day(1)],pastDays:0,futureDays:0});assert.equal(none.length,0);assert.equal(calls.length,2);
});
test('follow-calendar queries old visible ranges using archive dates without borrowing today',async()=>{
 const {api,calls}=fixture(rangeMeteo),dates=[day(-200),day(-199)];
 const rows=await api.getCalendarWeather(cfg,{dates,pastDays:-1,futureDays:0});
 assert.deepEqual(Array.from(rows,d=>d.date),dates);assert(calls.some(url=>url.includes('archive-api')));assert(rows.every(row=>row.historical));
 await assert.rejects(api.getCalendarWeather(cfg,{dates:[day(-200),day(-1)],pastDays:-1}),/visible calendar/);
});
test('weather range failures retry and do not hide history when the chosen forecast provider fails',async()=>{
 let fail=true;const {api,calls}=fixture(url=>{if(fail&&url.includes('/forecast?'))throw Error('offline');return rangeMeteo(url);});
 const options={dates:[day(-1)],pastDays:7,futureDays:0};
 await assert.rejects(api.getCalendarWeather(cfg,options),/offline/);fail=false;
 assert.equal((await api.getCalendarWeather(cfg,options)).length,1);
 assert.equal((await api.getCalendarWeather({...cfg,enabled:false},options)).length,0);
 const partial=await api.getCalendarWeather({...cfg,provider:'qweather'},{dates:[day(-1),day(0)],pastDays:7,futureDays:7});
 assert.equal(partial.length,1);assert.equal(partial[0].date,day(-1));
});

test('Open-Meteo alias and fallback extend actual forecast coverage to the chosen window',async()=>{
 const {api,calls}=fixture(url=>url.includes('start_date=')?rangeMeteo(url):url.includes('geocoding')?rangeMeteo(url):{current:{weather_code:0},daily:{time:[day(0)],weather_code:[0],temperature_2m_min:[0],temperature_2m_max:[18]}});
 assert.equal((await api.getCalendarWeather({...cfg,provider:'open-meteo-only'},{dates:[day(14)],futureDays:14}))[0].date,day(14));
 const fallback=await api.getCalendarWeather({...cfg,provider:'qweather-ip-fallback'},{dates:[day(7)],futureDays:7});
 assert.equal(fallback[0].date,day(7));assert(calls.some(url=>url.includes('end_date='+day(14))));
});
