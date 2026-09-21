"use client";

export interface ResourceCacheState { enabled: boolean; bytes: number; entries: number; }
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

function activatedWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
    return new Promise((resolve, reject) => {
        let worker: ServiceWorker | null = null;
        let finished = false;
        const complete = (error?: Error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            registration.removeEventListener("updatefound", change);
            worker?.removeEventListener("statechange", change);
            if (error) reject(error); else resolve(worker!);
        };
        const change = () => {
            if (worker?.state === "redundant") {
                complete(new Error("Resource worker became redundant"));
                return;
            }
            // A new installation must finish its activation/migration before
            // retention commands go to it. The old active worker is still
            // usable by existing clients, but is not readiness for the update.
            const latest = registration.installing ?? registration.waiting ?? registration.active;
            if (latest !== worker) {
                worker?.removeEventListener("statechange", change);
                worker = latest;
                worker?.addEventListener("statechange", change);
            }
            if (!worker) complete(new Error("Resource worker did not install"));
            else if (worker.state === "activated") complete();
            else if (worker.state === "redundant") complete(new Error("Resource worker became redundant"));
        };
        const timer = setTimeout(() => complete(new Error("Resource worker installation did not finish")), 15000);
        registration.addEventListener("updatefound", change);
        change();
    });
}

/** Only this feature's narrow scope is registered; ordinary site pages are untouched. */
export async function ensureResourceCache(): Promise<ServiceWorker> {
    if (!registrationPromise) registrationPromise = (async () => {
        if (!window.isSecureContext || !("serviceWorker" in navigator) || !("caches" in window)) throw new Error("Resource retention unavailable");
        const script = new URL("/moly/cache-worker.mjs", location.origin).href;
        const scope = new URL("/moly/", location.origin).href;
        const previous = await navigator.serviceWorker.getRegistration(scope);
        const workers = [previous?.active, previous?.waiting, previous?.installing];
        if (previous?.scope === scope && workers.some(worker => worker && worker.scriptURL !== script)) throw new Error("The runtime scope belongs to another worker");
        return navigator.serviceWorker.register(script, { scope: "/moly/", type: "module", updateViaCache: "none" });
    })().catch(error => { registrationPromise = null; throw error; });
    try {
        // Cache registration, never a specific worker generation. A later call
        // can observe an update discovered after the first successful command.
        const registration = await registrationPromise;
        // Re-registering an unchanged script URL may resolve with the current
        // registration before the browser's soft-update has discovered a new
        // script. Explicitly finish an update check before choosing its worker.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                registration.update(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Resource worker update check did not finish")), 15000);
                }),
            ]);
        } finally { clearTimeout(timer); }
        return await activatedWorker(registration);
    } catch (error) {
        registrationPromise = null;
        throw error;
    }
}

export async function resourceCacheCommand(type: "query" | "clear" | "retain", enabled?: boolean): Promise<ResourceCacheState> {
    const worker = await ensureResourceCache();
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const complete = () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
        const timer = setTimeout(() => { complete(); reject(new Error("Resource cache did not respond")); }, 30000);
        channel.port1.onmessage = event => {
            complete();
            const value = event.data;
            if (value?.source !== "moly-cache" || value.schemaVersion !== 1 || value.ok !== true || typeof value.enabled !== "boolean"
                || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || !Number.isSafeInteger(value.entries) || value.entries < 0) {
                reject(new Error("Invalid cache response")); return;
            }
            resolve({ enabled: value.enabled, bytes: value.bytes, entries: value.entries });
        };
        try {
            worker.postMessage({ source: "moly-cache-host", schemaVersion: 1, type, ...(type === "retain" ? { enabled: enabled === true } : {}) }, [channel.port2]);
        } catch (error) {
            complete();
            registrationPromise = null;
            reject(error);
        }
    });
}
