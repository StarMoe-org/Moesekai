#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { formatLine, SRC_ROOT, WEB_ROOT, toPosixPath, walkSourceFiles } from "./i18n-utils.mjs";

const HAN_RE = /[\p{Script=Han}]/u;

const ALLOWLIST = new Map([
    ["src/lib/i18n/messages/zh-CN/index.ts", "zh-CN dictionary source"],
    ["src/lib/i18n/messages/zh-TW/common.ts", "Traditional Chinese (TW) shared message source"],
    ["src/lib/i18n/messages/zh-TW/shell.ts", "Traditional Chinese (TW) layout and settings message source"],
    ["src/lib/i18n/messages/zh-TW/page-primary.ts", "Traditional Chinese (TW) primary page message source"],
    ["src/lib/i18n/messages/zh-TW/page-secondary-a.ts", "Traditional Chinese (TW) personal and tool page message source"],
    ["src/lib/i18n/messages/zh-TW/page-secondary-b.ts", "Traditional Chinese (TW) preview and media page message source"],
    ["src/lib/i18n/messages/en-US/index.ts", "English dictionary may contain donor names, Japanese source labels, and masterdata translation maps"],
    ["src/lib/i18n/messages/ja-JP/index.ts", "Japanese dictionary source may contain kanji and project names"],
    ["src/lib/i18n/messages/ko-KR/index.ts", "Korean dictionary may contain donor names, Japanese source labels, and masterdata translation maps"],
    ["src/lib/i18n/messages/zh-CN/mysekai-workspace.ts", "Simplified Chinese MYSEKAI workspace dictionary"],
    ["src/lib/i18n/messages/zh-TW/mysekai-workspace.ts", "Traditional Chinese MYSEKAI workspace dictionary"],
    ["src/lib/i18n/messages/ja-JP/mysekai-workspace.ts", "Japanese MYSEKAI workspace dictionary"],
    ["src/lib/i18n/locales.ts", "Locale native names shown in the language switcher"],
    ["src/lib/seo-keywords.ts", "Localized SEO copy and Chinese keyword strategy"],
    ["src/lib/seo-zh-tw.ts", "Traditional Chinese (TW) SEO copy"],
    ["src/lib/structured-data.ts", "Localized structured-data aliases for Project SEKAI"],
    ["src/app/privacy/page.tsx", "Legal/content page pending product localization decision"],
    ["src/app/terms/page.tsx", "Legal/content page pending product localization decision"],
    ["src/app/patreon/page.tsx", "Sponsor/content page pending product localization decision"],
    ["src/app/design-system/client.tsx", "Development-only design-system demo route"],
    ["src/lib/oldComicTips.ts", "Official comic titles and source tips"],
    ["src/lib/mysekai-i18n.ts", "Masterdata-derived MySekai translation map"],
    ["src/lib/songConstants.ts", "Official song aliases and search correction data"],
    ["src/lib/lyrics-performers.ts", "Audited nonvisual persisted performer source IDs shared with the lyrics producer"],
    ["src/types/types.ts", "Project SEKAI official unit and character names plus legacy type constants"],
    ["src/lib/storyLoader.ts", "Masterdata and story translation fallback map"],
    ["src/lib/team-links.ts", "Team members and official organization links"],
    ["src/vendor/sekai-sus2img/renderer.ts", "Vendored upstream chart renderer (GPL-3); Japanese 譜面確認 label matches the in-game chart-check convention"],
    ["src/components/seo/DetailSemanticSeoShell.tsx", "Project SEKAI crawler semantic shell fact taxonomy and stat tables"],
]);

const COMMENT_ONLY_ALLOWLIST = new Map([
    ["src/app/realtime-ranking-next/_components/ChangeTime.tsx", "Comments describing time format"],
    ["src/app/realtime-ranking-next/u/[userId]/client.tsx", "Comments about source feed"],
    ["src/lib/deck-engine/wasm-loader.ts", "Comments describing WASM loader internals"],
    ["src/app/deck-recommend/client.tsx", "Comments describing deck recommendation page internals"],
    ["src/lib/deck-recommend/engine-worker.ts", "Comments describing deck engine worker internals"],
    ["src/lib/deck-recommend/engine-types.ts", "Comments describing deck engine worker contract"],
    ["src/lib/deck-recommend/engine-options.ts", "Comments describing the engine option mapping"],
    ["src/lib/deck-recommend/worker-args.ts", "Comments describing the deck worker argument mapping"],
    ["src/components/deck-recommend/CardPickerModal.tsx", "Comments describing the deck card picker internals"],
    ["src/lib/deck-engine/wasm-version.ts", "Generated file header comment"],
    ["src/lib/score-control/score-control-calculator.ts", "Comments describing the score control rounding contract"],
]);

function isCommentOnlyLine(line) {
    const trimmed = line.trim();
    return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("*/") || trimmed.startsWith("{/*") || line.includes("//");
}

const violations = [];
const allowedHits = new Map();

for (const filePath of walkSourceFiles(SRC_ROOT)) {
    const relative = toPosixPath(path.relative(WEB_ROOT, filePath));
    const fullAllowReason = ALLOWLIST.get(relative);
    if (fullAllowReason) {
        allowedHits.set(relative, fullAllowReason);
        continue;
    }

    const commentAllowReason = COMMENT_ONLY_ALLOWLIST.get(relative);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
        if (!HAN_RE.test(line)) return;
        if (commentAllowReason && isCommentOnlyLine(line)) {
            allowedHits.set(relative, commentAllowReason);
            return;
        }
        violations.push(formatLine(filePath, index + 1, line.trim()));
    });
}

if (violations.length > 0) {
    console.error(`Hardcoded Han text found in non-allowlisted UI/source lines (${violations.length}):`);
    for (const violation of violations) console.error(`  ${violation}`);
    console.error("\nIf this is intentional, add a reasoned allowlist entry in scripts/scan-hardcoded-ui-text.mjs.");
    process.exit(1);
}

console.log(`Hardcoded UI Han scan OK (${allowedHits.size} allowlisted file groups).`);
