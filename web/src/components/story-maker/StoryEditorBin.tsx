"use client";
import React, { useMemo, useState } from "react";
import { Icon, IconButton, Tabs, cn } from "@/components/md3";
import {
    mdAccessibilityNew, mdAltRoute, mdAnimation, mdArticle, mdBlock, mdBolt, mdCalculate,
    mdChat, mdDarkMode, mdDragIndicator, mdFlag, mdGroups, mdImage, mdLabel, mdLayers,
    mdLightMode, mdMovie, mdMusicNote, mdMusicOff, mdMyLocation, mdPersonRemove,
    mdQueueMusic, mdRecordVoiceOver, mdTitle, mdVisibilityOff, mdVolumeUp,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getAssetLine, getCharacterIconUrl } from "@/lib/assets";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import { storyBackgroundUrl } from "@/lib/storyMaker/assets";
import {
    STORY_DRAG_MIME, addCastMember, removeCastMember, speakerName, updateCastMember,
    type StoryDragPayload,
} from "@/lib/storyMaker/document";
import {
    DEFAULT_STORY_BACKGROUND, DEFAULT_STORY_BGM, STORY_FADE_SECONDS,
} from "@/lib/storyMaker/limits";
import type { StoryCastMember, StoryDocument, StoryVoiceRef } from "@/types/storyMaker";
import { CastPanel } from "./CastPanel";
import type { StoryModelList } from "./useStoryModels";
import { VariableManagerPanel } from "./VariableManagerPanel";

export type EditorBinTab = "components" | "assets" | "variables" | "cast";

export interface StoryEditorBinProps {
    doc: StoryDocument;
    assetSource: AssetSourceType;
    models: Live2DModel[];
    modelInfo: Record<string, Live2DActorInfo>;
    activeNodeId: string | null;
    previewingCastId?: string | null;
    onDocChange: (updater: (prev: StoryDocument) => StoryDocument) => void;
    onSelectNode: (nodeId: string) => void;
    onQuickDrop: (payload: StoryDragPayload) => void;
    onDragPayloadStart?: (payload: StoryDragPayload | null) => void;
    onPreviewCast?: (cast: StoryCastMember, clip?: { motion?: string; facial?: string }) => void;
    onClearPreview?: () => void;
    /** Optional full model loading state & retry callback for CastPanel; synthesized from `models` when omitted. */
    modelList?: StoryModelList;
    onRetryModels?: () => void;
    /** Optional controlled tab state (e.g. for mobile workspace layouts). */
    activeTab?: EditorBinTab;
    onTabChange?: (tab: EditorBinTab) => void;
    hideTabs?: boolean;
    className?: string;
}

type PaletteTone = "primary" | "secondary" | "tertiary" | "neutral";

interface PaletteItemDef {
    key: string;
    label: string;
    hint: string;
    icon: string;
    tone: PaletteTone;
    payload: StoryDragPayload;
}

interface BinAudioEntry {
    key: string;
    kind: "bgm" | "se" | "voice";
    label: string;
    subtitle?: string;
    hint: string;
    firstNodeId: string;
    payload: StoryDragPayload;
    voice?: StoryVoiceRef;
}

const NOOP = () => {};

