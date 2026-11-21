/**
 * Starter demo template and browser file download helpers (`.moesekai-story.json` and `.msk`)
 * for `moesekai-story/2` graph documents.
 *
 * Showcases:
 * - Componentized stage slots (`bg_a000401`, `bgm00020`, place banner, fadeBlack transition, 2-actor cast)
 * - Talk beats with synchronous off-speaker Live2D reactions & accompanying SE (`se_pack00001_b/se00001_b`)
 * - Low-code counter variable (`affection`) mutated by Choice option effects (`affection += 1`)
 * - Template variable interpolation (`{{affection}}`)
 * - Condition node branching (`affection >= 1` -> `end_practice`, `else` -> `end_cafe`)
 * - Two named multi-endings with clean non-overlapping canvas coordinates
 */
import { STORY_SCHEMA_VERSION, type StoryDocument, type StoryRegion } from "../../types/storyMaker.ts";
import { serializeStory, storyFileName, storyScriptFileName } from "./document.ts";
import { DEFAULT_STORY_BACKGROUND, DEFAULT_STORY_BGM, DEFAULT_STORY_SE } from "./limits.ts";
import { serializeStoryScript } from "./script.ts";

export interface StarterStoryStrings {
    title: string;
    summary: string;
    author: string;
    ichikaName: string;
    sakiName: string;
    placeOpening: string;
    telopOpening: string;
    lineIchikaGreeting: string;
    lineSakiReply: string;
    choicePractice: string;
    choiceTea: string;
    labelPractice: string;
    linePractice: string;
    labelTea: string;
    lineTea: string;
    labelEnding: string;
    narrationEnding: string;
    telopEnding: string;
    /** Optional v2 localized labels (default cleanly when omitted). */
    varAffectionName?: string;
    sceneOpeningTitle?: string;
    choiceTitle?: string;
    conditionTitle?: string;
    ruleAffectionLabel?: string;
    endingPracticeTitle?: string;
    endingPracticeSubtitle?: string;
    endingCafeTitle?: string;
    endingCafeSubtitle?: string;
}

