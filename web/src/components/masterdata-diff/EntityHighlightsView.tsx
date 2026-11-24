"use client";

import { useState } from "react";
import LocalizedLink from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import {
    getCardThumbnailUrl,
    getCostumeThumbnailUrl,
    getEventBannerUrl,
    getGachaBannerUrl,
    getMusicJacketUrl,
    getMysekaiFixtureThumbnailUrl,
    getStampUrl,
    getVirtualLiveBannerUrl,
} from "@/lib/assets";
import { Button, Card, EmptyState, Icon, Surface } from "@/components/md3";
import { mdChevronRight, mdDescription, mdLayers } from "@/components/md3/icons";
import type {
    MasterdataDiffServer,
    MasterdataEntityGroup,
    MasterdataEntityItem,
} from "@/types/masterdataDiff";

interface EntityHighlightsViewProps {
    server: MasterdataDiffServer;
    groups: MasterdataEntityGroup[];
    onInspectFile: (filePath: string) => void;
}

function resolveAssetSource(assetSource: string, server: MasterdataDiffServer): AssetSourceType {
    const isOverseas = assetSource === "overseas" || assetSource.startsWith("overseas");
    if (server === "cn") {
        return isOverseas ? "overseas-cn" : "main-cn";
    }
    return isOverseas ? "overseas-jp" : "main-jp";
}

function resolveEntityThumbnail(
    groupKey: string,
    item: MasterdataEntityItem,
    source: AssetSourceType,
): string | null {
    const asset = item.assetbundleName;
    switch (groupKey) {
        case "events":
            return asset ? getEventBannerUrl(asset, source) : null;
        case "gachas": {
            const numId = Number(item.id);
            return Number.isFinite(numId) && numId > 0 ? getGachaBannerUrl(numId, source) : null;
        }
        case "cards":
            return asset ? getCardThumbnailUrl(item.characterId || 0, asset, false, source) : null;
        case "musics":
            return asset ? getMusicJacketUrl(asset, source) : null;
        case "virtualLives":
            return asset ? getVirtualLiveBannerUrl(asset, source) : null;
        case "costume3ds":
            return asset ? getCostumeThumbnailUrl(asset, source) : null;
        case "stamps":
            return asset ? getStampUrl(asset, source) : null;
        case "mysekaiFixtures":
            return asset ? getMysekaiFixtureThumbnailUrl(asset, source) : null;
        default:
            return null;
    }
}

function changeBadgeClasses(changeType: "added" | "modified" | "removed"): string {
    switch (changeType) {
        case "added":
            return "bg-primary-container text-on-primary-container";
        case "removed":
            return "bg-error-container text-on-error-container";
        default:
            return "bg-tertiary-container text-on-tertiary-container";
    }
}

function EntityThumbnail({ src, alt, square }: { src: string; alt: string; square: boolean }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <div
            className={
                square
                    ? "h-14 w-14 shrink-0 overflow-hidden rounded-md3-s bg-surface-container-highest"
                    : "h-14 w-28 shrink-0 overflow-hidden rounded-md3-s bg-surface-container-highest"
            }
        >
            <img
                src={src}
                alt={alt}
                loading="lazy"
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
            />
        </div>
    );
}

