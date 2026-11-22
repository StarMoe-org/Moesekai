/**
 * Bidirectional lossless DSL compiler & serializer for **MoeSekai Script (`.msk`)**.
 *
 * Pure, zero-DOM module bridging visual `moesekai-story/2` node graphs and human/AI-readable
 * `.msk` source code:
 * - `serializeStoryScript(doc)`: serializes 100% of metadata, variables, cast, nodes (with `@pos`),
 *   stage slots, ordered beats, choices, conditions, endings, and edges into compact `.msk` text.
 * - `parseStoryScript(source)`: lexes & parses `.msk` into `StoryDocument` with precise `line:col`
 *   diagnostics and automatic DAG layout (`autoLayoutGraph`) for nodes omitting `@pos(x, y)`.
 */
import {
    CONDITION_OPS,
    EFFECT_COLORS,
    STORY_REGIONS,
    STORY_SCHEMA_VERSION,
    STORY_SLOTS,
    TRANSITION_KINDS,
    VOICE_KINDS,
    type ActorReaction,
    type BackgroundSlot,
    type BgmSlot,
    type ChoiceNode,
    type ChoiceOption,
    type ConditionExpr,
    type ConditionNode,
    type ConditionOp,
    type ConditionRule,
    type CueBeat,
    type EndNode,
    type NarrationBeat,
    type PlaceSlot,
    type SceneActorSlot,
    type SceneBeat,
    type SceneNode,
    type StageActionBeat,
    type StageCastSlot,
    type StartNode,
    type StoryCastMember,
    type StoryDocument,
    type StoryEdge,
    type StoryEffectColor,
    type StoryNode,
    type StoryNodePos,
    type StoryRegion,
    type StorySlot,
    type StoryVariable,
    type StoryVoiceKind,
    type StoryVoiceRef,
    type TalkBeat,
    type TelopBeat,
    type TransitionKind,
    type TransitionSlot,
    type VarOp,
} from "../../types/storyMaker.ts";
import { SUPPORTED_UI_LOCALES, isUiLocale, type UiLocale } from "../i18n/locales.ts";
import { autoLayoutGraph, clampCoord, getNodeOutPorts, newStoryId } from "./document.ts";
import { STORY_ID_PATTERN, STORY_LIMITS } from "./limits.ts";

export const STORY_SCRIPT_EXT = ".msk" as const;
export const STORY_SCRIPT_NAME = "MoeSekai Script" as const;

export interface StoryScriptDiagnostic {
    line: number;
    col: number;
    message: string;
}

export type StoryScriptParseResult =
    | { ok: true; doc: StoryDocument; diagnostics: StoryScriptDiagnostic[] }
    | { ok: false; diagnostics: StoryScriptDiagnostic[] };

// ==================== Helpers ====================

function escapeStr(value: string): string {
    let out = '"';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === "\\") out += "\\\\";
        else if (ch === '"') out += '\\"';
        else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += ch;
    }
    out += '"';
    return out;
}

function fmtNum(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function hash36(input: string): string {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

function makeDeterministicId(preferred: string, fallbackPrefix: string, used: Set<string>): string {
    if (STORY_ID_PATTERN.test(preferred) && !used.has(preferred)) {
        used.add(preferred);
        return preferred;
    }
    const base = `${fallbackPrefix}_${hash36(preferred)}`.slice(0, 26);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate) || !STORY_ID_PATTERN.test(candidate)) {
        candidate = `${base}_${suffix++}`.slice(0, 32);
    }
    used.add(candidate);
    return candidate;
}

function serializeVarOp(op: VarOp): string {
    if (op.op === "toggle") return `${op.varId} toggle`;
    if (op.op === "add") return `${op.varId} += ${fmtNum(op.value)}`;
    if (op.op === "sub") return `${op.varId} -= ${fmtNum(op.value)}`;
    if (typeof op.value === "boolean") return `${op.varId} = ${op.value ? "true" : "false"}`;
    return `${op.varId} = ${fmtNum(op.value ?? 0)}`;
}

function serializeCondition(expr: ConditionExpr): string {
    const val = typeof expr.value === "boolean" ? (expr.value ? "true" : "false") : fmtNum(expr.value);
    return `${expr.varId} ${expr.op} ${val}`;
}

function serializeVoice(voice: StoryVoiceRef): string {
    let trim = "";
    if (voice.start !== undefined || voice.end !== undefined) {
        const s = voice.start !== undefined ? fmtNum(voice.start) : "";
        const e = voice.end !== undefined ? fmtNum(voice.end) : "";
        trim = `[${s}..${e}]`;
    }
    const region = voice.region ? `@${voice.region}` : "";
    return `voice(${voice.kind}:${voice.scenarioId}:${voice.voiceId}${trim}${region})`;
}

function serializeActorSlot(actor: SceneActorSlot): string {
    const parts = [`${actor.castKey} at ${actor.slot}`];
    if (actor.scale !== undefined) parts.push(`scale=${fmtNum(actor.scale)}`);
    if (actor.y !== undefined) parts.push(`y=${fmtNum(actor.y)}`);
    if (actor.allowOverlap) parts.push("overlap");
    if (actor.motion) parts.push(`motion=${escapeStr(actor.motion)}`);
    if (actor.facial) parts.push(`facial=${escapeStr(actor.facial)}`);
    return parts.join(" ");
}

function serializeBeat(beat: SceneBeat): string {
    switch (beat.kind) {
        case "telop":
            return `telop ${escapeStr(beat.text)}`;
        case "narration": {
            const parts = [`narration ${escapeStr(beat.body)}`];
            if (beat.se) parts.push(`se=${escapeStr(beat.se)}`);
            if (beat.seVolume !== undefined) parts.push(`seVol=${fmtNum(beat.seVolume)}`);
            return parts.join(" ");
        }
        case "talk": {
            const parts = ["talk"];
            if (beat.speakerKey) {
                parts.push(beat.speakerKey);
                if (beat.speakerName) parts.push(`as ${escapeStr(beat.speakerName)}`);
            } else {
                parts.push(escapeStr(beat.speakerName ?? ""));
            }
            parts.push(escapeStr(beat.body));
            if (beat.motion) parts.push(`motion=${escapeStr(beat.motion)}`);
            if (beat.facial) parts.push(`facial=${escapeStr(beat.facial)}`);
            for (const react of beat.reactions ?? []) {
                const rParts = [react.castKey];
                if (react.motion) rParts.push(`motion=${escapeStr(react.motion)}`);
                if (react.facial) rParts.push(`facial=${escapeStr(react.facial)}`);
                parts.push(`react(${rParts.join(" ")})`);
            }
            if (beat.voice) parts.push(serializeVoice(beat.voice));
            if (beat.se) parts.push(`se=${escapeStr(beat.se)}`);
            if (beat.seVolume !== undefined) parts.push(`seVol=${fmtNum(beat.seVolume)}`);
            return parts.join(" ");
        }
        case "stageAction": {
            const parts = [`stage ${beat.action} ${beat.castKey}`];
            if (beat.action === "enter" && beat.slot) parts.push(`at ${beat.slot}`);
            else if (beat.action === "move" && beat.slot) parts.push(`to ${beat.slot}`);
            else if (beat.slot) parts.push(`at ${beat.slot}`);
            if (beat.duration !== undefined) parts.push(`dur=${fmtNum(beat.duration)}`);
            if (beat.scale !== undefined) parts.push(`scale=${fmtNum(beat.scale)}`);
            if (beat.y !== undefined) parts.push(`y=${fmtNum(beat.y)}`);
            if (beat.allowOverlap) parts.push("overlap");
            if (beat.motion) parts.push(`motion=${escapeStr(beat.motion)}`);
            if (beat.facial) parts.push(`facial=${escapeStr(beat.facial)}`);
            return parts.join(" ");
        }
        case "cue": {
            if (beat.cueType === "se") {
                const parts = [`cue se ${escapeStr(beat.se ?? "")}`];
                if (beat.seVolume !== undefined) parts.push(`vol=${fmtNum(beat.seVolume)}`);
                return parts.join(" ");
            }
            if (beat.cueType === "flash") {
                const parts = [`cue flash ${beat.color ?? "white"}`];
                if (beat.duration !== undefined) parts.push(fmtNum(beat.duration));
                return parts.join(" ");
            }
            const parts = [`cue ${beat.cueType}`];
            if (beat.duration !== undefined) parts.push(fmtNum(beat.duration));
            return parts.join(" ");
        }
        case "varOp":
            return beat.ops.length > 0 ? `set ${beat.ops.map(serializeVarOp).join(", ")}` : "set";
    }
}

