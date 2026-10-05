#!/usr/bin/env node
/**
 * Merge staged MD3-migration i18n additions into the locale message files.
 *
 * Each migration batch writes `scripts/md3-i18n/<batch>.json` shaped as:
 *   { "zh-CN": { "page.cards.foo": "…", … }, "zh-TW": {…}, "en-US": {…}, "ja-JP": {…}, "ko-KR": {…} }
 * Keys are full dotted paths. A key that already exists is left untouched (reported).
 *
 * New leaves are inserted as a single nested object literal appended to the
 * deepest existing ancestor object in the locale file, so the files remain
 * hand-editable TypeScript. zh-TW keys under `common.*` go to zh-TW/common.ts,
 * `page.*` to zh-TW/page-secondary-b.ts (spread into `page`), other roots to shell.ts.
 *
 * Usage: node scripts/merge-md3-i18n.mjs [--dry]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadAllMessages } from "./i18n-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const stageDir = path.join(__dirname, "md3-i18n");
const dry = process.argv.includes("--dry");
const LOCALES = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

const files = fs.existsSync(stageDir) ? fs.readdirSync(stageDir).filter((f) => f.endsWith(".json")) : [];
if (!files.length) {
    console.log("[md3-i18n] nothing to merge");
    process.exit(0);
}

/** locale -> Map(key -> value) */
const additions = Object.fromEntries(LOCALES.map((l) => [l, new Map()]));
for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(stageDir, f), "utf8"));
    const base = Object.keys(data["zh-CN"] ?? {});
    for (const l of LOCALES) {
        const obj = data[l] ?? {};
        const missing = base.filter((k) => !(k in obj));
        if (missing.length) throw new Error(`${f}: ${l} missing ${missing.join(", ")}`);
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v !== "string") throw new Error(`${f}: ${l}.${k} must be a string`);
            const prev = additions[l].get(k);
            if (prev !== undefined && prev !== v) console.warn(`[md3-i18n] ${l} ${k}: conflicting values across batches, keeping first`);
            if (prev === undefined) additions[l].set(k, v);
        }
    }
}

const existing = loadAllMessages();
const has = (tree, key) => key.split(".").reduce((n, p) => (n && typeof n === "object" ? n[p] : undefined), tree) !== undefined;

function localeFile(locale, key) {
    if (locale !== "zh-TW") return path.join(webRoot, `src/lib/i18n/messages/${locale}/index.ts`);
    const root = key.split(".")[0];
    if (root === "common") return path.join(webRoot, "src/lib/i18n/messages/zh-TW/common.ts");
    if (root === "page") {
        // page.* is split across three spread files; use the one that already owns page.<module>.
        const mod = key.split(".")[1];
        for (const f of ["page-primary.ts", "page-secondary-a.ts", "page-secondary-b.ts"]) {
            const full = path.join(webRoot, "src/lib/i18n/messages/zh-TW", f);
            const src = fs.readFileSync(full, "utf8");
            const rs = rootStartFor(src, full, "zh-TW");
            if (findObjectBody(src, [mod], rs).matched) return full;
        }
        return path.join(webRoot, "src/lib/i18n/messages/zh-TW/page-secondary-b.ts");
    }
    return path.join(webRoot, "src/lib/i18n/messages/zh-TW/shell.ts");
}

/** Find the [start,end) of the object literal body for a dotted path inside source text. */
function findObjectBody(src, segments, rootStart) {
    let start = rootStart; // index right after the opening "{"
    let end = matchBrace(src, start - 1);
    for (const seg of segments) {
        const re = new RegExp(`(^|[\\s,{])(?:"${seg}"|'${seg}'|${seg})\\s*:\\s*\\{`, "gm");
        re.lastIndex = start;
        let m;
        let found = -1;
        while ((m = re.exec(src)) && m.index < end) {
            // must be a direct child: depth between start and m.index equals 0
            if (depthBetween(src, start, m.index) === 0) {
                found = m.index + m[0].length;
                break;
            }
        }
        if (found < 0) return { start, end, matched: false, seg };
        start = found;
        end = matchBrace(src, found - 1);
    }
    return { start, end, matched: true };
}

