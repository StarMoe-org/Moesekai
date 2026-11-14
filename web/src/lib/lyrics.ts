import type { UiLocale } from "@/lib/i18n";
import { DEFAULT_PUBLIC_LYRICS_BASE_URL } from "@/lib/public-lyrics-base-url.mjs";
import { parseStrictJson } from "@/lib/strict-json.mjs";

const LYRICS_SCHEMA_VERSION_V1 = 1;
const LYRICS_SCHEMA_VERSION_V2 = 2;
const LYRICS_SCHEMA_VERSION_V3 = 3;
const LYRICS_SCHEMA_VERSION_V4 = 4;
const HTTP_NOT_FOUND = 404;
const IPV4_LOOPBACK_FIRST_OCTET = 127;
const IPV4_MAX_OCTET = 255;

export type LyricsTargetLocale = "zh-CN" | "en-US";
export type LyricsVersion = "full" | "game";
export type LyricsAvailableVersions = ["full"] | ["full", "game"] | ["game"];
export type LyricsPerformerID = number | string;
export type LyricsRenditionKind = "original" | "sekai" | "vocaloid" | "alternate";
export type LyricsRenditionRelationKind = "none" | "exact_projection";
export type LyricsAvailabilityState =
    | "complete"
    | "game_only"
    | "satisfied_no_lyrics"
    | "ambiguous"
    | "missing"
    | "incomplete"
    | "failed";
export type LyricsGameProjectionReason = "tagged_full_and_game" | "untagged_uncut_identity";
export type LyricsAttributionProvider = "vocaloid_fandom" | "moegirl" | "moegirl_public_exact" | "sekaipedia";

export interface ILyricsIndexEntry {
    musicId: number;
    revision: number;
    updatedAt: string;
    title: {
        "ja-JP": string;
        "zh-CN"?: string;
        "en-US"?: string;
    };
    state?: LyricsAvailabilityState;
    availableVersions?: LyricsAvailableVersions;
    noLyricsReason?: "catalog_instrumental";
}

export interface ILyricsIndex {
    version:
        | typeof LYRICS_SCHEMA_VERSION_V1
        | typeof LYRICS_SCHEMA_VERSION_V2
        | typeof LYRICS_SCHEMA_VERSION_V3
        | typeof LYRICS_SCHEMA_VERSION_V4;
    songs: ILyricsIndexEntry[];
}

export interface ILyricsRubySpan {
    text: string;
    reading?: string;
}

export interface ILyricsSegmentV1 {
    text: string;
    performerIds: number[];
}

export interface ILyricsSegmentV2 extends ILyricsSegmentV1 {
    ruby: ILyricsRubySpan[];
}

export type ILyricsSegment = ILyricsSegmentV1 | ILyricsSegmentV2 | ILyricsV3Segment;

export interface ILyricsDisplaySegment {
    text: string;
    performerIds: LyricsPerformerID[];
    ruby: ILyricsRubySpan[];
}

interface ILyricsLineBase {
    id: string;
    order: number;
    japanese: string;
    "zh-CN"?: string;
    "en-US"?: string;
    stanzaBreakBefore?: boolean;
}

export interface ILyricsLineV1 extends ILyricsLineBase {
    "zh-CN": string;
    "en-US": string;
    segments: ILyricsSegmentV1[];
}

export interface ILyricsLineV2 extends ILyricsLineBase {
    "zh-CN": string;
    "en-US": string;
    segments: ILyricsSegmentV2[];
    trailingPerformerIds?: number[];
}

export type ILyricsLine = ILyricsLineV1 | ILyricsLineV2 | ILyricsV3Line;

interface ILyricsDocumentBase {
    musicId: number;
    revision: number;
    updatedAt: string;
}

export interface ILyricsDocumentV1 extends ILyricsDocumentBase {
    version: typeof LYRICS_SCHEMA_VERSION_V1;
    attribution?: string;
    attributions?: ILyricsAttribution[];
    lines: ILyricsLineV1[];
}

export interface ILyricsAttribution {
    provider: LyricsAttributionProvider;
    title: string;
    revisionId: number;
    revisionUrl: string;
    licenseName: string;
    licenseUrl: string;
}

export interface ILyricsGameProjection {
    reasonCode: LyricsGameProjectionReason;
    lineIds: string[];
}

export interface ILyricsTranslationCredits {
    translation?: string;
    proofreading?: string;
}

export interface ILyricsDocumentV2 extends ILyricsDocumentBase {
    version: typeof LYRICS_SCHEMA_VERSION_V2;
    state: "complete" | "game_only";
    attributions: ILyricsAttribution[];
    translationCredits?: ILyricsTranslationCredits;
    availableVersions: LyricsAvailableVersions;
    lines: ILyricsLineV2[];
    gameProjection?: ILyricsGameProjection;
}

export interface ILyricsRenditionVersion {
    kind: LyricsRenditionKind;
    label: string;
}

export interface ILyricsV3Line extends ILyricsLineBase {
    "zh-CN"?: string;
    "en-US"?: string;
    segments: ILyricsV3Segment[];
    trailingPerformerIds: string[];
}

export interface ILyricsV3Segment {
    text: string;
    performerIds: string[];
    ruby: ILyricsRubySpan[];
}

export interface ILyricsRenditionSide {
    version: ILyricsRenditionVersion;
    lines: ILyricsV3Line[];
}

export interface ILyricsV3Performer {
    performerId: string;
    name: string;
    color?: string;
}

export interface ILyricsRenditionRelation {
    kind: LyricsRenditionRelationKind;
    fullRenditionKey?: string;
    lineIds?: string[];
}

export interface ILyricsV3ComponentAttribution {
    component: string;
    provider: LyricsAttributionProvider;
    title: string;
    revisionId: number;
    revisionUrl: string;
    licenseName: string;
    licenseUrl: string;
}

export interface ILyricsRendition {
    key: string;
    kind: LyricsRenditionKind;
    label: string;
    availableVersions: LyricsAvailableVersions;
    performers: ILyricsV3Performer[];
    full?: ILyricsRenditionSide;
    game?: ILyricsRenditionSide;
    relation: ILyricsRenditionRelation;
    sourceTabPaths: string[][];
    provenance: ILyricsV3ComponentAttribution[];
    translationCredits?: ILyricsTranslationCredits;
}

export interface ILyricsDocumentV3 extends ILyricsDocumentBase {
    version: typeof LYRICS_SCHEMA_VERSION_V3;
    state: "complete" | "game_only";
    renditions: ILyricsRendition[];
}

export interface ILyricsV4SourceLine {
    id: string;
    order: number;
    japanese: string;
    stanzaBreakBefore?: boolean;
    segments: ILyricsV3Segment[];
    trailingPerformerIds: string[];
}

export interface ILyricsV4SourceRenditionSide {
    version: ILyricsRenditionVersion;
    lines: ILyricsV4SourceLine[];
}

export interface ILyricsV4SourceRendition {
    key: string;
    kind: LyricsRenditionKind;
    label: string;
    availableVersions: LyricsAvailableVersions;
    performers: ILyricsV3Performer[];
    full?: ILyricsV4SourceRenditionSide;
    game?: ILyricsV4SourceRenditionSide;
    relation: ILyricsRenditionRelation;
    sourceTabPaths: string[][];
    provenance: ILyricsV3ComponentAttribution[];
}

export interface ILyricsV4TranslationSide {
    translations: string[];
}

export interface ILyricsV4TranslationEditionRendition {
    renditionKey: string;
    translationCredits?: ILyricsTranslationCredits;
    full?: ILyricsV4TranslationSide;
    game?: ILyricsV4TranslationSide;
}

export interface ILyricsV4TranslationEdition {
    key: string;
    label: string;
    renditions: ILyricsV4TranslationEditionRendition[];
}

export interface ILyricsDocumentV4 extends ILyricsDocumentBase {
    version: typeof LYRICS_SCHEMA_VERSION_V4;
    state: "complete" | "game_only";
    defaultTranslationEditionKey: string;
    translationEditions: ILyricsV4TranslationEdition[];
    renditions: ILyricsV4SourceRendition[];
}

export type ILyricsDisplayLine = ILyricsLine | (ILyricsV4SourceLine & Partial<Record<LyricsTargetLocale, string>>);
export type ILyricsDisplayRendition = ILyricsRendition | ILyricsV4SourceRendition;
export type ILyricsDocument = ILyricsDocumentV1 | ILyricsDocumentV2 | ILyricsDocumentV3 | ILyricsDocumentV4;

export class LyricsLoadError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly retryable = false,
    ) {
        super(message);
        this.name = "LyricsLoadError";
    }
}

// A detail document that disagrees with the index publication is usually an
// in-flight CDN rollout rather than corrupt content. It is reported separately
// so the loader can re-resolve the publication instead of failing the page.
class LyricsPublicationMismatchError extends LyricsLoadError {
    constructor() {
        super("Invalid lyrics document");
        this.name = "LyricsPublicationMismatchError";
    }
}

export function isLyricsUnavailableError(error: unknown): error is LyricsLoadError {
    return error instanceof LyricsLoadError && error.status === HTTP_NOT_FOUND;
}

interface CachedLyricsDocument {
    document: ILyricsDocument;
    cachedAt: number;
}

