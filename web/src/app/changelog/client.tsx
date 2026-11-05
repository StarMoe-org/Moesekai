"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import { PageContainer, PageHeader, Surface } from "@/components/md3";
import type { ChangelogEntry } from "@/lib/changelog";

const GITHUB_BLOB_BASE = "https://github.com/StarMoe-org/Moesekai/blob/main/";

// Relative repo links (e.g. docs/VERSIONING.md) only resolve on GitHub.
function resolveHref(href: string | undefined): string {
    if (!href) return "#";
    if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
    return `${GITHUB_BLOB_BASE}${href.replace(/^\.\//, "")}`;
}

const markdownComponents = {
    h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
        <h3 className="mb-2 mt-6 type-title-m text-on-surface first:mt-0" {...props}>{children}</h3>
    ),
    h4: ({ children, ...props }: React.ComponentProps<"h4">) => (
        <h4 className="mb-2 mt-4 type-title-s text-on-surface first:mt-0" {...props}>{children}</h4>
    ),
    p: ({ children, ...props }: React.ComponentProps<"p">) => (
        <p className="mb-4 type-body-l leading-7! text-on-surface-variant last:mb-0" {...props}>{children}</p>
    ),
    a: ({ href, children, ...props }: React.ComponentProps<"a">) => (
        <ExternalLink
            href={resolveHref(href)}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            {...props}
        >
            {children}
        </ExternalLink>
    ),
    strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
        <strong className="font-semibold text-on-surface" {...props}>{children}</strong>
    ),
    ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
        <ul className="mb-4 list-inside list-disc space-y-1 type-body-l text-on-surface-variant marker:text-primary last:mb-0" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
        <ol className="mb-4 list-inside list-decimal space-y-1 type-body-l text-on-surface-variant marker:text-primary last:mb-0" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.ComponentProps<"li">) => (
        <li className="leading-7" {...props}>{children}</li>
    ),
    blockquote: ({ children, ...props }: React.ComponentProps<"blockquote">) => (
        <blockquote className="my-4 rounded-r-md3-md border-l-4 border-primary bg-surface-container-high py-2 pl-4 pr-3 text-on-surface-variant" {...props}>{children}</blockquote>
    ),
    hr: (props: React.ComponentProps<"hr">) => <hr className="my-6 border-outline-variant" {...props} />,
    code: ({ children, ...props }: React.ComponentProps<"code">) => (
        <code className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-[0.875em] text-on-surface" {...props}>{children}</code>
    ),
};

export default function ChangelogClient({ entries }: { entries: ChangelogEntry[] }) {
    const { t } = useI18n();

    return (
        <MainLayout showLoader={true}>
            <PageContainer className="z-10 max-w-3xl flex-grow">
                <PageHeader title={t("page.changelog.title")} description={t("page.changelog.subtitle")} />

                {entries.length === 0 ? (
                    <Surface tone="card" className="p-6 type-body-l text-on-surface-variant">
                        {t("page.changelog.empty")}
                    </Surface>
                ) : (
                    <div className="space-y-4">
                        {entries.map((entry, index) => (
                            <Surface key={`${entry.title}-${index}`} tone="card" className="p-6 sm:p-8">
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                    <h2 className="type-title-l text-on-surface">{entry.title}</h2>
                                    {index === 0 && (
                                        <span className="rounded-full bg-primary px-2.5 py-0.5 type-label-m text-on-primary">
                                            {t("page.changelog.latest")}
                                        </span>
                                    )}
                                </div>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                    {entry.body}
                                </ReactMarkdown>
                            </Surface>
                        ))}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
