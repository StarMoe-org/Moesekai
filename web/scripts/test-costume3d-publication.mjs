import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// The reader loaded from its source: its modules are copied beside each other with their relative
// imports made `.js` (as the build does), and it reads its regions from `NEXT_PUBLIC_COSTUME3D_REGIONS`.
const directory = new URL("../.test-costume3d/", import.meta.url);
await rm(directory, { recursive: true, force: true });
await mkdir(directory);
for (const name of ["config", "publication"]) {
    const source = stripTypeScriptTypes(await readFile(new URL(`../src/lib/costume3d/${name}.ts`, import.meta.url), "utf8"));
    await writeFile(new URL(`${name}.js`, directory), source.replace(`from "./config";`, `from "./config.js";`));
}
process.env.NEXT_PUBLIC_COSTUME3D_REGIONS = "jp";
const { Costume3dDocumentError, Costume3dPublication, Costume3dUnavailableError, openOutput } =
    await import(new URL("publication.js", directory).href);

// ---------------------------------------------------------------- a synthetic output
// One region's output: `published/jp/<view>/current.json` points at the index root, and `store/`
// holds every object, named by its hash. A pointer, an index root, a shard per directory, a listing
// per form, the asset documents and their members; only hashes are made up here.
const REGION = "jp";
const ROOT_URL = `https://assets.pjsk.moe/sekai-extra-assets/published/${REGION}/canonical/current.json`;
const STORE = "https://assets.pjsk.moe/sekai-extra-assets/store/";
const view = (name) => `https://assets.pjsk.moe/sekai-extra-assets/published/${REGION}/${name}/current.json`;

const hashOf = (text) => { let h = 0x811c9dc5; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h.toString(16).padStart(8, "0").repeat(8); };
const objectUrl = (sha256, extension = "json") => `${STORE}${sha256.slice(0, 2)}/${sha256}.${extension}`;
const pointer = (root) => JSON.stringify({ format: "pointer", version: 1, published_version: "1", revision: "r", root });

function output() {
    const files = new Map();
    const put = (bytes, extension = "json") => {
        const sha256 = hashOf(bytes);
        files.set(objectUrl(sha256, extension), bytes);
        return { sha256, extension };
    };
    // An asset of a form with its members by role; its document is an object of the store too.
    const asset = (name, form, members, extra = {}) => ({
        form,
        members,
        document: put(JSON.stringify({ format: "asset", version: 1, name, form, form_version: 1, fingerprint: "f", sources: [], members, references: [], ...extra })),
    });
    const member = (role, sha256, extension = "json") => ({ role, sha256, size: 1, extension, media_type: "application/octet-stream" });
    const assets = new Map([
        ["costume/role/1-light_sound", asset("costume/role/1-light_sound", "costume-role", [member("costume-role", "a".repeat(64))])],
        ["costume/role/2-idol", asset("costume/role/2-idol", "costume-role", [member("costume-role", "b".repeat(64))])],
        ["costume/role/3-street", asset("costume/role/3-street", "costume-role", [member("costume-role", "c".repeat(64))], { form_version: 9 })],
        ["costume/880", asset("costume/880", "costume", [member("costume", "d".repeat(64))])],
        ["character/model/body", asset("character/model/body", "costume-model", [member("model", "e".repeat(64), "glb"), member("texture/0", "f".repeat(64), "webp")])],
        ["character/model/face", asset("character/model/face", "costume-model", [member("model", "1".repeat(64), "glb"), member("components", "2".repeat(64))])],
        ["character/motion/w-normal01", asset("character/motion/w-normal01", "costume-motion", [member("motion", "3".repeat(64))])],
        ["character/broken/part", asset("character/broken/part", "costume-model", [], { error: { code: "truncated", message: "the image is short" } })],
        ["character/other/part", asset("character/other/part", "costume-model", [member("model", "4".repeat(64), "glb")], { form_version: 2 })],
    ]);
    // The documents the assets' members name.
    const documents = new Map([
        ["a".repeat(64), { format: "costume-role", version: 1, role: { characterId: 1, unit: "light_sound" }, parts: [], notAvailable: [], defaultHairs: {} }],
        ["b".repeat(64), { format: "costume-role", version: 1, role: { characterId: 2, unit: "idol" }, parts: [], notAvailable: [], defaultHairs: {} }],
        ["c".repeat(64), { format: "costume-role", version: 2, role: { characterId: 3, unit: "street" }, parts: [], notAvailable: [], defaultHairs: {} }],
        ["d".repeat(64), { format: "costume", version: 1, costumeNumber: 880, variants: [] }],
        ["2".repeat(64), { format: "components", version: 1, components: [{ class: "AimConstraint", script: null, node: "", enabled: true, fields: {} }] }],
        ["3".repeat(64), { format: "clip", version: 2, name: "w", sample_rate: 60, start_time: 0, stop_time: 1, loop: false, curves: [], events: [] }],
    ]);
    for (const [sha256, document] of documents) files.set(objectUrl(sha256), JSON.stringify(document));

    // A shard per directory, with an entry per file: the asset documents and their members.
    const directories = new Map();
    const add = (path, extension, object, role, owner) => {
        const slash = path.lastIndexOf("/");
        const subdirectory = slash < 0 ? "" : path.slice(0, slash);
        const entry = { name: `${path.slice(slash + 1)}.${extension}`, sha256: object.sha256, extension: object.extension, size: 1, media_type: "application/octet-stream", asset: owner, role };
        directories.set(subdirectory, [...(directories.get(subdirectory) ?? []), entry]);
    };
    for (const [name, entry] of assets) {
        add(name, "asset.json", entry.document, "document", name);
        for (const m of entry.members) add(`${name}/${m.role}`, m.extension, m, m.role, name);
    }
    const shards = [...directories].map(([subdirectory, entries]) => ({
        directory: subdirectory,
        sha256: put(JSON.stringify({ format: "index-shard", version: 1, directory: subdirectory, entries })).sha256,
    }));

    // A listing per form, by name, with the size of the members.
    const forms = new Map();
    for (const [name, entry] of assets) forms.set(entry.form, [...(forms.get(entry.form) ?? []), { name, fingerprint: "f", size: 1 }]);
    const listings = [...forms].map(([form, entries]) => ({
        form,
        sha256: put(JSON.stringify({ format: "listing", version: 1, form, entries })).sha256,
    }));

    const root = put(JSON.stringify({ format: "index-root", version: 1, published_version: "1", revision: "r", shards, listings, failures: [{ name: "character/broken/part", code: "truncated" }] }));
    return { files, root: root.sha256 };
}

