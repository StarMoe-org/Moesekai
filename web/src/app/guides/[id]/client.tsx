"use client";
import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { localizePathForBrowser } from "@/lib/localized-path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import { Button, ErrorState, Icon, LoadingState, PageContainer, Surface } from "@/components/md3";
import { mdArrowBack, mdOpenInNew, mdPerson } from "@/components/md3/icons";
import {
    fetchGuidesIndex,
    fetchGuideContent,
    stripFrontmatter,
    type GuideEntry,
    type GuidesIndex,
} from "@/lib/guides";

// Category tag tones (same as list page)
const categoryTones: Record<string, string> = {
    gacha: "bg-tertiary-container text-on-tertiary-container",
    event: "bg-primary-container text-on-primary-container",
    team: "bg-secondary-container text-on-secondary-container",
    beginner: "bg-primary text-on-primary",
    system: "bg-surface-container-highest text-on-surface-variant",
};

// Markdown → MD3 typography mapping
const markdownComponents = {
    h1: ({ children, ...props }: React.ComponentProps<"h1">) => (
        <h1 className="mb-4 mt-8 type-headline-s text-on-surface first:mt-0" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
        <h2 className="mb-3 mt-8 border-b border-outline-variant pb-2 type-title-l text-on-surface first:mt-0" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
        <h3 className="mb-2 mt-6 type-title-m text-on-surface" {...props}>{children}</h3>
    ),
    p: ({ children, ...props }: React.ComponentProps<"p">) => (
        <p className="mb-4 type-body-l leading-7! text-on-surface-variant last:mb-0" {...props}>{children}</p>
    ),
    a: ({ href, children, ...props }: React.ComponentProps<"a">) => (
        <ExternalLink
            href={href ?? "#"}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            {...props}
        >
            {children}
        </ExternalLink>
    ),
    strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
        <strong className="font-semibold text-on-surface" {...props}>{children}</strong>
    ),
    em: ({ children, ...props }: React.ComponentProps<"em">) => (
        <em className="text-on-surface-variant" {...props}>{children}</em>
    ),
    blockquote: ({ children, ...props }: React.ComponentProps<"blockquote">) => (
        <blockquote
            className="my-4 rounded-r-md3-md border-l-4 border-primary bg-surface-container-high py-2 pl-4 pr-3 italic text-on-surface-variant"
            {...props}
        >
            {children}
        </blockquote>
    ),
    ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
        <ul className="mb-4 list-inside list-disc space-y-1 type-body-l text-on-surface-variant marker:text-primary" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
        <ol className="mb-4 list-inside list-decimal space-y-1 type-body-l text-on-surface-variant marker:text-primary" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.ComponentProps<"li">) => (
        <li className="leading-7" {...props}>{children}</li>
    ),
    table: ({ children, ...props }: React.ComponentProps<"table">) => (
        <div className="my-4 overflow-x-auto rounded-md3-md border border-outline-variant">
            <table className="w-full type-body-m" {...props}>{children}</table>
        </div>
    ),
    thead: ({ children, ...props }: React.ComponentProps<"thead">) => (
        <thead className="bg-surface-container-high" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: React.ComponentProps<"th">) => (
        <th className="border-b border-outline-variant px-4 py-2.5 text-left type-title-s text-on-surface" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: React.ComponentProps<"td">) => (
        <td className="border-b border-outline-variant px-4 py-2.5 text-on-surface-variant" {...props}>{children}</td>
    ),
    hr: (props: React.ComponentProps<"hr">) => (
        <hr className="my-6 border-outline-variant" {...props} />
    ),
    code: ({ children, className, ...props }: React.ComponentProps<"code">) => {
        // Inline code vs code block
        const isBlock = className?.includes("language-");
        if (isBlock) {
            return (
                <code
                    className={`my-4 block overflow-x-auto rounded-md3-md bg-surface-container-highest p-4 font-mono type-body-m text-on-surface ${className ?? ""}`}
                    {...props}
                >
                    {children}
                </code>
            );
        }
        return (
            <code className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-[0.875em] text-on-surface" {...props}>
                {children}
            </code>
        );
    },
};

function GuideDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { t } = useI18n();
    const guideId = params.id as string;

    const [guide, setGuide] = useState<GuideEntry | null>(null);
    const [categories, setCategories] = useState<Record<string, string>>({});
    const [content, setContent] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                setIsLoading(true);

                // Fetch index to find the guide
                const indexData: GuidesIndex = await fetchGuidesIndex();
                const found = indexData.guides.find((g) => g.id === guideId);
                if (!found) {
                    setError(t("page.guides.detailNotFound"));
                    return;
                }

                setGuide(found);
                setCategories(indexData.categories);

                // Fetch markdown content
                const raw = await fetchGuideContent(found.path);
                const body = stripFrontmatter(raw);
                setContent(body);
                setError(null);
            } catch (err) {
                console.error("Error loading guide:", err);
                setError(err instanceof Error ? err.message : t("page.guides.loadFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [guideId, t]);

    if (isLoading) {
        return <LoadingState label={t("common.state.loading")} className="min-h-[50vh]" />;
    }

    if (error || !guide) {
        return (
            <PageContainer className="max-w-3xl">
                <ErrorState title={t("page.guides.loadFailed")} message={error ?? t("page.guides.unknownError")} />
                <div className="mt-6 flex justify-center">
                    <Button variant="filled" icon={mdArrowBack} onClick={() => router.push(localizePathForBrowser("/guides/"))}>
                        {t("page.guides.backToList")}
                    </Button>
                </div>
            </PageContainer>
        );
    }

    const categoryLabel = categories[guide.category] ?? guide.category;
    const toneClass = categoryTones[guide.category] ?? categoryTones.system;

    return (
        <PageContainer className="max-w-4xl">
            {/* Back Button */}
            <Button variant="text" icon={mdArrowBack} href="/guides/" className="-ml-3 mb-4">
                {t("page.guides.backToList")}
            </Button>

            {/* Article Header */}
            <header className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                    <span className={`inline-flex h-6 items-center rounded-md3-sm px-2 type-label-m ${toneClass}`}>{categoryLabel}</span>
                    <span className="type-body-s text-on-surface-variant">{guide.date}</span>
                </div>

                <h1 className="mb-4 type-headline-m text-on-surface sm:type-headline-l">{guide.title}</h1>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-3 type-body-m text-on-surface-variant">
                    <span className="flex items-center gap-1">
                        <Icon path={mdPerson} size={18} />
                        {guide.author.group}
                        {guide.author.supervisor && t("page.guides.supervisor", { name: guide.author.supervisor })}
                    </span>

                    {guide.source && (
                        <ExternalLink
                            href={guide.source}
                            className="state-layer focus-ring flex items-center gap-1 rounded-full px-2 py-1 type-label-l text-primary"
                        >
                            <Icon path={mdOpenInNew} size={18} />
                            {t("page.guides.viewOriginal")}
                        </ExternalLink>
                    )}
                </div>

                {/* Tags */}
                {guide.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {guide.tags.map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex h-6 items-center rounded-md3-sm border border-outline-variant px-2 type-label-m text-on-surface-variant"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </header>

            {/* Markdown Content */}
            <Surface tone="lowest" radius="xl" as="article" className="p-6 sm:p-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {content}
                </ReactMarkdown>
            </Surface>

            <div className="mx-auto mt-8 max-w-xl">
                <DetailPageAdCard />
            </div>

            {/* Bottom Back Button */}
            <div className="mt-8 text-center">
                <Button variant="tonal" icon={mdArrowBack} href="/guides/">
                    {t("page.guides.backToList")}
                </Button>
            </div>
        </PageContainer>
    );
}

function GuideDetailLoadingFallback() {
    const { t } = useI18n();

    return <LoadingState label={t("page.guides.loadingFallback")} />;
}

export default function GuideDetailClient() {
    return (
        <MainLayout>
            <Suspense fallback={<GuideDetailLoadingFallback />}>
                <GuideDetailContent />
            </Suspense>
        </MainLayout>
    );
}
