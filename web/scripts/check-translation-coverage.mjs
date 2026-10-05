import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");

function readWeb(relativePath) {
    return fs.readFileSync(path.join(WEB_ROOT, relativePath), "utf8");
}

const coverage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "docs/translation-coverage.json"), "utf8"));
const markdown = fs.readFileSync(path.join(REPO_ROOT, "docs/translation-coverage.md"), "utf8");
const entriesById = new Map(coverage.entries.map((entry) => [entry.id, entry]));
const requiredEntryFields = [
    "id",
    "routes",
    "components",
    "sourceType",
    "sourceFiles",
    "fields",
    "stableId",
    "backendMapping",
    "zh",
    "en",
    "status",
    "exclusion",
];

assert.equal(entriesById.size, coverage.entries.length, "coverage IDs must be unique");
for (const entry of coverage.entries) {
    for (const field of requiredEntryFields) {
        assert.ok(field in entry, `${entry.id} is missing ${field}`);
    }
}

const counts = coverage.entries.reduce((result, entry) => {
    result[entry.status] = (result[entry.status] ?? 0) + 1;
    return result;
}, {});
assert.deepEqual(coverage.summary, {
    entries: coverage.entries.length,
    covered: counts.covered ?? 0,
    partial: counts.partial ?? 0,
    requiredUncovered: counts["required-uncovered"] ?? 0,
    officialRegional: counts["official-regional"] ?? 0,
    excluded: counts.excluded ?? 0,
    nontext: counts.nontext ?? 0,
});
assert.ok((counts["required-uncovered"] ?? 0) > 0, "required gaps must prevent a full-coverage claim");
assert.match(markdown, /no full-coverage claim/i);

const translationSource = readWeb("src/lib/translations.ts");
const translationInterface = translationSource.slice(
    translationSource.indexOf("export interface TranslationData"),
    translationSource.indexOf("// Default empty translation data"),
);
const translationCategories = [...translationInterface.matchAll(/^    ([A-Za-z][A-Za-z0-9]*): \{$/gm)]
    .map((match) => match[1]);
assert.ok(translationCategories.length > 0, "TranslationData categories must be source-derived");
for (const category of translationCategories) {
    const artifact = `translation/${category}.json`;
    assert.ok(
        coverage.entries.some((entry) => entry.sourceFiles.some((sourceFile) => sourceFile.includes(artifact))),
        `TranslationData category ${category} is absent from the inventory`,
    );
}

const configPath = ts.findConfigFile(WEB_ROOT, ts.sys.fileExists, "tsconfig.json");
assert.ok(configPath, "tsconfig.json is required for source-derived masterdata coverage");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, WEB_ROOT);
const program = ts.createProgram(parsedConfig.fileNames, {
    ...parsedConfig.options,
    noEmit: true,
});
const checker = program.getTypeChecker();

function typeSymbols(type) {
    const nonNullable = checker.getNonNullableType(type);
    if (nonNullable.isUnion()) return nonNullable.types.flatMap(typeSymbols);
    const symbol = nonNullable.aliasSymbol ?? nonNullable.getSymbol();
    return symbol ? [symbol] : [];
}

function isStringLike(type) {
    const nonNullable = checker.getNonNullableType(type);
    if (nonNullable.isUnion()) return nonNullable.types.every(isStringLike);
    return Boolean(nonNullable.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral));
}

function isRenderedInJsx(node) {
    for (let current = node.parent; current; current = current.parent) {
        if (ts.isJsxExpression(current) || ts.isJsxAttribute(current)) return true;
        if (ts.isStatement(current) || ts.isFunctionLike(current)) return false;
    }
    return false;
}

const masterdataFamilies = new Map();
const NON_CONTENT_STRING_FIELDS = new Set([
    "attr",
    "assetbundleName",
    "assetbundleFileName",
    "birthday",
    "colorCode",
    "durationSourceKey",
    "gender",
    "height",
    "iconAssetbundleName",
    "musicDifficulty",
    "scenarioId",
    "supportUnit",
    "unit",
]);
function isContentStringField(field) {
    return !NON_CONTENT_STRING_FIELDS.has(field)
        && !field.endsWith("Type")
        && !field.endsWith("Rarity")
        && !field.endsWith("Platform");
}
const webSrcPrefix = path.join(WEB_ROOT, "src").replace(/\\/g, "/");
const projectSources = program.getSourceFiles().filter((sourceFile) =>
    sourceFile.fileName.replace(/\\/g, "/").startsWith(webSrcPrefix)
    && !sourceFile.isDeclarationFile
);