// ---------------------------------------------------------------- the server
/** The output served for the pointers of every view. */
let served = output();
/** The root a view's pointer names; null is the served root, and a view not here has no pointer. */
const pointed = new Map();
/** Requests whose URL contains this text fail: with a network error after `:network`, else with that status. */
const failing = { text: null, kind: null };
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
    const href = String(url);
    requests.push(href);
    if (failing.text && href.includes(failing.text)) {
        if (failing.kind === "network") throw new TypeError("fetch failed");
        return new Response("{}", { status: Number(failing.kind) });
    }
    const body = pointed.has(href) ? pointer(pointed.get(href) ?? served.root) : served.files.get(href);
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
};

const count = (text) => requests.filter(url => url.includes(text)).length;
const open = () => openOutput(REGION);
const failureOf = async (promise) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
};

try {
    // Opening reads the pointer, the root and the listing of the roles.
    pointed.set(ROOT_URL, null);
    const roleNames = ["costume/role/1-light_sound", "costume/role/2-idol", "costume/role/3-street"];
    const publication = await open();
    assert.ok(publication instanceof Costume3dPublication);
    assert.equal(publication.store, STORE);
    assert.equal(publication.pointer, ROOT_URL);
    assert.deepEqual(await publication.listing("costume-role"), roleNames);
    assert.deepEqual(await publication.listing("costume-motion"), ["character/motion/w-normal01"]);
    assert.deepEqual(await publication.listing("no-such-form"), []);

    // An asset is found through the shard of its directory and its document; its members through
    // their roles, as objects of the store.
    const role = await publication.asset("costume/role/1-light_sound");
    assert.equal(role.form, "costume-role");
    assert.equal(publication.member(role, "costume-role").url, objectUrl("a".repeat(64)));
    assert.equal((await publication.role("costume/role/1-light_sound")).role.characterId, 1);
    assert.deepEqual(await publication.costume(880), { format: "costume", version: 1, costumeNumber: 880, variants: [] });
    const body = await publication.asset("character/model/body");
    assert.equal(publication.member(body, "model").url, objectUrl("e".repeat(64), "glb"));
    assert.equal(publication.member(body, "texture/0").url, objectUrl("f".repeat(64), "webp"));
    assert.deepEqual((await publication.components(body)).components, []);
    assert.equal((await publication.components(await publication.asset("character/model/face"))).components[0].class, "AimConstraint");
    assert.equal((await publication.clip(await publication.asset("character/motion/w-normal01"))).version, 2);

    // Documents are read once, however often they are asked for.
    requests.length = 0;
    await publication.asset("costume/role/1-light_sound");
    await publication.role("costume/role/1-light_sound");
    await publication.asset("character/model/body");
    assert.deepEqual(requests, []);

    // What the output does not have: an asset that was not published, one whose conversion
    // failed, and one of a form version this reader does not know.
    const missing = await failureOf(publication.asset("costume/role/9-light_sound"));
    assert.ok(missing instanceof Costume3dDocumentError && missing.reason === "missing");
    const unknown = await failureOf(publication.asset("nowhere/asset"));
    assert.ok(unknown instanceof Costume3dDocumentError && unknown.reason === "missing");
    const broken = await publication.asset("character/broken/part");
    assert.deepEqual(broken.error, { code: "truncated", message: "the image is short" });
    assert.equal(broken.members.length, 0);
    const newerForm = await failureOf(publication.role("costume/role/3-street"));
    assert.ok(newerForm instanceof Costume3dDocumentError && newerForm.reason === "format");
    const newerModel = await failureOf(publication.asset("character/other/part"));
    assert.ok(newerModel instanceof Costume3dDocumentError && newerModel.reason === "format");

    // A failed request is not kept: the next one asks again, and succeeds.
    failing.text = objectUrl("b".repeat(64));
    failing.kind = "503";
    assert.match((await failureOf(publication.role("costume/role/2-idol"))).message, /503/);
    failing.text = null;
    requests.length = 0;
    assert.equal((await publication.role("costume/role/2-idol")).role.characterId, 2);
    assert.equal(count(objectUrl("b".repeat(64))), 1);

    // Another view of the same region is another publication; shards are kept by their hash, so
    // it reads no shard again.
    pointed.set(view("tour"), null);
    const other = new Costume3dPublication(view("tour"));
    assert.equal(other.store, STORE);
    assert.deepEqual(await other.listing("costume-role"), roleNames);
    requests.length = 0;
    assert.equal((await new Costume3dPublication(view("tour")).asset("character/model/body")).form, "costume-model");
    assert.equal(count("index-shard"), 0);

    // A root or a pointer of a version this reader does not know is a format failure, not a broken
    // page. A pointer is read once per view, so the second is read by another view.
    const late = output();
    late.files.set(objectUrl("0".repeat(64)), JSON.stringify({ format: "index-root", version: 2, published_version: "1", revision: "r", shards: [], listings: [], failures: [] }));
    late.files.set(objectUrl("1".repeat(64)), JSON.stringify({ format: "pointer", version: 2, published_version: "1", revision: "r", root: "0".repeat(64) }));
    served = late;
    pointed.set(view("late"), "0".repeat(64));
    const newerRoot = await failureOf(new Costume3dPublication(view("late")).listing("costume-role"));
    assert.ok(newerRoot instanceof Costume3dUnavailableError && newerRoot.reason === "format");
    late.files.set(objectUrl("0".repeat(64)), JSON.stringify({ format: "index-root", version: 1, published_version: "1", revision: "r", shards: [], listings: [], failures: [] }));
    pointed.set(view("latePointer"), "1".repeat(64));
    const newerPointer = await failureOf(new Costume3dPublication(view("latePointer")).listing("costume-role"));
    assert.ok(newerPointer instanceof Costume3dUnavailableError && newerPointer.reason === "format");

    // A server that is not published is a region failure. Another server is not published until
    // `NEXT_PUBLIC_COSTUME3D_REGIONS` lists it.
    failing.text = null;
    await assert.rejects(openOutput("xx"), (error) => error.reason === "region");
    const regions = process.env.NEXT_PUBLIC_COSTUME3D_REGIONS;
    process.env.NEXT_PUBLIC_COSTUME3D_REGIONS = "jp,cn";
    await assert.rejects(openOutput("cn"), (error) => error.reason === "network");
    process.env.NEXT_PUBLIC_COSTUME3D_REGIONS = regions;
    assert.deepEqual(await (await openOutput(REGION)).listing("costume-role"), roleNames);
} finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_COSTUME3D_REGIONS;
    await rm(directory, { recursive: true, force: true });
}
console.log("costume3d publication: ok");