export default function EntityHighlightsView({
    server,
    groups,
    onInspectFile,
}: EntityHighlightsViewProps) {
    const { t, formatDate } = useI18n();
    const { assetSource } = useTheme();
    const resolvedSource = resolveAssetSource(assetSource, server);

    if (!groups || groups.length === 0) {
        return (
            <EmptyState
                icon={mdLayers}
                title={t("page.masterdataDiff.entities.emptyTitle")}
                description={t("page.masterdataDiff.entities.emptyDescription")}
            />
        );
    }

    return (
        <div className="space-y-5">
            {groups.map((group) => {
                const groupLabelKey = `page.masterdataDiff.groups.${group.key}`;
                const translated = t(groupLabelKey);
                const groupTitle = translated === groupLabelKey ? group.key : translated;
                const isSquareThumb =
                    group.key === "cards" ||
                    group.key === "musics" ||
                    group.key === "costume3ds" ||
                    group.key === "stamps" ||
                    group.key === "mysekaiFixtures";

                return (
                    <Card
                        key={group.key}
                        variant="outlined"
                        className="overflow-hidden border-outline-variant bg-surface-container-low"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="type-title-m text-on-surface">{groupTitle}</h3>
                                {group.addedCount > 0 && (
                                    <span className="rounded-md3-full bg-primary-container px-2.5 py-0.5 type-label-s text-on-primary-container">
                                        +{group.addedCount}
                                    </span>
                                )}
                                {group.modifiedCount > 0 && (
                                    <span className="rounded-md3-full bg-tertiary-container px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                        ~{group.modifiedCount}
                                    </span>
                                )}
                                {group.removedCount > 0 && (
                                    <span className="rounded-md3-full bg-error-container px-2.5 py-0.5 type-label-s text-on-error-container">
                                        -{group.removedCount}
                                    </span>
                                )}
                            </div>

                            <Button
                                variant="text"
                                size="xs"
                                icon={mdDescription}
                                onClick={() => onInspectFile(group.file)}
                            >
                                {t("page.masterdataDiff.entities.inspectJson")}
                            </Button>
                        </div>

                        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                            {group.items.map((item) => {
                                const thumb = resolveEntityThumbnail(group.key, item, resolvedSource);
                                const changeLabel = t(`page.masterdataDiff.changeType.${item.changeType}`);
                                const inner = (
                                    <Surface
                                        tone="default"
                                        className="flex h-full items-start gap-3 rounded-md3-m border border-outline-variant/70 p-3 transition-colors state-layer"
                                    >
                                        {thumb && (
                                            <EntityThumbnail
                                                src={thumb}
                                                alt={item.title}
                                                square={isSquareThumb}
                                            />
                                        )}
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`shrink-0 rounded-md3-xs px-1.5 py-0.5 type-label-s ${changeBadgeClasses(item.changeType)}`}
                                                >
                                                    {changeLabel}
                                                </span>
                                                <span className="type-label-s text-on-surface-variant">
                                                    #{item.id}
                                                </span>
                                            </div>
                                            <p className="type-title-s text-on-surface line-clamp-2">
                                                {item.title}
                                            </p>
                                            {item.subtitle && (
                                                <p className="type-body-s text-on-surface-variant truncate">
                                                    {item.subtitle}
                                                </p>
                                            )}
                                            {item.startAt ? (
                                                <p className="type-label-s text-on-surface-variant">
                                                    {formatDate(new Date(item.startAt), {
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                    {item.endAt
                                                        ? ` – ${formatDate(new Date(item.endAt), {
                                                              month: "2-digit",
                                                              day: "2-digit",
                                                              hour: "2-digit",
                                                              minute: "2-digit",
                                                          })}`
                                                        : ""}
                                                </p>
                                            ) : null}
                                            {item.changedFields && item.changedFields.length > 0 && (
                                                <div className="flex flex-wrap gap-1 pt-0.5">
                                                    {item.changedFields.slice(0, 4).map((f) => (
                                                        <span
                                                            key={f}
                                                            className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant"
                                                        >
                                                            {f}
                                                        </span>
                                                    ))}
                                                    {item.changedFields.length > 4 && (
                                                        <span className="type-label-s text-on-surface-variant">
                                                            +{item.changedFields.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {item.detailPath && (
                                            <Icon
                                                path={mdChevronRight}
                                                size={18}
                                                className="mt-0.5 shrink-0 text-on-surface-variant"
                                            />
                                        )}
                                    </Surface>
                                );

                                if (item.detailPath) {
                                    return (
                                        <LocalizedLink
                                            key={`${group.key}-${item.changeType}-${item.id}`}
                                            href={item.detailPath}
                                            className="block rounded-md3-m focus-ring"
                                        >
                                            {inner}
                                        </LocalizedLink>
                                    );
                                }
                                return (
                                    <div key={`${group.key}-${item.changeType}-${item.id}`}>
                                        {inner}
                                    </div>
                                );
                            })}
                        </div>

                        {group.truncated && (
                            <div className="border-t border-outline-variant/60 px-5 py-2.5 text-right">
                                <Button
                                    variant="text"
                                    size="xs"
                                    onClick={() => onInspectFile(group.file)}
                                >
                                    {t("page.masterdataDiff.entities.viewAllInFileDiff")}
                                </Button>
                            </div>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}
