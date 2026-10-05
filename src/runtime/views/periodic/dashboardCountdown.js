const host=input?.mount || this.container;
const bridge=input?.noriaBridge || globalThis.__noriaRuntimeBridge;
const dispose=await bridge.runtime.renderCountdown(host,{actionsHost:input?.actionsHost});
host.dataset.noriaCardLive="countdown";host.__noriaCardCleanup=dispose;
if(typeof input?.registerCleanup==="function")input.registerCleanup(dispose);
