"use client";
import { Card, ErrorState, Icon, LoadingState, PageContainer, TextField } from "@/components/md3";
import { mdChevronRight, mdKeyboardArrowDown, mdSearch } from "@/components/md3/icons";
import { useState, useEffect, useMemo } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { IEventInfo } from "@/types/events";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";
import { StoryPageHeader } from "@/components/story/StoryPageHeader";
import { getAreaCategory, categoryToUrlParam, type IActionSet, type AreaCategory } from "./areaCategory";

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface IArea { id: number; name: string; subName?: string; }

function categoryLabel(cat: AreaCategory, eventMap: Map<number, string>, translations: TranslationData | null, t: TranslationFn, areaMap?: Map<number, IArea>): string {
    if (typeof cat === "number") {
        const name = eventMap.get(cat);
        if (!name) return t("page.story.area.eventCategoryFallback", { id: cat });
        const cnName = translations?.events?.name?.[name];
        return cnName && cnName !== name
            ? t("page.story.area.eventCategoryWithTranslation", { id: cat, name, translation: cnName })
            : t("page.story.area.eventCategory", { id: cat, name });
    }
    if (cat === "grade1") return t("page.story.area.grade1Label");
    if (cat === "grade2") return t("page.story.area.grade2Label");
    if (cat === "theater") return t("page.story.area.theaterLabel");
    if (cat.startsWith("limited_")) {
        const areaId = parseInt(cat.replace("limited_", ""), 10);
        const area = areaMap?.get(areaId);
        if (area) {
            const name = area.subName ? `${area.name} - ${area.subName}` : area.name;
            return t("page.story.area.limitedCategoryWithName", { name });
        }
        return t("page.story.area.limitedCategoryFallback", { id: areaId });
    }
    if (cat.startsWith("aprilfool")) return t("page.story.area.aprilFoolCategory", { year: cat.replace("aprilfool", "") });
    return cat;
}

