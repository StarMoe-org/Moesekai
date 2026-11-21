/**
 * Static analyzer, semantic validator, and deterministic IR compiler for `moesekai-story/2`.
 *
 * Separates hard **errors** (invalid references, broken wiring, type mismatches, missing start wire)
 * from non-blocking **warnings** (isolated draft nodes, unwired branch ports, empty scenes, missing
 * reachable endings, zero-wait cycles) so authors can freely build isolated drafts while getting
 * immediate compiler feedback.
 */
import {
    CONDITION_OPS,
    EFFECT_COLORS,
    STORY_REGIONS,
    STORY_SCHEMA_VERSION,
    STORY_SLOTS,
    TRANSITION_KINDS,
    VOICE_KINDS,
    type BackgroundSlot,
    type BgmSlot,
    type ConditionExpr,
    type CueBeat,
    type NarrationBeat,
    type PlaceSlot,
    type SceneNode,
    type StageActionBeat,
    type StageCastSlot,
    type StoryCompileDiagnostic,
    type StoryCompileDiagnosticSeverity,
    type StoryDocument,
    type StoryEdge,
    type StoryIssueCode,
    type StoryNode,
    type StorySlot,
    type StoryVariable,
    type StoryVoiceRef,
    type TalkBeat,
    type TelopBeat,
    type TransitionSlot,
    type VarOp,
} from "../../types/storyMaker.ts";
import { getNodeOutPorts } from "./document.ts";
import {
    SLOT_X,
    STORY_ASSET_PATTERN,
    STORY_AUDIO_PATH_PATTERN,
    STORY_ID_PATTERN,
    STORY_LIMITS,
    STORY_MODEL_PATTERN,
    STORY_MOTION_PATTERN,
    STORY_TEMPLATE_VAR_PATTERN,
    detectStageActorOverlaps,
    layoutStageActors,
} from "./limits.ts";

// ==================== Intermediate Representation (IR) ====================

export interface CompiledChoiceOption {
    id: string;
    text: string;
    condition?: ConditionExpr;
    effects?: VarOp[];
    targetPc: number | null;
    edgeId?: string;
}

export interface CompiledConditionRule {
    id: string;
    label?: string;
    expr: ConditionExpr;
    targetPc: number | null;
    edgeId?: string;
}

export type StoryIR =
    | {
        op: "enterScene";
        nodeId: string;
        title: string;
        background: BackgroundSlot;
        bgm: BgmSlot;
        place: PlaceSlot;
        transition: TransitionSlot;
        stageCast: StageCastSlot;
    }
    | { op: "talk"; nodeId: string; beatId: string; beat: TalkBeat }
    | { op: "narration"; nodeId: string; beatId: string; beat: NarrationBeat }
    | { op: "telop"; nodeId: string; beatId: string; beat: TelopBeat }
    | { op: "stageAction"; nodeId: string; beatId: string; beat: StageActionBeat }
    | { op: "cue"; nodeId: string; beatId: string; beat: CueBeat }
    | { op: "varOp"; nodeId: string; beatId?: string; ops: VarOp[] }
    | { op: "choice"; nodeId: string; title: string; options: CompiledChoiceOption[] }
    | {
        op: "condition";
        nodeId: string;
        title: string;
        rules: CompiledConditionRule[];
        elsePc: number | null;
        elseEdgeId?: string;
    }
    | { op: "end"; nodeId: string; title: string; subtitle?: string }
    | { op: "jump"; nodeId: string; edgeId?: string; targetPc: number }
    | { op: "halt"; nodeId: string; reason: "disconnected" | "loop" };

export interface CompiledStoryProgram {
    doc: StoryDocument;
    instructions: StoryIR[];
    nodeEntryPc: Record<string, number>;
    beatPc: Record<string, number>;
    diagnostics: StoryCompileDiagnostic[];
    errors: StoryCompileDiagnostic[];
    warnings: StoryCompileDiagnostic[];
    ok: boolean;
    reachableNodeIds: string[];
    endingNodeIds: string[];
}

const MAX_DIAGNOSTICS = 100;

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function isBlockingScene(node: SceneNode): boolean {
    return node.beats.some(beat => beat.kind === "talk" || beat.kind === "narration" || beat.kind === "telop");
}

// ==================== Compiler Implementation ====================

