"use client";
import { Banner, Button, ErrorState, Icon, IconButton, LinearProgress, LoadingState, Surface } from "@/components/md3";
import { mdClose, mdGraphicEq, mdLandscape, mdMyLocation, mdPauseFill, mdPlayArrowFill, mdSkipNext, mdSkipPrevious } from "@/components/md3/icons";
import { useState, useEffect, useMemo, useRef } from "react";
import { LIVE2D_STORY_PLAYER_ID, Live2DStoryPlayer, live2dStoryPlayerTop, type Live2DStoryPlayerHandle } from "@/components/story/Live2DStoryPlayer";
import { StorySnippet } from "@/components/story/StorySnippet";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { IProcessedScenarioData, SnippetAction, type StoryTranslationSource } from "@/types/story";
import type { SsePlayerNode } from "@/lib/sseWeb/player";

// How many actions ahead of the active line we preload assets for in autoplay mode.
const PRELOAD_AHEAD = 6;

interface StoryReaderProps {
    scenarioData: IProcessedScenarioData | null;
    isLoading: boolean;
    error: string | null;
    missingPaths?: string[];
    endLabel?: string;
    translationSource?: StoryTranslationSource;
    storyType?: "event" | "unit" | "card" | "area" | "self" | "special";
    storyId?: number;
    /**
     * The episode in the Live2D story library (e.g. `event:219/1`, `card:1/first`), when it
     * has one: offers the Live2D mode, whose picture and this list follow each other. It is
     * read from the library of the server the reader chose.
     */
    live2dSelector?: string;
}

