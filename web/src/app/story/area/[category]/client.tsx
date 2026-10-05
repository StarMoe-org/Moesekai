"use client";
import { Card, ErrorState, Icon, LoadingState, PageContainer } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";
import { StoryBackButton, StoryBadge } from "@/components/story/StoryReaderChrome";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import { IEventInfo } from "@/types/events";
import { loadTranslations } from "@/lib/translations";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";
import { getAreaCategory, urlParamToCategory, type IActionSet, type AreaCategory } from "../areaCategory";

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface IArea { id: number; name: string; subName?: string; }
interface ICharacter2D {
    id: number; characterType: string; characterId: number;
}

function getTalkTypeLabel(action: IActionSet, cat: AreaCategory, t: TranslationFn): string {
    if (typeof cat !== "number") return "";
    const sid = action.scenarioId ?? "";
    if (sid.includes("_ev_")) return t("page.story.area.talkType.event");
    if (sid.includes("_wl_")) return t("page.story.area.talkType.wl");
    if (sid.includes("_monthly")) return t("page.story.area.talkType.monthly");
    if (sid.includes("_add_")) return t("page.story.area.talkType.additional");
    return "";
}

function getStaticCategoryLabel(category: AreaCategory, t: TranslationFn): string {
    if (typeof category === "number") return t("page.story.area.eventCategoryFallback", { id: category });
    if (category === "grade1") return t("page.story.area.grade1Label");
    if (category === "grade2") return t("page.story.area.grade2Label");
    if (category === "theater") return t("page.story.area.theaterLabel");
    if (category.startsWith("limited_")) return t("page.story.area.limitedCategoryFallback", { id: category.replace("limited_", "") });
    if (category.startsWith("aprilfool")) return t("page.story.area.aprilFoolCategory", { year: category.replace("aprilfool", "") });
    return category;
}

export default function StoryAreaDetailClient() {
    const params = useParams();
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const areaIdParam = decodeURIComponent(params.category as string);
    const category = urlParamToCategory(areaIdParam);

    const [actions, setActions] = useState<IActionSet[]>([]);
    const [areaMap, setAreaMap] = useState<Map<number, IArea>>(new Map());
    const [chara2dMap, setChara2dMap] = useState<Map<number, number>>(new Map());
    const [eventName, setEventName] = useState<string>("");
    const [eventNameCn, setEventNameCn] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useSimpleScrollRestore(`story_area_${areaIdParam}`, !isLoading);

    useEffect(() => {
        async function load() {
            try {
                const [actionSetsData, areasData, eventsData, translationsData, chara2dsData] = await Promise.all([
                    fetchMasterData<IActionSet[]>("actionSets.json"),
                    fetchMasterData<IArea[]>("areas.json"),
                    fetchMasterData<IEventInfo[]>("events.json"),
                    loadTranslations(),
                    fetchMasterData<ICharacter2D[]>("character2ds.json"),
                ]);
                setAreaMap(new Map(areasData.map(a => [a.id, a])));

                // Build character2dId → gameCharacterId map (game_character only)
                const c2dMap = new Map<number, number>();
                for (const c of chara2dsData) {
                    if (c.characterType === "game_character") {
                        c2dMap.set(c.id, c.characterId);
                    }
                }
                setChara2dMap(c2dMap);

                const matched = actionSetsData.filter(a => getAreaCategory(a) === category);
                if (matched.length === 0) throw new Error(t("page.story.area.categoryNotFound"));
                setActions(matched);

                if (typeof category === "number") {
                    const ev = eventsData.find(e => e.id === category);
                    if (ev) {
                        const cn = translationsData?.events?.name?.[ev.name];
                        setEventName(ev.name);
                        setEventNameCn(cn && cn !== ev.name ? cn : "");
                        const displayName = cn && cn !== ev.name
                            ? t("page.story.area.eventCategoryWithTranslation", { id: category, name: ev.name, translation: cn })
                            : t("page.story.area.eventCategory", { id: category, name: ev.name });
                        document.title = t("page.story.area.documentTitle", { name: displayName });
                    }
                } else {
                    document.title = t("page.story.area.documentTitle", { name: getStaticCategoryLabel(category, t) });
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [areaIdParam, serverSource, t]);

    const pageTitle = useMemo(() => {
        if (typeof category === "number") {
            if (!eventName) return t("page.story.area.eventCategoryFallback", { id: category });
            return eventNameCn
                ? t("page.story.area.eventCategoryWithTranslation", { id: category, name: eventName, translation: eventNameCn })
                : t("page.story.area.eventCategory", { id: category, name: eventName });
        }
        return getStaticCategoryLabel(category, t);
    }, [category, eventName, eventNameCn, t]);

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href="/story/area">{t("page.story.area.backToCategories")}</StoryBackButton>

                <div className="mb-6">
                    <h1 className="type-headline-s text-on-surface sm:type-headline-m">{pageTitle}</h1>
                    {!isLoading && !error && (
                        <p className="mt-1 type-body-m text-on-surface-variant">{t("page.story.area.dialogueCount", { count: actions.length })}</p>
                    )}
                </div>

                {isLoading && <LoadingState label={t("common.state.loading")} />}
                {error && <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />}

                {!isLoading && !error && (
                    <div className="space-y-2">
                        {actions.map((action, idx) => {
                            const area = areaMap.get(action.areaId);
                            const areaName = area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : t("page.story.area.areaFallback", { id: action.areaId });
                            const typeLabel = getTalkTypeLabel(action, category, t);

                            // Resolve characterIds (character2d ids) → gameCharacter ids (1-26) and sort
                            const gameCharaIds = [...new Set(
                                (action.characterIds ?? [])
                                    .map(c2dId => chara2dMap.get(c2dId))
                                    .filter((id): id is number => id !== undefined && id >= 1 && id <= 26)
                            )].sort((a, b) => a - b);

                            return (
                                <Card
                                    key={action.id}
                                    href={`/story/area/${encodeURIComponent(areaIdParam)}/${encodeURIComponent(action.scenarioId ?? "")}`}
                                    variant="filled"
                                    className="group flex items-center justify-between p-4"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        {/* Character avatars */}
                                        {gameCharaIds.length > 0 ? (
                                            <div className="flex shrink-0 -space-x-2">
                                                {gameCharaIds.map(charaId => (
                                                    <img
                                                        key={charaId}
                                                        src={getCharacterIconUrl(charaId)}
                                                        alt=""
                                                        className="h-8 w-8 rounded-full border-2 border-surface-container-highest object-cover"
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container type-label-m text-on-secondary-container">
                                                {idx + 1}
                                            </span>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="type-title-s text-on-surface transition-colors group-hover:text-primary">{areaName}</span>
                                                {typeLabel && <StoryBadge tone="neutral">{typeLabel}</StoryBadge>}
                                            </div>
                                            <p className="mt-0.5 type-body-s text-on-surface-variant">
                                                ID: {action.id}:{action.scenarioId}
                                            </p>
                                        </div>
                                    </div>
                                    <Icon path={mdChevronRight} size={20} className="ml-2 text-on-surface-variant" />
                                </Card>
                            );
                        })}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
