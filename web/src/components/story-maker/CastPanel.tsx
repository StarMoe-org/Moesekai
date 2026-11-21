"use client";
import { useMemo, useState } from "react";
import { Button, Dialog, ErrorState, IconButton, LoadingState, TextField, cn } from "@/components/md3";
import { mdClose, mdDelete, mdEdit, mdPersonAdd, mdPlayArrow } from "@/components/md3/icons";
import { Live2DModelPicker } from "@/components/live2d/Live2DModelPicker";
import { live2dCostumeLabel, live2dGroupKey, live2dOwnerName } from "@/components/live2d/labels";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { live2dSources } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import { castUsage } from "@/lib/storyMaker/document";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import type { StoryCastMember, StoryDocument } from "@/types/storyMaker";
import { ClipPickerField } from "./ClipPickerField";
import type { StoryModelList } from "./useStoryModels";

interface CastModelDialogProps {
    isOpen: boolean;
    onClose: () => void;
    list: StoryModelList;
    onRetry: () => void;
    current: Live2DModel | null;
    onSelect: (model: Live2DModel) => void;
}

/** Choosing a model of the server's story library for a cast member. */
export function CastModelDialog({ isOpen, onClose, list, onRetry, current, onSelect }: CastModelDialogProps) {
    const { t } = useI18n();
    const [group, setGroup] = useState(() => (current ? live2dGroupKey(current) : "character:1"));
    return (
        <Dialog isOpen={isOpen} onClose={onClose} title={t("page.storyMaker.cast.pickModel")} size="lg" fullscreenOnMobile>
            {list.status === "loading" ? (
                <LoadingState label={t("page.live2d.listLoading")} />
            ) : list.status === "error" ? (
                <ErrorState title={t("page.live2d.listFailed")} message={list.message} retryLabel={t("common.action.retry")} onRetry={onRetry} />
            ) : list.models.length === 0 ? (
                <p className="py-6 text-center type-body-m text-on-surface-variant">{t("page.live2d.listEmptyDescription")}</p>
            ) : (
                <Live2DModelPicker models={list.models} current={current} group={group} onGroupChange={setGroup} onSelect={onSelect} />
            )}
        </Dialog>
    );
}

export interface CastPanelProps {
    doc: StoryDocument;
    list: StoryModelList;
    modelInfo?: Record<string, Live2DActorInfo>;
    onRetryList: () => void;
    onAdd: (member: Omit<StoryCastMember, "key">) => void;
    onUpdate: (key: string, patch: Partial<Omit<StoryCastMember, "key">>) => void;
    onRemove: (key: string) => void;
    onPreviewCast?: (cast: StoryCastMember, clip?: { motion?: string; facial?: string }) => void;
    onClearPreview?: () => void;
    previewingCastId?: string | null;
}

interface CastPreviewDraft {
    motion?: string;
    facial?: string;
}

