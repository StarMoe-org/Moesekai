"use client";

import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { interactionHref } from "@/lib/moly/catalog";
import type { ServerSourceType } from "@/contexts/ThemeContext";

/** Discovery on ordinary database pages never mounts or preloads the renderer. */
export default function InteractionEntryLink({ region, fixtureId }: { region: ServerSourceType; fixtureId?: number }) {
    const { t } = useI18n();
    const href = interactionHref({ region, fixture: fixtureId, tab: "furniture", content: fixtureId ? `fixture:${fixtureId}` : undefined });
    return <Link href={href} prefetch={false} data-mysekai-interactions-entry={fixtureId ?? "catalog"}
        className="group flex items-center gap-4 rounded-2xl border border-miku/35 bg-[var(--accent-soft)] px-5 py-4 text-left text-[var(--text-strong)] transition-colors hover:bg-[var(--accent-soft-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--text-strong)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-base)]" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z"/><path d="m10 8 6 4-6 4V8Z"/></svg>
        </span>
        <span className="min-w-0 flex-1"><strong className="block text-sm leading-relaxed">{t(`page.mysekaiInteractions.${fixtureId ? "fixtureEntry" : "title"}`)}</strong>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--text-body)]">{t("page.mysekaiInteractions.r4b.entryDownloadNotice")}</span></span>
        <span aria-hidden="true" className="shrink-0 text-lg">→</span>
    </Link>;
}
