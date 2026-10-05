import { mdAutoStories, mdCollectionsBookmark, mdEvent, mdForum, mdRecordVoiceOver, mdStar } from "@/components/md3/icons";

/**
 * Metadata for the six story categories, shared by the story index and child page headers.
 * Text is resolved through i18n keys in UI components; `icon` is a Material Symbols path
 * (render with `<Icon path={…} />`), matching the navigation drawer icons.
 */
export type StoryTypeKey = "unit" | "event" | "card" | "area" | "self" | "special";

export interface StoryTypeInfo {
    key: StoryTypeKey;
    href: string;
    nameKey: string;
    descKey: string;
    icon: string;
}

export const STORY_TYPES: StoryTypeInfo[] = [
    { key: "unit", href: "/story/unit", nameKey: "page.story.types.unit.name", descKey: "page.story.types.unit.desc", icon: mdAutoStories },
    { key: "event", href: "/story/event", nameKey: "page.story.types.event.name", descKey: "page.story.types.event.desc", icon: mdEvent },
    { key: "card", href: "/story/card", nameKey: "page.story.types.card.name", descKey: "page.story.types.card.desc", icon: mdCollectionsBookmark },
    { key: "area", href: "/story/area", nameKey: "page.story.types.area.name", descKey: "page.story.types.area.desc", icon: mdForum },
    { key: "self", href: "/story/self", nameKey: "page.story.types.self.name", descKey: "page.story.types.self.desc", icon: mdRecordVoiceOver },
    { key: "special", href: "/story/special", nameKey: "page.story.types.special.name", descKey: "page.story.types.special.desc", icon: mdStar },
];

export function getStoryType(key: StoryTypeKey): StoryTypeInfo {
    return STORY_TYPES.find((type) => type.key === key) ?? STORY_TYPES[0];
}
