import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(await readFile(new URL("../src/lib/moly/resourceCache.ts", import.meta.url), "utf8"));
let serial = 0;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class Worker extends EventTarget {
    constructor(state = "installing", scriptURL = "https://host.test/moly/cache-worker.mjs") { super(); this.state = state; this.scriptURL = scriptURL; }
    become(state) { this.state = state; this.dispatchEvent(new Event("statechange")); }
}
class Registration extends EventTarget {
    scope = "https://host.test/moly/";
    active = null; waiting = null; installing = null;
    async update() { return this; }
}
async function setup(registration, previous = registration) {
    let registered = 0;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true, caches: {} } });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://host.test" } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: {
        getRegistration: async () => previous,
        register: async (script, options) => {
            assert.equal(script, "https://host.test/moly/cache-worker.mjs");
            assert.deepEqual(options, { scope: "/moly/", type: "module", updateViaCache: "none" });
            registered++; return registration;
        },
    } } });
    const cacheApi = await import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${serial++}`).toString("base64")}`);
    return { ...cacheApi, registrations: () => registered };
}

{
    const registration = new Registration();
    registration.active = new Worker("activated");
    let completeUpdate;
    registration.update = () => new Promise(resolve => { completeUpdate = resolve; });
    const api = await setup(registration);
    let resolved = false;
    const ready = api.ensureResourceCache().then(worker => { resolved = true; return worker; });
    await flush();
    assert.equal(resolved, false, "registration alone must not bypass a still-pending update check");
    const next = registration.installing = new Worker();
    registration.dispatchEvent(new Event("updatefound"));
    completeUpdate(registration);
    await flush(); assert.equal(resolved, false);
    registration.installing = null; registration.active = next; next.become("activated");
    assert.equal(await ready, next);
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    registration.update = async () => { throw new Error("update network failure"); };
    const api = await setup(registration);
    await assert.rejects(api.ensureResourceCache(), /update network failure/);
    registration.update = async () => registration;
    assert.equal(await api.ensureResourceCache(), registration.active);
    assert.equal(api.registrations(), 2, "a failed update check permits retry");
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    registration.update = () => new Promise(() => {});
    const api = await setup(registration);
    const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
    let expire, cleared = false;
    globalThis.setTimeout = callback => { expire = callback; return 78; };
    globalThis.clearTimeout = timer => { assert.equal(timer, 78); cleared = true; };
    try {
        const ready = api.ensureResourceCache();
        await flush(); expire();
        await assert.rejects(ready, /update check did not finish/);
        assert.equal(cleared, true);
    } finally {
        globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
    }
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    const next = registration.installing = new Worker();
    const api = await setup(registration);
    let resolved = false;
    const ready = api.ensureResourceCache().then(worker => { resolved = true; return worker; });
    await flush(); assert.equal(resolved, false, "old active must not bypass an installing replacement");
    registration.installing = null; registration.active = next; next.become("activating");
    await flush(); assert.equal(resolved, false, "activation migration must finish before commands");
    next.become("activated"); assert.equal(await ready, next);
    const newer = registration.installing = new Worker();
    const readyAgain = api.ensureResourceCache();
    await flush();
    registration.installing = null; registration.active = newer; newer.become("activated");
    assert.equal(await readyAgain, newer, "successful cache stores registration, not stale worker generation");
    assert.equal(api.registrations(), 1);
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    const waiting = registration.waiting = new Worker("installed");
    const api = await setup(registration);
    const ready = api.ensureResourceCache();
    await flush(); registration.waiting = null; registration.active = waiting; waiting.become("activated");
    assert.equal(await ready, waiting);
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    const failed = registration.installing = new Worker();
    const api = await setup(registration);
    const ready = api.ensureResourceCache();
    await flush(); registration.installing = null; failed.become("redundant");
    await assert.rejects(ready, /became redundant/);
    assert.equal(await api.ensureResourceCache(), registration.active);
    assert.equal(api.registrations(), 2, "failure must allow registration retry");
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    registration.waiting = new Worker("installed", "https://host.test/another-worker.js");
    const api = await setup(registration);
    await assert.rejects(api.ensureResourceCache(), /belongs to another worker/);
    assert.equal(api.registrations(), 0);
}
{
    // An earlier host generation sealed its resource origin into the script URL. The same
    // script path is this feature's own worker: the canonical URL replaces it in place.
    const registration = new Registration();
    registration.active = new Worker("activated", "https://host.test/moly/cache-worker.mjs?resource_origin=https%3A%2F%2Fold.example");
    const replacement = registration.installing = new Worker();
    const api = await setup(registration);
    const ready = api.ensureResourceCache();
    await flush(); replacement.become("activated");
    assert.equal(await ready, replacement);
    assert.equal(api.registrations(), 1);
}
{
    const registration = new Registration();
    registration.active = new Worker("activated", "https://host.test/moly/other-worker.mjs?resource_origin=https%3A%2F%2Fold.example");
    const api = await setup(registration);
    await assert.rejects(api.ensureResourceCache(), /belongs to another worker/);
    assert.equal(api.registrations(), 0);
}
{
    const registration = new Registration();
    registration.installing = new Worker();
    const api = await setup(registration);
    const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
    let expire, cleared = false;
    globalThis.setTimeout = callback => { expire = callback; return 77; };
    globalThis.clearTimeout = timer => { assert.equal(timer, 77); cleared = true; };
    try {
        const ready = api.ensureResourceCache();
        await flush(); expire();
        await assert.rejects(ready, /installation did not finish/);
        assert.equal(cleared, true);
    } finally {
        globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
    }
}
{
    const registration = new Registration();
    const first = registration.installing = new Worker();
    const api = await setup(registration);
    const ready = api.ensureResourceCache();
    await flush();
    const replacement = registration.installing = new Worker();
    registration.dispatchEvent(new Event("updatefound"));
    first.become("redundant");
    registration.installing = null; registration.active = replacement; replacement.become("activated");
    assert.equal(await ready, replacement, "follow the latest install when updatefound replaces the candidate");
}
{
    const registration = new Registration();
    registration.active = new Worker("activated");
    const api = await setup(registration);
    const channels = [];
    Object.defineProperty(globalThis, "MessageChannel", { configurable: true, value: class {
        constructor() {
            this.port1 = { close() { this.closed = true; } };
            this.port2 = { close() { this.closed = true; } };
            channels.push(this);
        }
    } });
    registration.active.postMessage = () => { throw new Error("detached worker"); };
    await assert.rejects(api.resourceCacheCommand("query"), /detached worker/);
    assert.equal(channels[0].port1.closed, true); assert.equal(channels[0].port2.closed, true);
    registration.active.postMessage = (message) => {
        assert.equal(message.type, "retain"); assert.equal(message.enabled, true);
        channels.at(-1).port1.onmessage({ data: { source: "moly-cache", schemaVersion: 1, ok: true, enabled: true, bytes: 1, entries: 1 } });
    };
    assert.deepEqual(await api.resourceCacheCommand("retain", true), { enabled: true, bytes: 1, entries: 1 });
    assert.equal(api.registrations(), 2);
    registration.active.postMessage = () => channels.at(-1).port1.onmessage({ data: { source: "moly-cache", schemaVersion: 1, ok: true, enabled: true, bytes: 1, entries: 1, limitBytes: 536870912 } });
    assert.equal((await api.resourceCacheCommand("query")).limitBytes, 536870912);
    registration.active.postMessage = () => channels.at(-1).port1.onmessage({ data: { source: "moly-cache", schemaVersion: 1, ok: true, enabled: true, bytes: 1, entries: 1, limitBytes: -1 } });
    assert.equal((await api.resourceCacheCommand("query")).limitBytes, undefined, "optional invalid budget cannot break an otherwise valid legacy response");
    registration.active.postMessage = () => channels.at(-1).port1.onmessage({ data: { source: "wrong" } });
    await assert.rejects(api.resourceCacheCommand("query"), /Invalid cache response/);
    assert.equal(channels.at(-1).port1.closed, true); assert.equal(channels.at(-1).port2.closed, true);
}
console.log("moly resource cache upgrade, state and error tests passed");