/** The story's cast: up to eight models, each with editable display name and live L2D action preview. */
export function CastPanel({
    doc,
    list,
    modelInfo,
    onRetryList,
    onAdd,
    onUpdate,
    onRemove,
    onPreviewCast,
    onClearPreview,
    previewingCastId,
}: CastPanelProps) {
    const { t } = useI18n();
    const [picking, setPicking] = useState<{ key: string | null } | null>(null);
    const [removing, setRemoving] = useState<StoryCastMember | null>(null);
    const [localPreviewKey, setLocalPreviewKey] = useState<string | null>(null);
    const [prevExternalPreviewId, setPrevExternalPreviewId] = useState<string | null | undefined>(previewingCastId);
    const [previewDrafts, setPreviewDrafts] = useState<Record<string, CastPreviewDraft>>({});

    if (previewingCastId !== prevExternalPreviewId) {
        setPrevExternalPreviewId(previewingCastId);
        if (previewingCastId !== undefined) {
            setLocalPreviewKey(previewingCastId);
        }
    }

    const activePreviewKey = localPreviewKey;
    const library = useMemo(() => live2dSources(doc.region).library, [doc.region]);
    const models = list.status === "ready" ? list.models : [];
    const modelOf = (member: StoryCastMember) => models.find(model => model.id === member.modelId) ?? null;
    const full = doc.cast.length >= STORY_LIMITS.cast;

    const choose = (model: Live2DModel) => {
        const name = live2dOwnerName(t, model);
        const patch = { modelId: model.id, ...(model.characterId ? { characterId: model.characterId } : { characterId: undefined }) };
        if (picking?.key) {
            const editedKey = picking.key;
            onUpdate(editedKey, patch);
            setPreviewDrafts((prev) => {
                if (!(editedKey in prev)) return prev;
                const next = { ...prev };
                delete next[editedKey];
                return next;
            });
            if (activePreviewKey === editedKey) {
                setLocalPreviewKey(null);
                onClearPreview?.();
            }
        } else {
            onAdd({ ...patch, name });
        }
        setPicking(null);
    };

    const toggleCastPreview = (member: StoryCastMember) => {
        if (!onPreviewCast) return;
        if (activePreviewKey === member.key) {
            setLocalPreviewKey(null);
            onClearPreview?.();
            return;
        }
        setLocalPreviewKey(member.key);
        const draft = previewDrafts[member.key];
        onPreviewCast(member, draft && (draft.motion || draft.facial) ? draft : undefined);
    };

    const exitCastPreview = () => {
        setLocalPreviewKey(null);
        onClearPreview?.();
    };

    const updatePreviewDraft = (castKey: string, partial: Partial<CastPreviewDraft>) => {
        setPreviewDrafts(prev => ({
            ...prev,
            [castKey]: { ...prev[castKey], ...partial },
        }));
    };

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 type-title-s text-on-surface">
                    {t("page.storyMaker.cast.title")}
                    <span className="ml-2 type-label-m text-on-surface-variant">{doc.cast.length}/{STORY_LIMITS.cast}</span>
                </p>
                <Button size="s" variant="tonal" icon={mdPersonAdd} disabled={full} onClick={() => setPicking({ key: null })}>
                    {t("page.storyMaker.cast.add")}
                </Button>
            </div>
            {doc.cast.length === 0 && <p className="type-body-m text-on-surface-variant">{t("page.storyMaker.cast.empty")}</p>}
            <ul className="space-y-2">
                {doc.cast.map(member => {
                    const model = modelOf(member);
                    const isPreviewOpen = activePreviewKey === member.key;
                    const draft = previewDrafts[member.key] ?? {};
                    const displayName = member.name || member.modelId;
                    return (
                        <li
                            key={member.key}
                            className={cn(
                                "min-w-0 space-y-2 rounded-md3-md border px-2.5 py-2 transition-colors sm:px-3",
                                isPreviewOpen
                                    ? "border-primary/60 bg-secondary-container/30"
                                    : "border-transparent bg-surface-container",
                            )}
                        >
                            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                                {member.characterId ? (
                                    <img src={getCharacterIconUrl(member.characterId)} alt="" className="mt-1 size-10 shrink-0 rounded-full bg-surface-container-highest object-cover" />
                                ) : (
                                    <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary-container type-title-s text-on-secondary-container">
                                        {(member.name || "?").slice(0, 1)}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1 space-y-1">
                                    <TextField
                                        value={member.name}
                                        maxLength={STORY_LIMITS.castName}
                                        onChange={event => onUpdate(member.key, { name: event.target.value })}
                                        aria-label={t("page.storyMaker.cast.name")}
                                        placeholder={t("page.storyMaker.cast.name")}
                                    />
                                    <p className="truncate type-label-s text-on-surface-variant">
                                        {model ? `${live2dCostumeLabel(t, model)} · ` : ""}
                                        <span className="font-mono">{member.modelId}</span>
                                    </p>
                                    {list.status === "ready" && !model && (
                                        <p className="type-label-s text-error">{t("page.storyMaker.cast.modelMissing")}</p>
                                    )}
                                    {onPreviewCast && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                            <Button
                                                size="xs"
                                                variant={isPreviewOpen ? "filled" : "tonal"}
                                                icon={isPreviewOpen ? mdClose : mdPlayArrow}
                                                disabled={list.status === "ready" && !model}
                                                onClick={() => toggleCastPreview(member)}
                                            >
                                                {t(isPreviewOpen ? "page.storyMaker.nle.exitPreview" : "page.storyMaker.nle.previewModel")}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-col">
                                    <IconButton size="xs" icon={mdEdit} label={t("page.storyMaker.cast.changeModel")} onClick={() => setPicking({ key: member.key })} />
                                    <IconButton size="xs" icon={mdDelete} label={t("page.storyMaker.cast.remove")} onClick={() => setRemoving(member)} />
                                </div>
                            </div>

                            {onPreviewCast && isPreviewOpen && (
                                <div className="min-w-0 space-y-2.5 rounded-md3-sm border border-outline-variant/70 bg-surface-container-low p-2.5">
                                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <span className="min-w-0 truncate type-label-m text-primary">
                                            {t("page.storyMaker.nle.previewingModel", { name: displayName })}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {(draft.motion || draft.facial) && (
                                                <Button
                                                    size="xs"
                                                    variant="tonal"
                                                    icon={mdPlayArrow}
                                                    onClick={() => onPreviewCast(member, draft)}
                                                >
                                                    {t("page.storyMaker.nle.replayAction")}
                                                </Button>
                                            )}
                                            <Button
                                                size="xs"
                                                variant="text"
                                                icon={mdClose}
                                                onClick={exitCastPreview}
                                            >
                                                {t("page.storyMaker.nle.exitPreview")}
                                            </Button>
                                        </div>
                                    </div>
                                    <ClipPickerField
                                        kind="motion"
                                        value={draft.motion}
                                        info={modelInfo?.[member.modelId]}
                                        library={library}
                                        motionBundle={model?.motions[0] ?? null}
                                        onChange={(motion) => updatePreviewDraft(member.key, { motion })}
                                        onPreviewClip={(motion) => onPreviewCast(member, { motion })}
                                    />
                                    <ClipPickerField
                                        kind="facial"
                                        value={draft.facial}
                                        info={modelInfo?.[member.modelId]}
                                        library={library}
                                        motionBundle={model?.motions[0] ?? null}
                                        onChange={(facial) => updatePreviewDraft(member.key, { facial })}
                                        onPreviewClip={(facial) => onPreviewCast(member, { facial })}
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            {picking && (() => {
                const target = picking.key ? doc.cast.find(member => member.key === picking.key) : undefined;
                return (
                    <CastModelDialog
                        isOpen
                        onClose={() => setPicking(null)}
                        list={list}
                        onRetry={onRetryList}
                        current={target ? modelOf(target) : null}
                        onSelect={choose}
                    />
                );
            })()}
            <Dialog
                isOpen={removing !== null}
                onClose={() => setRemoving(null)}
                title={t("page.storyMaker.cast.removeTitle")}
                size="sm"
                actions={(
                    <>
                        <Button variant="text" onClick={() => setRemoving(null)}>{t("common.action.cancel")}</Button>
                        <Button
                            variant="filled"
                            color="error"
                            onClick={() => {
                                if (removing) {
                                    if (activePreviewKey === removing.key) {
                                        setLocalPreviewKey(null);
                                        onClearPreview?.();
                                    }
                                    onRemove(removing.key);
                                }
                                setRemoving(null);
                            }}
                        >
                            {t("page.storyMaker.cast.remove")}
                        </Button>
                    </>
                )}
            >
                <p className="break-words type-body-m text-on-surface-variant">
                    {removing && t("page.storyMaker.cast.removeDescription", { name: removing.name || removing.modelId, count: castUsage(doc, removing.key) })}
                </p>
            </Dialog>
        </div>
    );
}
