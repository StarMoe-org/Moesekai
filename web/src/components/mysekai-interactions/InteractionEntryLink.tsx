"use client";

import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { interactionHref } from "@/lib/moly/catalog";
import type { ServerSourceType } from "@/contexts/ThemeContext";
import { Icon } from "@/components/md3";
import { mdArrowForward, mdSmartDisplay } from "@/components/md3/icons";

/** Discovery on ordinary database pages never mounts or preloads the renderer. */
export default function InteractionEntryLink({ region, fixtureId }: { region: ServerSourceType; fixtureId?: number }) {
    const { t } = useI18n();
    const href = interactionHref({ region, fixture: fixtureId, tab: fixtureId ? "performances" : "conversations" });
    return <Link href={href} prefetch={false} data-mysekai-interactions-entry={fixtureId ?? "catalog"}
        className="state-layer focus-ring group flex items-center gap-4 rounded-md3-lg bg-secondary-container px-5 py-4 text-left text-on-secondary-container">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md3-md bg-surface-container-lowest text-primary" aria-hidden="true">
            <Icon path={mdSmartDisplay} size={22} />
        </span>
        <span className="min-w-0 flex-1"><strong className="block type-title-s">{t(`page.mysekaiInteractions.${fixtureId ? "fixtureEntry" : "title"}`)}</strong>
</span>
        <Icon path={mdArrowForward} size={20} className="shrink-0" />
    </Link>;
}
