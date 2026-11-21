"use client";
import { useEffect, useState } from "react";
import {
    Banner, Button, Dialog, Divider, Icon, IconButton, SegmentedButton, Select, Slider, Switch, TextField,
    type SelectOption,
} from "@/components/md3";
import {
    mdAdd, mdClose, mdDelete, mdImage, mdMusicNote, mdPlayArrowFill, mdVolumeUp,
} from "@/components/md3/icons";
import { Live2DBackgroundGrid } from "@/components/live2d/Live2DBackgroundGrid";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import { storyBackgroundUrl, storyBgmUrl, storySeUrl, storyVoiceUrl } from "@/lib/storyMaker/assets";
import { newStoryId, storyLabels } from "@/lib/storyMaker/document";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import {
    BACKGROUND_TRANSITIONS, BGM_ACTIONS, EFFECT_COLORS, STORY_EFFECTS, STORY_SLOTS, VOICE_KINDS,
    type BackgroundTransition, type StoryBgmAction, type StoryDocument, type StoryEffectColor, type StoryEffectKind,
    type StoryIssue, type StorySlot, type StoryStep, type StoryStepOf, type StoryVoiceKind,
} from "@/types/storyMaker";
import { AssetNamePickerDialog } from "./AssetNamePickerDialog";
import { ClipPickerField } from "./ClipPickerField";
import { STEP_ICONS, stepLabel } from "./stepMeta";
import { StoryIssueList } from "./StoryIssueList";
import { previewStorySound } from "./useStoryAudio";

interface StepInspectorProps {
    doc: StoryDocument;
    step: StoryStep | null;
    stepIndex: number;
    line: AssetLine;
    modelInfo: Record<string, Live2DActorInfo>;
    issues: readonly StoryIssue[];
    onChange: (next: StoryStep) => void;
    onPreviewEffect?: (step: StoryStepOf<"effect">) => void;
}

const TEXTAREA_CLS =
    "w-full rounded-md3-xs border border-outline bg-transparent px-3.5 py-2.5 type-body-l text-on-surface " +
    "placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none";

