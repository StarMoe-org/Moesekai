import {
    mdAltRoute, mdAnimation, mdChat, mdImage, mdLabel, mdMood, mdMusicNote, mdMyLocation, mdNotes, mdPersonAdd,
    mdPersonRemove, mdRedo, mdSwapHoriz, mdTitle, mdVolumeUp,
} from "@/components/md3/icons";
import { speakerName } from "@/lib/storyMaker/document";
import type { StoryDocument, StoryOpName, StoryStep } from "@/types/storyMaker";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The icon of each op. */
export const STEP_ICONS: Record<StoryOpName, string> = {
    background: mdImage,
    place: mdMyLocation,
    appear: mdPersonAdd,
    move: mdSwapHoriz,
    hide: mdPersonRemove,
    pose: mdMood,
    talk: mdChat,
    narration: mdNotes,
    telop: mdTitle,
    effect: mdAnimation,
    bgm: mdMusicNote,
    se: mdVolumeUp,
    choice: mdAltRoute,
    label: mdLabel,
    jump: mdRedo,
};

/** The ops in the "add step" menu, grouped as the menu shows them. */
export const STEP_MENU: readonly (readonly StoryOpName[])[] = [
    ["talk", "narration", "telop", "choice"],
    ["background", "place", "appear", "move", "pose", "hide"],
    ["effect", "bgm", "se"],
    ["label", "jump"],
];

export function stepLabel(t: Translate, op: StoryOpName): string {
    return t(`page.storyMaker.op.${op}`);
}

function castName(doc: StoryDocument, key: string | undefined): string {
    return doc.cast.find(member => member.key === key)?.name || key || "?";
}

function labelName(doc: StoryDocument, id: string): string {
    const step = doc.steps.find(item => item.id === id);
    return step?.op === "label" ? step.name || step.id : id || "?";
}

/** One line on what a step does, for the step list. */
export function stepSummary(t: Translate, doc: StoryDocument, step: StoryStep): string {
    switch (step.op) {
        case "background": return step.name ?? t("page.storyMaker.summary.noBackground");
        case "place": return step.text.trim() ? step.text : t("page.storyMaker.summary.clearPlace");
        case "appear": return [
            castName(doc, step.cast),
            t(`page.storyMaker.slot.${step.slot}`),
            step.scale !== undefined && step.scale !== 1 ? `${step.scale.toFixed(2)}×` : null,
        ].filter(Boolean).join(" · ");
        case "move": return [
            `${castName(doc, step.cast)} → ${t(`page.storyMaker.slot.${step.slot}`)}`,
            step.scale !== undefined ? `${step.scale.toFixed(2)}×` : null,
        ].filter(Boolean).join(" · ");
        case "hide": return castName(doc, step.cast);
        case "pose": return [castName(doc, step.cast), step.motion, step.facial].filter(Boolean).join(" · ");
        case "talk": return `${speakerName(doc, step) || "?"}: ${step.body}`;
        case "narration":
        case "telop": return step.body;
        case "effect": return t(`page.storyMaker.effect.${step.effect}`);
        case "bgm": return step.action === "play" ? step.name || "?" : t(`page.storyMaker.bgmAction.${step.action}`);
        case "se": return step.name || "?";
        case "choice": return step.options.map(option => option.text || "?").join(" / ");
        case "label": return step.name || step.id;
        case "jump": return `→ ${labelName(doc, step.target)}`;
    }
    return "";
}
