"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "@/components/LocalizedLink";
import ExternalLink from "@/components/ExternalLink";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import {
    getCardThumbnailUrl,
    getCharacterIconUrl,
    getCostumeThumbnailUrl,
    getEventLogoUrl,
    getGachaLogoUrl,
    getMusicJacketUrl,
    getStampUrl,
} from "@/lib/assets";
import { getCardDefaultTrainedStatus, getRarityNumber } from "@/types/types";
import {
    useCommunityEntityLoader,
    useCommunityStamps,
    type EntityCatalogState,
    type ICommunityStamp,
} from "@/lib/community-masterdata";
import { Icon, cn } from "@/components/md3";
import { mdHideImage, mdOpenInNew, mdVisibility, mdVisibilityOff } from "@/components/md3/icons";
import type { EntityLinkType } from "@/types/community";

const PURE_STAMP_RE = /^\s*\[stamp:(\d{1,6})\]\s*$/;
const RICH_TOKEN_RE = /(\|\|[^|\n]{1,500}\|\||\[(?:stamp|card|music|event|gacha|costume|character):\d{1,8}\])/g;
const ENTITY_DETECT_RE = /\[(card|music|event|gacha|costume|character):(\d{1,8})\]/g;
const STAMP_DETECT_RE = /\[stamp:(\d{1,6})\]/;

interface CommunityMarkdownProps {
    content: string;
    compact?: boolean;
    className?: string;
}

function sanitizeHref(href: string | undefined): { safe: string; external: boolean } | null {
    if (!href) return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
        return { safe: trimmed, external: false };
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            return { safe: parsed.toString(), external: true };
        }
    } catch {
        // Invalid or disallowed protocol such as javascript: or data:
    }
    return null;
}

function InlineSpoiler({ text }: { text: string }) {
    const { t } = useI18n();
    const [revealed, setRevealed] = useState(false);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRevealed((prev) => !prev);
            }}
            aria-expanded={revealed}
            title={revealed ? t("common.comments.spoiler.hide") : t("common.comments.spoiler.reveal")}
            className={cn(
                "focus-ring mx-0.5 inline-flex items-center gap-1 rounded-md3-xs px-1.5 py-0.5 align-baseline transition-colors duration-150",
                revealed
                    ? "bg-surface-container-high text-on-surface"
                    : "bg-inverse-surface text-inverse-on-surface hover:opacity-90",
            )}
        >
            {revealed ? (
                <span>{text}</span>
            ) : (
                <>
                    <Icon path={mdVisibilityOff} size={14} />
                    <span className="type-label-s">{t("common.comments.spoiler.inlineLabel")}</span>
                </>
            )}
        </button>
    );
}

function StampView({
    stampId,
    stampsMap,
    large = false,
}: {
    stampId: number;
    stampsMap: Map<number, ICommunityStamp> | null;
    large?: boolean;
}) {
    const { assetSource } = useTheme();
    const { t } = useI18n();
    const [imgError, setImgError] = useState(false);
    const stamp = stampsMap?.get(stampId);

    if (!stamp || imgError) {
        return (
            <span className="inline-flex items-center rounded-md3-sm border border-outline-variant bg-surface-container px-2 py-0.5 type-label-m text-on-surface-variant">
                {t("common.comments.stampFallback", { id: stampId })}
            </span>
        );
    }

    return (
        <span
            className={cn(
                "inline-flex shrink-0 align-middle select-none",
                large ? "my-1 h-28 w-28 sm:h-32 sm:w-32" : "mx-1 h-16 w-16 sm:h-20 sm:w-20",
            )}
            title={stamp.name}
        >
            <img
                src={getStampUrl(stamp.assetbundleName, assetSource)}
                alt={stamp.name}
                loading="lazy"
                onError={() => setImgError(true)}
                className="h-full w-full object-contain"
            />
        </span>
    );
}

function getFirstCostumeAsset(parts: Record<string, { assetbundleName: string }[]> | undefined): string | null {
    if (!parts) return null;
    for (const list of Object.values(parts)) {
        if (list && list.length > 0 && list[0]?.assetbundleName) {
            return list[0].assetbundleName;
        }
    }
    return null;
}

