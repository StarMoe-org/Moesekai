// Replaces the Live2D story player's vendored release (web/vendor/sse-web) with a build of
// SekaiStoryExporter's `crates/sse-web/dist.sh`:
//
//   node scripts/sync-sse-web.mjs --from <SekaiStoryExporter>/target/web-dist/sse-web-<version>
//
// The build's files are checked against its manifest.json. A build of a working tree with
// uncommitted changes (`dirty`) names a commit it is not: it is refused unless --allow-dirty
// is given, which is for trying a change out and not for committing.
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readRelease, releaseId, releaseSource, RELEASE_FILE, VENDOR_DIR } from "./sse-web-release.mjs";

const index = process.argv.indexOf("--from");
const from = index === -1 ? undefined : process.argv[index + 1];
if (!from) {
    console.error("usage: node scripts/sync-sse-web.mjs --from <sse-web release directory> [--allow-dirty]");
    process.exit(1);
}
const source = resolve(from);
const manifest = readRelease(source);
if (manifest.dirty && !process.argv.includes("--allow-dirty")) {
    console.error(`[sse-web] ${source} was built from a working tree with uncommitted changes; commit them and build again, or pass --allow-dirty to try it out`);
    process.exit(1);
}

rmSync(VENDOR_DIR, { recursive: true, force: true });
cpSync(source, VENDOR_DIR, { recursive: true });
writeFileSync(RELEASE_FILE, releaseSource(manifest));
console.log(`[sse-web] ${releaseId(manifest)} (commit ${manifest.commit.slice(0, 12)}${manifest.dirty ? ", dirty" : ""}) -> vendor/sse-web; run copy:wasm to serve it`);
