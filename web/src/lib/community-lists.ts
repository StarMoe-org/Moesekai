/**
 * Community name lists (legacy sponsors, special thanks, team members).
 *
 * These names used to be hardcoded as long prose strings inside all five i18n
 * dictionaries (and had already drifted apart between locales). They now live
 * in a single structured data file — edit `web/src/data/community-lists.json`
 * to add/remove a name; every page renders from there. Only the surrounding
 * labels (titles, notes) stay in i18n.
 */
import data from "@/data/community-lists.json";
import { MEMBER_LINKS } from "@/lib/team-links";

export interface SponsorEntry {
    name: string;
    /** i18n key suffix under `page.about.sponsors.*Note`, e.g. "serverSponsor". */
    noteKey?: string;
}

interface CommunityListsData {
    sponsors: {
        anonymousCount: number;
        members: Array<string | { name: string; noteKey?: string }>;
    };
    specialThanks: string[];
    teams: {
        translation: string[];
        art: string[];
        guide: string[];
    };
}

const lists = data as CommunityListsData;

/** Sponsors from before the Afdian page existed (legacy sponsors), in display order. */
export const LEGACY_SPONSORS: SponsorEntry[] = lists.sponsors.members.map((member) =>
    typeof member === "string" ? { name: member } : member,
);

/** How many legacy sponsors asked not to be named. */
export const LEGACY_SPONSOR_ANONYMOUS_COUNT = lists.sponsors.anonymousCount;

export const SPECIAL_THANKS: string[] = lists.specialThanks;

export type TeamGroupId = keyof CommunityListsData["teams"];

export const TEAM_GROUPS: Array<{ id: TeamGroupId; labelKey: string; members: string[] }> = [
    { id: "translation", labelKey: "page.about.teams.translationLabel", members: lists.teams.translation },
    { id: "art", labelKey: "page.about.teams.artLabel", members: lists.teams.art },
    { id: "guide", labelKey: "page.about.teams.guideLabel", members: lists.teams.guide },
];

/** Bilibili space URL for a listed member name (with or without "@"), if known. */
export function memberLink(name: string): string | undefined {
    const bare = name.startsWith("@") ? name.slice(1) : name;
    return MEMBER_LINKS[name] ?? MEMBER_LINKS[`@${bare}`] ?? MEMBER_LINKS[bare];
}