// ==================== Serializer ====================

/** Serializes a `moesekai-story/2` document into compact, readable MoeSekai Script (`.msk`). */
export function serializeStoryScript(doc: StoryDocument): string {
    const lines: string[] = [];

    // Header
    const headerParts = [`@story ${escapeStr(doc.meta.title)}`, `region=${doc.region}`];
    if (doc.sourceLocale) headerParts.push(`lang=${doc.sourceLocale}`);
    if (doc.id) headerParts.push(`id=${escapeStr(doc.id)}`);
    if (doc.meta.author) headerParts.push(`author=${escapeStr(doc.meta.author)}`);
    if (doc.meta.summary) headerParts.push(`summary=${escapeStr(doc.meta.summary)}`);
    lines.push(headerParts.join(" "));

    // Variables
    if (doc.variables.length > 0) {
        lines.push("");
        for (const v of doc.variables) {
            const init = v.type === "boolean" ? (v.initial ? "true" : "false") : fmtNum(v.initial);
            const nameSuffix = v.name && v.name !== v.id ? ` ${escapeStr(v.name)}` : "";
            lines.push(`@var ${v.id}: ${v.type} = ${init}${nameSuffix}`);
        }
    }

    // Cast
    if (doc.cast.length > 0) {
        lines.push("");
        for (const c of doc.cast) {
            const charPart = c.characterId !== undefined ? ` char=${c.characterId}` : "";
            lines.push(`@cast ${c.key} ${escapeStr(c.name)} model=${escapeStr(c.modelId)}${charPart}`);
        }
    }

    // Build edge lookup
    const edgeByPort = new Map<string, StoryEdge>();
    for (const edge of doc.edges) {
        const key = `${edge.fromNodeId}\0${edge.fromPortId}`;
        if (!edgeByPort.has(key)) edgeByPort.set(key, edge);
    }

    // Deterministic node order: start -> BFS reachable -> sorted remaining
    const orderedIds: string[] = [];
    const seen = new Set<string>();
    if (doc.nodes[doc.startNodeId]) {
        seen.add(doc.startNodeId);
        orderedIds.push(doc.startNodeId);
        for (let i = 0; i < orderedIds.length; i++) {
            const node = doc.nodes[orderedIds[i]];
            if (!node) continue;
            for (const portId of getNodeOutPorts(node)) {
                const edge = edgeByPort.get(`${node.id}\0${portId}`);
                if (edge && doc.nodes[edge.toNodeId] && !seen.has(edge.toNodeId)) {
                    seen.add(edge.toNodeId);
                    orderedIds.push(edge.toNodeId);
                }
            }
        }
    }
    const remaining = Object.keys(doc.nodes).filter(id => !seen.has(id)).sort(compareStrings);
    orderedIds.push(...remaining);

    for (const nodeId of orderedIds) {
        const node = doc.nodes[nodeId];
        if (!node) continue;
        lines.push("");
        const pos = `@pos(${fmtNum(node.pos.x)}, ${fmtNum(node.pos.y)})`;

        switch (node.type) {
            case "start": {
                const idPart = node.id !== "start" ? ` id=${node.id}` : "";
                const out = edgeByPort.get(`${node.id}\0out`);
                const arrow = out ? ` -> ${out.toNodeId}` : "";
                lines.push(`start${idPart} ${pos}${arrow}`);
                break;
            }
            case "scene": {
                const out = edgeByPort.get(`${node.id}\0out`);
                const arrow = out ? ` -> ${out.toNodeId}` : "";
                lines.push(`scene ${node.id} ${escapeStr(node.title)} ${pos} {`);
                // Stage slots
                if (node.background.mode === "set") {
                    lines.push(`  bg set ${escapeStr(node.background.asset)}`);
                } else {
                    lines.push(`  bg ${node.background.mode}`);
                }
                if (node.bgm.mode === "play") {
                    lines.push(`  bgm play ${escapeStr(node.bgm.name)} vol=${fmtNum(node.bgm.volume)}`);
                } else {
                    lines.push(`  bgm ${node.bgm.mode}`);
                }
                if (node.place.mode === "set") {
                    lines.push(`  place set ${escapeStr(node.place.text)}`);
                } else {
                    lines.push(`  place ${node.place.mode}`);
                }
                lines.push(`  transition ${node.transition.kind} ${fmtNum(node.transition.duration)}`);
                if (node.stageCast.mode === "set") {
                    if (node.stageCast.actors.length === 0) {
                        lines.push("  cast set []");
                    } else {
                        lines.push("  cast set [");
                        for (const actor of node.stageCast.actors) {
                            lines.push(`    ${serializeActorSlot(actor)}`);
                        }
                        lines.push("  ]");
                    }
                } else {
                    lines.push(`  cast ${node.stageCast.mode}`);
                }
                // Beats
                for (const beat of node.beats) {
                    lines.push(`  ${serializeBeat(beat)}`);
                }
                lines.push(`}${arrow}`);
                break;
            }
            case "choice": {
                lines.push(`choice ${node.id} ${escapeStr(node.title)} ${pos} {`);
                node.options.forEach((opt, idx) => {
                    const defaultId = `opt${idx + 1}`;
                    const idPrefix = opt.id !== defaultId ? `${opt.id}: ` : "";
                    const parts = [`${idPrefix}${escapeStr(opt.text)}`];
                    if (opt.condition) parts.push(`if ${serializeCondition(opt.condition)}`);
                    if (opt.effects && opt.effects.length > 0) {
                        parts.push(`[${opt.effects.map(serializeVarOp).join(", ")}]`);
                    }
                    const out = edgeByPort.get(`${node.id}\0${opt.id}`);
                    if (out) parts.push(`-> ${out.toNodeId}`);
                    lines.push(`  ${parts.join(" ")}`);
                });
                lines.push("}");
                break;
            }
            case "condition": {
                lines.push(`condition ${node.id} ${escapeStr(node.title)} ${pos} {`);
                node.rules.forEach((rule, idx) => {
                    const defaultId = `rule${idx + 1}`;
                    const idPrefix = rule.id !== defaultId ? `${rule.id}: ` : "";
                    const parts = [`${idPrefix}if ${serializeCondition(rule.expr)}`];
                    if (rule.label) parts.push(escapeStr(rule.label));
                    const out = edgeByPort.get(`${node.id}\0${rule.id}`);
                    if (out) parts.push(`-> ${out.toNodeId}`);
                    lines.push(`  ${parts.join(" ")}`);
                });
                const elseEdge = edgeByPort.get(`${node.id}\0else`);
                lines.push(elseEdge ? `  else -> ${elseEdge.toNodeId}` : "  else");
                lines.push("}");
                break;
            }
            case "end": {
                const sub = node.subtitle !== undefined && node.subtitle !== ""
                    ? ` subtitle=${escapeStr(node.subtitle)}`
                    : "";
                lines.push(`end ${node.id} ${escapeStr(node.title)}${sub} ${pos}`);
                break;
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

// ==================== Lexer ====================

type TokenKind =
    | "IDENT"
    | "STRING"
    | "NUMBER"
    | "AT"
    | "ARROW"
    | "PLUSEQ"
    | "MINUSEQ"
    | "OP"
    | "EQ"
    | "COLON"
    | "COMMA"
    | "SEMI"
    | "DOTDOT"
    | "LBRACE"
    | "RBRACE"
    | "LBRACKET"
    | "RBRACKET"
    | "LPAREN"
    | "RPAREN"
    | "EOF";

interface Token {
    kind: TokenKind;
    value: string;
    line: number;
    col: number;
}

function isIdentStart(ch: string): boolean {
    return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_";
}

function isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
}

function isIdentContinue(ch: string, nextCh: string): boolean {
    if (isIdentStart(ch) || isDigit(ch)) return true;
    // Allow `-` inside identifiers (e.g. `scene-1`, `w-cool-normal01`) unless it begins `->` or `-=`.
    if (ch === "-" && nextCh !== ">" && nextCh !== "=") return true;
    return false;
}

function lexScript(source: string): { tokens: Token[]; diagnostics: StoryScriptDiagnostic[] } {
    const tokens: Token[] = [];
    const diagnostics: StoryScriptDiagnostic[] = [];
    let i = 0;
    let line = 1;
    let col = 1;

    const advance = () => {
        const ch = source[i++];
        if (ch === "\n") {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
        return ch;
    };

    while (i < source.length) {
        const ch = source[i];
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
            advance();
            continue;
        }
        // Comments: `# ...` or `// ...`
        if (ch === "#" || (ch === "/" && source[i + 1] === "/")) {
            while (i < source.length && source[i] !== "\n") advance();
            continue;
        }

        const startLine = line;
        const startCol = col;
        const next = source[i + 1] ?? "";

        // Two-character operators
        if (ch === "-" && next === ">") {
            advance(); advance();
            tokens.push({ kind: "ARROW", value: "->", line: startLine, col: startCol });
            continue;
        }
        if (ch === "+" && next === "=") {
            advance(); advance();
            tokens.push({ kind: "PLUSEQ", value: "+=", line: startLine, col: startCol });
            continue;
        }
        if (ch === "-" && next === "=") {
            advance(); advance();
            tokens.push({ kind: "MINUSEQ", value: "-=", line: startLine, col: startCol });
            continue;
        }
        if (ch === "." && next === ".") {
            advance(); advance();
            tokens.push({ kind: "DOTDOT", value: "..", line: startLine, col: startCol });
            continue;
        }
        if ((ch === "=" && next === "=") || (ch === "!" && next === "=") || (ch === ">" && next === "=") || (ch === "<" && next === "=")) {
            advance(); advance();
            tokens.push({ kind: "OP", value: ch + next, line: startLine, col: startCol });
            continue;
        }
        if (ch === ">" || ch === "<") {
            advance();
            tokens.push({ kind: "OP", value: ch, line: startLine, col: startCol });
            continue;
        }

        // Single-char punctuation
        const singleMap: Record<string, TokenKind> = {
            "@": "AT",
            "=": "EQ",
            ":": "COLON",
            ",": "COMMA",
            ";": "SEMI",
            "{": "LBRACE",
            "}": "RBRACE",
            "[": "LBRACKET",
            "]": "RBRACKET",
            "(": "LPAREN",
            ")": "RPAREN",
        };
        if (ch in singleMap) {
            advance();
            tokens.push({ kind: singleMap[ch], value: ch, line: startLine, col: startCol });
            continue;
        }

        // String literal
        if (ch === '"') {
            advance(); // opening quote
            let str = "";
            let closed = false;
            while (i < source.length) {
                const c = advance();
                if (c === '"') {
                    closed = true;
                    break;
                }
                if (c === "\\") {
                    if (i >= source.length) break;
                    const esc = advance();
                    if (esc === "n") str += "\n";
                    else if (esc === "r") str += "\r";
                    else if (esc === "t") str += "\t";
                    else if (esc === '"') str += '"';
                    else if (esc === "\\") str += "\\";
                    else str += esc;
                } else {
                    str += c;
                }
            }
            if (!closed) {
                diagnostics.push({ line: startLine, col: startCol, message: "Unterminated string literal" });
            }
            tokens.push({ kind: "STRING", value: str, line: startLine, col: startCol });
            continue;
        }

        // Number OR digit-prefixed identifier (e.g. `001001_ichika01`, `1st_countdown_01`, `01-ev`)
        if (isDigit(ch) || (ch === "-" && isDigit(next))) {
            let raw = "";
            if (ch === "-") raw += advance();
            while (i < source.length && isDigit(source[i])) raw += advance();
            // If immediately followed by letter, underscore, or hyphen (not `->` or `-=`), treat as identifier.
            if (
                raw[0] !== "-"
                && i < source.length
                && (isIdentStart(source[i]) || (source[i] === "-" && source[i + 1] !== ">" && source[i + 1] !== "="))
            ) {
                while (i < source.length && isIdentContinue(source[i], source[i + 1] ?? "")) {
                    raw += advance();
                }
                tokens.push({ kind: "IDENT", value: raw, line: startLine, col: startCol });
                continue;
            }
            // Optional fractional part (careful not to consume `..` range operator!)
            if (source[i] === "." && source[i + 1] !== "." && isDigit(source[i + 1] ?? "")) {
                raw += advance(); // '.'
                while (i < source.length && isDigit(source[i])) raw += advance();
            }
            tokens.push({ kind: "NUMBER", value: raw, line: startLine, col: startCol });
            continue;
        }

        // Identifier
        if (isIdentStart(ch)) {
            let ident = "";
            while (i < source.length && isIdentContinue(source[i], source[i + 1] ?? "")) {
                ident += advance();
            }
            tokens.push({ kind: "IDENT", value: ident, line: startLine, col: startCol });
            continue;
        }

        diagnostics.push({ line: startLine, col: startCol, message: `Unexpected character '${ch}'` });
        advance();
    }

    tokens.push({ kind: "EOF", value: "", line, col });
    return { tokens, diagnostics };
}

// ==================== Recursive Descent Parser ====================

class ScriptParser {
    private tokens: Token[];
    private pos = 0;
    diagnostics: StoryScriptDiagnostic[] = [];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    peek(offset = 0): Token {
        return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
    }

    prev(): Token {
        return this.tokens[Math.max(0, this.pos - 1)];
    }

    next(): Token {
        const tok = this.peek();
        if (this.pos < this.tokens.length - 1) this.pos += 1;
        return tok;
    }

    at(kind: TokenKind, value?: string): boolean {
        const tok = this.peek();
        return tok.kind === kind && (value === undefined || tok.value === value);
    }

    sameLineAs(refLine: number): boolean {
        const tok = this.peek();
        return tok.kind !== "EOF" && tok.line === refLine && tok.kind !== "SEMI" && tok.kind !== "RBRACE";
    }

    error(tok: Token, message: string) {
        this.diagnostics.push({ line: tok.line, col: tok.col, message });
    }

    expect(kind: TokenKind, expectedDesc: string, value?: string): Token | null {
        const tok = this.peek();
        if (tok.kind === kind && (value === undefined || tok.value === value)) {
            return this.next();
        }
        this.error(tok, `Expected ${expectedDesc}, got '${tok.value || tok.kind}'`);
        return null;
    }

    atId(offset = 0): boolean {
        const tok = this.peek(offset);
        return tok.kind === "IDENT" || (tok.kind === "NUMBER" && !tok.value.includes("."));
    }

    expectId(desc: string): Token | null {
        const tok = this.peek();
        if (tok.kind === "IDENT" || (tok.kind === "NUMBER" && !tok.value.includes("."))) {
            return this.next();
        }
        this.error(tok, `Expected ${desc}, got '${tok.value || tok.kind}'`);
        return null;
    }

    parseNumber(): number | null {
        const tok = this.expect("NUMBER", "number");
        if (!tok) return null;
        const n = Number(tok.value);
        if (!Number.isFinite(n)) {
            this.error(tok, `Invalid number '${tok.value}'`);
            return null;
        }
        return n;
    }

    parseBool(): boolean | null {
        const tok = this.peek();
        if (tok.kind === "IDENT" && (tok.value === "true" || tok.value === "false")) {
            this.next();
            return tok.value === "true";
        }
        this.error(tok, `Expected boolean 'true' or 'false', got '${tok.value || tok.kind}'`);
        return null;
    }

    parseOptionalPos(): StoryNodePos | undefined {
        if (!this.at("AT")) return undefined;
        const atTok = this.peek();
        const nextTok = this.peek(1);
        if (nextTok.kind !== "IDENT" || nextTok.value !== "pos") return undefined;
        this.next(); // @
        this.next(); // pos
        if (!this.expect("LPAREN", "'('")) return undefined;
        const x = this.parseNumber();
        this.expect("COMMA", "','");
        const y = this.parseNumber();
        this.expect("RPAREN", "')'");
        if (x === null || y === null) {
            this.error(atTok, "Invalid @pos(x, y) coordinates");
            return undefined;
        }
        return { x: clampCoord(x), y: clampCoord(y) };
    }

    parseVarOp(): VarOp | null {
        const idTok = this.expectId("variable id");
        if (!idTok) return null;
        const varId = idTok.value;
        const opTok = this.peek();

        if (opTok.kind === "IDENT" && opTok.value === "toggle") {
            this.next();
            return { varId, op: "toggle" };
        }
        if (opTok.kind === "PLUSEQ") {
            this.next();
            const val = this.parseNumber();
            return val === null ? null : { varId, op: "add", value: val };
        }
        if (opTok.kind === "MINUSEQ") {
            this.next();
            const val = this.parseNumber();
            return val === null ? null : { varId, op: "sub", value: val };
        }
        if (opTok.kind === "EQ") {
            this.next();
            const valTok = this.peek();
            if (valTok.kind === "IDENT" && (valTok.value === "true" || valTok.value === "false")) {
                this.next();
                return { varId, op: "set", value: valTok.value === "true" };
            }
            const val = this.parseNumber();
            return val === null ? null : { varId, op: "set", value: val };
        }
        this.error(opTok, `Expected variable operator (=, +=, -=, toggle), got '${opTok.value || opTok.kind}'`);
        return null;
    }

    parseConditionExpr(): ConditionExpr | null {
        const idTok = this.expectId("variable id");
        if (!idTok) return null;
        const opTok = this.peek();
        if (opTok.kind !== "OP" || !(CONDITION_OPS as readonly string[]).includes(opTok.value)) {
            this.error(opTok, `Expected comparison operator (${CONDITION_OPS.join(", ")}), got '${opTok.value || opTok.kind}'`);
            return null;
        }
        this.next();
        const op = opTok.value as ConditionOp;
        const valTok = this.peek();
        if (valTok.kind === "IDENT" && (valTok.value === "true" || valTok.value === "false")) {
            this.next();
            return { varId: idTok.value, op, value: valTok.value === "true" };
        }
        const num = this.parseNumber();
        return num === null ? null : { varId: idTok.value, op, value: num };
    }

    parseVoiceClause(): StoryVoiceRef | null {
        this.expect("IDENT", "'voice'", "voice");
        if (!this.expect("LPAREN", "'('")) return null;
        const kindTok = this.expect("IDENT", "voice kind");
        if (!kindTok) return null;
        if (!(VOICE_KINDS as readonly string[]).includes(kindTok.value)) {
            this.error(kindTok, `Unknown voice kind '${kindTok.value}'`);
        }
        this.expect("COLON", "':'");
        const scenarioId = this.expectId("scenarioId")?.value ?? null;
        this.expect("COLON", "':'");
        const voiceId = this.expectId("voiceId")?.value ?? null;

        let start: number | undefined;
        let end: number | undefined;
        if (this.at("LBRACKET")) {
            this.next();
            if (this.at("NUMBER")) {
                const s = this.parseNumber();
                if (s !== null) start = s;
            }
            this.expect("DOTDOT", "'..'");
            if (this.at("NUMBER")) {
                const e = this.parseNumber();
                if (e !== null) end = e;
            }
            this.expect("RBRACKET", "']'");
        }

        let region: StoryRegion | undefined;
        if (this.at("AT")) {
            this.next();
            const rTok = this.expect("IDENT", "region");
            if (rTok) {
                if (!(STORY_REGIONS as readonly string[]).includes(rTok.value)) {
                    this.error(rTok, `Invalid voice region '${rTok.value}'`);
                } else {
                    region = rTok.value as StoryRegion;
                }
            }
        }
        this.expect("RPAREN", "')'");
        if (!scenarioId || !voiceId) return null;
        return {
            kind: (VOICE_KINDS.includes(kindTok.value as StoryVoiceKind) ? kindTok.value : "story") as StoryVoiceKind,
            scenarioId,
            voiceId,
            ...(region !== undefined ? { region } : {}),
            ...(start !== undefined ? { start } : {}),
            ...(end !== undefined ? { end } : {}),
        };
    }

    parseReactClause(): ActorReaction | null {
        this.expect("IDENT", "'react'", "react");
        if (!this.expect("LPAREN", "'('")) return null;
        const castTok = this.expectId("castKey");
        if (!castTok) return null;
        let motion: string | undefined;
        let facial: string | undefined;
        while (!this.at("RPAREN") && !this.at("EOF")) {
            const keyTok = this.peek();
            if (keyTok.kind === "IDENT" && (keyTok.value === "motion" || keyTok.value === "facial")) {
                this.next();
                this.expect("EQ", "'='");
                const val = this.expect("STRING", "string");
                if (val) {
                    if (keyTok.value === "motion") motion = val.value;
                    else facial = val.value;
                }
            } else {
                this.error(keyTok, `Unexpected token '${keyTok.value}' in react(...)`);
                this.next();
                break;
            }
        }
        this.expect("RPAREN", "')'");
        return {
            castKey: castTok.value,
            ...(motion ? { motion } : {}),
            ...(facial ? { facial } : {}),
        };
    }

    parseActorSlotEntry(): SceneActorSlot | null {
        const castTok = this.expectId("castKey");
        if (!castTok) return null;
        const entryLine = castTok.line;
        this.expect("IDENT", "'at'", "at");
        const slotTok = this.expect("IDENT", "slot");
        if (!slotTok) return null;
        if (!(STORY_SLOTS as readonly string[]).includes(slotTok.value)) {
            this.error(slotTok, `Invalid slot '${slotTok.value}'`);
        }
        let scale: number | undefined;
        let y: number | undefined;
        let motion: string | undefined;
        let facial: string | undefined;
        let allowOverlap = false;

        while (this.sameLineAs(entryLine) && !this.at("COMMA") && !this.at("RBRACKET")) {
            const k = this.peek();
            if (k.kind === "IDENT" && k.value === "overlap") {
                this.next();
                if (this.at("EQ")) {
                    this.next();
                    const bTok = this.expect("IDENT", "boolean (true/false)");
                    if (bTok) {
                        if (bTok.value === "true") allowOverlap = true;
                        else if (bTok.value === "false") allowOverlap = false;
                        else this.error(bTok, `Expected true or false for overlap, got '${bTok.value}'`);
                    }
                } else {
                    allowOverlap = true;
                }
            } else if (k.kind === "IDENT" && (k.value === "scale" || k.value === "y" || k.value === "motion" || k.value === "facial")) {
                this.next();
                this.expect("EQ", "'='");
                if (k.value === "scale") {
                    const v = this.parseNumber();
                    if (v !== null) scale = v;
                } else if (k.value === "y") {
                    const v = this.parseNumber();
                    if (v !== null) y = v;
                } else if (k.value === "motion") {
                    const v = this.expect("STRING", "motion string");
                    if (v) motion = v.value;
                } else {
                    const v = this.expect("STRING", "facial string");
                    if (v) facial = v.value;
                }
            } else {
                break;
            }
        }

        return {
            castKey: castTok.value,
            slot: (STORY_SLOTS.includes(slotTok.value as StorySlot) ? slotTok.value : "center") as StorySlot,
            ...(scale !== undefined ? { scale } : {}),
            ...(y !== undefined ? { y } : {}),
            ...(motion ? { motion } : {}),
            ...(facial ? { facial } : {}),
            ...(allowOverlap ? { allowOverlap: true } : {}),
        };
    }

    parse(): StoryScriptParseResult {
        let docId = "";
        let region: StoryRegion = "jp";
        let sourceLocale: UiLocale | undefined;
        let title = "";
        let author = "";
        let summary = "";
        let hasAnyStatement = false;

        const cast: StoryCastMember[] = [];
        const variables: StoryVariable[] = [];
        const nodes: Record<string, StoryNode> = {};
        const pendingEdges: Array<{ fromNodeId: string; fromPortId: string; toNodeId: string }> = [];
        const missingPos = new Set<string>();
        const usedBeatIds = new Set<string>();
        let startNodeId: string | null = null;

        while (!this.at("EOF")) {
            if (this.at("SEMI")) {
                this.next();
                continue;
            }
            hasAnyStatement = true;
            const tok = this.peek();

            // Directives: @story, @var, @cast
            if (tok.kind === "AT") {
                this.next();
                const dir = this.expect("IDENT", "directive name (story, var, cast)");
                if (!dir) continue;
                const dirLine = dir.line;

                if (dir.value === "story") {
                    const titleTok = this.expect("STRING", "story title string");
                    if (titleTok) title = titleTok.value;
                    while (this.sameLineAs(dirLine)) {
                        const keyTok = this.expect("IDENT", "story attribute (region, id, author, summary)");
                        if (!keyTok) break;
                        this.expect("EQ", "'='");
                        if (keyTok.value === "region") {
                            const rTok = this.peek();
                            const rVal = rTok.kind === "STRING" || rTok.kind === "IDENT" ? this.next().value : "";
                            if (!(STORY_REGIONS as readonly string[]).includes(rVal)) {
                                this.error(rTok, `Invalid region '${rVal}'`);
                            } else {
                                region = rVal as StoryRegion;
                            }
                        } else if (keyTok.value === "lang" || keyTok.value === "sourceLocale") {
                            const lTok = this.peek();
                            const lVal = lTok.kind === "STRING" || lTok.kind === "IDENT" ? this.next().value : "";
                            if (!isUiLocale(lVal)) {
                                this.error(lTok, `Invalid sourceLocale '${lVal}' (allowed: ${SUPPORTED_UI_LOCALES.join(", ")})`);
                            } else {
                                sourceLocale = lVal;
                            }
                        } else if (keyTok.value === "id") {
                            const v = this.peek().kind === "STRING" || this.atId() ? this.next().value : "";
                            docId = v;
                        } else if (keyTok.value === "author") {
                            const v = this.expect("STRING", "author string");
                            if (v) author = v.value;
                        } else if (keyTok.value === "summary") {
                            const v = this.expect("STRING", "summary string");
                            if (v) summary = v.value;
                        } else {
                            this.error(keyTok, `Unknown @story attribute '${keyTok.value}'`);
                            this.next();
                        }
                    }
                    continue;
                }

                if (dir.value === "var") {
                    const idTok = this.expectId("variable id");
                    this.expect("COLON", "':'");
                    const typeTok = this.expect("IDENT", "variable type ('number' or 'boolean')");
                    this.expect("EQ", "'='");
                    if (!idTok || !typeTok) continue;
                    if (typeTok.value === "number") {
                        const initial = this.parseNumber();
                        let name = idTok.value;
                        if (this.sameLineAs(dirLine) && this.at("STRING")) {
                            name = this.next().value;
                        }
                        if (initial !== null) {
                            variables.push({ id: idTok.value, name, type: "number", initial });
                        }
                    } else if (typeTok.value === "boolean") {
                        const initial = this.parseBool();
                        let name = idTok.value;
                        if (this.sameLineAs(dirLine) && this.at("STRING")) {
                            name = this.next().value;
                        }
                        if (initial !== null) {
                            variables.push({ id: idTok.value, name, type: "boolean", initial });
                        }
                    } else {
                        this.error(typeTok, `Unknown variable type '${typeTok.value}'`);
                    }
                    continue;
                }

                if (dir.value === "cast") {
                    const keyTok = this.expectId("cast key");
                    const nameTok = this.expect("STRING", "cast display name");
                    let modelId = "";
                    let characterId: number | undefined;
                    while (this.sameLineAs(dirLine)) {
                        const attr = this.expect("IDENT", "cast attribute (model, char)");
                        if (!attr) break;
                        this.expect("EQ", "'='");
                        if (attr.value === "model") {
                            const mTok = this.peek();
                            if (mTok.kind === "STRING" || this.atId()) {
                                modelId = this.next().value;
                            } else {
                                this.error(mTok, "Expected modelId string");
                            }
                        } else if (attr.value === "char") {
                            const n = this.parseNumber();
                            if (n !== null) characterId = n;
                        } else {
                            this.error(attr, `Unknown @cast attribute '${attr.value}'`);
                            this.next();
                        }
                    }
                    if (keyTok && nameTok) {
                        cast.push({
                            key: keyTok.value,
                            name: nameTok.value,
                            modelId,
                            ...(characterId !== undefined ? { characterId } : {}),
                        });
                    }
                    continue;
                }

                this.error(dir, `Unknown directive '@${dir.value}'`);
                continue;
            }

            // Node definitions: start, scene, choice, condition, end
            if (tok.kind === "IDENT" && tok.value === "start") {
                const startLine = tok.line;
                this.next();
                let id = "start";
                if (this.sameLineAs(startLine) && this.at("IDENT", "id")) {
                    this.next();
                    this.expect("EQ", "'='");
                    const idTok = this.expectId("start node id");
                    if (idTok) id = idTok.value;
                }
                const pos = this.sameLineAs(startLine) ? this.parseOptionalPos() : undefined;
                if (this.sameLineAs(startLine) && this.at("ARROW")) {
                    this.next();
                    const targetTok = this.expectId("target node id");
                    if (targetTok) pendingEdges.push({ fromNodeId: id, fromPortId: "out", toNodeId: targetTok.value });
                }
                if (!pos) missingPos.add(id);
                const startNode: StartNode = { id, type: "start", pos: pos ?? { x: 40, y: 120 } };
                nodes[id] = startNode;
                startNodeId = id;
                continue;
            }

            if (tok.kind === "IDENT" && tok.value === "scene") {
                this.next();
                const idTok = this.expectId("scene id");
                const titleTok = this.at("STRING") ? this.next() : null;
                const pos = this.parseOptionalPos();
                if (!this.expect("LBRACE", "'{'")) continue;
                const sceneId = idTok?.value ?? `scene_${Object.keys(nodes).length + 1}`;
                if (!pos) missingPos.add(sceneId);

                let background: BackgroundSlot = { mode: "inherit" };
                let bgm: BgmSlot = { mode: "inherit" };
                let place: PlaceSlot = { mode: "inherit" };
                let transition: TransitionSlot = { kind: "none", duration: 0.4 };
                let stageCast: StageCastSlot = { mode: "inherit" };
                const beats: SceneBeat[] = [];
                let sceneTarget: string | undefined;

                const nextBeatId = () => makeDeterministicId(`${sceneId}_b${beats.length + 1}`, "b", usedBeatIds);

                while (!this.at("RBRACE") && !this.at("EOF")) {
                    if (this.at("SEMI")) {
                        this.next();
                        continue;
                    }
                    if (this.at("ARROW")) {
                        this.next();
                        const targetTok = this.expectId("target node id");
                        if (targetTok) sceneTarget = targetTok.value;
                        continue;
                    }
                    const stmt = this.expect("IDENT", "scene slot or beat keyword");
                    if (!stmt) {
                        this.next();
                        continue;
                    }
                    const stmtLine = stmt.line;

                    switch (stmt.value) {
                        case "bg": {
                            const modeTok = this.expect("IDENT", "bg mode (set, inherit, clear)");
                            if (modeTok?.value === "inherit") background = { mode: "inherit" };
                            else if (modeTok?.value === "clear") background = { mode: "clear" };
                            else if (modeTok?.value === "set") {
                                const assetTok = this.expect("STRING", "background asset name");
                                if (assetTok) background = { mode: "set", asset: assetTok.value };
                            } else if (modeTok) {
                                this.error(modeTok, `Unknown bg mode '${modeTok.value}'`);
                            }
                            break;
                        }
                        case "bgm": {
                            const modeTok = this.expect("IDENT", "bgm mode (play, inherit, stop)");
                            if (modeTok?.value === "inherit") bgm = { mode: "inherit" };
                            else if (modeTok?.value === "stop") bgm = { mode: "stop" };
                            else if (modeTok?.value === "play") {
                                const nameTok = this.expect("STRING", "BGM asset name");
                                let volume = 0.75;
                                if (this.sameLineAs(stmtLine) && this.at("IDENT", "vol")) {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.parseNumber();
                                    if (v !== null) volume = v;
                                }
                                if (nameTok) bgm = { mode: "play", name: nameTok.value, volume };
                            } else if (modeTok) {
                                this.error(modeTok, `Unknown bgm mode '${modeTok.value}'`);
                            }
                            break;
                        }
                        case "place": {
                            const modeTok = this.expect("IDENT", "place mode (set, inherit, hide)");
                            if (modeTok?.value === "inherit") place = { mode: "inherit" };
                            else if (modeTok?.value === "hide") place = { mode: "hide" };
                            else if (modeTok?.value === "set") {
                                const textTok = this.expect("STRING", "place text");
                                if (textTok) place = { mode: "set", text: textTok.value };
                            } else if (modeTok) {
                                this.error(modeTok, `Unknown place mode '${modeTok.value}'`);
                            }
                            break;
                        }
                        case "transition": {
                            const kindTok = this.expect("IDENT", "transition kind (none, fadeBlack, fadeWhite)");
                            let dur = 0.4;
                            if (this.sameLineAs(stmtLine) && this.at("NUMBER")) {
                                const d = this.parseNumber();
                                if (d !== null) dur = d;
                            }
                            if (kindTok) {
                                if (!(TRANSITION_KINDS as readonly string[]).includes(kindTok.value)) {
                                    this.error(kindTok, `Unknown transition kind '${kindTok.value}'`);
                                } else {
                                    transition = { kind: kindTok.value as TransitionKind, duration: dur };
                                }
                            }
                            break;
                        }
                        case "cast": {
                            const modeTok = this.expect("IDENT", "cast mode (set, inherit, clear)");
                            if (modeTok?.value === "inherit") stageCast = { mode: "inherit" };
                            else if (modeTok?.value === "clear") stageCast = { mode: "clear" };
                            else if (modeTok?.value === "set") {
                                if (this.expect("LBRACKET", "'['")) {
                                    const actors: SceneActorSlot[] = [];
                                    while (!this.at("RBRACKET") && !this.at("EOF")) {
                                        if (this.at("COMMA")) {
                                            this.next();
                                            continue;
                                        }
                                        const actor = this.parseActorSlotEntry();
                                        if (actor) actors.push(actor);
                                        else break;
                                    }
                                    this.expect("RBRACKET", "']'");
                                    stageCast = { mode: "set", actors };
                                }
                            } else if (modeTok) {
                                this.error(modeTok, `Unknown cast mode '${modeTok.value}'`);
                            }
                            break;
                        }
                        case "telop": {
                            const textTok = this.expect("STRING", "telop text");
                            if (textTok) {
                                const beat: TelopBeat = { id: nextBeatId(), kind: "telop", text: textTok.value };
                                beats.push(beat);
                            }
                            break;
                        }
                        case "narration": {
                            const bodyTok = this.expect("STRING", "narration body");
                            let se: string | undefined;
                            let seVolume: number | undefined;
                            while (this.sameLineAs(stmtLine)) {
                                const mod = this.peek();
                                if (mod.kind === "IDENT" && mod.value === "se") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.expect("STRING", "se asset");
                                    if (v) se = v.value;
                                } else if (mod.kind === "IDENT" && mod.value === "seVol") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.parseNumber();
                                    if (v !== null) seVolume = v;
                                } else {
                                    this.error(mod, `Unexpected token '${mod.value}' in narration`);
                                    this.next();
                                    break;
                                }
                            }
                            if (bodyTok) {
                                const beat: NarrationBeat = {
                                    id: nextBeatId(),
                                    kind: "narration",
                                    body: bodyTok.value,
                                    ...(se ? { se } : {}),
                                    ...(seVolume !== undefined ? { seVolume } : {}),
                                };
                                beats.push(beat);
                            }
                            break;
                        }
                        case "talk": {
                            let speakerKey: string | undefined;
                            let speakerName: string | undefined;
                            let body: string | undefined;
                            if (this.atId()) {
                                speakerKey = this.next().value;
                                if (this.sameLineAs(stmtLine) && this.at("IDENT", "as")) {
                                    this.next();
                                    const nameTok = this.expect("STRING", "speaker override name");
                                    if (nameTok) speakerName = nameTok.value;
                                }
                                const bodyTok = this.expect("STRING", "dialogue body");
                                if (bodyTok) body = bodyTok.value;
                            } else if (this.at("STRING")) {
                                const firstStr = this.next().value;
                                if (this.sameLineAs(stmtLine) && this.at("STRING")) {
                                    speakerName = firstStr;
                                    body = this.next().value;
                                } else {
                                    body = firstStr;
                                }
                            } else {
                                this.error(this.peek(), "Expected speaker key or speaker name in talk");
                            }

                            let motion: string | undefined;
                            let facial: string | undefined;
                            const reactions: ActorReaction[] = [];
                            let voice: StoryVoiceRef | undefined;
                            let se: string | undefined;
                            let seVolume: number | undefined;

                            while (this.sameLineAs(stmtLine)) {
                                const mod = this.peek();
                                if (mod.kind === "IDENT" && mod.value === "motion") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.expect("STRING", "motion string");
                                    if (v) motion = v.value;
                                } else if (mod.kind === "IDENT" && mod.value === "facial") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.expect("STRING", "facial string");
                                    if (v) facial = v.value;
                                } else if (mod.kind === "IDENT" && mod.value === "react") {
                                    const r = this.parseReactClause();
                                    if (r) reactions.push(r);
                                } else if (mod.kind === "IDENT" && mod.value === "voice") {
                                    const v = this.parseVoiceClause();
                                    if (v) voice = v;
                                } else if (mod.kind === "IDENT" && mod.value === "se") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.expect("STRING", "se asset");
                                    if (v) se = v.value;
                                } else if (mod.kind === "IDENT" && mod.value === "seVol") {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.parseNumber();
                                    if (v !== null) seVolume = v;
                                } else {
                                    this.error(mod, `Unexpected token '${mod.value}' in talk`);
                                    this.next();
                                    break;
                                }
                            }

                            if (body !== undefined) {
                                const beat: TalkBeat = {
                                    id: nextBeatId(),
                                    kind: "talk",
                                    ...(speakerKey ? { speakerKey } : {}),
                                    ...(speakerName !== undefined ? { speakerName } : {}),
                                    body,
                                    ...(motion ? { motion } : {}),
                                    ...(facial ? { facial } : {}),
                                    ...(reactions.length > 0 ? { reactions } : {}),
                                    ...(voice ? { voice } : {}),
                                    ...(se ? { se } : {}),
                                    ...(seVolume !== undefined ? { seVolume } : {}),
                                };
                                beats.push(beat);
                            }
                            break;
                        }
                        case "stage": {
                            const actionTok = this.expect("IDENT", "stage action (enter, move, pose, exit)");
                            const castTok = this.expectId("castKey");
                            if (!actionTok || !castTok) break;
                            const validAction = actionTok.value === "enter" || actionTok.value === "move"
                                || actionTok.value === "pose" || actionTok.value === "exit";
                            if (!validAction) {
                                this.error(actionTok, `Unknown stage action '${actionTok.value}'`);
                                break;
                            }
                            let slot: StorySlot | undefined;
                            let scale: number | undefined;
                            let y: number | undefined;
                            let motion: string | undefined;
                            let facial: string | undefined;
                            let duration: number | undefined;
                            let allowOverlap = false;

                            while (this.sameLineAs(stmtLine)) {
                                const mod = this.peek();
                                if (mod.kind === "IDENT" && mod.value === "overlap") {
                                    this.next();
                                    if (this.at("EQ")) {
                                        this.next();
                                        const bTok = this.expect("IDENT", "boolean (true/false)");
                                        if (bTok) {
                                            if (bTok.value === "true") allowOverlap = true;
                                            else if (bTok.value === "false") allowOverlap = false;
                                            else this.error(bTok, `Expected true or false for overlap, got '${bTok.value}'`);
                                        }
                                    } else {
                                        allowOverlap = true;
                                    }
                                } else if (mod.kind === "IDENT" && (mod.value === "at" || mod.value === "to")) {
                                    this.next();
                                    const sTok = this.expect("IDENT", "slot");
                                    if (sTok) {
                                        if (!(STORY_SLOTS as readonly string[]).includes(sTok.value)) {
                                            this.error(sTok, `Invalid slot '${sTok.value}'`);
                                        } else {
                                            slot = sTok.value as StorySlot;
                                        }
                                    }
                                } else if (mod.kind === "IDENT" && (mod.value === "dur" || mod.value === "scale" || mod.value === "y")) {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const n = this.parseNumber();
                                    if (n !== null) {
                                        if (mod.value === "dur") duration = n;
                                        else if (mod.value === "scale") scale = n;
                                        else y = n;
                                    }
                                } else if (mod.kind === "IDENT" && (mod.value === "motion" || mod.value === "facial")) {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const s = this.expect("STRING", `${mod.value} string`);
                                    if (s) {
                                        if (mod.value === "motion") motion = s.value;
                                        else facial = s.value;
                                    }
                                } else {
                                    this.error(mod, `Unexpected token '${mod.value}' in stage action`);
                                    this.next();
                                    break;
                                }
                            }

                            const beat: StageActionBeat = {
                                id: nextBeatId(),
                                kind: "stageAction",
                                action: actionTok.value as StageActionBeat["action"],
                                castKey: castTok.value,
                                ...(slot ? { slot } : {}),
                                ...(scale !== undefined ? { scale } : {}),
                                ...(y !== undefined ? { y } : {}),
                                ...(motion ? { motion } : {}),
                                ...(facial ? { facial } : {}),
                                ...(duration !== undefined ? { duration } : {}),
                                ...(allowOverlap ? { allowOverlap: true } : {}),
                            };
                            beats.push(beat);
                            break;
                        }
                        case "cue": {
                            const cueTok = this.expect("IDENT", "cue type (se, flash, shake, wait)");
                            if (!cueTok) break;
                            if (cueTok.value === "se") {
                                const seTok = this.expect("STRING", "SE asset");
                                let seVolume: number | undefined;
                                if (this.sameLineAs(stmtLine) && this.at("IDENT", "vol")) {
                                    this.next();
                                    this.expect("EQ", "'='");
                                    const v = this.parseNumber();
                                    if (v !== null) seVolume = v;
                                }
                                if (seTok) {
                                    const beat: CueBeat = {
                                        id: nextBeatId(),
                                        kind: "cue",
                                        cueType: "se",
                                        se: seTok.value,
                                        ...(seVolume !== undefined ? { seVolume } : {}),
                                    };
                                    beats.push(beat);
                                }
                            } else if (cueTok.value === "flash") {
                                const colorTok = this.expect("IDENT", "flash color (black or white)");
                                let color: StoryEffectColor = "white";
                                if (colorTok) {
                                    if (!(EFFECT_COLORS as readonly string[]).includes(colorTok.value)) {
                                        this.error(colorTok, `Invalid flash color '${colorTok.value}'`);
                                    } else {
                                        color = colorTok.value as StoryEffectColor;
                                    }
                                }
                                let duration: number | undefined;
                                if (this.sameLineAs(stmtLine) && this.at("NUMBER")) {
                                    const d = this.parseNumber();
                                    if (d !== null) duration = d;
                                }
                                const beat: CueBeat = {
                                    id: nextBeatId(),
                                    kind: "cue",
                                    cueType: "flash",
                                    color,
                                    ...(duration !== undefined ? { duration } : {}),
                                };
                                beats.push(beat);
                            } else if (cueTok.value === "shake" || cueTok.value === "wait") {
                                let duration: number | undefined;
                                if (this.sameLineAs(stmtLine) && this.at("NUMBER")) {
                                    const d = this.parseNumber();
                                    if (d !== null) duration = d;
                                }
                                const beat: CueBeat = {
                                    id: nextBeatId(),
                                    kind: "cue",
                                    cueType: cueTok.value,
                                    ...(duration !== undefined ? { duration } : {}),
                                };
                                beats.push(beat);
                            } else {
                                this.error(cueTok, `Unknown cue type '${cueTok.value}'`);
                            }
                            break;
                        }
                        case "set": {
                            const ops: VarOp[] = [];
                            if (this.sameLineAs(stmtLine)) {
                                if (this.at("LBRACKET") && this.peek(1).kind === "RBRACKET") {
                                    this.next();
                                    this.next();
                                } else {
                                    const first = this.parseVarOp();
                                    if (first) ops.push(first);
                                    while (this.sameLineAs(stmtLine) && this.at("COMMA")) {
                                        this.next();
                                        const op = this.parseVarOp();
                                        if (op) ops.push(op);
                                    }
                                }
                            }
                            beats.push({ id: nextBeatId(), kind: "varOp", ops });
                            break;
                        }
                        default:
                            this.error(stmt, `Unknown scene statement '${stmt.value}'`);
                            while (this.sameLineAs(stmtLine)) this.next();
                            break;
                    }
                }

                const closeTok = this.expect("RBRACE", "'}'");
                if (closeTok && this.sameLineAs(closeTok.line) && this.at("ARROW")) {
                    this.next();
                    const targetTok = this.expectId("target node id");
                    if (targetTok) sceneTarget = targetTok.value;
                }
                if (sceneTarget) {
                    pendingEdges.push({ fromNodeId: sceneId, fromPortId: "out", toNodeId: sceneTarget });
                }

                const sceneNode: SceneNode = {
                    id: sceneId,
                    type: "scene",
                    title: titleTok?.value ?? "",
                    pos: pos ?? { x: 0, y: 0 },
                    background,
                    bgm,
                    place,
                    transition,
                    stageCast,
                    beats,
                };
                nodes[sceneId] = sceneNode;
                continue;
            }

            if (tok.kind === "IDENT" && tok.value === "choice") {
                this.next();
                const idTok = this.expectId("choice id");
                const titleTok = this.at("STRING") ? this.next() : null;
                const pos = this.parseOptionalPos();
                if (!this.expect("LBRACE", "'{'")) continue;
                const choiceId = idTok?.value ?? `choice_${Object.keys(nodes).length + 1}`;
                if (!pos) missingPos.add(choiceId);

                const options: ChoiceOption[] = [];
                while (!this.at("RBRACE") && !this.at("EOF")) {
                    if (this.at("SEMI")) {
                        this.next();
                        continue;
                    }
                    const optLine = this.peek().line;
                    let optId = `opt${options.length + 1}`;
                    if (this.atId() && this.peek(1).kind === "COLON") {
                        optId = this.next().value;
                        this.next(); // :
                    }
                    const textTok = this.expect("STRING", "choice option text");
                    if (!textTok) {
                        this.next();
                        continue;
                    }

                    let condition: ConditionExpr | undefined;
                    let effects: VarOp[] | undefined;

                    if (this.sameLineAs(optLine) && this.at("IDENT", "if")) {
                        this.next();
                        const expr = this.parseConditionExpr();
                        if (expr) condition = expr;
                    }
                    if (this.sameLineAs(optLine) && this.at("LBRACKET")) {
                        this.next();
                        effects = [];
                        while (!this.at("RBRACKET") && !this.at("EOF")) {
                            if (this.at("COMMA")) {
                                this.next();
                                continue;
                            }
                            const op = this.parseVarOp();
                            if (op) effects.push(op);
                            else break;
                        }
                        this.expect("RBRACKET", "']'");
                    }
                    if (this.sameLineAs(optLine) && this.at("ARROW")) {
                        this.next();
                        const targetTok = this.expectId("target node id");
                        if (targetTok) {
                            pendingEdges.push({ fromNodeId: choiceId, fromPortId: optId, toNodeId: targetTok.value });
                        }
                    }

                    options.push({
                        id: optId,
                        text: textTok.value,
                        ...(condition ? { condition } : {}),
                        ...(effects && effects.length > 0 ? { effects } : {}),
                    });
                }
                this.expect("RBRACE", "'}'");

                const choiceNode: ChoiceNode = {
                    id: choiceId,
                    type: "choice",
                    title: titleTok?.value ?? "",
                    pos: pos ?? { x: 0, y: 0 },
                    options,
                };
                nodes[choiceId] = choiceNode;
                continue;
            }

            if (tok.kind === "IDENT" && tok.value === "condition") {
                this.next();
                const idTok = this.expectId("condition id");
                const titleTok = this.at("STRING") ? this.next() : null;
                const pos = this.parseOptionalPos();
                if (!this.expect("LBRACE", "'{'")) continue;
                const condId = idTok?.value ?? `condition_${Object.keys(nodes).length + 1}`;
                if (!pos) missingPos.add(condId);

                const rules: ConditionRule[] = [];
                while (!this.at("RBRACE") && !this.at("EOF")) {
                    if (this.at("SEMI")) {
                        this.next();
                        continue;
                    }
                    const ruleLine = this.peek().line;
                    if (this.at("IDENT", "else")) {
                        this.next();
                        if (this.sameLineAs(ruleLine) && this.at("ARROW")) {
                            this.next();
                            const targetTok = this.expectId("else target node id");
                            if (targetTok) {
                                pendingEdges.push({ fromNodeId: condId, fromPortId: "else", toNodeId: targetTok.value });
                            }
                        }
                        continue;
                    }

                    let ruleId = `rule${rules.length + 1}`;
                    if (this.atId() && this.peek(1).kind === "COLON") {
                        ruleId = this.next().value;
                        this.next(); // :
                    }
                    if (!this.expect("IDENT", "'if' or 'else'", "if")) {
                        this.next();
                        continue;
                    }
                    const expr = this.parseConditionExpr();
                    let label: string | undefined;
                    if (this.sameLineAs(ruleLine) && this.at("STRING")) {
                        label = this.next().value;
                    }
                    if (this.sameLineAs(ruleLine) && this.at("ARROW")) {
                        this.next();
                        const targetTok = this.expectId("rule target node id");
                        if (targetTok) {
                            pendingEdges.push({ fromNodeId: condId, fromPortId: ruleId, toNodeId: targetTok.value });
                        }
                    }
                    if (expr) {
                        rules.push({ id: ruleId, ...(label ? { label } : {}), expr });
                    }
                }
                this.expect("RBRACE", "'}'");

                const condNode: ConditionNode = {
                    id: condId,
                    type: "condition",
                    title: titleTok?.value ?? "",
                    pos: pos ?? { x: 0, y: 0 },
                    rules,
                };
                nodes[condId] = condNode;
                continue;
            }

            if (tok.kind === "IDENT" && tok.value === "end") {
                const endLine = tok.line;
                this.next();
                const idTok = this.expectId("end node id");
                const titleTok = this.sameLineAs(endLine) && this.at("STRING") ? this.next() : null;
                let subtitle: string | undefined;
                let pos: StoryNodePos | undefined;

                while (this.sameLineAs(endLine)) {
                    if (this.at("AT")) {
                        pos = this.parseOptionalPos();
                    } else if (this.at("IDENT", "subtitle")) {
                        this.next();
                        this.expect("EQ", "'='");
                        const s = this.expect("STRING", "subtitle string");
                        if (s) subtitle = s.value;
                    } else {
                        this.error(this.peek(), `Unexpected token '${this.peek().value}' in end node`);
                        this.next();
                        break;
                    }
                }
                const endId = idTok?.value ?? `end_${Object.keys(nodes).length + 1}`;
                if (!pos) missingPos.add(endId);
                const endNode: EndNode = {
                    id: endId,
                    type: "end",
                    title: titleTok?.value ?? "",
                    ...(subtitle !== undefined ? { subtitle } : {}),
                    pos: pos ?? { x: 0, y: 0 },
                };
                nodes[endId] = endNode;
                continue;
            }

            this.error(tok, `Unexpected token '${tok.value || tok.kind}'`);
            this.next();
        }

        if (!hasAnyStatement) {
            this.diagnostics.push({ line: 1, col: 1, message: "Empty MoeSekai Script source" });
        }

        if (this.diagnostics.length > 0) {
            return { ok: false, diagnostics: this.diagnostics };
        }

        if (!startNodeId) {
            startNodeId = "start";
            if (!nodes.start) {
                nodes.start = { id: "start", type: "start", pos: { x: 40, y: 120 } };
                missingPos.add("start");
            }
        }

        const usedEdgeIds = new Set<string>();
        const edges: StoryEdge[] = pendingEdges.map((e) => ({
            id: makeDeterministicId(`e_${e.fromNodeId}_${e.fromPortId}`, "e", usedEdgeIds),
            fromNodeId: e.fromNodeId,
            fromPortId: e.fromPortId,
            toNodeId: e.toNodeId,
        }));

        let doc: StoryDocument = {
            schema: STORY_SCHEMA_VERSION,
            id: docId && STORY_ID_PATTERN.test(docId) ? docId : newStoryId([], 10),
            region,
            ...(sourceLocale !== undefined ? { sourceLocale } : {}),
            meta: {
                title: title.slice(0, STORY_LIMITS.title),
                summary: summary.slice(0, STORY_LIMITS.summary),
                author: author.slice(0, STORY_LIMITS.author),
            },
            cast,
            variables,
            startNodeId,
            nodes,
            edges,
        };

        if (missingPos.size > 0) {
            doc = autoLayoutGraph(doc, { onlyNodeIds: missingPos });
        }

        return { ok: true, doc, diagnostics: [] };
    }
}

/** Parses MoeSekai Script (`.msk`) source text into a `moesekai-story/2` `StoryDocument`. */
export function parseStoryScript(source: string): StoryScriptParseResult {
    const { tokens, diagnostics: lexDiagnostics } = lexScript(source);
    const parser = new ScriptParser(tokens);
    const result = parser.parse();
    const allDiagnostics = [...lexDiagnostics, ...result.diagnostics];
    if (allDiagnostics.length > 0 || !result.ok) {
        return { ok: false, diagnostics: allDiagnostics };
    }
    return { ok: true, doc: result.doc, diagnostics: [] };
}
