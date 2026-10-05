"use client";
import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import ExternalLink from "@/components/ExternalLink";
import { IMangaItem, IMangaData } from "@/types/manga";
import { getMangaImageUrl } from "@/lib/assets";
import { fetchMangaData } from "@/lib/fetch";
import { md3EffectsFast, md3SpatialFast } from "@/lib/motion";
import { Button, Card, EmptyState, Fab, Icon, IconButton, LoadingState, PageContainer, SectionCard, SideSheet, Surface, buttonClassName } from "@/components/md3";
import { mdArrowBack, mdArrowForward, mdAutoStories, mdChevronLeft, mdChevronRight, mdClose, mdInfo, mdMenu, mdMenuBook, mdOpenInNew } from "@/components/md3/icons";

// ==================== Component ====================

export default function MangaDetailClient() {
    const params = useParams();
    const mangaId = Number(params.id);
    const mangaIdLabel = Number.isFinite(mangaId) ? String(mangaId) : String(params.id ?? "");
    const { setDetailName } = useBreadcrumb();
    const { t, formatDate } = useI18n();

    const [allMangas, setAllMangas] = useState<IMangaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [jumpInput, setJumpInput] = useState("");
    const [isBilingualOpen, setIsBilingualOpen] = useState(false);
    const [isFloatMenuOpen, setIsFloatMenuOpen] = useState(false);
    const reduceMotion = useReducedMotion();

    // Fetch all mangas
    useEffect(() => {
        async function fetchMangas() {
            try {
                setIsLoading(true);
                const data = await fetchMangaData<IMangaData>();
                const list = Object.values(data).sort((a, b) => a.id - b.id);
                setAllMangas(list);
                setError(null);
            } catch (err) {
                console.error("Error fetching mangas:", err);
                setError(err instanceof Error ? err.message : t("page.manga.unknownError"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchMangas();
    }, [t]);

    // Current manga
    const currentManga = useMemo(() => {
        return allMangas.find((m) => m.id === mangaId) || null;
    }, [allMangas, mangaId]);

    // Prev / Next based on sorted list
    const { prevManga, nextManga } = useMemo(() => {
        const idx = allMangas.findIndex((m) => m.id === mangaId);
        return {
            prevManga: idx > 0 ? allMangas[idx - 1] : null,
            nextManga: idx >= 0 && idx < allMangas.length - 1 ? allMangas[idx + 1] : null,
        };
    }, [allMangas, mangaId]);

    // Update page title
    useEffect(() => {
        if (currentManga) {
            document.title = t("page.manga.detailDocumentTitle", { id: currentManga.id, title: currentManga.title });
        }
    }, [currentManga, t]);

    // Set breadcrumb detail name
    useEffect(() => {
        if (currentManga) setDetailName(t("page.manga.episodeWithTitle", { id: currentManga.id, title: currentManga.title }));
    }, [currentManga, setDetailName, t]);

    // Keyboard navigation: ← prev, → next
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === "ArrowLeft" && prevManga) {
                window.location.href = `/manga/${prevManga.id}`;
            } else if (e.key === "ArrowRight" && nextManga) {
                window.location.href = `/manga/${nextManga.id}`;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [prevManga, nextManga]);

    // Handle jump to episode
    const handleJump = () => {
        const num = parseInt(jumpInput.trim(), 10);
        if (!isNaN(num) && num > 0) {
            window.location.href = `/manga/${num}`;
        }
    };

    if (isLoading) {
        return (
            <MainLayout>
                <LoadingState className="min-h-[50vh]" label={t("page.manga.loading")} />
            </MainLayout>
        );
    }

    if (error || !currentManga) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdMenuBook}
                        title={t("page.manga.notFoundTitle", { id: mangaIdLabel })}
                        description={t("page.manga.notFoundDesc")}
                        action={
                            <Button variant="filled" icon={mdArrowBack} href="/manga">
                                {t("page.manga.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <PageContainer className="relative max-w-4xl">
                {/* Top Navigation Bar: Prev / Jump / Next */}
                <Surface tone="low" className="mb-6 flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
                    {/* Prev */}
                    {prevManga ? (
                        <Button variant="text" icon={mdChevronLeft} href={`/manga/${prevManga.id}`} className="pl-2">
                            <span className="hidden sm:inline">{t("page.manga.episodeLabel", { id: prevManga.id })}</span>
                            <span className="sm:hidden">{t("page.manga.previousEpisode")}</span>
                        </Button>
                    ) : (
                        <div className="px-2 type-body-m text-on-surface-variant">{t("page.manga.firstEpisodeReached")}</div>
                    )}

                    {/* Jump to */}
                    <div className="flex items-center gap-2">
                        <span className="hidden type-label-l text-on-surface-variant sm:inline">{t("page.manga.jumpLabel")}</span>
                        <input
                            type="number"
                            min={1}
                            value={jumpInput}
                            onChange={(e) => setJumpInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleJump(); }}
                            placeholder={`${currentManga.id}`}
                            aria-label={t("page.manga.jumpLabel")}
                            className="h-10 w-16 rounded-md3-xs border border-outline bg-transparent px-2 text-center type-body-m text-on-surface caret-primary outline-none placeholder:text-on-surface-variant focus:border-2 focus:border-primary"
                        />
                        <IconButton variant="tonal" icon={mdArrowForward} label={t("page.manga.jumpLabel")} onClick={handleJump} />
                    </div>

                    {/* Next */}
                    {nextManga ? (
                        <Button variant="text" trailingIcon={mdChevronRight} href={`/manga/${nextManga.id}`} className="pr-2">
                            <span className="hidden sm:inline">{t("page.manga.episodeLabel", { id: nextManga.id })}</span>
                            <span className="sm:hidden">{t("page.manga.nextEpisode")}</span>
                        </Button>
                    ) : (
                        <div className="px-2 type-body-m text-on-surface-variant">{t("page.manga.latestEpisodeReached")}</div>
                    )}
                </Surface>

                {/* Header */}
                <header className="mb-6">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-md3-sm bg-primary-container px-3 py-1 type-label-l text-on-primary-container">
                            {t("page.manga.episodeLabel", { id: currentManga.id })}
                        </span>
                        <span className="type-label-m text-on-surface-variant">
                            {formatDate(currentManga.date * 1000, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </span>
                    </div>
                    <h1 className="mt-2 type-headline-m text-on-surface sm:type-headline-l">
                        {currentManga.title}
                    </h1>
                </header>

                {/* Full Manga Image */}
                <Surface tone="lowest" className="mb-6 overflow-hidden p-1 shadow-elev-1">
                    <img
                        src={getMangaImageUrl(currentManga.id)}
                        alt={t("page.manga.imageAlt", { id: currentManga.id, title: currentManga.title })}
                        className="h-auto w-full rounded-md3-lg"
                        loading="eager"
                    />
                </Surface>

                {/* Info Card: Contributors + Source Link */}
                <SectionCard title={t("page.manga.mangaInfo")} icon={mdInfo} className="mb-8" bodyClassName="p-0">
                    <div className="divide-y divide-outline-variant">
                        {/* Contributors */}
                        {currentManga.contributors && Object.keys(currentManga.contributors).length > 0 && (
                            <div className="px-5 py-4">
                                <p className="mb-3 type-title-s text-on-surface-variant">{t("page.manga.contributors")}</p>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(currentManga.contributors).map(([role, name]) => (
                                        <span
                                            key={role}
                                            className="inline-flex items-center gap-1.5 rounded-md3-sm bg-surface-container px-3 py-1.5 type-label-l"
                                        >
                                            <span className="text-on-surface-variant">{role}</span>
                                            <span className="text-on-surface">{name}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Source link */}
                        <div className="flex items-center justify-between px-5 py-4">
                            <span className="type-body-m text-on-surface-variant">{t("page.manga.source")}</span>
                            <ExternalLink
                                href={currentManga.url}
                                className={buttonClassName({ variant: "outlined", size: "s" })}
                            >
                                <Icon path={mdOpenInNew} size={18} />
                                {t("page.manga.viewOriginalPost")}
                            </ExternalLink>
                        </div>
                    </div>
                </SectionCard>

                <div className="mx-auto mb-8 max-w-xl">
                    <DetailPageAdCard />
                </div>

                {/* Bottom Navigation: Prev / Next (large) */}
                <div className="mb-8 grid grid-cols-2 gap-4">
                    {prevManga ? (
                        <Card
                            variant="filled"
                            href={`/manga/${prevManga.id}`}
                            className="flex flex-col items-start gap-1.5 p-5"
                        >
                            <span className="flex items-center gap-1 type-label-l text-primary">
                                <Icon path={mdChevronLeft} size={18} />
                                {t("page.manga.previousEpisode")}
                            </span>
                            <span className="w-full truncate type-title-s text-on-surface">
                                {t("page.manga.episodeWithTitle", { id: prevManga.id, title: prevManga.title })}
                            </span>
                        </Card>
                    ) : (
                        <div />
                    )}

                    {nextManga ? (
                        <Card
                            variant="filled"
                            href={`/manga/${nextManga.id}`}
                            className="flex flex-col items-end gap-1.5 p-5 text-right"
                        >
                            <span className="flex items-center gap-1 type-label-l text-primary">
                                {t("page.manga.nextEpisode")}
                                <Icon path={mdChevronRight} size={18} />
                            </span>
                            <span className="w-full truncate type-title-s text-on-surface">
                                {t("page.manga.episodeWithTitle", { id: nextManga.id, title: nextManga.title })}
                            </span>
                        </Card>
                    ) : (
                        <div />
                    )}
                </div>
            </PageContainer>

            {/* Floating actions: bilingual panel + flip navigation */}
            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
                {/* Expanded Quick Navigation Card */}
                <AnimatePresence>
                    {isFloatMenuOpen && (
                        <motion.div
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                            transition={reduceMotion ? md3EffectsFast : md3SpatialFast}
                            style={{ transformOrigin: "bottom right" }}
                            className="w-64 rounded-md3-lg bg-surface-container text-on-surface shadow-elev-3"
                        >
                            <div className="flex items-center justify-between py-1 pl-4 pr-1">
                                <span className="type-title-s text-on-surface-variant">
                                    {t("page.story.reader.floatBallMenu")}
                                </span>
                                <IconButton size="s" icon={mdClose} label={t("common.md3.close")} onClick={() => setIsFloatMenuOpen(false)} />
                            </div>

                            {/* Prev & Next Quick Buttons */}
                            <div className="mb-3 grid grid-cols-2 gap-2 px-3">
                                {prevManga ? (
                                    <Button variant="tonal" size="xs" icon={mdChevronLeft} href={`/manga/${prevManga.id}`}>
                                        {t("page.manga.previousEpisode")}
                                    </Button>
                                ) : (
                                    <Button variant="tonal" size="xs" disabled>
                                        {t("page.manga.previousEpisode")}
                                    </Button>
                                )}

                                {nextManga ? (
                                    <Button variant="tonal" size="xs" trailingIcon={mdChevronRight} href={`/manga/${nextManga.id}`}>
                                        {t("page.manga.nextEpisode")}
                                    </Button>
                                ) : (
                                    <Button variant="tonal" size="xs" disabled>
                                        {t("page.manga.nextEpisode")}
                                    </Button>
                                )}
                            </div>

                            {/* Fast chapters jump list */}
                            <div className="custom-scrollbar mx-3 mb-3 max-h-40 overflow-y-auto rounded-md3-sm bg-surface-container-high p-1">
                                {allMangas.map((m) => (
                                    <Link
                                        key={m.id}
                                        href={`/manga/${m.id}`}
                                        aria-current={m.id === currentManga.id ? "page" : undefined}
                                        className={`state-layer focus-ring my-0.5 flex items-center justify-between rounded-md3-xs px-2.5 py-1.5 type-label-m ${
                                            m.id === currentManga.id
                                                ? "bg-secondary-container text-on-secondary-container"
                                                : "text-on-surface-variant"
                                        }`}
                                    >
                                        <span>#{m.id}</span>
                                        <span className="max-w-[130px] truncate text-right">{m.title}</span>
                                    </Link>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bilingual panel trigger */}
                <Fab
                    color="surface"
                    icon={mdAutoStories}
                    label={t("page.story.reader.mangaPanel")}
                    onClick={() => setIsBilingualOpen(true)}
                />

                {/* Flip navigation trigger */}
                <Fab
                    color="primary-container"
                    icon={isFloatMenuOpen ? mdClose : mdMenu}
                    label={t("page.story.reader.floatBallMenu")}
                    aria-expanded={isFloatMenuOpen}
                    onClick={() => setIsFloatMenuOpen(!isFloatMenuOpen)}
                />
            </div>

            {/* Bilingual split comparison & Translation notes */}
            <SideSheet
                isOpen={isBilingualOpen}
                onClose={() => setIsBilingualOpen(false)}
                title={t("page.story.reader.mangaPanel")}
                widthClassName="w-[min(384px,calc(100vw-3.5rem))]"
                bodyClassName="space-y-6"
            >
                {/* Bilingual Metadata */}
                <section className="space-y-3">
                    <h4 className="type-title-s text-on-surface-variant">
                        {t("page.story.reader.bilingualTitle")}
                    </h4>
                    <div className="space-y-2 rounded-md3-md bg-surface-container p-4">
                        <div>
                            <span className="mb-0.5 block type-label-s text-on-surface-variant">{t("page.manga.chineseVersion")}</span>
                            <span className="type-title-s text-on-surface">{currentManga.title}</span>
                        </div>
                        <div>
                            <span className="mb-0.5 block type-label-s text-on-surface-variant">{t("page.manga.japaneseOriginal")}</span>
                            <span className="type-body-m italic text-on-surface-variant">
                                Project SEKAI 4-Koma Comic #{currentManga.id}
                            </span>
                        </div>
                    </div>
                </section>

                {/* Contributors & Translation credits */}
                <section className="space-y-3">
                    <h4 className="type-title-s text-on-surface-variant">
                        {t("page.manga.contributors")}
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                        {currentManga.contributors && Object.entries(currentManga.contributors).map(([role, name]) => (
                            <div
                                key={role}
                                className="flex items-center justify-between rounded-md3-md bg-surface-container p-3"
                            >
                                <span className="type-label-l text-on-surface-variant">{role}</span>
                                <span className="type-label-l text-primary">{name}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Translator Essay / Commentary */}
                <section className="space-y-3">
                    <h4 className="type-title-s text-on-surface-variant">
                        {t("page.story.reader.mangaEssayTitle")}
                    </h4>
                    <div className="space-y-3 rounded-md3-md bg-surface-container p-4 type-body-s text-on-surface-variant">
                        <p>
                            <span className="type-label-l text-on-surface">{t("page.manga.contributors")}：</span>
                            {t("page.story.reader.mangaEssay1")}
                        </p>
                        <p>
                            <span className="type-label-l text-on-surface">{t("page.manga.mangaInfo")}：</span>
                            {t("page.story.reader.mangaEssay2")}
                        </p>
                        <p className="border-t border-outline-variant pt-2 text-center type-label-s italic">
                            {t("page.story.reader.mangaEssayFooter")}
                        </p>
                    </div>
                </section>

                {/* Source Post */}
                <section className="space-y-3">
                    <h4 className="type-title-s text-on-surface-variant">
                        {t("page.manga.source")}
                    </h4>
                    <ExternalLink
                        href={currentManga.url}
                        className={buttonClassName({ variant: "outlined", size: "s", fullWidth: true })}
                    >
                        <Icon path={mdOpenInNew} size={18} />
                        {t("page.manga.viewOriginalPost")}
                    </ExternalLink>
                </section>
            </SideSheet>
        </MainLayout>
    );
}
