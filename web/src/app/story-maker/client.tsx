"use client";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Card, Dialog, EmptyState, Icon, IconButton, LoadMore, LoadingState, Menu, PageContainer,
    PageHeader, Select, Snackbar, TextField,
} from "@/components/md3";
import {
    mdAccountTree, mdAdd, mdAutoStories, mdCode, mdContentCopy, mdDelete, mdEdit,
    mdFlag, mdMoreVert, mdPlayArrowFill, mdSearch, mdStar, mdTitle, mdUploadFile,
} from "@/components/md3/icons";
import { StoryImportDialog } from "@/components/story-maker/StoryImportDialog";
import {
    StoryMetaDialog, applyMetaValuesToDoc, type StoryMetaValues,
} from "@/components/story-maker/StoryMetaDialog";
import { useStarterStory } from "@/components/story-maker/useStarterStory";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { getCharacterIconUrl } from "@/lib/assets";
import { localizePath } from "@/lib/localized-path";
import { createStoryDocument, totalBeatCount } from "@/lib/storyMaker/document";
import {
    StoryDraftsUnavailableError, createDraft, deleteDraft, duplicateDraft, listDrafts, renameDraft,
} from "@/lib/storyMaker/drafts";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import { downloadStoryScript } from "@/lib/storyMaker/starter";
import { STORY_REGIONS, type StoryDocument, type StoryDraft, type StoryRegion } from "@/types/storyMaker";

const subscribeNever = () => () => {};

type SortKey = "updated" | "created" | "title";

function isSortKey(value: string | null): value is SortKey {
    return value === "updated" || value === "created" || value === "title";
}

function isStoryRegion(value: string | null | undefined): value is StoryRegion {
    return STORY_REGIONS.includes(value as StoryRegion);
}

