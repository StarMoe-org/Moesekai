"use client";

import React from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { Icon, cn } from "@/components/md3";
import { mdShield, mdStar, mdVerified } from "@/components/md3/icons";
import {
    TRUST_LEVEL_LABEL_KEYS,
    type AuthorSummary,
    type CardOwnershipBadge,
} from "@/types/community";
import CommunityAvatar, { safeAvatarUrl } from "./CommunityAvatar";

export { safeAvatarUrl };

interface CommunityAuthorBadgeProps {
    author: AuthorSummary;
    cardBadge?: CardOwnershipBadge | null;
    timestamp?: string;
    compact?: boolean;
    className?: string;
}

export function CommunityAuthorBadge({
    author,
    cardBadge,
    timestamp,
    compact = false,
    className,
}: CommunityAuthorBadgeProps) {
    const { t, formatDate } = useI18n();
    const displayName = author.is_deleted
        ? t("common.comments.deletedUser")
        : author.display_name || t("common.comments.anonymousUser");

    const avatarNode = (
        <CommunityAvatar
            displayName={displayName}
            avatarUrl={author.avatar_url}
            avatarCardId={author.avatar_card_id}
            avatarCardTrained={author.avatar_card_trained}
            isDeleted={author.is_deleted}
            sizeClassName={compact ? "h-7 w-7" : "h-9 w-9"}
            textClassName="type-label-m"
        />
    );

    const formattedTime = timestamp
        ? formatDate(timestamp, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : null;

    const isMod = author.role === "mod" || author.role === "admin";
    const isCreator = author.trust_level === 3;
    const primaryServer = author.verified_badge?.primary_server?.toUpperCase();

    return (
        <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
            {author.is_deleted ? (
                avatarNode
            ) : (
                <Link
                    href={`/community/u/${encodeURIComponent(author.sub)}`}
                    className="focus-ring shrink-0 rounded-full"
                    title={displayName}
                >
                    {avatarNode}
                </Link>
            )}

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    {author.is_deleted ? (
                        <span className="truncate type-title-s text-on-surface-variant">{displayName}</span>
                    ) : (
                        <Link
                            href={`/community/u/${encodeURIComponent(author.sub)}`}
                            className="focus-ring truncate rounded-md3-xs type-title-s text-on-surface hover:text-primary"
                        >
                            {displayName}
                        </Link>
                    )}

                    {isMod && (
                        <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                            <Icon path={mdShield} size={13} />
                            <span>
                                {author.role === "admin"
                                    ? t("page.community.roles.admin")
                                    : t("page.community.roles.mod")}
                            </span>
                        </span>
                    )}

                    {!isMod && isCreator && (
                        <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                            <Icon path={mdStar} size={13} />
                            <span>{t(TRUST_LEVEL_LABEL_KEYS[3])}</span>
                        </span>
                    )}

                    {!author.is_deleted && author.verified_badge?.haruki_verified && primaryServer && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded-md3-xs bg-primary-container/70 px-1.5 py-0.5 type-label-s text-on-primary-container"
                            title={t("common.comments.verifiedServerTooltip", { server: primaryServer })}
                        >
                            <Icon path={mdVerified} size={13} />
                            <span>{primaryServer}</span>
                        </span>
                    )}

                    {cardBadge?.owned && (
                        <span className="inline-flex items-center gap-1 rounded-md3-xs border border-primary/30 bg-primary-container/45 px-1.5 py-0.5 type-label-s text-on-primary-container">
                            <span>
                                {t("common.comments.cardOwnedBadge", {
                                    server: cardBadge.server.toUpperCase(),
                                })}
                            </span>
                            {cardBadge.master_rank > 0 && (
                                <span>{t("common.comments.masterRankShort", { rank: cardBadge.master_rank })}</span>
                            )}
                            {cardBadge.trained && <span>{t("common.comments.trainedShort")}</span>}
                        </span>
                    )}
                </div>

                {formattedTime && (
                    <time
                        dateTime={timestamp}
                        className="block truncate type-label-s text-on-surface-variant"
                    >
                        {formattedTime}
                    </time>
                )}
            </div>
        </div>
    );
}

export default CommunityAuthorBadge;