export function compileStoryGraph(doc: StoryDocument): CompiledStoryProgram {
    const diagnostics: StoryCompileDiagnostic[] = [];

    const addDiag = (
        severity: StoryCompileDiagnosticSeverity,
        code: StoryIssueCode,
        path: string,
        opts?: { nodeId?: string; beatId?: string; params?: Record<string, string | number> },
    ) => {
        if (diagnostics.length >= MAX_DIAGNOSTICS) return;
        diagnostics.push({
            severity,
            code,
            path,
            ...(opts?.nodeId !== undefined ? { nodeId: opts.nodeId } : {}),
            ...(opts?.beatId !== undefined ? { beatId: opts.beatId } : {}),
            ...(opts?.params !== undefined ? { params: opts.params } : {}),
        });
    };

    const addError = (
        code: StoryIssueCode,
        path: string,
        opts?: { nodeId?: string; beatId?: string; params?: Record<string, string | number> },
    ) => addDiag("error", code, path, opts);

    const addWarning = (
        code: StoryIssueCode,
        path: string,
        opts?: { nodeId?: string; beatId?: string; params?: Record<string, string | number> },
    ) => addDiag("warning", code, path, opts);

    // 1. Document header & metadata checks.
    if (doc.schema !== STORY_SCHEMA_VERSION) {
        addError("formatUnsupported", "schema", { params: { format: String(doc.schema) } });
    }
    if (!(STORY_REGIONS as readonly string[]).includes(doc.region)) {
        addError("regionInvalid", "region", { params: { allowed: STORY_REGIONS.join(", ") } });
    }
    if (!STORY_ID_PATTERN.test(doc.id)) {
        addError("idInvalid", "id");
    }
    if (doc.meta.title.length > STORY_LIMITS.title) {
        addError("tooLong", "meta.title", { params: { max: STORY_LIMITS.title } });
    }
    if (doc.meta.summary.length > STORY_LIMITS.summary) {
        addError("tooLong", "meta.summary", { params: { max: STORY_LIMITS.summary } });
    }
    if (doc.meta.author.length > STORY_LIMITS.author) {
        addError("tooLong", "meta.author", { params: { max: STORY_LIMITS.author } });
    }

    // 2. Cast table checks.
    const castKeys = new Set<string>();
    if (doc.cast.length > STORY_LIMITS.cast) {
        addError("tooMany", "cast", { params: { max: STORY_LIMITS.cast } });
    }
    doc.cast.forEach((member, idx) => {
        const path = `cast[${idx}]`;
        if (!STORY_ID_PATTERN.test(member.key)) {
            addError("idInvalid", `${path}.key`);
        } else if (castKeys.has(member.key)) {
            addError("idDuplicate", `${path}.key`, { params: { id: member.key } });
        } else {
            castKeys.add(member.key);
        }
        if (!STORY_MODEL_PATTERN.test(member.modelId)) {
            addError("modelIdInvalid", `${path}.modelId`);
        }
        if (member.name.length > STORY_LIMITS.castName) {
            addError("tooLong", `${path}.name`, { params: { max: STORY_LIMITS.castName } });
        }
        if (
            member.characterId !== undefined
            && (!Number.isInteger(member.characterId) || member.characterId < 1 || member.characterId > 999)
        ) {
            addError("numberRange", `${path}.characterId`, { params: { min: 1, max: 999 } });
        }
    });

    // 3. Variables table checks.
    const varById = new Map<string, StoryVariable>();
    const validTemplateTokens = new Set<string>();
    if (doc.variables.length > STORY_LIMITS.variables) {
        addError("tooMany", "variables", { params: { max: STORY_LIMITS.variables } });
    }
    doc.variables.forEach((variable, idx) => {
        const path = `variables[${idx}]`;
        if (!STORY_ID_PATTERN.test(variable.id)) {
            addError("idInvalid", `${path}.id`);
        } else if (varById.has(variable.id)) {
            addError("idDuplicate", `${path}.id`, { params: { id: variable.id } });
        } else {
            varById.set(variable.id, variable);
            validTemplateTokens.add(variable.id);
        }
        if (variable.name.length > STORY_LIMITS.varName) {
            addError("tooLong", `${path}.name`, { params: { max: STORY_LIMITS.varName } });
        } else if (variable.name.trim()) {
            validTemplateTokens.add(variable.name.trim());
        }
        if (variable.type === "number") {
            if (typeof variable.initial !== "number" || !Number.isFinite(variable.initial)) {
                addError("fieldType", `${path}.initial`, { params: { expected: "number" } });
            } else if (variable.initial < STORY_LIMITS.varNumberMin || variable.initial > STORY_LIMITS.varNumberMax) {
                addError("numberRange", `${path}.initial`, {
                    params: { min: STORY_LIMITS.varNumberMin, max: STORY_LIMITS.varNumberMax },
                });
            }
        } else if (variable.type === "boolean") {
            if (typeof variable.initial !== "boolean") {
                addError("fieldType", `${path}.initial`, { params: { expected: "boolean" } });
            }
        } else {
            addError("enumInvalid", `${path}.type`, { params: { allowed: "number, boolean" } });
        }
    });

    // Reusable validation helpers for expressions, ops, templates, voice, audio, clips.
    const checkTemplateRefs = (text: string | undefined, path: string, nodeId: string, beatId?: string) => {
        if (!text) return;
        STORY_TEMPLATE_VAR_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = STORY_TEMPLATE_VAR_PATTERN.exec(text)) !== null) {
            const token = match[1].trim();
            if (!validTemplateTokens.has(token)) {
                addError("templateVarMissing", path, { nodeId, beatId, params: { name: token } });
            }
        }
    };

    const checkVarOp = (op: VarOp, path: string, nodeId: string, beatId?: string) => {
        const variable = varById.get(op.varId);
        if (!variable) {
            addError("variableNotFound", `${path}.varId`, { nodeId, beatId, params: { id: op.varId } });
            return;
        }
        if (variable.type === "number") {
            if (op.op !== "set" && op.op !== "add" && op.op !== "sub") {
                addError("variableTypeMismatch", `${path}.op`, {
                    nodeId, beatId, params: { id: op.varId, type: "number" },
                });
                return;
            }
            if (typeof op.value !== "number" || !Number.isFinite(op.value)) {
                addError("variableTypeMismatch", `${path}.value`, {
                    nodeId, beatId, params: { id: op.varId, type: "number" },
                });
                return;
            }
            if (op.value < STORY_LIMITS.varNumberMin || op.value > STORY_LIMITS.varNumberMax) {
                addError("numberRange", `${path}.value`, {
                    nodeId, beatId, params: { min: STORY_LIMITS.varNumberMin, max: STORY_LIMITS.varNumberMax },
                });
            }
        } else {
            if (op.op === "toggle") return;
            if (op.op !== "set") {
                addError("variableTypeMismatch", `${path}.op`, {
                    nodeId, beatId, params: { id: op.varId, type: "boolean" },
                });
                return;
            }
            if (typeof op.value !== "boolean") {
                addError("variableTypeMismatch", `${path}.value`, {
                    nodeId, beatId, params: { id: op.varId, type: "boolean" },
                });
            }
        }
    };

    const checkCondition = (expr: ConditionExpr, path: string, nodeId: string) => {
        if (!(CONDITION_OPS as readonly string[]).includes(expr.op)) {
            addError("conditionInvalid", `${path}.op`, { nodeId });
            return;
        }
        const variable = varById.get(expr.varId);
        if (!variable) {
            addError("variableNotFound", `${path}.varId`, { nodeId, params: { id: expr.varId } });
            return;
        }
        if (variable.type === "boolean") {
            if (expr.op !== "==" && expr.op !== "!=") {
                addError("variableTypeMismatch", `${path}.op`, {
                    nodeId, params: { id: expr.varId, type: "boolean" },
                });
                return;
            }
            if (typeof expr.value !== "boolean") {
                addError("variableTypeMismatch", `${path}.value`, {
                    nodeId, params: { id: expr.varId, type: "boolean" },
                });
            }
        } else {
            if (typeof expr.value !== "number" || !Number.isFinite(expr.value)) {
                addError("variableTypeMismatch", `${path}.value`, {
                    nodeId, params: { id: expr.varId, type: "number" },
                });
                return;
            }
            if (expr.value < STORY_LIMITS.varNumberMin || expr.value > STORY_LIMITS.varNumberMax) {
                addError("numberRange", `${path}.value`, {
                    nodeId, params: { min: STORY_LIMITS.varNumberMin, max: STORY_LIMITS.varNumberMax },
                });
            }
        }
    };

    const checkVoiceRef = (voice: StoryVoiceRef, path: string, nodeId: string, beatId: string) => {
        if (!(VOICE_KINDS as readonly string[]).includes(voice.kind)) {
            addError("enumInvalid", `${path}.kind`, { nodeId, beatId, params: { allowed: VOICE_KINDS.join(", ") } });
        }
        if (!voice.scenarioId) {
            addError("fieldMissing", `${path}.scenarioId`, { nodeId, beatId });
        } else if (!STORY_ASSET_PATTERN.test(voice.scenarioId)) {
            addError("assetNameInvalid", `${path}.scenarioId`, { nodeId, beatId });
        }
        if (!voice.voiceId) {
            addError("fieldMissing", `${path}.voiceId`, { nodeId, beatId });
        } else if (!STORY_ASSET_PATTERN.test(voice.voiceId)) {
            addError("assetNameInvalid", `${path}.voiceId`, { nodeId, beatId });
        }
        if (voice.region !== undefined && !(STORY_REGIONS as readonly string[]).includes(voice.region)) {
            addError("regionInvalid", `${path}.region`, {
                nodeId, beatId, params: { allowed: STORY_REGIONS.join(", ") },
            });
        }
        let trimOk = true;
        if (voice.start !== undefined) {
            if (typeof voice.start !== "number" || !Number.isFinite(voice.start) || voice.start < 0 || voice.start > STORY_LIMITS.voiceTrimMax) {
                addError("voiceTrimInvalid", `${path}.start`, { nodeId, beatId });
                trimOk = false;
            }
        }
        if (voice.end !== undefined) {
            if (typeof voice.end !== "number" || !Number.isFinite(voice.end) || voice.end <= 0 || voice.end > STORY_LIMITS.voiceTrimMax) {
                addError("voiceTrimInvalid", `${path}.end`, { nodeId, beatId });
                trimOk = false;
            }
        }
        if (trimOk && voice.start !== undefined && voice.end !== undefined) {
            if (voice.end <= voice.start || (voice.end - voice.start) + 1e-9 < STORY_LIMITS.voiceTrimMinSpan) {
                addError("voiceTrimInvalid", path, { nodeId, beatId });
            }
        }
    };

    const checkOptionalMotion = (value: string | undefined, path: string, nodeId: string, beatId?: string) => {
        if (value !== undefined && value !== "" && !STORY_MOTION_PATTERN.test(value)) {
            addError("assetNameInvalid", path, { nodeId, beatId });
        }
    };

    const checkOptionalSe = (se: string | undefined, seVolume: number | undefined, path: string, nodeId: string, beatId: string) => {
        if (se !== undefined && se !== "" && !STORY_AUDIO_PATH_PATTERN.test(se)) {
            addError("assetNameInvalid", `${path}.se`, { nodeId, beatId });
        }
        if (seVolume !== undefined) {
            if (typeof seVolume !== "number" || !Number.isFinite(seVolume) || seVolume < STORY_LIMITS.volume.min || seVolume > STORY_LIMITS.volume.max) {
                addError("numberRange", `${path}.seVolume`, {
                    nodeId, beatId, params: { min: STORY_LIMITS.volume.min, max: STORY_LIMITS.volume.max },
                });
            }
        }
    };

    const checkScaleAndY = (scale: number | undefined, y: number | undefined, path: string, nodeId: string, beatId?: string) => {
        if (scale !== undefined) {
            if (typeof scale !== "number" || !Number.isFinite(scale) || scale < STORY_LIMITS.scaleMin || scale > STORY_LIMITS.scaleMax) {
                addError("numberRange", `${path}.scale`, {
                    nodeId, beatId, params: { min: STORY_LIMITS.scaleMin, max: STORY_LIMITS.scaleMax },
                });
            }
        }
        if (y !== undefined) {
            if (typeof y !== "number" || !Number.isFinite(y) || y < STORY_LIMITS.yMin || y > STORY_LIMITS.yMax) {
                addError("numberRange", `${path}.y`, {
                    nodeId, beatId, params: { min: STORY_LIMITS.yMin, max: STORY_LIMITS.yMax },
                });
            }
        }
    };

    // 4. Nodes validation.
    const nodeEntries = Object.entries(doc.nodes);
    if (nodeEntries.length > STORY_LIMITS.nodes) {
        addError("tooMany", "nodes", { params: { max: STORY_LIMITS.nodes } });
    }

    const startNode = doc.nodes[doc.startNodeId];
    if (!startNode || startNode.type !== "start") {
        addError("startMissing", "startNodeId");
    }

    const seenBeatIds = new Set<string>();
    let totalBeats = 0;

    for (const [key, node] of nodeEntries) {
        const nodePath = `nodes.${key}`;
        if (!STORY_ID_PATTERN.test(key) || node.id !== key) {
            addError("idInvalid", `${nodePath}.id`, { nodeId: key });
        }
        if (
            !Number.isFinite(node.pos.x) || !Number.isFinite(node.pos.y)
            || node.pos.x < STORY_LIMITS.coordMin || node.pos.x > STORY_LIMITS.coordMax
            || node.pos.y < STORY_LIMITS.coordMin || node.pos.y > STORY_LIMITS.coordMax
        ) {
            addError("flowLayoutInvalid", `${nodePath}.pos`, { nodeId: key });
        }

        if (node.type === "start") {
            if (key !== doc.startNodeId) {
                addError("idDuplicate", nodePath, { nodeId: key, params: { id: key } });
            }
            continue;
        }

        if (node.title.length > STORY_LIMITS.nodeTitle) {
            addError("tooLong", `${nodePath}.title`, { nodeId: key, params: { max: STORY_LIMITS.nodeTitle } });
        }

        if (node.type === "scene") {
            // Stage slots validation
            if (node.background.mode === "set") {
                if (!node.background.asset) {
                    addError("fieldMissing", `${nodePath}.background.asset`, { nodeId: key });
                } else if (!STORY_ASSET_PATTERN.test(node.background.asset)) {
                    addError("assetNameInvalid", `${nodePath}.background.asset`, { nodeId: key });
                }
            }
            if (node.bgm.mode === "play") {
                if (!node.bgm.name) {
                    addError("fieldMissing", `${nodePath}.bgm.name`, { nodeId: key });
                } else if (!STORY_AUDIO_PATH_PATTERN.test(node.bgm.name)) {
                    addError("assetNameInvalid", `${nodePath}.bgm.name`, { nodeId: key });
                }
                if (
                    typeof node.bgm.volume !== "number"
                    || !Number.isFinite(node.bgm.volume)
                    || node.bgm.volume < STORY_LIMITS.volume.min
                    || node.bgm.volume > STORY_LIMITS.volume.max
                ) {
                    addError("numberRange", `${nodePath}.bgm.volume`, {
                        nodeId: key, params: { min: STORY_LIMITS.volume.min, max: STORY_LIMITS.volume.max },
                    });
                }
            }
            if (node.place.mode === "set") {
                if (node.place.text.length > STORY_LIMITS.place) {
                    addError("tooLong", `${nodePath}.place.text`, { nodeId: key, params: { max: STORY_LIMITS.place } });
                }
                checkTemplateRefs(node.place.text, `${nodePath}.place.text`, key);
            }
            if (!(TRANSITION_KINDS as readonly string[]).includes(node.transition.kind)) {
                addError("enumInvalid", `${nodePath}.transition.kind`, {
                    nodeId: key, params: { allowed: TRANSITION_KINDS.join(", ") },
                });
            }
            if (
                typeof node.transition.duration !== "number"
                || !Number.isFinite(node.transition.duration)
                || node.transition.duration < STORY_LIMITS.duration.min
                || node.transition.duration > STORY_LIMITS.duration.max
            ) {
                addError("numberRange", `${nodePath}.transition.duration`, {
                    nodeId: key, params: { min: STORY_LIMITS.duration.min, max: STORY_LIMITS.duration.max },
                });
            }
            const emitStageOverlapWarnings = (
                actors: ReadonlyArray<{ cast: string; slot: StorySlot; x: number; scale: number }>,
                path: string,
                beatId?: string,
            ) => {
                const audit = detectStageActorOverlaps(actors);
                for (const dup of audit.duplicateSlots) {
                    addWarning("stageSlotDuplicate", path, {
                        nodeId: key,
                        ...(beatId ? { beatId } : {}),
                        params: { slot: dup.slot, actors: dup.actors.join(", ") },
                    });
                }
                for (const ov of audit.overlaps) {
                    addWarning("stageActorOverlap", path, {
                        nodeId: key,
                        ...(beatId ? { beatId } : {}),
                        params: {
                            actors: `${ov.leftActor}, ${ov.rightActor}`,
                            gap: ov.gap.toFixed(2),
                            minGap: ov.minGap.toFixed(2),
                        },
                    });
                }
            };

            let trackedStage: Array<{ cast: string; slot: StorySlot; x: number; scale: number }> = [];

            if (node.stageCast.mode === "set") {
                if (node.stageCast.actors.length > STORY_LIMITS.stageActors) {
                    addError("actorLimitExceeded", `${nodePath}.stageCast.actors`, {
                        nodeId: key, params: { max: STORY_LIMITS.stageActors },
                    });
                }
                const seenStageActors = new Set<string>();
                node.stageCast.actors.forEach((actor, actorIdx) => {
                    const actorPath = `${nodePath}.stageCast.actors[${actorIdx}]`;
                    if (!actor.castKey) {
                        addError("fieldMissing", `${actorPath}.castKey`, { nodeId: key });
                    } else if (!castKeys.has(actor.castKey)) {
                        addError("castUnknown", `${actorPath}.castKey`, { nodeId: key, params: { key: actor.castKey } });
                    } else if (seenStageActors.has(actor.castKey)) {
                        addError("actorDuplicate", `${actorPath}.castKey`, { nodeId: key, params: { key: actor.castKey } });
                    } else {
                        seenStageActors.add(actor.castKey);
                        if ((STORY_SLOTS as readonly string[]).includes(actor.slot)) {
                            trackedStage.push({
                                cast: actor.castKey,
                                slot: actor.slot,
                                x: SLOT_X[actor.slot],
                                scale: typeof actor.scale === "number" && Number.isFinite(actor.scale) ? actor.scale : 1,
                            });
                        }
                    }
                    if (!(STORY_SLOTS as readonly string[]).includes(actor.slot)) {
                        addError("enumInvalid", `${actorPath}.slot`, {
                            nodeId: key, params: { allowed: STORY_SLOTS.join(", ") },
                        });
                    }
                    checkScaleAndY(actor.scale, actor.y, actorPath, key);
                    checkOptionalMotion(actor.motion, `${actorPath}.motion`, key);
                    checkOptionalMotion(actor.facial, `${actorPath}.facial`, key);
                });
                trackedStage = layoutStageActors(trackedStage);
                emitStageOverlapWarnings(trackedStage, `${nodePath}.stageCast.actors`);
            }

            // Beats validation
            if (node.beats.length === 0) {
                addWarning("sceneEmptyBeats", `${nodePath}.beats`, { nodeId: key });
            }
            if (node.beats.length > STORY_LIMITS.beatsPerScene) {
                addError("tooMany", `${nodePath}.beats`, { nodeId: key, params: { max: STORY_LIMITS.beatsPerScene } });
            }
            totalBeats += node.beats.length;

            node.beats.forEach((beat, beatIdx) => {
                const beatPath = `${nodePath}.beats[${beatIdx}]`;
                if (!STORY_ID_PATTERN.test(beat.id)) {
                    addError("idInvalid", `${beatPath}.id`, { nodeId: key, beatId: beat.id });
                } else if (seenBeatIds.has(beat.id)) {
                    addError("idDuplicate", `${beatPath}.id`, { nodeId: key, beatId: beat.id, params: { id: beat.id } });
                } else {
                    seenBeatIds.add(beat.id);
                }

                switch (beat.kind) {
                    case "talk": {
                        if (beat.speakerKey !== undefined && beat.speakerKey !== "" && !castKeys.has(beat.speakerKey)) {
                            addError("castUnknown", `${beatPath}.speakerKey`, {
                                nodeId: key, beatId: beat.id, params: { key: beat.speakerKey },
                            });
                        }
                        const hasSpeakerKey = Boolean(beat.speakerKey && beat.speakerKey.trim());
                        const hasSpeakerName = Boolean(beat.speakerName && beat.speakerName.trim());
                        if (!hasSpeakerKey && !hasSpeakerName) {
                            addError("speakerMissing", beatPath, { nodeId: key, beatId: beat.id });
                        }
                        if (beat.speakerName && beat.speakerName.length > STORY_LIMITS.speakerName) {
                            addError("tooLong", `${beatPath}.speakerName`, {
                                nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.speakerName },
                            });
                        }
                        checkTemplateRefs(beat.speakerName, `${beatPath}.speakerName`, key, beat.id);
                        if (beat.body.length > STORY_LIMITS.body) {
                            addError("tooLong", `${beatPath}.body`, {
                                nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.body },
                            });
                        }
                        checkTemplateRefs(beat.body, `${beatPath}.body`, key, beat.id);
                        checkOptionalMotion(beat.motion, `${beatPath}.motion`, key, beat.id);
                        checkOptionalMotion(beat.facial, `${beatPath}.facial`, key, beat.id);
                        if (beat.reactions) {
                            if (beat.reactions.length > STORY_LIMITS.reactionsPerTalk) {
                                addError("tooMany", `${beatPath}.reactions`, {
                                    nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.reactionsPerTalk },
                                });
                            }
                            beat.reactions.forEach((reaction, rIdx) => {
                                const rPath = `${beatPath}.reactions[${rIdx}]`;
                                if (!reaction.castKey) {
                                    addError("fieldMissing", `${rPath}.castKey`, { nodeId: key, beatId: beat.id });
                                } else if (!castKeys.has(reaction.castKey)) {
                                    addError("castUnknown", `${rPath}.castKey`, {
                                        nodeId: key, beatId: beat.id, params: { key: reaction.castKey },
                                    });
                                }
                                checkOptionalMotion(reaction.motion, `${rPath}.motion`, key, beat.id);
                                checkOptionalMotion(reaction.facial, `${rPath}.facial`, key, beat.id);
                            });
                        }
                        if (beat.voice) {
                            checkVoiceRef(beat.voice, `${beatPath}.voice`, key, beat.id);
                        }
                        checkOptionalSe(beat.se, beat.seVolume, beatPath, key, beat.id);
                        break;
                    }
                    case "narration": {
                        if (beat.body.length > STORY_LIMITS.body) {
                            addError("tooLong", `${beatPath}.body`, {
                                nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.body },
                            });
                        }
                        checkTemplateRefs(beat.body, `${beatPath}.body`, key, beat.id);
                        checkOptionalSe(beat.se, beat.seVolume, beatPath, key, beat.id);
                        break;
                    }
                    case "telop": {
                        if (beat.text.length > STORY_LIMITS.telop) {
                            addError("tooLong", `${beatPath}.text`, {
                                nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.telop },
                            });
                        }
                        checkTemplateRefs(beat.text, `${beatPath}.text`, key, beat.id);
                        break;
                    }
                    case "stageAction": {
                        if (!beat.castKey) {
                            addError("fieldMissing", `${beatPath}.castKey`, { nodeId: key, beatId: beat.id });
                        } else if (!castKeys.has(beat.castKey)) {
                            addError("castUnknown", `${beatPath}.castKey`, {
                                nodeId: key, beatId: beat.id, params: { key: beat.castKey },
                            });
                        }
                        if (beat.slot !== undefined && !(STORY_SLOTS as readonly string[]).includes(beat.slot)) {
                            addError("enumInvalid", `${beatPath}.slot`, {
                                nodeId: key, beatId: beat.id, params: { allowed: STORY_SLOTS.join(", ") },
                            });
                        }
                        checkScaleAndY(beat.scale, beat.y, beatPath, key, beat.id);
                        checkOptionalMotion(beat.motion, `${beatPath}.motion`, key, beat.id);
                        checkOptionalMotion(beat.facial, `${beatPath}.facial`, key, beat.id);
                        if (beat.duration !== undefined) {
                            if (
                                typeof beat.duration !== "number"
                                || !Number.isFinite(beat.duration)
                                || beat.duration < STORY_LIMITS.duration.min
                                || beat.duration > STORY_LIMITS.duration.max
                            ) {
                                addError("numberRange", `${beatPath}.duration`, {
                                    nodeId: key, beatId: beat.id, params: { min: STORY_LIMITS.duration.min, max: STORY_LIMITS.duration.max },
                                });
                            }
                        }
                        if (beat.castKey && castKeys.has(beat.castKey)) {
                            if (beat.action === "enter") {
                                const slot = beat.slot && (STORY_SLOTS as readonly string[]).includes(beat.slot) ? beat.slot : "center";
                                const scale = typeof beat.scale === "number" && Number.isFinite(beat.scale) ? beat.scale : 1;
                                trackedStage = layoutStageActors([
                                    ...trackedStage.filter(a => a.cast !== beat.castKey),
                                    { cast: beat.castKey, slot, x: SLOT_X[slot], scale },
                                ]);
                                emitStageOverlapWarnings(trackedStage, beatPath, beat.id);
                            } else if (beat.action === "exit") {
                                trackedStage = layoutStageActors(trackedStage.filter(a => a.cast !== beat.castKey));
                            } else if (beat.action === "move") {
                                let changed = false;
                                trackedStage = layoutStageActors(trackedStage.map((actor) => {
                                    if (actor.cast !== beat.castKey) return actor;
                                    const nextSlot = beat.slot && (STORY_SLOTS as readonly string[]).includes(beat.slot)
                                        ? beat.slot
                                        : actor.slot;
                                    const nextScale = typeof beat.scale === "number" && Number.isFinite(beat.scale)
                                        ? beat.scale
                                        : actor.scale;
                                    if (nextSlot !== actor.slot || nextScale !== actor.scale) changed = true;
                                    return { ...actor, slot: nextSlot, x: SLOT_X[nextSlot], scale: nextScale };
                                }));
                                if (changed) {
                                    emitStageOverlapWarnings(trackedStage, beatPath, beat.id);
                                }
                            }
                        }
                        break;
                    }
                    case "cue": {
                        if (beat.cueType === "se") {
                            if (!beat.se) {
                                addError("fieldMissing", `${beatPath}.se`, { nodeId: key, beatId: beat.id });
                            } else {
                                checkOptionalSe(beat.se, beat.seVolume, beatPath, key, beat.id);
                            }
                        } else {
                            if (beat.cueType === "flash" && beat.color !== undefined && !(EFFECT_COLORS as readonly string[]).includes(beat.color)) {
                                addError("enumInvalid", `${beatPath}.color`, {
                                    nodeId: key, beatId: beat.id, params: { allowed: EFFECT_COLORS.join(", ") },
                                });
                            }
                            if (beat.duration !== undefined) {
                                if (
                                    typeof beat.duration !== "number"
                                    || !Number.isFinite(beat.duration)
                                    || beat.duration < STORY_LIMITS.duration.min
                                    || beat.duration > STORY_LIMITS.duration.max
                                ) {
                                    addError("numberRange", `${beatPath}.duration`, {
                                        nodeId: key, beatId: beat.id, params: { min: STORY_LIMITS.duration.min, max: STORY_LIMITS.duration.max },
                                    });
                                }
                            }
                        }
                        break;
                    }
                    case "varOp": {
                        if (beat.ops.length > STORY_LIMITS.varOpsPerBeat) {
                            addError("tooMany", `${beatPath}.ops`, {
                                nodeId: key, beatId: beat.id, params: { max: STORY_LIMITS.varOpsPerBeat },
                            });
                        }
                        beat.ops.forEach((op, opIdx) => {
                            checkVarOp(op, `${beatPath}.ops[${opIdx}]`, key, beat.id);
                        });
                        break;
                    }
                }
            });
        } else if (node.type === "choice") {
            if (node.options.length < STORY_LIMITS.choiceOptions.min) {
                addError("tooFew", `${nodePath}.options`, { nodeId: key, params: { min: STORY_LIMITS.choiceOptions.min } });
            }
            if (node.options.length > STORY_LIMITS.choiceOptions.max) {
                addError("tooMany", `${nodePath}.options`, { nodeId: key, params: { max: STORY_LIMITS.choiceOptions.max } });
            }
            const seenOptIds = new Set<string>();
            node.options.forEach((opt, optIdx) => {
                const optPath = `${nodePath}.options[${optIdx}]`;
                if (!STORY_ID_PATTERN.test(opt.id)) {
                    addError("idInvalid", `${optPath}.id`, { nodeId: key });
                } else if (seenOptIds.has(opt.id)) {
                    addError("idDuplicate", `${optPath}.id`, { nodeId: key, params: { id: opt.id } });
                } else {
                    seenOptIds.add(opt.id);
                }
                if (opt.text.trim() === "") {
                    addError("choiceOptionEmpty", `${optPath}.text`, { nodeId: key });
                } else if (opt.text.length > STORY_LIMITS.choiceText) {
                    addError("tooLong", `${optPath}.text`, { nodeId: key, params: { max: STORY_LIMITS.choiceText } });
                }
                checkTemplateRefs(opt.text, `${optPath}.text`, key);
                if (opt.condition) {
                    checkCondition(opt.condition, `${optPath}.condition`, key);
                }
                if (opt.effects) {
                    if (opt.effects.length > STORY_LIMITS.varOpsPerBeat) {
                        addError("tooMany", `${optPath}.effects`, { nodeId: key, params: { max: STORY_LIMITS.varOpsPerBeat } });
                    }
                    opt.effects.forEach((eff, effIdx) => {
                        checkVarOp(eff, `${optPath}.effects[${effIdx}]`, key);
                    });
                }
            });
        } else if (node.type === "condition") {
            if (node.rules.length > STORY_LIMITS.conditionRules) {
                addError("tooMany", `${nodePath}.rules`, { nodeId: key, params: { max: STORY_LIMITS.conditionRules } });
            }
            const seenRuleIds = new Set<string>();
            node.rules.forEach((rule, ruleIdx) => {
                const rulePath = `${nodePath}.rules[${ruleIdx}]`;
                if (!STORY_ID_PATTERN.test(rule.id) || rule.id === "else") {
                    addError("idInvalid", `${rulePath}.id`, { nodeId: key });
                } else if (seenRuleIds.has(rule.id)) {
                    addError("idDuplicate", `${rulePath}.id`, { nodeId: key, params: { id: rule.id } });
                } else {
                    seenRuleIds.add(rule.id);
                }
                if (rule.label && rule.label.length > STORY_LIMITS.ruleLabel) {
                    addError("tooLong", `${rulePath}.label`, { nodeId: key, params: { max: STORY_LIMITS.ruleLabel } });
                }
                checkCondition(rule.expr, `${rulePath}.expr`, key);
            });
        } else if (node.type === "end") {
            checkTemplateRefs(node.title, `${nodePath}.title`, key);
            if (node.subtitle !== undefined) {
                if (node.subtitle.length > STORY_LIMITS.endSubtitle) {
                    addError("tooLong", `${nodePath}.subtitle`, { nodeId: key, params: { max: STORY_LIMITS.endSubtitle } });
                }
                checkTemplateRefs(node.subtitle, `${nodePath}.subtitle`, key);
            }
        }
    }

    if (totalBeats > STORY_LIMITS.totalBeats) {
        addError("tooMany", "nodes", { params: { max: STORY_LIMITS.totalBeats } });
    }

    // 5. Edges validation & port map indexing.
    if (doc.edges.length > STORY_LIMITS.edges) {
        addError("tooMany", "edges", { params: { max: STORY_LIMITS.edges } });
    }
    const seenEdgeIds = new Set<string>();
    const edgeByPort = new Map<string, StoryEdge>();

    doc.edges.forEach((edge, idx) => {
        const edgePath = `edges[${idx}]`;
        if (!STORY_ID_PATTERN.test(edge.id)) {
            addError("idInvalid", `${edgePath}.id`, { nodeId: edge.fromNodeId });
        } else if (seenEdgeIds.has(edge.id)) {
            addError("idDuplicate", `${edgePath}.id`, { nodeId: edge.fromNodeId, params: { id: edge.id } });
        } else {
            seenEdgeIds.add(edge.id);
        }

        const fromNode = doc.nodes[edge.fromNodeId];
        const toNode = doc.nodes[edge.toNodeId];
        let valid = true;

        if (!fromNode || fromNode.type === "end" || !getNodeOutPorts(fromNode).includes(edge.fromPortId)) {
            addError("edgeInvalidSource", edgePath, {
                nodeId: fromNode?.id,
                params: { from: edge.fromNodeId, port: edge.fromPortId },
            });
            valid = false;
        }
        if (!toNode || toNode.id === doc.startNodeId || toNode.type === "start") {
            addError("edgeInvalidTarget", edgePath, {
                nodeId: fromNode?.id,
                params: { to: edge.toNodeId },
            });
            valid = false;
        }
        if (!valid) return;

        const portKey = `${edge.fromNodeId}\0${edge.fromPortId}`;
        if (edgeByPort.has(portKey)) {
            addError("edgeDuplicatePort", edgePath, {
                nodeId: edge.fromNodeId,
                params: { from: edge.fromNodeId, port: edge.fromPortId },
            });
            return;
        }
        edgeByPort.set(portKey, edge);
    });

    const inDegreeByNode = new Map<string, number>();
    for (const edge of edgeByPort.values()) {
        inDegreeByNode.set(edge.toNodeId, (inDegreeByNode.get(edge.toNodeId) ?? 0) + 1);
    }

    // 6. Start wire & reachability analysis.
    const reachableNodeIds: string[] = [];
    const reachableSet = new Set<string>();
    const endingNodeIds: string[] = [];

    if (startNode && startNode.type === "start") {
        if (!edgeByPort.has(`${startNode.id}\0out`)) {
            addError("startDisconnected", `nodes.${startNode.id}`, { nodeId: startNode.id });
        }
        reachableSet.add(startNode.id);
        reachableNodeIds.push(startNode.id);
        for (let head = 0; head < reachableNodeIds.length; head++) {
            const nodeId = reachableNodeIds[head];
            const node = doc.nodes[nodeId];
            if (!node) continue;
            if (node.type === "end") endingNodeIds.push(node.id);
            for (const portId of getNodeOutPorts(node)) {
                const edge = edgeByPort.get(`${node.id}\0${portId}`);
                if (edge && doc.nodes[edge.toNodeId] && !reachableSet.has(edge.toNodeId)) {
                    reachableSet.add(edge.toNodeId);
                    reachableNodeIds.push(edge.toNodeId);
                }
            }
        }
    }

    if (startNode && startNode.type === "start" && endingNodeIds.length === 0) {
        addWarning("endingMissing", "nodes", { nodeId: startNode.id });
    }

    // Warn on isolated / unreachable nodes and unwired output ports (non-blocking!).
    for (const [nodeId, node] of nodeEntries) {
        if (nodeId !== doc.startNodeId && !reachableSet.has(nodeId)) {
            addWarning("nodeUnreachable", `nodes.${nodeId}`, { nodeId });
        }
        if (node.type !== "start" && node.type !== "end") {
            for (const portId of getNodeOutPorts(node)) {
                if (!edgeByPort.has(`${nodeId}\0${portId}`)) {
                    addWarning("portUnwired", `nodes.${nodeId}.ports.${portId}`, {
                        nodeId,
                        params: { port: portId },
                    });
                }
            }
        }
        if (node.type === "scene") {
            const inDegree = inDegreeByNode.get(nodeId) ?? 0;
            if (inDegree >= 2) {
                const inheritedSlotNames: string[] = [];
                if (node.background.mode === "inherit") inheritedSlotNames.push("background");
                if (node.bgm.mode === "inherit") inheritedSlotNames.push("bgm");
                if (node.place.mode === "inherit") inheritedSlotNames.push("place");
                if (node.stageCast.mode === "inherit") inheritedSlotNames.push("stageCast");
                if (inheritedSlotNames.length > 0) {
                    addWarning("mergeNodeInheritAmbiguous", `nodes.${nodeId}`, {
                        nodeId,
                        params: { count: inDegree, slots: inheritedSlotNames.join(", ") },
                    });
                }
            }
        }
    }

    // Static zero-wait cycle detection over reachable non-blocking nodes.
    const isNonBlockingNode = (node: StoryNode): boolean => {
        if (node.type === "start" || node.type === "condition") return true;
        if (node.type === "scene") return !isBlockingScene(node);
        return false;
    };
    const cycleState = new Map<string, 0 | 1 | 2>();
    const reportedCycleNodes = new Set<string>();
    const dfsCycle = (nodeId: string) => {
        const node = doc.nodes[nodeId];
        if (!node || !isNonBlockingNode(node)) return;
        cycleState.set(nodeId, 1);
        for (const portId of getNodeOutPorts(node)) {
            const edge = edgeByPort.get(`${nodeId}\0${portId}`);
            if (!edge) continue;
            const nextNode = doc.nodes[edge.toNodeId];
            if (!nextNode || !isNonBlockingNode(nextNode)) continue;
            const st = cycleState.get(edge.toNodeId) ?? 0;
            if (st === 1) {
                if (!reportedCycleNodes.has(nodeId)) {
                    reportedCycleNodes.add(nodeId);
                    addWarning("cycleDetected", `nodes.${nodeId}`, { nodeId });
                }
            } else if (st === 0) {
                dfsCycle(edge.toNodeId);
            }
        }
        cycleState.set(nodeId, 2);
    };
    for (const nodeId of reachableNodeIds) {
        if ((cycleState.get(nodeId) ?? 0) === 0) dfsCycle(nodeId);
    }

    // 7. 2-pass deterministic IR lowering (all nodes lowered so "Play from Scene" works even on isolated drafts).
    const unreachableOrdered = nodeEntries
        .map(([id]) => id)
        .filter(id => !reachableSet.has(id))
        .sort(compareStrings);
    const orderedNodeIds = [...reachableNodeIds, ...unreachableOrdered];

    const instructions: StoryIR[] = [];
    const nodeEntryPc: Record<string, number> = {};
    const beatPc: Record<string, number> = {};

    interface JumpPatch {
        kind: "jump";
        instIndex: number;
        targetNodeId: string;
    }
    interface ChoicePatch {
        kind: "choice";
        instIndex: number;
        optionIndex: number;
        targetNodeId: string;
    }
    interface ConditionRulePatch {
        kind: "condRule";
        instIndex: number;
        ruleIndex: number;
        targetNodeId: string;
    }
    interface ConditionElsePatch {
        kind: "condElse";
        instIndex: number;
        targetNodeId: string;
    }
    type Patch = JumpPatch | ChoicePatch | ConditionRulePatch | ConditionElsePatch;
    const patches: Patch[] = [];

    for (const nodeId of orderedNodeIds) {
        const node = doc.nodes[nodeId];
        if (!node) continue;
        nodeEntryPc[nodeId] = instructions.length;

        switch (node.type) {
            case "start": {
                const edge = edgeByPort.get(`${node.id}\0out`);
                if (edge && doc.nodes[edge.toNodeId]) {
                    const instIndex = instructions.length;
                    instructions.push({ op: "jump", nodeId: node.id, edgeId: edge.id, targetPc: -1 });
                    patches.push({ kind: "jump", instIndex, targetNodeId: edge.toNodeId });
                } else {
                    instructions.push({ op: "halt", nodeId: node.id, reason: "disconnected" });
                }
                break;
            }
            case "scene": {
                instructions.push({
                    op: "enterScene",
                    nodeId: node.id,
                    title: node.title,
                    background: node.background,
                    bgm: node.bgm,
                    place: node.place,
                    transition: node.transition,
                    stageCast: node.stageCast,
                });
                for (const beat of node.beats) {
                    beatPc[beat.id] = instructions.length;
                    switch (beat.kind) {
                        case "talk":
                            instructions.push({ op: "talk", nodeId: node.id, beatId: beat.id, beat });
                            break;
                        case "narration":
                            instructions.push({ op: "narration", nodeId: node.id, beatId: beat.id, beat });
                            break;
                        case "telop":
                            instructions.push({ op: "telop", nodeId: node.id, beatId: beat.id, beat });
                            break;
                        case "stageAction":
                            instructions.push({ op: "stageAction", nodeId: node.id, beatId: beat.id, beat });
                            break;
                        case "cue":
                            instructions.push({ op: "cue", nodeId: node.id, beatId: beat.id, beat });
                            break;
                        case "varOp":
                            instructions.push({ op: "varOp", nodeId: node.id, beatId: beat.id, ops: beat.ops });
                            break;
                    }
                }
                const outEdge = edgeByPort.get(`${node.id}\0out`);
                if (outEdge && doc.nodes[outEdge.toNodeId]) {
                    const instIndex = instructions.length;
                    instructions.push({ op: "jump", nodeId: node.id, edgeId: outEdge.id, targetPc: -1 });
                    patches.push({ kind: "jump", instIndex, targetNodeId: outEdge.toNodeId });
                } else {
                    instructions.push({ op: "halt", nodeId: node.id, reason: "disconnected" });
                }
                break;
            }
            case "choice": {
                const instIndex = instructions.length;
                const compiledOptions: CompiledChoiceOption[] = node.options.map((opt, optionIndex) => {
                    const edge = edgeByPort.get(`${node.id}\0${opt.id}`);
                    if (edge && doc.nodes[edge.toNodeId]) {
                        patches.push({ kind: "choice", instIndex, optionIndex, targetNodeId: edge.toNodeId });
                    }
                    return {
                        id: opt.id,
                        text: opt.text,
                        ...(opt.condition ? { condition: opt.condition } : {}),
                        ...(opt.effects && opt.effects.length > 0 ? { effects: opt.effects } : {}),
                        targetPc: null,
                        ...(edge ? { edgeId: edge.id } : {}),
                    };
                });
                instructions.push({ op: "choice", nodeId: node.id, title: node.title, options: compiledOptions });
                break;
            }
            case "condition": {
                const instIndex = instructions.length;
                const compiledRules: CompiledConditionRule[] = node.rules.map((rule, ruleIndex) => {
                    const edge = edgeByPort.get(`${node.id}\0${rule.id}`);
                    if (edge && doc.nodes[edge.toNodeId]) {
                        patches.push({ kind: "condRule", instIndex, ruleIndex, targetNodeId: edge.toNodeId });
                    }
                    return {
                        id: rule.id,
                        ...(rule.label ? { label: rule.label } : {}),
                        expr: rule.expr,
                        targetPc: null,
                        ...(edge ? { edgeId: edge.id } : {}),
                    };
                });
                const elseEdge = edgeByPort.get(`${node.id}\0else`);
                if (elseEdge && doc.nodes[elseEdge.toNodeId]) {
                    patches.push({ kind: "condElse", instIndex, targetNodeId: elseEdge.toNodeId });
                }
                instructions.push({
                    op: "condition",
                    nodeId: node.id,
                    title: node.title,
                    rules: compiledRules,
                    elsePc: null,
                    ...(elseEdge ? { elseEdgeId: elseEdge.id } : {}),
                });
                break;
            }
            case "end": {
                instructions.push({
                    op: "end",
                    nodeId: node.id,
                    title: node.title,
                    ...(node.subtitle !== undefined ? { subtitle: node.subtitle } : {}),
                });
                break;
            }
        }
    }

    // Pass 2: resolve all jump targets to exact PCs.
    for (const patch of patches) {
        const targetPc = nodeEntryPc[patch.targetNodeId];
        if (targetPc === undefined) continue;
        const inst = instructions[patch.instIndex];
        if (patch.kind === "jump" && inst.op === "jump") {
            inst.targetPc = targetPc;
        } else if (patch.kind === "choice" && inst.op === "choice") {
            inst.options[patch.optionIndex].targetPc = targetPc;
        } else if (patch.kind === "condRule" && inst.op === "condition") {
            inst.rules[patch.ruleIndex].targetPc = targetPc;
        } else if (patch.kind === "condElse" && inst.op === "condition") {
            inst.elsePc = targetPc;
        }
    }

    const errors = diagnostics.filter(d => d.severity === "error");
    const warnings = diagnostics.filter(d => d.severity === "warning");

    return {
        doc,
        instructions,
        nodeEntryPc,
        beatPc,
        diagnostics,
        errors,
        warnings,
        ok: errors.length === 0,
        reachableNodeIds,
        endingNodeIds,
    };
}
