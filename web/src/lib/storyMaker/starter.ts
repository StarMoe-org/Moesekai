/**
 * Starter demo template and browser file download helper for `moesekai-story/1` documents.
 * All visible text is passed in by the caller from the active UI locale's i18n messages.
 */
import { STORY_FORMAT, type StoryDocument, type StoryRegion } from "../../types/storyMaker.ts";
import { serializeStory, storyFileName } from "./document.ts";

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
}

/** A compact, valid demo story exercising backgrounds, place banner, telop, cast, BGM, dialogue, choices, labels, narration and effects. */
export function createStarterStoryDocument(region: StoryRegion, strings: StarterStoryStrings): StoryDocument {
    return {
        format: STORY_FORMAT,
        region,
        title: strings.title,
        summary: strings.summary,
        author: strings.author,
        cast: [
            { key: "ichika", modelId: "v2_01ichika_casual", name: strings.ichikaName, characterId: 1 },
            { key: "saki", modelId: "v2_02saki_casual", name: strings.sakiName, characterId: 2 },
        ],
        steps: [
            { id: "bg01", op: "background", name: "bg_a000001", transition: "fade" },
            { id: "bgm01", op: "bgm", action: "play", name: "bgm00001", volume: 0.7 },
            { id: "pl01", op: "place", text: strings.placeOpening },
            { id: "tl01", op: "telop", body: strings.telopOpening },
            { id: "ap01", op: "appear", cast: "ichika", slot: "left", fade: true },
            { id: "tk01", op: "talk", cast: "ichika", body: strings.lineIchikaGreeting, lipSync: true },
            { id: "ap02", op: "appear", cast: "saki", slot: "right", fade: true },
            { id: "tk02", op: "talk", cast: "saki", body: strings.lineSakiReply, lipSync: true },
            {
                id: "ch01",
                op: "choice",
                options: [
                    { id: "opt1", text: strings.choicePractice, target: "lb_practice" },
                    { id: "opt2", text: strings.choiceTea, target: "lb_tea" },
                ],
            },
            { id: "lb_practice", op: "label", name: strings.labelPractice },
            { id: "mv01", op: "move", cast: "ichika", slot: "center", duration: 0.5 },
            { id: "tk03", op: "talk", cast: "ichika", body: strings.linePractice, lipSync: true },
            { id: "jp01", op: "jump", target: "lb_end" },
            { id: "lb_tea", op: "label", name: strings.labelTea },
            { id: "mv02", op: "move", cast: "saki", slot: "center", duration: 0.5 },
            { id: "tk04", op: "talk", cast: "saki", body: strings.lineTea, lipSync: true },
            { id: "lb_end", op: "label", name: strings.labelEnding },
            { id: "pl02", op: "place", text: "" },
            { id: "nr01", op: "narration", body: strings.narrationEnding },
            { id: "fx01", op: "effect", effect: "fadeOut", color: "white", duration: 0.8 },
            { id: "tl02", op: "telop", body: strings.telopEnding },
        ],
    };
}

/** Downloads `doc` as a `.moesekai-story.json` file in the browser. */
export function downloadStoryJson(doc: StoryDocument): void {
    const blob = new Blob([serializeStory(doc)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = storyFileName(doc);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