function matchBrace(src, openIdx) {
    let depth = 0;
    let inStr = null;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (c === "\\") i++;
            else if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") inStr = c;
        else if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error("unbalanced braces");
}

function depthBetween(src, a, b) {
    let depth = 0;
    let inStr = null;
    for (let i = a; i < b; i++) {
        const c = src[i];
        if (inStr) {
            if (c === "\\") i++;
            else if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") inStr = c;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
    }
    return depth;
}

function lineIndent(src, idx) {
    const ls = src.lastIndexOf("\n", idx - 1) + 1;
    return src.slice(ls, idx).match(/^\s*/)[0];
}

function toLiteral(obj, indent, step) {
    const lines = [];
    for (const [k, v] of Object.entries(obj)) {
        const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        if (typeof v === "string") lines.push(`${indent}${key}: ${JSON.stringify(v)},`);
        else lines.push(`${indent}${key}: {`, ...toLiteral(v, indent + step, step), `${indent}},`);
    }
    return lines;
}

function rootStartFor(src, file, _locale) {
    let m;
    if (file.endsWith("index.ts")) m = src.match(/export const \w+Messages = \{/);
    else m = src.match(/export const \w+ = \{/);
    if (!m) throw new Error(`no root object in ${file}`);
    return m.index + m[0].length;
}

let total = 0;
const skipped = [];
for (const locale of LOCALES) {
    // group by file
    const byFile = new Map();
    for (const [key, value] of additions[locale]) {
        if (has(existing[locale], key)) {
            skipped.push(`${locale}:${key}`);
            continue;
        }
        const file = localeFile(locale, key);
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push([key, value]);
    }
    for (const [file, entries] of byFile) {
        let src = fs.readFileSync(file, "utf8");
        const step = src.match(/^([ \t]+)\w+\s*:/m)?.[1] ?? "    ";
        for (const [key, value] of entries) {
            let segs = key.split(".");
            // zh-TW split files: strip the root segment represented by the file itself
            if (locale === "zh-TW") {
                if (segs[0] === "common" || segs[0] === "page") segs = segs.slice(1);
                else {
                    // shell.ts exports zhTWLayout / zhTWSearch / zhTWSettings / zhTWShortcuts
                    const exportName = { layout: "zhTWLayout", search: "zhTWSearch", settings: "zhTWSettings", shortcuts: "zhTWShortcuts" }[segs[0]];
                    if (!exportName) throw new Error(`zh-TW root ${segs[0]} unsupported`);
                    const re = new RegExp(`export const ${exportName} = \\{`);
                    const mm = src.match(re);
                    if (!mm) throw new Error(`no ${exportName}`);
                    segs = segs.slice(1);
                    insert(mm.index + mm[0].length);
                    continue;
                }
            }
            insert(rootStartFor(src, file, locale));

            function insert(rootStart) {
                const parents = segs.slice(0, -1);
                const loc = findObjectBody(src, parents, rootStart);
                let rest;
                if (loc.matched) rest = [segs[segs.length - 1]];
                else rest = parents.slice(parents.indexOf(loc.seg)).concat(segs[segs.length - 1]);
                // build nested literal for remaining path
                let obj = value;
                for (let i = rest.length - 1; i >= 0; i--) obj = { [rest[i]]: obj };
                const closeIdx = loc.end; // index of "}"
                const indent = lineIndent(src, closeIdx) + step;
                const text = toLiteral(obj, indent, step).join("\n") + "\n";
                // insert before the closing brace line
                const lineStart = src.lastIndexOf("\n", closeIdx - 1) + 1;
                const before = src.slice(0, lineStart);
                const needsComma = !/[,{]\s*$/.test(before.trimEnd()) ? "," : "";
                src = before.replace(/\s*$/, (ws) => needsComma + ws) + text + src.slice(lineStart);
                total++;
            }
        }
        if (!dry) fs.writeFileSync(file, src);
    }
}

console.log(`[md3-i18n] ${dry ? "would insert" : "inserted"} ${total} leaves from ${files.length} batch file(s); skipped ${skipped.length} existing.`);
if (skipped.length) console.log("  skipped:", skipped.slice(0, 20).join(", "), skipped.length > 20 ? "…" : "");
