// A browser release this repository keeps as it was built (web/vendor/<name>/): the Live2D story
// player (sse-web, from SekaiStoryExporter) and the Live2D model viewer (SekaiLive2DViewer).
// Each is the output of its project's `dist.sh` unchanged; its manifest.json names the commit it
// was built from and the SHA-256 of every other file. Each is served as it is from
// public/<name>/<release>/: its workers have to be same-origin with the page and find each other
// by relative paths, so it is not bundled.
//
//   sync-<name>.mjs   replaces the vendored release with another build
//   copy-<name>.mjs   copies it to public/<name>/<release>/ for dev and build
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A kind of vendored release: where it is kept and served, the manifest format its builds
 * write, and the generated module that names the release the site loads.
 */
export function defineRelease({ name, format, releaseFile, constant, optional = false }) {
    return {
        name,
        format,
        constant,
        /** A release the site can run without: no vendored copy is served as none (null). */
        optional,
        vendorDir: join(webRoot, "vendor", name),
        publicDir: join(webRoot, "public", name),
        releaseFile: join(webRoot, ...releaseFile.split("/")),
        releaseFileName: releaseFile,
    };
}

export const SSE_WEB = defineRelease({
    name: "sse-web",
    format: "sse-web-release/1",
    releaseFile: "src/lib/sseWeb/release.ts",
    constant: "SSE_WEB_RELEASE",
});

export const LIVE2D_VIEWER = defineRelease({
    name: "live2d-viewer",
    format: "sekai-live2d-viewer-release/1",
    releaseFile: "src/lib/live2dViewer/release.ts",
    constant: "LIVE2D_VIEWER_RELEASE",
    optional: true,
});

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
export function readRelease(release, directory) {
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    if (manifest.format !== release.format) throw new Error(`${directory}: manifest.json is "${manifest.format}", expected "${release.format}"`);
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

/** What the generated release module holds for a release, or for none (`manifest` null). */
export function releaseSource(release, manifest) {
    const value = manifest ? JSON.stringify(releaseId(manifest)) : "null";
    const type = release.optional ? ": string | null" : "";
    return `// Written by scripts/sync-${release.name}.mjs from vendor/${release.name}/manifest.json; do not edit.\n`
        + `/** The directory below /${release.name}/ the vendored release is served from${release.optional ? " (null: none is vendored)" : ""}. */\n`
        + `export const ${release.constant}${type} = ${value};\n`;
}

/**
 * Copies the vendored release to public/<name>/<release>/. Fails when the vendored files are not
 * what their manifest lists, or when the generated module names another release.
 */
export function copyRelease(release) {
    const tag = `[${release.name}]`;
    try {
        const vendored = existsSync(join(release.vendorDir, "manifest.json"));
        if (!vendored && !release.optional) throw new Error(`vendor/${release.name} holds no release`);
        const manifest = vendored ? readRelease(release, release.vendorDir) : null;
        if (readFileSync(release.releaseFile, "utf8") !== releaseSource(release, manifest)) {
            throw new Error(`${release.releaseFileName} does not name the release in vendor/${release.name}; update both with scripts/sync-${release.name}.mjs`);
        }
        rmSync(release.publicDir, { recursive: true, force: true });
        if (!manifest) {
            console.log(`${tag} no release in vendor/${release.name}; nothing to serve`);
            return;
        }
        const id = releaseId(manifest);
        mkdirSync(release.publicDir, { recursive: true });
        cpSync(release.vendorDir, join(release.publicDir, id), { recursive: true });
        console.log(`${tag} vendor/${release.name} (commit ${manifest.commit.slice(0, 12)}) -> public/${release.name}/${id}/`);
    } catch (error) {
        console.error(`${tag} ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    }
}

/**
 * Replaces the vendored release with the build in `--from <directory>`, checked against its
 * manifest. A build of a working tree with uncommitted changes (`dirty`) names a commit it is not:
 * it is refused unless --allow-dirty is given, which is for trying a change out and not for
 * committing.
 */
export function syncRelease(release, argv) {
    const tag = `[${release.name}]`;
    const index = argv.indexOf("--from");
    const from = index === -1 ? undefined : argv[index + 1];
    if (!from) {
        console.error(`usage: node scripts/sync-${release.name}.mjs --from <${release.name} release directory> [--allow-dirty]`);
        process.exit(1);
    }
    const source = resolve(from);
    const manifest = readRelease(release, source);
    if (manifest.dirty && !argv.includes("--allow-dirty")) {
        console.error(`${tag} ${source} was built from a working tree with uncommitted changes; commit them and build again, or pass --allow-dirty to try it out`);
        process.exit(1);
    }
    rmSync(release.vendorDir, { recursive: true, force: true });
    cpSync(source, release.vendorDir, { recursive: true });
    mkdirSync(dirname(release.releaseFile), { recursive: true });
    writeFileSync(release.releaseFile, releaseSource(release, manifest));
    console.log(`${tag} ${releaseId(manifest)} (commit ${manifest.commit.slice(0, 12)}${manifest.dirty ? ", dirty" : ""}) -> vendor/${release.name}; run copy:wasm to serve it`);
}