for (const sourceFile of projectSources) {
    function collectFetches(node) {
        if (
            ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === "fetchMasterData"
            && node.typeArguments?.length === 1
            && node.arguments.length > 0
            && ts.isStringLiteralLike(node.arguments[0])
        ) {
            const requestedType = checker.getTypeFromTypeNode(node.typeArguments[0]);
            const itemType = checker.getIndexTypeOfType(requestedType, ts.IndexKind.Number) ?? requestedType;
            const symbols = typeSymbols(itemType);
            if (symbols.length > 0) {
                const masterdataFile = node.arguments[0].text;
                const family = masterdataFamilies.get(masterdataFile) ?? {
                    sourceFile: masterdataFile,
                    symbols: new Set(),
                    stringFields: new Set(),
                    renderedFields: new Set(),
                };
                for (const symbol of symbols) family.symbols.add(symbol);
                for (const property of checker.getPropertiesOfType(itemType)) {
                    const propertyType = checker.getTypeOfSymbolAtLocation(property, node);
                    if (isStringLike(propertyType) && isContentStringField(property.name)) {
                        family.stringFields.add(property.name);
                    }
                }
                masterdataFamilies.set(masterdataFile, family);
            }
        }
        ts.forEachChild(node, collectFetches);
    }
    collectFetches(sourceFile);
}

for (const sourceFile of projectSources) {
    function collectRenderedFields(node) {
        if (ts.isPropertyAccessExpression(node) && isRenderedInJsx(node)) {
            const objectSymbols = new Set(typeSymbols(checker.getTypeAtLocation(node.expression)));
            for (const family of masterdataFamilies.values()) {
                if (
                    family.stringFields.has(node.name.text)
                    && [...family.symbols].some((symbol) => objectSymbols.has(symbol))
                ) {
                    family.renderedFields.add(node.name.text);
                }
            }
        }
        ts.forEachChild(node, collectRenderedFields);
    }
    collectRenderedFields(sourceFile);
}

const renderedMasterdataFamilies = [...masterdataFamilies.values()]
    .filter((family) => family.renderedFields.size > 0)
    .sort((left, right) => left.sourceFile.localeCompare(right.sourceFile));
const uncoveredMasterdataFamilies = [];
for (const family of renderedMasterdataFamilies) {
    const coveringEntries = coverage.entries.filter((entry) =>
        entry.sourceFiles.some((sourceFile) => sourceFile.includes(family.sourceFile))
    );
    if (coveringEntries.length === 0) {
        uncoveredMasterdataFamilies.push(`${family.sourceFile}: ${[...family.renderedFields].sort().join(", ")}`);
        continue;
    }
    const documentedFields = coveringEntries.flatMap((entry) => entry.fields).join(" ");
    const missingFields = [...family.renderedFields]
        .filter((field) => !new RegExp(`\\b${field}\\b`, "i").test(documentedFields))
        .sort();
    if (missingFields.length > 0) {
        uncoveredMasterdataFamilies.push(`${family.sourceFile}: undocumented fields ${missingFields.join(", ")}`);
    }
}
assert.deepEqual(uncoveredMasterdataFamilies, [], `rendered masterdata families are absent from coverage:\n${uncoveredMasterdataFamilies.join("\n")}`);