const LYRICS_INDEX_FILENAME = "index.json";
const LYRICS_DOCUMENT_FILENAME_PREFIX = "music_";
const LYRICS_DOCUMENT_REVISION_PARAM = "rev";
const MIN_LYRICS_ENTITY_ID = 1;
const MIN_LYRICS_LINE_ORDER = 0;
const MAX_LYRICS_INDEX_ENTRIES = 100_000;
const MAX_LYRICS_LINES = 5000;
const MAX_LYRICS_SEGMENTS_PER_LINE = 100;
const MAX_LYRICS_PERFORMERS_PER_SEGMENT = 64;
const MAX_LYRICS_RUBY_SPANS_PER_SEGMENT = 256;
const MAX_LYRICS_V3_RUBY_SPANS_PER_SEGMENT = 8192;
const MAX_LYRICS_ATTRIBUTIONS = 16;
const MAX_LYRICS_V3_RENDITIONS = 16;
const MAX_LYRICS_V4_TRANSLATION_EDITIONS = 16;
const MAX_LYRICS_V4_EDITION_LABEL_LENGTH = 256;
const MAX_LYRICS_V3_PERFORMERS = 256;
const MAX_LYRICS_V3_ATTRIBUTIONS = 128;
const MAX_LYRICS_V3_TAB_PATHS = 32;
const MAX_LYRICS_V3_TAB_DEPTH = 8;
const MAX_LYRICS_TITLE_LENGTH = 64 * 1024;
const MAX_LYRICS_TEXT_LENGTH = 16 * 1024;
const MAX_LYRICS_RUBY_READING_LENGTH = 1024;
const MAX_LYRICS_SOURCE_URL_LENGTH = 4096;
const MAX_LYRICS_ATTRIBUTION_LENGTH = 16 * 1024;
const MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH = 2048;
const MAX_LYRICS_LICENSE_NAME_LENGTH = 512;
const MAX_LYRICS_DATE_TIME_LENGTH = 64;
const MAX_LYRICS_LINE_ID_LENGTH = 128;
const INITIAL_LYRICS_BUFFER_BYTES = 1024;
const LYRICS_BUFFER_GROWTH_FACTOR = 2;
const LYRICS_DETAIL_CACHE_LIMIT = 24;
const LYRICS_SOURCE_CHANGE_RETRY_LIMIT = MIN_LYRICS_ENTITY_ID;
const LYRICS_FETCH_RETRY_LIMIT = 2;
const LYRICS_FETCH_RETRY_DELAY_MS = 250;
// A CDN expires index.json and music_<id>.json independently, so a publication
// can be announced by the index seconds before the matching detail is evicted.
// Re-resolving the publication and retrying keeps that window from surfacing as
// a page-level failure; a genuinely mismatched artifact still fails closed.
const LYRICS_REVISION_MISMATCH_RETRY_LIMIT = 3;
const LYRICS_REVISION_MISMATCH_RETRY_DELAY_MS = 700;
const LYRICS_CACHE_TTL_MS = 60 * 1000;
const LYRICS_FETCH_TIMEOUT_MS = 10 * 1000;
const MAX_LYRICS_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MOEGIRL_PUBLIC_EXACT_LYRICS_URL = "https://zh.moegirl.org.cn/%E4%BA%BF%E5%B9%B4%E7%88%B1%E6%81%8B";
const LYRICS_ATTRIBUTION_LICENSES = {
    vocaloid_fandom: {
        licenseName: "CC BY-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
    moegirl: {
        licenseName: "CC BY-NC-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    },
    moegirl_public_exact: {
        licenseName: "CC BY-NC-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    },
    sekaipedia: {
        licenseName: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
} as const satisfies Record<LyricsAttributionProvider, { licenseName: string; licenseUrl: string }>;
const detailCache = new Map<string, CachedLyricsDocument>();
const detailRequests = new Map<string, Promise<ILyricsDocument>>();
let indexCache: ILyricsIndex | null = null;
let indexCacheSourceUrl = "";
let indexCachedAt = 0;
let indexRequest: Promise<ILyricsIndex> | null = null;
let indexRequestSourceUrl = "";

export function getLyricsTargetLocale(locale: UiLocale): LyricsTargetLocale | null {
    if (locale === "zh-CN" || locale === "en-US") return locale;
    return null;
}

export function getLyricsAvailableVersions(
    value: ILyricsIndexEntry | ILyricsDocument | ILyricsDisplayRendition,
): readonly LyricsVersion[] {
    if ("availableVersions" in value && value.availableVersions) return value.availableVersions;
    if ("renditions" in value) {
        const versions = new Set(value.renditions.flatMap((rendition) => rendition.availableVersions));
        return versions.has("full") && versions.has("game") ? ["full", "game"] : versions.has("full") ? ["full"] : versions.has("game") ? ["game"] : [];
    }
    if ("state" in value && value.state) return [];
    return ["full"];
}

export function getLyricsRenditions(document: ILyricsDocument): readonly ILyricsDisplayRendition[] {
    if (document.version !== LYRICS_SCHEMA_VERSION_V3 && document.version !== LYRICS_SCHEMA_VERSION_V4) return [];
    const renditions = [...document.renditions];
    renditions.sort((left, right) => {
        if (left.key === "sekai" || left.kind === "sekai") return -1;
        if (right.key === "sekai" || right.kind === "sekai") return 1;
        return 0;
    });
    return renditions;
}

export function getLyricsRendition(document: ILyricsDocument, renditionKey?: string | null): ILyricsDisplayRendition | null {
    if (document.version !== LYRICS_SCHEMA_VERSION_V3 && document.version !== LYRICS_SCHEMA_VERSION_V4) return null;
    const renditions = getLyricsRenditions(document);
    return renditions.find((rendition) => rendition.key === renditionKey)
        ?? renditions.find((rendition) => rendition.key === "sekai" || rendition.kind === "sekai")
        ?? renditions[0]
        ?? null;
}

export function getLyricsTranslationEditions(
    document: ILyricsDocument,
    locale: UiLocale,
): readonly ILyricsV4TranslationEdition[] {
    // Public v4 currently carries the editor's zh-CN translation materialization.
    // The wire shape has no locale discriminator, so exposing it as en-US would
    // silently relabel Chinese text as English. Keep other UI locales source-only.
    return document.version === LYRICS_SCHEMA_VERSION_V4 && getLyricsTargetLocale(locale) === "zh-CN"
        ? document.translationEditions
        : [];
}

export function resolveLyricsTranslationEdition(
    document: ILyricsDocument,
    locale: UiLocale,
    editionKey?: string | null,
): ILyricsV4TranslationEdition | null {
    const editions = getLyricsTranslationEditions(document, locale);
    if (document.version !== LYRICS_SCHEMA_VERSION_V4 || editions.length === 0) return null;
    return editions.find((edition) => edition.key === editionKey)
        ?? editions.find((edition) => edition.key === document.defaultTranslationEditionKey)
        ?? null;
}

export function getLyricsSelectedTranslationCredits(
    document: ILyricsDocument,
    renditionKey?: string | null,
    translationEditionKey?: string | null,
    locale: UiLocale = "zh-CN",
): ILyricsTranslationCredits | undefined {
    if (document.version === LYRICS_SCHEMA_VERSION_V2) return document.translationCredits;
    const rendition = getLyricsRendition(document, renditionKey);
    if (!rendition) return undefined;
    if (document.version === LYRICS_SCHEMA_VERSION_V3) return (rendition as ILyricsRendition).translationCredits;
    if (document.version !== LYRICS_SCHEMA_VERSION_V4) return undefined;
    const edition = resolveLyricsTranslationEdition(document, locale, translationEditionKey);
    return edition?.renditions.find((entry) => entry.renditionKey === rendition.key)?.translationCredits;
}

export function hasLyricsDetail(value: ILyricsIndexEntry): boolean {
    return value.state === undefined || value.state === "complete" || value.state === "game_only";
}

export function hasFullLyricsVersion(value: ILyricsIndexEntry | ILyricsDocument | ILyricsDisplayRendition): boolean {
    return getLyricsAvailableVersions(value).includes("full");
}

export function hasGameLyricsVersion(value: ILyricsIndexEntry | ILyricsDocument | ILyricsDisplayRendition): boolean {
    return getLyricsAvailableVersions(value).includes("game");
}

export function getLyricsRubySpans(segment: ILyricsSegment): ILyricsRubySpan[] {
    return "ruby" in segment ? segment.ruby : [{ text: segment.text }];
}

export function getLyricsDisplaySegments(line: ILyricsDisplayLine, preserveUnassignedSegments = false): ILyricsDisplaySegment[] {
    const segments = line.segments.map((segment) => ({
        text: segment.text,
        performerIds: [...segment.performerIds],
        ruby: getLyricsRubySpans(segment),
    }));
    if (preserveUnassignedSegments || segments.some((segment) => segment.performerIds.length > 0)) return segments;

    const ruby = segments.flatMap((segment) => segment.ruby);
    const reconstructsJapanese = ruby.map((span) => span.text).join("") === line.japanese;
    return [{
        text: line.japanese,
        performerIds: [],
        ruby: reconstructsJapanese ? ruby : [{ text: line.japanese }],
    }];
}

function getV4EditionRendition(
    edition: ILyricsV4TranslationEdition,
    renditionKey: string,
): ILyricsV4TranslationEditionRendition | null {
    return edition.renditions.find((rendition) => rendition.renditionKey === renditionKey) ?? null;
}

export function getLyricsDisplayLines(
    document: ILyricsDocument,
    version: LyricsVersion,
    renditionKey?: string | null,
    translationEditionKey?: string | null,
    locale: UiLocale = "zh-CN",
): ILyricsDisplayLine[] {
    if (document.version === LYRICS_SCHEMA_VERSION_V3) {
        const rendition = getLyricsRendition(document, renditionKey) as ILyricsRendition | null;
        if (!rendition) return [];
        if (version === "game") return rendition.game?.lines ?? [];
        return rendition.full?.lines ?? [];
    }
    if (document.version === LYRICS_SCHEMA_VERSION_V4) {
        const rendition = getLyricsRendition(document, renditionKey) as ILyricsV4SourceRendition | null;
        if (!rendition) return [];
        const sourceLines = version === "game" ? rendition.game?.lines ?? [] : rendition.full?.lines ?? [];
        const targetLocale = getLyricsTargetLocale(locale);
        const edition = resolveLyricsTranslationEdition(document, locale, translationEditionKey);
        const editionRendition = edition ? getV4EditionRendition(edition, rendition.key) : null;
        if (targetLocale !== "zh-CN" || !editionRendition) return sourceLines;

        let translations: readonly string[] | null = null;
        if (version === "full") {
            translations = editionRendition.full?.translations ?? null;
        } else if (rendition.relation.kind === "exact_projection") {
            const fullLines = rendition.full?.lines ?? [];
            const translationByFullLineID = new Map(
                fullLines.map((line, index) => [line.id, editionRendition.full?.translations[index] ?? ""]),
            );
            translations = (rendition.relation.lineIds ?? []).map((lineID) => translationByFullLineID.get(lineID) ?? "");
        } else {
            translations = editionRendition.game?.translations ?? null;
        }
        if (!translations) return sourceLines;
        return sourceLines.map((line, index) => ({
            ...line,
            [targetLocale]: translations[index] ?? "",
        }));
    }
    if (document.version === LYRICS_SCHEMA_VERSION_V2 && document.state === "game_only") return document.lines;
    if (version !== "game" || document.version !== LYRICS_SCHEMA_VERSION_V2 || !document.gameProjection) {
        return document.lines;
    }
    const lineById = new Map(document.lines.map((line) => [line.id, line]));
    return document.gameProjection.lineIds.map((lineId) => lineById.get(lineId) as ILyricsLineV2);
}

function isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    if (normalized === "localhost" || normalized === "[::1]") return true;

    const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const octets = match.slice(1).map(Number);
    return octets[0] === IPV4_LOOPBACK_FIRST_OCTET && octets.every((octet) => octet >= 0 && octet <= IPV4_MAX_OCTET);
}

function parseLyricsBaseUrl(value: string): URL | null {
    try {
        if (value.length > MAX_LYRICS_SOURCE_URL_LENGTH) return null;
        if (value.trim() !== value || value.includes("?") || value.includes("#")) return null;
        const url = new URL(value);
        if (url.origin === "null" || !url.hostname) return null;
        if (
            (url.protocol !== "http:" && url.protocol !== "https:")
            || url.username
            || url.password
            || url.search
            || url.hash
        ) {
            return null;
        }
        if (url.protocol === "http:" && (process.env.NODE_ENV === "production" || !isLoopbackHostname(url.hostname))) {
            return null;
        }

        const pathname = url.pathname.replace(/\/+$/, "");
        if (!pathname) return null;
        url.pathname = pathname;
        return url;
    } catch {
        return null;
    }
}

export function getLyricsBaseUrl(): string {
    // Keep this direct property access: Next.js statically replaces NEXT_PUBLIC_* references
    // in client bundles, while computed environment lookups are not guaranteed to be inlined.
    const raw = process.env.NEXT_PUBLIC_LYRICS_BASE_URL || DEFAULT_PUBLIC_LYRICS_BASE_URL;

    const configured = parseLyricsBaseUrl(raw);
    if (!configured) throw new LyricsLoadError("Invalid configured lyrics base URL");
    return configured.toString().replace(/\/$/, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}

function isDateTime(value: unknown): value is string {
    return typeof value === "string"
        && value.length <= MAX_LYRICS_DATE_TIME_LENGTH
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function isTitle(value: unknown): value is ILyricsIndexEntry["title"] {
    if (!isObject(value) || !hasOnlyKeys(value, ["ja-JP", "zh-CN", "en-US"])) return false;
    return typeof value["ja-JP"] === "string"
        && value["ja-JP"].length > 0
        && value["ja-JP"].length <= MAX_LYRICS_TITLE_LENGTH
        && (value["zh-CN"] === undefined || (typeof value["zh-CN"] === "string" && value["zh-CN"].length <= MAX_LYRICS_TITLE_LENGTH))
        && (value["en-US"] === undefined || (typeof value["en-US"] === "string" && value["en-US"].length <= MAX_LYRICS_TITLE_LENGTH));
}

function isAvailableVersions(value: unknown): value is LyricsAvailableVersions {
    return Array.isArray(value) && (
        value.length === 1 && (value[0] === "full" || value[0] === "game")
        || value.length === 2 && value[0] === "full" && value[1] === "game"
    );
}

function sameAvailableVersions(left: readonly LyricsVersion[], right: readonly LyricsVersion[]): boolean {
    return left.length === right.length && left.every((version, index) => version === right[index]);
}

function isAvailabilityState(value: unknown): value is LyricsAvailabilityState {
    return value === "complete" || value === "game_only" || value === "satisfied_no_lyrics"
        || value === "ambiguous" || value === "missing" || value === "incomplete" || value === "failed";
}

function isIndexEntry(value: unknown, version: ILyricsIndex["version"]): value is ILyricsIndexEntry {
    if (!isObject(value)) return false;
    const expectedKeys = version === LYRICS_SCHEMA_VERSION_V1
        ? ["musicId", "revision", "updatedAt", "title"]
        : ["musicId", "revision", "updatedAt", "state", "title", "availableVersions", "noLyricsReason"];
    if (!hasOnlyKeys(value, expectedKeys)) return false;
    if (!(Number.isSafeInteger(value.musicId) && Number(value.musicId) >= MIN_LYRICS_ENTITY_ID
        && Number.isSafeInteger(value.revision) && Number(value.revision) >= MIN_LYRICS_ENTITY_ID
        && isDateTime(value.updatedAt)
        && isTitle(value.title))) {
        return false;
    }
    if (version === LYRICS_SCHEMA_VERSION_V1) {
        return value.state === undefined && value.availableVersions === undefined && value.noLyricsReason === undefined;
    }
    if (!isAvailabilityState(value.state)) return false;
    switch (value.state) {
        case "complete":
            return isAvailableVersions(value.availableVersions)
                && value.availableVersions[0] === "full"
                && value.noLyricsReason === undefined;
        case "game_only":
            return Array.isArray(value.availableVersions)
                && value.availableVersions.length === 1
                && value.availableVersions[0] === "game"
                && value.noLyricsReason === undefined;
        case "satisfied_no_lyrics":
            return value.availableVersions === undefined && value.noLyricsReason === "catalog_instrumental";
        default:
            return value.availableVersions === undefined && value.noLyricsReason === undefined;
    }
}

function validateIndex(value: unknown): ILyricsIndex {
    if (
        !isObject(value)
        || !hasOnlyKeys(value, ["version", "songs"])
        || (value.version !== LYRICS_SCHEMA_VERSION_V1
            && value.version !== LYRICS_SCHEMA_VERSION_V2
            && value.version !== LYRICS_SCHEMA_VERSION_V3
            && value.version !== LYRICS_SCHEMA_VERSION_V4)
        || !Array.isArray(value.songs)
        || value.songs.length > MAX_LYRICS_INDEX_ENTRIES
        || (value.version === LYRICS_SCHEMA_VERSION_V3 || value.version === LYRICS_SCHEMA_VERSION_V4) && value.songs.length === 0
    ) {
        throw new LyricsLoadError("Invalid lyrics index");
    }

    const version = value.version;
    const musicIds = new Set<number>();
    let previousMusicId = 0;
    for (const song of value.songs) {
        if (!isIndexEntry(song, version) || musicIds.has(song.musicId) || song.musicId <= previousMusicId) {
            throw new LyricsLoadError("Invalid lyrics index");
        }
        musicIds.add(song.musicId);
        previousMusicId = song.musicId;
    }
    return value as unknown as ILyricsIndex;
}

function isPerformerIds(value: unknown, allowEmpty: boolean, maximum?: number): value is number[] {
    return Array.isArray(value)
        && (allowEmpty || value.length > 0)
        && (maximum === undefined || value.length <= maximum)
        && new Set(value).size === value.length
        && value.every((id) => Number.isSafeInteger(id) && Number(id) >= MIN_LYRICS_ENTITY_ID);
}

function isRubySpan(value: unknown): value is ILyricsRubySpan {
    if (!isObject(value) || !hasOnlyKeys(value, ["text", "reading"])) return false;
    if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > MAX_LYRICS_TEXT_LENGTH) return false;
    return value.reading === undefined || (
        typeof value.reading === "string"
        && value.reading.length > 0
        && value.reading.length <= MAX_LYRICS_RUBY_READING_LENGTH
        && /^[ぁ-ゖァ-ヺー・゙゚]+$/u.test(value.reading)
    );
}

function isSegmentV1(value: unknown): value is ILyricsSegmentV1 {
    return isObject(value)
        && hasOnlyKeys(value, ["text", "performerIds"])
        && typeof value.text === "string"
        && value.text.length <= MAX_LYRICS_TEXT_LENGTH
        && isPerformerIds(value.performerIds, true, MAX_LYRICS_PERFORMERS_PER_SEGMENT);
}

function isSegmentV2(value: unknown): value is ILyricsSegmentV2 {
    return isObject(value)
        && hasOnlyKeys(value, ["text", "performerIds", "ruby"])
        && typeof value.text === "string"
        && value.text.length > 0
        && value.text.length <= MAX_LYRICS_TEXT_LENGTH
        && isPerformerIds(value.performerIds, true, MAX_LYRICS_PERFORMERS_PER_SEGMENT)
        && Array.isArray(value.ruby)
        && value.ruby.length > 0
        && value.ruby.length <= MAX_LYRICS_RUBY_SPANS_PER_SEGMENT
        && value.ruby.every(isRubySpan)
        && value.ruby.map((span) => span.text).join("") === value.text;
}

function hasValidLineBase(value: Record<string, unknown>): boolean {
    return typeof value.id === "string" && value.id.length > 0 && value.id.length <= MAX_LYRICS_LINE_ID_LENGTH
        && Number.isSafeInteger(value.order) && Number(value.order) >= MIN_LYRICS_LINE_ORDER
        && typeof value.japanese === "string" && value.japanese.length > 0 && value.japanese.length <= MAX_LYRICS_TEXT_LENGTH
        && typeof value["zh-CN"] === "string" && value["zh-CN"].length <= MAX_LYRICS_TEXT_LENGTH
        && typeof value["en-US"] === "string" && value["en-US"].length <= MAX_LYRICS_TEXT_LENGTH
        && (value.stanzaBreakBefore === undefined || typeof value.stanzaBreakBefore === "boolean")
        && Array.isArray(value.segments)
        && value.segments.length > 0
        && value.segments.length <= MAX_LYRICS_SEGMENTS_PER_LINE;
}

function isLineV1(value: unknown): value is ILyricsLineV1 {
    return isObject(value)
        && hasOnlyKeys(value, ["id", "order", "japanese", "zh-CN", "en-US", "stanzaBreakBefore", "segments"])
        && hasValidLineBase(value)
        && (value.segments as unknown[]).every(isSegmentV1);
}

function isLineV2(value: unknown): value is ILyricsLineV2 {
    return isObject(value)
        && hasOnlyKeys(value, ["id", "order", "japanese", "zh-CN", "en-US", "stanzaBreakBefore", "segments", "trailingPerformerIds"])
        && hasValidLineBase(value)
        && (value.segments as unknown[]).every(isSegmentV2)
        && (value.segments as ILyricsSegmentV2[]).map((segment) => segment.text).join("") === value.japanese
        && (value.trailingPerformerIds === undefined
            || isPerformerIds(value.trailingPerformerIds, true, MAX_LYRICS_PERFORMERS_PER_SEGMENT));
}

function isLyricsAttributionProvider(value: unknown): value is LyricsAttributionProvider {
    return value === "vocaloid_fandom" || value === "moegirl" || value === "moegirl_public_exact" || value === "sekaipedia";
}

function hasCanonicalAttributionQuery(url: URL, entries: readonly (readonly [string, string])[]): boolean {
    const canonicalUrl = new URL(`${url.origin}${url.pathname}`);
    for (const [name, value] of entries) canonicalUrl.searchParams.append(name, value);
    return url.toString() === canonicalUrl.toString();
}

function isCanonicalAttributionRevisionUrl(
    value: unknown,
    provider: LyricsAttributionProvider,
    revisionId: number,
): value is string {
    if (
        typeof value !== "string"
        || value.length === 0
        || value.length > MAX_LYRICS_SOURCE_URL_LENGTH
        || value.trim() !== value
        || /[\u0000-\u0020\u007f]/u.test(value)
    ) {
        return false;
    }

    try {
        const url = new URL(value);
        if (
            value !== url.toString()
            || url.protocol !== "https:"
            || !url.hostname
            || url.username
            || url.password
            || url.port
            || url.hash
        ) {
            return false;
        }

        const revision = String(revisionId);
        if (provider === "moegirl_public_exact") {
            return value === MOEGIRL_PUBLIC_EXACT_LYRICS_URL && url.search === "";
        }
        if (provider === "moegirl") {
            if (url.hostname !== "moegirl.icu") return false;
            if (url.pathname.startsWith("/wiki/") && url.pathname.length > "/wiki/".length) {
                return hasCanonicalAttributionQuery(url, [["oldid", revision]]);
            }
            if (url.pathname !== "/index.php") return false;

            const title = url.searchParams.get("title");
            return typeof title === "string"
                && title.length > 0
                && hasCanonicalAttributionQuery(url, [["oldid", revision], ["title", title]]);
        }

        const isFandom = url.hostname === "vocaloid.fandom.com" || url.hostname === "projectsekai.fandom.com";
        const isValidHost = provider === "vocaloid_fandom" ? isFandom : url.hostname === "www.sekaipedia.org";
        return isValidHost
            && url.pathname.startsWith("/wiki/")
            && url.pathname.length > "/wiki/".length
            && hasCanonicalAttributionQuery(url, [["oldid", revision]]);
    } catch {
        return false;
    }
}

function isAttribution(value: unknown): value is ILyricsAttribution {
    if (!isObject(value) || !hasOnlyKeys(value, ["provider", "title", "revisionId", "revisionUrl", "licenseName", "licenseUrl"])) return false;
    if (!isLyricsAttributionProvider(value.provider)) return false;
    if (typeof value.revisionId !== "number" || !Number.isSafeInteger(value.revisionId) || value.revisionId < MIN_LYRICS_ENTITY_ID) return false;

    const license = LYRICS_ATTRIBUTION_LICENSES[value.provider];
    return typeof value.title === "string" && value.title.length > 0 && value.title.length <= MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        && typeof value.licenseName === "string" && value.licenseName.length > 0 && value.licenseName.length <= MAX_LYRICS_LICENSE_NAME_LENGTH
        && value.licenseName === license.licenseName
        && value.licenseUrl === license.licenseUrl
        && isCanonicalAttributionRevisionUrl(value.revisionUrl, value.provider, value.revisionId);
}

function isAttributions(value: unknown): value is ILyricsAttribution[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LYRICS_ATTRIBUTIONS || !value.every(isAttribution)) return false;
    const identities = value.map((item) => `${item.provider}\u0000${item.revisionId}`);
    return new Set(identities).size === identities.length;
}

function isTranslationCredits(value: unknown): value is ILyricsTranslationCredits {
    if (!isObject(value) || !hasOnlyKeys(value, ["translation", "proofreading"])) return false;
    const translation = value.translation;
    const proofreading = value.proofreading;
    const validOptionalCredit = (credit: unknown) => typeof credit === "string"
        && credit.length > 0
        && credit.length <= MAX_LYRICS_ATTRIBUTION_LENGTH
        && credit.trim() === credit;
    if (translation !== undefined && !validOptionalCredit(translation)) return false;
    if (proofreading !== undefined && !validOptionalCredit(proofreading)) return false;
    return translation !== undefined || proofreading !== undefined;
}

function isGameProjection(value: unknown, lines: ILyricsLineV2[]): value is ILyricsGameProjection {
    if (!isObject(value) || !hasOnlyKeys(value, ["reasonCode", "lineIds"])) return false;
    if (value.reasonCode !== "tagged_full_and_game" && value.reasonCode !== "untagged_uncut_identity") return false;
    if (!Array.isArray(value.lineIds) || value.lineIds.length === 0 || value.lineIds.length > MAX_LYRICS_LINES) return false;
    if (!value.lineIds.every((lineId) => typeof lineId === "string" && lineId.length > 0 && lineId.length <= MAX_LYRICS_LINE_ID_LENGTH)) return false;
    if (new Set(value.lineIds).size !== value.lineIds.length) return false;

    const positionByLineId = new Map(lines.map((line, index) => [line.id, index]));
    let previousPosition = -1;
    for (const lineId of value.lineIds) {
        const position = positionByLineId.get(lineId);
        if (position === undefined || position <= previousPosition) return false;
        previousPosition = position;
    }

    if (value.reasonCode === "untagged_uncut_identity") {
        return value.lineIds.length === lines.length && value.lineIds.every((lineId, index) => lineId === lines[index]?.id);
    }
    return true;
}

function isStringPerformerIds(value: unknown, performers: ReadonlySet<string>): value is string[] {
    return Array.isArray(value)
        && value.length <= MAX_LYRICS_PERFORMERS_PER_SEGMENT
        && new Set(value).size === value.length
        && value.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_LYRICS_LINE_ID_LENGTH && performers.has(id));
}

const V3_HAN_CHARACTER_PATTERN = /\p{Script=Han}/u;
const V3_NUMBER_PATTERN = /\p{Number}/u;
const V3_KANA_CHARACTER_PATTERN = /\p{Script=Hiragana}|\p{Script=Katakana}/u;
const V3_KANA_MARK_PATTERN = /[\p{Mn}\p{Mc}]/u;

function isV3KanaReading(value: string): boolean {
    let hasKana = false;
    for (const character of value) {
        if (V3_KANA_CHARACTER_PATTERN.test(character)) {
            hasKana = true;
            continue;
        }
        if (character === "ー" || character === "・" || V3_KANA_MARK_PATTERN.test(character)) {
            if (!hasKana) return false;
            continue;
        }
        return false;
    }
    return hasKana;
}

// Any visible base may carry a kana reading: kanji, and the glosses lyrics
// write over other text, such as Voc. read ボク, 0 read はじまり or 心の底 read ハコ.
function isV3RubyBase(value: string): boolean {
    return /\S/u.test(value);
}

function isRubySpanV3(value: unknown): value is ILyricsRubySpan {
    if (!isObject(value)
        || !hasOnlyKeys(value, ["text", "reading"])
        || typeof value.text !== "string"
        || value.text.length === 0
        || value.text.length > MAX_LYRICS_TEXT_LENGTH
        || /[\r\n\0]/u.test(value.text)) return false;
    if (value.reading === undefined) return ![...value.text].some((character) =>
        V3_HAN_CHARACTER_PATTERN.test(character) && !V3_NUMBER_PATTERN.test(character));
    return typeof value.reading === "string"
        && value.reading.length > 0
        && value.reading.length <= MAX_LYRICS_TEXT_LENGTH
        && !/[\r\n\0]/u.test(value.reading)
        && isV3RubyBase(value.text)
        && isV3KanaReading(value.reading);
}

function isLineV3(value: unknown, performers: ReadonlySet<string>, expectedOrder: number): value is ILyricsV3Line {
    if (!isObject(value) || !hasOnlyKeys(value, ["id", "order", "japanese", "zh-CN", "en-US", "stanzaBreakBefore", "segments", "trailingPerformerIds"])) return false;
    if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_LYRICS_LINE_ID_LENGTH
        || value.order !== expectedOrder
        || typeof value.japanese !== "string" || value.japanese.length === 0 || value.japanese.length > MAX_LYRICS_TEXT_LENGTH
        || /[\r\n\0]/u.test(value.japanese)
        || (value["zh-CN"] !== undefined && (typeof value["zh-CN"] !== "string" || value["zh-CN"].length > MAX_LYRICS_TEXT_LENGTH))
        || (value["en-US"] !== undefined && (typeof value["en-US"] !== "string" || value["en-US"].length > MAX_LYRICS_TEXT_LENGTH))
        || (value.stanzaBreakBefore !== undefined && typeof value.stanzaBreakBefore !== "boolean")
        || !Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > MAX_LYRICS_SEGMENTS_PER_LINE
        || !isStringPerformerIds(value.trailingPerformerIds, performers)) return false;
    const segments = value.segments as unknown[];
    for (const segment of segments) {
        if (!isObject(segment) || !hasOnlyKeys(segment, ["text", "performerIds", "ruby"])
            || typeof segment.text !== "string" || segment.text.length === 0 || segment.text.length > MAX_LYRICS_TEXT_LENGTH
            || !isStringPerformerIds(segment.performerIds, performers)
            || !Array.isArray(segment.ruby) || segment.ruby.length === 0 || segment.ruby.length > MAX_LYRICS_V3_RUBY_SPANS_PER_SEGMENT
            || !segment.ruby.every(isRubySpanV3)
            || segment.ruby.map((span) => span.text).join("") !== segment.text) return false;
    }
    return segments.map((segment) => (segment as Record<string, unknown>).text).join("") === value.japanese;
}

function isLineV4(value: unknown, performers: ReadonlySet<string>, expectedOrder: number): value is ILyricsV4SourceLine {
    if (!isObject(value) || !hasOnlyKeys(value, ["id", "order", "japanese", "stanzaBreakBefore", "segments", "trailingPerformerIds"])) return false;
    if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_LYRICS_LINE_ID_LENGTH
        || value.order !== expectedOrder
        || typeof value.japanese !== "string" || value.japanese.length === 0 || value.japanese.length > MAX_LYRICS_TEXT_LENGTH
        || /[\r\n\0]/u.test(value.japanese)
        || (value.stanzaBreakBefore !== undefined && typeof value.stanzaBreakBefore !== "boolean")
        || !Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > MAX_LYRICS_SEGMENTS_PER_LINE
        || !isStringPerformerIds(value.trailingPerformerIds, performers)) return false;
    const segments = value.segments as unknown[];
    for (const segment of segments) {
        if (!isObject(segment) || !hasOnlyKeys(segment, ["text", "performerIds", "ruby"])
            || typeof segment.text !== "string" || segment.text.length === 0 || segment.text.length > MAX_LYRICS_TEXT_LENGTH
            || !isStringPerformerIds(segment.performerIds, performers)
            || !Array.isArray(segment.ruby) || segment.ruby.length === 0 || segment.ruby.length > MAX_LYRICS_V3_RUBY_SPANS_PER_SEGMENT
            || !segment.ruby.every(isRubySpanV3)
            || segment.ruby.map((span) => span.text).join("") !== segment.text) return false;
    }
    return segments.map((segment) => (segment as Record<string, unknown>).text).join("") === value.japanese;
}

