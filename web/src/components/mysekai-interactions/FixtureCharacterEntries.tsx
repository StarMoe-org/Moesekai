"use client";

import { useEffect, useState } from "react";
import Link from "@/components/LocalizedLink";
import { fetchRuntimeManifest, interactionHref, type ResourceSnapshot } from "@/lib/moly/catalog";
import type { MolyKey } from "@/lib/moly/contract";
import type { ServerSourceType } from "@/contexts/ThemeContext";
import { getCharacterName } from "@/lib/i18n";
import { useI18n } from "@/contexts/I18nContext";
import SdPortrait from "./SdPortrait";

// Unit-specific virtual singer IDs 27-56 fold onto base characters 21-26.
// Anything outside that published range is passed through unchanged.
function baseCharacter(unit: number): number { return unit < 27 || unit > 56 ? unit : 21 + Math.floor((unit - 27) / 5); }

/**
 * Compact cast-combination picker for one furniture detail page.
 * The furniture is already the page context, so entries contain only the exact
 * cast combination for that talk. Multi-character casts are stacked together.
 */
export default function FixtureCharacterEntries({ region, fixture, groups }: {
    region: ServerSourceType;
    fixture: number;
    groups: Array<{ id: number; characterIds: number[] }>;
}) {
    const { t } = useI18n();
    const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);

    useEffect(() => {
        const abort = new AbortController();
        void fetchRuntimeManifest(abort.signal)
            .then(manifest => setSnapshot(manifest.snapshots.find(row => row.region === region) ?? null))
            .catch(() => { if (!abort.signal.aborted) setSnapshot(null); });
        return () => abort.abort();
    }, [region]);

    const exact = snapshot?.region === region ? snapshot : null;

    return <div className="flex flex-wrap items-center gap-2" role="list">
        {groups.map(group => {
            const people = group.characterIds.map(unit => ({
                unit,
                name: getCharacterName(t, baseCharacter(unit)),
            }));
            const names = people.map(person => person.name).join(" · ");
            const content = `talk:fixture:${group.id}` as MolyKey;

            return <Link
                key={group.id}
                href={interactionHref({ region, fixture, content, tab: "performances", snapshot: exact?.id })}
                prefetch={false}
                role="listitem"
                data-mysekai-talk-combination={group.id}
                data-fixture={fixture}
                aria-label={names}
                title={names}
                className="group inline-flex min-h-[54px] items-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] p-1.5 transition-colors hover:border-miku/45 hover:bg-miku/5 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                <span className="flex items-center -space-x-3" aria-hidden="true">
                    {people.map(({ unit, name }, index) => exact
                        ? <span key={unit} className="relative overflow-hidden rounded-full bg-[var(--surface-base)] ring-2 ring-[var(--surface-base)] transition-transform group-hover:-translate-y-0.5" style={{ zIndex: people.length - index }}>
                            <SdPortrait snapshot={exact} unit={unit} name={name} size={46} />
                        </span>
                        : <span key={unit} className="relative inline-flex size-[46px] items-center justify-center rounded-full bg-[var(--surface-base)] text-[10px] font-semibold text-[var(--text-muted)] ring-2 ring-[var(--surface-base)]" style={{ zIndex: people.length - index }}>
                            {Array.from(name).slice(0, 2).join("")}
                        </span>)}
                </span>
            </Link>;
        })}
    </div>;
}
