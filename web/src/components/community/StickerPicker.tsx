"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import { getCharacterIconUrl } from "@/lib/assets";
import { UNIT_DATA, UNIT_DATA_LABEL_KEYS } from "@/types/types";
import {
    getStampImageUrls,
    stripStampPrefix,
    useCommunityStamps,
    type ICommunityStamp,
} from "@/lib/community-masterdata";
import { patchCommunitySessionPreferences, useCommunitySession } from "@/lib/community-session";
import {
    Button,
    Chip,
    Dialog,
    EmptyState,
    Icon,
    LoadingState,
    Switch,
    TextField,
    cn,
} from "@/components/md3";
import {
    mdBrokenImage,
    mdHistory,
    mdSearch,
    mdSentimentSatisfied,
    mdStar,
    mdStarFill,
} from "@/components/md3/icons";

const RECENT_STAMPS_KEY = "moesekai_community_recent_stamps_v1";
const FAVORITE_STAMPS_KEY = "moesekai_community_favorite_stamps_v1";
const MAX_RECENT_STAMPS = 20;
const MAX_FAVORITE_STAMPS = 100;
const PAGE_SIZE = 60;

const OTHER_CHARACTER = 0;

const isKnownCharacter = (id: number | null | undefined): id is number =>
    typeof id === "number" && id >= 1 && id <= 26;

function sanitizeIdList(raw: unknown, max: number): number[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const item of raw) {
        if (typeof item === "number" && Number.isInteger(item) && item > 0 && !seen.has(item)) {
            seen.add(item);
            out.push(item);
            if (out.length >= max) break;
        }
    }
    return out;
}

function loadStoredIds(storageKey: string, max: number): number[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        return sanitizeIdList(JSON.parse(raw), max);
    } catch {
        return [];
    }
}

function persistIds(storageKey: string, ids: number[]): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
        // Ignore storage errors
    }
}

function saveRecentStampId(id: number): number[] {
    const existing = loadStoredIds(RECENT_STAMPS_KEY, MAX_RECENT_STAMPS).filter((item) => item !== id);
    const next = [id, ...existing].slice(0, MAX_RECENT_STAMPS);
    persistIds(RECENT_STAMPS_KEY, next);
    return next;
}

function StampTileImg({
    primaryUrl,
    jpFallbackUrl,
    alt,
}: {
    primaryUrl: string;
    jpFallbackUrl: string;
    alt: string;
}) {
    const [usedJpFallback, setUsedJpFallback] = useState(false);
    const [failed, setFailed] = useState(false);

    if (failed) {
        return (
            <span className="flex h-full w-full items-center justify-center rounded-md3-sm bg-surface-container text-on-surface-variant">
                <Icon path={mdBrokenImage} size={22} />
            </span>
        );
    }

    const src = usedJpFallback ? jpFallbackUrl : primaryUrl;
    return (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-contain"
            onError={() => {
                if (!usedJpFallback && jpFallbackUrl !== primaryUrl) {
                    setUsedJpFallback(true);
                } else {
                    setFailed(true);
                }
            }}
        />
    );
}

type CategoryTab = "all" | "favorites" | "recent" | "other" | number;

interface StickerPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (stampId: number) => void;
    /** Optional handler for one-tap pure sticker reply submission. */
    onQuickSend?: (stampId: number) => void;
    defaultQuickSend?: boolean;
}