function isRenditionKind(value: unknown): value is LyricsRenditionKind {
    return value === "original" || value === "sekai" || value === "vocaloid" || value === "alternate";
}

function isRenditionSide(value: unknown, kind: LyricsRenditionKind, performers: ReadonlySet<string>): value is ILyricsRenditionSide {
    if (!isObject(value) || !hasOnlyKeys(value, ["version", "lines"]) || !isObject(value.version)
        || !hasOnlyKeys(value.version, ["kind", "label"]) || value.version.kind !== kind
        || typeof value.version.label !== "string" || value.version.label.length === 0 || value.version.label.length > MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        || value.version.label !== value.version.label.trim()
        || !Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LYRICS_LINES) return false;
    const lineIds = new Set<string>();
    return value.lines.every((line, index) => {
        if (!isLineV3(line, performers, index) || lineIds.has(line.id)) return false;
        lineIds.add(line.id);
        return true;
    });
}

function isRenditionSideV4(
    value: unknown,
    kind: LyricsRenditionKind,
    performers: ReadonlySet<string>,
): value is ILyricsV4SourceRenditionSide {
    if (!isObject(value) || !hasOnlyKeys(value, ["version", "lines"]) || !isObject(value.version)
        || !hasOnlyKeys(value.version, ["kind", "label"]) || value.version.kind !== kind
        || typeof value.version.label !== "string" || value.version.label.length === 0 || value.version.label.length > MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        || value.version.label !== value.version.label.trim()
        || !Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LYRICS_LINES) return false;
    const lineIds = new Set<string>();
    return value.lines.every((line, index) => {
        if (!isLineV4(line, performers, index) || lineIds.has(line.id)) return false;
        lineIds.add(line.id);
        return true;
    });
}

