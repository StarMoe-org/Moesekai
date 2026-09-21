import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Exercise the real host parser without installing the full Next.js toolchain.
// Type-only imports disappear; these are the complete runtime dependency edges.
async function moduleURL(file, imports = {}) {
    let source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"));
    for (const [specifier, replacement] of Object.entries(imports)) {
        source = source.replaceAll(`"${specifier}"`, `"${replacement}"`);
    }
    return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const resourceOrigin = await moduleURL("../src/lib/moly/resourceOrigin.ts");
const navigation = await moduleURL("../src/lib/moly/workspaceNavigation.ts");
const mysekaiSource = await moduleURL("../src/lib/mysekai-source.ts");
const catalogURL = await moduleURL("../src/lib/moly/catalog.ts", {
    "../mysekai-source": mysekaiSource,
    "./resourceOrigin": resourceOrigin,
    "./workspaceNavigation": navigation,
});
const { fetchRuntimeManifest, fetchContentCatalog, fetchContentDetail } = await import(catalogURL);
const coordinateContract = "moly-rh-y-up-reflect-x-v1";
const source = region => ({
    id: `${region}-6.0.0-example`, region, version: "6.0.0",
    assets: `/moly/snapshots/${region}-6.0.0-example/assets/`,
    catalog: `/moly/snapshots/${region}-6.0.0-example/catalog/index.json`,
    available: true, base: { downloadBytes: 1, decodedBytes: 1 },
    coordinateContract,
    provenance: { coordinateContract, coordinateDocuments: { "source.json": "a".repeat(64) }, coordinateModels: { files: 31, sha256: "b".repeat(64) } },
});
const manifest = () => ({
    schemaVersion: 2,
    release: { id: "stage-new", contractVersion: 2, coordinateContract,
        module: "/moly/releases/stage-new/embed.mjs", stage: "/moly/releases/stage-new/stage.html",
        engines: { webgpu: { downloadBytes: 1, decodedBytes: 1 }, webgl2: { downloadBytes: 1, decodedBytes: 1 } } },
    snapshots: [source("cn"), source("jp")],
});
const originalFetch = globalThis.fetch;
const originalOrigin = process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
const requests = [];
let replies = [];
globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.ok(replies.length, `Unexpected request: ${url}`);
    const reply = replies.shift();
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
};
async function serve(value, run) { requests.length = 0; replies = [{ body: value }]; return await run(); }