export function StickerPicker({
    isOpen,
    onClose,
    onSelect,
    onQuickSend,
    defaultQuickSend = false,
}: StickerPickerProps) {
    const { t } = useI18n();
    const { assetSource, serverSource, isShowSpoiler } = useTheme();
    const { t: translateGameData } = useTranslation();
    const session = useCommunitySession({ eager: false });
    const { stamps, map: stampsMap, loading } = useCommunityStamps(isOpen);

    const [selectedUnit, setSelectedUnit] = useState<string>("all");
    const [selectedTab, setSelectedTab] = useState<CategoryTab>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [quickSendMode, setQuickSendMode] = useState(defaultQuickSend);
    const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
    const [nowTs] = useState<number>(() => Date.now());
    const [recentIds, setRecentIds] = useState<number[]>(() =>
        loadStoredIds(RECENT_STAMPS_KEY, MAX_RECENT_STAMPS),
    );
    const [localFavorites, setLocalFavorites] = useState<number[]>(() =>
        loadStoredIds(FAVORITE_STAMPS_KEY, MAX_FAVORITE_STAMPS),
    );
    const [localDirty, setLocalDirty] = useState(false);

    const serverFavorites = useMemo(
        () =>
            session.authenticated && Array.isArray(session.profile?.favorite_stamps)
                ? sanitizeIdList(session.profile.favorite_stamps, MAX_FAVORITE_STAMPS)
                : null,
        [session.authenticated, session.profile],
    );

    const favoriteIds = useMemo(
        () => (!localDirty && serverFavorites !== null ? serverFavorites : localFavorites),
        [localDirty, localFavorites, serverFavorites],
    );

    // Mirror server-hydrated favorites (including empty list) to localStorage.
    useEffect(() => {
        if (!localDirty && serverFavorites !== null) {
            persistIds(FAVORITE_STAMPS_KEY, serverFavorites);
        }
    }, [localDirty, serverFavorites]);

    const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

    const resolveDisplayName = useCallback(
        (stamp: ICommunityStamp): string => {
            const jpKey = stamp.jpName || stamp.name;
            // Use LLM translation overlay when on JP server or when viewing a JP-only newer stamp.
            if (serverSource === "jp" || stamp.availableOnCurrentServer === false) {
                const translated = translateGameData("sticker", "name", jpKey);
                if (translated) return stripStampPrefix(translated);
            }
            return stripStampPrefix(stamp.name);
        },
        [serverSource, translateGameData],
    );

    const toggleFavorite = useCallback(
        (stampId: number, e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const exists = favoriteIds.includes(stampId);
            const next = exists
                ? favoriteIds.filter((id) => id !== stampId)
                : [stampId, ...favoriteIds].slice(0, MAX_FAVORITE_STAMPS);
            setLocalDirty(true);
            setLocalFavorites(next);
            persistIds(FAVORITE_STAMPS_KEY, next);
            if (session.authenticated) {
                void patchCommunitySessionPreferences({ favorite_stamps: next }).catch(
                    () => undefined,
                );
            }
        },
        [favoriteIds, session.authenticated],
    );

    const charactersInStamps = useMemo(() => {
        const ids = new Set<number>();
        for (const stamp of stamps) {
            if (isKnownCharacter(stamp.characterId1)) ids.add(stamp.characterId1);
            if (isKnownCharacter(stamp.characterId2)) ids.add(stamp.characterId2);
        }
        return ids;
    }, [stamps]);

    const visibleCharacters = useMemo(() => {
        const unitObj = UNIT_DATA.find((u) => u.id === selectedUnit);
        const candidates = unitObj
            ? unitObj.charIds
            : UNIT_DATA.flatMap((u) => u.charIds);
        return candidates.filter((id) => charactersInStamps.has(id));
    }, [charactersInStamps, selectedUnit]);

    const hasOtherStamps = useMemo(
        () =>
            stamps.some(
                (s) => !isKnownCharacter(s.characterId1) && !isKnownCharacter(s.characterId2),
            ),
        [stamps],
    );

    const filteredStamps = useMemo<ICommunityStamp[]>(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const activeUnitChars =
            selectedUnit !== "all"
                ? new Set(UNIT_DATA.find((u) => u.id === selectedUnit)?.charIds ?? [])
                : null;

        let sourceList: ICommunityStamp[];
        if (selectedTab === "favorites") {
            sourceList = favoriteIds
                .map((id) => stampsMap?.get(id))
                .filter(
                    (item): item is ICommunityStamp =>
                        Boolean(item && item.isCanonical !== false),
                );
        } else if (selectedTab === "recent") {
            sourceList = recentIds
                .map((id) => stampsMap?.get(id))
                .filter(
                    (item): item is ICommunityStamp =>
                        Boolean(item && item.isCanonical !== false),
                );
        } else {
            sourceList = stamps.filter((stamp) => {
                if (!isShowSpoiler && stamp.archivePublishedAt && stamp.archivePublishedAt > nowTs) {
                    return false;
                }
                if (selectedTab === "other" || selectedTab === OTHER_CHARACTER) {
                    return !isKnownCharacter(stamp.characterId1) && !isKnownCharacter(stamp.characterId2);
                }
                if (typeof selectedTab === "number") {
                    return stamp.characterId1 === selectedTab || stamp.characterId2 === selectedTab;
                }
                if (activeUnitChars) {
                    return (
                        activeUnitChars.has(stamp.characterId1) ||
                        (typeof stamp.characterId2 === "number" && activeUnitChars.has(stamp.characterId2))
                    );
                }
                return true;
            });
            // ID ascending so classic stamps appear at the top across All / Unit / Character views.
            sourceList = [...sourceList].sort((a, b) => a.id - b.id);
        }

        if (!normalizedQuery) return sourceList;
        return sourceList.filter((stamp) => {
            const c1 = isKnownCharacter(stamp.characterId1)
                ? getCharacterName(t, stamp.characterId1).toLowerCase()
                : "";
            const c2 = isKnownCharacter(stamp.characterId2)
                ? getCharacterName(t, stamp.characterId2).toLowerCase()
                : "";
            const displayName = resolveDisplayName(stamp).toLowerCase();
            const translated = stamp.jpName
                ? (translateGameData("sticker", "name", stamp.jpName)?.toLowerCase() ?? "")
                : "";
            return (
                stamp.name.toLowerCase().includes(normalizedQuery) ||
                (stamp.jpName?.toLowerCase().includes(normalizedQuery) ?? false) ||
                displayName.includes(normalizedQuery) ||
                translated.includes(normalizedQuery) ||
                String(stamp.id).includes(normalizedQuery) ||
                c1.includes(normalizedQuery) ||
                c2.includes(normalizedQuery)
            );
        });
    }, [
        favoriteIds,
        isShowSpoiler,
        nowTs,
        recentIds,
        resolveDisplayName,
        searchQuery,
        selectedTab,
        selectedUnit,
        stamps,
        stampsMap,
        t,
        translateGameData,
    ]);

    const displayedStamps = useMemo(
        () => filteredStamps.slice(0, visibleLimit),
        [filteredStamps, visibleLimit],
    );

    const handlePick = (stamp: ICommunityStamp) => {
        setRecentIds(saveRecentStampId(stamp.id));
        if (quickSendMode && onQuickSend) {
            onQuickSend(stamp.id);
        } else {
            onSelect(stamp.id);
        }
        onClose();
    };

    const handleTabChange = (nextTab: CategoryTab) => {
        setSelectedTab(nextTab);
        setVisibleLimit(PAGE_SIZE);
    };

    const handleUnitChange = (unitId: string) => {
        setSelectedUnit(unitId);
        if (typeof selectedTab === "number") {
            const unitObj = UNIT_DATA.find((u) => u.id === unitId);
            if (unitObj && !unitObj.charIds.includes(selectedTab)) {
                setSelectedTab("all");
            }
        } else if (selectedTab === "favorites" || selectedTab === "recent" || selectedTab === "other") {
            setSelectedTab("all");
        }
        setVisibleLimit(PAGE_SIZE);
    };

    const canonicalFavoriteCount = useMemo(
        () =>
            stampsMap
                ? favoriteIds.filter((id) => {
                      const entry = stampsMap.get(id);
                      return Boolean(entry && entry.isCanonical !== false);
                  }).length
                : favoriteIds.length,
        [favoriteIds, stampsMap],
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("common.comments.stickerPicker.title")}
            size="lg"
            fullscreenOnMobile
            className="sm:h-[min(85vh,760px)]"
            bodyClassName="flex flex-col gap-3 overflow-hidden"
        >
            {/* Search & quick-send bar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <TextField
                    value={searchQuery}
                    onValueChange={(value) => {
                        setSearchQuery(value);
                        setVisibleLimit(PAGE_SIZE);
                    }}
                    icon={mdSearch}
                    clearable
                    placeholder={t("common.comments.stickerPicker.searchPlaceholder")}
                    containerClassName="min-w-[200px] flex-1"
                />
                {onQuickSend && (
                    <Switch
                        checked={quickSendMode}
                        onCheckedChange={setQuickSendMode}
                        label={t("common.comments.stickerPicker.quickSend")}
                    />
                )}
            </div>

            {/* Primary collections & unit categorization (never clipped) */}
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 sm:flex-wrap sm:overflow-visible">
                <Chip
                    variant="filter"
                    selected={selectedTab === "all" && selectedUnit === "all"}
                    icon={mdSentimentSatisfied}
                    className="shrink-0"
                    onClick={() => {
                        setSelectedUnit("all");
                        handleTabChange("all");
                    }}
                >
                    {t("common.comments.stickerPicker.all")}
                </Chip>
                <Chip
                    variant="filter"
                    selected={selectedTab === "favorites"}
                    icon={mdStarFill}
                    className="shrink-0"
                    onClick={() => handleTabChange("favorites")}
                >
                    {t("common.comments.stickerPicker.favorites")}
                    {canonicalFavoriteCount > 0 ? ` (${canonicalFavoriteCount})` : ""}
                </Chip>
                {recentIds.length > 0 && (
                    <Chip
                        variant="filter"
                        selected={selectedTab === "recent"}
                        icon={mdHistory}
                        className="shrink-0"
                        onClick={() => handleTabChange("recent")}
                    >
                        {t("common.comments.stickerPicker.recent")}
                    </Chip>
                )}
                {UNIT_DATA.map((unit) => (
                    <Chip
                        key={unit.id}
                        variant="filter"
                        className="shrink-0"
                        selected={
                            selectedUnit === unit.id &&
                            selectedTab !== "favorites" &&
                            selectedTab !== "recent" &&
                            selectedTab !== "other"
                        }
                        onClick={() => handleUnitChange(selectedUnit === unit.id ? "all" : unit.id)}
                    >
                        {t(UNIT_DATA_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`)}
                    </Chip>
                ))}
                {hasOtherStamps && (
                    <Chip
                        variant="filter"
                        className="shrink-0"
                        selected={selectedTab === "other"}
                        onClick={() => handleTabChange(selectedTab === "other" ? "all" : "other")}
                    >
                        {t("common.comments.stickerPicker.other")}
                    </Chip>
                )}
            </div>

            {/* Character avatar filter strip (never clipped) */}
            {visibleCharacters.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto scrollbar-hide px-1 py-1.5 sm:flex-wrap sm:overflow-visible">
                    {visibleCharacters.map((charId) => {
                        const name = getCharacterName(t, charId);
                        const selected = selectedTab === charId;
                        return (
                            <button
                                key={charId}
                                type="button"
                                onClick={() => handleTabChange(selected ? "all" : charId)}
                                title={name}
                                aria-label={name}
                                aria-pressed={selected}
                                className={cn(
                                    "focus-ring relative h-8 w-8 shrink-0 overflow-hidden rounded-full transition-shadow",
                                    selected
                                        ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-high"
                                        : "ring-1 ring-outline-variant hover:ring-primary",
                                )}
                            >
                                <Image
                                    src={getCharacterIconUrl(charId)}
                                    alt={name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </button>
                        );
                    })}
                </div>
            )}

            <p className="shrink-0 type-label-s text-on-surface-variant">
                {session.authenticated
                    ? t("common.comments.stickerPicker.favoritesSyncedHint")
                    : t("common.comments.stickerPicker.officialOnlyHint")}
            </p>

            {/* Scrollable stamp grid */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md3-md bg-surface-container p-2.5">
                {loading && stamps.length === 0 ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : displayedStamps.length === 0 ? (
                    <EmptyState
                        title={
                            selectedTab === "favorites"
                                ? t("common.comments.stickerPicker.favoritesEmpty")
                                : t("common.comments.stickerPicker.empty")
                        }
                        description={
                            selectedTab === "favorites"
                                ? t("common.comments.stickerPicker.favoritesEmptyHint")
                                : t("common.comments.stickerPicker.emptyHint")
                        }
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                            {displayedStamps.map((stamp) => {
                                const isFav = favoriteSet.has(stamp.id);
                                const displayName = resolveDisplayName(stamp);
                                const urls = getStampImageUrls(stamp, assetSource, serverSource);
                                return (
                                    <div key={stamp.id} className="relative">
                                        <button
                                            type="button"
                                            onClick={() => handlePick(stamp)}
                                            title={displayName}
                                            className="state-layer focus-ring flex w-full flex-col items-center gap-1 rounded-md3-md bg-surface-container-lowest p-2 pt-3 text-center transition-colors hover:bg-surface-container-high"
                                        >
                                            <span className="relative block aspect-square w-full max-w-[76px]">
                                                <StampTileImg
                                                    key={`${stamp.id}-${assetSource}-${serverSource}`}
                                                    primaryUrl={urls.primaryUrl}
                                                    jpFallbackUrl={urls.jpFallbackUrl}
                                                    alt={displayName}
                                                />
                                            </span>
                                            <span className="w-full truncate type-label-s text-on-surface-variant">
                                                {displayName}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => toggleFavorite(stamp.id, e)}
                                            aria-label={
                                                isFav
                                                    ? t("common.comments.stickerPicker.removeFavorite")
                                                    : t("common.comments.stickerPicker.addFavorite")
                                            }
                                            aria-pressed={isFav}
                                            title={
                                                isFav
                                                    ? t("common.comments.stickerPicker.removeFavorite")
                                                    : t("common.comments.stickerPicker.addFavorite")
                                            }
                                            className={cn(
                                                "focus-ring absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                                                isFav
                                                    ? "border-primary/30 bg-primary-container text-primary shadow-elev-1"
                                                    : "border-outline-variant/60 bg-surface-container-lowest/90 text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-primary",
                                            )}
                                        >
                                            <Icon path={isFav ? mdStarFill : mdStar} size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {filteredStamps.length > visibleLimit && (
                            <div className="mt-3 text-center">
                                <Button
                                    variant="tonal"
                                    size="xs"
                                    onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                                >
                                    {t("common.comments.loadMore")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}

export default StickerPicker;