function EntityEmbedCard({
    type,
    id,
    catalog,
}: {
    type: EntityLinkType;
    id: number;
    catalog: EntityCatalogState;
}) {
    const { assetSource } = useTheme();
    const { t } = useI18n();
    const { t: translateGameData } = useTranslation();

    let href = "/";
    let label = `#${id}`;
    let subtitle = t(`page.community.entities.${type}`);
    let imageUrl: string | null = null;
    let badgeText: string | null = null;

    if (type === "card") {
        href = `/cards/${id}`;
        const card = catalog.cardsMap?.get(id);
        if (card) {
            const translatedPrefix = translateGameData("cards", "prefix", card.prefix);
            label = translatedPrefix || card.prefix;
            const charName = getCharacterName(t, card.characterId);
            const rarity = getRarityNumber(card.cardRarityType);
            subtitle = `${charName} · #${id}`;
            badgeText = card.cardRarityType === "rarity_birthday" ? "BD" : `${rarity}★`;
            imageUrl = getCardThumbnailUrl(
                card.characterId,
                card.assetbundleName,
                getCardDefaultTrainedStatus(card),
                assetSource,
            );
        }
    } else if (type === "music") {
        href = `/music/${id}`;
        const music = catalog.musicsMap?.get(id);
        if (music) {
            const translatedTitle = translateGameData("music", "title", music.title);
            label = translatedTitle || music.title;
            subtitle = `${t("page.community.entities.music")} · #${id}`;
            imageUrl = getMusicJacketUrl(music.assetbundleName, assetSource);
        }
    } else if (type === "event") {
        href = `/events/${id}`;
        const event = catalog.eventsMap?.get(id);
        if (event) {
            const translatedName = translateGameData("events", "name", event.name);
            label = translatedName || event.name;
            subtitle = `${t("page.community.entities.event")} · #${id}`;
            imageUrl = getEventLogoUrl(event.assetbundleName, assetSource);
        }
    } else if (type === "gacha") {
        href = `/gacha/${id}`;
        const gacha = catalog.gachasMap?.get(id);
        if (gacha) {
            const translatedName = translateGameData("gacha", "name", gacha.name);
            label = translatedName || gacha.name;
            subtitle = `${t("page.community.entities.gacha")} · #${id}`;
            imageUrl = getGachaLogoUrl(gacha.assetbundleName, assetSource);
        }
    } else if (type === "costume") {
        href = `/costumes/${id}`;
        const costume = catalog.costumesMap?.get(id);
        if (costume) {
            const translatedName = translateGameData("costumes", "name", costume.name);
            label = translatedName || costume.name;
            subtitle = `${t("page.community.entities.costume")} · #${id}`;
            const firstAsset = getFirstCostumeAsset(costume.parts);
            if (firstAsset) {
                imageUrl = getCostumeThumbnailUrl(firstAsset, assetSource);
            }
        }
    } else if (type === "character") {
        href = `/character/${id}`;
        label = getCharacterName(t, id);
        subtitle = `${t("page.community.entities.character")} · #${id}`;
        imageUrl = getCharacterIconUrl(id);
    }

    return (
        <Link
            href={href}
            className="state-layer focus-ring my-1 mr-1.5 inline-flex max-w-full items-center gap-2.5 rounded-md3-md border border-outline-variant/80 bg-surface-container-low px-2.5 py-1.5 align-middle text-on-surface no-underline transition-colors hover:border-primary/60"
        >
            {imageUrl && (
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-high">
                    <img
                        src={imageUrl}
                        alt={label}
                        loading="lazy"
                        className="h-full w-full object-cover"
                    />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className="truncate type-label-l text-on-surface">{label}</span>
                    {badgeText && (
                        <span className="shrink-0 rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                            {badgeText}
                        </span>
                    )}
                </span>
                <span className="block truncate type-label-s text-on-surface-variant">{subtitle}</span>
            </span>
        </Link>
    );
}

function renderRichTokensInString(
    text: string,
    stampsMap: Map<number, ICommunityStamp> | null,
    catalog: EntityCatalogState,
    keyPrefix: string,
): React.ReactNode {
    const parts = text.split(RICH_TOKEN_RE);
    if (parts.length === 1) return text;

    const nodes: React.ReactNode[] = [];
    // split() with 1 capturing group yields [plain, token, plain, token, ...]
    for (let i = 0; i < parts.length; i += 2) {
        const plain = parts[i];
        if (plain) nodes.push(plain);
        const token = parts[i + 1];
        if (!token) continue;

        const key = `${keyPrefix}-${i}`;
        if (token.startsWith("||") && token.endsWith("||")) {
            nodes.push(<InlineSpoiler key={key} text={token.slice(2, -2)} />);
            continue;
        }
        const match = /^\[(stamp|card|music|event|gacha|costume|character):(\d{1,8})\]$/.exec(token);
        if (!match) {
            nodes.push(token);
            continue;
        }
        const kind = match[1];
        const numericId = Number(match[2]);
        if (!Number.isFinite(numericId)) {
            nodes.push(token);
            continue;
        }
        if (kind === "stamp") {
            nodes.push(<StampView key={key} stampId={numericId} stampsMap={stampsMap} />);
        } else {
            nodes.push(
                <EntityEmbedCard
                    key={key}
                    type={kind as EntityLinkType}
                    id={numericId}
                    catalog={catalog}
                />,
            );
        }
    }
    return nodes;
}

function transformChildren(
    children: React.ReactNode,
    stampsMap: Map<number, ICommunityStamp> | null,
    catalog: EntityCatalogState,
    prefix = "rt",
): React.ReactNode {
    return React.Children.map(children, (child, index) => {
        if (typeof child === "string") {
            return renderRichTokensInString(child, stampsMap, catalog, `${prefix}-${index}`);
        }
        return child;
    });
}

export function CommunityMarkdown({ content, compact = false, className }: CommunityMarkdownProps) {
    const { t } = useI18n();

    const pureStampId = useMemo(() => {
        const match = PURE_STAMP_RE.exec(content);
        return match ? Number(match[1]) : null;
    }, [content]);

    const hasStamps = useMemo(() => {
        return pureStampId !== null || STAMP_DETECT_RE.test(content);
    }, [content, pureStampId]);

    const detectedEntities = useMemo<EntityLinkType[]>(() => {
        if (pureStampId !== null) return [];
        const found = new Set<EntityLinkType>();
        for (const match of content.matchAll(ENTITY_DETECT_RE)) {
            found.add(match[1] as EntityLinkType);
        }
        return Array.from(found);
    }, [content, pureStampId]);

    const { map: stampsMap } = useCommunityStamps(hasStamps);
    const catalog = useCommunityEntityLoader(detectedEntities);

    const components = useMemo<Components>(
        () => ({
            // Disallow arbitrary external images (no user image uploads / hotlinking).
            img: ({ alt }) => (
                <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                    <Icon path={mdHideImage} size={14} />
                    <span>{alt ? `${t("common.comments.imageDisabled")}: ${alt}` : t("common.comments.imageDisabled")}</span>
                </span>
            ),
            a: ({ href, children }) => {
                const sanitized = sanitizeHref(href);
                if (!sanitized) {
                    return <span className="text-on-surface-variant">{children}</span>;
                }
                if (sanitized.external) {
                    return (
                        <ExternalLink
                            href={sanitized.safe}
                            rel="nofollow noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                        >
                            <span>{children}</span>
                            <Icon path={mdOpenInNew} size={14} className="inline-block shrink-0" />
                        </ExternalLink>
                    );
                }
                return (
                    <Link
                        href={sanitized.safe}
                        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                    >
                        {children}
                    </Link>
                );
            },
            p: ({ children }) => (
                <p className={cn("break-words leading-relaxed", compact ? "my-1" : "my-2 first:mt-0 last:mb-0")}>
                    {transformChildren(children, stampsMap, catalog, "p")}
                </p>
            ),
            li: ({ children }) => (
                <li className="my-0.5 break-words">{transformChildren(children, stampsMap, catalog, "li")}</li>
            ),
            blockquote: ({ children }) => (
                <blockquote className="my-2 border-l-4 border-primary/50 bg-surface-container/60 py-1.5 pl-3 pr-2 text-on-surface-variant rounded-r-md3-sm">
                    {children}
                </blockquote>
            ),
            h1: ({ children }) => (
                <h2 className="mt-4 mb-2 type-title-l text-on-surface">
                    {transformChildren(children, stampsMap, catalog, "h1")}
                </h2>
            ),
            h2: ({ children }) => (
                <h3 className="mt-3 mb-1.5 type-title-m text-on-surface">
                    {transformChildren(children, stampsMap, catalog, "h2")}
                </h3>
            ),
            h3: ({ children }) => (
                <h4 className="mt-2.5 mb-1 type-title-s text-on-surface">
                    {transformChildren(children, stampsMap, catalog, "h3")}
                </h4>
            ),
            strong: ({ children }) => (
                <strong className="font-semibold text-on-surface">
                    {transformChildren(children, stampsMap, catalog, "strong")}
                </strong>
            ),
            em: ({ children }) => (
                <em className="italic">{transformChildren(children, stampsMap, catalog, "em")}</em>
            ),
            del: ({ children }) => (
                <del className="line-through opacity-75">
                    {transformChildren(children, stampsMap, catalog, "del")}
                </del>
            ),
            ul: ({ children }) => <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
            hr: () => <hr className="my-3 border-outline-variant" />,
            code: ({ className: codeClassName, children }) => {
                const isBlock = Boolean(codeClassName?.includes("language-"));
                if (isBlock) {
                    return (
                        <code className="block overflow-x-auto font-mono type-body-s text-on-surface">
                            {children}
                        </code>
                    );
                }
                return (
                    <code className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 font-mono type-body-s text-on-surface">
                        {children}
                    </code>
                );
            },
            pre: ({ children }) => (
                <pre className="my-2 overflow-x-auto rounded-md3-md border border-outline-variant bg-surface-container p-3">
                    {children}
                </pre>
            ),
            table: ({ children }) => (
                <div className="my-2 overflow-x-auto rounded-md3-md border border-outline-variant">
                    <table className="w-full border-collapse text-left type-body-s">{children}</table>
                </div>
            ),
            thead: ({ children }) => (
                <thead className="bg-surface-container text-on-surface-variant">{children}</thead>
            ),
            th: ({ children }) => (
                <th className="border-b border-outline-variant px-3 py-2 font-medium">
                    {transformChildren(children, stampsMap, catalog, "th")}
                </th>
            ),
            td: ({ children }) => (
                <td className="border-b border-outline-variant/60 px-3 py-2">
                    {transformChildren(children, stampsMap, catalog, "td")}
                </td>
            ),
        }),
        [catalog, compact, stampsMap, t],
    );

    if (pureStampId !== null) {
        return (
            <div className={cn("inline-flex items-center", className)}>
                <StampView stampId={pureStampId} stampsMap={stampsMap} large />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "min-w-0 break-words type-body-m text-on-surface",
                compact && "line-clamp-4",
                className,
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </div>
    );
}

export function SpoilerCurtain({
    isSpoiler,
    children,
    className,
}: {
    isSpoiler: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    const { t } = useI18n();
    const [revealed, setRevealed] = useState(false);

    if (!isSpoiler || revealed) {
        return <div className={className}>{children}</div>;
    }

    return (
        <div
            className={cn(
                "rounded-md3-md border border-warning/40 bg-warning-container/35 p-4 text-center",
                className,
            )}
        >
            <div className="mb-2 flex items-center justify-center gap-2 type-title-s text-on-surface">
                <Icon path={mdVisibilityOff} size={20} className="text-warning" />
                <span>{t("common.comments.spoiler.curtainTitle")}</span>
            </div>
            <p className="mb-3 type-body-s text-on-surface-variant">
                {t("common.comments.spoiler.curtainDescription")}
            </p>
            <button
                type="button"
                onClick={() => setRevealed(true)}
                className="state-layer focus-ring inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-container px-4 type-label-l text-on-primary-container"
            >
                <Icon path={mdVisibility} size={18} />
                <span>{t("common.comments.spoiler.revealContent")}</span>
            </button>
        </div>
    );
}

export default CommunityMarkdown;
