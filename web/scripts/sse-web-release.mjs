// The Live2D story player's release (sse-web, built from SekaiStoryExporter) as this
// repository keeps it: web/vendor/sse-web/, the output of that project's
// `crates/sse-web/dist.sh` unchanged. Its manifest.json names the commit it was built from and
// the SHA-256 of every other file.
//
//   sync-sse-web.mjs   replaces the vendored release with another build
//   copy-sse-web.mjs   copies it to public/sse-web/<release>/ for dev and build
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_DIR = join(webRoot, "vendor", "sse-web");
export const PUBLIC_DIR = join(webRoot, "public", "sse-web");
export const RELEASE_FILE = join(webRoot, "src", "lib", "sseWeb", "release.ts");
const FORMAT = "sse-web-release/1";

function files(directory, base = directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path, base) : [relative(base, path).split(sep).join("/")];
    });
}

/**
 * The manifest of the release in `directory`, after checking that the directory holds exactly
 * the files it lists, each with the hash it gives.
 */
export function readRelease(directory) {
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    if (manifest.format !== FORMAT) throw new Error(`${directory}: manifest.json is "${manifest.format}", expected "${FORMAT}"`);
    const listed = Object.keys(manifest.sha256).sort();
    const found = files(directory).filter(file => file !== "manifest.json").sort();
    if (listed.join("\n") !== found.join("\n")) {
        const extra = found.filter(file => !listed.includes(file));
        const missing = listed.filter(file => !found.includes(file));
        throw new Error(`${directory} does not hold what its manifest lists (not listed: ${extra.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`);
    }
    for (const file of listed) {
        const actual = createHash("sha256").update(readFileSync(join(directory, file))).digest("hex");
        if (actual !== manifest.sha256[file]) throw new Error(`${directory}/${file}: SHA-256 ${actual}, the manifest says ${manifest.sha256[file]}`);
    }
    return manifest;
}

/**
 * The name of the directory a release is served from: its version and a digest of its files,
 * so that a browser never mixes the files of two releases.
 */
export function releaseId(manifest) {
    const digest = createHash("sha256");
    for (const file of Object.keys(manifest.sha256).sort()) digest.update(`${file} ${manifest.sha256[file]}\n`);
    return `${manifest.version}-${digest.digest("hex").slice(0, 12)}`;
}

/** What src/lib/sseWeb/release.ts holds for a release. */
export function releaseSource(manifest) {
    return "// Written by scripts/sync-sse-web.mjs from vendor/sse-web/manifest.json; do not edit.\n"
        + "/** The directory below /sse-web/ the vendored release is served from. */\n"
        + `export const SSE_WEB_RELEASE = ${JSON.stringify(releaseId(manifest))};\n`;
}