/** A complete, valid v2 demo graph showcasing counters, choices, conditions, Live2D reactions, and multi-endings. */
export function createStarterStoryDocument(region: StoryRegion, strings: StarterStoryStrings): StoryDocument {
    const varAffectionName = strings.varAffectionName ?? "affection";
    const sceneOpeningTitle = strings.sceneOpeningTitle ?? strings.telopOpening;
    const choiceTitle = strings.choiceTitle ?? strings.title;
    const conditionTitle = strings.conditionTitle ?? strings.labelEnding;
    const ruleAffectionLabel = strings.ruleAffectionLabel ?? strings.labelPractice;
    const endingPracticeTitle = strings.endingPracticeTitle ?? strings.labelPractice;
    const endingPracticeSubtitle = strings.endingPracticeSubtitle ?? `${strings.narrationEnding} (${varAffectionName}: {{affection}})`;
    const endingCafeTitle = strings.endingCafeTitle ?? strings.labelTea;
    const endingCafeSubtitle = strings.endingCafeSubtitle ?? `${strings.telopEnding} (${varAffectionName}: {{affection}})`;

    return {
        schema: STORY_SCHEMA_VERSION,
        id: "starter_v2",
        region,
        meta: {
            title: strings.title,
            summary: strings.summary,
            author: strings.author,
        },
        cast: [
            { key: "ichika", modelId: "v2_01ichika_casual", name: strings.ichikaName, characterId: 1 },
            { key: "saki", modelId: "v2_02saki_casual", name: strings.sakiName, characterId: 2 },
        ],
        variables: [
            { id: "affection", name: varAffectionName, type: "number", initial: 0 },
        ],
        startNodeId: "start",
        nodes: {
            start: {
                id: "start",
                type: "start",
                pos: { x: 40, y: 200 },
            },
            scene_open: {
                id: "scene_open",
                type: "scene",
                title: sceneOpeningTitle,
                pos: { x: 320, y: 140 },
                background: { mode: "set", asset: DEFAULT_STORY_BACKGROUND },
                bgm: { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.75 },
                place: { mode: "set", text: strings.placeOpening },
                transition: { kind: "fadeBlack", duration: 0.5 },
                stageCast: {
                    mode: "set",
                    actors: [
                        { castKey: "ichika", slot: "left", scale: 1.05, facial: "face_smile_01" },
                        { castKey: "saki", slot: "right", scale: 1.05 },
                    ],
                },
                beats: [
                    { id: "scene_open_b1", kind: "telop", text: strings.telopOpening },
                    {
                        id: "scene_open_b2",
                        kind: "talk",
                        speakerKey: "ichika",
                        body: strings.lineIchikaGreeting,
                        facial: "face_smile_01",
                        reactions: [{ castKey: "saki", facial: "face_happy_01" }],
                        se: DEFAULT_STORY_SE,
                        seVolume: 0.7,
                    },
                    {
                        id: "scene_open_b3",
                        kind: "talk",
                        speakerKey: "saki",
                        body: strings.lineSakiReply,
                        facial: "face_happy_01",
                        reactions: [{ castKey: "ichika", facial: "face_smile_01" }],
                    },
                ],
            },
            choice_plan: {
                id: "choice_plan",
                type: "choice",
                title: choiceTitle,
                pos: { x: 720, y: 180 },
                options: [
                    {
                        id: "opt1",
                        text: strings.choicePractice,
                        effects: [{ varId: "affection", op: "add", value: 1 }],
                    },
                    {
                        id: "opt2",
                        text: strings.choiceTea,
                    },
                ],
            },
            scene_practice: {
                id: "scene_practice",
                type: "scene",
                title: strings.labelPractice,
                pos: { x: 1120, y: 40 },
                background: { mode: "inherit" },
                bgm: { mode: "inherit" },
                place: { mode: "inherit" },
                transition: { kind: "none", duration: 0.4 },
                stageCast: { mode: "inherit" },
                beats: [
                    {
                        id: "scene_practice_b1",
                        kind: "stageAction",
                        action: "move",
                        castKey: "ichika",
                        slot: "center",
                        duration: 0.5,
                    },
                    {
                        id: "scene_practice_b2",
                        kind: "talk",
                        speakerKey: "ichika",
                        body: strings.linePractice,
                        facial: "face_smile_01",
                        reactions: [{ castKey: "saki", facial: "face_happy_01" }],
                    },
                    {
                        id: "scene_practice_b3",
                        kind: "narration",
                        body: strings.narrationEnding,
                    },
                ],
            },
            scene_cafe: {
                id: "scene_cafe",
                type: "scene",
                title: strings.labelTea,
                pos: { x: 1120, y: 340 },
                background: { mode: "inherit" },
                bgm: { mode: "inherit" },
                place: { mode: "hide" },
                transition: { kind: "none", duration: 0.4 },
                stageCast: { mode: "inherit" },
                beats: [
                    {
                        id: "scene_cafe_b1",
                        kind: "stageAction",
                        action: "move",
                        castKey: "saki",
                        slot: "center",
                        duration: 0.5,
                    },
                    {
                        id: "scene_cafe_b2",
                        kind: "talk",
                        speakerKey: "saki",
                        body: strings.lineTea,
                        facial: "face_happy_01",
                    },
                    {
                        id: "scene_cafe_b3",
                        kind: "narration",
                        body: strings.narrationEnding,
                    },
                ],
            },
            cond_ending: {
                id: "cond_ending",
                type: "condition",
                title: conditionTitle,
                pos: { x: 1520, y: 180 },
                rules: [
                    {
                        id: "rule1",
                        label: ruleAffectionLabel,
                        expr: { varId: "affection", op: ">=", value: 1 },
                    },
                ],
            },
            end_practice: {
                id: "end_practice",
                type: "end",
                title: endingPracticeTitle,
                subtitle: endingPracticeSubtitle,
                pos: { x: 1920, y: 60 },
            },
            end_cafe: {
                id: "end_cafe",
                type: "end",
                title: endingCafeTitle,
                subtitle: endingCafeSubtitle,
                pos: { x: 1920, y: 320 },
            },
        },
        edges: [
            { id: "e_start_out", fromNodeId: "start", fromPortId: "out", toNodeId: "scene_open" },
            { id: "e_scene_open_out", fromNodeId: "scene_open", fromPortId: "out", toNodeId: "choice_plan" },
            { id: "e_choice_plan_opt1", fromNodeId: "choice_plan", fromPortId: "opt1", toNodeId: "scene_practice" },
            { id: "e_choice_plan_opt2", fromNodeId: "choice_plan", fromPortId: "opt2", toNodeId: "scene_cafe" },
            { id: "e_scene_practice_out", fromNodeId: "scene_practice", fromPortId: "out", toNodeId: "cond_ending" },
            { id: "e_scene_cafe_out", fromNodeId: "scene_cafe", fromPortId: "out", toNodeId: "cond_ending" },
            { id: "e_cond_ending_rule1", fromNodeId: "cond_ending", fromPortId: "rule1", toNodeId: "end_practice" },
            { id: "e_cond_ending_else", fromNodeId: "cond_ending", fromPortId: "else", toNodeId: "end_cafe" },
        ],
    };
}

function triggerDownload(content: string, mime: string, filename: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads `doc` as a `.moesekai-story.json` file in the browser. */
export function downloadStoryJson(doc: StoryDocument): void {
    triggerDownload(serializeStory(doc), "application/json;charset=utf-8", storyFileName(doc));
}

/** Downloads `doc` as a MoeSekai Script `.msk` file in the browser. */
export function downloadStoryScript(doc: StoryDocument): void {
    triggerDownload(serializeStoryScript(doc), "text/plain;charset=utf-8", storyScriptFileName(doc));
}