function isV3Performer(value: unknown, previousID: string): value is ILyricsV3Performer {
    return isObject(value)
        && hasOnlyKeys(value, ["performerId", "name", "color"])
        && typeof value.performerId === "string"
        && value.performerId.length > 0
        && value.performerId.length <= MAX_LYRICS_LINE_ID_LENGTH
        && value.performerId > previousID
        && typeof value.name === "string"
        && value.name.length > 0
        && value.name.length <= MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        && value.name === value.name.trim()
        && (value.color === undefined || typeof value.color === "string" && /^#[0-9A-F]{6}$/u.test(value.color));
}

function isV3Attribution(value: unknown, renditionKey: string): value is ILyricsV3ComponentAttribution {
    if (!isObject(value) || !hasOnlyKeys(value, ["component", "provider", "title", "revisionId", "revisionUrl", "licenseName", "licenseUrl"])
        || typeof value.component !== "string" || !value.component.startsWith(`renditions/${renditionKey}/`)) return false;
    const component = value.component.slice(`renditions/${renditionKey}/`.length);
    if (!["full_text", "full_performer_segmentation", "full_ruby", "game_text", "game_performer_segmentation", "game_ruby", "relation", "version"].includes(component)) return false;
    return isAttribution({
        provider: value.provider,
        title: value.title,
        revisionId: value.revisionId,
        revisionUrl: value.revisionUrl,
        licenseName: value.licenseName,
        licenseUrl: value.licenseUrl,
    });
}

function mapV3ExactProjectionFullLines(
    full: ILyricsRenditionSide,
    lineIds: readonly string[],
): ILyricsV3Line[] | null {
    const lineByID = new Map(full.lines.map((line, index) => [line.id, { line, index }]));
    const projection: ILyricsV3Line[] = [];
    let previousIndex = -1;
    for (const lineID of lineIds) {
        const match = lineByID.get(lineID);
        if (!match || match.index <= previousIndex) return null;
        projection.push(match.line);
        previousIndex = match.index;
    }
    return projection;
}

function isV3Relation(value: unknown, renditionKey: string, full: ILyricsRenditionSide | undefined, game: ILyricsRenditionSide | undefined): value is ILyricsRenditionRelation {
    if (!isObject(value) || !hasOnlyKeys(value, ["kind", "fullRenditionKey", "lineIds"])) return false;
    if (value.kind === "none") return value.fullRenditionKey === undefined && value.lineIds === undefined;
    if (value.kind !== "exact_projection" || !full || !game || value.fullRenditionKey !== renditionKey
        || !Array.isArray(value.lineIds) || value.lineIds.length === 0 || value.lineIds.length !== game.lines.length
        || value.lineIds.length > MAX_LYRICS_LINES || new Set(value.lineIds).size !== value.lineIds.length
        || !value.lineIds.every((lineID) => typeof lineID === "string" && lineID.length > 0 && lineID.length <= MAX_LYRICS_LINE_ID_LENGTH)) return false;
    const projectedFullLines = mapV3ExactProjectionFullLines(full, value.lineIds as string[]);
    return projectedFullLines !== null
        && projectedFullLines.every((fullLine, index) => {
            const gameLine = game.lines[index] as ILyricsV3Line;
            return fullLine.japanese === gameLine.japanese
                && fullLine["zh-CN"] === gameLine["zh-CN"]
                && fullLine["en-US"] === gameLine["en-US"];
        });
}

function isV4Relation(
    value: unknown,
    renditionKey: string,
    full: ILyricsV4SourceRenditionSide | undefined,
    game: ILyricsV4SourceRenditionSide | undefined,
): value is ILyricsRenditionRelation {
    if (!isObject(value) || !hasOnlyKeys(value, ["kind", "fullRenditionKey", "lineIds"])) return false;
    if (value.kind === "none") return value.fullRenditionKey === undefined && value.lineIds === undefined;
    if (value.kind !== "exact_projection" || !full || !game || value.fullRenditionKey !== renditionKey
        || !Array.isArray(value.lineIds) || value.lineIds.length === 0 || value.lineIds.length !== game.lines.length
        || value.lineIds.length > MAX_LYRICS_LINES || new Set(value.lineIds).size !== value.lineIds.length
        || !value.lineIds.every((lineID) => typeof lineID === "string" && lineID.length > 0 && lineID.length <= MAX_LYRICS_LINE_ID_LENGTH)) return false;
    const lineByID = new Map(full.lines.map((line, index) => [line.id, { line, index }]));
    let previousIndex = -1;
    return value.lineIds.every((lineID, index) => {
        const match = lineByID.get(lineID as string);
        if (!match || match.index <= previousIndex || match.line.japanese !== game.lines[index]?.japanese) return false;
        previousIndex = match.index;
        return true;
    });
}

function isV3SourceTabPaths(value: unknown): value is string[][] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LYRICS_V3_TAB_PATHS) return false;
    const seen = new Set<string>();
    for (const path of value) {
        if (!Array.isArray(path) || path.length === 0 || path.length > MAX_LYRICS_V3_TAB_DEPTH
            || !path.every((label) => typeof label === "string" && label.length > 0 && label.length <= MAX_LYRICS_LICENSE_NAME_LENGTH && label === label.trim() && !/[\r\n\0]/u.test(label))) return false;
        const key = path.join("\0");
        if (seen.has(key)) return false;
        seen.add(key);
    }
    return true;
}