export function StoryReader({
    scenarioData,
    isLoading,
    error,
    missingPaths,
    endLabel,
    translationSource,
    storyType,
    storyId,
    live2dSelector,
}: StoryReaderProps) {
    const { useLLMTranslation, serverSource } = useTheme();
    const { t } = useI18n();

    // Autoplay Player States
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [playbackProgress, setPlaybackProgress] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [isScrollLocked, setIsScrollLocked] = useState(true);

    // Refs to avoid self-triggering the engine effect.
    // The current <audio> for voiced dialogue is held in a ref (not state) so that
    // creating/destroying it does not re-run the playback engine effect.
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Background Immersion States
    const [activeBgUrl, setActiveBgUrl] = useState<string | null>(null);
    const [immersionMode, setImmersionMode] = useState(true);
    // Mirror of activeBgUrl for the background-sync effect to compare without
    // adding activeBgUrl to its dependency array (which would cause a loop).
    const activeBgUrlRef = useRef<string | null>(null);

    // Tracks asset URLs already preloaded during autoplay, to avoid duplicate fetches.
    const preloadedUrlsRef = useRef<Set<string>>(new Set());

    // Live2D mode: the player moves between nodes, the snippets a tap acts on (talks, telops,
    // full-screen texts, choices). A node's row is the one made from the same snippet.
    const live2dRef = useRef<Live2DStoryPlayerHandle | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [live2dActive, setLive2dActive] = useState(false);
    const [live2dNode, setLive2dNode] = useState(0);
    const [live2dNodes, setLive2dNodes] = useState<readonly SsePlayerNode[] | null>(null);
    const live2dRows = useMemo(() => {
        const rowOfSnippet = new Map<number, number>();
        scenarioData?.actions.forEach((act, idx) => {
            if (act.snippetIndex !== undefined) rowOfSnippet.set(act.snippetIndex, idx);
        });
        const rows = (live2dNodes ?? []).map(node => rowOfSnippet.get(node.snippet) ?? -1);
        return { rows, nodeOfRow: new Map(rows.flatMap((row, node) => (row >= 0 ? [[row, node] as const] : []))) };
    }, [scenarioData, live2dNodes]);
    // The row of the node playback is in; a node without a row leaves the last one before it marked.
    const live2dIndex = live2dActive
        ? live2dRows.rows.slice(0, Math.min(live2dNode, live2dRows.rows.length - 1) + 1).findLast(row => row >= 0) ?? -1
        : -1;

    // Keep the current talk's row in view: below the site's header, and clear of the player's
    // window where that lies over the list.
    useEffect(() => {
        if (live2dIndex < 0 || !isScrollLocked) return;
        // a page may hold several readers (a card's two parts), whose rows share their ids
        const row = rootRef.current?.querySelector<HTMLElement>(`#snippet-${live2dIndex}`);
        if (!row) return;
        const box = row.getBoundingClientRect();
        let [top, bottom] = [live2dStoryPlayerTop() + 12, window.innerHeight - 12];
        const over = document.getElementById(LIVE2D_STORY_PLAYER_ID)?.getBoundingClientRect();
        if (over && over.width > 0 && over.left < box.right && over.right > box.left) {
            if (over.top + over.bottom < window.innerHeight) top = over.bottom + 12;
            else bottom = over.top - 12;
        }
        if (box.top < top || box.bottom > bottom) {
            window.scrollBy({ top: box.top - top, behavior: "smooth" });
        }
    }, [live2dIndex, isScrollLocked]);

    // Extract all backgrounds and their indices
    const bgList = useMemo(() => {
        if (!scenarioData) return [];
        return scenarioData.actions
            .map((act, idx) => {
                if (act.type === SnippetAction.SpecialEffect && act.seType === "ChangeBackground" && act.resource) {
                    return { index: idx, url: act.resource };
                }
                return null;
            })
            .filter(Boolean) as { index: number; url: string }[];
    }, [scenarioData]);

    // Autoplay Core engine
    // NOTE: dependency array intentionally omits `audio`/`activeBgUrl`/`bgList`/
    // `immersionMode`. Those are managed via refs / separate effects so this engine
    // never re-runs because of its own state writes (which previously caused
    // activeIndex to spin to the end of the story).
    useEffect(() => {
        if (!isPlaying || activeIndex < 0 || !scenarioData || activeIndex >= scenarioData.actions.length) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            return;
        }

        const action = scenarioData.actions[activeIndex];

        // 1. Smoothly scroll active dialogue card into viewport center
        if (isScrollLocked) {
            const activeEl = document.getElementById(`snippet-${activeIndex}`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }

        // Helper to advance to the next line with a hard stop at the end.
        const advance = () => {
            setActiveIndex(prev => {
                if (!scenarioData) return prev;
                if (prev >= scenarioData.actions.length - 1) {
                    setIsPlaying(false);
                    setPlaybackProgress(0);
                    return prev;
                }
                setPlaybackProgress(0);
                return prev + 1;
            });
        };

        // 2. Dialogue player trigger
        if (action.type === SnippetAction.Talk) {
            if (action.voice) {
                // Voiced dialogue — hold the Audio in a ref, NOT state, so this
                // effect doesn't re-run when the audio is created.
                const newAudio = new Audio(action.voice);
                newAudio.playbackRate = speed;

                const handleTimeUpdate = () => {
                    if (newAudio.duration) {
                        setPlaybackProgress((newAudio.currentTime / newAudio.duration) * 100);
                    }
                };

                const handleEnded = () => {
                    setPlaybackProgress(100);
                    setTimeout(() => {
                        advance();
                    }, 350 / speed);
                };

                const handleError = () => {
                    setPlaybackProgress(100);
                    setTimeout(() => {
                        advance();
                    }, 500 / speed);
                };

                newAudio.addEventListener("timeupdate", handleTimeUpdate);
                newAudio.addEventListener("ended", handleEnded);
                newAudio.addEventListener("error", handleError);

                audioRef.current = newAudio;
                newAudio.play().catch(() => {
                    // Blocked autoplay browser safety fallback
                    setTimeout(() => {
                        advance();
                    }, 1200 / speed);
                });

                return () => {
                    newAudio.removeEventListener("timeupdate", handleTimeUpdate);
                    newAudio.removeEventListener("ended", handleEnded);
                    newAudio.removeEventListener("error", handleError);
                    newAudio.pause();
                    if (audioRef.current === newAudio) {
                        audioRef.current = null;
                    }
                };
            } else {
                // Non-voiced dialogue (monologues / narration)
                Promise.resolve().then(() => {
                    setPlaybackProgress(0);
                });
                const textLen = action.body?.length || 12;
                const duration = Math.max(1800, textLen * 95) / speed;

                const start = Date.now();
                const timer = setInterval(() => {
                    const elapsed = Date.now() - start;
                    const pct = Math.min(100, (elapsed / duration) * 100);
                    setPlaybackProgress(pct);
                    if (pct >= 100) {
                        clearInterval(timer);
                        advance();
                    }
                }, 50);

                return () => clearInterval(timer);
            }
        } else if (
            action.type === SnippetAction.SpecialEffect &&
            (action.seType === "FullScreenText" || action.seType === "Telop")
        ) {
            // Fullscreen story slides
            Promise.resolve().then(() => {
                setPlaybackProgress(0);
            });
            const textLen = action.body?.length || 15;
            const duration = Math.max(2500, textLen * 110) / speed;

            const start = Date.now();
            const timer = setInterval(() => {
                const elapsed = Date.now() - start;
                const pct = Math.min(100, (elapsed / duration) * 100);
                setPlaybackProgress(pct);
                if (pct >= 100) {
                    clearInterval(timer);
                    advance();
                }
            }, 50);

            return () => clearInterval(timer);
        } else {
            // Skip other BGM change/sound effects immediately
            const timer = setTimeout(() => {
                advance();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isPlaying, activeIndex, speed, scenarioData, isScrollLocked]);

    // Dynamic background sync during autoplay. Kept separate from the engine effect
    // so background changes never interrupt/restart the current line's playback.
    useEffect(() => {
        if (!isPlaying || !immersionMode || bgList.length === 0) return;
        const closestBg = [...bgList].reverse().find(bg => bg.index <= activeIndex);
        if (closestBg && activeBgUrlRef.current !== closestBg.url) {
            activeBgUrlRef.current = closestBg.url;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveBgUrl(closestBg.url);
        }
    }, [isPlaying, activeIndex, immersionMode, bgList]);

    // Preload assets for upcoming lines while autoplay is active, so that voiced
    // dialogue and background changes start without a download stall.
    useEffect(() => {
        if (!isPlaying || !scenarioData || activeIndex < 0) return;
        const actions = scenarioData.actions;
        const end = Math.min(actions.length, activeIndex + 1 + PRELOAD_AHEAD);
        const preloaded = preloadedUrlsRef.current;
        for (let i = activeIndex + 1; i < end; i++) {
            const act = actions[i];
            if (!act) continue;
            if (act.type === SnippetAction.Talk && act.voice && !preloaded.has(act.voice)) {
                preloaded.add(act.voice);
                const a = new Audio();
                a.preload = "auto";
                a.src = act.voice;
                // Some browsers won't fetch without load() when not in the DOM.
                a.load();
            } else if (
                act.type === SnippetAction.SpecialEffect &&
                act.seType === "ChangeBackground" &&
                act.resource &&
                !preloaded.has(act.resource)
            ) {
                preloaded.add(act.resource);
                const img = new Image();
                img.src = act.resource;
            }
        }
    }, [isPlaying, activeIndex, scenarioData]);

    // Manual scroll listener to sync background slides
    useEffect(() => {
        if (isPlaying || !immersionMode || bgList.length === 0) return;

        const handleScroll = () => {
            const viewportMiddle = window.innerHeight / 2;
            let currentBg: string | null = null;

            for (const bg of bgList) {
                const el = document.getElementById(`snippet-${bg.index}`);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top < viewportMiddle) {
                        currentBg = bg.url;
                    }
                }
            }

            if (currentBg && activeBgUrlRef.current !== currentBg) {
                activeBgUrlRef.current = currentBg;
                setActiveBgUrl(currentBg);
            }
        };

        window.addEventListener("scroll", handleScroll);
        handleScroll();

        return () => window.removeEventListener("scroll", handleScroll);
    }, [isPlaying, immersionMode, bgList]);

    // Handle manual player commands
    const togglePlay = () => {
        if (activeIndex === -1) {
            setActiveIndex(0);
        }
        setIsPlaying(prev => !prev);
    };

    const handleStop = () => {
        setIsPlaying(false);
        setActiveIndex(-1);
        setPlaybackProgress(0);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    };

    const handlePrev = () => {
        if (activeIndex > 0) {
            setPlaybackProgress(0);
            setActiveIndex(prev => prev - 1);
        }
    };

    const handleNext = () => {
        if (scenarioData && activeIndex < scenarioData.actions.length - 1) {
            setPlaybackProgress(0);
            setActiveIndex(prev => prev + 1);
        }
    };

    const toggleSpeed = () => {
        const speedOptions = [1, 1.25, 1.5, 2];
        const nextIdx = (speedOptions.indexOf(speed) + 1) % speedOptions.length;
        setSpeed(speedOptions[nextIdx]);
    };

    if (isLoading) {
        return <LoadingState label={t("page.story.reader.loading")} className="min-h-[30vh]" />;
    }

    if (missingPaths && missingPaths.length > 0) {
        return (
            <Banner tone="warning" title={t("page.story.reader.assetMissingTitle")}>
                <p className="mb-3">{t("page.story.reader.assetMissingDescription")}</p>
                <ul className="space-y-1">
                    {missingPaths.map((p) => (
                        <li key={p} className="break-all rounded-md3-xs bg-surface-container-highest px-3 py-1.5 font-mono type-body-s text-on-surface">
                            {p}
                        </li>
                    ))}
                </ul>
            </Banner>
        );
    }

    if (error) {
        return <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />;
    }

    if (!scenarioData) return null;

    return (
        <div ref={rootRef} className="relative mx-auto max-w-4xl pb-24">
            {/* Ambient immersion background layer */}
            {activeBgUrl && immersionMode && (
                <div className="pointer-events-none fixed inset-0 z-0 opacity-25 transition-opacity duration-1000 ease-in-out">
                    <img src={activeBgUrl} alt="" className="h-full w-full scale-[1.03] object-cover blur-md" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/40 to-surface/90" />
                </div>
            )}

            {live2dSelector && (
                <Live2DStoryPlayer
                    ref={live2dRef}
                    selector={live2dSelector}
                    region={serverSource}
                    onActiveChange={(active) => {
                        setLive2dActive(active);
                        if (active) handleStop();
                        else setLive2dNodes(null);
                    }}
                    onNode={(node, nodes) => {
                        setLive2dNode(node);
                        setLive2dNodes(nodes);
                    }}
                    extraControls={(
                        <IconButton
                            icon={mdMyLocation}
                            label={t("page.story.reader.autoScroll")}
                            variant="standard"
                            selected={isScrollLocked}
                            onClick={() => setIsScrollLocked(prev => !prev)}
                        />
                    )}
                />
            )}

            {/* Autoplay onboarding banner */}
            {activeIndex === -1 && !live2dActive && (
                <Surface tone="default" radius="xl" className="relative z-10 mb-6 flex animate-fade-in flex-col items-center justify-between gap-4 p-5 sm:flex-row">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 type-title-m text-on-surface">
                            <Icon path={mdGraphicEq} size={20} className="text-primary" />
                            {t("page.story.reader.autoplay")}
                        </h3>
                        <p className="mt-1 type-body-s text-on-surface-variant">{t("page.story.reader.autoplayHint")}</p>
                    </div>
                    <Button variant="filled" icon={mdPlayArrowFill} onClick={togglePlay} className="shrink-0">
                        {t("page.story.reader.autoplay")}
                    </Button>
                </Surface>
            )}

            {scenarioData.characters.length > 0 && (
                <Surface tone="card" radius="lg" className="relative z-10 mb-6 p-4">
                    <h3 className="mb-3 type-title-s text-on-surface-variant">{t("page.story.reader.charactersTitle")}</h3>
                    <div className="flex flex-wrap gap-2">
                        {scenarioData.characters.map((char) => (
                            <span
                                key={char.id}
                                className="inline-flex h-8 items-center rounded-md3-sm bg-secondary-container px-3 type-label-l text-on-secondary-container"
                            >
                                {char.name}
                            </span>
                        ))}
                    </div>
                </Surface>
            )}

            {/* Dialogue list with IDs to anchor scroll tracking */}
            <div className="relative z-10 space-y-2">
                {scenarioData.actions.map((action, index) => {
                    // In the Live2D mode a node's row takes playback to that node.
                    const node = live2dActive ? live2dRows.nodeOfRow.get(index) : undefined;
                    return (
                        <div
                            key={index}
                            id={`snippet-${index}`}
                            className={node !== undefined ? "cursor-pointer" : undefined}
                            onClick={node !== undefined ? (event) => {
                                // the row's own controls (its voice button) keep their meaning
                                if ((event.target as HTMLElement).closest("button, a, audio")) return;
                                live2dRef.current?.seek(node);
                            } : undefined}
                        >
                            <StorySnippet
                                action={action}
                                index={index}
                                activeIndex={live2dActive ? live2dIndex : activeIndex}
                                playbackProgress={live2dActive ? 0 : playbackProgress}
                            />
                        </div>
                    );
                })}
            </div>

            {scenarioData.actions.length > 0 && (
                <div className="relative z-10 py-10 text-center text-on-surface-variant">
                    <p className="type-title-s">— {endLabel ?? t("page.story.reader.defaultEndLabel")} —</p>
                    {useLLMTranslation && (translationSource === "llm" || translationSource === "human") && (
                        <p className="mt-2.5 type-body-s italic">
                            {t("page.story.reader.translationCredit", {
                                source: translationSource === "human"
                                    ? (storyType === "event" && storyId !== undefined && storyId <= 198
                                        ? t("page.story.reader.translationSources.aiPolished")
                                        : t("page.story.reader.translationSources.human"))
                                    : t("page.story.reader.translationSources.ai"),
                            })}
                        </p>
                    )}
                </div>
            )}

            {/* Floating autoplay control bar */}
            {activeIndex >= 0 && !live2dActive && (
                <div className="fixed bottom-6 left-4 right-4 z-50 animate-fade-in sm:left-1/2 sm:right-auto sm:w-[520px] sm:-translate-x-1/2">
                    <Surface tone="default" radius="xl" elevation={3} className="overflow-hidden">
                        <LinearProgress
                            value={(activeIndex + 1) / scenarioData.actions.length}
                            aria-label={t("page.story.reader.lineProgress", { current: activeIndex + 1, total: scenarioData.actions.length })}
                        />
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="flex items-center gap-1">
                                <IconButton icon={mdSkipPrevious} label={t("common.md3.previous")} onClick={handlePrev} disabled={activeIndex <= 0} />
                                <IconButton
                                    icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
                                    label={isPlaying ? t("page.story.reader.pause") : t("page.story.reader.play")}
                                    variant="filled"
                                    onClick={togglePlay}
                                />
                                <IconButton
                                    icon={mdSkipNext}
                                    label={t("common.md3.next")}
                                    onClick={handleNext}
                                    disabled={activeIndex >= scenarioData.actions.length - 1}
                                />
                            </div>

                            {/* Line position */}
                            <div className="min-w-0 flex-1 px-1 text-center">
                                <span className="block truncate type-label-s text-primary">{t("page.story.reader.autoplay")}</span>
                                <span className="mt-0.5 block truncate type-label-m text-on-surface">
                                    {t("page.story.reader.lineProgress", { current: activeIndex + 1, total: scenarioData.actions.length })}
                                </span>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                                <Button
                                    variant="text"
                                    size="xs"
                                    onClick={toggleSpeed}
                                    title={t("page.story.reader.speed")}
                                    aria-label={`${t("page.story.reader.speed")} ${speed}x`}
                                    className="min-w-12 px-2"
                                >
                                    {speed}x
                                </Button>
                                <IconButton
                                    icon={mdMyLocation}
                                    label={t("page.story.reader.autoScroll")}
                                    variant="standard"
                                    selected={isScrollLocked}
                                    onClick={() => setIsScrollLocked(prev => !prev)}
                                />
                                <IconButton
                                    icon={mdLandscape}
                                    label={t("page.story.reader.immersionMode")}
                                    variant="standard"
                                    selected={immersionMode}
                                    onClick={() => setImmersionMode(prev => !prev)}
                                />
                                <IconButton icon={mdClose} label={t("page.story.reader.close")} onClick={handleStop} />
                            </div>
                        </div>
                    </Surface>
                </div>
            )}
        </div>
    );
}

export default StoryReader;
