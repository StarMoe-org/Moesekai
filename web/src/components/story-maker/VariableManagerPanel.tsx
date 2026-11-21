"use client";
import React, { useMemo, useState } from "react";
import { Button, Dialog, Icon, IconButton, Switch, TextField, cn } from "@/components/md3";
import {
    mdAdd, mdDelete, mdDragIndicator, mdNumbers, mdTag, mdWarning,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import {
    STORY_DRAG_MIME, addVariable, removeVariable, updateVariable, variableUsage,
    type StoryDragPayload,
} from "@/lib/storyMaker/document";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import type { StoryDocument, StoryVariable } from "@/types/storyMaker";

export interface VariableManagerPanelProps {
    doc: StoryDocument;
    onDocChange: (updater: (prev: StoryDocument) => StoryDocument) => void;
    onQuickDrop?: (payload: StoryDragPayload) => void;
    onDragPayloadStart?: (payload: StoryDragPayload | null) => void;
    className?: string;
}

interface NumberInitialFieldProps {
    label: string;
    value: number;
    onFocus: () => void;
    onBlur: () => void;
    onCommit: (next: number) => void;
}

function NumberInitialField({ label, value, onFocus, onBlur, onCommit }: NumberInitialFieldProps) {
    const [draft, setDraft] = useState<string>(String(value));
    const [prevValue, setPrevValue] = useState<number>(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setDraft(String(value));
    }
    return (
        <TextField
            type="number"
            label={label}
            value={draft}
            min={STORY_LIMITS.varNumberMin}
            max={STORY_LIMITS.varNumberMax}
            onFocus={onFocus}
            onBlur={() => {
                onBlur();
                const parsed = Number(draft.trim());
                if (draft.trim() === "" || !Number.isFinite(parsed)) {
                    setDraft(String(value));
                } else {
                    const clamped = Math.min(STORY_LIMITS.varNumberMax, Math.max(STORY_LIMITS.varNumberMin, parsed));
                    setDraft(String(clamped));
                    if (clamped !== value) onCommit(clamped);
                }
            }}
            onValueChange={(raw) => {
                setDraft(raw);
                if (raw.trim() === "" || raw.trim() === "-") return;
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                onCommit(parsed);
            }}
        />
    );
}

/** Low-code counter (number) & flag (boolean) variable manager; each variable card is draggable onto Scene beat tracks. */
export function VariableManagerPanel({
    doc,
    onDocChange,
    onQuickDrop,
    onDragPayloadStart,
    className,
}: VariableManagerPanelProps): React.JSX.Element {
    const { t } = useI18n();
    const [focusedVarId, setFocusedVarId] = useState<string | null>(null);
    const [removingVar, setRemovingVar] = useState<StoryVariable | null>(null);

    const usageMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const variable of doc.variables) {
            map.set(variable.id, variableUsage(doc, variable.id));
        }
        return map;
    }, [doc]);

    const full = doc.variables.length >= STORY_LIMITS.variables;

    const handleAddNumber = () => {
        onDocChange(prev => addVariable(prev, { type: "number", name: "", initial: 0 }).doc);
    };

    const handleAddBoolean = () => {
        onDocChange(prev => addVariable(prev, { type: "boolean", name: "", initial: false }).doc);
    };

    const handleRequestDelete = (variable: StoryVariable) => {
        const usage = usageMap.get(variable.id) ?? 0;
        if (usage > 0) {
            setRemovingVar(variable);
        } else {
            onDocChange(prev => removeVariable(prev, variable.id));
        }
    };

    const handleDragStart = (variable: StoryVariable, event: React.DragEvent<HTMLLIElement>) => {
        const payload: StoryDragPayload = { kind: "var-op", varId: variable.id };
        onDragPayloadStart?.(payload);
        event.dataTransfer.setData(STORY_DRAG_MIME, JSON.stringify(payload));
        event.dataTransfer.setData("text/plain", variable.name || variable.id);
        event.dataTransfer.effectAllowed = "copy";
    };

    const handleDragEnd = () => {
        onDragPayloadStart?.(null);
    };

    return (
        <div className={cn("min-w-0 space-y-3", className)}>
            <div className="space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate type-title-s text-on-surface">
                        {t("page.storyMaker.v2.variables.sectionTitle")}
                    </p>
                    <span className="shrink-0 rounded-md3-full bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-on-surface-variant">
                        {doc.variables.length}/{STORY_LIMITS.variables}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        size="xs"
                        variant="tonal"
                        icon={mdNumbers}
                        disabled={full}
                        onClick={handleAddNumber}
                    >
                        {t("page.storyMaker.v2.variables.addNumber")}
                    </Button>
                    <Button
                        size="xs"
                        variant="tonal"
                        color="tertiary"
                        icon={mdTag}
                        disabled={full}
                        onClick={handleAddBoolean}
                    >
                        {t("page.storyMaker.v2.variables.addBoolean")}
                    </Button>
                </div>
            </div>

            {doc.variables.length === 0 ? (
                <div className="rounded-md3-md border border-outline-variant/60 bg-surface-container px-3 py-3 type-body-s text-on-surface-variant">
                    {t("page.storyMaker.v2.variables.empty")}
                </div>
            ) : (
                <ul className="space-y-2">
                    {doc.variables.map((variable) => {
                        const usage = usageMap.get(variable.id) ?? 0;
                        const isFocused = focusedVarId === variable.id;
                        const payload: StoryDragPayload = { kind: "var-op", varId: variable.id };
                        const templateToken = `{{${variable.name || variable.id}}}`;

                        return (
                            <li
                                key={variable.id}
                                draggable={!isFocused}
                                title={t("page.storyMaker.v2.palette.dropTargetBeatTrack")}
                                onDragStart={event => handleDragStart(variable, event)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "min-w-0 space-y-2 rounded-md3-md border border-outline-variant/65 bg-surface-container p-2.5 transition-colors",
                                    !isFocused && "cursor-grab active:cursor-grabbing hover:border-primary/50",
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <Icon
                                        path={mdDragIndicator}
                                        size={16}
                                        className="shrink-0 text-on-surface-variant opacity-65"
                                    />
                                    <span
                                        className={cn(
                                            "inline-flex shrink-0 items-center gap-1 rounded-md3-full px-2 py-0.5 type-label-s",
                                            variable.type === "number"
                                                ? "bg-primary-container text-on-primary-container"
                                                : "bg-tertiary-container text-on-tertiary-container",
                                        )}
                                    >
                                        <Icon
                                            path={variable.type === "number" ? mdNumbers : mdTag}
                                            size={13}
                                            className="shrink-0"
                                        />
                                        <span>
                                            {t(
                                                variable.type === "number"
                                                    ? "page.storyMaker.v2.variables.typeNumber"
                                                    : "page.storyMaker.v2.variables.typeBoolean",
                                            )}
                                        </span>
                                    </span>

                                    {usage > 0 && (
                                        <span className="shrink-0 rounded-md3-full bg-secondary-container px-1.5 py-0.5 font-mono type-label-s text-on-secondary-container">
                                            ×{usage}
                                        </span>
                                    )}

                                    <span className="min-w-0 flex-1" />

                                    {onQuickDrop && (
                                        <IconButton
                                            size="xs"
                                            icon={mdAdd}
                                            label={t("page.storyMaker.v2.beats.varOp")}
                                            onClick={() => onQuickDrop(payload)}
                                        />
                                    )}
                                    <IconButton
                                        size="xs"
                                        icon={mdDelete}
                                        label={t("page.storyMaker.v2.variables.deleteVar")}
                                        onClick={() => handleRequestDelete(variable)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <TextField
                                        label={t("page.storyMaker.v2.variables.nameLabel")}
                                        value={variable.name}
                                        maxLength={STORY_LIMITS.varName}
                                        onFocus={() => setFocusedVarId(variable.id)}
                                        onBlur={() => setFocusedVarId(prev => (prev === variable.id ? null : prev))}
                                        onValueChange={(value) => {
                                            onDocChange(prev => updateVariable(prev, variable.id, { name: value }));
                                        }}
                                    />

                                    {variable.type === "number" ? (
                                        <NumberInitialField
                                            label={t("page.storyMaker.v2.variables.initialLabel")}
                                            value={variable.initial}
                                            onFocus={() => setFocusedVarId(variable.id)}
                                            onBlur={() => setFocusedVarId(prev => (prev === variable.id ? null : prev))}
                                            onCommit={(next) => {
                                                onDocChange(prev => updateVariable(prev, variable.id, { initial: next }));
                                            }}
                                        />
                                    ) : (
                                        <div className="flex min-w-0 items-center justify-between gap-2 rounded-md3-sm border border-outline-variant/60 bg-surface-container-low px-2.5 py-1.5">
                                            <span className="min-w-0 truncate type-label-m text-on-surface-variant">
                                                {t("page.storyMaker.v2.variables.initialLabel")}
                                            </span>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <span className="font-mono type-label-m text-on-surface">
                                                    {variable.initial ? "true" : "false"}
                                                </span>
                                                <Switch
                                                    checked={variable.initial}
                                                    onCheckedChange={(checked) => {
                                                        onDocChange(prev => updateVariable(prev, variable.id, { initial: checked }));
                                                    }}
                                                    aria-label={t("page.storyMaker.v2.variables.initialLabel")}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex min-w-0 items-center justify-between gap-2 type-label-s text-on-surface-variant">
                                    <span className="truncate font-mono">{templateToken}</span>
                                    <span className="shrink-0 truncate opacity-75">
                                        {t("page.storyMaker.v2.palette.dropTargetBeatTrack")}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Dialog
                isOpen={removingVar !== null}
                onClose={() => setRemovingVar(null)}
                title={t("page.storyMaker.v2.variables.deleteVar")}
                size="sm"
                actions={(
                    <>
                        <Button variant="text" onClick={() => setRemovingVar(null)}>
                            {t("common.action.cancel")}
                        </Button>
                        <Button
                            variant="filled"
                            color="error"
                            onClick={() => {
                                if (removingVar) {
                                    onDocChange(prev => removeVariable(prev, removingVar.id));
                                }
                                setRemovingVar(null);
                            }}
                        >
                            {t("page.storyMaker.v2.variables.deleteVar")}
                        </Button>
                    </>
                )}
            >
                <div className="flex items-start gap-2.5 text-on-surface-variant">
                    <Icon path={mdWarning} size={20} className="mt-0.5 shrink-0 text-error" />
                    <div className="min-w-0 space-y-1">
                        {removingVar && (
                            <p className="truncate font-mono type-label-l text-on-surface">
                                {removingVar.name || removingVar.id}
                            </p>
                        )}
                        <p className="type-body-m">{t("page.storyMaker.v2.variables.inUseWarning")}</p>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