function isV3Rendition(value: unknown, previousKey: string): value is ILyricsRendition {
    if (!isObject(value) || !hasOnlyKeys(value, ["key", "kind", "label", "availableVersions", "performers", "full", "game", "relation", "sourceTabPaths", "provenance", "translationCredits"])
        || typeof value.key !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.key) || value.key <= previousKey
        || !isRenditionKind(value.kind) || typeof value.label !== "string" || value.label.length === 0 || value.label.length > MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        || value.label !== value.label.trim() || !Array.isArray(value.performers) || value.performers.length > MAX_LYRICS_V3_PERFORMERS
        || !isAvailableVersions(value.availableVersions) || !isV3SourceTabPaths(value.sourceTabPaths)
        || !Array.isArray(value.provenance) || value.provenance.length === 0 || value.provenance.length > MAX_LYRICS_V3_ATTRIBUTIONS
        || (value.translationCredits !== undefined && !isTranslationCredits(value.translationCredits))) return false;
    const performerIDs = new Set<string>();
    let previousPerformerID = "";
    for (const performer of value.performers) {
        if (!isV3Performer(performer, previousPerformerID)) return false;
        previousPerformerID = performer.performerId;
        performerIDs.add(performer.performerId);
    }
    const full = value.full === undefined ? undefined : isRenditionSide(value.full, value.kind, performerIDs) ? value.full : null;
    const game = value.game === undefined ? undefined : isRenditionSide(value.game, value.kind, performerIDs) ? value.game : null;
    if (full === null || game === null || !full && !game) return false;
    const expectedVersions: LyricsVersion[] = [...(full ? ["full" as const] : []), ...(game ? ["game" as const] : [])];
    if (!sameAvailableVersions(value.availableVersions, expectedVersions) || !isV3Relation(value.relation, value.key, full, game)) return false;
    const components = new Set<string>();
    const ranks = ["full_text", "full_performer_segmentation", "full_ruby", "game_text", "game_performer_segmentation", "game_ruby", "relation", "version"];
    let previousRank = -1;
    for (const attribution of value.provenance) {
        if (!isV3Attribution(attribution, value.key) || components.has(attribution.component)) return false;
        const component = attribution.component.slice(`renditions/${value.key}/`.length);
        const rank = ranks.indexOf(component);
        if (rank <= previousRank) return false;
        previousRank = rank;
        components.add(attribution.component);
    }
    return true;
}

