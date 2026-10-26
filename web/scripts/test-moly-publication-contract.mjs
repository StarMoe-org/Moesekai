import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Exercise the real host parser without installing the full Next.js toolchain.
// Type-only imports disappear; local runtime imports are resolved recursively.
async function moduleURL(file, imports = {}) {
    let source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"));
    for (const [specifier, replacement] of Object.entries(imports)) {
        source = source.replaceAll(`"${specifier}"`, `"${replacement}"`);
    }
    const runtimeImports = [...source.matchAll(/\bfrom\s+(["'])(\.[^"']+)\1/g)];
    for (const [, quote, specifier] of runtimeImports) {
        const dependency = new URL(specifier + ".ts", new URL(file, import.meta.url));
        const replacement = await moduleURL(dependency);
        source = source.replaceAll(`${quote}${specifier}${quote}`, `${quote}${replacement}${quote}`);
    }
    return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const resourceBase = await moduleURL("../src/lib/moly/resourceBase.ts");
const navigation = await moduleURL("../src/lib/moly/workspaceNavigation.ts");
const mysekaiSource = await moduleURL("../src/lib/mysekai-source.ts");
const catalogURL = await moduleURL("../src/lib/moly/catalog.ts", {
    "../mysekai-source": mysekaiSource,
    "./resourceBase": resourceBase,
    "./workspaceNavigation": navigation,
});
const { fetchRuntimeManifest, fetchContentCatalog, fetchContentDetail, resourceImage } = await import(catalogURL);
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
const originalBase = process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;
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
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = "https://resources.example.test/bucket/";
    const parsed = await serve(manifest(), () => fetchRuntimeManifest());
    assert.equal(parsed.release.module, "/moly/releases/stage-new/embed.mjs", "SDK remains same-origin");
    assert.equal(parsed.release.stage, "/moly/releases/stage-new/stage.html", "iframe remains same-origin");
    assert.equal(parsed.release.resourceBase, "https://resources.example.test/bucket/");
    assert.equal(parsed.snapshots[1].assets, "https://resources.example.test/bucket/snapshots/jp-6.0.0-example/assets/");
    assert.equal(parsed.snapshots[1].catalog, "https://resources.example.test/bucket/snapshots/jp-6.0.0-example/catalog/index.json");
    assert.equal(parsed.snapshots[1].region, "jp");
    assert.equal(parsed.snapshots[1].version, "6.0.0");
    assert.equal(parsed.snapshots[1].coordinateContract, coordinateContract);
    assert.deepEqual(parsed.snapshots[1].provenance.coordinateModels, { files: 31, sha256: "b".repeat(64) });
    assert.equal(parsed.snapshots[1].releaseModule, parsed.release.module);
    assert.equal(requests[0].options.cache, "no-store");
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(requests[0].options.redirect, "error");

    delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;
    const defaultPublication = await serve(manifest(), () => fetchRuntimeManifest());
    assert.equal(defaultPublication.release.resourceBase, "https://assets.pjsk.moe/sekai-extra-assets/", "runtime uses the checked-in publication without an environment override");
    assert.equal(defaultPublication.release.module, "/moly/releases/stage-new/embed.mjs", "SDK remains same-origin with the default publication");
    assert.equal(defaultPublication.release.stage, "/moly/releases/stage-new/stage.html", "iframe remains same-origin with the default publication");
    assert.equal(defaultPublication.snapshots[0].assets, "https://assets.pjsk.moe/sekai-extra-assets/snapshots/cn-6.0.0-example/assets/");
    assert.equal(defaultPublication.snapshots[0].catalog, "https://assets.pjsk.moe/sekai-extra-assets/snapshots/cn-6.0.0-example/catalog/index.json");
    const configURL = await moduleURL("../next.config.ts", { "./src/lib/moly/resourceBase": resourceBase });
    const { default: nextConfig } = await import(configURL);
    assert.deepEqual((await nextConfig.rewrites()).afterFiles.find(rule => rule.source === "/moly/:path*"), {
        source: "/moly/:path*",
        destination: `${defaultPublication.release.resourceBase}:path*`,
    }, "same-origin proxy and runtime use the same default publication");
    const cachePanel = await readFile(new URL("../src/components/mysekai-interactions/ResourceCachePanel.tsx", import.meta.url), "utf8");
    assert.ok(cachePanel.includes("useRuntimeManifest(retry)"), "resource management discovers publications and can retry failed discovery");
    assert.ok(!cachePanel.includes("molyResourceBase"), "resource configuration is not deployment status");
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = "https://resources.example.test/bucket/";

    // A host update must also keep a previously pinned immutable release usable;
    // the new runtime itself owns its stricter coordinate preflight.
    const legacy = manifest();
    delete legacy.release.coordinateContract;
    for (const snapshot of legacy.snapshots) { delete snapshot.coordinateContract; delete snapshot.provenance; }
    await serve(legacy, () => fetchRuntimeManifest());

    const packed = manifest();
    Object.assign(packed.snapshots[0], { packs: true, assets: "/moly/asset-store/", assetCatalog: "c".repeat(64), assetReleaseVersion: "6.0.0" });
    const packedParsed = await serve(packed, () => fetchRuntimeManifest());
    assert.equal(packedParsed.snapshots[0].assets, "https://resources.example.test/bucket/asset-store/");
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

    // Schema 2: details live in content-addressed bundles shared across snapshots.
    const { createHash } = await import("node:crypto");
    const bundleBody = { schemaVersion: 2, entries: { "talk:general:1": { key: "talk:general:1", title: "bundled" } } };
    const bundlePath = `/moly/catalog-store/${createHash("sha256").update(JSON.stringify(bundleBody)).digest("hex")}.json`;
    const card = detail => ({ key: "talk:general:1", fixtureIds: [], unitIds: [], available: true, presentation: {}, detail });
    const bundled = await serve({ ...content, schemaVersion: 2, details: [bundlePath], entries: [card(0)] }, () => fetchContentCatalog(snapshot));
    assert.equal(bundled.entries[0].detail, bundlePath);
    assert.equal((await serve(bundleBody, () => fetchContentDetail(snapshot, bundled.entries[0]))).title, "bundled");
    assert.equal(requests[0].url, (process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE ?? "/moly/") + bundlePath.slice("/moly/".length));
    assert.equal(requests[0].options.cache, "force-cache");
    await assert.rejects(serve({ ...bundleBody, schemaVersion: 3 }, () => fetchContentDetail(snapshot, bundled.entries[0])), /moly_detail_mismatch/);
    await assert.rejects(serve({ ...content, schemaVersion: 2, details: [bundlePath], entries: [card(1)] }, () => fetchContentCatalog(snapshot)), /moly_catalog_invalid/);
    await assert.rejects(serve({ ...content, schemaVersion: 2, details: ["/moly/catalog-store/x.json"], entries: [] }, () => fetchContentCatalog(snapshot)), /moly_catalog_mismatch/);

    // Packed cards name images by content address; logical paths have no URL there.
    const blobImage = `/moly/asset-store/blobs/ab/ab${"0".repeat(62)}.bin`;
    assert.equal(resourceImage(packedParsed.snapshots[0], blobImage), "https://resources.example.test/bucket/" + blobImage.slice("/moly/".length));
    assert.equal(resourceImage(packedParsed.snapshots[0], "fixture-thumbnails/textures/a.png"), undefined);
    assert.equal(resourceImage(packedParsed.snapshots[0], `/moly/asset-store/blobs/cd/ab${"0".repeat(62)}.bin`), undefined);
    assert.equal(resourceImage(parsed.snapshots[1], "fixture-thumbnails/textures/a.png"), "https://resources.example.test/bucket/snapshots/jp-6.0.0-example/assets/fixture-thumbnails/textures/a.png");

    const stage = await readFile(new URL("../src/components/mysekai-interactions/RuntimeStage.tsx", import.meta.url), "utf8");
    assert.ok(stage.includes("region: request.snapshot.region, version: request.snapshot.version, snapshot: request.snapshot.id"));
    assert.ok(stage.includes("packs: request.snapshot.packs, assetCatalog: request.snapshot.assetCatalog"));
    assert.ok(stage.includes("resourceBase: request.release.resourceBase"));
    console.log("moly legacy/canonical/packed publication and source-identity integration tests passed");
} finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;
    else process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = originalBase;
}
