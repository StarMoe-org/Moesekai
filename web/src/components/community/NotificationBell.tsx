"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { useMoesekaiAccount } from "@/lib/moesekai-account";
import {
    fetchNotifications,
    getCommunityErrorMessage,
    markNotificationsRead,
} from "@/lib/community-api";
import { setUnreadNotificationsCount, useCommunitySession } from "@/lib/community-session";
import { localizePathForBrowser } from "@/lib/localized-path";
import {
    Badge,
    Banner,
    Button,
    Dialog,
    EmptyState,
    IconButton,
    LoadingState,
    cn,
} from "@/components/md3";
import { mdDoneAll, mdNotifications } from "@/components/md3/icons";
import type { CommunityNotification } from "@/types/community";

function notificationHref(item: CommunityNotification): string {
    if (item.post_id) return `/community/post/${item.post_id}`;
    if (!item.target_id) return "/community";
    switch (item.target_type) {
        case "card":
            return `/cards/${item.target_id}`;
        case "music":
            return `/music/${item.target_id}`;
        case "event":
            return `/events/${item.target_id}`;
        case "gacha":
            return `/gacha/${item.target_id}`;
        case "costume":
            return `/costumes/${item.target_id}`;
        case "character":
            return `/character/${item.target_id}`;
        case "live":
            return `/live/${item.target_id}`;
        case "ranking": {
            const sep = item.target_id.indexOf("_");
            const region = sep > 0 ? item.target_id.slice(0, sep) : "";
            return region
                ? `/realtime-ranking-next?region=${encodeURIComponent(region)}`
                : "/realtime-ranking-next";
        }
        case "story": {
            const parts = item.target_id.split("_");
            const kind = parts[0];
            if (kind === "event" && parts.length >= 3) {
                return `/story/event/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`;
            }
            if (kind === "unit" && parts.length >= 3) {
                return `/story/unit/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts.slice(2).join("_"))}`;
            }
            if (kind === "card" && parts.length >= 2) {
                return `/story/card/${encodeURIComponent(parts[1])}`;
            }
            if (kind === "self" && parts.length >= 2) {
                return `/story/self/${encodeURIComponent(parts[1])}`;
            }
            if (kind === "special" && parts.length >= 2) {
                return `/story/special/${encodeURIComponent(parts[1])}`;
            }
            if (kind === "area") {
                return "/story/area";
            }
            return "/story";
        }
        case "post":
            return `/community/post/${item.target_id}`;
        default:
            return "/community";
    }
}

export function NotificationBell() {
    const { t, formatDate } = useI18n();
    const router = useRouter();
    const account = useMoesekaiAccount();
    const isSignedIn = account.status === "signed-in";

    // Only poll /api/community/me eagerly from the topbar when signed in.
    const session = useCommunitySession({ eager: isSignedIn });
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<CommunityNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);

    const tRef = useRef(t);
    const requestSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const loadList = useCallback(async () => {
        const seq = ++requestSeqRef.current;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchNotifications({ limit: 30 });
            if (seq !== requestSeqRef.current) return;
            setItems(res.items);
            setUnreadNotificationsCount(res.unread_count);
        } catch (err) {
            if (seq !== requestSeqRef.current) return;
            setError(getCommunityErrorMessage(err, tRef.current));
        } finally {
            if (seq === requestSeqRef.current) {
                setLoading(false);
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

    if (!isSignedIn || session.status === "unavailable") {
        return null;
    }

    const unread = session.unreadNotifications;

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

    const handleClickItem = async (item: CommunityNotification) => {
        if (!item.is_read) {
            markNotificationsRead({ ids: [item.id] })
                .then((res) => setUnreadNotificationsCount(res.unread_count))
                .catch(() => undefined);
            setItems((prev) =>
                prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)),
            );
        }
        setOpen(false);
        router.push(localizePathForBrowser(notificationHref(item)));
    };

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
                headerActions={
                    items.some((item) => !item.is_read) ? (
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
                <div className="space-y-2">
                    {error && <Banner tone="error">{error}</Banner>}
                    {loading ? (
                        <LoadingState label={t("common.state.loading")} />
                    ) : items.length === 0 ? (
                        <EmptyState
                            title={t("page.community.notifications.emptyTitle")}
                            description={t("page.community.notifications.emptyDesc")}
                        />
                    ) : (
                        <div className="space-y-1.5">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => void handleClickItem(item)}
                                    className={cn(
                                        "state-layer focus-ring flex w-full flex-col gap-1 rounded-md3-md border p-3 text-left transition-colors",
                                        item.is_read
                                            ? "border-outline-variant/60 bg-surface-container-lowest"
                                            : "border-primary/35 bg-primary-container/25",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="type-label-l text-on-surface">
                                            {t(`page.community.notifications.types.${item.type}`, {
                                                actor:
                                                    item.actor?.display_name ||
                                                    t("common.comments.anonymousUser"),
                                            })}
                                        </span>
                                        <time className="shrink-0 type-label-s text-on-surface-variant">
                                            {formatDate(item.created_at, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </time>
                                    </div>
                                    {item.excerpt && (
                                        <p className="line-clamp-2 type-body-s text-on-surface-variant">
                                            {item.excerpt}
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    );
}

export default NotificationBell;