function isV4SourceRendition(value: unknown, previousKey: string): value is ILyricsV4SourceRendition {
    if (!isObject(value) || !hasOnlyKeys(value, ["key", "kind", "label", "availableVersions", "performers", "full", "game", "relation", "sourceTabPaths", "provenance"])
        || typeof value.key !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.key) || value.key <= previousKey
        || !isRenditionKind(value.kind) || typeof value.label !== "string" || value.label.length === 0 || value.label.length > MAX_LYRICS_ATTRIBUTION_TITLE_LENGTH
        || value.label !== value.label.trim() || !Array.isArray(value.performers) || value.performers.length > MAX_LYRICS_V3_PERFORMERS
        || !isAvailableVersions(value.availableVersions) || !isV3SourceTabPaths(value.sourceTabPaths)
        || !Array.isArray(value.provenance) || value.provenance.length === 0 || value.provenance.length > MAX_LYRICS_V3_ATTRIBUTIONS) return false;
    const performerIDs = new Set<string>();
    let previousPerformerID = "";
    for (const performer of value.performers) {
        if (!isV3Performer(performer, previousPerformerID)) return false;
        previousPerformerID = performer.performerId;
        performerIDs.add(performer.performerId);
    }
    const full = value.full === undefined ? undefined : isRenditionSideV4(value.full, value.kind, performerIDs) ? value.full : null;
    const game = value.game === undefined ? undefined : isRenditionSideV4(value.game, value.kind, performerIDs) ? value.game : null;
    if (full === null || game === null || !full && !game) return false;
    const expectedVersions: LyricsVersion[] = [...(full ? ["full" as const] : []), ...(game ? ["game" as const] : [])];
    if (!sameAvailableVersions(value.availableVersions, expectedVersions) || !isV4Relation(value.relation, value.key, full, game)) return false;
    const components = new Set<string>();
    const ranks = ["full_text", "full_performer_segmentation", "full_ruby", "game_text", "game_performer_segmentation", "game_ruby", "relation", "version"];
    let previousRank = -1;
    for (const attribution of value.provenance) {
        if (!isV3Attribution(attribution, value.key) || components.has(attribution.component)) return false;
        const component = attribution.component.slice(`renditions/${value.key}/`.length);
        const rank = ranks.indexOf(component);
        if (rank <= previousRank) return false;
        previousRank = rank;
        components.add(attribution.component);
    }
    return true;
}

function isV4TranslationSide(value: unknown, expectedLineCount: number): value is ILyricsV4TranslationSide {
    return isObject(value)
        && hasOnlyKeys(value, ["translations"])
        && Array.isArray(value.translations)
        && value.translations.length === expectedLineCount
        && value.translations.length <= MAX_LYRICS_LINES
        && value.translations.every((translation) => typeof translation === "string" && translation.length <= MAX_LYRICS_TEXT_LENGTH);
}

function isV4TranslationEditionRendition(
    value: unknown,
    sourceRendition: ILyricsV4SourceRendition,
): value is ILyricsV4TranslationEditionRendition {
    if (!isObject(value) || !hasOnlyKeys(value, ["renditionKey", "translationCredits", "full", "game"])
        || value.renditionKey !== sourceRendition.key
        || value.translationCredits !== undefined && !isTranslationCredits(value.translationCredits)) return false;
    const fullLineCount = sourceRendition.full?.lines.length ?? 0;
    const gameLineCount = sourceRendition.game?.lines.length ?? 0;
    const full = value.full === undefined ? undefined : isV4TranslationSide(value.full, fullLineCount) ? value.full : null;
    const game = value.game === undefined ? undefined : isV4TranslationSide(value.game, gameLineCount) ? value.game : null;
    if (full === null || game === null) return false;
    if (sourceRendition.relation.kind === "exact_projection") {
        return Boolean(sourceRendition.full && sourceRendition.game && full && !game);
    }
    return Boolean(sourceRendition.full) === Boolean(full) && Boolean(sourceRendition.game) === Boolean(game);
}

function isV4TranslationEdition(
    value: unknown,
    previousKey: string,
    sourceRenditions: readonly ILyricsV4SourceRendition[],
): value is ILyricsV4TranslationEdition {
    if (!isObject(value) || !hasOnlyKeys(value, ["key", "label", "renditions"])
        || typeof value.key !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.key) || value.key <= previousKey
        || typeof value.label !== "string" || value.label.length === 0
        || new TextEncoder().encode(value.label).byteLength > MAX_LYRICS_V4_EDITION_LABEL_LENGTH
        || value.label !== value.label.trim()
        || !Array.isArray(value.renditions) || value.renditions.length !== sourceRenditions.length) return false;
    return value.renditions.every((rendition, index) => isV4TranslationEditionRendition(rendition, sourceRenditions[index] as ILyricsV4SourceRendition));
}

function validateDocumentV4(value: Record<string, unknown>, publication: ILyricsIndexEntry): ILyricsDocumentV4 {
    if (!hasOnlyKeys(value, ["version", "musicId", "revision", "updatedAt", "state", "defaultTranslationEditionKey", "translationEditions", "renditions"])
        || (value.state !== "complete" && value.state !== "game_only") || value.state !== publication.state
        || typeof value.defaultTranslationEditionKey !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.defaultTranslationEditionKey)
        || !Array.isArray(value.translationEditions) || value.translationEditions.length === 0 || value.translationEditions.length > MAX_LYRICS_V4_TRANSLATION_EDITIONS
        || !Array.isArray(value.renditions) || value.renditions.length === 0 || value.renditions.length > MAX_LYRICS_V3_RENDITIONS) {
        throw new LyricsLoadError("Invalid lyrics document");
    }
    const renditions: ILyricsV4SourceRendition[] = [];
    let previousRenditionKey = "";
    let hasFull = false;
    let hasGame = false;
    for (const rendition of value.renditions) {
        if (!isV4SourceRendition(rendition, previousRenditionKey)) throw new LyricsLoadError("Invalid lyrics document");
        previousRenditionKey = rendition.key;
        hasFull ||= rendition.full !== undefined;
        hasGame ||= rendition.game !== undefined;
        renditions.push(rendition);
    }
    let previousEditionKey = "";
    let hasDefaultEdition = false;
    for (const edition of value.translationEditions) {
        if (!isV4TranslationEdition(edition, previousEditionKey, renditions)) throw new LyricsLoadError("Invalid lyrics document");
        previousEditionKey = edition.key;
        hasDefaultEdition ||= edition.key === value.defaultTranslationEditionKey;
    }
    if (!hasDefaultEdition || !hasFull && !hasGame || value.state === "game_only" && hasFull
        || !publication.availableVersions
        || !sameAvailableVersions(publication.availableVersions, getLyricsAvailableVersions({
            version: LYRICS_SCHEMA_VERSION_V4,
            musicId: value.musicId as number,
            revision: value.revision as number,
            updatedAt: value.updatedAt as string,
            state: value.state,
            defaultTranslationEditionKey: value.defaultTranslationEditionKey,
            translationEditions: value.translationEditions,
            renditions,
        } as ILyricsDocumentV4))) throw new LyricsLoadError("Invalid lyrics document");
    return value as unknown as ILyricsDocumentV4;
}

