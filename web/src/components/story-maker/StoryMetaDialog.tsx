"use client";
import { useState } from "react";
import { Button, Dialog, Select, TextField } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { updateStoryMeta } from "@/lib/storyMaker/document";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import { STORY_REGIONS, type StoryDocument, type StoryRegion } from "@/types/storyMaker";

export interface StoryMetaValues {
    title: string;
    author: string;
    summary: string;
    region: StoryRegion;
}

/** Extracts editable metadata & region values from a `moesekai-story/2` document. */
export function metaValuesFromDoc(doc: StoryDocument): StoryMetaValues {
    return {
        title: doc.meta.title,
        author: doc.meta.author,
        summary: doc.meta.summary,
        region: doc.region,
    };
}

/** Purely applies metadata & server region updates onto a `moesekai-story/2` document. */
export function applyMetaValuesToDoc(doc: StoryDocument, values: StoryMetaValues): StoryDocument {
    const withMeta = updateStoryMeta(doc, {
        title: values.title,
        author: values.author,
        summary: values.summary,
    });
    return withMeta.region === values.region ? withMeta : { ...withMeta, region: values.region };
}

export interface StoryMetaDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    confirmLabel: string;
    initial: StoryMetaValues;
    showRegionHint?: boolean;
    onSubmit: (values: StoryMetaValues) => void;
}

/** Dialog for creating a new v2 story draft or editing an existing story's `meta` & `region`. */
export function StoryMetaDialog({
    isOpen, onClose, title, confirmLabel, initial, showRegionHint, onSubmit,
}: StoryMetaDialogProps) {
    const { t } = useI18n();
    const [draft, setDraft] = useState<StoryMetaValues>(initial);
    const [prevOpen, setPrevOpen] = useState(isOpen);

    if (isOpen !== prevOpen) {
        setPrevOpen(isOpen);
        if (isOpen) {
            setDraft(initial);
        }
    }

    const submit = () => {
        onSubmit({
            title: draft.title.trim().slice(0, STORY_LIMITS.title),
            author: draft.author.trim().slice(0, STORY_LIMITS.author),
            summary: draft.summary.trim().slice(0, STORY_LIMITS.summary),
            region: draft.region,
        });
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="md"
            actions={(
                <>
                    <Button variant="text" onClick={onClose}>{t("common.action.cancel")}</Button>
                    <Button variant="filled" onClick={submit}>{confirmLabel}</Button>
                </>
            )}
        >
            <div className="space-y-4">
                <TextField
                    label={t("page.storyMaker.meta.title")}
                    value={draft.title}
                    maxLength={STORY_LIMITS.title}
                    placeholder={t("page.storyMaker.meta.titlePlaceholder")}
                    onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))}
                />
                <Select<StoryRegion>
                    label={t("page.storyMaker.meta.region")}
                    value={draft.region}
                    onValueChange={region => setDraft(previous => ({ ...previous, region }))}
                    options={STORY_REGIONS.map(region => ({
                        value: region,
                        label: t(SERVER_LABEL_KEYS[region]),
                    }))}
                    supportingText={showRegionHint ? t("page.storyMaker.meta.regionChangeHint") : t("page.storyMaker.meta.regionHint")}
                />
                <TextField
                    label={t("page.storyMaker.meta.author")}
                    value={draft.author}
                    maxLength={STORY_LIMITS.author}
                    placeholder={t("page.storyMaker.meta.authorPlaceholder")}
                    onChange={event => setDraft(previous => ({ ...previous, author: event.target.value }))}
                />
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label htmlFor="story-meta-summary" className="type-label-l text-on-surface-variant">
                            {t("page.storyMaker.meta.summary")}
                        </label>
                        <span className="font-mono type-label-s text-on-surface-variant">
                            {draft.summary.length}/{STORY_LIMITS.summary}
                        </span>
                    </div>
                    <textarea
                        id="story-meta-summary"
                        rows={3}
                        maxLength={STORY_LIMITS.summary}
                        value={draft.summary}
                        placeholder={t("page.storyMaker.meta.summaryPlaceholder")}
                        onChange={event => setDraft(previous => ({ ...previous, summary: event.target.value }))}
                        className="w-full rounded-md3-xs border border-outline bg-transparent px-3.5 py-2.5 type-body-l text-on-surface placeholder:text-on-surface-variant focus:border-2 focus:border-primary focus:outline-none"
                    />
                </div>
            </div>
        </Dialog>
    );
}
