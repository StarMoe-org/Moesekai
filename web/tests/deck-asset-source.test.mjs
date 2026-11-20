import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const readWeb = (relativePath) => readFileSync(path.join(webRoot, relativePath), "utf8");

function compileWebModule(relativePath, resolveImport) {
    const output = ts.transpileModule(readWeb(relativePath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
        },
    }).outputText;
    const mod = { exports: {} };
    new Function("require", "exports", "module", output)(resolveImport, mod.exports, mod);
    return mod.exports;
}

test("SekaiCardThumbnail uses explicit assetSource region instead of global server-source", () => {
    const prevWindow = globalThis.window;
    const prevLocalStorage = globalThis.localStorage;
    globalThis.window = { location: { pathname: "/" } };
    globalThis.localStorage = { getItem: (key) => (key === "server-source" ? "cn" : null) };

    try {
        const assets = compileWebModule("src/lib/assets.ts", (id) => {
            if (id === "@/contexts/ThemeContext") return {};
            if (id === "@/lib/assetDomains") {
                return { ASSET_DOMAIN_MAIN: "https://main.example", ASSET_DOMAIN_BACKUP: "https://backup.example" };
            }
            if (id === "@/lib/locale-routing") {
                return { defaultContentRegionForPathname: () => "cn" };
            }
            return require(id);
        });

        const { default: SekaiCardThumbnail } = compileWebModule("src/components/cards/SekaiCardThumbnail.tsx", (id) => {
            if (id === "react") return React;
            if (id === "@/types/types") return { getRarityNumber: () => 4 };
            if (id === "@/lib/assets") return assets;
            if (id === "@/contexts/ThemeContext") return { useTheme: () => ({ assetSource: "main" }) };
            return require(id);
        });

        const sampleCard = {
            id: 9999,
            characterId: 1,
            assetbundleName: "res001_no999",
            cardRarityType: "rarity_4",
            attr: "cool",
        };

        const defaultHtml = renderToStaticMarkup(React.createElement(SekaiCardThumbnail, { card: sampleCard, trained: true }));
        assert.match(defaultHtml, /https:\/\/main\.example\/sekai-cn-assets\/thumbnail\/chara\/res001_no999_after_training\.webp/);

        const jpHtml = renderToStaticMarkup(
            React.createElement(SekaiCardThumbnail, { card: sampleCard, trained: true, assetSource: "main-jp" }),
        );
        assert.match(jpHtml, /https:\/\/main\.example\/sekai-jp-assets\/thumbnail\/chara\/res001_no999_after_training\.webp/);

        const backupJpHtml = renderToStaticMarkup(
            React.createElement(SekaiCardThumbnail, { card: sampleCard, trained: false, assetSource: "backup-jp" }),
        );
        assert.match(backupJpHtml, /https:\/\/backup\.example\/sekai-jp-assets\/thumbnail\/chara\/res001_no999_normal\.webp/);
    } finally {
        globalThis.window = prevWindow;
        globalThis.localStorage = prevLocalStorage;
    }
});

test("SekaiCardThumbnail resets image error state when the resolved URL changes", () => {
    const source = readWeb("src/components/cards/SekaiCardThumbnail.tsx");
    assert.match(source, /const \[failedUrl, setFailedUrl\] = React\.useState<string \| null>\(null\)/);
    assert.match(source, /const imageError = failedUrl === cardImageUrl/);
    assert.match(source, /onError=\{\(\) => setFailedUrl\(cardImageUrl\)\}/);
});

test("deck builders, selectors, and account card views bind assetSource to their masterdata server", () => {
    const deckRecommend = readWeb("src/app/deck-recommend/client.tsx");
    assert.match(deckRecommend, /replaceAssetSourceRegion\(assetSource, "jp"\)/);
    assert.match(deckRecommend, /<ActiveRulesSummary[\s\S]*assetSource=\{cardAssetSource\}/);
    assert.match(deckRecommend, /<CustomRulesModal[\s\S]*assetSource=\{cardAssetSource\}/);
    assert.match(deckRecommend, /<CardSelectorModal[\s\S]*assetSource=\{cardAssetSource\}/);
    assert.match(deckRecommend, /<SekaiCardThumbnail[\s\S]*assetSource=\{assetSource\}/);

    const countThumbnailsWithAssetSource = (filePath) => {
        const sourceFile = ts.createSourceFile(filePath, readWeb(filePath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        let total = 0;
        let withAssetSource = 0;
        const visit = (node) => {
            if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === "SekaiCardThumbnail") {
                total += 1;
                if (node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sourceFile) === "assetSource")) {
                    withAssetSource += 1;
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        return { total, withAssetSource };
    };

    const activeRules = countThumbnailsWithAssetSource("src/components/deck-recommend/ActiveRulesSummary.tsx");
    assert.deepEqual(activeRules, { total: 3, withAssetSource: 3 });

    const customRules = countThumbnailsWithAssetSource("src/components/deck-recommend/CustomRulesModal.tsx");
    assert.deepEqual(customRules, { total: 6, withAssetSource: 6 });

    const cardSelector = countThumbnailsWithAssetSource("src/components/cards/CardSelectorModal.tsx");
    assert.deepEqual(cardSelector, { total: 1, withAssetSource: 1 });

    const eventSelector = readWeb("src/components/deck-recommend/EventSelector.tsx");
    assert.match(eventSelector, /replaceAssetSourceRegion\(themeAssetSource, server\)/);

    const musicSelector = readWeb("src/components/deck-recommend/MusicSelector.tsx");
    assert.match(musicSelector, /replaceAssetSourceRegion\(themeAssetSource, server\)/);

    const deckPicker = readWeb("src/components/planner/DeckPicker.tsx");
    assert.match(deckPicker, /replaceAssetSourceRegion\(assetSource, "jp"\)/);
    assert.match(deckPicker, /<SekaiCardThumbnail\b[^>]*assetSource=\{cardAssetSource\}/);

    const scoreControl = readWeb("src/app/score-control/client.tsx");
    assert.match(scoreControl, /replaceAssetSourceRegion\(assetSource, "jp"\)/);
    assert.match(scoreControl, /<SekaiCardThumbnail[\s\S]*assetSource=\{jpAssetSource\}/);
    assert.match(scoreControl, /getMusicJacketUrl\(song\.assetbundleName, jpAssetSource\)/);

    const profileDeck = readWeb("src/components/profile/ProfileDeck.tsx");
    assert.match(profileDeck, /replaceAssetSourceRegion\(assetSource, account\.server\)/);
    assert.match(profileDeck, /<SekaiCardThumbnail[\s\S]*assetSource=\{accountAssetSource\}/);

    const profileHero = readWeb("src/components/profile/ProfileHeroCard.tsx");
    assert.match(profileHero, /replaceAssetSourceRegion\(themeAssetSource, account\.server\)/);

    const myCards = readWeb("src/app/my-cards/client.tsx");
    assert.match(myCards, /replaceAssetSourceRegion\(assetSource, activeAccount\.server\)/);
    assert.match(myCards, /<SekaiCardThumbnail[\s\S]*assetSource=\{assetSource\}/);
});
