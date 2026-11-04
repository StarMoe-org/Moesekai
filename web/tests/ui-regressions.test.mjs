import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const readWeb = (relativePath) => readFileSync(path.join(webRoot, relativePath), "utf8");
const modules = new Map();
function loadMessages(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", compiled)((id) => {
        if (id.startsWith(".")) {
            const base = path.resolve(path.dirname(filename), id);
            const resolved = [base + ".ts", path.join(base, "index.ts")].find(existsSync);
            assert.ok(resolved, `Cannot resolve ${id}`);
            return loadMessages(resolved);
        }
        return require(id);
    }, exports);
    return exports;
}

test("all five UI locales contain nonempty scoped view, filter range and home customization labels", () => {
    for (const [locale, exportName] of Object.entries({ "en-US": "enUSMessages", "ja-JP": "jaJPMessages", "ko-KR": "koKRMessages", "zh-CN": "zhCNMessages", "zh-TW": "zhTWMessages" })) {
        const messages = loadMessages(path.join(webRoot, `src/lib/i18n/messages/${locale}/index.ts`))[exportName];
        const groups = [
            ["common.view", messages.common.view, ["grid", "table", "label"]],
            ["common.filter", messages.common.filter, ["difficultyRange", "minimum", "maximum", "difficultiesHint", "sortDifficulty"]],
            ["page.home.customize", messages.page.home.customize, ["open", "title", "description", "moveUp", "moveDown", "reset"]],
            ["page.honors.badgeVariant", messages.page.honors.badgeVariant, ["label", "main", "sub"]],
        ];
        for (const [prefix, group, keys] of groups) {
            assert.ok(group, `${locale} ${prefix}`);
            for (const key of keys) {
                assert.equal(typeof group[key], "string", `${locale} ${prefix}.${key}`);
                assert.ok(group[key].trim(), `${locale} ${prefix}.${key} must not be blank`);
            }
        }
    }
});

