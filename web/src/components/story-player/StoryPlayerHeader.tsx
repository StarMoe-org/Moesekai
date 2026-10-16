"use client";
import { ServerSourceBadge, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, useTheme } from "@/contexts/ThemeContext";
import { getCardThumbnailUrl, getEventLogoUrl } from "@/lib/assets";
import type { SseWebRegion } from "@/lib/sseWeb/config";
import type { StoryEpisode, StoryGroup, StoryKind } from "@/lib/storyPlayer/episodes";
import { STORY_KIND_LABEL_KEYS, storyEpisodeLabel, storyGroupTitle } from "./labels";

interface StoryPlayerHeaderProps {
    region: SseWebRegion;
    /** The episode shown, with its group, when the catalog knows it. */
    episode?: StoryEpisode;
    group?: StoryGroup;
    /** The address's episode, when the catalog does not (yet) know it. */
    selector: string | null;
    kind: StoryKind | null;
    /** The page's controls: previous / next, the server, the story page, the picker. */
    actions: React.ReactNode;
}

/** A unit's logo, as the main story pages show it (the CN server has its own). */
function unitLogoUrl(unit: string, region: string): string {
    return `/images/unit-logos/logo_${unit}_${region === "cn" ? "cn" : "jp"}.png`;
}

/**
 * The episode's header, as its story page heads it: the event's logo, the unit's logo or
 * the card's thumbnail, the group above and the episode below, and the server it is read
 * from; the page's controls beside it.
 */
export function StoryPlayerHeader({ region, episode, group, selector, kind, actions }: StoryPlayerHeaderProps) {
    const { t } = useI18n();
    const { assetSource } = useTheme();
    const source = replaceAssetSourceRegion(assetSource, region);
    const badges = <ServerSourceBadge serverSource={region} />;

    if (!episode || !group) {
        return (
            <StoryReaderHeader
                titleAs="h2"
                className="mb-4"
                eyebrow={kind ? t(STORY_KIND_LABEL_KEYS[kind]) : undefined}
                title={selector
                    ? <span className="font-mono">{selector}</span>
                    : <span className="text-on-surface-variant">{t("page.storyPlayer.noEpisodeTitle")}</span>}
                badges={badges}
                actions={actions}
            />
        );
    }

    const label = storyEpisodeLabel(episode, t);
    const groupTitle = storyGroupTitle(group, t);
    // "Episode 1 — Title", the number in the accent colour, as the story pages write it
    const numbered = (title: string | null) => (
        <>
            <span className="text-primary">{label}</span>
            {title && title !== label && ` — ${title}`}
        </>
    );

    let media: React.ReactNode = null;
    let eyebrow: React.ReactNode = groupTitle;
    let title: React.ReactNode = numbered(episode.title);
    if (episode.kind === "event" && group.event?.assetbundleName) {
        media = <img src={getEventLogoUrl(group.event.assetbundleName, source)} alt="" className="h-16 w-16 rounded-md3-md bg-surface-container-high object-contain p-1" />;
    } else if (episode.kind === "unit" && group.unit) {
        media = <img src={unitLogoUrl(group.unit, region)} alt="" className="h-8 w-16 rounded-md3-xs bg-surface-container-high object-contain p-1" />;
    } else if (episode.kind === "card") {
        const character = episode.characters?.[0];
        const bundle = episode.script.params.assetbundleName;
        if (character !== undefined && bundle) {
            media = <img src={getCardThumbnailUrl(character, bundle, false, source)} alt="" className="h-12 w-24 rounded-md3-sm object-cover" />;
        }
    } else if (episode.kind === "special") {
        eyebrow = <span className="text-primary">SP{group.id}</span>;
        // a special story of one episode is named by the story alone
        title = group.episodes.length > 1 ? numbered(episode.title) : groupTitle;
    } else if (episode.kind === "area") {
        eyebrow = t(STORY_KIND_LABEL_KEYS.area);
        title = groupTitle;
    }

    return (
        <StoryReaderHeader
            titleAs="h2"
            className="mb-4"
            media={media}
            eyebrow={eyebrow}
            title={title}
            badges={(
                <>
                    {episode.kind === "area" && <span className="type-label-m text-on-surface-variant">{label}</span>}
                    {badges}
                </>
            )}
            actions={actions}
        />
    );
}