function startPayloadDrag(
    payload: StoryDragPayload,
    event: React.DragEvent,
    onDragPayloadStart?: (payload: StoryDragPayload | null) => void,
) {
    onDragPayloadStart?.(payload);
    event.dataTransfer.setData(STORY_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", payload.kind);
    event.dataTransfer.effectAllowed = "copy";
}

function toneCardClasses(tone: PaletteTone): { card: string; icon: string } {
    switch (tone) {
        case "primary":
            return {
                card: "border-primary/35 bg-primary-container/35 text-on-surface hover:border-primary/65",
                icon: "text-primary",
            };
        case "secondary":
            return {
                card: "border-secondary/35 bg-secondary-container/40 text-on-surface hover:border-secondary/65",
                icon: "text-secondary",
            };
        case "tertiary":
            return {
                card: "border-tertiary/35 bg-tertiary-container/40 text-on-surface hover:border-tertiary/65",
                icon: "text-tertiary",
            };
        case "neutral":
        default:
            return {
                card: "border-outline-variant/65 bg-surface-container text-on-surface hover:border-primary/50",
                icon: "text-on-surface-variant",
            };
    }
}

/** Low-code Scratch/Blueprint Component Palette, Asset Bin, Variable Manager, and Cast Panel for `moesekai-story/2`. */
export function StoryEditorBin({
    doc,
    assetSource,
    models,
    modelInfo,
    activeNodeId,
    previewingCastId,
    onDocChange,
    onSelectNode,
    onQuickDrop,
    onDragPayloadStart,
    onPreviewCast,
    onClearPreview,
    modelList,
    onRetryModels,
    activeTab: controlledTab,
    onTabChange,
    hideTabs = false,
    className,
}: StoryEditorBinProps): React.JSX.Element {
    const { t } = useI18n();
    const [internalTab, setInternalTab] = useState<EditorBinTab>("components");
    const activeTab = controlledTab ?? internalTab;

    const handleTabChange = (next: EditorBinTab) => {
        if (controlledTab === undefined) setInternalTab(next);
        onTabChange?.(next);
    };

    const line = useMemo(() => getAssetLine(assetSource), [assetSource]);
    const resolvedModelList = useMemo<StoryModelList>(
        () => modelList ?? { status: "ready", models },
        [modelList, models],
    );

    const activeScene = useMemo(() => {
        if (!activeNodeId) return null;
        const node = doc.nodes[activeNodeId];
        return node?.type === "scene" ? node : null;
    }, [doc.nodes, activeNodeId]);

    const activeSceneCastKeys = useMemo(() => {
        if (!activeScene || activeScene.stageCast.mode !== "set") return new Set<string>();
        return new Set(activeScene.stageCast.actors.map(a => a.castKey));
    }, [activeScene]);

    const castFirstNode = useMemo(() => {
        const map = new Map<string, string>();
        for (const node of Object.values(doc.nodes)) {
            if (node.type !== "scene") continue;
            if (node.stageCast.mode === "set") {
                for (const actor of node.stageCast.actors) {
                    if (!map.has(actor.castKey)) map.set(actor.castKey, node.id);
                }
            }
            for (const beat of node.beats) {
                if (beat.kind === "talk") {
                    if (beat.speakerKey && !map.has(beat.speakerKey)) map.set(beat.speakerKey, node.id);
                    for (const reaction of beat.reactions ?? []) {
                        if (!map.has(reaction.castKey)) map.set(reaction.castKey, node.id);
                    }
                } else if (beat.kind === "stageAction" && beat.castKey && !map.has(beat.castKey)) {
                    map.set(beat.castKey, node.id);
                }
            }
        }
        return map;
    }, [doc.nodes]);

    const usedBackgrounds = useMemo(() => {
        const map = new Map<string, string>();
        for (const node of Object.values(doc.nodes)) {
            if (node.type !== "scene") continue;
            if (node.background.mode === "set" && node.background.asset && !map.has(node.background.asset)) {
                map.set(node.background.asset, node.id);
            }
        }
        return Array.from(map.entries()).map(([asset, firstNodeId]) => ({ asset, firstNodeId }));
    }, [doc.nodes]);

    const usedAudio = useMemo(() => {
        const list: BinAudioEntry[] = [];
        const seenBgm = new Set<string>();
        const seenSe = new Set<string>();
        const seenVoice = new Set<string>();

        const bgmHint = t("page.storyMaker.v2.palette.dropTargetBgmSlot");
        const beatHint = t("page.storyMaker.v2.palette.dropTargetBeatTrack");

        for (const node of Object.values(doc.nodes)) {
            if (node.type !== "scene") continue;
            if (node.bgm.mode === "play" && node.bgm.name && !seenBgm.has(node.bgm.name)) {
                seenBgm.add(node.bgm.name);
                list.push({
                    key: `bgm:${node.bgm.name}`,
                    kind: "bgm",
                    label: node.bgm.name,
                    hint: bgmHint,
                    firstNodeId: node.id,
                    payload: {
                        kind: "slot-bgm",
                        slot: { mode: "play", name: node.bgm.name, volume: node.bgm.volume },
                    },
                });
            }

            for (const beat of node.beats) {
                const seName = beat.kind === "cue" && beat.cueType === "se"
                    ? beat.se
                    : beat.kind === "talk" || beat.kind === "narration"
                        ? beat.se
                        : undefined;
                if (seName && !seenSe.has(seName)) {
                    seenSe.add(seName);
                    list.push({
                        key: `se:${seName}`,
                        kind: "se",
                        label: seName,
                        hint: beatHint,
                        firstNodeId: node.id,
                        payload: { kind: "asset-se", name: seName },
                    });
                }

                if (beat.kind === "talk" && beat.voice) {
                    const v = beat.voice;
                    const voiceKey = `${v.region ?? ""}:${v.kind}:${v.scenarioId}:${v.voiceId}`;
                    if (!seenVoice.has(voiceKey)) {
                        seenVoice.add(voiceKey);
                        const speaker = speakerName(doc, beat);
                        list.push({
                            key: `voice:${voiceKey}`,
                            kind: "voice",
                            label: v.voiceId,
                            subtitle: speaker || v.scenarioId,
                            hint: beatHint,
                            firstNodeId: node.id,
                            voice: v,
                            payload: {
                                kind: "asset-voice",
                                voice: v,
                                ...(beat.speakerKey ? { speakerKey: beat.speakerKey } : {}),
                            },
                        });
                    }
                }
            }
        }
        return list;
    }, [doc, t]);

    const nodeItems: PaletteItemDef[] = useMemo(() => {
        const hint = t("page.storyMaker.v2.palette.dropTargetCanvas");
        return [
            {
                key: "node-scene",
                label: t("page.storyMaker.v2.nodeTypes.scene"),
                hint,
                icon: mdMovie,
                tone: "primary",
                payload: { kind: "node", nodeType: "scene" },
            },
            {
                key: "node-choice",
                label: t("page.storyMaker.v2.nodeTypes.choice"),
                hint,
                icon: mdAltRoute,
                tone: "tertiary",
                payload: { kind: "node", nodeType: "choice" },
            },
            {
                key: "node-condition",
                label: t("page.storyMaker.v2.nodeTypes.condition"),
                hint,
                icon: mdCalculate,
                tone: "secondary",
                payload: { kind: "node", nodeType: "condition" },
            },
            {
                key: "node-end",
                label: t("page.storyMaker.v2.nodeTypes.end"),
                hint,
                icon: mdFlag,
                tone: "neutral",
                payload: { kind: "node", nodeType: "end" },
            },
        ];
    }, [t]);

    const bgItems: PaletteItemDef[] = useMemo(() => {
        const hint = t("page.storyMaker.v2.palette.dropTargetBgSlot");
        return [
            {
                key: "bg-set",
                label: t("page.storyMaker.v2.slots.bgSet"),
                hint,
                icon: mdImage,
                tone: "primary",
                payload: { kind: "slot-bg", slot: { mode: "set", asset: DEFAULT_STORY_BACKGROUND } },
            },
            {
                key: "bg-inherit",
                label: t("page.storyMaker.v2.slots.bgInherit"),
                hint,
                icon: mdLayers,
                tone: "neutral",
                payload: { kind: "slot-bg", slot: { mode: "inherit" } },
            },
            {
                key: "bg-clear",
                label: t("page.storyMaker.v2.slots.bgClear"),
                hint,
                icon: mdBlock,
                tone: "neutral",
                payload: { kind: "slot-bg", slot: { mode: "clear" } },
            },
        ];
    }, [t]);

    const bgmItems: PaletteItemDef[] = useMemo(() => {
        const hint = t("page.storyMaker.v2.palette.dropTargetBgmSlot");
        return [
            {
                key: "bgm-play",
                label: t("page.storyMaker.v2.slots.bgmPlay"),
                hint,
                icon: mdMusicNote,
                tone: "secondary",
                payload: { kind: "slot-bgm", slot: { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.7 } },
            },
            {
                key: "bgm-inherit",
                label: t("page.storyMaker.v2.slots.bgmInherit"),
                hint,
                icon: mdQueueMusic,
                tone: "neutral",
                payload: { kind: "slot-bgm", slot: { mode: "inherit" } },
            },
            {
                key: "bgm-stop",
                label: t("page.storyMaker.v2.slots.bgmStop"),
                hint,
                icon: mdMusicOff,
                tone: "neutral",
                payload: { kind: "slot-bgm", slot: { mode: "stop" } },
            },
        ];
    }, [t]);

    const placeTransItems: PaletteItemDef[] = useMemo(() => {
        const placeHint = t("page.storyMaker.v2.palette.dropTargetPlaceSlot");
        const transHint = t("page.storyMaker.v2.palette.dropTargetTransSlot");
        return [
            {
                key: "place-set",
                label: t("page.storyMaker.v2.slots.placeSet"),
                hint: placeHint,
                icon: mdLabel,
                tone: "primary",
                payload: { kind: "slot-place", slot: { mode: "set", text: "" } },
            },
            {
                key: "place-inherit",
                label: t("page.storyMaker.v2.slots.placeInherit"),
                hint: placeHint,
                icon: mdLayers,
                tone: "neutral",
                payload: { kind: "slot-place", slot: { mode: "inherit" } },
            },
            {
                key: "place-hide",
                label: t("page.storyMaker.v2.slots.placeHide"),
                hint: placeHint,
                icon: mdVisibilityOff,
                tone: "neutral",
                payload: { kind: "slot-place", slot: { mode: "hide" } },
            },
            {
                key: "trans-black",
                label: t("page.storyMaker.v2.slots.transFadeBlack"),
                hint: transHint,
                icon: mdDarkMode,
                tone: "tertiary",
                payload: { kind: "slot-transition", slot: { kind: "fadeBlack", duration: STORY_FADE_SECONDS } },
            },
            {
                key: "trans-white",
                label: t("page.storyMaker.v2.slots.transFadeWhite"),
                hint: transHint,
                icon: mdLightMode,
                tone: "tertiary",
                payload: { kind: "slot-transition", slot: { kind: "fadeWhite", duration: STORY_FADE_SECONDS } },
            },
            {
                key: "trans-none",
                label: t("page.storyMaker.v2.slots.transNone"),
                hint: transHint,
                icon: mdBolt,
                tone: "neutral",
                payload: { kind: "slot-transition", slot: { kind: "none", duration: 0 } },
            },
        ];
    }, [t]);

    const castModeItems: PaletteItemDef[] = useMemo(() => {
        const hint = t("page.storyMaker.v2.palette.dropTargetCastSlot");
        return [
            {
                key: "cast-inherit",
                label: t("page.storyMaker.v2.slots.castInherit"),
                hint,
                icon: mdGroups,
                tone: "secondary",
                payload: { kind: "slot-cast-mode", mode: "inherit" },
            },
            {
                key: "cast-clear",
                label: t("page.storyMaker.v2.slots.castClear"),
                hint,
                icon: mdPersonRemove,
                tone: "neutral",
                payload: { kind: "slot-cast-mode", mode: "clear" },
            },
        ];
    }, [t]);

    const beatItems: PaletteItemDef[] = useMemo(() => {
        const hint = t("page.storyMaker.v2.palette.dropTargetBeatTrack");
        return [
            {
                key: "beat-talk",
                label: t("page.storyMaker.v2.beats.talk"),
                hint,
                icon: mdChat,
                tone: "primary",
                payload: { kind: "beat", beatKind: "talk" },
            },
            {
                key: "beat-narration",
                label: t("page.storyMaker.v2.beats.narration"),
                hint,
                icon: mdArticle,
                tone: "primary",
                payload: { kind: "beat", beatKind: "narration" },
            },
            {
                key: "beat-telop",
                label: t("page.storyMaker.v2.beats.telop"),
                hint,
                icon: mdTitle,
                tone: "primary",
                payload: { kind: "beat", beatKind: "telop" },
            },
            {
                key: "beat-stageAction",
                label: t("page.storyMaker.v2.beats.stageAction"),
                hint,
                icon: mdAccessibilityNew,
                tone: "secondary",
                payload: { kind: "beat", beatKind: "stageAction", stageAction: "enter" },
            },
            {
                key: "beat-cue",
                label: t("page.storyMaker.v2.beats.cue"),
                hint,
                icon: mdAnimation,
                tone: "tertiary",
                payload: { kind: "beat", beatKind: "cue", cueType: "se" },
            },
            {
                key: "beat-varOp",
                label: t("page.storyMaker.v2.beats.varOp"),
                hint,
                icon: mdCalculate,
                tone: "secondary",
                payload: { kind: "beat", beatKind: "varOp" },
            },
        ];
    }, [t]);

    const renderPaletteGroup = (title: string, items: PaletteItemDef[]) => (
        <section className="space-y-1.5">
            <h3 className="type-label-m text-on-surface-variant">{title}</h3>
            <div className="grid grid-cols-2 gap-1.5">
                {items.map((item) => {
                    const styles = toneCardClasses(item.tone);
                    return (
                        <button
                            key={item.key}
                            type="button"
                            draggable
                            title={item.hint}
                            onDragStart={event => startPayloadDrag(item.payload, event, onDragPayloadStart)}
                            onDragEnd={() => onDragPayloadStart?.(null)}
                            onClick={() => onQuickDrop(item.payload)}
                            className={cn(
                                "state-layer focus-ring flex min-w-0 cursor-grab items-center gap-1.5 rounded-md3-md border px-2 py-2 text-left transition-colors active:cursor-grabbing",
                                styles.card,
                            )}
                        >
                            <Icon path={mdDragIndicator} size={14} className="shrink-0 opacity-50" />
                            <Icon path={item.icon} size={16} className={cn("shrink-0", styles.icon)} />
                            <span className="min-w-0 flex-1 truncate type-label-m">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );

    return (
        <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
            {!hideTabs && (
                <Tabs<EditorBinTab>
                    value={activeTab}
                    onValueChange={handleTabChange}
                    aria-label={t("page.storyMaker.nle.paneAssets")}
                    scrollable
                    className="shrink-0 [&_[role=tab]]:px-3"
                    items={[
                        { value: "components", label: t("page.storyMaker.v2.palette.tabComponents") },
                        { value: "assets", label: t("page.storyMaker.nle.tabAssets") },
                        { value: "variables", label: t("page.storyMaker.v2.variables.tabTitle") },
                        { value: "cast", label: t("page.storyMaker.nle.tabCast") },
                    ]}
                />
            )}

            {activeTab === "components" && (
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3">
                    <div className="flex items-start gap-2 rounded-md3-md border border-primary/25 bg-primary-container/30 px-2.5 py-2 text-on-surface">
                        <Icon path={mdDragIndicator} size={16} className="mt-0.5 shrink-0 text-primary" />
                        <p className="type-body-s text-on-surface-variant">{t("page.storyMaker.nle.dragHint")}</p>
                    </div>

                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupNodes"), nodeItems)}
                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupBgComponents"), bgItems)}
                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupBgmComponents"), bgmItems)}
                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupPlaceTransComponents"), placeTransItems)}
                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupCastComponents"), castModeItems)}
                    {renderPaletteGroup(t("page.storyMaker.v2.palette.groupBeats"), beatItems)}
                </div>
            )}

            {activeTab === "assets" && (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                    <div className="flex items-start gap-2 rounded-md3-md border border-outline-variant/60 bg-surface-container px-2.5 py-2">
                        <Icon path={mdDragIndicator} size={16} className="mt-0.5 shrink-0 text-primary" />
                        <p className="type-body-s text-on-surface-variant">{t("page.storyMaker.nle.dragHint")}</p>
                    </div>

                    {/* Cast Characters */}
                    <section className="space-y-1.5">
                        <h3 className="type-label-m text-on-surface-variant">{t("page.storyMaker.nle.binCastGroup")}</h3>
                        {doc.cast.length === 0 ? (
                            <p className="rounded-md3-md bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                {t("page.storyMaker.nle.binEmpty")}
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {doc.cast.map((member) => {
                                    const inUse = activeSceneCastKeys.has(member.key);
                                    const firstNodeId = castFirstNode.get(member.key);
                                    const payload: StoryDragPayload = { kind: "asset-cast", castKey: member.key };
                                    return (
                                        <div
                                            key={member.key}
                                            draggable
                                            title={t("page.storyMaker.v2.palette.dropTargetCastSlot")}
                                            onDragStart={event => startPayloadDrag(payload, event, onDragPayloadStart)}
                                            onDragEnd={() => onDragPayloadStart?.(null)}
                                            className={cn(
                                                "flex min-w-0 cursor-grab items-center gap-2 rounded-md3-md border px-2 py-1.5 active:cursor-grabbing",
                                                inUse
                                                    ? "border-primary/45 bg-primary-container/25"
                                                    : "border-outline-variant/60 bg-surface-container",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onQuickDrop(payload)}
                                                className="state-layer focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md3-sm p-0.5 text-left"
                                            >
                                                {member.characterId ? (
                                                    <img
                                                        src={getCharacterIconUrl(member.characterId)}
                                                        alt=""
                                                        draggable={false}
                                                        className="size-8 shrink-0 rounded-full bg-surface-container-highest object-cover"
                                                    />
                                                ) : (
                                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container type-label-m text-on-secondary-container">
                                                        {(member.name || "?").slice(0, 1)}
                                                    </span>
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="truncate type-label-l text-on-surface">
                                                            {member.name || member.key}
                                                        </span>
                                                        {inUse && (
                                                            <span className="shrink-0 rounded-md3-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                                {t("page.storyMaker.nle.assetInUse")}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="block truncate font-mono type-label-s text-on-surface-variant">
                                                        {member.modelId}
                                                    </span>
                                                </span>
                                            </button>
                                            {firstNodeId && (
                                                <IconButton
                                                    size="xs"
                                                    icon={mdMyLocation}
                                                    label={t("page.storyMaker.nle.jumpToUse")}
                                                    onClick={() => onSelectNode(firstNodeId)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Backgrounds used in Story */}
                    <section className="space-y-1.5">
                        <h3 className="type-label-m text-on-surface-variant">{t("page.storyMaker.nle.binBgGroup")}</h3>
                        {usedBackgrounds.length === 0 ? (
                            <p className="rounded-md3-md bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                {t("page.storyMaker.nle.binEmpty")}
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                                {usedBackgrounds.map(({ asset, firstNodeId }) => {
                                    const inUse = activeScene?.background.mode === "set" && activeScene.background.asset === asset;
                                    const payload: StoryDragPayload = { kind: "slot-bg", slot: { mode: "set", asset } };
                                    return (
                                        <div
                                            key={asset}
                                            draggable
                                            title={t("page.storyMaker.v2.palette.dropTargetBgSlot")}
                                            onDragStart={event => startPayloadDrag(payload, event, onDragPayloadStart)}
                                            onDragEnd={() => onDragPayloadStart?.(null)}
                                            className={cn(
                                                "group relative flex min-w-0 cursor-grab flex-col overflow-hidden rounded-md3-md border active:cursor-grabbing",
                                                inUse ? "border-primary ring-1 ring-primary" : "border-outline-variant/60 bg-surface-container",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onQuickDrop(payload)}
                                                className="state-layer focus-ring flex min-w-0 flex-col text-left"
                                            >
                                                <div className="relative aspect-video w-full overflow-hidden bg-surface-container-highest">
                                                    <img
                                                        src={storyBackgroundUrl(asset, doc.region, line)}
                                                        alt={asset}
                                                        crossOrigin="anonymous"
                                                        draggable={false}
                                                        className="size-full object-cover"
                                                    />
                                                    {inUse && (
                                                        <span className="absolute left-1 top-1 rounded-md3-full bg-primary px-1.5 py-0.5 type-label-s text-on-primary">
                                                            {t("page.storyMaker.nle.assetInUse")}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="flex items-center gap-1 px-2 py-1 type-label-s text-on-surface">
                                                    <Icon path={mdImage} size={13} className="shrink-0 text-on-surface-variant" />
                                                    <span className="min-w-0 flex-1 truncate font-mono">{asset}</span>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t("page.storyMaker.nle.jumpToUse")}
                                                title={t("page.storyMaker.nle.jumpToUse")}
                                                onClick={() => onSelectNode(firstNodeId)}
                                                className="focus-ring absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-surface-container-high/90 text-on-surface opacity-0 shadow-elev-1 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                            >
                                                <Icon path={mdMyLocation} size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Audio used in Story (BGM / SE / Voice) */}
                    <section className="space-y-1.5">
                        <h3 className="type-label-m text-on-surface-variant">{t("page.storyMaker.nle.binAudioGroup")}</h3>
                        {usedAudio.length === 0 ? (
                            <p className="rounded-md3-md bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                                {t("page.storyMaker.nle.binEmpty")}
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {usedAudio.map((entry) => {
                                    const inUse = entry.kind === "bgm"
                                        && activeScene?.bgm.mode === "play"
                                        && activeScene.bgm.name === entry.label;
                                    const icon = entry.kind === "bgm"
                                        ? mdMusicNote
                                        : entry.kind === "se"
                                            ? mdVolumeUp
                                            : mdRecordVoiceOver;
                                    return (
                                        <div
                                            key={entry.key}
                                            draggable
                                            title={entry.hint}
                                            onDragStart={event => startPayloadDrag(entry.payload, event, onDragPayloadStart)}
                                            onDragEnd={() => onDragPayloadStart?.(null)}
                                            className={cn(
                                                "flex min-w-0 cursor-grab items-center gap-1.5 rounded-md3-md border px-2 py-1.5 active:cursor-grabbing",
                                                inUse
                                                    ? "border-primary/45 bg-primary-container/25"
                                                    : "border-outline-variant/60 bg-surface-container",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onQuickDrop(entry.payload)}
                                                className="state-layer focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md3-sm p-0.5 text-left"
                                            >
                                                <Icon path={icon} size={16} className="shrink-0 text-primary" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="truncate font-mono type-label-m text-on-surface">{entry.label}</span>
                                                        {inUse && (
                                                            <span className="shrink-0 rounded-md3-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                                {t("page.storyMaker.nle.assetInUse")}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {entry.subtitle && (
                                                        <span className="block truncate type-label-s text-on-surface-variant">{entry.subtitle}</span>
                                                    )}
                                                </span>
                                            </button>
                                            <IconButton
                                                size="xs"
                                                icon={mdMyLocation}
                                                label={t("page.storyMaker.nle.jumpToUse")}
                                                onClick={() => onSelectNode(entry.firstNodeId)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            )}

            {activeTab === "variables" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <VariableManagerPanel
                        doc={doc}
                        onDocChange={onDocChange}
                        onQuickDrop={onQuickDrop}
                        onDragPayloadStart={onDragPayloadStart}
                    />
                </div>
            )}

            {activeTab === "cast" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <CastPanel
                        doc={doc}
                        list={resolvedModelList}
                        modelInfo={modelInfo}
                        onRetryList={onRetryModels ?? NOOP}
                        onAdd={member => onDocChange(prev => addCastMember(prev, member))}
                        onUpdate={(key, patch) => onDocChange(prev => updateCastMember(prev, key, patch))}
                        onRemove={key => onDocChange(prev => removeCastMember(prev, key))}
                        onPreviewCast={onPreviewCast}
                        onClearPreview={onClearPreview}
                        previewingCastId={previewingCastId}
                    />
                </div>
            )}
        </div>
    );
}
