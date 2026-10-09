/**
 * Sekai chart (SUS) analysis
 *
 * Reads a chart the way the game's `Sekai.SUS.Converter` does, so the combo
 * count matches masterdata `totalNoteCount`, and reports where the six skills
 * and the Fever fall. Line syntax, the overlay rules for notes written twice at
 * one place, long-note combo ticks and the scoring set follow the reverse
 * engineering of the CN 6.0.0 client; JP is assumed to share the parser.
 *
 * Times are in seconds from chart bar 0 (audio time = chart time + fillerSec).
 * BPM changes take effect at their slot and are integrated piecewise.
 *
 * Fever exists only in multi-player lives. The chart marks FeverBegin and
 * FeverStart; `Converter.ConvertEventList` pairs them and derives the rest:
 * the scoring notes in the first 90% of [FeverBegin, FeverStart) are the charge
 * notes, and Fever ends on the (combo / 10)-th scoring note from FeverStart.
 */

// NoteCategory, in the game's numbering
const NORMAL = 0;
const LONG = 1;
const CONNECTION = 2;
const FLICK = 3;
const FRICTION = 4;
const FRICTION_HIDE = 5;
const FRICTION_LONG = 6;
const FRICTION_HIDE_LONG = 7;
const FRICTION_FLICK = 8;
const COMBO = 12;
const HIDDEN = 13;
const SKIP = 14;

const NOTE_TYPE_CRITICAL = 1;

/** Combo ticks per bar on a long note (`LiveBundleBuildData.LongNoteComboBeat`). */
const LONG_NOTE_COMBO_BEAT = 8;

/** How long one skill stays active (`MultiSkillLogic.skillActiveInterval`). */
export const SKILL_DURATION_SEC = 5;

/** Share of [FeverBegin, FeverStart) whose notes charge the Fever gauge. */
const FEVER_CHARGE_SPAN = 0.9;

/** Fever lasts for this fraction of the chart's combo, counted in notes from FeverStart. */
const FEVER_NOTE_DIVISOR = 10;

/** Scores inside a Fever are multiplied by this (`MultiLiveUtility.CalcAddScore`). */
export const FEVER_SCORE_FACTOR = 1.5;

/** Categories whose notes have no judgment: they neither score nor count toward combo. */
const NO_JUDGMENT = new Set([FRICTION_HIDE, FRICTION_HIDE_LONG, 9, 10, 11, HIDDEN]);

/** `ingameNotes.scoreCoefficient` ÷ 10, as [default, critical]. */
const SCORE_COEFFICIENT: Record<number, [number, number]> = {
    [NORMAL]: [1, 2],
    [LONG]: [1, 2],
    [CONNECTION]: [0.1, 0.2],
    [FLICK]: [1, 3],
    [FRICTION]: [0.1, 0.2],
    [FRICTION_LONG]: [0.1, 0.2],
    [FRICTION_FLICK]: [1, 3],
    [COMBO]: [0.1, 0.1],
};

const SHORT_LINE = /^#(\d{3})([0-9a-z]{2}):(.+)/;
const LONG_LINE = /^#(\d{3})(\d)([0-9a-z])([0-9a-z]):(.+)/;
const BPM_LINE = /^#BPM([0-9A-Z]{2}):(.+)/;

/** Note groups shown to the reader; each scoring note belongs to exactly one. */
export type ChartNoteKind = "tap" | "flick" | "trace" | "holdStart" | "holdEnd" | "holdRelay" | "holdTick";

export interface ChartScoringNote {
    time: number;
    kind: ChartNoteKind;
    critical: boolean;
    coefficient: number;
}

export interface ChartWindowStats {
    start: number;
    end: number;
    noteCount: number;
    /** Sum of note score coefficients inside the window. */
    weight: number;
    /** weight / the chart's total weight */
    weightShare: number;
}

