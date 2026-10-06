#!/usr/bin/env node
/** Guard migrated UI against accidental dependence on the retired theme bridge.
 * Images, charts and game-data colors are outside this check; their fixed color
 * encodings are not theme roles. Multiplayer games keep separately scoped legacy CSS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(webRoot, "src");
const excluded = ["app/guess-who/multiplayer/", "app/guess-jacket/multiplayer/", "lib/i18n/messages/"];
const retiredClass = /(?:^|\s)(?:[\w-]+:)*(?:(?:bg|text|border|divide|ring|shadow|outline|from|via|to|fill|stroke)-(?:slate-\d+|miku(?:-dark)?|primary-text)(?:\/[^\s]+)?|(?:ios-glass|glass-card|liquid-glass|island)(?:-[\w-]+)?|material-(?:thin|regular|thick|chrome)|backdrop-blur(?:-[\w-]+)?|dark:[^\s]+|pressable|loading-spinner(?:-[\w-]+)?|type-(?:display|title|body|caption|on-glass))(?=\s|$)/;
const retiredVariable = /var\(--(?:color-(?:miku(?:-dark|-rgb)?|luka|primary-text)|theme-light|(?:surface|text|border|ring)-(?:base|soft|muted|strong|body)|accent-(?:soft|deep)|glass-[\w-]+|island-[\w-]+|material-[\w-]+)\b/;
const failures = [];
let checked = 0;

function report(relative, source, position, message) {
    const line = source.slice(0, position).split("\n").length;
    failures.push(`${relative}:${line}: ${message}`);
}
function scan(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, item.name);
        const relative = path.relative(sourceRoot, filename).replaceAll("\\", "/");
        if (excluded.some((prefix) => `${relative}/`.startsWith(prefix))) continue;
        if (item.isDirectory()) { scan(filename); continue; }
        if (!/\.(?:tsx?|css)$/.test(item.name) || /(?:\.generated\.ts|md3-schemes\.css|legacy-games\.css)$/.test(item.name)) continue;
        checked++;
        const source = fs.readFileSync(filename, "utf8");
        if (relative.endsWith(".css")) {
            // Comments document forbidden examples; only declarations are consumers.
            const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
            const match = retiredVariable.exec(css);
            if (match) report(relative, source, match.index, `retired CSS variable ${match[0]}`);
            continue;
        }
        const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
        function visit(node) {
            if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
                const value = node.text;
                const legacy = retiredClass.exec(value) ?? retiredVariable.exec(value);
                if (legacy) report(relative, source, node.getStart(ast), `retired theme token ${legacy[0].trim()}`);
            }
            ts.forEachChild(node, visit);
        }
        visit(ast);
    }
}
scan(sourceRoot);
if (fs.existsSync(path.join(sourceRoot, "styles/md3-legacy-bridge.css"))) failures.push("styles/md3-legacy-bridge.css: retired global bridge still exists");
if (failures.length) {
    console.error(failures.join("\n"));
    console.error(`MD3 migration guard failed (${failures.length} violations).`);
    process.exitCode = 1;
} else {
    console.log(`MD3 migration guard OK (${checked} files; legacy UI limited to the two multiplayer games).`);
}
