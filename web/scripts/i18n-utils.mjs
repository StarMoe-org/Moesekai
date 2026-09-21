import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

export const WEB_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const SRC_ROOT = path.join(WEB_ROOT, "src");
export const MESSAGE_FILES = {
    "zh-CN": path.join(SRC_ROOT, "lib/i18n/messages/zh-CN/index.ts"),
    "zh-TW": path.join(SRC_ROOT, "lib/i18n/messages/zh-TW/index.ts"),
    "en-US": path.join(SRC_ROOT, "lib/i18n/messages/en-US/index.ts"),
    "ja-JP": path.join(SRC_ROOT, "lib/i18n/messages/ja-JP/index.ts"),
    "ko-KR": path.join(SRC_ROOT, "lib/i18n/messages/ko-KR/index.ts"),
};

export const MESSAGE_EXPORTS = {
    "zh-CN": "zhCNMessages",
    "zh-TW": "zhTWMessages",
    "en-US": "enUSMessages",
    "ja-JP": "jaJPMessages",
    "ko-KR": "koKRMessages",
};

export const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export function toPosixPath(filePath) {
    return filePath.split(path.sep).join("/");
}

export function walkSourceFiles(root = SRC_ROOT) {
    const results = [];
    const stack = [root];

    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }

            if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
                results.push(fullPath);
            }
        }
    }

    return results.sort();
}

export function flattenMessageKeys(value, prefix = "") {
    if (typeof value === "string") {
        return [prefix];
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        return flattenMessageKeys(child, nextPrefix);
    });
}

// Resolve the same module composition used by the application. In particular,
// adding a small message module must not silently disappear from lint/SEO tools.
// These are trusted local data modules; external imports and root escapes are
// rejected rather than exposing Node's general-purpose require inside the VM.
function loadMessageModule(filePath, cache = new Map()) {
    const absolute = path.resolve(filePath);
    const messageRoot = path.join(SRC_ROOT, "lib/i18n/messages");
    const relative = path.relative(messageRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(absolute) !== ".ts") {
        throw new Error(`Message import must stay inside the message tree: ${filePath}`);
    }
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const messageModule = { exports: {} };
    cache.set(absolute, messageModule);
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: absolute,
    });
    const localRequire = specifier => {
        if (typeof specifier !== "string" || !specifier.startsWith(".")) {
            throw new Error(`External message import is not allowed: ${specifier}`);
        }
        const candidate = path.resolve(path.dirname(absolute), specifier);
        const target = path.extname(candidate) ? candidate : `${candidate}.ts`;
        return loadMessageModule(target, cache);
    };
    vm.runInNewContext(outputText, { module: messageModule, exports: messageModule.exports, require: localRequire }, {
        filename: absolute, timeout: 5000,
    });
    return messageModule.exports;
}

export function loadMessageObject(filePath, exportName) {
    const messages = loadMessageModule(filePath)[exportName];
    if (!messages || typeof messages !== "object") {
        throw new Error(`Missing message export ${exportName} in ${filePath}`);
    }
    return messages;
}

export function loadAllMessages() {
    return Object.fromEntries(Object.entries(MESSAGE_FILES).map(([locale, filePath]) => [
        locale, loadMessageObject(filePath, MESSAGE_EXPORTS[locale]),
    ]));
}

export function formatLine(filePath, lineNumber, message) {
    return `${toPosixPath(path.relative(WEB_ROOT, filePath))}:${lineNumber}: ${message}`;
}
