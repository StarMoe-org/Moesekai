"use client";
import { useState } from "react";
import { Button, Icon, IconButton, Menu, cn, type MenuItemDef } from "@/components/md3";
import { mdAdd, mdArrowDownward, mdArrowUpward, mdContentCopy, mdDelete, mdDragIndicator, mdErrorFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import type { StoryDocument, StoryOpName } from "@/types/storyMaker";
import { STEP_ICONS, STEP_MENU, stepLabel, stepSummary } from "./stepMeta";

/** The "add step" menu: every op, grouped; a new step goes after the selected one. */
export function AddStepMenu({ onAdd, disabled, label }: { onAdd: (op: StoryOpName) => void; disabled?: boolean; label?: string }) {
    const { t } = useI18n();
    const items: MenuItemDef[] = STEP_MENU.flatMap((group, groupIndex) => group.map((op, index) => ({
        key: op,
        label: stepLabel(t, op),
        icon: STEP_ICONS[op],
        dividerBefore: groupIndex > 0 && index === 0,
        onSelect: () => onAdd(op),
    })));
    return (
        <Menu
            align="end"
            items={items}
            anchor={({ ref, onClick }) => (
                <Button ref={ref} onClick={onClick} size="s" variant="filled" icon={mdAdd} disabled={disabled}>
                    {label ?? t("page.storyMaker.editor.addStep")}
                </Button>
            )}
        />
    );
}

interface StepListProps {
    doc: StoryDocument;
    selected: number;
    onSelect: (index: number) => void;
    onAdd: (op: StoryOpName) => void;
    onMove: (from: number, to: number) => void;
    onDuplicate: (index: number) => void;
    onRemove: (index: number) => void;
    /** Steps with validation issues. */
    flagged: ReadonlySet<number>;
    className?: string;
}

/** The story's steps in order: select one, drag to reorder, or move / duplicate / delete the selected one. */
export function StepList({ doc, selected, onSelect, onAdd, onMove, onDuplicate, onRemove, flagged, className }: StepListProps) {
    const { t } = useI18n();
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const full = doc.steps.length >= STORY_LIMITS.steps;

    return (
        <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
                <p className="min-w-0 type-title-s text-on-surface">
                    {t("page.storyMaker.editor.steps")}
                    <span className="ml-2 type-label-m text-on-surface-variant">{doc.steps.length}/{STORY_LIMITS.steps}</span>
                </p>
                <AddStepMenu onAdd={onAdd} disabled={full} />
            </div>
            {doc.steps.length === 0 ? (
                <p className="px-4 py-6 text-center type-body-m text-on-surface-variant">{t("page.storyMaker.editor.noSteps")}</p>
            ) : (
                <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label={t("page.storyMaker.editor.steps")}>
                    {doc.steps.map((step, index) => {
                        const active = index === selected;
                        return (
                            <li
                                key={step.id}
                                draggable
                                onDragStart={(event) => {
                                    setDragging(index);
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", step.id);
                                }}
                                onDragOver={(event) => {
                                    if (dragging === null) return;
                                    event.preventDefault();
                                    setOver(index);
                                }}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    if (dragging !== null) onMove(dragging, index);
                                    setDragging(null);
                                    setOver(null);
                                }}
                                onDragEnd={() => {
                                    setDragging(null);
                                    setOver(null);
                                }}
                                className={cn(
                                    "group relative rounded-md3-md",
                                    active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                    over === index && dragging !== null && dragging !== index && "outline-2 outline-dashed outline-primary",
                                    dragging === index && "opacity-38",
                                )}
                            >
                                <button
                                    type="button"
                                    aria-current={active || undefined}
                                    onClick={() => onSelect(index)}
                                    className="state-layer focus-ring flex w-full min-w-0 items-center gap-2 rounded-md3-md py-1.5 pl-1 pr-2 text-left"
                                >
                                    <Icon path={mdDragIndicator} size={18} className="shrink-0 cursor-grab opacity-50" />
                                    <span className="w-8 shrink-0 text-right font-mono type-label-s opacity-70">{index + 1}</span>
                                    <Icon path={STEP_ICONS[step.op]} size={20} className="shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate type-label-m opacity-80">{stepLabel(t, step.op)}</span>
                                        <span className="block truncate type-body-s">{stepSummary(t, doc, step) || "—"}</span>
                                    </span>
                                    {flagged.has(index) && <Icon path={mdErrorFill} size={18} className="shrink-0 text-error" label={t("page.storyMaker.editor.stepHasIssues")} />}
                                </button>
                                {active && (
                                    <div className="flex flex-wrap justify-end gap-0.5 px-1 pb-1">
                                        <IconButton size="xs" icon={mdArrowUpward} label={t("page.storyMaker.editor.moveUp")} disabled={index === 0} onClick={() => onMove(index, index - 1)} />
                                        <IconButton size="xs" icon={mdArrowDownward} label={t("page.storyMaker.editor.moveDown")} disabled={index === doc.steps.length - 1} onClick={() => onMove(index, index + 1)} />
                                        <IconButton size="xs" icon={mdContentCopy} label={t("page.storyMaker.editor.duplicateStep")} disabled={full} onClick={() => onDuplicate(index)} />
                                        <IconButton size="xs" icon={mdDelete} label={t("page.storyMaker.editor.deleteStep")} onClick={() => onRemove(index)} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
