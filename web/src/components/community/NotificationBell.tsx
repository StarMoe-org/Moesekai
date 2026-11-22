"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { useMoesekaiAccount } from "@/lib/moesekai-account";
import {
    fetchNotifications,
    getCommunityErrorMessage,
    markNotificationsRead,
} from "@/lib/community-api";
import { setUnreadNotificationsCount, useCommunitySession } from "@/lib/community-session";
import {
    getStampImageUrls,
    stripStampPrefix,
    useCommunityStamps,
    type ICommunityStamp,
} from "@/lib/community-masterdata";
import { localizePathForBrowser } from "@/lib/localized-path";
import CommunityAvatar from "./CommunityAvatar";
import {
    Badge,
    Banner,
    Button,
    Dialog,
    EmptyState,
    Icon,
    IconButton,
    LoadingState,
    Tabs,
    cn,
} from "@/components/md3";
import {
    mdChatBubble,
    mdChevronRight,
    mdDoneAll,
    mdFavoriteFill,
    mdGavel,
    mdNotifications,
    mdShield,
} from "@/components/md3/icons";
import type { CommunityNotification, NotificationType } from "@/types/community";

type NotificationCategory = "all" | "comments" | "likes" | "system";

const COMMENT_TYPES = new Set<NotificationType>(["reply_post", "reply_comment"]);
const LIKE_TYPES = new Set<NotificationType>(["like_post", "like_comment"]);
const EXCERPT_TOKEN_RE = /(\[stamp:\d{1,6}\]|\[(?:card|music|event|gacha|costume|character|live):\d{1,8}\])/g;
const STAMP_TOKEN_RE = /^\[stamp:(\d{1,6})\]$/;
const ENTITY_TOKEN_RE = /^\[(card|music|event|gacha|costume|character|live):(\d{1,8})\]$/;
const HAS_STAMP_RE = /\[stamp:\d{1,6}\]/;

function getNotificationCategory(type: NotificationType): Exclude<NotificationCategory, "all"> {
    if (COMMENT_TYPES.has(type)) return "comments";
    if (LIKE_TYPES.has(type)) return "likes";
    return "system";
}

function appendCommentAnchor(baseHref: string, item: CommunityNotification, isEntityTarget = false): string {
    if (item.comment_id) {
        return `${baseHref}#comment-${item.comment_id}`;
    }
    if (
        isEntityTarget &&
        (item.type === "reply_post" || item.type === "reply_comment" || item.type === "like_comment")
    ) {
        return `${baseHref}#community-comments`;
    }
    return baseHref;
}

function notificationHref(item: CommunityNotification): string {
    if (item.post_id) {
        return appendCommentAnchor(`/community/post/${item.post_id}`, item);
    }
    if (!item.target_id) return "/community";
    switch (item.target_type) {
        case "card":
            return appendCommentAnchor(`/cards/${item.target_id}`, item, true);
        case "music":
            return appendCommentAnchor(`/music/${item.target_id}`, item, true);
        case "event":
            return appendCommentAnchor(`/events/${item.target_id}`, item, true);
        case "gacha":
            return appendCommentAnchor(`/gacha/${item.target_id}`, item, true);
        case "costume":
            return appendCommentAnchor(`/costumes/${item.target_id}`, item, true);
        case "character":
            return appendCommentAnchor(`/character/${item.target_id}`, item, true);
        case "live":
            return appendCommentAnchor(`/live/${item.target_id}`, item, true);
        case "ranking": {
            const sep = item.target_id.indexOf("_");
            const region = sep > 0 ? item.target_id.slice(0, sep) : "";
            const base = region
                ? `/realtime-ranking-next?region=${encodeURIComponent(region)}`
                : "/realtime-ranking-next";
            return appendCommentAnchor(base, item, true);
        }
        case "story": {
            const parts = item.target_id.split("_");
            const kind = parts[0];
            if (kind === "event" && parts.length >= 3) {
                return appendCommentAnchor(
                    `/story/event/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`,
                    item,
                    true,
                );
            }
            if (kind === "unit" && parts.length >= 3) {
                return appendCommentAnchor(
                    `/story/unit/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts.slice(2).join("_"))}`,
                    item,
                    true,
                );
            }
            if (kind === "card" && parts.length >= 2) {
                return appendCommentAnchor(`/story/card/${encodeURIComponent(parts[1])}`, item, true);
            }
            if (kind === "self" && parts.length >= 2) {
                return appendCommentAnchor(`/story/self/${encodeURIComponent(parts[1])}`, item, true);
            }
            if (kind === "special" && parts.length >= 2) {
                return appendCommentAnchor(`/story/special/${encodeURIComponent(parts[1])}`, item, true);
            }
            if (kind === "area") {
                return appendCommentAnchor("/story/area", item, true);
            }
            return "/story";
        }
        case "post":
            return appendCommentAnchor(`/community/post/${item.target_id}`, item);
        case "user":
            return `/community/u/${encodeURIComponent(item.target_id)}`;
        default:
            return "/community";
    }
}

