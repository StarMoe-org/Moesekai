/**
 * Virtual live MC script parsers.
 *
 * Mirrors the crawler's Virtual_live_getter (pjsk_story/crawler src/pjsk.py):
 * - `mc` setlists read `virtual_live/mc/scenario/{abn}/{abn}.json`, a stage
 *   scenario asset whose talk/spawn/unspawn event tables share one Id space;
 * - `mc_timeline` / `virtual_message` setlists read
 *   `virtual_live/mc/timeline/{abn}/{abn}.json`, a `virtual-live-timeline`
 *   Unity dump whose tracks carry CharacterId and clips whose `$ref` points at
 *   the talk/serif objects.
 *
 * Parsers are pure: character naming is injected via McCharacterResolver so the
 * caller can localize names (i18n) without coupling this module to React.
 */

export type McSetlistKind = "scenario" | "timeline";

/** setlist type → which MC asset kind to fetch; non-MC types return null. */
export function getSetlistMcKind(virtualLiveSetlistType: string): McSetlistKind | null {
    if (virtualLiveSetlistType === "mc") return "scenario";
    if (virtualLiveSetlistType === "mc_timeline" || virtualLiveSetlistType === "virtual_message") return "timeline";
    return null;
}

export interface IMcCharacterInfo {
    /** Game character id (1-26) for avatar/name; 0 when unknown. */
    characterId: number;
    /** Actual unit field of the 3d model; set for virtual singers appearing as another unit. */
    unitField?: string;
    name: string;
}

export type McCharacterResolver = (character3dId?: number | null, fallbackName?: string) => IMcCharacterInfo | null;

export interface IMcScriptLine {
    kind: "talk" | "spawn" | "unspawn";
    character: IMcCharacterInfo | null;
    text?: string;
}

/** Collapse CR/LF variants into spaces, like the crawler's serif normalization. */
function normalizeSerif(serif: unknown): string {
    return typeof serif === "string" ? serif.replace(/\r\n|\r|\n/g, " ").trim() : "";
}

interface IMcScenarioEvent {
    Id?: number;
    Character3dId?: number;
    Serif?: string;
}

interface IMcScenarioAsset {
    characterTalkEvents?: IMcScenarioEvent[];
    characterSpawnEvents?: IMcScenarioEvent[];
    characterUnspawnEvents?: IMcScenarioEvent[];
}

/** Parse an `mc` scenario asset: merge the three event tables and sort by Id. */
export function parseMcScenarioAsset(data: unknown, resolve: McCharacterResolver): IMcScriptLine[] {
    const asset = (data ?? {}) as IMcScenarioAsset;
    const tables: Array<{ kind: IMcScriptLine["kind"]; events?: IMcScenarioEvent[] }> = [
        { kind: "spawn", events: asset.characterSpawnEvents },
        { kind: "unspawn", events: asset.characterUnspawnEvents },
        { kind: "talk", events: asset.characterTalkEvents },
    ];

    const events: Array<{ kind: IMcScriptLine["kind"]; id: number; character3dId?: number; serif: string }> = [];
    for (const { kind, events: rows } of tables) {
        for (const row of rows ?? []) {
            events.push({
                kind,
                id: typeof row.Id === "number" ? row.Id : 0,
                character3dId: typeof row.Character3dId === "number" ? row.Character3dId : undefined,
                serif: kind === "talk" ? normalizeSerif(row.Serif) : "",
            });
        }
    }
    events.sort((a, b) => a.id - b.id);

    const lines: IMcScriptLine[] = [];
    for (const ev of events) {
        if (ev.kind === "talk") {
            if (!ev.serif) continue;
            lines.push({
                kind: "talk",
                character: resolve(ev.character3dId, "???"),
                text: ev.serif,
            });
        } else {
            lines.push({ kind: ev.kind, character: resolve(ev.character3dId, "???") });
        }
    }
    return lines;
}

const MOE_TRACK_KINDS: Record<string, IMcScriptLine["kind"]> = {
    MCTimelineCharacterTalkTrack: "talk",
    MCTimelineCharacterSpawnTrack: "spawn",
    MCTimelineCharacterUnSpawnTrack: "unspawn",
};

interface IMoeObject {
    script?: string | null;
    name?: string | null;
    fields?: {
        CharacterId?: number | null;
        Character?: string | null;
        m_Clips?: Array<{
            m_Start?: number;
            m_Asset?: { $ref?: number } | null;
        }> | null;
    };
}

interface IMoeTimelineDump {
    format?: string;
    objects?: IMoeObject[];
}

/** Clip asset objects referenced by m_Asset.$ref carry the serif text. */
interface IMoeClipAsset {
    Serif?: string | null;
    CueName?: string | null;
}

/** Track names look like みのり_Talk / みのり_入場; Unity duplicates carry ' (1)'. */
function trackFallbackName(track: IMoeObject): string | undefined {
    const name = (track.name ?? "").replace(/ \(\d+\)$/, "").replace(/_(Talk|入場|退場)$/, "").trim();
    return name || undefined;
}

/** Parse a `virtual-live-timeline` dump (mc_timeline / virtual_message) into lines sorted by m_Start. */
export function parseMcTimelineDump(data: unknown, resolve: McCharacterResolver): IMcScriptLine[] {
    const dump = (data ?? {}) as IMoeTimelineDump;
    const objects = dump.objects ?? [];

    const events: Array<{ kind: IMcScriptLine["kind"]; start: number; character3dId?: number; fallbackName?: string; serif: string }> = [];
    for (const obj of objects) {
        const kind = MOE_TRACK_KINDS[(obj.script ?? "").split(".").pop() ?? ""];
        if (!kind) continue;
        const fields = obj.fields ?? {};
        const character3dId = typeof fields.CharacterId === "number" ? fields.CharacterId : undefined;
        const fallbackName = trackFallbackName(obj) ?? (typeof fields.Character === "string" && fields.Character.trim() ? fields.Character.trim() : undefined);
        for (const clip of fields.m_Clips ?? []) {
            const ref = clip.m_Asset?.$ref;
            if (typeof ref !== "number" || !Number.isInteger(ref) || ref < 0 || ref >= objects.length) continue;
            const asset = (objects[ref]?.fields ?? {}) as IMoeClipAsset;
            events.push({
                kind,
                start: typeof clip.m_Start === "number" ? clip.m_Start : 0,
                character3dId,
                fallbackName,
                serif: kind === "talk" ? normalizeSerif(asset.Serif) : "",
            });
        }
    }
    events.sort((a, b) => a.start - b.start);

    const lines: IMcScriptLine[] = [];
    for (const ev of events) {
        if (ev.kind === "talk") {
            if (!ev.serif) continue;
            lines.push({
                kind: "talk",
                character: resolve(ev.character3dId, ev.fallbackName),
                text: ev.serif,
            });
        } else {
            lines.push({ kind: ev.kind, character: resolve(ev.character3dId, ev.fallbackName) });
        }
    }
    return lines;
}