function StoryMakerContent() {
    const { t, locale, routeLocale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
    const buildStarter = useStarterStory();

    const defaultRegion: StoryRegion = hydrated && hasHydratedThemeSettings && isStoryRegion(serverSource)
        ? serverSource
        : "jp";

    const [drafts, setDrafts] = useState<StoryDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [storageError, setStorageError] = useState<"unavailable" | "failed" | null>(null);
    const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
    const [sortBy, setSortBy] = useState<SortKey>(() => {
        const param = searchParams.get("sortBy");
        return isSortKey(param) ? param : "updated";
    });

    const [creatingOpen, setCreatingOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [renaming, setRenaming] = useState<StoryDraft | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [deleting, setDeleting] = useState<StoryDraft | null>(null);
    const [snack, setSnack] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setStorageError(null);
        try {
            setDrafts(await listDrafts());
        } catch (error) {
            setStorageError(error instanceof StoryDraftsUnavailableError ? "unavailable" : "failed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "story-maker",
        defaultDisplayCount: 12,
        increment: 12,
        isReady: !loading,
    });

    const updateURL = useCallback((nextSearch: string, nextSort: SortKey) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (nextSearch) url.searchParams.set("search", nextSearch);
        else url.searchParams.delete("search");
        if (nextSort !== "updated") url.searchParams.set("sortBy", nextSort);
        else url.searchParams.delete("sortBy");
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleSearchChange = (value: string) => {
        setSearch(value);
        updateURL(value, sortBy);
        resetDisplayCount();
    };

    const handleSortChange = (value: SortKey) => {
        setSortBy(value);
        updateURL(search, value);
        resetDisplayCount();
    };

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const matches = needle
            ? drafts.filter(draft => (
                draft.doc.meta.title.toLowerCase().includes(needle)
                || draft.doc.meta.summary.toLowerCase().includes(needle)
                || draft.doc.meta.author.toLowerCase().includes(needle)
            ))
            : drafts;
        return [...matches].sort((a, b) => {
            if (sortBy === "created") return b.createdAt - a.createdAt;
            if (sortBy === "title") return (a.doc.meta.title || "").localeCompare(b.doc.meta.title || "", locale);
            return b.updatedAt - a.updatedAt;
        });
    }, [drafts, search, sortBy, locale]);

    const visibleDrafts = filtered.slice(0, displayCount);

    const dateFormatter = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
        [locale],
    );

    const openEditor = (id: string) => {
        router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(id)}`, routeLocale));
    };

    const handleCreate = async (values: StoryMetaValues) => {
        try {
            const base = createStoryDocument(values.region, values.title);
            const doc = applyMetaValuesToDoc(base, values);
            const created = await createDraft(doc);
            setCreatingOpen(false);
            openEditor(created.id);
        } catch {
            setStorageError("failed");
        }
    };

    const handleCreateStarter = async () => {
        try {
            const created = await createDraft(buildStarter(defaultRegion));
            openEditor(created.id);
        } catch {
            setStorageError("failed");
        }
    };

    const handleImport = async (doc: StoryDocument) => {
        try {
            const created = await createDraft(doc);
            setImportOpen(false);
            setDrafts(previous => [created, ...previous]);
            setSnack(t("page.storyMaker.landing.importedToast"));
            openEditor(created.id);
        } catch {
            setStorageError("failed");
        }
    };

    const handleRename = async () => {
        if (!renaming) return;
        try {
            const updated = await renameDraft(renaming.id, renameValue.trim().slice(0, STORY_LIMITS.title));
            if (updated) {
                setDrafts(previous => previous.map(item => (item.id === updated.id ? updated : item)));
                setSnack(t("page.storyMaker.landing.renamedToast"));
            }
            setRenaming(null);
        } catch {
            setStorageError("failed");
        }
    };

    const handleDuplicate = async (draft: StoryDraft) => {
        try {
            const copy = await duplicateDraft(draft.id, t("page.storyMaker.landing.copySuffix"));
            if (copy) {
                setDrafts(previous => [copy, ...previous]);
                setSnack(t("page.storyMaker.landing.duplicatedToast"));
            }
        } catch {
            setStorageError("failed");
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        try {
            await deleteDraft(deleting.id);
            setDrafts(previous => previous.filter(item => item.id !== deleting.id));
            setSnack(t("page.storyMaker.landing.deletedToast"));
            setDeleting(null);
        } catch {
            setStorageError("failed");
        }
    };

    const rawTitle = t("page.storyMaker.title");
    const betaBadge = t("page.storyMaker.betaBadge");
    const displayTitle = rawTitle.endsWith(` ${betaBadge}`)
        ? rawTitle.slice(0, -(betaBadge.length + 1))
        : rawTitle;

    return (
        <PageContainer className="min-w-0">
            <PageHeader
                title={(
                    <span className="inline-flex flex-wrap items-center gap-2.5">
                        <span>{displayTitle}</span>
                        <span className="inline-flex items-center rounded-md3-full border border-tertiary/30 bg-tertiary-container px-2.5 py-0.5 align-middle type-label-m text-on-tertiary-container">
                            {betaBadge}
                        </span>
                    </span>
                )}
                description={t("page.storyMaker.description")}
                actions={(
                    <>
                        <Button variant="outlined" icon={mdPlayArrowFill} href="/story-maker/play" className="px-3 sm:px-4">
                            {t("page.storyMaker.landing.playFile")}
                        </Button>
                        <Button variant="tonal" icon={mdUploadFile} disabled={storageError !== null} onClick={() => setImportOpen(true)} className="px-3 sm:px-4">
                            {t("page.storyMaker.landing.importScript")}
                        </Button>
                        <Button variant="filled" icon={mdAdd} disabled={storageError !== null} onClick={() => setCreatingOpen(true)} className="px-3 sm:px-4">
                            {t("page.storyMaker.landing.newStory")}
                        </Button>
                    </>
                )}
            />

            <Banner tone="info" className="mb-4 lg:hidden">
                {t("page.storyMaker.desktopOnly.landingNotice")}
            </Banner>

            {storageError && (
                <Banner
                    tone="error"
                    title={t(storageError === "unavailable" ? "page.storyMaker.storage.unavailableTitle" : "page.storyMaker.storage.failedTitle")}
                    className="mb-6"
                    action={storageError === "failed" ? (
                        <Button size="xs" variant="text" color="error" onClick={() => void refresh()}>
                            {t("common.action.retry")}
                        </Button>
                    ) : undefined}
                >
                    {t(storageError === "unavailable" ? "page.storyMaker.storage.unavailableDescription" : "page.storyMaker.storage.failedDescription")}
                </Banner>
            )}

            <section className="min-w-0 space-y-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <h2 className="min-w-0 type-title-l text-on-surface">
                        {t("page.storyMaker.landing.myDrafts")}
                        {!loading && <span className="ml-2 type-label-l text-on-surface-variant">{filtered.length}</span>}
                    </h2>
                    {drafts.length > 0 && (
                        <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">
                            <Button size="s" variant="text" icon={mdStar} onClick={() => void handleCreateStarter()}>
                                {t("page.storyMaker.landing.tryStarter")}
                            </Button>
                            <TextField
                                value={search}
                                onValueChange={handleSearchChange}
                                placeholder={t("page.storyMaker.landing.searchPlaceholder")}
                                icon={mdSearch}
                                clearable
                                aria-label={t("page.storyMaker.landing.searchPlaceholder")}
                                className="min-w-0 flex-1 basis-44 sm:w-56 sm:flex-none"
                            />
                            <Select<SortKey>
                                value={sortBy}
                                onValueChange={handleSortChange}
                                options={[
                                    { value: "updated", label: t("page.storyMaker.landing.sortUpdated") },
                                    { value: "created", label: t("page.storyMaker.landing.sortCreated") },
                                    { value: "title", label: t("page.storyMaker.landing.sortTitle") },
                                ]}
                                aria-label={t("page.storyMaker.landing.sortBy")}
                                className="min-w-0 flex-1 basis-36 sm:w-40 sm:flex-none"
                            />
                        </div>
                    )}
                </div>

                {loading ? (
                    <LoadingState />
                ) : drafts.length === 0 ? (
                    <Card variant="filled" radius="xl">
                        <EmptyState
                            icon={mdAutoStories}
                            title={t("page.storyMaker.landing.emptyTitle")}
                            description={t("page.storyMaker.landing.emptyDescription")}
                            action={(
                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                    <Button variant="filled" icon={mdStar} disabled={storageError !== null} onClick={() => void handleCreateStarter()}>
                                        {t("page.storyMaker.landing.tryStarter")}
                                    </Button>
                                    <Button variant="tonal" icon={mdAdd} disabled={storageError !== null} onClick={() => setCreatingOpen(true)}>
                                        {t("page.storyMaker.landing.newStory")}
                                    </Button>
                                    <Button variant="outlined" icon={mdUploadFile} disabled={storageError !== null} onClick={() => setImportOpen(true)}>
                                        {t("page.storyMaker.landing.importScript")}
                                    </Button>
                                </div>
                            )}
                        />
                    </Card>
                ) : filtered.length === 0 ? (
                    <Card variant="filled" radius="lg">
                        <EmptyState
                            title={t("page.storyMaker.landing.noMatchesTitle")}
                            description={t("page.storyMaker.landing.noMatchesDescription")}
                        />
                    </Card>
                ) : (
                    <>
                        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {visibleDrafts.map((draft) => {
                                const allNodes = Object.values(draft.doc.nodes);
                                const nodeCount = allNodes.length;
                                const beatCount = totalBeatCount(draft.doc);
                                const endingCount = allNodes.filter(node => node.type === "end").length;

                                return (
                                    <Card key={draft.id} variant="filled" radius="lg" className="flex min-w-0 flex-col justify-between p-4">
                                        <div className="min-w-0 space-y-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate type-title-m text-on-surface">
                                                        {draft.doc.meta.title || t("page.storyMaker.untitled")}
                                                    </h3>
                                                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 type-label-m text-on-surface-variant">
                                                        <span className="shrink-0 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                                                            {t(SERVER_LABEL_KEYS[draft.doc.region])}
                                                        </span>
                                                        {draft.doc.meta.author && (
                                                            <span className="min-w-0 truncate">{draft.doc.meta.author}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Menu
                                                    align="end"
                                                    items={[
                                                        {
                                                            key: "rename",
                                                            label: t("page.storyMaker.landing.rename"),
                                                            icon: mdTitle,
                                                            onSelect: () => {
                                                                setRenameValue(draft.doc.meta.title);
                                                                setRenaming(draft);
                                                            },
                                                        },
                                                        {
                                                            key: "duplicate",
                                                            label: t("page.storyMaker.landing.duplicate"),
                                                            icon: mdContentCopy,
                                                            onSelect: () => void handleDuplicate(draft),
                                                        },
                                                        {
                                                            key: "export-msk",
                                                            label: t("page.storyMaker.v2.script.downloadScript"),
                                                            icon: mdCode,
                                                            onSelect: () => {
                                                                downloadStoryScript(draft.doc);
                                                                setSnack(t("page.storyMaker.v2.script.downloadScript"));
                                                            },
                                                        },
                                                        {
                                                            key: "delete",
                                                            label: t("page.storyMaker.landing.delete"),
                                                            icon: mdDelete,
                                                            dividerBefore: true,
                                                            onSelect: () => setDeleting(draft),
                                                        },
                                                    ]}
                                                    anchor={({ ref, onClick }) => (
                                                        <IconButton
                                                            ref={ref}
                                                            size="xs"
                                                            icon={mdMoreVert}
                                                            label={t("common.md3.more")}
                                                            onClick={onClick}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            {draft.doc.meta.summary && (
                                                <p className="line-clamp-2 break-words type-body-s text-on-surface-variant">
                                                    {draft.doc.meta.summary}
                                                </p>
                                            )}

                                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center -space-x-1.5">
                                                    {draft.doc.cast.slice(0, 4).map(member => (
                                                        member.characterId ? (
                                                            <img
                                                                key={member.key}
                                                                src={getCharacterIconUrl(member.characterId)}
                                                                alt={member.name}
                                                                title={member.name}
                                                                className="size-7 rounded-full border border-surface-container bg-surface-container-highest object-cover"
                                                            />
                                                        ) : (
                                                            <span
                                                                key={member.key}
                                                                title={member.name}
                                                                className="flex size-7 items-center justify-center rounded-full border border-surface-container bg-secondary-container type-label-s text-on-secondary-container"
                                                            >
                                                                {(member.name || "?").slice(0, 1)}
                                                            </span>
                                                        )
                                                    ))}
                                                    {draft.doc.cast.length > 4 && (
                                                        <span className="flex size-7 items-center justify-center rounded-full border border-surface-container bg-surface-container-high type-label-s text-on-surface-variant">
                                                            +{draft.doc.cast.length - 4}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 type-label-s text-on-surface-variant">
                                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5">
                                                        <Icon path={mdAccountTree} size={13} />
                                                        <span className="font-mono">{nodeCount}</span>
                                                        <span>{t("page.storyMaker.nle.tabNodes")}</span>
                                                    </span>
                                                    <span className="inline-flex items-center rounded-md3-xs bg-surface-container-high px-1.5 py-0.5">
                                                        {t("page.storyMaker.stats.steps", { count: beatCount })}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5">
                                                        <Icon path={mdFlag} size={13} />
                                                        <span className="font-mono">{endingCount}</span>
                                                        <span>{t("page.storyMaker.v2.nodeTypes.end")}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 pt-3">
                                            <span className="min-w-0 flex-1 truncate type-label-s text-on-surface-variant">
                                                {t("page.storyMaker.landing.updatedAt", { time: dateFormatter.format(new Date(draft.updatedAt)) })}
                                            </span>
                                            <div className="flex shrink-0 flex-wrap items-center gap-1">
                                                <Button
                                                    size="xs"
                                                    variant="text"
                                                    icon={mdPlayArrowFill}
                                                    href={`/story-maker/play?id=${encodeURIComponent(draft.id)}`}
                                                >
                                                    {t("page.storyMaker.action.play")}
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="tonal"
                                                    icon={mdEdit}
                                                    href={`/story-maker/edit?id=${encodeURIComponent(draft.id)}`}
                                                >
                                                    {t("page.storyMaker.action.edit")}
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                        <LoadMore
                            label={t("page.storyMaker.landing.loadMore")}
                            shown={visibleDrafts.length}
                            total={filtered.length}
                            onLoadMore={loadMore}
                        />
                    </>
                )}
            </section>

            <StoryMetaDialog
                isOpen={creatingOpen}
                onClose={() => setCreatingOpen(false)}
                title={t("page.storyMaker.landing.newStory")}
                confirmLabel={t("page.storyMaker.landing.createConfirm")}
                initial={{ title: "", author: "", summary: "", region: defaultRegion }}
                onSubmit={values => void handleCreate(values)}
            />

            <StoryImportDialog
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                onImport={doc => void handleImport(doc)}
            />

            <Dialog
                isOpen={renaming !== null}
                onClose={() => setRenaming(null)}
                title={t("page.storyMaker.landing.renameTitle")}
                size="sm"
                actions={(
                    <>
                        <Button variant="text" onClick={() => setRenaming(null)}>{t("common.action.cancel")}</Button>
                        <Button variant="filled" onClick={() => void handleRename()}>{t("common.action.confirm")}</Button>
                    </>
                )}
            >
                <TextField
                    label={t("page.storyMaker.meta.title")}
                    value={renameValue}
                    maxLength={STORY_LIMITS.title}
                    onChange={event => setRenameValue(event.target.value)}
                />
            </Dialog>

            <Dialog
                isOpen={deleting !== null}
                onClose={() => setDeleting(null)}
                title={t("page.storyMaker.landing.deleteTitle")}
                size="sm"
                actions={(
                    <>
                        <Button variant="text" onClick={() => setDeleting(null)}>{t("common.action.cancel")}</Button>
                        <Button variant="filled" color="error" onClick={() => void handleDelete()}>
                            {t("page.storyMaker.landing.delete")}
                        </Button>
                    </>
                )}
            >
                <p className="type-body-m text-on-surface-variant">
                    {deleting && t("page.storyMaker.landing.deleteDescription", {
                        title: deleting.doc.meta.title || t("page.storyMaker.untitled"),
                    })}
                </p>
            </Dialog>

            <Snackbar open={snack !== null} message={snack ?? ""} onClose={() => setSnack(null)} />
        </PageContainer>
    );
}

export default function StoryMakerClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryMakerContent />
            </Suspense>
        </MainLayout>
    );
}