function NotificationLeading({
    item,
    actorName,
}: {
    item: CommunityNotification;
    actorName: string;
}) {
    if (item.type === "mod_notice") {
        return (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
                <Icon path={mdShield} size={20} />
            </span>
        );
    }
    if (item.type === "appeal_result") {
        return (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <Icon path={mdGavel} size={20} />
            </span>
        );
    }

    const isLike = LIKE_TYPES.has(item.type);
    return (
        <span className="relative shrink-0">
            <CommunityAvatar
                displayName={actorName}
                avatarUrl={item.actor?.avatar_url}
                avatarCardId={item.actor?.avatar_card_id}
                avatarCardTrained={item.actor?.avatar_card_trained}
                isDeleted={item.actor?.is_deleted}
                sizeClassName="h-10 w-10"
                textClassName="type-label-m"
            />
            <span
                aria-hidden
                className={cn(
                    "absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ring-2 ring-surface-container-high",
                    isLike ? "bg-error text-on-error" : "bg-primary text-on-primary",
                )}
            >
                <Icon path={isLike ? mdFavoriteFill : mdChatBubble} size={10} />
            </span>
        </span>
    );
}

function NotificationStampChip({
    stampId,
    stampsMap,
}: {
    stampId: number;
    stampsMap: Map<number, ICommunityStamp> | null;
}) {
    const { assetSource, serverSource } = useTheme();
    const { t } = useI18n();
    const { t: translateGameData } = useTranslation();
    const [failed, setFailed] = useState(false);
    const stamp = stampsMap?.get(stampId);

    if (!stamp || failed) {
        return (
            <span className="inline-flex items-center rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                {t("common.comments.stampFallback", { id: stampId })}
            </span>
        );
    }

    const urls = getStampImageUrls(stamp, assetSource, serverSource);
    const jpKey = stamp.jpName || stamp.name;
    const translated =
        serverSource === "jp" || stamp.availableOnCurrentServer === false
            ? translateGameData("sticker", "name", jpKey)
            : null;
    const label = stripStampPrefix(translated || stamp.name);

    return (
        <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 align-middle type-label-s text-on-surface-variant">
            <img
                src={urls.primaryUrl}
                alt={label}
                loading="lazy"
                className="h-4 w-4 shrink-0 object-contain"
                onError={(e) => {
                    const img = e.currentTarget;
                    if (urls.jpFallbackUrl !== urls.primaryUrl && img.src !== urls.jpFallbackUrl) {
                        img.src = urls.jpFallbackUrl;
                    } else {
                        setFailed(true);
                    }
                }}
            />
            <span className="max-w-[10rem] truncate">{label}</span>
        </span>
    );
}

