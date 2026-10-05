const host = input?.mount || this.container;
const bridge = input?.noriaBridge || globalThis.__noriaRuntimeBridge;
await bridge.inbox.render(host, { actionsHost: input?.actionsHost });