export interface ChartFever {
    /** FeverBegin to FeverStart; its notes are the ones whose judgments charge the gauge. */
    chance: ChartWindowStats;
    /** FeverStart to FeverEnd; joined players score ×1.5 on these notes. */
    fever: ChartWindowStats;
}

export interface ChartAnalysis {
    /** Every note that scores and counts toward combo, ordered by time. */
    notes: ChartScoringNote[];
    combo: number;
    totalWeight: number;
    kindCounts: Record<ChartNoteKind, number>;
    criticalCount: number;
    firstNoteTime: number;
    lastNoteTime: number;
    /** Most scoring notes inside any one-second span. */
    peakNotesPerSecond: number;
    bpms: number[];
    skills: ChartWindowStats[];
    fevers: ChartFever[];
}

interface NoteInfo {
    bar: number;
    progress: number;
    category: number;
    type: number;
    longNo: number;
}

interface TreeNote {
    bar: number;
    progress: number;
    category: number;
    critical: boolean;
    isTail: boolean;
}

/** Bar position as the game keys it: float32(bar) + float32(i) / float32(n). */
function barKey(bar: number, progress: number): number {
    return Math.fround(Math.fround(bar) + progress);
}

/** `GetNoteLine`: SUS lane char → lane; `2`…`d` are the 12 playable lanes, `f` is the event lane. */
function noteLane(ch: string): number {
    if (ch === "f") return 13;
    const value = parseInt(ch, 16);
    if (Number.isNaN(value) || value < 2 || value > 13) return -1;
    return value - 2;
}

/** `GetNoteWidth`: `1`…`9` → 1…9, `a`…`e` → 10…14. */
function noteWidth(ch: string): number {
    const value = parseInt(ch, 16);
    if (Number.isNaN(value) || value < 1 || value > 14) return -1;
    return value;
}

/** Splits a line's data into its two-character slots. */
function slotsOf(data: string): string[] {
    const slots: string[] = [];
    for (let i = 0; i < data.length; i += 2) slots.push(data.slice(i, i + 2));
    return slots;
}

class TimeMap {
    private readonly points: { pos: number; time: number; secPerBar: number }[] = [];

    constructor(bpmChanges: { pos: number; bpm: number }[], signatures: Map<number, number>, initialBpm: number) {
        const changes: { pos: number; bpm?: number; signature?: number }[] = [
            ...bpmChanges.map((c) => ({ pos: c.pos, bpm: c.bpm })),
            ...[...signatures].map(([bar, signature]) => ({ pos: bar, signature })),
        ].sort((a, b) => a.pos - b.pos);

        let bpm = initialBpm;
        let signature = 4;
        let pos = 0;
        let time = 0;
        let secPerBar = (signature * 60) / bpm;
        for (const change of changes) {
            if (change.pos > pos) {
                this.points.push({ pos, time, secPerBar });
                time += (change.pos - pos) * secPerBar;
                pos = change.pos;
            }
            if (change.bpm !== undefined) bpm = change.bpm;
            if (change.signature !== undefined) signature = change.signature;
            secPerBar = (signature * 60) / bpm;
        }
        this.points.push({ pos, time, secPerBar });
    }

    timeAt(pos: number): number {
        let point = this.points[0];
        for (const candidate of this.points) {
            if (candidate.pos > pos) break;
            point = candidate;
        }
        return point.time + (pos - point.pos) * point.secPerBar;
    }
}

function kindOf(note: TreeNote): ChartNoteKind {
    switch (note.category) {
        case LONG:
        case FRICTION_LONG:
            return "holdStart";
        case CONNECTION:
            return "holdRelay";
        case COMBO:
            return "holdTick";
        case FLICK:
        case FRICTION_FLICK:
            return "flick";
        case FRICTION:
            return "trace";
        default:
            return note.isTail ? "holdEnd" : "tap";
    }
}

function stats(notes: ChartScoringNote[], start: number, end: number, totalWeight: number): ChartWindowStats {
    const weight = notes.reduce((sum, note) => sum + note.coefficient, 0);
    return { start, end, noteCount: notes.length, weight, weightShare: totalWeight > 0 ? weight / totalWeight : 0 };
}