function NotificationExcerpt({
    excerpt,
    stampsMap,
}: {
    excerpt: string;
    stampsMap: Map<number, ICommunityStamp> | null;
}) {
    const { t } = useI18n();
    const parts = excerpt.split(EXCERPT_TOKEN_RE);

    return (
        <p className="line-clamp-2 type-body-s text-on-surface-variant">
            {parts.map((part, index) => {
                if (!part) return null;
                const stampMatch = STAMP_TOKEN_RE.exec(part);
                if (stampMatch) {
                    return (
                        <React.Fragment key={index}>
                            <NotificationStampChip
                                stampId={Number(stampMatch[1])}
                                stampsMap={stampsMap}
                            />
                        </React.Fragment>
                    );
                }
                const entityMatch = ENTITY_TOKEN_RE.exec(part);
                if (entityMatch) {
                    const entityType = entityMatch[1];
                    const entityId = entityMatch[2];
                    return (
                        <span
                            key={index}
                            className="inline-flex items-center rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 align-baseline type-label-s text-on-surface-variant"
                        >
                            {t(`page.community.entities.${entityType}`)} #{entityId}
                        </span>
                    );
                }
                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </p>
    );
}

export function NotificationBell() {
    const { t, formatDate } = useI18n();
    const router = useRouter();
    const account = useMoesekaiAccount();
    const isSignedIn = account.status === "signed-in";

    // Only poll /api/community/me eagerly from the topbar when signed in.
    const session = useCommunitySession({ eager: isSignedIn });
    const [open, setOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<NotificationCategory>("all");
    const [items, setItems] = useState<CommunityNotification[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);

    const hasStampExcerpt = useMemo(
        () => open && items.some((item) => Boolean(item.excerpt) && HAS_STAMP_RE.test(item.excerpt)),
        [open, items],
    );
    const { map: stampsMap } = useCommunityStamps(hasStampExcerpt);

    const tRef = useRef(t);
    const requestSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const loadList = useCallback(async (cursor?: string) => {
        const seq = ++requestSeqRef.current;
        if (cursor) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setError(null);
        }
        try {
            const res = await fetchNotifications({ limit: 30, cursor });
            if (seq !== requestSeqRef.current) return;
            setUnreadNotificationsCount(res.unread_count);
            setNextCursor(res.next_cursor ?? null);
            if (cursor) {
                setItems((prev) => {
                    const seen = new Set(prev.map((row) => row.id));
                    return [...prev, ...res.items.filter((row) => !seen.has(row.id))];
                });
            } else {
                setItems(res.items);
            }
        } catch (err) {
            if (seq !== requestSeqRef.current) return;
            setError(getCommunityErrorMessage(err, tRef.current));
        } finally {
            if (seq === requestSeqRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, []);

    useEffect(() => {
        if (open && isSignedIn) {
            void loadList();
        }
        return () => {
            requestSeqRef.current += 1;
        };
    }, [open, isSignedIn, loadList]);

    const categoryStats = useMemo(() => {
        const unreadByCategory: Record<NotificationCategory, number> = {
            all: 0,
            comments: 0,
            likes: 0,
            system: 0,
        };
        for (const item of items) {
            if (!item.is_read) {
                unreadByCategory.all += 1;
                unreadByCategory[getNotificationCategory(item.type)] += 1;
            }
        }
        return unreadByCategory;
    }, [items]);

    const visibleItems = useMemo(() => {
        if (activeCategory === "all") return items;
        return items.filter((item) => getNotificationCategory(item.type) === activeCategory);
    }, [items, activeCategory]);

    if (!isSignedIn || session.status === "unavailable") {
        return null;
    }

    const unread = session.unreadNotifications;
    const allUnreadCount = Math.max(unread, categoryStats.all);

    const handleMarkAllRead = async () => {
        setMarkingAll(true);
        try {
            const res = await markNotificationsRead({ all: true });
            setUnreadNotificationsCount(res.unread_count);
            setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setMarkingAll(false);
        }
    };

    const handleClickItem = (item: CommunityNotification) => {
        if (!item.is_read) {
            markNotificationsRead({ ids: [item.id] })
                .then((res) => setUnreadNotificationsCount(res.unread_count))
                .catch(() => undefined);
            setItems((prev) =>
                prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)),
            );
        }
        const localizedTarget = localizePathForBrowser(notificationHref(item));
        const [targetPath, targetHash = ""] = localizedTarget.split("#", 2);
        const samePathname =
            typeof window !== "undefined" &&
            window.location.pathname === targetPath.split("?", 1)[0] &&
            window.location.search === (targetPath.includes("?") ? `?${targetPath.split("?", 2)[1]}` : "");

        setOpen(false);
        router.push(localizedTarget);

        if (samePathname && targetHash && typeof window !== "undefined") {
            requestAnimationFrame(() => {
                if (window.location.hash !== `#${targetHash}`) {
                    window.location.hash = targetHash;
                } else {
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                }
            });
        }
    };

    const tabItems = [
        {
            value: "all" as const,
            label: t("page.community.notifications.tabs.all"),
            badge: allUnreadCount > 0 ? <Badge value={allUnreadCount} max={99} /> : undefined,
        },
        {
            value: "comments" as const,
            label: t("page.community.notifications.tabs.comments"),
            badge:
                categoryStats.comments > 0 ? (
                    <Badge value={categoryStats.comments} max={99} />
                ) : undefined,
        },
        {
            value: "likes" as const,
            label: t("page.community.notifications.tabs.likes"),
            badge:
                categoryStats.likes > 0 ? (
                    <Badge value={categoryStats.likes} max={99} />
                ) : undefined,
        },
        {
            value: "system" as const,
            label: t("page.community.notifications.tabs.system"),
            badge:
                categoryStats.system > 0 ? (
                    <Badge value={categoryStats.system} max={99} />
                ) : undefined,
        },
    ];

    const emptyDescription =
        activeCategory === "comments"
            ? t("page.community.notifications.emptyCommentsDesc")
            : activeCategory === "likes"
              ? t("page.community.notifications.emptyLikesDesc")
              : activeCategory === "system"
                ? t("page.community.notifications.emptySystemDesc")
                : t("page.community.notifications.emptyDesc");

    return (
        <>
            <div className="relative">
                <IconButton
                    icon={mdNotifications}
                    label={t("page.community.notifications.title")}
                    title={t("page.community.notifications.title")}
                    onClick={() => setOpen(true)}
                />
                {unread > 0 && (
                    <Badge
                        value={unread}
                        max={99}
                        className="pointer-events-none absolute right-1 top-1"
                    />
                )}
            </div>

            <Dialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title={t("page.community.notifications.title")}
                size="md"
                syncHistory={false}
                headerActions={
                    allUnreadCount > 0 ? (
                        <Button
                            variant="text"
                            size="xs"
                            icon={mdDoneAll}
                            disabled={markingAll}
                            onClick={handleMarkAllRead}
                        >
                            {t("page.community.notifications.markAllRead")}
                        </Button>
                    ) : null
                }
            >
                <div className="space-y-3">
                    <Tabs
                        items={tabItems}
                        value={activeCategory}
                        onValueChange={setActiveCategory}
                        variant="secondary"
                        aria-label={t("page.community.notifications.title")}
                    />

                    {error && <Banner tone="error">{error}</Banner>}

                    {loading ? (
                        <LoadingState label={t("common.state.loading")} />
                    ) : visibleItems.length === 0 ? (
                        <EmptyState
                            title={t("page.community.notifications.emptyTitle")}
                            description={emptyDescription}
                        />
                    ) : (
                        <div className="space-y-1.5">
                            {visibleItems.map((item) => {
                                const actorName = item.actor?.is_deleted
                                    ? t("common.comments.deletedUser")
                                    : item.actor?.display_name ||
                                      t("common.comments.anonymousUser");

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleClickItem(item)}
                                        className={cn(
                                            "state-layer focus-ring flex w-full cursor-pointer items-center gap-3 rounded-md3-md border p-3 text-left transition-colors",
                                            item.is_read
                                                ? "border-outline-variant/60 bg-surface-container-lowest hover:border-outline-variant"
                                                : "border-primary/35 bg-primary-container/20 hover:border-primary/60",
                                        )}
                                    >
                                        <NotificationLeading item={item} actorName={actorName} />

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="min-w-0 type-label-l text-on-surface">
                                                    {t(
                                                        `page.community.notifications.types.${item.type}`,
                                                        { actor: actorName },
                                                    )}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                                    {!item.is_read && (
                                                        <span
                                                            className="h-2 w-2 rounded-full bg-primary"
                                                            aria-label={t(
                                                                "page.community.notifications.unreadBadge",
                                                            )}
                                                        />
                                                    )}
                                                    <time className="type-label-s text-on-surface-variant">
                                                        {formatDate(item.created_at, {
                                                            month: "short",
                                                            day: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </time>
                                                </span>
                                            </div>
                                            {item.excerpt && (
                                                <NotificationExcerpt
                                                    excerpt={item.excerpt}
                                                    stampsMap={stampsMap}
                                                />
                                            )}
                                        </div>

                                        <Icon
                                            path={mdChevronRight}
                                            size={18}
                                            className="shrink-0 text-on-surface-variant/70"
                                        />
                                    </button>
                                );
                            })}

                            {nextCursor && (
                                <div className="flex justify-center pt-2">
                                    <Button
                                        variant="text"
                                        size="s"
                                        disabled={loadingMore}
                                        onClick={() => void loadList(nextCursor)}
                                    >
                                        {loadingMore
                                            ? t("common.state.loading")
                                            : t("common.comments.loadMore")}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    );
}

export default NotificationBell;
