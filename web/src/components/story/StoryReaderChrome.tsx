"use client";
import React from "react";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { isValidServer } from "@/lib/account-servers";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Card, Icon, Surface, cn } from "@/components/md3";
import { mdArrowBack, mdChevronLeft, mdChevronRight } from "@/components/md3/icons";

/* ==========================================================================
   Shared MD3 chrome for story reader pages:
   - StoryBackButton: text button with a back arrow
   - StoryReaderHeader: tonal info card (artwork + eyebrow + title + badges)
   - StoryBadge: small tonal tag (server source / translation source)
   - StoryEpisodeNav: previous / next episode cards
   ========================================================================== */

export function StoryBackButton({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Button variant="text" icon={mdArrowBack} href={href} className="-ml-3 mb-4">
            {children}
        </Button>
    );
}

export type StoryBadgeTone = "primary" | "secondary" | "tertiary" | "neutral";

const BADGE_TONE: Record<StoryBadgeTone, string> = {
    primary: "bg-primary-container text-on-primary-container",
    secondary: "bg-secondary-container text-on-secondary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    neutral: "bg-surface-container-highest text-on-surface-variant",
};

export function StoryBadge({ tone = "secondary", children }: { tone?: StoryBadgeTone; children: React.ReactNode }) {
    return <span className={cn("inline-flex h-6 items-center rounded-md3-sm px-2 type-label-m", BADGE_TONE[tone])}>{children}</span>;
}

/** Server source badge (CN uses tertiary, other servers secondary). */
export function ServerSourceBadge({ serverSource }: { serverSource: string }) {
    const { t } = useI18n();
    return <StoryBadge tone={serverSource === "cn" ? "tertiary" : "secondary"}>{isValidServer(serverSource) ? <ServerRegionLabel server={serverSource} size={16} /> : t(`page.story.serverSource.${serverSource}`)}</StoryBadge>;
}

export function StoryReaderHeader({
    media,
    eyebrow,
    title,
    badges,
    footer,
    trailing,
    actions,
    titleAs: Title = "h1",
    href,
    className,
}: {
    media?: React.ReactNode;
    eyebrow?: React.ReactNode;
    title: React.ReactNode;
    badges?: React.ReactNode;
    footer?: React.ReactNode;
    trailing?: React.ReactNode;
    /**
     * Controls that belong with the header (beside it on a wide card, under it on a narrow
     * one): the card is then laid out by its own width.
     */
    actions?: React.ReactNode;
    /** The title's heading level: `h2` on a page with a title of its own. */
    titleAs?: "h1" | "h2";
    /** Render the header as an interactive link card. */
    href?: string;
    className?: string;
}) {
    const heading = (
        <>
            {media && <div className="hidden shrink-0 sm:block">{media}</div>}
            <div className="min-w-0 flex-1">
                {eyebrow && <p className="truncate type-label-l text-on-surface-variant">{eyebrow}</p>}
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <Title className="type-title-l text-on-surface">{title}</Title>
                    {badges}
                </div>
                {footer}
            </div>
            {trailing}
        </>
    );
    const body = actions ? (
        <div className="@container">
            <div className="flex flex-col gap-3 p-4 @3xl:flex-row @3xl:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">{heading}</div>
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
            </div>
        </div>
    ) : (
        <div className="flex items-center gap-4 p-4">{heading}</div>
    );
    if (href) {
        return (
            <Card href={href} variant="filled" radius="lg" className={cn("group mb-6", className)}>
                {body}
            </Card>
        );
    }
    return (
        <Surface tone="card" radius="lg" className={cn("mb-6", className)}>
            {body}
        </Surface>
    );
}

export function StoryEpisodeNav({
    prev,
    next,
}: {
    prev?: { href: string; title: React.ReactNode } | null;
    next?: { href: string; title: React.ReactNode } | null;
}) {
    const { t } = useI18n();
    return (
        <nav className="mx-auto mt-8 flex max-w-4xl items-stretch justify-between gap-4 border-t border-outline-variant pt-6">
            {prev ? (
                <Card href={prev.href} variant="filled" className="flex max-w-[45%] items-center gap-2.5 px-4 py-3 text-on-surface">
                    <Icon path={mdChevronLeft} className="text-primary" />
                    <div className="min-w-0 text-left">
                        <div className="type-label-s text-on-surface-variant">{t("page.story.navigation.previousEpisode")}</div>
                        <div className="truncate type-title-s">{prev.title}</div>
                    </div>
                </Card>
            ) : (
                <div />
            )}
            {next ? (
                <Card href={next.href} variant="filled" className="flex max-w-[45%] items-center justify-end gap-2.5 px-4 py-3 text-right text-on-surface">
                    <div className="min-w-0 text-right">
                        <div className="type-label-s text-on-surface-variant">{t("page.story.navigation.nextEpisode")}</div>
                        <div className="truncate type-title-s">{next.title}</div>
                    </div>
                    <Icon path={mdChevronRight} className="text-primary" />
                </Card>
            ) : (
                <div />
            )}
        </nav>
    );
}