function validateDocumentV3(value: Record<string, unknown>, publication: ILyricsIndexEntry): ILyricsDocumentV3 {
    if (!hasOnlyKeys(value, ["version", "musicId", "revision", "updatedAt", "state", "renditions"])
        || (value.state !== "complete" && value.state !== "game_only") || value.state !== publication.state
        || !Array.isArray(value.renditions) || value.renditions.length === 0 || value.renditions.length > MAX_LYRICS_V3_RENDITIONS) {
        throw new LyricsLoadError("Invalid lyrics document");
    }
    const renditions: ILyricsRendition[] = [];
    let previousKey = "";
    let hasFull = false;
    let hasGame = false;
    for (const rendition of value.renditions) {
        if (!isV3Rendition(rendition, previousKey)) throw new LyricsLoadError("Invalid lyrics document");
        previousKey = rendition.key;
        hasFull ||= rendition.full !== undefined;
        hasGame ||= rendition.game !== undefined;
        renditions.push(rendition);
    }
    if (!hasFull && !hasGame || value.state === "game_only" && hasFull
        || !publication.availableVersions
        || !sameAvailableVersions(publication.availableVersions, getLyricsAvailableVersions({
            version: LYRICS_SCHEMA_VERSION_V3,
            musicId: value.musicId as number,
            revision: value.revision as number,
            updatedAt: value.updatedAt as string,
            state: value.state,
            renditions,
        } as ILyricsDocumentV3))) throw new LyricsLoadError("Invalid lyrics document");
    return value as unknown as ILyricsDocumentV3;
}

function validateDocument(value: unknown, publication: ILyricsIndexEntry, indexVersion: ILyricsIndex["version"]): ILyricsDocument {
    if (!isObject(value)) throw new LyricsLoadError("Invalid lyrics document");
    // Database-overlaid legacy publications are served as version-1 details
    // inside the reviewed v3 index; they validate with the legacy v1 rules.
    const isLegacyDetailUnderV3Index = indexVersion === LYRICS_SCHEMA_VERSION_V3 && value.version === LYRICS_SCHEMA_VERSION_V1;
    const isV4DetailUnderV3Index = indexVersion === LYRICS_SCHEMA_VERSION_V3 && value.version === LYRICS_SCHEMA_VERSION_V4;
    if (
        value.version !== indexVersion && !isLegacyDetailUnderV3Index && !isV4DetailUnderV3Index
        || value.musicId !== publication.musicId
    ) {
        throw new LyricsLoadError("Invalid lyrics document");
    }
    if (
        value.revision !== publication.revision
        || !isDateTime(value.updatedAt)
        || value.updatedAt !== publication.updatedAt
    ) {
        throw new LyricsPublicationMismatchError();
    }
    if (indexVersion === LYRICS_SCHEMA_VERSION_V4 || isV4DetailUnderV3Index) return validateDocumentV4(value, publication);
    if (indexVersion === LYRICS_SCHEMA_VERSION_V3 && !isLegacyDetailUnderV3Index) return validateDocumentV3(value, publication);
    if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LYRICS_LINES) {
        throw new LyricsLoadError("Invalid lyrics document");
    }

    const isV1 = indexVersion === LYRICS_SCHEMA_VERSION_V1 || isLegacyDetailUnderV3Index;
    if (isV1) {
        if (
            !hasOnlyKeys(value, ["version", "musicId", "revision", "updatedAt", "attribution", "attributions", "lines"])
            || (value.attribution !== undefined && (typeof value.attribution !== "string"
                || value.attribution.trim().length === 0
                || value.attribution.length > MAX_LYRICS_ATTRIBUTION_LENGTH))
            || (value.attributions !== undefined && !isAttributions(value.attributions))
            || (value.attribution === undefined && value.attributions === undefined)
        ) {
            throw new LyricsLoadError("Invalid lyrics document");
        }
    } else if (
        !hasOnlyKeys(value, ["version", "musicId", "revision", "updatedAt", "state", "attributions", "translationCredits", "availableVersions", "lines", "gameProjection"])
        || (value.state !== "complete" && value.state !== "game_only")
        || (value.translationCredits !== undefined && !isTranslationCredits(value.translationCredits))
        || value.state !== publication.state
        || !isAttributions(value.attributions)
        || !isAvailableVersions(value.availableVersions)
        || !publication.availableVersions
        || !sameAvailableVersions(value.availableVersions, publication.availableVersions)
    ) {
        throw new LyricsLoadError("Invalid lyrics document");
    }

    const lineIds = new Set<string>();
    let previousOrder = -1;
    for (const line of value.lines) {
        const validLine = isV1 ? isLineV1(line) : isLineV2(line);
        if (!validLine || lineIds.has(line.id) || line.order <= previousOrder) {
            throw new LyricsLoadError("Invalid lyrics document");
        }
        lineIds.add(line.id);
        previousOrder = line.order;
    }

    if (!isV1) {
        const availableVersions = value.availableVersions as LyricsAvailableVersions;
        const lines = value.lines as ILyricsLineV2[];
        if (value.state === "game_only") {
            if (!sameAvailableVersions(availableVersions, ["game"]) || value.gameProjection !== undefined) {
                throw new LyricsLoadError("Invalid lyrics document");
            }
        } else {
            const advertisesGame = availableVersions.length === 2;
            if (availableVersions[0] !== "full"
                || (advertisesGame ? !isGameProjection(value.gameProjection, lines) : value.gameProjection !== undefined)) {
                throw new LyricsLoadError("Invalid lyrics document");
            }
        }
    }
    return value as unknown as ILyricsDocument;
}

async function readJsonLimited(response: Response): Promise<unknown> {
    const contentLengthHeader = response.headers?.get("content-length");
    if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
        if (!/^\d+$/.test(contentLengthHeader)) {
            throw new LyricsLoadError("Invalid lyrics artifact content length");
        }
        const contentLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(contentLength)) {
            throw new LyricsLoadError("Invalid lyrics artifact content length");
        }
        if (contentLength > MAX_LYRICS_ARTIFACT_BYTES) {
            throw new LyricsLoadError("Lyrics artifact is too large");
        }
    }

    if (!response.body?.getReader) {
        throw new LyricsLoadError("Lyrics artifact response is not stream-readable");
    }

    const reader = response.body.getReader();
    if (contentLengthHeader === "0") {
        await reader.cancel();
        throw new LyricsLoadError("Invalid lyrics JSON");
    }
    let bytes = new Uint8Array();
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) {
            await reader.cancel();
            throw new LyricsLoadError("Invalid lyrics artifact body");
        }
        const nextTotal = total + value.byteLength;
        if (nextTotal > MAX_LYRICS_ARTIFACT_BYTES) {
            await reader.cancel();
            throw new LyricsLoadError("Lyrics artifact is too large");
        }
        if (bytes.length < nextTotal) {
            const expanded = new Uint8Array(Math.min(
                MAX_LYRICS_ARTIFACT_BYTES,
                Math.max(nextTotal, bytes.length * LYRICS_BUFFER_GROWTH_FACTOR, INITIAL_LYRICS_BUFFER_BYTES),
            ));
            expanded.set(bytes.subarray(0, total));
            bytes = expanded;
        }
        bytes.set(value, total);
        total = nextTotal;
    }

    if (total === 0) throw new LyricsLoadError("Invalid lyrics JSON");
    try {
        return parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, total)));
    } catch {
        throw new LyricsLoadError("Invalid lyrics JSON");
    }
}

function callerAbortReason(signal: AbortSignal): unknown {
    if (signal.reason !== undefined) return signal.reason;
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
}

function sanitizeCallerError(error: unknown): unknown {
    if (error instanceof LyricsLoadError || error instanceof Error && error.name === "AbortError") return error;
    return new LyricsLoadError("Lyrics artifact request failed");
}

function waitForCaller<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return request.catch((error) => {
        throw sanitizeCallerError(error);
    });
    if (signal.aborted) return Promise.reject(callerAbortReason(signal));
    const callerSignal = signal;

    return new Promise<T>((resolve, reject) => {
        function cleanup() {
            callerSignal.removeEventListener("abort", abort);
        }
        function abort() {
            cleanup();
            reject(callerAbortReason(callerSignal));
        }
        callerSignal.addEventListener("abort", abort, { once: true });
        request.then(
            (value) => { cleanup(); resolve(value); },
            (error) => { cleanup(); reject(sanitizeCallerError(error)); },
        );
        if (callerSignal.aborted) abort();
    });
}

function waitForRetry(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

async function fetchPublishedJsonOnce(url: string): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;

    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, LYRICS_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            throw new LyricsLoadError(`Lyrics artifact request failed (${response.status})`, response.status, retryable);
        }
        return await readJsonLimited(response);
    } catch (error) {
        if (timedOut) throw new LyricsLoadError("Lyrics artifact request timed out", undefined, true);
        if (error instanceof LyricsLoadError) throw error;
        throw new LyricsLoadError("Lyrics artifact request failed", undefined, true);
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchPublishedJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await fetchPublishedJsonOnce(url);
        } catch (error) {
            if (!(error instanceof LyricsLoadError) || !error.retryable || attempt >= LYRICS_FETCH_RETRY_LIMIT) {
                throw error;
            }
            await waitForRetry(LYRICS_FETCH_RETRY_DELAY_MS * (attempt + MIN_LYRICS_ENTITY_ID));
        }
    }
}