/** Inspector panel for editing every field of the currently selected story step. */
export function StepInspector({
    doc, step, stepIndex, line, modelInfo, issues, onChange, onPreviewEffect,
}: StepInspectorProps) {
    const { t } = useI18n();
    const [bgPickerOpen, setBgPickerOpen] = useState(false);
    const [assetPicker, setAssetPicker] = useState<"bgm" | "se" | null>(null);

    useEffect(() => () => previewStorySound(null), []);

    if (!step) {
        return (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 py-8 text-center">
                <p className="type-body-m text-on-surface-variant">{t("page.storyMaker.inspector.empty")}</p>
            </div>
        );
    }

    const castOptions: SelectOption<string>[] = doc.cast.map(member => ({
        value: member.key,
        label: member.name || member.modelId,
        textValue: `${member.name} ${member.modelId}`,
        leading: member.characterId ? (
            <img src={getCharacterIconUrl(member.characterId)} alt="" className="size-6 rounded-full bg-surface-container-highest object-cover" />
        ) : undefined,
    }));

    const talkCastOptions: SelectOption<string>[] = [
        { value: "", label: t("page.storyMaker.inspector.offStageSpeaker") },
        ...castOptions,
    ];

    const labels = storyLabels(doc);
    const labelOptions: SelectOption<string>[] = labels.map(label => ({
        value: label.id,
        label: label.name || label.id,
        trailing: <span className="font-mono type-label-s text-on-surface-variant">{label.id}</span>,
    }));

    const slotOptions = STORY_SLOTS.map(slot => ({
        value: slot,
        label: t(`page.storyMaker.slot.${slot}`),
    }));

    const actorInfoOf = (castKey: string | undefined): Live2DActorInfo | undefined => {
        if (!castKey) return undefined;
        const member = doc.cast.find(item => item.key === castKey);
        return member ? modelInfo[member.modelId] : undefined;
    };

    const patch = <T extends StoryStep>(current: T, partial: Partial<T>) => {
        onChange({ ...current, ...partial });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md3-sm bg-secondary-container text-on-secondary-container">
                    <Icon path={STEP_ICONS[step.op]} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate type-title-s text-on-surface">{stepLabel(t, step.op)}</p>
                    <p className="font-mono type-label-s text-on-surface-variant">
                        #{stepIndex + 1} · {step.id}
                    </p>
                </div>
            </div>

            {issues.length > 0 && (
                <Banner tone="error" title={t("page.storyMaker.inspector.stepIssuesTitle")}>
                    <StoryIssueList issues={issues} className="mt-1" />
                </Banner>
            )}

            <Divider />

            {step.op === "background" && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.backgroundImage")}</span>
                        <div className="overflow-hidden rounded-md3-md border border-outline-variant bg-surface-container-highest">
                            {step.name ? (
                                <img
                                    src={storyBackgroundUrl(step.name, doc.region, line)}
                                    alt=""
                                    className="aspect-video w-full object-cover"
                                />
                            ) : (
                                <div className="flex aspect-video items-center justify-center type-body-s text-on-surface-variant">
                                    {t("page.storyMaker.summary.noBackground")}
                                </div>
                            )}
                        </div>
                        <div className="flex items-start gap-2">
                            <TextField
                                label={t("page.storyMaker.inspector.assetName")}
                                value={step.name ?? ""}
                                maxLength={64}
                                placeholder={t("page.storyMaker.summary.noBackground")}
                                onChange={event => patch(step, { name: event.target.value.trim() || null })}
                                className="font-mono"
                                containerClassName="min-w-0 flex-1"
                            />
                            <Button
                                size="s"
                                variant="tonal"
                                icon={mdImage}
                                onClick={() => setBgPickerOpen(true)}
                                className="mt-1 shrink-0"
                            >
                                {t("page.storyMaker.inspector.pickBackground")}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.transition")}</span>
                        <SegmentedButton<BackgroundTransition>
                            density={-1}
                            value={step.transition}
                            onValueChange={transition => patch(step, { transition })}
                            options={BACKGROUND_TRANSITIONS.map(value => ({
                                value,
                                label: t(`page.storyMaker.transition.${value}`),
                            }))}
                            aria-label={t("page.storyMaker.inspector.transition")}
                        />
                    </div>

                    <Dialog
                        isOpen={bgPickerOpen}
                        onClose={() => setBgPickerOpen(false)}
                        title={t("page.storyMaker.inspector.pickBackground")}
                        size="lg"
                        fullscreenOnMobile
                    >
                        <Live2DBackgroundGrid
                            key={`${doc.region}|${line}`}
                            region={doc.region}
                            line={line}
                            current={step.name}
                            onSelect={(name) => {
                                patch(step, { name });
                                setBgPickerOpen(false);
                            }}
                        />
                    </Dialog>
                </div>
            )}

            {step.op === "place" && (
                <div className="space-y-3">
                    <TextField
                        label={t("page.storyMaker.inspector.placeText")}
                        value={step.text}
                        maxLength={STORY_LIMITS.place}
                        placeholder={t("page.storyMaker.inspector.placePlaceholder")}
                        supportingText={`${step.text.length}/${STORY_LIMITS.place} · ${t("page.storyMaker.inspector.placeHint")}`}
                        onChange={event => patch(step, { text: event.target.value })}
                    />
                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdClose}
                        disabled={step.text === ""}
                        onClick={() => patch(step, { text: "" })}
                    >
                        {t("page.storyMaker.inspector.placeClear")}
                    </Button>
                </div>
            )}

            {step.op === "appear" && (
                <div className="space-y-4">
                    <Select<string>
                        label={t("page.storyMaker.inspector.castMember")}
                        value={step.cast || null}
                        onValueChange={cast => patch(step, { cast })}
                        options={castOptions}
                        placeholder={t("page.storyMaker.inspector.selectCast")}
                        noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                    />
                    <div className="space-y-1.5">
                        <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.slot")}</span>
                        <SegmentedButton<StorySlot>
                            density={-1}
                            value={step.slot}
                            onValueChange={slot => patch(step, { slot })}
                            options={slotOptions}
                            aria-label={t("page.storyMaker.inspector.slot")}
                        />
                    </div>
                    <Switch
                        checked={step.fade}
                        onCheckedChange={fade => patch(step, { fade })}
                        label={t("page.storyMaker.inspector.fadeIn")}
                    />
                    <Switch
                        checked={step.mirror ?? false}
                        onCheckedChange={mirror => patch(step, { mirror })}
                        label={t("page.storyMaker.inspector.mirror")}
                    />
                    <ClipPickerField
                        kind="motion"
                        value={step.motion}
                        info={actorInfoOf(step.cast)}
                        disabled={!step.cast}
                        onChange={motion => patch(step, { motion })}
                    />
                    <ClipPickerField
                        kind="facial"
                        value={step.facial}
                        info={actorInfoOf(step.cast)}
                        disabled={!step.cast}
                        onChange={facial => patch(step, { facial })}
                    />
                </div>
            )}

            {step.op === "move" && (
                <div className="space-y-4">
                    <Select<string>
                        label={t("page.storyMaker.inspector.castMember")}
                        value={step.cast || null}
                        onValueChange={cast => patch(step, { cast })}
                        options={castOptions}
                        placeholder={t("page.storyMaker.inspector.selectCast")}
                        noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                    />
                    <div className="space-y-1.5">
                        <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.slot")}</span>
                        <SegmentedButton<StorySlot>
                            density={-1}
                            value={step.slot}
                            onValueChange={slot => patch(step, { slot })}
                            options={slotOptions}
                            aria-label={t("page.storyMaker.inspector.slot")}
                        />
                    </div>
                    <DurationSlider
                        label={t("page.storyMaker.inspector.duration")}
                        value={step.duration}
                        onChange={duration => patch(step, { duration })}
                    />
                </div>
            )}

            {step.op === "hide" && (
                <div className="space-y-4">
                    <Select<string>
                        label={t("page.storyMaker.inspector.castMember")}
                        value={step.cast || null}
                        onValueChange={cast => patch(step, { cast })}
                        options={castOptions}
                        placeholder={t("page.storyMaker.inspector.selectCast")}
                        noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                    />
                    <Switch
                        checked={step.fade}
                        onCheckedChange={fade => patch(step, { fade })}
                        label={t("page.storyMaker.inspector.fadeOut")}
                    />
                </div>
            )}

            {step.op === "pose" && (
                <div className="space-y-4">
                    <Select<string>
                        label={t("page.storyMaker.inspector.castMember")}
                        value={step.cast || null}
                        onValueChange={cast => patch(step, { cast })}
                        options={castOptions}
                        placeholder={t("page.storyMaker.inspector.selectCast")}
                        noOptionsLabel={t("page.storyMaker.inspector.noCastOptions")}
                    />
                    <ClipPickerField
                        kind="motion"
                        value={step.motion}
                        info={actorInfoOf(step.cast)}
                        disabled={!step.cast}
                        onChange={motion => patch(step, { motion })}
                    />
                    <ClipPickerField
                        kind="facial"
                        value={step.facial}
                        info={actorInfoOf(step.cast)}
                        disabled={!step.cast}
                        onChange={facial => patch(step, { facial })}
                    />
                </div>
            )}

            {step.op === "talk" && (
                <div className="space-y-4">
                    <Select<string>
                        label={t("page.storyMaker.inspector.speakerCast")}
                        value={step.cast ?? ""}
                        onValueChange={(value) => {
                            const next: StoryStepOf<"talk"> = { ...step };
                            if (value) next.cast = value;
                            else delete next.cast;
                            onChange(next);
                        }}
                        options={talkCastOptions}
                    />
                    <TextField
                        label={t("page.storyMaker.inspector.speakerName")}
                        value={step.name ?? ""}
                        maxLength={STORY_LIMITS.speakerName}
                        placeholder={step.cast ? (doc.cast.find(item => item.key === step.cast)?.name ?? "") : t("page.storyMaker.inspector.speakerNamePlaceholder")}
                        supportingText={step.cast ? t("page.storyMaker.inspector.speakerOverrideHint") : undefined}
                        onChange={(event) => {
                            const value = event.target.value;
                            const next: StoryStepOf<"talk"> = { ...step };
                            if (value) next.name = value;
                            else delete next.name;
                            onChange(next);
                        }}
                    />
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label htmlFor={`story-talk-${step.id}`} className="type-label-l text-on-surface-variant">
                                {t("page.storyMaker.inspector.body")}
                            </label>
                            <span className="font-mono type-label-s text-on-surface-variant">
                                {step.body.length}/{STORY_LIMITS.body}
                            </span>
                        </div>
                        <textarea
                            id={`story-talk-${step.id}`}
                            rows={4}
                            maxLength={STORY_LIMITS.body}
                            value={step.body}
                            placeholder={t("page.storyMaker.inspector.bodyPlaceholder")}
                            onChange={event => patch(step, { body: event.target.value })}
                            className={TEXTAREA_CLS}
                        />
                    </div>
                    <Switch
                        checked={step.lipSync}
                        onCheckedChange={lipSync => patch(step, { lipSync })}
                        label={t("page.storyMaker.inspector.lipSync")}
                    />
                    {step.cast && (
                        <>
                            <ClipPickerField
                                kind="motion"
                                value={step.motion}
                                info={actorInfoOf(step.cast)}
                                onChange={motion => patch(step, { motion })}
                            />
                            <ClipPickerField
                                kind="facial"
                                value={step.facial}
                                info={actorInfoOf(step.cast)}
                                onChange={facial => patch(step, { facial })}
                            />
                        </>
                    )}
                    <Divider />
                    <div className="space-y-3">
                        <Switch
                            checked={Boolean(step.voice)}
                            onCheckedChange={(enabled) => {
                                const next: StoryStepOf<"talk"> = { ...step };
                                if (enabled) next.voice = { kind: "story", scenarioId: "", voiceId: "" };
                                else delete next.voice;
                                onChange(next);
                            }}
                            label={t("page.storyMaker.inspector.voiceRef")}
                            description={t("page.storyMaker.inspector.voiceRefHint")}
                        />
                        {step.voice && (
                            <div className="space-y-3 rounded-md3-md bg-surface-container p-3">
                                <SegmentedButton<StoryVoiceKind>
                                    density={-2}
                                    value={step.voice.kind}
                                    onValueChange={kind => patch(step, { voice: { ...step.voice!, kind } })}
                                    options={VOICE_KINDS.map(kind => ({
                                        value: kind,
                                        label: t(`page.storyMaker.voiceKind.${kind}`),
                                    }))}
                                    aria-label={t("page.storyMaker.inspector.voiceKind")}
                                />
                                <TextField
                                    label={t("page.storyMaker.inspector.scenarioId")}
                                    value={step.voice.scenarioId}
                                    maxLength={64}
                                    className="font-mono"
                                    onChange={event => patch(step, { voice: { ...step.voice!, scenarioId: event.target.value.trim() } })}
                                />
                                <TextField
                                    label={t("page.storyMaker.inspector.voiceId")}
                                    value={step.voice.voiceId}
                                    maxLength={64}
                                    className="font-mono"
                                    onChange={event => patch(step, { voice: { ...step.voice!, voiceId: event.target.value.trim() } })}
                                />
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    icon={mdPlayArrowFill}
                                    disabled={!step.voice.scenarioId || !step.voice.voiceId}
                                    onClick={() => step.voice && previewStorySound(storyVoiceUrl(step.voice, doc.region, line))}
                                >
                                    {t("page.storyMaker.inspector.previewAudio")}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {step.op === "narration" && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label htmlFor={`story-narration-${step.id}`} className="type-label-l text-on-surface-variant">
                            {t("page.storyMaker.inspector.narrationText")}
                        </label>
                        <span className="font-mono type-label-s text-on-surface-variant">
                            {step.body.length}/{STORY_LIMITS.body}
                        </span>
                    </div>
                    <textarea
                        id={`story-narration-${step.id}`}
                        rows={5}
                        maxLength={STORY_LIMITS.body}
                        value={step.body}
                        placeholder={t("page.storyMaker.inspector.narrationPlaceholder")}
                        onChange={event => patch(step, { body: event.target.value })}
                        className={TEXTAREA_CLS}
                    />
                </div>
            )}

            {step.op === "telop" && (
                <TextField
                    label={t("page.storyMaker.inspector.telopText")}
                    value={step.body}
                    maxLength={STORY_LIMITS.telop}
                    placeholder={t("page.storyMaker.inspector.telopPlaceholder")}
                    supportingText={`${step.body.length}/${STORY_LIMITS.telop} · ${t("page.storyMaker.inspector.telopHint")}`}
                    onChange={event => patch(step, { body: event.target.value })}
                />
            )}

            {step.op === "effect" && (
                <div className="space-y-4">
                    <Select<StoryEffectKind>
                        label={t("page.storyMaker.inspector.effectKind")}
                        value={step.effect}
                        onValueChange={(effect) => {
                            const needsColor = effect === "fadeIn" || effect === "fadeOut" || effect === "flash";
                            const next: StoryStepOf<"effect"> = {
                                ...step,
                                effect,
                                ...(needsColor ? { color: step.color ?? (effect === "flash" ? "white" : "black") } : {}),
                            };
                            if (!needsColor) delete next.color;
                            onChange(next);
                        }}
                        options={STORY_EFFECTS.map(effect => ({
                            value: effect,
                            label: t(`page.storyMaker.effect.${effect}`),
                        }))}
                    />
                    {(step.effect === "fadeIn" || step.effect === "fadeOut" || step.effect === "flash") && (
                        <div className="space-y-1.5">
                            <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.effectColor")}</span>
                            <SegmentedButton<StoryEffectColor>
                                density={-1}
                                value={step.color ?? "black"}
                                onValueChange={color => patch(step, { color })}
                                options={EFFECT_COLORS.map(color => ({
                                    value: color,
                                    label: t(`page.storyMaker.color.${color}`),
                                }))}
                                aria-label={t("page.storyMaker.inspector.effectColor")}
                            />
                        </div>
                    )}
                    <DurationSlider
                        label={t("page.storyMaker.inspector.duration")}
                        value={step.duration}
                        onChange={duration => patch(step, { duration })}
                    />
                    {onPreviewEffect && (step.effect === "flash" || step.effect === "shake") && (
                        <Button size="s" variant="tonal" icon={mdPlayArrowFill} onClick={() => onPreviewEffect(step)}>
                            {t("page.storyMaker.inspector.previewEffect")}
                        </Button>
                    )}
                </div>
            )}

            {step.op === "bgm" && (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <span className="block type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.bgmAction")}</span>
                        <SegmentedButton<StoryBgmAction>
                            density={-1}
                            value={step.action}
                            onValueChange={(action) => {
                                const next: StoryStepOf<"bgm"> = { id: step.id, op: "bgm", action };
                                if (action === "play") {
                                    next.name = step.name ?? "";
                                    next.volume = step.volume ?? 1;
                                } else if (action === "volume") {
                                    next.volume = step.volume ?? 0.5;
                                }
                                onChange(next);
                            }}
                            options={BGM_ACTIONS.map(action => ({
                                value: action,
                                label: t(`page.storyMaker.bgmAction.${action}`),
                            }))}
                            aria-label={t("page.storyMaker.inspector.bgmAction")}
                        />
                    </div>
                    {step.action === "play" && (
                        <div className="flex items-start gap-2">
                            <TextField
                                label={t("page.storyMaker.inspector.bgmName")}
                                value={step.name ?? ""}
                                maxLength={64}
                                placeholder="bgm00001"
                                onChange={event => patch(step, { name: event.target.value.trim() })}
                                className="font-mono"
                                containerClassName="min-w-0 flex-1"
                            />
                            <Button
                                size="s"
                                variant="tonal"
                                icon={mdMusicNote}
                                onClick={() => setAssetPicker("bgm")}
                                className="mt-1 shrink-0"
                            >
                                {t("page.storyMaker.inspector.browse")}
                            </Button>
                            <IconButton
                                size="s"
                                icon={mdPlayArrowFill}
                                label={t("page.storyMaker.inspector.previewAudio")}
                                disabled={!step.name}
                                onClick={() => step.name && previewStorySound(storyBgmUrl(step.name, doc.region, line))}
                                className="mt-1 shrink-0"
                            />
                        </div>
                    )}
                    {(step.action === "play" || step.action === "volume") && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="type-label-l text-on-surface-variant">{t("page.storyMaker.inspector.volume")}</span>
                                <span className="font-mono type-label-m text-on-surface">{Math.round((step.volume ?? 1) * 100)}%</span>
                            </div>
                            <Slider
                                min={0}
                                max={1}
                                step={0.05}
                                value={step.volume ?? 1}
                                onValueChange={volume => patch(step, { volume: Number(volume.toFixed(2)) })}
                                aria-label={t("page.storyMaker.inspector.volume")}
                                formatValue={val => `${Math.round(val * 100)}%`}
                            />
                        </div>
                    )}
                </div>
            )}

            {step.op === "se" && (
                <div className="flex items-start gap-2">
                    <TextField
                        label={t("page.storyMaker.inspector.seName")}
                        value={step.name}
                        maxLength={64}
                        placeholder="se00001_b"
                        onChange={event => patch(step, { name: event.target.value.trim() })}
                        className="font-mono"
                        containerClassName="min-w-0 flex-1"
                    />
                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdVolumeUp}
                        onClick={() => setAssetPicker("se")}
                        className="mt-1 shrink-0"
                    >
                        {t("page.storyMaker.inspector.browse")}
                    </Button>
                    <IconButton
                        size="s"
                        icon={mdPlayArrowFill}
                        label={t("page.storyMaker.inspector.previewAudio")}
                        disabled={!step.name}
                        onClick={() => step.name && previewStorySound(storySeUrl(step.name, doc.region, line))}
                        className="mt-1 shrink-0"
                    />
                </div>
            )}

            {step.op === "choice" && (
                <div className="space-y-3">
                    {labels.length === 0 && (
                        <Banner tone="info">{t("page.storyMaker.inspector.noLabelsHint")}</Banner>
                    )}
                    {step.options.map((option, idx) => (
                        <div key={option.id} className="space-y-2 rounded-md3-md bg-surface-container p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="type-label-l text-on-surface-variant">
                                    {t("page.storyMaker.inspector.choiceOption", { number: idx + 1 })}
                                </span>
                                <IconButton
                                    size="xs"
                                    icon={mdDelete}
                                    label={t("page.storyMaker.inspector.removeOption")}
                                    disabled={step.options.length <= STORY_LIMITS.choiceOptions.min}
                                    onClick={() => patch(step, {
                                        options: step.options.filter(item => item.id !== option.id),
                                    })}
                                />
                            </div>
                            <TextField
                                label={t("page.storyMaker.inspector.choiceText")}
                                value={option.text}
                                maxLength={STORY_LIMITS.choiceText}
                                onChange={event => patch(step, {
                                    options: step.options.map(item => (item.id === option.id ? { ...item, text: event.target.value } : item)),
                                })}
                            />
                            <Select<string>
                                label={t("page.storyMaker.inspector.jumpTarget")}
                                value={option.target || null}
                                onValueChange={target => patch(step, {
                                    options: step.options.map(item => (item.id === option.id ? { ...item, target } : item)),
                                })}
                                options={labelOptions}
                                placeholder={t("page.storyMaker.inspector.selectLabel")}
                                noOptionsLabel={t("page.storyMaker.inspector.noLabelsHint")}
                            />
                        </div>
                    ))}
                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdAdd}
                        disabled={step.options.length >= STORY_LIMITS.choiceOptions.max}
                        onClick={() => patch(step, {
                            options: [
                                ...step.options,
                                {
                                    id: newStoryId(step.options.map(item => item.id)),
                                    text: "",
                                    target: labels[0]?.id ?? "",
                                },
                            ],
                        })}
                    >
                        {t("page.storyMaker.inspector.addOption")}
                    </Button>
                </div>
            )}

            {step.op === "label" && (
                <div className="space-y-3">
                    <TextField
                        label={t("page.storyMaker.inspector.labelName")}
                        value={step.name}
                        maxLength={STORY_LIMITS.labelName}
                        placeholder={t("page.storyMaker.inspector.labelNamePlaceholder")}
                        supportingText={t("page.storyMaker.inspector.labelHint", { id: step.id })}
                        onChange={event => patch(step, { name: event.target.value })}
                    />
                </div>
            )}

            {step.op === "jump" && (
                <div className="space-y-3">
                    {labels.length === 0 && (
                        <Banner tone="info">{t("page.storyMaker.inspector.noLabelsHint")}</Banner>
                    )}
                    <Select<string>
                        label={t("page.storyMaker.inspector.jumpTarget")}
                        value={step.target || null}
                        onValueChange={target => patch(step, { target })}
                        options={labelOptions}
                        placeholder={t("page.storyMaker.inspector.selectLabel")}
                        noOptionsLabel={t("page.storyMaker.inspector.noLabelsHint")}
                    />
                </div>
            )}

            {assetPicker && (
                <AssetNamePickerDialog
                    isOpen
                    onClose={() => setAssetPicker(null)}
                    kind={assetPicker}
                    region={doc.region}
                    line={line}
                    current={assetPicker === "bgm" && step.op === "bgm" ? step.name ?? "" : assetPicker === "se" && step.op === "se" ? step.name : ""}
                    onSelect={(name) => {
                        if (assetPicker === "bgm" && step.op === "bgm") patch(step, { name });
                        if (assetPicker === "se" && step.op === "se") patch(step, { name });
                    }}
                />
            )}
        </div>
    );
}

function DurationSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="type-label-l text-on-surface-variant">{label}</span>
                <span className="font-mono type-label-m text-on-surface">{value.toFixed(1)}s</span>
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
