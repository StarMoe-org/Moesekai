"use client";

import React, { useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import {
    getCharacterIconUrl,
    getCostumeThumbnailUrl,
    getEventLogoUrl,
    getGachaLogoUrl,
    getMusicJacketUrl,
    getVirtualLiveBannerUrl,
} from "@/lib/assets";
import { getCardDefaultTrainedStatus, getRarityNumber } from "@/types/types";
import {
    getCardAvatarImageUrls,
    useCommunityEntityLoader,
} from "@/lib/community-masterdata";
import { Dialog, EmptyState, LoadingState, Tabs, TextField } from "@/components/md3";
import { mdSearch } from "@/components/md3/icons";
import { ENTITY_LINK_TYPE_OPTIONS, type EntityLinkType } from "@/types/community";

interface EntityInserterProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (token: string) => void;
}

interface PickerRow {
    id: number;
    title: string;
    subtitle: string;
    imageUrl: string | null;
}

const CHARACTER_IDS = Array.from({ length: 26 }, (_, idx) => idx + 1);
const MAX_RESULTS = 40;

export function EntityInserter({ isOpen, onClose, onInsert }: EntityInserterProps) {
    const { t } = useI18n();
    const { assetSource, serverSource } = useTheme();
    const { t: translateGameData } = useTranslation();

    const [activeType, setActiveType] = useState<EntityLinkType>("card");
    const [query, setQuery] = useState("");

    const requestedTypes = useMemo<EntityLinkType[]>(
        () => (isOpen && activeType !== "character" ? [activeType] : []),
        [isOpen, activeType],
    );
    const catalog = useCommunityEntityLoader(requestedTypes);

    const rows = useMemo<PickerRow[]>(() => {
        const q = query.trim().toLowerCase();
        const matches = (id: number, raw: string, translated?: string | null, extra?: string) => {
            if (!q) return true;
            return (
                String(id).includes(q) ||
                raw.toLowerCase().includes(q) ||
                Boolean(translated && translated.toLowerCase().includes(q)) ||
                Boolean(extra && extra.toLowerCase().includes(q))
            );
        };

        if (activeType === "card") {
            const list = [...catalog.cards].sort((a, b) => b.id - a.id);
            const result: PickerRow[] = [];
            for (const card of list) {
                const charName = getCharacterName(t, card.characterId);
                const translated = translateGameData("cards", "prefix", card.prefix);
                if (!matches(card.id, card.prefix, translated, charName)) continue;
                const rarity =
                    card.cardRarityType === "rarity_birthday"
                        ? "BD"
                        : `${getRarityNumber(card.cardRarityType)}★`;
                result.push({
                    id: card.id,
                    title: translated || card.prefix,
                    subtitle: `${charName} · ${rarity} · #${card.id}`,
                    imageUrl: getCardAvatarImageUrls(
                        card,
                        getCardDefaultTrainedStatus(card),
                        assetSource,
                        serverSource,
                        catalog.cardsLocalIds ? catalog.cardsLocalIds.has(card.id) : undefined,
                    ).primaryUrl,
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        if (activeType === "music") {
            const list = [...catalog.musics].sort((a, b) => b.id - a.id);
            const result: PickerRow[] = [];
            for (const music of list) {
                const translated = translateGameData("music", "title", music.title);
                if (!matches(music.id, music.title, translated)) continue;
                result.push({
                    id: music.id,
                    title: translated || music.title,
                    subtitle: `#${music.id}`,
                    imageUrl: getMusicJacketUrl(music.assetbundleName, assetSource),
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        if (activeType === "event") {
            const list = [...catalog.events].sort((a, b) => b.id - a.id);
            const result: PickerRow[] = [];
            for (const event of list) {
                const translated = translateGameData("events", "name", event.name);
                if (!matches(event.id, event.name, translated)) continue;
                result.push({
                    id: event.id,
                    title: translated || event.name,
                    subtitle: `#${event.id}`,
                    imageUrl: getEventLogoUrl(event.assetbundleName, assetSource),
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        if (activeType === "gacha") {
            const list = [...catalog.gachas].sort((a, b) => b.id - a.id);
            const result: PickerRow[] = [];
            for (const gacha of list) {
                const translated = translateGameData("gacha", "name", gacha.name);
                if (!matches(gacha.id, gacha.name, translated)) continue;
                result.push({
                    id: gacha.id,
                    title: translated || gacha.name,
                    subtitle: `#${gacha.id}`,
                    imageUrl: getGachaLogoUrl(gacha.assetbundleName, assetSource),
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        if (activeType === "costume") {
            const list = [...catalog.costumes].sort((a, b) => b.costumeNumber - a.costumeNumber);
            const result: PickerRow[] = [];
            for (const costume of list) {
                const translated = translateGameData("costumes", "name", costume.name);
                if (!matches(costume.costumeNumber, costume.name, translated)) continue;
                const firstPart = Object.values(costume.parts ?? {}).find((p) => p && p.length > 0)?.[0];
                result.push({
                    id: costume.costumeNumber,
                    title: translated || costume.name,
                    subtitle: `#${costume.costumeNumber}`,
                    imageUrl: firstPart
                        ? getCostumeThumbnailUrl(firstPart.assetbundleName, assetSource)
                        : null,
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        if (activeType === "live") {
            const list = [...catalog.virtualLives].sort((a, b) => b.id - a.id);
            const result: PickerRow[] = [];
            for (const live of list) {
                const translated = translateGameData("virtualLive", "name", live.name);
                if (!matches(live.id, live.name, translated)) continue;
                result.push({
                    id: live.id,
                    title: translated || live.name,
                    subtitle: `#${live.id}`,
                    imageUrl: getVirtualLiveBannerUrl(live.assetbundleName, assetSource),
                });
                if (result.length >= MAX_RESULTS) break;
            }
            return result;
        }

        return CHARACTER_IDS.map((charId) => {
            const name = getCharacterName(t, charId);
            return {
                id: charId,
                title: name,
                subtitle: `#${charId}`,
                imageUrl: getCharacterIconUrl(charId),
            };
        }).filter((row) => matches(row.id, row.title));
    }, [activeType, assetSource, catalog, query, serverSource, t, translateGameData]);

    const tabItems = useMemo(
        () =>
            ENTITY_LINK_TYPE_OPTIONS.map((opt) => ({
                value: opt.id,
                label: t(opt.labelKey),
            })),
        [t],
    );

    const handleSelect = (id: number) => {
        onInsert(`[${activeType}:${id}]`);
        onClose();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("common.comments.entityInserter.title")}
            size="lg"
            fullscreenOnMobile
            className="sm:h-[min(85vh,720px)]"
            bodyClassName="flex flex-col gap-3 overflow-hidden"
        >
            <div className="shrink-0">
                <Tabs
                    items={tabItems}
                    value={activeType}
                    onValueChange={(next) => {
                        setActiveType(next);
                        setQuery("");
                    }}
                    variant="secondary"
                    scrollable
                />
            </div>

            <div className="shrink-0">
                <TextField
                    value={query}
                    onValueChange={setQuery}
                    icon={mdSearch}
                    clearable
                    placeholder={t("common.comments.entityInserter.searchPlaceholder")}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md3-md bg-surface-container p-2">
                {catalog.loading && rows.length === 0 ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        title={t("common.comments.entityInserter.empty")}
                        description={t("common.comments.entityInserter.emptyHint")}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {rows.map((row) => (
                            <button
                                key={`${activeType}-${row.id}`}
                                type="button"
                                onClick={() => handleSelect(row.id)}
                                className="state-layer focus-ring flex items-center gap-3 rounded-md3-md bg-surface-container-lowest p-2.5 text-left transition-colors hover:bg-surface-container-high"
                            >
                                {row.imageUrl && (
                                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container">
                                        <img
                                            src={row.imageUrl}
                                            alt={row.title}
                                            loading="lazy"
                                            className="h-full w-full object-cover"
                                        />
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate type-title-s text-on-surface">
                                        {row.title}
                                    </span>
                                    <span className="block truncate type-label-s text-on-surface-variant">
                                        {row.subtitle}
                                    </span>
                                </span>
                                <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-on-surface-variant">
                                    [{activeType}:{row.id}]
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Dialog>
    );
}

export default EntityInserter;
