"use client";
import { useEffect, useMemo, useState } from "react";
import { getServerDisplayCode } from "@/components/common/ServerRegion";
import { Live2DBackgroundGrid } from "@/components/live2d/Live2DBackgroundGrid";
import {
    Banner, Button, Chip, Dialog, Divider, Icon, IconButton, SegmentedButton, Select, Slider, Switch, TextField,
    type SelectOption,
} from "@/components/md3";
import {
    mdAdd, mdAltRoute, mdArrowBack, mdBolt, mdCalculate, mdChat, mdClose, mdContentCopy, mdDelete, mdFlag,
    mdGroup, mdImage, mdKeyboardArrowDown, mdKeyboardArrowUp, mdLink, mdLinkOff, mdMovie, mdMusicNote, mdNotes,
    mdNumbers, mdPerson, mdPlayArrow, mdPlayArrowFill, mdPlayCircle, mdRecordVoiceOver, mdRestartAlt, mdStopFill,
    mdTitle, mdVolumeUp, mdWarningFill,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import { live2dSources } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import {
    storyBackgroundUrl, storyBgmUrl, storySeCandidateUrls, storyVoiceCandidateUrls,
} from "@/lib/storyMaker/assets";
import {
    addActorToSceneCast, addCastKeyToScene, addChoiceOption, addConditionRule, connectEdge, createSceneBeat,
    defaultConditionForVariable, defaultVarOpForVariable, disconnectPort, duplicateBeat, getIncomingEdges,
    getOutgoingEdge, insertBeat, removeActorFromSceneCast, removeBeat, removeChoiceOption, removeConditionRule,
    replaceBeat, setSceneBackground, setSceneBgm, setScenePlace, setSceneStageCast, setSceneTransition,
    updateActorInSceneCast, updateChoiceOption, updateConditionRule, updateNode,
} from "@/lib/storyMaker/document";
import {
    DEFAULT_STORY_BACKGROUND, DEFAULT_STORY_BGM, DEFAULT_STORY_SE, STORY_LIMITS,
} from "@/lib/storyMaker/limits";
import { evaluateStageAt } from "@/lib/storyMaker/runtime";
import {
    CONDITION_OPS, CUE_TYPES, EFFECT_COLORS, SCENE_BEAT_KINDS, STAGE_ACTION_KINDS, STORY_SLOTS, TRANSITION_KINDS,
    VOICE_KINDS,
    type ActorReaction, type BackgroundSlot, type BgmSlot, type ChoiceNode, type ConditionExpr, type ConditionNode,
    type ConditionOp, type CueBeat, type CueType, type EndNode, type NarrationBeat, type PlaceSlot,
    type SceneActorSlot, type SceneBeat, type SceneBeatKind, type SceneNode, type StageActionBeat,
    type StageActionKind, type StageCastSlot, type StoryCastMember, type StoryCompileDiagnostic, type StoryDocument,
    type StoryEffectColor, type StoryNode, type StorySlot, type StoryVariable, type StoryVoiceKind,
    type StoryVoiceRef, type TalkBeat, type TelopBeat, type TransitionKind, type VarOp, type VarOpBeat,
} from "@/types/storyMaker";
import { AssetNamePickerDialog } from "./AssetNamePickerDialog";
import { ClipPickerField } from "./ClipPickerField";
import { StoryIssueList } from "./StoryIssueList";
import { previewStorySound, type PreviewSoundOptions } from "./useStoryAudio";
import { VoicePickerDialog } from "./VoicePickerDialog";
import { VoiceTrimControl } from "./VoiceTrimControl";

const VOICE_PLACEHOLDERS: Record<StoryVoiceKind, { scenarioId: string; voiceId: string }> = {
    story: { scenarioId: "event_210_01", voiceId: "voice_ev_night_26_01_01_19" },
    card: { scenarioId: "001001_ichika01", voiceId: "voice_card_01_01a_01_01" },
    area: { scenarioId: "areatalk01_001", voiceId: "area1_001_001" },
    part: { scenarioId: "21miku_light_sound", voiceId: "partvoice_01_021_light_sound" },
};

const BEAT_ICONS: Record<SceneBeatKind, string> = {
    talk: mdChat,
    narration: mdNotes,
    telop: mdTitle,
    stageAction: mdPerson,
    cue: mdBolt,
    varOp: mdNumbers,
};

const TEXTAREA_CLS =
    "w-full rounded-md3-xs border border-outline bg-transparent px-3 py-2 type-body-m text-on-surface " +
    "placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none";

const SCALE_PRESETS = [
    { value: 0.85, labelKey: "page.storyMaker.inspector.scalePresetWide" },
    { value: 1.0, labelKey: "page.storyMaker.inspector.scalePresetStandard" },
    { value: 1.15, labelKey: "page.storyMaker.inspector.scalePresetNear" },
    { value: 1.3, labelKey: "page.storyMaker.inspector.scalePresetCloseup" },
] as const;

export interface NodeInspectorProps {
    doc: StoryDocument;
    selectedNodeId: string | null;
    selectedBeatId: string | null;
    assetSource: AssetSourceType;
    models: readonly Live2DModel[];
    modelInfo: Record<string, Live2DActorInfo>;
    diagnostics: readonly StoryCompileDiagnostic[];
    onDocChange: (updater: (prev: StoryDocument) => StoryDocument) => void;
    onSelectNode: (nodeId: string) => void;
    onSelectBeat: (nodeId: string, beatId: string | null) => void;
    onPreviewClip?: (cast: StoryCastMember, clip: { motion?: string; facial?: string }) => void;
    onPlayFromScene?: (nodeId: string) => void;
    onPreviewEffect?: (cue: { cueType: "flash" | "shake"; color?: StoryEffectColor; duration?: number }) => void;
}

function getNodeLabel(node: StoryNode, t: (key: string) => string): string {
    if (node.type === "start") return t("page.storyMaker.v2.nodeTypes.start");
    return node.title.trim() || t(`page.storyMaker.v2.nodeTypes.${node.type}`);
}

/**
 * Context-sensitive inspector for `moesekai-story/2` graphs: edits `StartNode`, `SceneNode`
 * (5 single-slot stage components + beat quick-add), all 6 `SceneBeat` kinds (with live speaker
 * stage check, co-star reactions, cross-server voice search/trim, and accompanying SE),
 * `ChoiceNode` (options, unlock conditions, var effects), `ConditionNode`, and `EndNode`.
 */
export function NodeInspector({
    doc,
    selectedNodeId,
    selectedBeatId,
    assetSource,
    models,
    modelInfo,
    diagnostics,
    onDocChange,
    onSelectNode,
    onSelectBeat,
    onPreviewClip,
    onPlayFromScene,
    onPreviewEffect,
}: NodeInspectorProps) {
    const { t } = useI18n();
    const line: AssetLine = assetSource.startsWith("backup") ? "backup" : "main";
    const library = useMemo(() => live2dSources(doc.region).library, [doc.region]);

    const selectedNode = selectedNodeId ? doc.nodes[selectedNodeId] ?? null : null;
    const selectedScene = selectedNode?.type === "scene" ? selectedNode : null;
    const selectedBeatIndex = selectedScene && selectedBeatId
        ? selectedScene.beats.findIndex(b => b.id === selectedBeatId)
        : -1;
    const selectedBeat = selectedScene && selectedBeatIndex >= 0
        ? selectedScene.beats[selectedBeatIndex] ?? null
        : null;

    const selectionKey = `${selectedNodeId ?? ""}|${selectedBeat?.id ?? ""}`;

    const [bgPickerOpen, setBgPickerOpen] = useState(false);
    const [assetPicker, setAssetPicker] = useState<{ kind: "bgm" | "se"; target: "sceneBgm" | "beatSe" } | null>(null);
    const [voicePickerOpen, setVoicePickerOpen] = useState(false);
    const [failedBgUrl, setFailedBgUrl] = useState<string | null>(null);
    const [expandedActorKeys, setExpandedActorKeys] = useState<ReadonlySet<string>>(() => new Set());
    const [actorToAdd, setActorToAdd] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState<{ scope: string; key: string } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [trackedScope, setTrackedScope] = useState(selectionKey);

    if (selectionKey !== trackedScope) {
        setTrackedScope(selectionKey);
        setPreviewing(null);
        setPreviewError(null);
        setVoicePickerOpen(false);
        setAssetPicker(null);
        setBgPickerOpen(false);
        setActorToAdd(null);
    }

    useEffect(() => () => previewStorySound(null), [selectionKey]);

    const togglePreview = (
        key: string,
        source: string | readonly string[],
        options?: Pick<PreviewSoundOptions, "volume" | "start" | "end">,
    ) => {
        setPreviewError(null);
        if (previewing?.scope === selectionKey && previewing.key === key) {
            previewStorySound(null);
            setPreviewing(null);
            return;
        }
        const token = { scope: selectionKey, key };
        setPreviewing(token);
        previewStorySound(source, {
            volume: options?.volume,
            start: options?.start,
            end: options?.end,
            onEnd: () => setPreviewing(curr => (curr === token ? null : curr)),
            onError: () => {
                setPreviewing(curr => (curr === token ? null : curr));
                setPreviewError(key);
            },
        });
    };

    const matchingDiagnostics = useMemo(() => {
        if (!selectedNode) return [];
        if (selectedBeat) {
            return diagnostics.filter(d => d.nodeId === selectedNode.id && d.beatId === selectedBeat.id);
        }
        return diagnostics.filter(d => d.nodeId === selectedNode.id);
    }, [diagnostics, selectedNode, selectedBeat]);

    const matchingErrors = useMemo(
        () => matchingDiagnostics.filter(d => d.severity === "error"),
        [matchingDiagnostics],
    );
    const matchingWarnings = useMemo(
        () => matchingDiagnostics.filter(d => d.severity === "warning"),
        [matchingDiagnostics],
    );

    const evaluatedAtSelection = useMemo(() => {
        if (!selectedScene) return null;
        return evaluateStageAt(doc, selectedScene.id, selectedBeat?.id);
    }, [doc, selectedScene, selectedBeat?.id]);

    if (!selectedNode) {
        return (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 py-8 text-center">
                <p className="type-body-m text-on-surface-variant">{t("page.storyMaker.flow.selectNodeHint")}</p>
            </div>
        );
    }

    const castOptions: SelectOption<string>[] = doc.cast.map(member => ({
        value: member.key,
        label: member.name || member.modelId,
        textValue: `${member.name} ${member.modelId}`,
        leading: member.characterId ? (
            <img
                src={getCharacterIconUrl(member.characterId)}
                alt=""
                className="size-6 rounded-full bg-surface-container-highest object-cover"
            />
        ) : undefined,
    }));

    const talkSpeakerOptions: SelectOption<string>[] = [
        { value: "", label: t("page.storyMaker.v2.beats.speakerNone") },
        ...castOptions,
    ];

    const slotOptions = STORY_SLOTS.map(slot => ({
        value: slot,
        label: t(`page.storyMaker.slot.${slot}`),
    }));

    const targetNodeOptions: SelectOption<string>[] = Object.values(doc.nodes)
        .filter(n => n.type !== "start" && n.id !== doc.startNodeId)
        .map(n => ({
            value: n.id,
            label: getNodeLabel(n, t),
            trailing: <span className="font-mono type-label-s text-on-surface-variant">{n.id}</span>,
        }));

    const castMemberOf = (castKey: string | undefined): StoryCastMember | undefined => (
        castKey ? doc.cast.find(item => item.key === castKey) : undefined
    );

    const actorInfoOf = (castKey: string | undefined): Live2DActorInfo | undefined => {
        const member = castMemberOf(castKey);
        return member ? modelInfo[member.modelId] : undefined;
    };

    const motionBundleOf = (castKey: string | undefined): string | null => {
        const member = castMemberOf(castKey);
        if (!member) return null;
        return models.find(item => item.id === member.modelId)?.motions[0] ?? null;
    };

    const renderClipPair = (
        castKey: string | undefined,
        motion: string | undefined,
        facial: string | undefined,
        onMotionChange: (next: string | undefined) => void,
        onFacialChange: (next: string | undefined) => void,
        options?: { disabled?: boolean; helperText?: string; showReplay?: boolean },
    ) => {
        const disabled = options?.disabled ?? false;
        const targetCast = castMemberOf(castKey);
        const canPreview = Boolean(!disabled && onPreviewClip && targetCast);
        return (
            <div className="min-w-0 space-y-2.5">
                {(options?.helperText || (canPreview && targetCast && (options?.showReplay ?? true) && (motion || facial))) && (
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 type-label-s text-on-surface-variant">
                            {options?.helperText ?? t("page.storyMaker.nle.quickPreviewHint")}
                        </span>
                        {canPreview && targetCast && (motion || facial) && (
                            <Button
                                size="xs"
                                variant="tonal"
                                icon={mdPlayArrow}
                                className="shrink-0"
                                onClick={() => onPreviewClip?.(targetCast, {
                                    ...(motion ? { motion } : {}),
                                    ...(facial ? { facial } : {}),
                                })}
                            >
                                {t("page.storyMaker.nle.replayAction")}
                            </Button>
                        )}
                    </div>
                )}
                <ClipPickerField
                    kind="motion"
                    value={motion}
                    info={actorInfoOf(castKey)}
                    library={library}
                    motionBundle={motionBundleOf(castKey)}
                    disabled={disabled}
                    onChange={onMotionChange}
                    onPreviewClip={canPreview && targetCast ? clipName => onPreviewClip?.(targetCast, { motion: clipName }) : undefined}
                />
                <ClipPickerField
                    kind="facial"
                    value={facial}
                    info={actorInfoOf(castKey)}
                    library={library}
                    motionBundle={motionBundleOf(castKey)}
                    disabled={disabled}
                    onChange={onFacialChange}
                    onPreviewClip={canPreview && targetCast ? clipName => onPreviewClip?.(targetCast, { facial: clipName }) : undefined}
                />
            </div>
        );
    };

    const renderDiagnostics = () => {
        if (matchingErrors.length === 0 && matchingWarnings.length === 0) return null;
        return (
            <div className="min-w-0 space-y-2">
                {matchingErrors.length > 0 && (
                    <div className="rounded-md3-md border border-error/35 bg-error-container/50 p-2.5">
                        <StoryIssueList
                            diagnostics={matchingErrors}
                            compact
                            onSelectDiagnostic={(nid, bid) => {
                                if (bid) onSelectBeat(nid, bid);
                                else onSelectNode(nid);
                            }}
                        />
                    </div>
                )}
                {matchingWarnings.length > 0 && (
                    <div className="rounded-md3-md border border-tertiary/35 bg-tertiary-container/50 p-2.5">
                        <StoryIssueList
                            diagnostics={matchingWarnings}
                            compact
                            onSelectDiagnostic={(nid, bid) => {
                                if (bid) onSelectBeat(nid, bid);
                                else onSelectNode(nid);
                            }}
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderSeControls = (
        se: string | undefined,
        seVolume: number | undefined,
        onSeChange: (nextSe: string | undefined, nextVol?: number) => void,
        required: boolean,
    ) => {
        const seCandidates = se ? storySeCandidateUrls(se, doc.region, line) : [];
        const seKey = se ? `se:${doc.region}:${line}:${se}` : "";
        const playingSe = Boolean(seKey) && previewing?.scope === selectionKey && previewing.key === seKey;
        const effectiveVol = seVolume ?? 1;
        return (
            <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <TextField
                        label={t("page.storyMaker.inspector.seName")}
                        value={se ?? ""}
                        maxLength={STORY_LIMITS.audioPath}
                        placeholder={DEFAULT_STORY_SE}
                        onChange={event => {
                            const val = event.target.value.trim();
                            onSeChange(val || undefined, val ? effectiveVol : undefined);
                        }}
                        className="min-w-[8rem] flex-1 font-mono"
                    />
                    <div className="mt-1 flex shrink-0 items-center gap-1">
                        <Button
                            size="s"
                            variant="tonal"
                            icon={mdVolumeUp}
                            onClick={() => setAssetPicker({ kind: "se", target: "beatSe" })}
                        >
                            {t("page.storyMaker.inspector.browse")}
                        </Button>
                        <IconButton
                            size="s"
                            icon={playingSe ? mdStopFill : mdPlayArrowFill}
                            label={t(playingSe ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                            disabled={seCandidates.length === 0}
                            onClick={() => seCandidates.length > 0 && togglePreview(seKey, seCandidates, { volume: effectiveVol })}
                        />
                        {!required && se && (
                            <IconButton
                                size="s"
                                icon={mdClose}
                                label={t("common.action.reset")}
                                onClick={() => onSeChange(undefined, undefined)}
                            />
                        )}
                    </div>
                </div>
                {previewError === seKey && seKey && (
                    <p role="alert" className="type-label-s text-error">
                        {t("page.storyMaker.inspector.audioPreviewFailed")}
                    </p>
                )}
                {se && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="type-label-m text-on-surface-variant">{t("page.storyMaker.inspector.volume")}</span>
                            <span className="font-mono type-label-m text-on-surface">{Math.round(effectiveVol * 100)}%</span>
                        </div>
                        <Slider
                            min={0}
                            max={1}
                            step={0.05}
                            value={effectiveVol}
                            onValueChange={val => onSeChange(se, Number(val.toFixed(2)))}
                            aria-label={t("page.storyMaker.inspector.volume")}
                            formatValue={val => `${Math.round(val * 100)}%`}
                        />
                    </div>
                )}
            </div>
        );
    };

    const updateSelectedBeat = (nextBeat: SceneBeat) => {
        if (!selectedScene) return;
        onDocChange(prev => replaceBeat(prev, selectedScene.id, nextBeat.id, nextBeat));
    };

    const handleAddBeat = (kind: SceneBeatKind) => {
        if (!selectedScene) return;
        const created = createSceneBeat(kind, doc);
        onDocChange(prev => insertBeat(prev, selectedScene.id, created));
        onSelectBeat(selectedScene.id, created.id);
    };

    const handleDeleteSelectedBeat = () => {
        if (!selectedScene || !selectedBeat) return;
        const nextBeat = selectedScene.beats[selectedBeatIndex + 1]
            ?? selectedScene.beats[selectedBeatIndex - 1]
            ?? null;
        onDocChange(prev => removeBeat(prev, selectedScene.id, selectedBeat.id));
        onSelectBeat(selectedScene.id, nextBeat?.id ?? null);
    };

    const handleDuplicateSelectedBeat = () => {
        if (!selectedScene || !selectedBeat) return;
        const res = duplicateBeat(doc, selectedScene.id, selectedBeat.id);
        if (!res.beat) return;
        const duplicated = res.beat;
        onDocChange(prev => insertBeat(prev, selectedScene.id, duplicated, selectedBeatIndex + 1));
        onSelectBeat(selectedScene.id, duplicated.id);
    };

    const handleAddSpeakerToStage = (scene: SceneNode, speakerKey: string) => {
        onDocChange((prev) => {
            const currentNode = prev.nodes[scene.id];
            if (!currentNode || currentNode.type !== "scene") return prev;
            if (currentNode.stageCast.mode === "inherit") {
                const inherited = evaluateStageAt(prev, scene.id).stage.actors;
                const actors: SceneActorSlot[] = inherited.slice(0, STORY_LIMITS.stageActors).map(actor => ({
                    castKey: actor.cast,
                    slot: actor.slot,
                    ...(actor.scale !== 1 ? { scale: actor.scale } : {}),
                    ...(actor.y !== 0 ? { y: actor.y } : {}),
                    ...(actor.motion ? { motion: actor.motion } : {}),
                    ...(actor.facial ? { facial: actor.facial } : {}),
                }));
                const withSeed = setSceneStageCast(prev, scene.id, { mode: "set", actors });
                return addCastKeyToScene(withSeed, scene.id, speakerKey);
            }
            return addCastKeyToScene(prev, scene.id, speakerKey);
        });
    };

    return (
        <div className="min-w-0 space-y-4">
            {/* ==================== SCENE BEAT INSPECTOR ==================== */}
            {selectedScene && selectedBeat ? (
                <>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <Button
                            size="xs"
                            variant="tonal"
                            icon={mdArrowBack}
                            onClick={() => onSelectBeat(selectedScene.id, null)}
                            className="min-w-0"
                        >
                            <span className="truncate">
                                {getNodeLabel(selectedScene, t)} · {t("page.storyMaker.v2.slots.sectionTitle")}
                            </span>
                        </Button>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <IconButton
                                size="xs"
                                icon={mdContentCopy}
                                label={t("page.storyMaker.editor.duplicateStep")}
                                onClick={handleDuplicateSelectedBeat}
                            />
                            <IconButton
                                size="xs"
                                icon={mdDelete}
                                label={t("page.storyMaker.editor.deleteStep")}
                                onClick={handleDeleteSelectedBeat}
                            />
                        </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-secondary-container text-on-secondary-container">
                            <Icon path={BEAT_ICONS[selectedBeat.kind]} size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate type-title-s text-on-surface">
                                {t(`page.storyMaker.v2.beats.${selectedBeat.kind}`)}
                            </p>
                            <p className="truncate font-mono type-label-s text-on-surface-variant">
                                #{selectedBeatIndex + 1} / {selectedScene.beats.length} · {selectedBeat.id}
                            </p>
                        </div>
                    </div>

                    {renderDiagnostics()}
                    <Divider />

                    {selectedBeat.kind === "talk" && (() => {
                        const beat: TalkBeat = selectedBeat;
                        const speakerCast = castMemberOf(beat.speakerKey);
                        const isSpeakerInSceneSet = selectedScene.stageCast.mode === "set"
                            && Boolean(beat.speakerKey)
                            && selectedScene.stageCast.actors.some(a => a.castKey === beat.speakerKey);
                        const isSpeakerOnEffectiveStage = Boolean(
                            beat.speakerKey
                            && evaluatedAtSelection?.stage.actors.some(a => a.cast === beat.speakerKey),
                        );
                        const speakerNotOnStage = Boolean(
                            beat.speakerKey
                            && speakerCast
                            && (
                                (selectedScene.stageCast.mode === "set" && !isSpeakerInSceneSet)
                                || (selectedScene.stageCast.mode !== "set" && !isSpeakerOnEffectiveStage)
                            ),
                        );
                        const stageFull = selectedScene.stageCast.mode === "set"
                            && selectedScene.stageCast.actors.length >= STORY_LIMITS.stageActors;
                        const reactions = beat.reactions ?? [];

                        const patchTalk = (partial: Partial<TalkBeat>) => updateSelectedBeat({ ...beat, ...partial });

                        return (
                            <div className="min-w-0 space-y-4">
                                <Select<string>
                                    label={t("page.storyMaker.v2.beats.speaker")}
                                    value={beat.speakerKey ?? ""}
                                    onValueChange={(value) => {
                                        const next: TalkBeat = { ...beat };
                                        if (value) next.speakerKey = value;
                                        else delete next.speakerKey;
                                        updateSelectedBeat(next);
                                    }}
                                    options={talkSpeakerOptions}
                                />

                                {speakerNotOnStage && beat.speakerKey && (
                                    <div className="space-y-2 rounded-md3-md border border-tertiary/40 bg-tertiary-container/60 p-3 text-on-tertiary-container">
                                        <div className="flex items-start gap-2">
                                            <Icon path={mdWarningFill} size={18} className="mt-0.5 shrink-0 text-tertiary" />
                                            <p className="min-w-0 flex-1 break-words type-body-s">
                                                {t("page.storyMaker.v2.beats.speakerNotOnStage")}
                                            </p>
                                        </div>
                                        <Button
                                            size="xs"
                                            variant="filled"
                                            icon={mdAdd}
                                            disabled={stageFull}
                                            onClick={() => handleAddSpeakerToStage(selectedScene, beat.speakerKey!)}
                                        >
                                            {t("page.storyMaker.v2.beats.addSpeakerToStage")}
                                        </Button>
                                    </div>
                                )}

                                <TextField
                                    label={t("page.storyMaker.inspector.speakerName")}
                                    value={beat.speakerName ?? ""}
                                    maxLength={STORY_LIMITS.speakerName}
                                    placeholder={speakerCast?.name ?? t("page.storyMaker.inspector.speakerNamePlaceholder")}
                                    supportingText={beat.speakerKey ? t("page.storyMaker.inspector.speakerOverrideHint") : undefined}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        const next: TalkBeat = { ...beat };
                                        if (value) next.speakerName = value;
                                        else delete next.speakerName;
                                        updateSelectedBeat(next);
                                    }}
                                />

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label htmlFor={`beat-talk-${beat.id}`} className="type-label-l text-on-surface-variant">
                                            {t("page.storyMaker.inspector.body")}
                                        </label>
                                        <span className="font-mono type-label-s text-on-surface-variant">
                                            {beat.body.length}/{STORY_LIMITS.body}
                                        </span>
                                    </div>
                                    <textarea
                                        id={`beat-talk-${beat.id}`}
                                        rows={4}
                                        maxLength={STORY_LIMITS.body}
                                        value={beat.body}
                                        placeholder={t("page.storyMaker.inspector.bodyPlaceholder")}
                                        onChange={event => patchTalk({ body: event.target.value })}
                                        className={TEXTAREA_CLS}
                                    />
                                    <VariableInsertRow
                                        variables={doc.variables}
                                        onInsert={token => patchTalk({ body: `${beat.body}${token}`.slice(0, STORY_LIMITS.body) })}
                                    />
                                </div>

                                {beat.speakerKey && (
                                    <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                        <p className="type-label-l text-on-surface">
                                            {t("page.storyMaker.v2.beats.speakerPerformance")}
                                        </p>
                                        {renderClipPair(
                                            beat.speakerKey,
                                            beat.motion,
                                            beat.facial,
                                            (motion) => {
                                                const next: TalkBeat = { ...beat };
                                                if (motion) next.motion = motion;
                                                else delete next.motion;
                                                updateSelectedBeat(next);
                                            },
                                            (facial) => {
                                                const next: TalkBeat = { ...beat };
                                                if (facial) next.facial = facial;
                                                else delete next.facial;
                                                updateSelectedBeat(next);
                                            },
                                            { helperText: t("page.storyMaker.v2.beats.keepCurrentPose") },
                                        )}
                                    </div>
                                )}

                                {/* Co-Star Synchronized Reactions */}
                                <div className="space-y-2.5 rounded-md3-md border border-outline-variant/60 bg-surface-container-low p-3">
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                        <span className="min-w-0 truncate type-label-l text-on-surface">
                                            {t("page.storyMaker.v2.beats.reactionsTitle")}
                                        </span>
                                        <span className="shrink-0 font-mono type-label-s text-on-surface-variant">
                                            {reactions.length}/{STORY_LIMITS.reactionsPerTalk}
                                        </span>
                                    </div>
                                    {reactions.length === 0 ? (
                                        <p className="type-body-s text-on-surface-variant">
                                            {t("page.storyMaker.v2.beats.noReactions")}
                                        </p>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {reactions.map((reaction, rIdx) => {
                                                const updateReaction = (patch: Partial<ActorReaction>) => {
                                                    const nextList = reactions.map((item, idx) => (
                                                        idx === rIdx ? { ...item, ...patch } : item
                                                    ));
                                                    patchTalk({ reactions: nextList });
                                                };
                                                const removeReaction = () => {
                                                    const nextList = reactions.filter((_, idx) => idx !== rIdx);
                                                    const next: TalkBeat = { ...beat };
                                                    if (nextList.length > 0) next.reactions = nextList;
                                                    else delete next.reactions;
                                                    updateSelectedBeat(next);
                                                };
                                                return (
                                                    <div key={`${reaction.castKey}-${rIdx}`} className="space-y-2.5 rounded-md3-sm bg-surface-container p-2.5">
                                                        <div className="flex items-start gap-1.5">
                                                            <div className="min-w-0 flex-1">
                                                                <Select<string>
                                                                    label={t("page.storyMaker.v2.beats.reactionActor")}
                                                                    value={reaction.castKey || null}
                                                                    onValueChange={castKey => updateReaction({ castKey })}
                                                                    options={castOptions}
                                                                    placeholder={t("page.storyMaker.inspector.selectCast")}
                                                                    noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                                                                />
                                                            </div>
                                                            <IconButton
                                                                size="xs"
                                                                icon={mdDelete}
                                                                label={t("page.storyMaker.cast.remove")}
                                                                onClick={removeReaction}
                                                                className="mt-1 shrink-0"
                                                            />
                                                        </div>
                                                        {renderClipPair(
                                                            reaction.castKey,
                                                            reaction.motion,
                                                            reaction.facial,
                                                            motion => updateReaction({ motion }),
                                                            facial => updateReaction({ facial }),
                                                            { disabled: !reaction.castKey },
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <Button
                                        size="xs"
                                        variant="tonal"
                                        icon={mdAdd}
                                        disabled={reactions.length >= STORY_LIMITS.reactionsPerTalk || doc.cast.length === 0}
                                        onClick={() => {
                                            const used = new Set([beat.speakerKey, ...reactions.map(r => r.castKey)].filter(Boolean));
                                            const pick = doc.cast.find(c => !used.has(c.key)) ?? doc.cast[0];
                                            if (!pick) return;
                                            patchTalk({ reactions: [...reactions, { castKey: pick.key }] });
                                        }}
                                    >
                                        {t("page.storyMaker.v2.beats.addReaction")}
                                    </Button>
                                </div>

                                <Divider />

                                {/* Voice Reference + Story Search + Trim Waveform */}
                                <div className="space-y-3">
                                    <div className="flex min-w-0 items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <Switch
                                                checked={Boolean(beat.voice)}
                                                onCheckedChange={(enabled) => {
                                                    const next: TalkBeat = { ...beat };
                                                    if (enabled) next.voice = { kind: "story", scenarioId: "", voiceId: "" };
                                                    else delete next.voice;
                                                    updateSelectedBeat(next);
                                                }}
                                                label={t("page.storyMaker.inspector.voiceRef")}
                                                description={t("page.storyMaker.inspector.voiceRefHint")}
                                            />
                                        </div>
                                        {beat.voice?.region && beat.voice.region !== doc.region && (
                                            <span className="mt-0.5 shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 font-mono type-label-s text-on-tertiary-container">
                                                {getServerDisplayCode(beat.voice.region)}
                                            </span>
                                        )}
                                    </div>
                                    {beat.voice && (() => {
                                        const voice = beat.voice;
                                        const placeholders = VOICE_PLACEHOLDERS[voice.kind];
                                        const voiceCandidates = voice.scenarioId && voice.voiceId
                                            ? storyVoiceCandidateUrls(voice, doc.region, line)
                                            : [];
                                        const voiceKey = voiceCandidates.length > 0
                                            ? `voice:${voice.region ?? ""}:${voice.kind}:${voice.scenarioId}:${voice.voiceId}`
                                            : "";
                                        const playingVoice = Boolean(voiceKey) && previewing?.scope === selectionKey && previewing.key === voiceKey;
                                        const updateVoiceClip = (partial: Partial<Pick<StoryVoiceRef, "kind" | "scenarioId" | "voiceId">>) => {
                                            const nextVoice: StoryVoiceRef = {
                                                kind: partial.kind ?? voice.kind,
                                                scenarioId: partial.scenarioId ?? voice.scenarioId,
                                                voiceId: partial.voiceId ?? voice.voiceId,
                                            };
                                            if (voice.region && voice.region !== doc.region) {
                                                nextVoice.region = voice.region;
                                            }
                                            const sameClip =
                                                nextVoice.kind === voice.kind
                                                && nextVoice.scenarioId === voice.scenarioId
                                                && nextVoice.voiceId === voice.voiceId;
                                            if (sameClip) {
                                                if (voice.start !== undefined) nextVoice.start = voice.start;
                                                if (voice.end !== undefined) nextVoice.end = voice.end;
                                            }
                                            patchTalk({ voice: nextVoice });
                                        };
                                        return (
                                            <div className="min-w-0 space-y-3 rounded-md3-md bg-surface-container p-3">
                                                <SegmentedButton<StoryVoiceKind>
                                                    density={-2}
                                                    value={voice.kind}
                                                    onValueChange={kind => updateVoiceClip({ kind })}
                                                    options={VOICE_KINDS.map(kind => ({
                                                        value: kind,
                                                        label: t(`page.storyMaker.voiceKind.${kind}`),
                                                    }))}
                                                    aria-label={t("page.storyMaker.inspector.voiceKind")}
                                                    className="[&>button]:px-1.5"
                                                />
                                                <TextField
                                                    label={t("page.storyMaker.inspector.scenarioId")}
                                                    value={voice.scenarioId}
                                                    maxLength={64}
                                                    placeholder={placeholders.scenarioId}
                                                    className="font-mono"
                                                    onChange={event => updateVoiceClip({ scenarioId: event.target.value.trim() })}
                                                />
                                                <TextField
                                                    label={t("page.storyMaker.inspector.voiceId")}
                                                    value={voice.voiceId}
                                                    maxLength={64}
                                                    placeholder={placeholders.voiceId}
                                                    className="font-mono"
                                                    onChange={event => updateVoiceClip({ voiceId: event.target.value.trim() })}
                                                />
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <Button
                                                        size="xs"
                                                        variant="tonal"
                                                        icon={mdRecordVoiceOver}
                                                        onClick={() => setVoicePickerOpen(true)}
                                                    >
                                                        {t("page.storyMaker.inspector.browse")}
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        variant="tonal"
                                                        icon={playingVoice ? mdStopFill : mdPlayArrowFill}
                                                        disabled={voiceCandidates.length === 0}
                                                        onClick={() => voiceCandidates.length > 0 && togglePreview(voiceKey, voiceCandidates, {
                                                            start: voice.start,
                                                            end: voice.end,
                                                        })}
                                                    >
                                                        {t(playingVoice ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                                    </Button>
                                                </div>
                                                {previewError === voiceKey && voiceKey && (
                                                    <p role="alert" className="type-label-s text-error">
                                                        {t("page.storyMaker.inspector.audioPreviewFailed")}
                                                    </p>
                                                )}
                                                {voiceCandidates.length > 0 && (
                                                    <VoiceTrimControl
                                                        urls={voiceCandidates}
                                                        start={voice.start}
                                                        end={voice.end}
                                                        onChange={(nextTrim) => {
                                                            const nextVoice: StoryVoiceRef = {
                                                                kind: voice.kind,
                                                                scenarioId: voice.scenarioId,
                                                                voiceId: voice.voiceId,
                                                            };
                                                            if (voice.region && voice.region !== doc.region) {
                                                                nextVoice.region = voice.region;
                                                            }
                                                            if (nextTrim.start !== undefined) nextVoice.start = nextTrim.start;
                                                            if (nextTrim.end !== undefined) nextVoice.end = nextTrim.end;
                                                            patchTalk({ voice: nextVoice });
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <Divider />

                                {/* Accompanying SE */}
                                <div className="space-y-2">
                                    <p className="type-label-l text-on-surface-variant">
                                        {t("page.storyMaker.v2.beats.accompanyingSe")}
                                    </p>
                                    {renderSeControls(
                                        beat.se,
                                        beat.seVolume,
                                        (nextSe, nextVol) => {
                                            const next: TalkBeat = { ...beat };
                                            if (nextSe) next.se = nextSe;
                                            else delete next.se;
                                            if (nextSe && nextVol !== undefined) next.seVolume = nextVol;
                                            else delete next.seVolume;
                                            updateSelectedBeat(next);
                                        },
                                        false,
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {selectedBeat.kind === "narration" && (() => {
                        const beat: NarrationBeat = selectedBeat;
                        return (
                            <div className="min-w-0 space-y-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label htmlFor={`beat-narration-${beat.id}`} className="type-label-l text-on-surface-variant">
                                            {t("page.storyMaker.inspector.narrationText")}
                                        </label>
                                        <span className="font-mono type-label-s text-on-surface-variant">
                                            {beat.body.length}/{STORY_LIMITS.body}
                                        </span>
                                    </div>
                                    <textarea
                                        id={`beat-narration-${beat.id}`}
                                        rows={5}
                                        maxLength={STORY_LIMITS.body}
                                        value={beat.body}
                                        placeholder={t("page.storyMaker.inspector.narrationPlaceholder")}
                                        onChange={event => updateSelectedBeat({ ...beat, body: event.target.value })}
                                        className={TEXTAREA_CLS}
                                    />
                                    <VariableInsertRow
                                        variables={doc.variables}
                                        onInsert={token => updateSelectedBeat({ ...beat, body: `${beat.body}${token}`.slice(0, STORY_LIMITS.body) })}
                                    />
                                </div>
                                <Divider />
                                <div className="space-y-2">
                                    <p className="type-label-l text-on-surface-variant">
                                        {t("page.storyMaker.v2.beats.accompanyingSe")}
                                    </p>
                                    {renderSeControls(
                                        beat.se,
                                        beat.seVolume,
                                        (nextSe, nextVol) => {
                                            const next: NarrationBeat = { ...beat };
                                            if (nextSe) next.se = nextSe;
                                            else delete next.se;
                                            if (nextSe && nextVol !== undefined) next.seVolume = nextVol;
                                            else delete next.seVolume;
                                            updateSelectedBeat(next);
                                        },
                                        false,
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {selectedBeat.kind === "telop" && (() => {
                        const beat: TelopBeat = selectedBeat;
                        return (
                            <div className="min-w-0 space-y-3">
                                <TextField
                                    label={t("page.storyMaker.inspector.telopText")}
                                    value={beat.text}
                                    maxLength={STORY_LIMITS.telop}
                                    placeholder={t("page.storyMaker.inspector.telopPlaceholder")}
                                    supportingText={`${beat.text.length}/${STORY_LIMITS.telop} · ${t("page.storyMaker.inspector.telopHint")}`}
                                    onChange={event => updateSelectedBeat({ ...beat, text: event.target.value })}
                                />
                                <VariableInsertRow
                                    variables={doc.variables}
                                    onInsert={token => updateSelectedBeat({ ...beat, text: `${beat.text}${token}`.slice(0, STORY_LIMITS.telop) })}
                                />
                            </div>
                        );
                    })()}

                    {selectedBeat.kind === "stageAction" && (() => {
                        const beat: StageActionBeat = selectedBeat;
                        const actionLabelKey = (action: StageActionKind) => {
                            if (action === "enter") return "page.storyMaker.v2.beats.stageActionEnter";
                            if (action === "move") return "page.storyMaker.v2.beats.stageActionMove";
                            if (action === "pose") return "page.storyMaker.v2.beats.stageActionPose";
                            return "page.storyMaker.v2.beats.stageActionExit";
                        };
                        const needsSlot = beat.action === "enter" || beat.action === "move";
                        const supportsClips = beat.action !== "exit";
                        return (
                            <div className="min-w-0 space-y-4">
                                <Select<StageActionKind>
                                    label={t("page.storyMaker.v2.beats.stageAction")}
                                    value={beat.action}
                                    onValueChange={(action) => {
                                        const next: StageActionBeat = {
                                            id: beat.id,
                                            kind: "stageAction",
                                            action,
                                            castKey: beat.castKey,
                                        };
                                        if (action === "enter" || action === "move") {
                                            next.slot = beat.slot ?? "center";
                                            if (beat.scale !== undefined) next.scale = beat.scale;
                                            if (beat.y !== undefined) next.y = beat.y;
                                        }
                                        if (action === "move") {
                                            next.duration = beat.duration ?? 0.5;
                                        }
                                        if (action !== "exit") {
                                            if (beat.motion) next.motion = beat.motion;
                                            if (beat.facial) next.facial = beat.facial;
                                        }
                                        updateSelectedBeat(next);
                                    }}
                                    options={STAGE_ACTION_KINDS.map(action => ({
                                        value: action,
                                        label: t(actionLabelKey(action)),
                                    }))}
                                />

                                <Select<string>
                                    label={t("page.storyMaker.inspector.castMember")}
                                    value={beat.castKey || null}
                                    onValueChange={castKey => updateSelectedBeat({ ...beat, castKey })}
                                    options={castOptions}
                                    placeholder={t("page.storyMaker.inspector.selectCast")}
                                    noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                                />

                                {needsSlot && (
                                    <>
                                        <div className="space-y-1.5">
                                            <span className="block type-label-l text-on-surface-variant">
                                                {t("page.storyMaker.inspector.slot")}
                                            </span>
                                            <SegmentedButton<StorySlot>
                                                density={-1}
                                                value={beat.slot ?? "center"}
                                                onValueChange={slot => updateSelectedBeat({ ...beat, slot })}
                                                options={slotOptions}
                                                aria-label={t("page.storyMaker.inspector.slot")}
                                                className="[&>button]:px-1.5 sm:[&>button]:px-2.5"
                                            />
                                        </div>

                                        {beat.action === "move" && (
                                            <DurationSlider
                                                label={t("page.storyMaker.inspector.duration")}
                                                value={beat.duration ?? 0.5}
                                                onChange={duration => updateSelectedBeat({ ...beat, duration })}
                                            />
                                        )}

                                        <ActorFramingControls
                                            mode={beat.action === "move" ? "move" : "enter"}
                                            scale={beat.scale}
                                            y={beat.y}
                                            onScaleChange={(scale) => {
                                                const next: StageActionBeat = { ...beat };
                                                if (scale === undefined) delete next.scale;
                                                else next.scale = scale;
                                                updateSelectedBeat(next);
                                            }}
                                            onYChange={(y) => {
                                                const next: StageActionBeat = { ...beat };
                                                if (y === undefined) delete next.y;
                                                else next.y = y;
                                                updateSelectedBeat(next);
                                            }}
                                            onReset={() => {
                                                const next: StageActionBeat = { ...beat };
                                                delete next.scale;
                                                delete next.y;
                                                updateSelectedBeat(next);
                                            }}
                                        />
                                    </>
                                )}

                                {supportsClips && renderClipPair(
                                    beat.castKey,
                                    beat.motion,
                                    beat.facial,
                                    (motion) => {
                                        const next: StageActionBeat = { ...beat };
                                        if (motion) next.motion = motion;
                                        else delete next.motion;
                                        updateSelectedBeat(next);
                                    },
                                    (facial) => {
                                        const next: StageActionBeat = { ...beat };
                                        if (facial) next.facial = facial;
                                        else delete next.facial;
                                        updateSelectedBeat(next);
                                    },
                                    { disabled: !beat.castKey },
                                )}
                            </div>
                        );
                    })()}

                    {selectedBeat.kind === "cue" && (() => {
                        const beat: CueBeat = selectedBeat;
                        const cueLabelKey = (cueType: CueType) => {
                            if (cueType === "se") return "page.storyMaker.v2.beats.cueSe";
                            if (cueType === "flash") return "page.storyMaker.v2.beats.cueFlash";
                            if (cueType === "shake") return "page.storyMaker.v2.beats.cueShake";
                            return "page.storyMaker.v2.beats.cueWait";
                        };
                        return (
                            <div className="min-w-0 space-y-4">
                                <Select<CueType>
                                    label={t("page.storyMaker.v2.beats.cue")}
                                    value={beat.cueType}
                                    onValueChange={(cueType) => {
                                        if (cueType === "se") {
                                            updateSelectedBeat({
                                                id: beat.id,
                                                kind: "cue",
                                                cueType: "se",
                                                se: beat.se || DEFAULT_STORY_SE,
                                                seVolume: beat.seVolume ?? 1,
                                            });
                                        } else if (cueType === "flash") {
                                            updateSelectedBeat({
                                                id: beat.id,
                                                kind: "cue",
                                                cueType: "flash",
                                                color: beat.color ?? "white",
                                                duration: beat.duration ?? 0.4,
                                            });
                                        } else {
                                            updateSelectedBeat({
                                                id: beat.id,
                                                kind: "cue",
                                                cueType,
                                                duration: beat.duration ?? (cueType === "wait" ? 0.8 : 0.4),
                                            });
                                        }
                                    }}
                                    options={CUE_TYPES.map(cueType => ({
                                        value: cueType,
                                        label: t(cueLabelKey(cueType)),
                                    }))}
                                />

                                {beat.cueType === "se" && renderSeControls(
                                    beat.se,
                                    beat.seVolume,
                                    (nextSe, nextVol) => {
                                        updateSelectedBeat({
                                            ...beat,
                                            se: nextSe ?? "",
                                            ...(nextVol !== undefined ? { seVolume: nextVol } : {}),
                                        });
                                    },
                                    true,
                                )}

                                {beat.cueType === "flash" && (
                                    <div className="space-y-1.5">
                                        <span className="block type-label-l text-on-surface-variant">
                                            {t("page.storyMaker.inspector.effectColor")}
                                        </span>
                                        <SegmentedButton<StoryEffectColor>
                                            density={-1}
                                            value={beat.color ?? "white"}
                                            onValueChange={color => updateSelectedBeat({ ...beat, color })}
                                            options={EFFECT_COLORS.map(color => ({
                                                value: color,
                                                label: t(`page.storyMaker.color.${color}`),
                                            }))}
                                            aria-label={t("page.storyMaker.inspector.effectColor")}
                                        />
                                    </div>
                                )}

                                {beat.cueType !== "se" && (
                                    <DurationSlider
                                        label={t("page.storyMaker.inspector.duration")}
                                        value={beat.duration ?? 0.4}
                                        onChange={duration => updateSelectedBeat({ ...beat, duration })}
                                    />
                                )}

                                {onPreviewEffect && (beat.cueType === "flash" || beat.cueType === "shake") && (
                                    <Button
                                        size="s"
                                        variant="tonal"
                                        icon={mdPlayArrowFill}
                                        onClick={() => onPreviewEffect({
                                            cueType: beat.cueType === "flash" ? "flash" : "shake",
                                            color: beat.color,
                                            duration: beat.duration,
                                        })}
                                    >
                                        {t("page.storyMaker.inspector.previewEffect")}
                                    </Button>
                                )}
                            </div>
                        );
                    })()}

                    {selectedBeat.kind === "varOp" && (() => {
                        const beat: VarOpBeat = selectedBeat;
                        return (
                            <div className="min-w-0 space-y-3">
                                <VarOpListEditor
                                    variables={doc.variables}
                                    ops={beat.ops}
                                    addLabel={t("page.storyMaker.v2.variables.addEffect")}
                                    onChange={ops => updateSelectedBeat({ ...beat, ops })}
                                />
                            </div>
                        );
                    })()}
                </>
            ) : selectedNode.type === "start" ? (
                /* ==================== START NODE INSPECTOR ==================== */
                <>
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-primary text-on-primary">
                            <Icon path={mdPlayCircle} size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className="truncate type-title-s text-on-surface">
                                    {t("page.storyMaker.v2.nodeTypes.start")}
                                </p>
                                <span className="shrink-0 rounded-md3-full bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                    {t("page.storyMaker.v2.ports.outOnly")}
                                </span>
                            </div>
                            <p className="truncate font-mono type-label-s text-on-surface-variant">{selectedNode.id}</p>
                        </div>
                    </div>

                    {renderDiagnostics()}
                    <Divider />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="type-label-l text-on-surface-variant">
                                {t("page.storyMaker.v2.ports.outPort")}
                            </span>
                            <WireTargetChip
                                doc={doc}
                                fromNodeId={selectedNode.id}
                                fromPortId="out"
                                onSelectNode={onSelectNode}
                                onDisconnect={() => onDocChange(prev => disconnectPort(prev, selectedNode.id, "out"))}
                            />
                        </div>

                        {(() => {
                            const outEdge = getOutgoingEdge(doc, selectedNode.id, "out");
                            return (
                                <>
                                    {!outEdge && (
                                        <Banner tone="warning">
                                            {t("page.storyMaker.v2.ports.unconnected")} · {t("page.storyMaker.v2.ports.dragToWire")}
                                        </Banner>
                                    )}
                                    {targetNodeOptions.length > 0 && (
                                        <Select<string>
                                            label={t("page.storyMaker.v2.ports.outPort")}
                                            value={outEdge?.toNodeId ?? null}
                                            onValueChange={targetId => onDocChange(prev => connectEdge(prev, selectedNode.id, "out", targetId))}
                                            options={targetNodeOptions}
                                            placeholder={t("page.storyMaker.v2.ports.unconnected")}
                                        />
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </>
            ) : selectedNode.type === "scene" ? (
                /* ==================== SCENE NODE & STAGE SLOTS INSPECTOR ==================== */
                (() => {
                    const scene: SceneNode = selectedNode;
                    const bgAsset = scene.background.mode === "set" ? scene.background.asset : null;
                    const bgPreviewUrl = bgAsset ? storyBackgroundUrl(bgAsset, doc.region, line) : null;
                    const bgFailed = Boolean(bgPreviewUrl) && failedBgUrl === bgPreviewUrl;

                    const bgmName = scene.bgm.mode === "play" ? scene.bgm.name : "";
                    const bgmVol = scene.bgm.mode === "play" ? scene.bgm.volume : 0.75;
                    const bgmUrl = bgmName ? storyBgmUrl(bgmName, doc.region, line) : "";
                    const bgmKey = bgmUrl ? `bgm:${bgmUrl}` : "";
                    const playingBgm = Boolean(bgmKey) && previewing?.scope === selectionKey && previewing.key === bgmKey;

                    const sceneActors = scene.stageCast.mode === "set" ? scene.stageCast.actors : [];
                    const mountedKeys = new Set(sceneActors.map(a => a.castKey));
                    const availableCast = doc.cast.filter(member => !mountedKeys.has(member.key));
                    const availableCastOptions: SelectOption<string>[] = availableCast.map(member => ({
                        value: member.key,
                        label: member.name || member.modelId,
                        leading: member.characterId ? (
                            <img
                                src={getCharacterIconUrl(member.characterId)}
                                alt=""
                                className="size-6 rounded-full bg-surface-container-highest object-cover"
                            />
                        ) : undefined,
                    }));

                    const toggleActorExpanded = (castKey: string) => {
                        setExpandedActorKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(castKey)) next.delete(castKey);
                            else next.add(castKey);
                            return next;
                        });
                    };

                    return (
                        <>
                            <div className="flex min-w-0 items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-primary-container text-on-primary-container">
                                        <Icon path={mdMovie} size={18} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate type-title-s text-on-surface">
                                            {t("page.storyMaker.v2.nodeTypes.scene")}
                                        </p>
                                        <p className="truncate font-mono type-label-s text-on-surface-variant">{scene.id}</p>
                                    </div>
                                </div>
                                {onPlayFromScene && (
                                    <Button
                                        size="xs"
                                        variant="tonal"
                                        icon={mdPlayCircle}
                                        className="shrink-0"
                                        onClick={() => onPlayFromScene(scene.id)}
                                    >
                                        {t("page.storyMaker.v2.ending.playFromScene")}
                                    </Button>
                                )}
                            </div>

                            {renderDiagnostics()}

                            <TextField
                                label={t("page.storyMaker.v2.nodeTypes.scene")}
                                value={scene.title}
                                maxLength={STORY_LIMITS.nodeTitle}
                                placeholder={t("page.storyMaker.v2.nodeTypes.scene")}
                                onChange={event => onDocChange(prev => updateNode<SceneNode>(prev, scene.id, s => ({
                                    ...s,
                                    title: event.target.value,
                                })))}
                            />

                            <div className="flex min-w-0 items-center justify-between gap-2 rounded-md3-md bg-surface-container px-3 py-2">
                                <span className="type-label-m text-on-surface-variant">
                                    {t("page.storyMaker.v2.ports.outPort")}
                                </span>
                                <WireTargetChip
                                    doc={doc}
                                    fromNodeId={scene.id}
                                    fromPortId="out"
                                    onSelectNode={onSelectNode}
                                    onDisconnect={() => onDocChange(prev => disconnectPort(prev, scene.id, "out"))}
                                />
                            </div>

                            <Divider />

                            {/* Stage Configuration Slots */}
                            <div className="space-y-3">
                                <div className="space-y-0.5">
                                    <p className="type-title-s text-on-surface">
                                        {t("page.storyMaker.v2.slots.sectionTitle")}
                                    </p>
                                    <p className="type-body-s text-on-surface-variant">
                                        {t("page.storyMaker.v2.slots.newSceneToChangeHint")}
                                    </p>
                                </div>

                                {/* 1. Background Slot */}
                                <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                    <span className="flex items-center gap-1.5 type-label-l text-on-surface">
                                        <Icon path={mdImage} size={16} className="text-primary" />
                                        <span>{t("page.storyMaker.v2.slots.background")}</span>
                                    </span>
                                    <SegmentedButton<BackgroundSlot["mode"]>
                                        density={-2}
                                        value={scene.background.mode}
                                        onValueChange={(mode) => {
                                            const slot: BackgroundSlot = mode === "set"
                                                ? { mode: "set", asset: bgAsset || DEFAULT_STORY_BACKGROUND }
                                                : { mode };
                                            onDocChange(prev => setSceneBackground(prev, scene.id, slot));
                                        }}
                                        options={[
                                            { value: "set", label: t("page.storyMaker.v2.slots.bgSet") },
                                            { value: "inherit", label: t("page.storyMaker.v2.slots.bgInherit") },
                                            { value: "clear", label: t("page.storyMaker.v2.slots.bgClear") },
                                        ]}
                                        aria-label={t("page.storyMaker.v2.slots.background")}
                                        className="[&>button]:px-1.5"
                                    />
                                    {scene.background.mode === "set" && (
                                        <div className="space-y-2">
                                            <div className="overflow-hidden rounded-md3-sm border border-outline-variant bg-surface-container-highest">
                                                {bgPreviewUrl && !bgFailed ? (
                                                    <img
                                                        key={bgPreviewUrl}
                                                        src={bgPreviewUrl}
                                                        alt=""
                                                        onError={() => setFailedBgUrl(bgPreviewUrl)}
                                                        className="aspect-video w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex aspect-video items-center justify-center px-3 text-center type-body-s text-on-surface-variant">
                                                        {t(bgFailed ? "page.storyMaker.inspector.backgroundPreviewFailed" : "page.storyMaker.summary.noBackground")}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex min-w-0 flex-wrap items-start gap-2">
                                                <TextField
                                                    label={t("page.storyMaker.inspector.assetName")}
                                                    value={scene.background.asset}
                                                    maxLength={64}
                                                    onChange={event => onDocChange(prev => setSceneBackground(prev, scene.id, {
                                                        mode: "set",
                                                        asset: event.target.value.trim(),
                                                    }))}
                                                    className="min-w-[8rem] flex-1 font-mono"
                                                />
                                                <Button
                                                    size="s"
                                                    variant="tonal"
                                                    icon={mdImage}
                                                    onClick={() => setBgPickerOpen(true)}
                                                    className="mt-1 shrink-0"
                                                >
                                                    {t("page.storyMaker.inspector.browse")}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 2. BGM Slot */}
                                <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                    <span className="flex items-center gap-1.5 type-label-l text-on-surface">
                                        <Icon path={mdMusicNote} size={16} className="text-primary" />
                                        <span>{t("page.storyMaker.v2.slots.bgm")}</span>
                                    </span>
                                    <SegmentedButton<BgmSlot["mode"]>
                                        density={-2}
                                        value={scene.bgm.mode}
                                        onValueChange={(mode) => {
                                            const slot: BgmSlot = mode === "play"
                                                ? { mode: "play", name: bgmName || DEFAULT_STORY_BGM, volume: bgmVol }
                                                : { mode };
                                            onDocChange(prev => setSceneBgm(prev, scene.id, slot));
                                        }}
                                        options={[
                                            { value: "play", label: t("page.storyMaker.v2.slots.bgmPlay") },
                                            { value: "inherit", label: t("page.storyMaker.v2.slots.bgmInherit") },
                                            { value: "stop", label: t("page.storyMaker.v2.slots.bgmStop") },
                                        ]}
                                        aria-label={t("page.storyMaker.v2.slots.bgm")}
                                        className="[&>button]:px-1.5"
                                    />
                                    {scene.bgm.mode === "play" && (
                                        <div className="space-y-2.5">
                                            <div className="flex min-w-0 flex-wrap items-start gap-2">
                                                <TextField
                                                    label={t("page.storyMaker.inspector.bgmName")}
                                                    value={scene.bgm.name}
                                                    maxLength={STORY_LIMITS.audioPath}
                                                    placeholder={DEFAULT_STORY_BGM}
                                                    onChange={event => onDocChange(prev => setSceneBgm(prev, scene.id, {
                                                        mode: "play",
                                                        name: event.target.value.trim(),
                                                        volume: bgmVol,
                                                    }))}
                                                    className="min-w-[8rem] flex-1 font-mono"
                                                />
                                                <div className="mt-1 flex shrink-0 items-center gap-1">
                                                    <Button
                                                        size="s"
                                                        variant="tonal"
                                                        icon={mdMusicNote}
                                                        onClick={() => setAssetPicker({ kind: "bgm", target: "sceneBgm" })}
                                                    >
                                                        {t("page.storyMaker.inspector.browse")}
                                                    </Button>
                                                    <IconButton
                                                        size="s"
                                                        icon={playingBgm ? mdStopFill : mdPlayArrowFill}
                                                        label={t(playingBgm ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                                        disabled={!bgmUrl}
                                                        onClick={() => bgmUrl && togglePreview(bgmKey, bgmUrl, { volume: bgmVol })}
                                                    />
                                                </div>
                                            </div>
                                            {previewError === bgmKey && bgmKey && (
                                                <p role="alert" className="type-label-s text-error">
                                                    {t("page.storyMaker.inspector.audioPreviewFailed")}
                                                </p>
                                            )}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="type-label-m text-on-surface-variant">{t("page.storyMaker.inspector.volume")}</span>
                                                    <span className="font-mono type-label-m text-on-surface">{Math.round(bgmVol * 100)}%</span>
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={bgmVol}
                                                    onValueChange={val => onDocChange(prev => setSceneBgm(prev, scene.id, {
                                                        mode: "play",
                                                        name: bgmName,
                                                        volume: Number(val.toFixed(2)),
                                                    }))}
                                                    aria-label={t("page.storyMaker.inspector.volume")}
                                                    formatValue={val => `${Math.round(val * 100)}%`}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 3. Place Slot */}
                                <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                    <span className="block type-label-l text-on-surface">
                                        {t("page.storyMaker.v2.slots.place")}
                                    </span>
                                    <SegmentedButton<PlaceSlot["mode"]>
                                        density={-2}
                                        value={scene.place.mode}
                                        onValueChange={(mode) => {
                                            const slot: PlaceSlot = mode === "set"
                                                ? { mode: "set", text: scene.place.mode === "set" ? scene.place.text : "" }
                                                : { mode };
                                            onDocChange(prev => setScenePlace(prev, scene.id, slot));
                                        }}
                                        options={[
                                            { value: "set", label: t("page.storyMaker.v2.slots.placeSet") },
                                            { value: "inherit", label: t("page.storyMaker.v2.slots.placeInherit") },
                                            { value: "hide", label: t("page.storyMaker.v2.slots.placeHide") },
                                        ]}
                                        aria-label={t("page.storyMaker.v2.slots.place")}
                                        className="[&>button]:px-1.5"
                                    />
                                    {scene.place.mode === "set" && (
                                        <div className="space-y-2">
                                            <TextField
                                                label={t("page.storyMaker.inspector.placeText")}
                                                value={scene.place.text}
                                                maxLength={STORY_LIMITS.place}
                                                placeholder={t("page.storyMaker.inspector.placePlaceholder")}
                                                onChange={event => onDocChange(prev => setScenePlace(prev, scene.id, {
                                                    mode: "set",
                                                    text: event.target.value,
                                                }))}
                                            />
                                            <VariableInsertRow
                                                variables={doc.variables}
                                                onInsert={token => onDocChange(prev => setScenePlace(prev, scene.id, {
                                                    mode: "set",
                                                    text: `${scene.place.mode === "set" ? scene.place.text : ""}${token}`.slice(0, STORY_LIMITS.place),
                                                }))}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* 4. Transition Slot */}
                                <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                    <span className="block type-label-l text-on-surface">
                                        {t("page.storyMaker.v2.slots.transition")}
                                    </span>
                                    <SegmentedButton<TransitionKind>
                                        density={-2}
                                        value={scene.transition.kind}
                                        onValueChange={kind => onDocChange(prev => setSceneTransition(prev, scene.id, {
                                            kind,
                                            duration: scene.transition.duration,
                                        }))}
                                        options={TRANSITION_KINDS.map(kind => ({
                                            value: kind,
                                            label: t(
                                                kind === "none"
                                                    ? "page.storyMaker.v2.slots.transNone"
                                                    : kind === "fadeBlack"
                                                        ? "page.storyMaker.v2.slots.transFadeBlack"
                                                        : "page.storyMaker.v2.slots.transFadeWhite",
                                            ),
                                        }))}
                                        aria-label={t("page.storyMaker.v2.slots.transition")}
                                        className="[&>button]:px-1.5"
                                    />
                                    {scene.transition.kind !== "none" && (
                                        <DurationSlider
                                            label={t("page.storyMaker.v2.slots.durationSec")}
                                            value={scene.transition.duration}
                                            onChange={duration => onDocChange(prev => setSceneTransition(prev, scene.id, {
                                                kind: scene.transition.kind,
                                                duration,
                                            }))}
                                        />
                                    )}
                                </div>

                                {/* 5. Stage Cast Slot (0..5 unique actors) */}
                                <div className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                        <span className="flex items-center gap-1.5 type-label-l text-on-surface">
                                            <Icon path={mdGroup} size={16} className="text-primary" />
                                            <span>{t("page.storyMaker.v2.slots.stageCast")}</span>
                                        </span>
                                        {scene.stageCast.mode === "set" && (
                                            <span className="font-mono type-label-s text-on-surface-variant">
                                                {sceneActors.length}/{STORY_LIMITS.stageActors}
                                            </span>
                                        )}
                                    </div>
                                    <SegmentedButton<StageCastSlot["mode"]>
                                        density={-2}
                                        value={scene.stageCast.mode}
                                        onValueChange={(mode) => {
                                            const slot: StageCastSlot = mode === "set"
                                                ? { mode: "set", actors: sceneActors }
                                                : { mode };
                                            onDocChange(prev => setSceneStageCast(prev, scene.id, slot));
                                        }}
                                        options={[
                                            { value: "set", label: t("page.storyMaker.v2.slots.castSet") },
                                            { value: "inherit", label: t("page.storyMaker.v2.slots.castInherit") },
                                            { value: "clear", label: t("page.storyMaker.v2.slots.castClear") },
                                        ]}
                                        aria-label={t("page.storyMaker.v2.slots.stageCast")}
                                        className="[&>button]:px-1.5"
                                    />

                                    {scene.stageCast.mode === "set" && (
                                        <div className="space-y-2.5">
                                            {sceneActors.length >= STORY_LIMITS.stageActors ? (
                                                <p className="type-label-s text-on-surface-variant">
                                                    {t("page.storyMaker.v2.slots.actorMaxReached")}
                                                </p>
                                            ) : doc.cast.length === 0 ? (
                                                <p className="type-body-s text-on-surface-variant">
                                                    {t("page.storyMaker.inspector.noCastOptions")}
                                                </p>
                                            ) : availableCast.length > 0 ? (
                                                <div className="flex min-w-0 items-end gap-1.5">
                                                    <div className="min-w-0 flex-1">
                                                        <Select<string>
                                                            label={t("page.storyMaker.v2.slots.addActor")}
                                                            value={actorToAdd && !mountedKeys.has(actorToAdd) ? actorToAdd : availableCast[0]?.key ?? null}
                                                            onValueChange={setActorToAdd}
                                                            options={availableCastOptions}
                                                            placeholder={t("page.storyMaker.inspector.selectCast")}
                                                        />
                                                    </div>
                                                    <Button
                                                        size="s"
                                                        variant="tonal"
                                                        icon={mdAdd}
                                                        className="shrink-0"
                                                        onClick={() => {
                                                            const key = actorToAdd && !mountedKeys.has(actorToAdd)
                                                                ? actorToAdd
                                                                : availableCast[0]?.key;
                                                            if (!key) return;
                                                            onDocChange(prev => addCastKeyToScene(prev, scene.id, key));
                                                            setExpandedActorKeys(prev => new Set([...prev, key]));
                                                            setActorToAdd(null);
                                                        }}
                                                    >
                                                        {t("page.storyMaker.v2.slots.addActor")}
                                                    </Button>
                                                </div>
                                            ) : null}

                                            {sceneActors.length === 0 ? (
                                                <p className="type-body-s text-on-surface-variant">
                                                    {t("page.storyMaker.v2.slots.emptyCastSlot")}
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {sceneActors.map((actor) => {
                                                        const member = castMemberOf(actor.castKey);
                                                        const expanded = expandedActorKeys.has(actor.castKey);
                                                        const displayName = member?.name || actor.castKey;
                                                        return (
                                                            <div
                                                                key={actor.castKey}
                                                                className="min-w-0 overflow-hidden rounded-md3-sm border border-outline-variant/70 bg-surface-container-low"
                                                            >
                                                                <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
                                                                    <button
                                                                        type="button"
                                                                        aria-expanded={expanded}
                                                                        onClick={() => toggleActorExpanded(actor.castKey)}
                                                                        className="state-layer focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md3-xs text-left"
                                                                    >
                                                                        {member?.characterId ? (
                                                                            <img
                                                                                src={getCharacterIconUrl(member.characterId)}
                                                                                alt=""
                                                                                className="size-7 shrink-0 rounded-full bg-surface-container-highest object-cover"
                                                                            />
                                                                        ) : (
                                                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary-container type-label-m text-on-secondary-container">
                                                                                {displayName.slice(0, 1)}
                                                                            </span>
                                                                        )}
                                                                        <span className="min-w-0 flex-1 truncate type-label-l text-on-surface">
                                                                            {displayName}
                                                                        </span>
                                                                        <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                                            {t(`page.storyMaker.slot.${actor.slot}`)}
                                                                        </span>
                                                                        <Icon
                                                                            path={expanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                                                                            size={18}
                                                                            className="shrink-0 text-on-surface-variant"
                                                                        />
                                                                    </button>
                                                                    <IconButton
                                                                        size="xs"
                                                                        icon={mdDelete}
                                                                        label={t("page.storyMaker.cast.remove")}
                                                                        onClick={() => onDocChange(prev => removeActorFromSceneCast(prev, scene.id, actor.castKey))}
                                                                    />
                                                                </div>

                                                                {expanded && (
                                                                    <div className="space-y-3 border-t border-outline-variant/60 p-2.5">
                                                                        <div className="space-y-1">
                                                                            <span className="block type-label-m text-on-surface-variant">
                                                                                {t("page.storyMaker.inspector.slot")}
                                                                            </span>
                                                                            <SegmentedButton<StorySlot>
                                                                                density={-2}
                                                                                value={actor.slot}
                                                                                onValueChange={slot => onDocChange(prev => updateActorInSceneCast(prev, scene.id, actor.castKey, { slot }))}
                                                                                options={slotOptions}
                                                                                aria-label={t("page.storyMaker.inspector.slot")}
                                                                                className="[&>button]:px-1"
                                                                            />
                                                                        </div>

                                                                        <ActorFramingControls
                                                                            mode="enter"
                                                                            scale={actor.scale}
                                                                            y={actor.y}
                                                                            onScaleChange={scale => onDocChange(prev => updateActorInSceneCast(prev, scene.id, actor.castKey, { scale }))}
                                                                            onYChange={y => onDocChange(prev => updateActorInSceneCast(prev, scene.id, actor.castKey, { y }))}
                                                                            onReset={() => onDocChange(prev => addActorToSceneCast(prev, scene.id, {
                                                                                castKey: actor.castKey,
                                                                                slot: actor.slot,
                                                                                ...(actor.motion ? { motion: actor.motion } : {}),
                                                                                ...(actor.facial ? { facial: actor.facial } : {}),
                                                                            }))}
                                                                        />

                                                                        <div className="space-y-2">
                                                                            <p className="type-label-m text-on-surface-variant">
                                                                                {t("page.storyMaker.v2.slots.idleMotion")} / {t("page.storyMaker.v2.slots.idleFacial")}
                                                                            </p>
                                                                            {renderClipPair(
                                                                                actor.castKey,
                                                                                actor.motion,
                                                                                actor.facial,
                                                                                motion => onDocChange(prev => updateActorInSceneCast(prev, scene.id, actor.castKey, { motion })),
                                                                                facial => onDocChange(prev => updateActorInSceneCast(prev, scene.id, actor.castKey, { facial })),
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Divider />

                            {/* Quick-Add Performance Beats */}
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="type-title-s text-on-surface">
                                        {t("page.storyMaker.v2.beats.sectionTitle")}
                                    </p>
                                    <span className="font-mono type-label-s text-on-surface-variant">
                                        {scene.beats.length}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {SCENE_BEAT_KINDS.map(kind => (
                                        <Button
                                            key={kind}
                                            size="xs"
                                            variant="tonal"
                                            icon={BEAT_ICONS[kind]}
                                            onClick={() => handleAddBeat(kind)}
                                        >
                                            {t(`page.storyMaker.v2.beats.${kind}`)}
                                        </Button>
                                    ))}
                                </div>
                                {scene.beats.length === 0 ? (
                                    <p className="type-body-s text-on-surface-variant">
                                        {t("page.storyMaker.v2.beats.emptyBeats")}
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {scene.beats.map((beat, idx) => (
                                            <li key={beat.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectBeat(scene.id, beat.id)}
                                                    className="state-layer focus-ring flex w-full cursor-pointer items-center gap-2 rounded-md3-sm bg-surface-container px-2.5 py-1.5 text-left"
                                                >
                                                    <Icon path={BEAT_ICONS[beat.kind]} size={15} className="shrink-0 text-primary" />
                                                    <span className="shrink-0 font-mono type-label-s text-on-surface-variant">
                                                        {idx + 1}.
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate type-body-s text-on-surface">
                                                        {beat.kind === "talk"
                                                            ? (beat.body || t("page.storyMaker.v2.beats.talk"))
                                                            : beat.kind === "narration"
                                                                ? (beat.body || t("page.storyMaker.v2.beats.narration"))
                                                                : beat.kind === "telop"
                                                                    ? (beat.text || t("page.storyMaker.v2.beats.telop"))
                                                                    : t(`page.storyMaker.v2.beats.${beat.kind}`)}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    );
                })()
            ) : selectedNode.type === "choice" ? (
                /* ==================== CHOICE NODE INSPECTOR ==================== */
                (() => {
                    const choice: ChoiceNode = selectedNode;
                    return (
                        <>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-secondary-container text-on-secondary-container">
                                    <Icon path={mdAltRoute} size={18} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate type-title-s text-on-surface">
                                        {t("page.storyMaker.v2.nodeTypes.choice")}
                                    </p>
                                    <p className="truncate font-mono type-label-s text-on-surface-variant">{choice.id}</p>
                                </div>
                            </div>

                            {renderDiagnostics()}

                            <TextField
                                label={t("page.storyMaker.v2.nodeTypes.choice")}
                                value={choice.title}
                                maxLength={STORY_LIMITS.nodeTitle}
                                onChange={event => onDocChange(prev => updateNode<ChoiceNode>(prev, choice.id, n => ({
                                    ...n,
                                    title: event.target.value,
                                })))}
                            />

                            <Divider />

                            <div className="space-y-3">
                                {choice.options.map((option, idx) => (
                                    <div key={option.id} className="space-y-3 rounded-md3-md bg-surface-container p-3">
                                        <div className="flex min-w-0 items-center justify-between gap-2">
                                            <span className="type-label-l text-on-surface">
                                                {t("page.storyMaker.inspector.choiceOption", { number: idx + 1 })}
                                            </span>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <WireTargetChip
                                                    doc={doc}
                                                    fromNodeId={choice.id}
                                                    fromPortId={option.id}
                                                    onSelectNode={onSelectNode}
                                                    onDisconnect={() => onDocChange(prev => disconnectPort(prev, choice.id, option.id))}
                                                />
                                                <IconButton
                                                    size="xs"
                                                    icon={mdDelete}
                                                    label={t("page.storyMaker.inspector.removeOption")}
                                                    disabled={choice.options.length <= STORY_LIMITS.choiceOptions.min}
                                                    onClick={() => onDocChange(prev => removeChoiceOption(prev, choice.id, option.id))}
                                                />
                                            </div>
                                        </div>

                                        <TextField
                                            label={t("page.storyMaker.inspector.choiceText")}
                                            value={option.text}
                                            maxLength={STORY_LIMITS.choiceText}
                                            onChange={event => onDocChange(prev => updateChoiceOption(prev, choice.id, option.id, {
                                                text: event.target.value,
                                            }))}
                                        />

                                        {/* Optional Prerequisite Condition */}
                                        <div className="space-y-2 rounded-md3-sm border border-outline-variant/60 bg-surface-container-low p-2.5">
                                            <Switch
                                                checked={Boolean(option.condition)}
                                                disabled={!option.condition && doc.variables.length === 0}
                                                onCheckedChange={(enabled) => {
                                                    if (enabled) {
                                                        const firstVar = doc.variables[0];
                                                        if (!firstVar) return;
                                                        onDocChange(prev => updateChoiceOption(prev, choice.id, option.id, {
                                                            condition: defaultConditionForVariable(firstVar),
                                                        }));
                                                    } else {
                                                        onDocChange(prev => updateChoiceOption(prev, choice.id, option.id, {
                                                            condition: undefined,
                                                        }));
                                                    }
                                                }}
                                                label={t("page.storyMaker.v2.variables.optionCondition")}
                                            />
                                            {!option.condition && doc.variables.length === 0 && (
                                                <p className="type-label-s text-on-surface-variant">
                                                    {t("page.storyMaker.v2.variables.noVariablesYet")}
                                                </p>
                                            )}
                                            {option.condition && (
                                                <ConditionExprEditor
                                                    variables={doc.variables}
                                                    expr={option.condition}
                                                    onChange={expr => onDocChange(prev => updateChoiceOption(prev, choice.id, option.id, {
                                                        condition: expr,
                                                    }))}
                                                />
                                            )}
                                        </div>

                                        {/* Optional On-Select Variable Effects */}
                                        <div className="space-y-2 rounded-md3-sm border border-outline-variant/60 bg-surface-container-low p-2.5">
                                            <p className="type-label-m text-on-surface-variant">
                                                {t("page.storyMaker.v2.variables.optionEffects")}
                                            </p>
                                            <VarOpListEditor
                                                variables={doc.variables}
                                                ops={option.effects ?? []}
                                                addLabel={t("page.storyMaker.v2.variables.addEffect")}
                                                compactEmpty
                                                onChange={effects => onDocChange(prev => updateChoiceOption(prev, choice.id, option.id, {
                                                    effects: effects.length > 0 ? effects : undefined,
                                                }))}
                                            />
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    size="s"
                                    variant="tonal"
                                    icon={mdAdd}
                                    disabled={choice.options.length >= STORY_LIMITS.choiceOptions.max}
                                    onClick={() => onDocChange(prev => addChoiceOption(prev, choice.id, ""))}
                                >
                                    {t("page.storyMaker.inspector.addOption")}
                                </Button>
                            </div>
                        </>
                    );
                })()
            ) : selectedNode.type === "condition" ? (
                /* ==================== CONDITION NODE INSPECTOR ==================== */
                (() => {
                    const cond: ConditionNode = selectedNode;
                    return (
                        <>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-tertiary-container text-on-tertiary-container">
                                    <Icon path={mdCalculate} size={18} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate type-title-s text-on-surface">
                                        {t("page.storyMaker.v2.nodeTypes.condition")}
                                    </p>
                                    <p className="truncate font-mono type-label-s text-on-surface-variant">{cond.id}</p>
                                </div>
                            </div>

                            {renderDiagnostics()}

                            <TextField
                                label={t("page.storyMaker.v2.nodeTypes.condition")}
                                value={cond.title}
                                maxLength={STORY_LIMITS.nodeTitle}
                                onChange={event => onDocChange(prev => updateNode<ConditionNode>(prev, cond.id, n => ({
                                    ...n,
                                    title: event.target.value,
                                })))}
                            />

                            <Divider />

                            <div className="space-y-3">
                                <p className="type-label-l text-on-surface-variant">
                                    {t("page.storyMaker.v2.variables.condTitle")}
                                </p>

                                {doc.variables.length === 0 && (
                                    <Banner tone="info">{t("page.storyMaker.v2.variables.noVariablesYet")}</Banner>
                                )}

                                {cond.rules.length === 0 ? (
                                    <p className="type-body-s text-on-surface-variant">
                                        {t("page.storyMaker.v2.variables.noRules")}
                                    </p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {cond.rules.map((rule, idx) => (
                                            <div key={rule.id} className="space-y-2.5 rounded-md3-md bg-surface-container p-3">
                                                <div className="flex min-w-0 items-center justify-between gap-2">
                                                    <span className="font-mono type-label-m text-on-surface-variant">
                                                        #{idx + 1} · {rule.id}
                                                    </span>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <WireTargetChip
                                                            doc={doc}
                                                            fromNodeId={cond.id}
                                                            fromPortId={rule.id}
                                                            onSelectNode={onSelectNode}
                                                            onDisconnect={() => onDocChange(prev => disconnectPort(prev, cond.id, rule.id))}
                                                        />
                                                        <IconButton
                                                            size="xs"
                                                            icon={mdDelete}
                                                            label={t("page.storyMaker.landing.delete")}
                                                            onClick={() => onDocChange(prev => removeConditionRule(prev, cond.id, rule.id))}
                                                        />
                                                    </div>
                                                </div>
                                                <TextField
                                                    label={t("page.storyMaker.v2.variables.ruleLabel")}
                                                    value={rule.label ?? ""}
                                                    maxLength={STORY_LIMITS.ruleLabel}
                                                    onChange={event => onDocChange(prev => updateConditionRule(prev, cond.id, rule.id, {
                                                        label: event.target.value || undefined,
                                                    }))}
                                                />
                                                <ConditionExprEditor
                                                    variables={doc.variables}
                                                    expr={rule.expr}
                                                    onChange={expr => onDocChange(prev => updateConditionRule(prev, cond.id, rule.id, {
                                                        expr,
                                                    }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <Button
                                    size="s"
                                    variant="tonal"
                                    icon={mdAdd}
                                    disabled={doc.variables.length === 0 || cond.rules.length >= STORY_LIMITS.conditionRules}
                                    onClick={() => onDocChange(prev => addConditionRule(prev, cond.id))}
                                >
                                    {t("page.storyMaker.v2.variables.addRule")}
                                </Button>

                                {/* Mandatory Else Fallback Port */}
                                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md3-md border border-outline-variant/70 bg-surface-container-low px-3 py-2.5">
                                    <span className="type-label-l text-on-surface">
                                        {t("page.storyMaker.v2.variables.elseBranch")}
                                    </span>
                                    <WireTargetChip
                                        doc={doc}
                                        fromNodeId={cond.id}
                                        fromPortId="else"
                                        onSelectNode={onSelectNode}
                                        onDisconnect={() => onDocChange(prev => disconnectPort(prev, cond.id, "else"))}
                                    />
                                </div>
                            </div>
                        </>
                    );
                })()
            ) : (
                /* ==================== END NODE INSPECTOR ==================== */
                (() => {
                    const end: EndNode = selectedNode;
                    const incoming = getIncomingEdges(doc, end.id);
                    return (
                        <>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-tertiary-container text-on-tertiary-container">
                                    <Icon path={mdFlag} size={18} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate type-title-s text-on-surface">
                                            {t("page.storyMaker.v2.nodeTypes.end")}
                                        </p>
                                        <span className="shrink-0 rounded-md3-full bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                            {t("page.storyMaker.v2.ports.inOnly")}
                                        </span>
                                    </div>
                                    <p className="truncate font-mono type-label-s text-on-surface-variant">{end.id}</p>
                                </div>
                            </div>

                            {renderDiagnostics()}
                            <Divider />

                            <div className="space-y-4">
                                <TextField
                                    label={t("page.storyMaker.v2.ending.titleLabel")}
                                    value={end.title}
                                    maxLength={STORY_LIMITS.nodeTitle}
                                    onChange={event => onDocChange(prev => updateNode<EndNode>(prev, end.id, n => ({
                                        ...n,
                                        title: event.target.value,
                                    })))}
                                />
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label htmlFor={`end-subtitle-${end.id}`} className="type-label-l text-on-surface-variant">
                                            {t("page.storyMaker.v2.ending.subtitleLabel")}
                                        </label>
                                        <span className="font-mono type-label-s text-on-surface-variant">
                                            {(end.subtitle ?? "").length}/{STORY_LIMITS.endSubtitle}
                                        </span>
                                    </div>
                                    <textarea
                                        id={`end-subtitle-${end.id}`}
                                        rows={3}
                                        maxLength={STORY_LIMITS.endSubtitle}
                                        value={end.subtitle ?? ""}
                                        onChange={event => onDocChange(prev => updateNode<EndNode>(prev, end.id, n => ({
                                            ...n,
                                            subtitle: event.target.value,
                                        })))}
                                        className={TEXTAREA_CLS}
                                    />
                                    <VariableInsertRow
                                        variables={doc.variables}
                                        onInsert={token => onDocChange(prev => updateNode<EndNode>(prev, end.id, n => ({
                                            ...n,
                                            subtitle: `${n.subtitle ?? ""}${token}`.slice(0, STORY_LIMITS.endSubtitle),
                                        })))}
                                    />
                                </div>

                                <div className="space-y-2 rounded-md3-md bg-surface-container p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="type-label-l text-on-surface-variant">
                                            {t("page.storyMaker.v2.ports.inPort")}
                                        </span>
                                        <span className="rounded-md3-full bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-on-surface">
                                            {incoming.length}
                                        </span>
                                    </div>
                                    {incoming.length === 0 ? (
                                        <p className="type-body-s text-on-surface-variant">
                                            {t("page.storyMaker.v2.ports.unconnected")}
                                        </p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {incoming.map((edge) => {
                                                const src = doc.nodes[edge.fromNodeId];
                                                if (!src) return null;
                                                return (
                                                    <Chip
                                                        key={edge.id}
                                                        variant="assist"
                                                        icon={mdLink}
                                                        onClick={() => onSelectNode(src.id)}
                                                    >
                                                        {getNodeLabel(src, t)}
                                                    </Chip>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    );
                })()
            )}

            {/* ==================== PICKER DIALOGS ==================== */}
            {selectedScene && bgPickerOpen && (
                <Dialog
                    isOpen
                    onClose={() => setBgPickerOpen(false)}
                    title={t("page.storyMaker.inspector.pickBackground")}
                    size="lg"
                    fullscreenOnMobile
                >
                    <Live2DBackgroundGrid
                        key={`${doc.region}|${line}`}
                        region={doc.region}
                        line={line}
                        current={selectedScene.background.mode === "set" ? selectedScene.background.asset : null}
                        defaultCategory="scene"
                        onSelect={(name) => {
                            onDocChange(prev => setSceneBackground(
                                prev,
                                selectedScene.id,
                                name ? { mode: "set", asset: name } : { mode: "clear" },
                            ));
                            setBgPickerOpen(false);
                        }}
                    />
                </Dialog>
            )}

            {assetPicker && selectedScene && (
                <AssetNamePickerDialog
                    isOpen
                    onClose={() => setAssetPicker(null)}
                    kind={assetPicker.kind}
                    region={doc.region}
                    line={line}
                    current={
                        assetPicker.target === "sceneBgm"
                            ? (selectedScene.bgm.mode === "play" ? selectedScene.bgm.name : "")
                            : selectedBeat && (selectedBeat.kind === "talk" || selectedBeat.kind === "narration" || selectedBeat.kind === "cue")
                                ? (selectedBeat.se ?? "")
                                : ""
                    }
                    onSelect={(name) => {
                        if (assetPicker.target === "sceneBgm") {
                            const vol = selectedScene.bgm.mode === "play" ? selectedScene.bgm.volume : 0.75;
                            onDocChange(prev => setSceneBgm(prev, selectedScene.id, { mode: "play", name, volume: vol }));
                        } else if (selectedBeat) {
                            if (selectedBeat.kind === "talk" || selectedBeat.kind === "narration") {
                                updateSelectedBeat({ ...selectedBeat, se: name, seVolume: selectedBeat.seVolume ?? 1 });
                            } else if (selectedBeat.kind === "cue" && selectedBeat.cueType === "se") {
                                updateSelectedBeat({ ...selectedBeat, se: name, seVolume: selectedBeat.seVolume ?? 1 });
                            }
                        }
                    }}
                />
            )}

            {voicePickerOpen && selectedScene && selectedBeat?.kind === "talk" && selectedBeat.voice && (
                <VoicePickerDialog
                    key={`${selectedBeat.id}|${selectedBeat.voice.kind}|${doc.region}|${line}`}
                    isOpen
                    onClose={() => setVoicePickerOpen(false)}
                    kind={selectedBeat.voice.kind}
                    region={doc.region}
                    line={line}
                    currentScenarioId={selectedBeat.voice.scenarioId}
                    currentVoiceId={selectedBeat.voice.voiceId}
                    onSelect={(selectedVoice, suggestedText) => {
                        const prev = selectedBeat.voice;
                        const prevRegion = prev?.region ?? doc.region;
                        const nextRegion = selectedVoice.region ?? doc.region;
                        const sameClip = Boolean(
                            prev
                            && prev.kind === selectedVoice.kind
                            && prev.scenarioId === selectedVoice.scenarioId
                            && prev.voiceId === selectedVoice.voiceId
                            && prevRegion === nextRegion,
                        );
                        const nextVoice: StoryVoiceRef = {
                            kind: selectedVoice.kind,
                            scenarioId: selectedVoice.scenarioId,
                            voiceId: selectedVoice.voiceId,
                        };
                        if (selectedVoice.region && selectedVoice.region !== doc.region) {
                            nextVoice.region = selectedVoice.region;
                        }
                        if (sameClip && prev) {
                            if (prev.start !== undefined) nextVoice.start = prev.start;
                            if (prev.end !== undefined) nextVoice.end = prev.end;
                        }
                        const nextBeat: TalkBeat = { ...selectedBeat, voice: nextVoice };
                        if (suggestedText !== undefined) {
                            nextBeat.body = suggestedText.slice(0, STORY_LIMITS.body);
                        }
                        updateSelectedBeat(nextBeat);
                    }}
                />
            )}
        </div>
    );
}

// ==================== Shared Inspector Subcomponents ====================

function WireTargetChip({
    doc,
    fromNodeId,
    fromPortId,
    onSelectNode,
    onDisconnect,
}: {
    doc: StoryDocument;
    fromNodeId: string;
    fromPortId: string;
    onSelectNode: (nodeId: string) => void;
    onDisconnect?: () => void;
}) {
    const { t } = useI18n();
    const edge = getOutgoingEdge(doc, fromNodeId, fromPortId);
    const target = edge ? doc.nodes[edge.toNodeId] : undefined;

    if (!target) {
        return (
            <span className="inline-flex max-w-full items-center rounded-md3-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant">
                {t("page.storyMaker.v2.ports.unconnected")}
            </span>
        );
    }

    return (
        <span className="inline-flex max-w-[13rem] items-center overflow-hidden rounded-md3-full bg-secondary-container text-on-secondary-container">
            <button
                type="button"
                onClick={() => onSelectNode(target.id)}
                className="state-layer focus-ring inline-flex min-w-0 cursor-pointer items-center gap-1 px-2.5 py-0.5 type-label-s"
                title={target.id}
            >
                <Icon path={mdLink} size={13} className="shrink-0" />
                <span className="truncate">{getNodeLabel(target, t)}</span>
            </button>
            {onDisconnect && (
                <button
                    type="button"
                    aria-label={t("page.storyMaker.flow.clearTarget")}
                    title={t("page.storyMaker.flow.clearTarget")}
                    onClick={onDisconnect}
                    className="state-layer focus-ring inline-flex shrink-0 cursor-pointer items-center border-l border-on-secondary-container/20 px-1.5 py-0.5"
                >
                    <Icon path={mdLinkOff} size={13} />
                </button>
            )}
        </span>
    );
}

function VariableInsertRow({
    variables,
    onInsert,
}: {
    variables: readonly StoryVariable[];
    onInsert: (token: string) => void;
}) {
    const { t } = useI18n();
    if (variables.length === 0) return null;
    return (
        <div className="space-y-1">
            <span className="block type-label-s text-on-surface-variant">
                {t("page.storyMaker.v2.beats.insertVarPlaceholder")}
            </span>
            <div className="flex flex-wrap gap-1">
                {variables.map(v => (
                    <Chip
                        key={v.id}
                        variant="assist"
                        onClick={() => onInsert(`{{${v.id}}}`)}
                    >
                        <span className="font-mono">{`{{${v.name || v.id}}}`}</span>
                    </Chip>
                ))}
            </div>
        </div>
    );
}

function ConditionExprEditor({
    variables,
    expr,
    onChange,
}: {
    variables: readonly StoryVariable[];
    expr: ConditionExpr;
    onChange: (next: ConditionExpr) => void;
}) {
    const { t } = useI18n();
    const selectedVar = variables.find(v => v.id === expr.varId) ?? null;
    const isBool = selectedVar?.type === "boolean";
    const allowedOps: readonly ConditionOp[] = isBool ? ["==", "!="] : CONDITION_OPS;

    return (
        <div className="min-w-0 space-y-2">
            <Select<string>
                label={t("page.storyMaker.v2.variables.nameLabel")}
                value={expr.varId || null}
                onValueChange={(varId) => {
                    const nextVar = variables.find(v => v.id === varId);
                    if (nextVar) onChange(defaultConditionForVariable(nextVar));
                    else onChange({ ...expr, varId });
                }}
                options={variables.map(v => ({
                    value: v.id,
                    label: v.name || v.id,
                    trailing: (
                        <span className="font-mono type-label-s text-on-surface-variant">
                            {t(v.type === "number" ? "page.storyMaker.v2.variables.typeNumber" : "page.storyMaker.v2.variables.typeBoolean")}
                        </span>
                    ),
                }))}
                noOptionsLabel={t("page.storyMaker.v2.variables.noVariablesYet")}
            />
            <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-center gap-2">
                <Select<ConditionOp>
                    value={allowedOps.includes(expr.op) ? expr.op : "=="}
                    onValueChange={op => onChange({ ...expr, op })}
                    options={allowedOps.map(op => ({ value: op, label: op }))}
                    aria-label={t("page.storyMaker.v2.nodeTypes.condition")}
                />
                {isBool ? (
                    <div className="flex items-center justify-between rounded-md3-xs border border-outline px-3 py-2">
                        <span className="font-mono type-label-l text-on-surface">
                            {expr.value ? "true" : "false"}
                        </span>
                        <Switch
                            checked={Boolean(expr.value)}
                            onCheckedChange={checked => onChange({ ...expr, value: checked })}
                            aria-label={t("page.storyMaker.v2.variables.typeBoolean")}
                        />
                    </div>
                ) : (
                    <TextField
                        type="number"
                        value={typeof expr.value === "number" ? String(expr.value) : "0"}
                        min={STORY_LIMITS.varNumberMin}
                        max={STORY_LIMITS.varNumberMax}
                        onChange={(event) => {
                            const num = Number(event.target.value);
                            if (Number.isFinite(num)) {
                                onChange({
                                    ...expr,
                                    value: Math.min(STORY_LIMITS.varNumberMax, Math.max(STORY_LIMITS.varNumberMin, num)),
                                });
                            }
                        }}
                        aria-label={t("page.storyMaker.v2.variables.typeNumber")}
                        className="font-mono"
                    />
                )}
            </div>
        </div>
    );
}

function VarOpListEditor({
    variables,
    ops,
    addLabel,
    compactEmpty = false,
    onChange,
}: {
    variables: readonly StoryVariable[];
    ops: readonly VarOp[];
    addLabel: string;
    compactEmpty?: boolean;
    onChange: (next: VarOp[]) => void;
}) {
    const { t } = useI18n();

    if (variables.length === 0 && ops.length === 0) {
        return compactEmpty ? (
            <p className="type-label-s text-on-surface-variant">{t("page.storyMaker.v2.variables.noVariablesYet")}</p>
        ) : (
            <Banner tone="info">{t("page.storyMaker.v2.variables.noVariablesYet")}</Banner>
        );
    }

    const updateRow = (index: number, nextOp: VarOp) => {
        onChange(ops.map((item, idx) => (idx === index ? nextOp : item)));
    };

    const removeRow = (index: number) => {
        onChange(ops.filter((_, idx) => idx !== index));
    };

    return (
        <div className="min-w-0 space-y-2.5">
            {ops.map((op, idx) => {
                const variable = variables.find(v => v.id === op.varId) ?? null;
                const isBool = variable?.type === "boolean";
                return (
                    <div key={`${op.varId}-${idx}`} className="space-y-2 rounded-md3-sm bg-surface-container p-2.5">
                        <div className="flex items-start gap-1.5">
                            <div className="min-w-0 flex-1">
                                <Select<string>
                                    label={t("page.storyMaker.v2.variables.nameLabel")}
                                    value={op.varId || null}
                                    onValueChange={(varId) => {
                                        const target = variables.find(v => v.id === varId);
                                        if (target) updateRow(idx, defaultVarOpForVariable(target));
                                        else updateRow(idx, { ...op, varId });
                                    }}
                                    options={variables.map(v => ({
                                        value: v.id,
                                        label: v.name || v.id,
                                    }))}
                                    noOptionsLabel={t("page.storyMaker.v2.variables.noVariablesYet")}
                                />
                            </div>
                            <IconButton
                                size="xs"
                                icon={mdDelete}
                                label={t("page.storyMaker.landing.delete")}
                                onClick={() => removeRow(idx)}
                                className="mt-1 shrink-0"
                            />
                        </div>

                        {isBool ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Select<"set" | "toggle">
                                    value={op.op === "toggle" ? "toggle" : "set"}
                                    onValueChange={(nextOpKind) => {
                                        if (nextOpKind === "toggle") {
                                            updateRow(idx, { varId: op.varId, op: "toggle" });
                                        } else {
                                            updateRow(idx, { varId: op.varId, op: "set", value: true });
                                        }
                                    }}
                                    options={[
                                        { value: "set", label: t("page.storyMaker.v2.variables.opSet") },
                                        { value: "toggle", label: t("page.storyMaker.v2.variables.opToggle") },
                                    ]}
                                    aria-label={t("page.storyMaker.v2.beats.varOp")}
                                />
                                {op.op !== "toggle" && (
                                    <div className="flex items-center justify-between rounded-md3-xs border border-outline px-3 py-2">
                                        <span className="font-mono type-label-l text-on-surface">
                                            {op.value ? "true" : "false"}
                                        </span>
                                        <Switch
                                            checked={Boolean(op.value)}
                                            onCheckedChange={checked => updateRow(idx, { varId: op.varId, op: "set", value: checked })}
                                            aria-label={t("page.storyMaker.v2.variables.typeBoolean")}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)] items-center gap-2">
                                <Select<"set" | "add" | "sub">
                                    value={op.op === "add" || op.op === "sub" ? op.op : "set"}
                                    onValueChange={nextOpKind => updateRow(idx, {
                                        varId: op.varId,
                                        op: nextOpKind,
                                        value: typeof op.value === "number" ? op.value : 1,
                                    })}
                                    options={[
                                        { value: "set", label: t("page.storyMaker.v2.variables.opSet") },
                                        { value: "add", label: t("page.storyMaker.v2.variables.opAdd") },
                                        { value: "sub", label: t("page.storyMaker.v2.variables.opSub") },
                                    ]}
                                    aria-label={t("page.storyMaker.v2.beats.varOp")}
                                />
                                <TextField
                                    type="number"
                                    value={typeof op.value === "number" ? String(op.value) : "0"}
                                    min={STORY_LIMITS.varNumberMin}
                                    max={STORY_LIMITS.varNumberMax}
                                    onChange={(event) => {
                                        const num = Number(event.target.value);
                                        if (Number.isFinite(num)) {
                                            updateRow(idx, {
                                                varId: op.varId,
                                                op: op.op === "add" || op.op === "sub" ? op.op : "set",
                                                value: Math.min(STORY_LIMITS.varNumberMax, Math.max(STORY_LIMITS.varNumberMin, num)),
                                            });
                                        }
                                    }}
                                    aria-label={t("page.storyMaker.v2.variables.typeNumber")}
                                    className="font-mono"
                                />
                            </div>
                        )}
                    </div>
                );
            })}

            <Button
                size="xs"
                variant="tonal"
                icon={mdAdd}
                disabled={variables.length === 0 || ops.length >= STORY_LIMITS.varOpsPerBeat}
                onClick={() => {
                    const first = variables[0];
                    if (!first) return;
                    onChange([...ops, defaultVarOpForVariable(first)]);
                }}
            >
                {addLabel}
            </Button>
        </div>
    );
}

function ActorFramingControls({
    mode,
    scale,
    y,
    onScaleChange,
    onYChange,
    onReset,
}: {
    mode: "enter" | "move";
    scale: number | undefined;
    y: number | undefined;
    onScaleChange: (scale: number | undefined) => void;
    onYChange: (y: number | undefined) => void;
    onReset: () => void;
}) {
    const { t } = useI18n();
    const effectiveScale = scale ?? 1;
    const effectiveY = y ?? 0;
    const hasCustom = mode === "enter"
        ? (scale !== undefined && Math.abs(scale - 1) > 0.001) || (y !== undefined && Math.abs(y) > 0.001)
        : scale !== undefined || y !== undefined;

    return (
        <div className="min-w-0 space-y-2.5 rounded-md3-md bg-surface-container-low p-2.5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 type-label-m text-on-surface-variant">
                    {t("page.storyMaker.inspector.actorFraming")}
                </span>
                <Button
                    size="xs"
                    variant="text"
                    icon={mdRestartAlt}
                    disabled={!hasCustom}
                    onClick={onReset}
                >
                    {t("page.storyMaker.inspector.resetFraming")}
                </Button>
            </div>

            <div className="flex flex-wrap gap-1">
                {SCALE_PRESETS.map(preset => (
                    <Chip
                        key={preset.value}
                        variant="filter"
                        showCheckmark={false}
                        selected={Math.abs(effectiveScale - preset.value) < 0.01 && (mode === "enter" || scale !== undefined)}
                        onClick={() => onScaleChange(preset.value)}
                    >
                        {t(preset.labelKey)}
                    </Chip>
                ))}
            </div>

            <div className="space-y-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate type-label-s text-on-surface-variant">
                        {t("page.storyMaker.inspector.scale")}
                    </span>
                    <span className="shrink-0 font-mono type-label-s text-on-surface">{effectiveScale.toFixed(2)}×</span>
                </div>
                <Slider
                    min={STORY_LIMITS.scaleMin}
                    max={STORY_LIMITS.scaleMax}
                    step={0.05}
                    value={effectiveScale}
                    onValueChange={next => onScaleChange(Number(next.toFixed(2)))}
                    aria-label={t("page.storyMaker.inspector.scale")}
                    formatValue={val => `${val.toFixed(2)}×`}
                />
            </div>

            <div className="space-y-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate type-label-s text-on-surface-variant">
                        {t("page.storyMaker.inspector.verticalOffset")}
                    </span>
                    <span className="shrink-0 font-mono type-label-s text-on-surface">
                        {effectiveY > 0 ? `+${effectiveY.toFixed(2)}` : effectiveY.toFixed(2)}
                    </span>
                </div>
                <Slider
                    min={STORY_LIMITS.yMin}
                    max={STORY_LIMITS.yMax}
                    step={0.02}
                    value={effectiveY}
                    onValueChange={next => onYChange(Number(next.toFixed(2)))}
                    aria-label={t("page.storyMaker.inspector.verticalOffset")}
                    formatValue={val => (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2))}
                />
            </div>

            {mode === "move" && scale === undefined && y === undefined && (
                <p className="type-body-s text-on-surface-variant">
                    {t("page.storyMaker.inspector.keepCurrentFraming")}
                </p>
            )}
        </div>
    );
}

function DurationSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <div className="space-y-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate type-label-m text-on-surface-variant">{label}</span>
                <span className="shrink-0 font-mono type-label-m text-on-surface">{value.toFixed(1)}s</span>
            </div>
            <Slider
                min={STORY_LIMITS.duration.min}
                max={STORY_LIMITS.duration.max}
                step={0.1}
                value={value}
                onValueChange={next => onChange(Number(next.toFixed(1)))}
                aria-label={label}
                formatValue={val => `${val.toFixed(1)}s`}
            />
        </div>
    );
}