export async function fetchLyricsIndex(signal?: AbortSignal): Promise<ILyricsIndex> {
    if (signal?.aborted) throw callerAbortReason(signal);

    const baseUrl = getLyricsBaseUrl();
    const cacheAge = Date.now() - indexCachedAt;
    if (indexCache && indexCacheSourceUrl === baseUrl && cacheAge >= 0 && cacheAge < LYRICS_CACHE_TTL_MS) return indexCache;
    if (indexCacheSourceUrl !== baseUrl) {
        indexCache = null;
        indexCacheSourceUrl = "";
        indexCachedAt = 0;
    }

    if (indexRequest && indexRequestSourceUrl !== baseUrl) {
        void indexRequest.catch(() => undefined);
        indexRequest = null;
        indexRequestSourceUrl = "";
    }
    if (!indexRequest) {
        const staleIndex = indexCache && indexCacheSourceUrl === baseUrl ? indexCache : null;
        const request = fetchPublishedJson(`${baseUrl}/${LYRICS_INDEX_FILENAME}`)
            .then(validateIndex)
            .then((index) => {
                indexCache = index;
                indexCacheSourceUrl = baseUrl;
                indexCachedAt = Date.now();
                return index;
            })
            .catch((error) => {
                // A validated stale index is safer than turning a transient transport/source
                // outage into a false unpublication. Validation and other contract failures
                // still fail closed. Do not refresh cachedAt: the next caller retries.
                if (staleIndex && error instanceof LyricsLoadError && error.retryable) return staleIndex;
                throw error;
            });
        indexRequest = request;
        indexRequestSourceUrl = baseUrl;
        const clearIndexRequest = () => {
            if (indexRequest === request && indexRequestSourceUrl === baseUrl) {
                indexRequest = null;
                indexRequestSourceUrl = "";
            }
        };
        void request.then(clearIndexRequest, clearIndexRequest);
    }
    const request = indexRequest;
    if (!request) throw new LyricsLoadError("Lyrics artifact request failed");
    const index = await waitForCaller(request, signal);
    if (baseUrl !== getLyricsBaseUrl()) return fetchLyricsIndex(signal);
    return index;
}

export async function getPublishedLyricsIndexEntry(musicId: number, signal?: AbortSignal): Promise<ILyricsIndexEntry | null> {
    if (!Number.isInteger(musicId) || musicId < MIN_LYRICS_ENTITY_ID) return null;
    const index = await fetchLyricsIndex(signal);
    return index.songs.find((song) => song.musicId === musicId) ?? null;
}

// Expire the index snapshot without touching validated detail documents so the
// next read re-resolves publications from the origin.
function invalidateLyricsIndexCache(): void {
    indexCache = null;
    indexCacheSourceUrl = "";
    indexCachedAt = 0;
    indexRequest = null;
    indexRequestSourceUrl = "";
}

function isCurrentPublicationSnapshot(
    baseUrl: string,
    indexVersion: ILyricsIndex["version"],
    publication: ILyricsIndexEntry,
): boolean {
    if (!indexCache || indexCacheSourceUrl !== baseUrl) return true;
    if (indexCache.version !== indexVersion) return false;
    const current = indexCache.songs.find((song) => song.musicId === publication.musicId);
    if (!current) return false;
    return current.revision === publication.revision
        && current.updatedAt === publication.updatedAt
        && current.state === publication.state
        && current.noLyricsReason === publication.noLyricsReason
        && sameAvailableVersions(getLyricsAvailableVersions(current), getLyricsAvailableVersions(publication));
}

// The published revision is appended as a query parameter so every revision
// occupies its own CDN cache key. An edge node holding the previous detail for
// an unexpired TTL therefore cannot answer a request for the new revision.
function lyricsDocumentUrl(baseUrl: string, musicId: number, revision: number): string {
    const path = `${baseUrl}/${LYRICS_DOCUMENT_FILENAME_PREFIX}${musicId}.json`;
    if (!Number.isSafeInteger(revision) || revision < MIN_LYRICS_ENTITY_ID) return path;
    return `${path}?${LYRICS_DOCUMENT_REVISION_PARAM}=${revision}`;
}

export async function fetchLyricsDocument(musicId: number, signal?: AbortSignal): Promise<ILyricsDocument> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await fetchLyricsDocumentFromCurrentSource(musicId, signal, LYRICS_SOURCE_CHANGE_RETRY_LIMIT);
        } catch (error) {
            if (!(error instanceof LyricsPublicationMismatchError) || attempt >= LYRICS_REVISION_MISMATCH_RETRY_LIMIT) {
                throw error;
            }
            // Drop the cached index so the retry re-resolves the publication, then
            // wait out the remainder of the artifact TTL skew.
            invalidateLyricsIndexCache();
            await waitForRetry(LYRICS_REVISION_MISMATCH_RETRY_DELAY_MS * (attempt + MIN_LYRICS_ENTITY_ID));
            if (signal?.aborted) throw callerAbortReason(signal);
        }
    }
}

async function fetchLyricsDocumentFromCurrentSource(
    musicId: number,
    signal: AbortSignal | undefined,
    sourceChangeRetries: number,
): Promise<ILyricsDocument> {
    if (!Number.isInteger(musicId) || musicId < MIN_LYRICS_ENTITY_ID) {
        throw new LyricsLoadError("Invalid lyrics music ID");
    }
    if (signal?.aborted) throw callerAbortReason(signal);

    const baseUrl = getLyricsBaseUrl();
    const index = await fetchLyricsIndex(signal);
    const publication = index.songs.find((song) => song.musicId === musicId) ?? null;
    if (!publication || !hasLyricsDetail(publication)) {
        throw new LyricsLoadError("Lyrics detail is not available", HTTP_NOT_FOUND);
    }

    if (baseUrl !== getLyricsBaseUrl()) {
        if (sourceChangeRetries <= 0) throw new LyricsLoadError("Lyrics source changed during request");
        return fetchLyricsDocumentFromCurrentSource(musicId, signal, sourceChangeRetries - MIN_LYRICS_ENTITY_ID);
    }
    const versionKey = publication.availableVersions?.join(",") ?? "full";
    const cacheKey = `${baseUrl}:${musicId}:${index.version}:${publication.state ?? "legacy"}:${versionKey}:${publication.revision}:${publication.updatedAt}`;
    const cached = detailCache.get(cacheKey);
    const cachedAge = cached ? Date.now() - cached.cachedAt : null;
    if (cached && cachedAge !== null && cachedAge >= 0 && cachedAge < LYRICS_CACHE_TTL_MS) {
        detailCache.delete(cacheKey);
        detailCache.set(cacheKey, cached);
        return cached.document;
    }

    let request = detailRequests.get(cacheKey);
    if (!request) {
        const staleDocument = cached?.document ?? null;
        const createdRequest = fetchPublishedJson(lyricsDocumentUrl(baseUrl, musicId, publication.revision))
            .then((value) => validateDocument(value, publication, index.version))
            .then((document) => {
                if (!isCurrentPublicationSnapshot(baseUrl, index.version, publication)) return document;
                for (const key of detailCache.keys()) {
                    if (key.startsWith(`${baseUrl}:${musicId}:`) && key !== cacheKey) detailCache.delete(key);
                }
                detailCache.delete(cacheKey);
                detailCache.set(cacheKey, { document, cachedAt: Date.now() });
                while (detailCache.size > LYRICS_DETAIL_CACHE_LIMIT) {
                    const oldest = detailCache.keys().next().value as string | undefined;
                    if (oldest === undefined) break;
                    detailCache.delete(oldest);
                }
                return document;
            })
            .catch((error) => {
                // The index still publishes this exact revision. Preserve its last validated
                // detail only for transient transport/source outages. Malformed replacement
                // bytes still fail closed. Keep the stale entry expired so the next call retries.
                if (staleDocument && error instanceof LyricsLoadError && error.retryable) {
                    detailCache.delete(cacheKey);
                    detailCache.set(cacheKey, cached as CachedLyricsDocument);
                    return staleDocument;
                }
                throw error;
            });
        request = createdRequest;
        detailRequests.set(cacheKey, createdRequest);
        const clearTrackedRequest = () => {
            if (detailRequests.get(cacheKey) === createdRequest) detailRequests.delete(cacheKey);
        };
        void createdRequest.then(clearTrackedRequest, clearTrackedRequest);
    }
    if (!request) throw new LyricsLoadError("Lyrics artifact request failed");
    const document = await waitForCaller(request, signal);
    if (baseUrl !== getLyricsBaseUrl()) {
        if (sourceChangeRetries <= 0) throw new LyricsLoadError("Lyrics source changed during request");
        return fetchLyricsDocumentFromCurrentSource(musicId, signal, sourceChangeRetries - MIN_LYRICS_ENTITY_ID);
    }
    if (!isCurrentPublicationSnapshot(baseUrl, index.version, publication)) {
        if (sourceChangeRetries <= 0) throw new LyricsLoadError("Lyrics publication changed during request");
        return fetchLyricsDocumentFromCurrentSource(musicId, signal, sourceChangeRetries - MIN_LYRICS_ENTITY_ID);
    }
    return document;
}

export function clearLyricsCache(): void {
    indexCache = null;
    indexCacheSourceUrl = "";
    indexCachedAt = 0;
    indexRequest = null;
    indexRequestSourceUrl = "";
    detailCache.clear();
    detailRequests.clear();
}
