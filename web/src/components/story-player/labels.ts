import type { useI18n } from "@/contexts/I18nContext";
import type { StoryEpisode, StoryGroup, StoryKind } from "@/lib/storyPlayer/episodes";

type Translate = ReturnType<typeof useI18n>["t"];

/** The name of each kind of story, as the site's navigation names it. */
export const STORY_KIND_LABEL_KEYS: Record<StoryKind, string> = {
    event: "layout.nav.items.eventStory",
    unit: "layout.nav.items.mainStory",
    card: "layout.nav.items.cardStory",
    special: "layout.nav.items.specialStory",
    area: "layout.nav.items.areaTalk",
};

/** A group's name: masterdata's, or the story pages' fallback for its id. */
export function storyGroupTitle(group: Pick<StoryGroup, "kind" | "id" | "title">, t: Translate): string {
    if (group.title) return group.title;
    switch (group.kind) {
        case "event": return t("page.story.event.fallbackEventName", { id: group.id });
        case "special": return t("page.story.special.fallbackTitle", { id: group.id });
        case "area": return t("page.story.area.areaFallback", { id: group.id });
        default: return String(group.id);
    }
}

/** Where an episode is in its group: its number, a card story's part, an area talk's id. */
export function storyEpisodeLabel(episode: StoryEpisode, t: Translate): string {
    if (episode.part) return t(episode.part === "former" ? "page.story.card.part1" : "page.story.card.part2");
    if (episode.actionSet !== undefined) return t("page.storyPlayer.areaTalkLabel", { id: episode.actionSet });
    // masterdata's own numbering (in the server's language), where it has one
    if (episode.numberLabel) return episode.numberLabel;
    return t("page.story.event.episodeLabel", { episode: episode.episodeNo ?? "" });
}