export default function StoryAreaListClient() {
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const [actionSets, setActionSets] = useState<IActionSet[]>([]);
    const [events, setEvents] = useState<IEventInfo[]>([]);
    const [areas, setAreas] = useState<IArea[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    useSimpleScrollRestore("story_area", !isLoading);

    useEffect(() => {
        async function load() {
            try {
                const [actionSetsData, eventsData, areasData, translationsData] = await Promise.all([
                    fetchMasterData<IActionSet[]>("actionSets.json"),
                    fetchMasterData<IEventInfo[]>("events.json"),
                    fetchMasterData<IArea[]>("areas.json"),
                    loadTranslations(),
                ]);
                setActionSets(actionSetsData);
                setEvents(eventsData);
                setAreas(areasData);
                setTranslations(translationsData);
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [serverSource, t]);

    const eventMap = useMemo(() => new Map(events.map(e => [e.id, e.name])), [events]);
    const areaMap = useMemo(() => new Map(areas.map(a => [a.id, a])), [areas]);

    // Collect all unique categories
    const categories = useMemo(() => {
        const seen = new Set<string>();
        const result: AreaCategory[] = [];
        for (const action of actionSets) {
            const cat = getAreaCategory(action);
            if (cat === "") continue;
            const key = String(cat);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(cat);
            }
        }
        // Sort: numbers (events) first desc, then strings
        result.sort((a, b) => {
            if (typeof a === "number" && typeof b === "number") return b - a;
            if (typeof a === "number") return -1;
            if (typeof b === "number") return 1;
            return String(a).localeCompare(String(b));
        });
        return result;
    }, [actionSets]);

    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return categories;
        const q = searchQuery.toLowerCase();
        return categories.filter(cat => {
            const label = categoryLabel(cat, eventMap, translations, t).toLowerCase();
            return label.includes(q) || String(cat).toLowerCase().includes(q);
        });
    }, [categories, searchQuery, eventMap, translations, t]);

    // Group: events, grade, theater, limited, aprilfool
    const grouped = useMemo(() => {
        const eventCats = filteredCategories.filter(c => typeof c === "number") as number[];
        const gradeCats = filteredCategories.filter(c => c === "grade1" || c === "grade2");
        const theaterCats = filteredCategories.filter(c => c === "theater");
        const limitedCats = filteredCategories.filter(c => typeof c === "string" && c.startsWith("limited_"));
        const aprilfoolCats = filteredCategories.filter(c => typeof c === "string" && c.startsWith("aprilfool"));
        return { eventCats, gradeCats, theaterCats, limitedCats, aprilfoolCats };
    }, [filteredCategories]);

    return (
        <MainLayout>
            <PageContainer>
                <StoryPageHeader storyKey="area" />

                <TextField
                    data-shortcut-search="true"
                    type="text"
                    icon={mdSearch}
                    placeholder={t("page.story.area.searchPlaceholder")}
                    aria-label={t("page.story.area.searchPlaceholder")}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    clearable
                    clearLabel={t("common.md3.clear")}
                    containerClassName="mb-6"
                />

                {isLoading && <LoadingState label={t("common.state.loading")} />}
                {error && <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />}

                {!isLoading && !error && (
                    <div className="space-y-6">
                        {(grouped.gradeCats.length > 0 || grouped.theaterCats.length > 0) && (
                            <Section title={t("page.story.area.dailySectionTitle")} storageKey="grade_theater">
                                {[...grouped.gradeCats, ...grouped.theaterCats].map(cat => (
                                    <CategoryLink key={String(cat)} cat={cat} eventMap={eventMap} translations={translations} areaMap={areaMap} />
                                ))}
                            </Section>
                        )}
                        {grouped.eventCats.length > 0 && (
                            <Section title={t("page.story.area.eventSectionTitle", { count: grouped.eventCats.length })} storageKey="events">
                                {grouped.eventCats.map(cat => (
                                    <CategoryLink key={String(cat)} cat={cat} eventMap={eventMap} translations={translations} areaMap={areaMap} />
                                ))}
                            </Section>
                        )}
                        {grouped.limitedCats.length > 0 && (
                            <Section title={t("page.story.area.limitedSectionTitle")} storageKey="limited">
                                {grouped.limitedCats.map(cat => (
                                    <CategoryLink key={String(cat)} cat={cat} eventMap={eventMap} translations={translations} areaMap={areaMap} />
                                ))}
                            </Section>
                        )}
                        {grouped.aprilfoolCats.length > 0 && (
                            <Section title={t("page.story.area.aprilFoolSectionTitle")} storageKey="aprilfool">
                                {grouped.aprilfoolCats.map(cat => (
                                    <CategoryLink key={String(cat)} cat={cat} eventMap={eventMap} translations={translations} areaMap={areaMap} />
                                ))}
                            </Section>
                        )}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}

function Section({ title, storageKey, children }: { title: string; storageKey: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(() => {
        try {
            const saved = sessionStorage.getItem(`area_section_${storageKey}`);
            return saved === null ? true : saved === "1";
        } catch { return true; }
    });

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try { sessionStorage.setItem(`area_section_${storageKey}`, next ? "1" : "0"); } catch { /* ignore */ }
    };

    return (
        <section>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="state-layer focus-ring group -ml-2 mb-3 flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-on-surface"
            >
                <Icon
                    path={mdKeyboardArrowDown}
                    size={20}
                    className={`text-on-surface-variant transition-transform duration-200 ease-md3-standard ${open ? "rotate-0" : "-rotate-90"}`}
                />
                <h2 className="type-title-m">{title}</h2>
            </button>
            {open && <div className="space-y-1.5">{children}</div>}
        </section>
    );
}

function CategoryLink({ cat, eventMap, translations, areaMap }: { cat: AreaCategory; eventMap: Map<number, string>; translations: TranslationData | null; areaMap?: Map<number, IArea> }) {
    const { t } = useI18n();
    const label = categoryLabel(cat, eventMap, translations, t, areaMap);
    const urlParam = categoryToUrlParam(cat);
    return (
        <Card href={`/story/area/${encodeURIComponent(urlParam)}`} variant="filled" className="group flex items-center justify-between p-3 pl-4">
            <span className="type-body-l text-on-surface transition-colors group-hover:text-primary">{label}</span>
            <Icon path={mdChevronRight} size={20} className="text-on-surface-variant" />
        </Card>
    );
}
