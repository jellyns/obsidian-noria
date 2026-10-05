const host=input?.mount || this.container;
const bridge=input?.noriaBridge || globalThis.__noriaRuntimeBridge;
const dispose=await bridge.runtime.renderDailyRecordSummary(host,input?.statsRange,{widgetId:input?.widgetInstanceId,fields:input?.dailyRecordFields});
host.dataset.noriaCardLive="daily-record-summary";host.__noriaCardCleanup=dispose;
if(typeof input?.registerCleanup==="function")input.registerCleanup(dispose);
