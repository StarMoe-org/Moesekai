"use client";

import { molyResourceOrigin } from "./resourceOrigin";

export interface ResourceCacheState { enabled: boolean; bytes: number; entries: number; }
let registrationPromise: Promise<ServiceWorker> | null = null;

/** Only this feature's narrow scope is registered; ordinary site pages are untouched. */
export function ensureResourceCache(): Promise<ServiceWorker> {
    if (registrationPromise) return registrationPromise;
    registrationPromise = (async () => {
        if (!window.isSecureContext || !("serviceWorker" in navigator) || !("caches" in window)) throw new Error("Resource retention unavailable");
        // The worker admits resources from exactly one origin, sealed into its
        // script URL so the fetch handler can decide synchronously.
        const script = new URL("/moly/cache-worker.mjs", location.origin);
        const resourceOrigin = molyResourceOrigin();
        if (resourceOrigin) script.searchParams.set("resource_origin", resourceOrigin);
        const scope = new URL("/moly/", location.origin).href;
        const previous = await navigator.serviceWorker.getRegistration(scope);
        const previousWorker = previous?.active ?? previous?.waiting ?? previous?.installing;
        // A changed resource origin re-registers this same script with a new
        // query; only a genuinely different script may not be replaced.
        if (previous?.scope === scope && previousWorker && new URL(previousWorker.scriptURL).pathname !== script.pathname) throw new Error("The runtime scope belongs to another worker");
        const registration = await navigator.serviceWorker.register(script.href, { scope: "/moly/", type: "module", updateViaCache: "none" });
        if (registration.active?.state === "activated") return registration.active;
        const worker = registration.installing ?? registration.waiting ?? registration.active;
        if (!worker) throw new Error("Resource worker did not install");
        return new Promise<ServiceWorker>((resolve, reject) => {
            const complete = (error?: Error) => {
                clearTimeout(timer); worker.removeEventListener("statechange", change);
                if (error) reject(error); else resolve(worker);
            };
            const change = () => {
                if (worker.state === "activated") complete();
                else if (worker.state === "redundant") complete(new Error("Resource worker became redundant"));
            };
            const timer = setTimeout(() => complete(new Error("Resource worker installation did not finish")), 15000);
            worker.addEventListener("statechange", change); change();
        });
    })().catch(error => { registrationPromise = null; throw error; });
    return registrationPromise;
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
        worker.postMessage({ source: "moly-cache-host", schemaVersion: 1, type, ...(type === "retain" ? { enabled: enabled === true } : {}) }, [channel.port2]);
    });
}