function windowStats(notes: ChartScoringNote[], start: number, end: number, totalWeight: number): ChartWindowStats {
    return stats(notes.filter((note) => note.time >= start && note.time < end), start, end, totalWeight);
}

export function analyzeSusChart(text: string): ChartAnalysis {
    const bpmMap = new Map<string, number>();
    const bpmRefs: { pos: number; id: string }[] = [];
    const signatures = new Map<number, number>();
    // EventType: 0 Skill, 1 FeverBegin, 2 FeverStart
    const events: { key: number; pos: number; type: number }[] = [];
    // time key → lane → note, both in insertion order
    const noteInfoDict = new Map<number, Map<number, NoteInfo>>();

    const addNote = (bar: number, progress: number, lane: number, width: number, category: number, type = 0, longNo = -1) => {
        if (width === -1 || lane < 0 || lane + width >= 13) return;
        const key = barKey(bar, progress);
        let lanes = noteInfoDict.get(key);
        if (!lanes) {
            lanes = new Map();
            noteInfoDict.set(key, lanes);
        }
        const current = lanes.get(lane);
        if (!current) {
            lanes.set(lane, { bar, progress, category, type, longNo });
            return;
        }
        // NoteInfo.Update: Normal is the "leave the category alone" sentinel
        if (category !== NORMAL) {
            if (category === LONG && current.category === FRICTION) current.category = FRICTION_LONG;
            else if (category === FLICK && current.category === FRICTION) current.category = FRICTION_FLICK;
            else if (category === LONG && current.category === FRICTION_HIDE) current.category = FRICTION_HIDE_LONG;
            else current.category = category;
        }
        if (type !== 0) current.type = type;
        if (longNo !== -1) current.longNo = longNo;
    };

    for (const rawLine of text.split("\n")) {
        if (rawLine.includes("#TIL00") || rawLine.includes("#VOLUME")) continue;

        const bpmMatch = BPM_LINE.exec(rawLine);
        if (bpmMatch) {
            const bpm = parseFloat(bpmMatch[2]);
            if (Number.isFinite(bpm) && bpm > 0) bpmMap.set(bpmMatch[1].toLowerCase(), bpm);
            continue;
        }

        const shortMatch = SHORT_LINE.exec(rawLine);
        if (shortMatch) {
            const bar = parseInt(shortMatch[1], 10);
            const channel = shortMatch[2];
            const data = shortMatch[3].replace(/\r/g, "");
            if (data.includes(",")) continue; // the speedRatio form never appears in released charts
            const compact = data.replace(/ /g, "");

            if (channel === "02") {
                const signature = parseFloat(compact);
                if (Number.isFinite(signature) && signature > 0) signatures.set(bar, signature);
                continue;
            }
            const slots = slotsOf(compact);
            if (channel === "08") {
                slots.forEach((slot, i) => {
                    if (slot !== "00") bpmRefs.push({ pos: bar + i / slots.length, id: slot.toLowerCase() });
                });
                continue;
            }

            const laneType = parseInt(channel[0], 10);
            if (laneType !== 1 && laneType !== 5) continue;
            const lane = noteLane(channel[1]);
            slots.forEach((slot, i) => {
                if (slot === "00" || slot.length < 2) return;
                const kind = parseInt(slot[0], 10);
                const width = noteWidth(slot[1]);
                const progress = Math.fround(i / slots.length);
                const pos = bar + i / slots.length;
                if (laneType === 1) {
                    if (lane === 13) {
                        if (kind === 1 || kind === 2) events.push({ key: barKey(bar, progress), pos, type: kind });
                        return;
                    }
                    switch (kind) {
                        case 1: addNote(bar, progress, lane, width, NORMAL); break;
                        case 2: addNote(bar, progress, lane, width, NORMAL, NOTE_TYPE_CRITICAL); break;
                        case 3: addNote(bar, progress, lane, width, SKIP); break;
                        case 4: events.push({ key: barKey(bar, progress), pos, type: 0 }); break;
                        case 5: addNote(bar, progress, lane, width, FRICTION); break;
                        case 6: addNote(bar, progress, lane, width, FRICTION, NOTE_TYPE_CRITICAL); break;
                        case 7: addNote(bar, progress, lane, width, FRICTION_HIDE); break;
                        case 8: addNote(bar, progress, lane, width, FRICTION_HIDE, NOTE_TYPE_CRITICAL); break;
                    }
                    return;
                }
                // Channel 5 marks flicks; its curve-only kinds (2, 5, 6) carry Normal and
                // so create a plain note when nothing is there yet.
                if (kind === 1 || kind === 3 || kind === 4) addNote(bar, progress, lane, width, FLICK);
                else if (kind === 2 || kind === 5 || kind === 6) addNote(bar, progress, lane, width, NORMAL);
            });
            continue;
        }

        const longMatch = LONG_LINE.exec(rawLine);
        if (longMatch) {
            // Guide lines (type 9) never score; only long notes (type 3) matter here.
            if (longMatch[2] !== "3") continue;
            const bar = parseInt(longMatch[1], 10);
            const lane = noteLane(longMatch[3]);
            const longNo = parseInt(longMatch[4], 16);
            const slots = slotsOf(longMatch[5].replace(/\r/g, "").trimEnd());
            slots.forEach((slot, i) => {
                if (slot === "00" || slot.length < 2) return;
                const kind = parseInt(slot[0], 10);
                const width = noteWidth(slot[1]);
                const progress = Math.fround(i / slots.length);
                switch (kind) {
                    case 1: addNote(bar, progress, lane, width, LONG, 0, longNo); break;
                    case 2: addNote(bar, progress, lane, width, NORMAL, 0, longNo); break;
                    case 3: addNote(bar, progress, lane, width, CONNECTION, 0, longNo); break;
                    case 5: addNote(bar, progress, lane, width, HIDDEN, 0, longNo); break;
                }
            });
        }
    }

    // ConvertNoteInfoDictionary: time keys ascending, lanes in insertion order
    const roots: TreeNote[][] = [];
    const openLongs = new Map<number, TreeNote[]>();

    // LongJoinCheck: closes the open long with this number at `note`, adding hidden combo
    // ticks every 1/8 bar strictly inside the hold. Returns false when none is open.
    const joinLong = (note: TreeNote, longNo: number): boolean => {
        const tree = longNo === -1 ? undefined : openLongs.get(longNo);
        if (!tree) return false;
        const head = tree[0];
        const B = LONG_NOTE_COMBO_BEAT;
        const first = head.bar * B + Math.floor(Math.fround(head.progress * B)) + 1;
        const last = note.bar * B + Math.ceil(Math.fround(note.progress * B)) - 1;
        for (let i = first; i <= last; i += 1) {
            tree.push({
                bar: Math.floor(i / B),
                progress: Math.fround((i % B) / B),
                category: COMBO,
                critical: head.critical,
                isTail: false,
            });
        }
        note.critical = note.critical || head.critical;
        tree.push(note);
        openLongs.delete(longNo);
        return true;
    };

    const keys = [...noteInfoDict.keys()].sort((a, b) => a - b);
    for (const key of keys) {
        for (const info of noteInfoDict.get(key)!.values()) {
            const { category } = info;
            const critical = info.type === NOTE_TYPE_CRITICAL;
            if (category > HIDDEN || category === COMBO) continue;
            const note: TreeNote = { bar: info.bar, progress: info.progress, category, critical, isTail: false };

            if (category === LONG || category === FRICTION_LONG || category === FRICTION_HIDE_LONG) {
                // A head whose number is still open also closes that long (the game logs an
                // error and joins anyway), so it sits in both the old long and its own.
                joinLong(note, info.longNo);
                const tree = [note];
                roots.push(tree);
                openLongs.set(info.longNo, tree);
            } else if (category === CONNECTION || category === HIDDEN) {
                const tree = openLongs.get(info.longNo);
                if (!tree) continue;
                note.critical = tree[0].critical;
                tree.push(note);
            } else if (joinLong(note, info.longNo)) {
                note.isTail = true;
            } else {
                roots.push([note]);
            }
        }
    }

    const initialBpmRef = bpmRefs.find((ref) => bpmMap.has(ref.id));
    const initialBpm = (initialBpmRef && bpmMap.get(initialBpmRef.id)) ?? bpmMap.values().next().value ?? 120;
    const bpmChanges = bpmRefs
        .filter((ref) => bpmMap.has(ref.id))
        .map((ref) => ({ pos: ref.pos, bpm: bpmMap.get(ref.id)! }));
    const timeMap = new TimeMap(bpmChanges, signatures, initialBpm);

    const notes: ChartScoringNote[] = [];
    for (const tree of roots) {
        for (const note of tree) {
            if (NO_JUDGMENT.has(note.category)) continue;
            const coefficients = SCORE_COEFFICIENT[note.category] ?? [1, 1];
            notes.push({
                time: timeMap.timeAt(note.bar + note.progress),
                kind: kindOf(note),
                critical: note.critical,
                coefficient: coefficients[note.critical ? 1 : 0],
            });
        }
    }
    notes.sort((a, b) => a.time - b.time);

    const kindCounts: Record<ChartNoteKind, number> = {
        tap: 0, flick: 0, trace: 0, holdStart: 0, holdEnd: 0, holdRelay: 0, holdTick: 0,
    };
    let criticalCount = 0;
    let totalWeight = 0;
    for (const note of notes) {
        kindCounts[note.kind] += 1;
        if (note.critical) criticalCount += 1;
        totalWeight += note.coefficient;
    }

    let peakNotesPerSecond = 0;
    for (let lo = 0, hi = 0; hi < notes.length; hi += 1) {
        while (notes[hi].time - notes[lo].time >= 1) lo += 1;
        peakNotesPerSecond = Math.max(peakNotesPerSecond, hi - lo + 1);
    }

    const firstNoteTime = notes.length > 0 ? notes[0].time : 0;
    const lastNoteTime = notes.length > 0 ? notes[notes.length - 1].time : 0;

    // ConvertEventList: events by time key; a FeverBegin waits for the next FeverStart
    events.sort((a, b) => a.key - b.key);
    const skills: ChartWindowStats[] = [];
    const fevers: ChartFever[] = [];
    let pendingBegin: number | null = null;
    for (const event of events) {
        const time = timeMap.timeAt(event.pos);
        if (event.type === 0) {
            skills.push(windowStats(notes, time, time + SKILL_DURATION_SEC, totalWeight));
        } else if (event.type === 1) {
            pendingBegin = time;
        } else if (pendingBegin !== null) {
            const begin = pendingBegin;
            pendingBegin = null;
            const chargeEnd = Math.fround(begin + Math.fround(Math.fround(time - begin) * Math.fround(FEVER_CHARGE_SPAN)));
            const chargeNotes = notes.filter((note) => note.time >= begin && note.time < chargeEnd);
            const feverNotes = notes.filter((note) => note.time >= time).slice(0, Math.floor(notes.length / FEVER_NOTE_DIVISOR));
            if (feverNotes.length === 0) continue;
            fevers.push({
                chance: stats(chargeNotes, begin, time, totalWeight),
                fever: stats(feverNotes, time, feverNotes[feverNotes.length - 1].time, totalWeight),
            });
        }
    }
    skills.sort((a, b) => a.start - b.start);

    return {
        notes,
        combo: notes.length,
        totalWeight,
        kindCounts,
        criticalCount,
        firstNoteTime,
        lastNoteTime,
        peakNotesPerSecond,
        bpms: [...new Set(bpmChanges.map((change) => change.bpm))],
        skills,
        fevers,
    };
}
