import assert from "node:assert/strict";

const { molyResourceBase, molyResourceOrigin, molyResourceUrl } = await import("../src/lib/moly/resourceOrigin.ts");

delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;
delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
assert.equal(molyResourceOrigin(), "");
assert.equal(molyResourceUrl("/moly/snapshots/example/assets/a.bin"), "/moly/snapshots/example/assets/a.bin");

process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = " https://cdn.example.test/ ";
assert.equal(molyResourceOrigin(), "https://cdn.example.test");
assert.equal(molyResourceUrl("/moly/releases/r1/embed.mjs"), "https://cdn.example.test/moly/releases/r1/embed.mjs");

process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = "https://alternate.example.test:8443";
assert.equal(molyResourceOrigin(), "https://alternate.example.test:8443");
assert.equal(molyResourceUrl("/moly/asset-store/"), "https://alternate.example.test:8443/moly/asset-store/");

for (const value of [
    "http://cdn.example.test",
    "https://cdn.example.test/assets",
    "https://cdn.example.test/?x=1",
    "https://cdn.example.test/?",
    "https://cdn.example.test/#",
    "https://cdn.example.test/..",
    "https://cdn.example.test/a/..",
    "https://cdn.example.test\\",
    "https://user:pass@cdn.example.test",
    "not a URL",
]) {
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = value;
    assert.throws(() => molyResourceOrigin(), /moly_resource_origin_invalid/);
}

delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = "https://assets.pjsk.moe/sekai-extra-assets/";
assert.equal(molyResourceBase(), "https://assets.pjsk.moe/sekai-extra-assets/");
assert.equal(molyResourceOrigin(), "https://assets.pjsk.moe");
assert.equal(molyResourceUrl("/moly/snapshots/cn-example/assets/"), "https://assets.pjsk.moe/sekai-extra-assets/snapshots/cn-example/assets/");
assert.equal(molyResourceUrl("/moly/asset-store/"), "https://assets.pjsk.moe/sekai-extra-assets/asset-store/");
process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN = "https://other.example.test";
assert.throws(() => molyResourceOrigin(), /moly_resource_config_mismatch/);
delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN;
for (const value of ["https://assets.pjsk.moe/", "https://assets.pjsk.moe/sekai-extra-assets", "https://assets.pjsk.moe/sekai-extra-assets/?x=1", "https://assets.pjsk.moe/a/../b/"]) {
    process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE = value;
    assert.throws(() => molyResourceBase(), /moly_resource_base_invalid/);
}
delete process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE;

console.log("moly resource origin tests passed");