const soundtrackCoverage = entriesById.get("soundtrack-masterdata-text");
assert.ok(soundtrackCoverage, "soundtrack rendered masterdata text requires an explicit coverage entry");
for (const [sourceFile, fields] of [
    ["musicSoundTrackCategories.json", ["name"]],
    ["musicSoundTracks.json", ["title", "pronunciation"]],
]) {
    const family = masterdataFamilies.get(sourceFile);
    assert.ok(family, `${sourceFile} must be discovered from fetchMasterData`);
    for (const field of fields) {
        assert.ok(family.renderedFields.has(field), `${sourceFile}.${field} must be discovered from rendered source`);
        assert.ok(soundtrackCoverage.fields.some((documented) => documented.includes(field)), `${sourceFile}.${field} is undocumented`);
    }
    assert.ok(soundtrackCoverage.sourceFiles.some((documented) => documented.includes(sourceFile)), `${sourceFile} is undocumented`);
}

const storyRoot = path.join(WEB_ROOT, "src/app/story");
const storyFamilies = fs.readdirSync(storyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => ["event", "unit", "card", "area", "self", "special"].includes(name));
for (const family of storyFamilies) {
    assert.ok(entriesById.has(`${family}-story-lines`), `${family} story source has no coverage entry`);
}

const eventGroupSource = readWeb("src/app/story/event/[eventId]/client.tsx");
const eventGroupEntries = [entriesById.get("event-story-metadata"), entriesById.get("event-story-summaries")];
assert.ok(eventGroupEntries.every(Boolean), "event group metadata and summary entries are required");
const documentedEventFields = eventGroupEntries.flatMap((entry) => entry.fields).join(" ");
for (const field of ["title_jp", "title_cn", "outline_jp", "outline_cn", "summary_cn"]) {
    assert.match(eventGroupSource, new RegExp(`\\b${field}\\b`), `${field} is no longer an event group source field`);
    assert.match(documentedEventFields, new RegExp(`\\b${field}\\b`), `${field} is missing from event coverage`);
}

const lyricsSource = readWeb("src/lib/lyrics.ts");
const lyricsDetail = entriesById.get("lyrics-detail");
const lyricsIndex = entriesById.get("lyrics-index");
assert.ok(lyricsDetail && lyricsIndex, "lyrics index and detail entries are required");
for (const field of ["state", "japanese", "zh-CN", "en-US", "segments", "performerIds", "trailingPerformerIds", "ruby", "attribution", "attributions", "availableVersions", "gameProjection", "renditions", "kind", "label", "full", "game", "relation", "sourceTabPaths", "provenance", "translationCredits", "revision"]) {
    assert.match(lyricsSource, new RegExp(`\\b${field}\\b`));
    assert.ok(lyricsDetail.fields.some((documented) => documented.includes(field)), `lyrics detail omits ${field}`);
}
for (const field of ["musicId", "title", "revision", "updatedAt", "state", "availableVersions", "noLyricsReason"]) {
    assert.match(lyricsSource, new RegExp(`\\b${field}\\b`));
    assert.ok(lyricsIndex.fields.some((documented) => documented.includes(field)), `lyrics index omits ${field}`);
}

const lyricsPage = readWeb("src/app/lyrics/[musicId]/page.tsx");
const lyricsClient = readWeb("src/app/lyrics/[musicId]/client.tsx");
const lyricText = readWeb("src/components/lyrics/LyricText.tsx");
assert.match(lyricsPage, /fetchLyricsDocument/);
assert.match(lyricsPage, /isLyricsUnavailableError/);
assert.match(lyricsPage, /notFound\(\)/);
assert.match(lyricsClient, /lyrics\.attribution/);
assert.match(lyricsClient, /attributions\.map/);
assert.match(lyricsClient, /getLyricsDisplayLines\(lyrics, activeVersion(?:, [^)]+)?\)/);
assert.match(lyricText, /performers\.map\(\(performer\)/);
assert.match(lyricText, /<ruby/);
assert.match(lyricText, /<rt/);
assert.match(lyricText, /--performer-color/);
assert.match(lyricText, /--performer-gradient/);
assert.match(lyricText, /getLyricsPerformerColors\(id, surface\)/);
assert.match(lyricText, /attributeFilter: \["data-theme", "data-seed"\]/);

console.log(`Translation coverage source validation OK (${translationCategories.length} translation categories, ${renderedMasterdataFamilies.length} rendered masterdata families, ${storyFamilies.length} story families, ${coverage.entries.length} entries).`);