try {
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = "https://resources.example.test";
    const parsed = await serve(manifest(), () => fetchRuntimeManifest());
    assert.equal(parsed.release.module, "/moly/releases/stage-new/embed.mjs", "SDK remains same-origin");
    assert.equal(parsed.release.stage, "/moly/releases/stage-new/stage.html", "iframe remains same-origin");
    assert.equal(parsed.release.resourceOrigin, "https://resources.example.test");
    assert.equal(parsed.snapshots[1].assets, "https://resources.example.test/moly/snapshots/jp-6.0.0-example/assets/");
    assert.equal(parsed.snapshots[1].region, "jp");
    assert.equal(parsed.snapshots[1].version, "6.0.0");
    assert.equal(parsed.snapshots[1].coordinateContract, coordinateContract);
    assert.deepEqual(parsed.snapshots[1].provenance.coordinateModels, { files: 31, sha256: "b".repeat(64) });
    assert.equal(parsed.snapshots[1].releaseModule, parsed.release.module);
    assert.equal(requests[0].options.cache, "no-store");
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(requests[0].options.redirect, "error");

    delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
    const local = await serve(manifest(), () => fetchRuntimeManifest());
    assert.equal(local.release.resourceOrigin, undefined, "same-origin publication needs no configured CDN");
    assert.equal(local.snapshots[0].assets, "/moly/snapshots/cn-6.0.0-example/assets/");
    assert.equal(local.snapshots[0].catalog, "/moly/snapshots/cn-6.0.0-example/catalog/index.json");
    const cachePanel = await readFile(new URL("../src/components/mysekai-interactions/ResourceCachePanel.tsx", import.meta.url), "utf8");
    assert.ok(cachePanel.includes("useRuntimeManifest(0)"), "resource management must discover same-origin publications");
    assert.ok(!cachePanel.includes("molyResourceOrigin"), "CDN configuration is not deployment status");
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = "https://resources.example.test";

    // A host update must also keep a previously pinned immutable release usable;
    // the new runtime itself owns its stricter coordinate preflight.
    const legacy = manifest();
    delete legacy.release.coordinateContract;
    for (const snapshot of legacy.snapshots) { delete snapshot.coordinateContract; delete snapshot.provenance; }
    await serve(legacy, () => fetchRuntimeManifest());

    const packed = manifest();
    Object.assign(packed.snapshots[0], { packs: true, assets: "/moly/asset-store/", assetCatalog: "c".repeat(64), assetReleaseVersion: "6.0.0" });
    const packedParsed = await serve(packed, () => fetchRuntimeManifest());
    assert.equal(packedParsed.snapshots[0].assets, "https://resources.example.test/moly/asset-store/");
    assert.equal(packedParsed.snapshots[0].assetCatalog, "c".repeat(64));
    assert.equal(packedParsed.snapshots[0].releaseModule, packedParsed.release.module);

    for (const mutate of [
        value => { value.release.module = "https://elsewhere.test/embed.mjs"; },
        value => { value.release.stage = "/moly/releases/other/stage.html"; },
        value => { value.snapshots[0].assets = value.snapshots[1].assets; },
        value => { value.snapshots[0].catalog = value.snapshots[1].catalog; },
        value => { value.snapshots[0].region = "tw"; },
        value => { value.snapshots[0].assetCatalog = "c".repeat(64); },
        value => { value.snapshots[1] = structuredClone(value.snapshots[0]); },
    ]) {
        const value = manifest(); mutate(value);
        await assert.rejects(serve(value, () => fetchRuntimeManifest()), /moly_manifest_invalid/);
    }

    requests.length = 0;
    replies = [{ status: 404 }, { body: manifest() }];
    const current = await fetchRuntimeManifest(undefined, { snapshot: "jp-previous", region: "jp" });
    assert.deepEqual(requests.map(request => request.url), ["/moly/manifest.json?snapshot=jp-previous&region=jp", "/moly/manifest.json"]);
    assert.ok(!current.snapshots.some(snapshot => snapshot.id === "jp-previous"), "fallback must not rename the current source into the missing pin");

    const snapshot = parsed.snapshots[1];
    const content = { schemaVersion: 1, snapshotId: snapshot.id, region: snapshot.region, version: snapshot.version, characters: [], entries: [] };
    await serve(content, () => fetchContentCatalog(snapshot));
    await assert.rejects(serve({ ...content, region: "cn" }, () => fetchContentCatalog(snapshot)), /moly_catalog_mismatch/);
    await assert.rejects(serve({ ...content, snapshotId: "jp-previous" }, () => fetchContentCatalog(snapshot)), /moly_catalog_mismatch/);
    const entry = { key: "talk:general:1", detail: "entries/talk-general-1.json" };
    await assert.rejects(serve({ schemaVersion: 1, snapshotId: "jp-previous", entry }, () => fetchContentDetail(snapshot, entry)), /moly_detail_mismatch/);

    const stage = await readFile(new URL("../src/components/mysekai-interactions/RuntimeStage.tsx", import.meta.url), "utf8");
    assert.ok(stage.includes("region: request.snapshot.region, version: request.snapshot.version, snapshot: request.snapshot.id"));
    assert.ok(stage.includes("packs: request.snapshot.packs, assetCatalog: request.snapshot.assetCatalog"));
    assert.ok(stage.includes("resourceOrigin: request.release.resourceOrigin"));
    console.log("moly legacy/canonical/packed publication and source-identity integration tests passed");
} finally {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
    else process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = originalOrigin;
}
