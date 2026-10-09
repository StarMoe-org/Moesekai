"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { searchableNavItems, SEARCH_GROUP_LABEL_KEYS, SEARCH_GROUP_ROUTES, SEARCH_STATIC_GROUP_LABEL_KEYS, NAV_ITEM_LABEL_KEYS } from "@/lib/navigation";
import { CHARACTER_NAMES } from "@/types/types";
import { getPrimaryShortcutLabel, isKeyboardEventComposing } from "@/lib/shortcuts";
import { fetchMusicAliases } from "@/lib/musicAliases";
import { SEARCH_INDEX_URL } from "@/lib/lyrics-aliases.mjs";
import { useI18n } from "@/contexts/I18nContext";
import { md3EffectsDefault, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { CircularProgress, Icon, IconButton, Switch, cn } from "@/components/md3";
import { mdArrowBack, mdClose, mdSearch } from "@/components/md3/icons";

// Dynamic search index item from search-index.json
interface SearchIndexItem {
    id: number;
    n: string;   // name (JP)
    cn?: string;  // name (CN translation)
    en?: string;  // name (EN translation)
    g: string;    // group: cards, music, events, gacha
    c?: number;   // characterId (cards only)
}

// Search result with matched alias info
interface SearchResultItem extends SearchIndexItem {
    matchedAlias?: string; // The alias that matched the search query
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (href: string) => void;
}

function escapeRegExp(string: string) {
    return string.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

// Max dynamic results per group
const MAX_DYNAMIC_PER_GROUP = 8;
const WILDCARD_STORAGE_KEY = "moesekai_search_wildcard_enabled";

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
    const [mounted, setMounted] = useState(false);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [activeIndex, setActiveIndex] = useState(0);
    const [useWildcard, setUseWildcard] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef(false);
    const compositionEndedAtRef = useRef(0);

    const handleCompositionStart = useCallback(() => {
        isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        compositionEndedAtRef.current = Date.now();
        setQuery(e.currentTarget.value);
    }, []);

    // Dynamic search index state (loaded once per session)
    const [searchIndex, setSearchIndex] = useState<SearchIndexItem[] | null>(null);
    const [musicAliasesMap, setMusicAliasesMap] = useState<Map<number, string[]> | null>(null);
    const [isLoadingIndex, setIsLoadingIndex] = useState(false);
    const indexLoadedRef = useRef(false);
    const wildcardShortcut = getPrimaryShortcutLabel("toggle-search-wildcard");
    const { locale, t } = useI18n();
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        try {
            const savedWildcard = localStorage.getItem(WILDCARD_STORAGE_KEY);
            if (savedWildcard === "true") {
                setUseWildcard(true);
            }
        } catch {}
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        try {
            localStorage.setItem(WILDCARD_STORAGE_KEY, String(useWildcard));
        } catch {}
    }, [useWildcard, mounted]);

    // Load search index on first open
    useEffect(() => {
        if (isOpen && !indexLoadedRef.current && !isLoadingIndex) {
            indexLoadedRef.current = true;
            setIsLoadingIndex(true);

            // Aliases are optional and must not delay the primary multilingual index.
            fetch(SEARCH_INDEX_URL)
                .then((res) => res.json() as Promise<SearchIndexItem[]>)
                .then((indexData) => {
                    setSearchIndex(indexData);
                })
                .catch((err) => {
                    console.warn("Failed to load search index:", err);
                })
                .finally(() => {
                    setIsLoadingIndex(false);
                });

            fetchMusicAliases()
                .then(setMusicAliasesMap)
                .catch(() => setMusicAliasesMap(new Map()));
        }
    }, [isOpen, isLoadingIndex]);

    // Filter items based on query
    const searchRegex = useMemo(() => {
        if (!useWildcard) return null;
        const q = deferredQuery.trim();
        if (!q) return null;
        try {
            // Convert * and ? to regex equivalents, escape other regex specials
            const parts = q.split(/([*?])/);
            const regexPattern = parts.map(part => {
                if (part === '*') return '.*';
                if (part === '?') return '.';
                return escapeRegExp(part);
            }).join('');
            return new RegExp(regexPattern, 'i');
        } catch (_e) {
            return null;
        }
    }, [deferredQuery, useWildcard]);

    const filtered = useMemo(() => {
        const qStr = deferredQuery.trim();
        if (!qStr) return searchableNavItems;
        const q = qStr.toLowerCase();

        return searchableNavItems.filter((item) => {
            if (searchRegex) {
                const label = t(NAV_ITEM_LABEL_KEYS[item.href] ?? item.href);
                const groupLabel = t(SEARCH_STATIC_GROUP_LABEL_KEYS[item.group] ?? item.group);
                return searchRegex.test(label) ||
                    searchRegex.test(item.href) ||
                    searchRegex.test(groupLabel) ||
                    item.keywords.some((kw) => searchRegex.test(kw));
            } else {
                const label = t(NAV_ITEM_LABEL_KEYS[item.href] ?? item.href).toLowerCase();
                const groupLabel = t(SEARCH_STATIC_GROUP_LABEL_KEYS[item.group] ?? item.group).toLowerCase();
                return label.includes(q) ||
                    item.href.toLowerCase().includes(q) ||
                    groupLabel.includes(q) ||
                    item.keywords.some((kw) => kw.toLowerCase().includes(q));
            }
        });
    }, [deferredQuery, searchRegex, t]);

    // Filter dynamic search index items based on query
    const dynamicFiltered = useMemo(() => {
        const qStr = deferredQuery.trim();
        if (!qStr || !searchIndex) return [];
        const q = qStr.toLowerCase();

        const matched: SearchResultItem[] = searchIndex.map((item) => {
            const idStr = item.id.toString();
            if (searchRegex) {
                if (searchRegex.test(idStr)) return { ...item };
                if (searchRegex.test(item.n)) return { ...item };
                if (item.cn && searchRegex.test(item.cn)) return { ...item };
                if (item.en && searchRegex.test(item.en)) return { ...item };
                if (item.c) {
                    const charName = CHARACTER_NAMES[item.c];
                    if (charName && searchRegex.test(charName)) return { ...item };
                }
                // Match music aliases
                if (item.g === "music" && musicAliasesMap) {
                    const aliases = musicAliasesMap.get(item.id);
                    if (aliases) {
                        const matchedAlias = aliases.find(alias => searchRegex!.test(alias));
                        if (matchedAlias) return { ...item, matchedAlias };
                    }
                }
                return null;
            } else {
                if (idStr === qStr) return { ...item }; // Exact ID match
                if (item.n.toLowerCase().includes(q)) return { ...item };
                if (item.cn && item.cn.toLowerCase().includes(q)) return { ...item };
                if (item.en && item.en.toLowerCase().includes(q)) return { ...item };
                // For cards, also search by character name
                if (item.c) {
                    const charName = CHARACTER_NAMES[item.c];
                    if (charName && charName.toLowerCase().includes(q)) return { ...item };
                }
                // Match music aliases
                if (item.g === "music" && musicAliasesMap) {
                    const aliases = musicAliasesMap.get(item.id);
                    if (aliases) {
                        const matchedAlias = aliases.find(alias => alias.toLowerCase().includes(q));
                        if (matchedAlias) return { ...item, matchedAlias };
                    }
                }
                return null;
            }
        }).filter((item): item is SearchResultItem => item !== null);

        // Group and limit results
        const grouped: Record<string, SearchResultItem[]> = {};
        for (const item of matched) {
            if (!grouped[item.g]) grouped[item.g] = [];
            if (grouped[item.g].length < MAX_DYNAMIC_PER_GROUP) {
                grouped[item.g].push(item);
            }
        }

        return Object.entries(grouped).flatMap(([, items]) => items);
    }, [deferredQuery, searchIndex, searchRegex, musicAliasesMap]);

    // Combined flat list for keyboard navigation
    const totalItems = filtered.length + dynamicFiltered.length;

    // Group filtered static items
    const grouped = useMemo(() => {
        const groups: { titleKey: string; items: typeof filtered }[] = [];
        const groupMap = new Map<string, typeof filtered>();
        for (const item of filtered) {
            const existing = groupMap.get(item.group);
            if (existing) {
                existing.push(item);
            } else {
                const arr = [item];
                groupMap.set(item.group, arr);
                groups.push({ titleKey: SEARCH_STATIC_GROUP_LABEL_KEYS[item.group] ?? item.group, items: arr });
            }
        }
        return groups;
    }, [filtered]);

    // Group dynamic items
    const dynamicGrouped = useMemo(() => {
        const groups: { titleKey: string; items: SearchResultItem[] }[] = [];
        const groupMap = new Map<string, SearchResultItem[]>();
        for (const item of dynamicFiltered) {
            const groupKey = SEARCH_GROUP_LABEL_KEYS[item.g] || item.g;
            const existing = groupMap.get(groupKey);
            if (existing) {
                existing.push(item);
            } else {
                const arr = [item];
                groupMap.set(groupKey, arr);
                groups.push({ titleKey: groupKey, items: arr });
            }
        }
        return groups;
    }, [dynamicFiltered]);

    // Reset state when opening/closing
    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setActiveIndex(0);
            // Focus input after animation starts
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    // Prevent body scroll while preserving any existing overflow override.
    useEffect(() => {
        if (!isOpen) return;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousBodyOverflow;
        };
    }, [isOpen]);

    // Reset active index when filtered results change
    useEffect(() => {
        setActiveIndex(0);
    }, [filtered, dynamicFiltered]);

    const navigate = useCallback(
        (href: string) => {
            onNavigate(href);
        },
        [onNavigate]
    );

    // Scroll active item into view
    useEffect(() => {
        if (!listRef.current) return;
        const activeEl = listRef.current.querySelector("[data-active='true']");
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (
                isComposingRef.current ||
                isKeyboardEventComposing(e.nativeEvent) ||
                e.nativeEvent.isComposing ||
                e.key === "Process" ||
                (e as unknown as { keyCode?: number }).keyCode === 229
            ) {
                return;
            }

            // On macOS / WebKit / Blink, confirming an IME composition with Enter
            // dispatches a keydown for Enter immediately after compositionend.
            if (e.key === "Enter" && Date.now() - compositionEndedAtRef.current < 100) {
                return;
            }

            switch (e.key) {
                case "ArrowDown":
                    if (totalItems === 0) return;
                    e.preventDefault();
                    setActiveIndex((prev) => (prev + 1) % totalItems);
                    break;
                case "ArrowUp":
                    if (totalItems === 0) return;
                    e.preventDefault();
                    setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
                    break;
                case "Enter":
                    if (totalItems === 0) return;
                    e.preventDefault();
                    if (activeIndex < filtered.length) {
                        navigate(filtered[activeIndex].href);
                    } else {
                        const dynIdx = activeIndex - filtered.length;
                        if (dynamicFiltered[dynIdx]) {
                            const item = dynamicFiltered[dynIdx];
                            const route = SEARCH_GROUP_ROUTES[item.g] || `/${item.g}`;
                            navigate(`${route}/${item.id}`);
                        }
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
                case "q":
                case "Q":
                case "œ":
                    // macOS Option+Q triggers œ, keep both for compatibility
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        setUseWildcard((prev) => !prev);
                    }
                    break;
            }
        },
        [filtered, dynamicFiltered, activeIndex, navigate, onClose, totalItems]
    );

    // Flat index counter for rendering
    let flatIndex = -1;

    if (!mounted) return null;

    const kbdClass = "inline-flex items-center rounded-md3-xs border border-outline-variant px-1.5 type-label-s text-on-surface-variant";
    const groupHeaderClass = "flex items-center gap-2 px-4 pb-1 pt-3 type-title-s text-primary";
    const rowClass = (isActive: boolean) =>
        cn(
            "state-layer flex w-full min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left",
            isActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
        );

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] isolate flex items-start justify-center sm:px-4 sm:pt-[min(15vh,6rem)]">
                    {/* Scrim */}
                    <motion.div
                        className="absolute inset-0 bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={prefersReducedMotion ? reducedMotionFade : md3EffectsDefault}
                        onClick={onClose}
                    />

                    {/* Search view — full screen on compact, docked dialog on wider windows */}
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("search.commandPalette.placeholder")}
                        className="relative flex h-full w-full flex-col overflow-hidden bg-surface-container-high text-on-surface shadow-elev-3 sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-md3-xl"
                        style={{ transformOrigin: "top center" }}
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.9, y: -12 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scaleY: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.95, y: -8 }}
                        transition={prefersReducedMotion ? reducedMotionFade : md3SpatialDefault}
                        onKeyDown={handleKeyDown}
                    >
                        {/* Search bar */}
                        <div className="shrink-0 p-2 sm:p-3">
                            <div className="flex h-12 items-center gap-1 rounded-md3-md bg-surface-container-highest pl-1 pr-1 sm:bg-surface-container">
                                <IconButton
                                    icon={mdArrowBack}
                                    label={t("common.action.close")}
                                    onClick={onClose}
                                    className="sm:hidden"
                                />
                                <Icon path={mdSearch} size={20} className="ml-3 hidden shrink-0 text-on-surface-variant sm:block" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onCompositionStart={handleCompositionStart}
                                    onCompositionEnd={handleCompositionEnd}
                                    placeholder={t("search.commandPalette.placeholder")}
                                    aria-label={t("search.commandPalette.placeholder")}
                                    className="min-w-0 flex-1 bg-transparent px-2 type-body-l text-on-surface outline-none placeholder:text-on-surface-variant"
                                />
                                {query && (
                                    <IconButton
                                        icon={mdClose}
                                        label={t("common.md3.clear")}
                                        onClick={() => {
                                            setQuery("");
                                            inputRef.current?.focus();
                                        }}
                                    />
                                )}
                                <kbd className={cn(kbdClass, "hidden sm:inline-flex")}>{t("common.shortcut.escape")}</kbd>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 px-3">
                                <span className="flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                    {t("search.commandPalette.wildcard")}
                                    <kbd className={cn(kbdClass, "hidden font-mono sm:inline-flex")}>{wildcardShortcut}</kbd>
                                </span>
                                <Switch
                                    checked={useWildcard}
                                    onCheckedChange={setUseWildcard}
                                    aria-label={t("search.commandPalette.wildcard")}
                                />
                            </div>
                        </div>

                        <div className="h-px shrink-0 bg-outline-variant" role="separator" />

                        {/* Results */}
                        <div ref={listRef} role="listbox" className="flex-1 overflow-y-auto overscroll-contain py-2">
                            {totalItems === 0 && !isLoadingIndex ? (
                                <div className="px-4 py-10 text-center type-body-m text-on-surface-variant">
                                    {t("search.commandPalette.noResults")}
                                </div>
                            ) : (
                                <>
                                    {/* Static navigation results */}
                                    {grouped.map((group) => (
                                        <div key={group.titleKey} role="group">
                                            <div className={groupHeaderClass}>{t(group.titleKey)}</div>
                                            {group.items.map((item) => {
                                                flatIndex++;
                                                const isActive = flatIndex === activeIndex;
                                                const idx = flatIndex;
                                                return (
                                                    <button
                                                        key={item.href}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={isActive}
                                                        data-active={isActive}
                                                        onClick={() => navigate(item.href)}
                                                        onMouseEnter={() => setActiveIndex(idx)}
                                                        className={rowClass(isActive)}
                                                    >
                                                        <span className="truncate type-body-l">{t(NAV_ITEM_LABEL_KEYS[item.href] ?? item.href)}</span>
                                                        <span className={cn("shrink-0 type-label-m", isActive ? "text-on-secondary-container/70" : "text-on-surface-variant")}>
                                                            {item.href}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Dynamic search results */}
                                    {dynamicGrouped.map((group) => (
                                        <div key={`dyn-${group.titleKey}`} role="group">
                                            <div className={groupHeaderClass}>
                                                {t(group.titleKey)}
                                                {group.titleKey === SEARCH_GROUP_LABEL_KEYS.music && (
                                                    <span className="type-label-s text-on-surface-variant">
                                                        ({t("search.commandPalette.musicAliasHint")} · <a href="https://github.com/Team-Haruki" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-primary hover:underline">haruki</a>)
                                                    </span>
                                                )}
                                            </div>
                                            {group.items.map((item) => {
                                                flatIndex++;
                                                const isActive = flatIndex === activeIndex;
                                                const idx = flatIndex;
                                                const route = SEARCH_GROUP_ROUTES[item.g] || `/${item.g}`;
                                                const href = `${route}/${item.id}`;
                                                // For cards, show character name; for music with matched alias, show the alias
                                                const subtitle = item.c
                                                    ? CHARACTER_NAMES[item.c] || ""
                                                    : "";
                                                // Show the active target title while all indexed locales remain searchable.
                                                const localizedTitle = item.g === "music"
                                                    ? (locale === "zh-CN" ? item.cn : locale === "en-US" ? item.en : "") || ""
                                                    : "";
                                                const aliasHint = item.g === "music" && item.matchedAlias && item.matchedAlias !== localizedTitle
                                                    ? `(${item.matchedAlias})`
                                                    : "";
                                                const musicSubtitle = [localizedTitle, aliasHint].filter(Boolean).join(" ");
                                                return (
                                                    <button
                                                        key={`${item.g}-${item.id}`}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={isActive}
                                                        data-active={isActive}
                                                        onClick={() => navigate(href)}
                                                        onMouseEnter={() => setActiveIndex(idx)}
                                                        className={rowClass(isActive)}
                                                    >
                                                        <span className="flex min-w-0 flex-col items-start">
                                                            <span className="max-w-full truncate type-body-l">{item.n}</span>
                                                            {(musicSubtitle || subtitle) && (
                                                                <span className={cn("max-w-full truncate type-body-m", isActive ? "text-on-secondary-container/70" : "text-on-surface-variant")}>
                                                                    {musicSubtitle}
                                                                    {musicSubtitle && subtitle ? " · " : ""}
                                                                    {subtitle}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className={cn("shrink-0 font-mono type-label-m", isActive ? "text-on-secondary-container/70" : "text-on-surface-variant")}>
                                                            #{item.id}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Loading indicator for first load */}
                                    {isLoadingIndex && query && (
                                        <div className="flex items-center justify-center gap-2 px-4 py-3 type-body-s text-on-surface-variant">
                                            <CircularProgress size={16} strokeWidth={2} />
                                            {t("search.commandPalette.loadingIndex")}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer hints */}
                        <div className="hidden shrink-0 items-center gap-4 border-t border-outline-variant px-4 py-2 type-label-s text-on-surface-variant sm:flex">
                            <span className="flex items-center gap-1">
                                <kbd className={kbdClass}>↑</kbd>
                                <kbd className={kbdClass}>↓</kbd>
                                {t("search.commandPalette.footer.navigate")}
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className={kbdClass}>Enter</kbd>
                                {t("search.commandPalette.footer.open")}
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className={kbdClass}>Esc</kbd>
                                {t("search.commandPalette.footer.close")}
                            </span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