test("mobile navbar keeps the keyboard shortcut help inside a desktop-only wrapper", () => {
    const source = ts.createSourceFile("MainNavbar.tsx", readWeb("src/components/MainNavbar.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = false;
    function visit(node) {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "IconButton" && node.attributes.getText(source).includes("icon={mdKeyboard}")) {
            found = true;
            const wrapper = node.parent;
            assert.ok(ts.isJsxElement(wrapper));
            assert.match(wrapper.openingElement.attributes.getText(source), /className="hidden md:block"/);
            assert.match(node.attributes.getText(source), /onClick=\{onShortcutsHelpToggle\}/);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(found, "keyboard shortcut help remains available on desktop");
});

test("story entry cards use primary/surface styling rather than tertiary actions", () => {
    const source = readWeb("src/app/story/client.tsx");
    assert.match(source, /<Card\b[^>]*variant="filled"/);
    assert.match(source, /bg-primary-container text-on-primary-container/);
    assert.doesNotMatch(source, /(?:bg-|text-|color=")tertiary/);
});

test("card filter thumbnail choice shares the global preference setter", () => {
    const source = readWeb("src/components/cards/CardFilters.tsx");
    assert.match(source, /const \{ useTrainedThumbnail, setUseTrainedThumbnail \} = useTheme\(\)/);
    assert.match(source, /value=\{useTrainedThumbnail \? "trained" : "normal"\}/);
    assert.match(source, /onValueChange=\{\(value\) => setUseTrainedThumbnail\(value === "trained"\)\}/);
    assert.doesNotMatch(source, /useState|localStorage|sessionStorage/);
});

test("card tables show both available artworks, without inventing missing normal or trained art", () => {
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const compile = (relativePath, resolve) => {
        const output = ts.transpileModule(readWeb(relativePath), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
        }).outputText;
        const exports = {};
        new Function("require", "exports", output)(resolve, exports);
        return exports;
    };
    const types = compile("src/types/types.ts", id => id === "@/lib/theme-seeds" ? { THEME_SEED_COLORS: {} } : require(id));
    const { default: CardGrid } = compile("src/components/cards/CardGrid.tsx", (id) => {
        if (id === "react") return React;
        if (id === "@/types/types") return types;
        if (id === "@/contexts/I18nContext") return { useI18n: () => ({ t: key => key, formatDate: String }) };
        if (id === "@/lib/i18n") return { getCharacterName: () => "Character" };
        if (id === "./DatabaseTable") return { __esModule: true, default: ({ rows }) => React.createElement("div", null, rows.map(row => React.createElement("div", { key: row.id, "data-card": row.id }, row.thumbnail))) };
        if (id === "./SekaiCardThumbnail") return { __esModule: true, default: ({ trained }) => React.createElement("img", { "data-trained": String(trained) }) };
        if (id === "@/components/common/TranslatedText") return { TranslatedText: () => null };
        if (id === "@/hooks/useGridReflowAnimation") return { useGridReflowAnimation: () => () => {} };
        return { __esModule: true, default: () => null };
    });
    const base = { id: 1, cardRarityType: "rarity_4", specialTrainingPower1BonusFixed: 1, specialTrainingPower2BonusFixed: 0, specialTrainingPower3BonusFixed: 0 };
    const artworks = card => [...renderToStaticMarkup(React.createElement(CardGrid, { cards: [card], view: "table" })).matchAll(/data-trained="(true|false)"/g)].map(match => match[1]);
    assert.deepEqual(artworks(base), ["false", "true"]);
    assert.deepEqual(artworks({ ...base, initialSpecialTrainingStatus: "done" }), ["true"]);
    assert.deepEqual(artworks({ ...base, specialTrainingPower1BonusFixed: 0 }), ["false"]);
    assert.deepEqual(artworks({ ...base, cardRarityType: "rarity_birthday" }), ["false"]);
});

test("honor detail dialogs toggle between main and sub badge previews and export filenames", async () => {
    const { JSDOM } = require("jsdom");
    const React = require("react");
    const { act } = React;
    const { createRoot } = require("react-dom/client");
    const { renderToStaticMarkup } = require("react-dom/server");

    const compile = (relativePath, resolve) => {
        const output = ts.transpileModule(readWeb(relativePath), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
        }).outputText;
        const exports = {};
        new Function("require", "exports", output)(resolve, exports);
        return exports;
    };

    let lastPreviewFileName = "";
    const makeResolve = () => (id) => {
        if (id === "react") return React;
        if (id === "@/contexts/I18nContext") return { useI18n: () => ({ t: (key) => key }) };
        if (id === "@/lib/i18n") return { getCharacterName: (_t, charId) => `Chara${charId}` };
        if (id === "@/hooks/useSvgPreviewActions") {
            return {
                useSvgPreviewActions: ({ fileName }) => {
                    lastPreviewFileName = fileName;
                    return { headerActions: null, errorMessage: null };
                },
            };
        }
        if (id === "@/components/common/Modal") {
            return {
                __esModule: true,
                default: ({ isOpen, children }) => (isOpen ? React.createElement("div", { "data-modal": "open" }, children) : null),
            };
        }
        if (id === "@/components/md3") {
            return {
                SegmentedButton: ({ value, onValueChange, options }) =>
                    React.createElement(
                        "div",
                        { role: "radiogroup" },
                        options.map((opt) =>
                            React.createElement(
                                "button",
                                {
                                    key: opt.value,
                                    type: "button",
                                    "data-segment": opt.value,
                                    "aria-checked": String(value === opt.value),
                                    onClick: () => onValueChange(opt.value),
                                },
                                opt.label,
                            ),
                        ),
                    ),
            };
        }
        if (id === "./DegreeImage") {
            return {
                __esModule: true,
                default: ({ sub = false, honorLevel }) =>
                    React.createElement("svg", { "data-degree-sub": String(sub), "data-level": String(honorLevel ?? "") }),
            };
        }
        if (id === "./BondsDegreeImage") {
            return {
                __esModule: true,
                default: ({ sub = false }) => React.createElement("svg", { "data-bonds-sub": String(sub) }),
            };
        }
        return require(id);
    };

    const { default: HonorDetailDialog } = compile("src/components/honor/HonorDetailDialog.tsx", makeResolve());
    const { default: BondsHonorDetailDialog } = compile("src/components/honor/BondsHonorDetailDialog.tsx", makeResolve());

    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    const prevActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    try {
        const container = dom.window.document.getElementById("root");
        const root = createRoot(container);

        const sampleHonor = {
            id: 42,
            seq: 1,
            groupId: 10,
            name: "TestHonor",
            honorRarity: "high",
            levels: [
                { honorId: 42, level: 1, bonus: 10, description: "Lv1", assetbundleName: "honor_lv1" },
            ],
        };

        await act(async () => {
            root.render(React.createElement(HonorDetailDialog, { open: true, onClose: () => {}, honor: sampleHonor }));
        });
        assert.equal(lastPreviewFileName, "TestHonor_42");
        assert.deepEqual(
            [...container.querySelectorAll("svg[data-degree-sub]")].map((el) => el.getAttribute("data-degree-sub")),
            ["false", "false"],
        );

        await act(async () => {
            container.querySelector('button[data-segment="sub"]').click();
        });
        assert.equal(lastPreviewFileName, "TestHonor_42_sub");
        assert.deepEqual(
            [...container.querySelectorAll("svg[data-degree-sub]")].map((el) => el.getAttribute("data-degree-sub")),
            ["true", "true"],
        );

        const sampleBondsHonor = {
            id: 99,
            seq: 1,
            bondsGroupId: 5,
            gameCharacterUnitId1: 1,
            gameCharacterUnitId2: 2,
            honorRarity: "middle",
            name: "TestBonds",
            levels: [{ id: 1, bondsHonorId: 99, level: 1, description: "Lv1" }],
        };
        const gameCharaUnits = [
            { id: 1, gameCharacterId: 1, unit: "light_sound", colorCode: "#33aaee", skinColorCode: "#fff", skinShadowColorCode: "#ccc" },
            { id: 2, gameCharacterId: 2, unit: "light_sound", colorCode: "#ffdd44", skinColorCode: "#fff", skinShadowColorCode: "#ccc" },
        ];

        await act(async () => {
            root.render(React.createElement(BondsHonorDetailDialog, { open: true, onClose: () => {}, bondsHonor: sampleBondsHonor, gameCharaUnits }));
        });
        assert.equal(lastPreviewFileName, "TestBonds_99");
        assert.equal(container.querySelector("svg[data-bonds-sub]").getAttribute("data-bonds-sub"), "false");

        await act(async () => {
            container.querySelector('button[data-segment="sub"]').click();
        });
        assert.equal(lastPreviewFileName, "TestBonds_99_sub");
        assert.equal(container.querySelector("svg[data-bonds-sub]").getAttribute("data-bonds-sub"), "true");

        await act(async () => {
            root.unmount();
        });

        const { default: RealBondsDegreeImage } = compile("src/components/honor/BondsDegreeImage.tsx", (id) => {
            if (id === "react") return React;
            if (id === "@/lib/assets") {
                return {
                    getBondsHonorCharacterUrl: () => "https://example.com/chara.webp",
                    getBondsHonorWordUrl: () => "https://example.com/word.webp",
                    getHonorFrameUrl: () => "https://example.com/frame.webp",
                    getHonorLevelIconUrl: () => "https://example.com/lv.webp",
                };
            }
            return require(id);
        });
        const twoBadgesMarkup = renderToStaticMarkup(
            React.createElement(
                "div",
                null,
                React.createElement(RealBondsDegreeImage, { bondsHonor: sampleBondsHonor, gameCharaUnits, sub: true }),
                React.createElement(RealBondsDegreeImage, { bondsHonor: sampleBondsHonor, gameCharaUnits, sub: true }),
            ),
        );
        const maskIds = [...twoBadgesMarkup.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(maskIds.length, 6);
        assert.equal(new Set(maskIds).size, 6, "duplicate BondsDegreeImage instances must not share SVG mask IDs");
    } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
        globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }
});
