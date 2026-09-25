import assert from "node:assert/strict";

const { molyResourceBase, molyResourceUrl } = await import("../src/lib/moly/resourceBase.ts");

delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;
assert.equal(molyResourceBase(), "");
assert.equal(molyResourceUrl("/moly/snapshots/example/assets/a.bin"), "/moly/snapshots/example/assets/a.bin");

// The bucket segment is part of every public URL; resolving an absolute
// /moly/ path against the base would drop it.
process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = " https://assets.example.test/bucket/ ";
assert.equal(molyResourceBase(), "https://assets.example.test/bucket/");
assert.equal(molyResourceUrl("/moly/releases/r1/embed.mjs"), "https://assets.example.test/bucket/releases/r1/embed.mjs");
assert.equal(molyResourceUrl("/moly/snapshots/cn-6.0.0-a/assets/"), "https://assets.example.test/bucket/snapshots/cn-6.0.0-a/assets/");

process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = "https://alternate.example.test:8443/a/b/";
assert.equal(molyResourceUrl("/moly/asset-store/"), "https://alternate.example.test:8443/a/b/asset-store/");

for (const path of ["/moly/manifest.json", "/moly/sources/x/", "/moly/snapshots/../x/", "/moly/snapshots/a%2f/", "/api/x/", "/moly/releases/r1/a?x=1"]) {
    assert.throws(() => molyResourceUrl(path), /moly_resource_path_invalid/);
}

for (const value of [
    "http://assets.example.test/bucket/",
    "https://assets.example.test",
    "https://assets.example.test/",
    "https://assets.example.test/bucket",
    "https://assets.example.test/bucket/?x=1",
    "https://assets.example.test/bucket/#",
    "https://assets.example.test/bucket/?",
    "https://assets.example.test/a b/",
    "https://assets.example.test/bucket\\",
    "https://assets.example.test/bucket/../",
    "https://assets.example.test/a/%2e%2e/",
    "https://assets.example.test/Bucket%20/",
    "HTTPS://assets.example.test/bucket/",
    "https://user:pass@assets.example.test/bucket/",
    "not a URL",
]) {
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = value;
    assert.throws(() => molyResourceBase(), /moly_resource_base_invalid/, value);
}

console.log("moly resource base tests passed");
