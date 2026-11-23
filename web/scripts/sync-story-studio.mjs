#!/usr/bin/env node
/**
 * Syncs `@moesekai/story-core` and `@moesekai/story-editor` dependencies in
 * `web/package.json`.
 *
 * Modes:
 *   --mode npm (default / production):
 *     Sets `@moesekai/story-core` and `@moesekai/story-editor` in `web/package.json`
 *     to clean public npm semver ranges (`^<version>`, or `<version>` with `--exact`)
 *     and removes any stale local tarballs under `web/vendor/moesekai-story-studio/`
 *     and `web/.cache/moesekai-story-studio/`.
 *
 *     Version resolution order:
 *       1. `--version <X.Y.Z>` CLI flag (accepts optional leading `v`)
 *       2. Lockstep version read from sibling `moesekai-story-studio` checkout
 *
 *   --mode local (dev-only, DO NOT COMMIT):
 *     Packs `@moesekai/story-core` and `@moesekai/story-editor` from a local
 *     `moesekai-story-studio` checkout into content-hashed `.tgz` archives inside
 *     gitignored `web/.cache/moesekai-story-studio/` and writes `file:` specifiers
 *     into `web/package.json` so unreleased edits can be tested locally.
 *     Content-hashed filenames prevent Bun's global tarball cache (`@T@*`) from
 *     serving stale bytes when packages are rebuilt without bumping semver.
 *
 * Usage:
 *   bun run --cwd web sync:story-studio
 *   bun run --cwd web sync:story-studio --version 0.2.0
 *   bun run --cwd web sync:story-studio --mode npm --version 0.2.0 --dry-run
 *   bun run --cwd web sync:story-studio --mode local
 *   MOESEKAI_STORY_STUDIO_DIR=/path/to/moesekai-story-studio bun run --cwd web sync:story-studio --mode local
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PACKAGES = [
    { name: "@moesekai/story-core", relDir: ["packages", "story-core"], prefix: "moesekai-story-core" },
    { name: "@moesekai/story-editor", relDir: ["packages", "story-editor"], prefix: "moesekai-story-editor" },
];

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPkgPath = path.join(webRoot, "package.json");
const legacyVendorDir = path.join(webRoot, "vendor", "moesekai-story-studio");
const localCacheDir = path.join(webRoot, ".cache", "moesekai-story-studio");

function printHelp() {
    console.log(`Usage: node scripts/sync-story-studio.mjs [options]

Options:
  --mode <npm|local>   Target dependency mode (default: npm)
  --version <X.Y.Z>    Target semver in npm mode (default: read from sibling repo)
  --exact              Pin exact X.Y.Z instead of ^X.Y.Z in npm mode
  --dry-run            Show planned changes without modifying files
  -h, --help           Show this help message

Environment:
  MOESEKAI_STORY_STUDIO_DIR  Custom path to a sibling moesekai-story-studio checkout
`);
}

function parseArgs(argv) {
    const opts = {
        mode: "npm",
        version: null,
        exact: false,
        dryRun: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--") continue;
        if (arg === "-h" || arg === "--help") {
            opts.help = true;
            continue;
        }
        if (arg === "--dry-run") {
            opts.dryRun = true;
            continue;
        }
        if (arg === "--exact") {
            opts.exact = true;
            continue;
        }
        if (arg === "--mode" || arg.startsWith("--mode=")) {
            const value = arg.includes("=") ? arg.slice("--mode=".length) : argv[++i];
            if (value !== "npm" && value !== "local") {
                throw new Error(`Invalid --mode "${value ?? ""}". Expected "npm" or "local".`);
            }
            opts.mode = value;
            continue;
        }
        if (arg === "--version" || arg.startsWith("--version=")) {
            const raw = arg.includes("=") ? arg.slice("--version=".length) : argv[++i];
            if (!raw) {
                throw new Error("Missing value for --version (expected X.Y.Z).");
            }
            opts.version = raw.replace(/^v/, "");
            continue;
        }
        throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
    }

    if (opts.version !== null && !SEMVER_RE.test(opts.version)) {
        throw new Error(`Invalid semver "${opts.version}" for --version (expected X.Y.Z).`);
    }
    if (opts.mode === "local" && opts.version !== null) {
        throw new Error("--version is only supported in --mode npm.");
    }
    if (opts.mode === "local" && opts.exact) {
        throw new Error("--exact is only supported in --mode npm.");
    }

    return opts;
}

function findStudioRoot() {
    const candidates = [
        process.env.MOESEKAI_STORY_STUDIO_DIR,
        // Main repo layout: <parent>/Snowy_Viewer/web -> <parent>/moesekai-story-studio
        path.resolve(webRoot, "..", "..", "moesekai-story-studio"),
        // Git worktree layout: <parent>/Snowy_Viewer/.worktrees/<name>/web -> <parent>/moesekai-story-studio
        path.resolve(webRoot, "..", "..", "..", "..", "moesekai-story-studio"),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, "packages", "story-core", "package.json"))) {
            return { root: candidate, checked: candidates };
        }
    }
    return { root: null, checked: candidates };
}

function readSiblingLockstepVersion(studioRoot) {
    const versions = new Map();
    for (const pkg of PACKAGES) {
        const pkgJsonPath = path.join(studioRoot, ...pkg.relDir, "package.json");
        const meta = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        if (typeof meta.version !== "string" || !SEMVER_RE.test(meta.version)) {
            throw new Error(`Invalid version "${meta.version}" in ${pkgJsonPath}`);
        }
        versions.set(pkg.name, meta.version);
    }

    const uniqueVersions = [...new Set(versions.values())];
    if (uniqueVersions.length !== 1) {
        const summary = [...versions.entries()].map(([name, ver]) => `${name}@${ver}`).join(", ");
        throw new Error(`Sibling moesekai-story-studio package versions diverged: ${summary}`);
    }
    return uniqueVersions[0];
}

function removeDirIfExists(dirPath, label, dryRun) {
    if (!fs.existsSync(dirPath)) return;
    if (dryRun) {
        console.log(`[dry-run] Would remove stale ${label} (${dirPath})`);
        return;
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed stale ${label}`);
}

function writeWebPackageJson(webPkg, dryRun) {
    const serialized = `${JSON.stringify(webPkg, null, 2)}\n`;
    if (dryRun) {
        console.log("[dry-run] Would update web/package.json dependencies:");
        for (const pkg of PACKAGES) {
            console.log(`  "${pkg.name}": "${webPkg.dependencies[pkg.name]}"`);
        }
        return;
    }
    fs.writeFileSync(webPkgPath, serialized, "utf8");
}

function runNpmMode(opts) {
    let targetVersion = opts.version;
    if (!targetVersion) {
        const { root, checked } = findStudioRoot();
        if (!root) {
            throw new Error(
                `Could not locate sibling moesekai-story-studio repo to infer version. Pass --version X.Y.Z or set MOESEKAI_STORY_STUDIO_DIR. Checked: ${checked.join(", ")}`,
            );
        }
        targetVersion = readSiblingLockstepVersion(root);
    }

    const specifier = opts.exact ? targetVersion : `^${targetVersion}`;
    const webPkg = JSON.parse(fs.readFileSync(webPkgPath, "utf8"));
    webPkg.dependencies = webPkg.dependencies || {};

    for (const pkg of PACKAGES) {
        webPkg.dependencies[pkg.name] = specifier;
    }

    writeWebPackageJson(webPkg, opts.dryRun);
    removeDirIfExists(legacyVendorDir, "web/vendor/moesekai-story-studio/", opts.dryRun);
    removeDirIfExists(localCacheDir, "web/.cache/moesekai-story-studio/", opts.dryRun);

    const prefix = opts.dryRun ? "[dry-run] " : "";
    console.log(`${prefix}Configured public npm dependencies: @moesekai/story-core & @moesekai/story-editor -> ${specifier}`);
    console.log("Next: run `bun install` at the repository root to refresh bun.lock from npmjs.org / npmmirror.");
}

function runLocalMode(opts) {
    const { root: studioRoot, checked } = findStudioRoot();
    if (!studioRoot) {
        throw new Error(
            `Could not locate moesekai-story-studio repo. Set MOESEKAI_STORY_STUDIO_DIR. Checked: ${checked.join(", ")}`,
        );
    }

    const webPkg = JSON.parse(fs.readFileSync(webPkgPath, "utf8"));
    webPkg.dependencies = webPkg.dependencies || {};

    if (opts.dryRun) {
        const version = readSiblingLockstepVersion(studioRoot);
        removeDirIfExists(legacyVendorDir, "web/vendor/moesekai-story-studio/", true);
        for (const pkg of PACKAGES) {
            console.log(
                `[dry-run] Would pack ${pkg.name}@${version} from ${path.join(studioRoot, ...pkg.relDir)} -> web/.cache/moesekai-story-studio/${pkg.prefix}-${version}-<sha8>.tgz`,
            );
        }
        return;
    }

    removeDirIfExists(legacyVendorDir, "web/vendor/moesekai-story-studio/", false);
    fs.mkdirSync(localCacheDir, { recursive: true });

    const bunExe = process.platform === "win32" ? "bun.exe" : "bun";

    for (const pkg of PACKAGES) {
        const pkgDir = path.join(studioRoot, ...pkg.relDir);
        const meta = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
        const tmpDir = fs.mkdtempSync(path.join(localCacheDir, ".pack-tmp-"));
        try {
            execFileSync(bunExe, ["pm", "pack", "--destination", tmpDir], {
                cwd: pkgDir,
                stdio: "inherit",
            });
            const packedFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".tgz"));
            if (packedFiles.length !== 1) {
                throw new Error(`Expected 1 .tgz for ${meta.name}, found: ${packedFiles.join(", ")}`);
            }
            const packedPath = path.join(tmpDir, packedFiles[0]);
            const hash = crypto.createHash("sha256").update(fs.readFileSync(packedPath)).digest("hex").slice(0, 8);
            const targetName = `${pkg.prefix}-${meta.version}-${hash}.tgz`;
            const dest = path.join(localCacheDir, targetName);

            for (const existing of fs.readdirSync(localCacheDir)) {
                if (existing.startsWith(pkg.prefix) && existing.endsWith(".tgz") && existing !== targetName) {
                    fs.rmSync(path.join(localCacheDir, existing), { force: true });
                }
            }

            fs.copyFileSync(packedPath, dest);
            webPkg.dependencies[meta.name] = `file:./.cache/moesekai-story-studio/${targetName}`;
            console.log(`Synced local ${meta.name}@${meta.version} -> web/.cache/moesekai-story-studio/${targetName}`);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }

    writeWebPackageJson(webPkg, false);
    console.log("Dev-only local tarballs packed into gitignored web/.cache/moesekai-story-studio/.");
    console.log("Run `bun install` at the repository root to test locally. Before committing, switch back with:");
    console.log("  bun run --cwd web sync:story-studio --mode npm");
}

try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        printHelp();
        process.exit(0);
    }
    if (opts.mode === "local") {
        runLocalMode(opts);
    } else {
        runNpmMode(opts);
    }
} catch (error) {
    console.error(`[sync-story-studio] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
