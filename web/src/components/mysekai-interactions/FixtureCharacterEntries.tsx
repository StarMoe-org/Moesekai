"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "@/components/LocalizedLink";
import { fetchRuntimeManifest, interactionHref, type ResourceSnapshot } from "@/lib/moly/catalog";
import type { ServerSourceType } from "@/contexts/ThemeContext";
import { getCharacterName } from "@/lib/i18n";
import { useI18n } from "@/contexts/I18nContext";
import SdPortrait from "./SdPortrait";

function baseCharacter(unit: number): number { return unit <= 26 ? unit : 21 + Math.floor((unit - 27) / 5); }

/** Furniture context plus the exact SD participants. The furniture never disappears
 * just because a conversation has one or more characters. */
export default function FixtureCharacterEntries({ region, fixture, fixtureName, fixtureImage, groups }: {
    region: ServerSourceType; fixture: number; fixtureName: string; fixtureImage: string;
    groups: Array<{ id: number; characterIds: number[] }>;
}) {
    const { t } = useI18n();
    const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
    useEffect(() => {
        const abort = new AbortController();
        void fetchRuntimeManifest(abort.signal).then(manifest => setSnapshot(manifest.snapshots.find(row => row.region === region && row.available) ?? null))
            .catch(() => { if (!abort.signal.aborted) setSnapshot(null); });
        return () => abort.abort();
    }, [region]);
    const exact = snapshot?.region === region ? snapshot : null;
    return <div className="grid gap-3">{groups.map(group => <div key={group.id}
        className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-3 shadow-sm">
        <div className="flex w-20 shrink-0 flex-col items-center gap-1.5">
            <div className="relative size-16 rounded-xl bg-white p-1 ring-1 ring-slate-200">
                <Image src={fixtureImage} alt="" fill className="object-contain p-1" unoptimized loading="lazy" />
            </div>
            <span className="max-w-full truncate text-[10px] font-medium text-slate-500" title={fixtureName}>{fixtureName}</span>
        </div>
        <span className="shrink-0 text-sm font-medium text-slate-300" aria-hidden="true">×</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{group.characterIds.map(unit => {
            const name = getCharacterName(t, baseCharacter(unit));
            return <Link key={unit} href={interactionHref({ region, fixture, character: unit, tab: "conversations", snapshot: exact?.id })}
                prefetch={false} data-mysekai-character-entry={unit} data-fixture={fixture}
                title={`${name} · SD ${unit}`} aria-label={`${name} · ${t("page.mysekaiInteractions.r4b.characterEntry")}`}
                className="group/person flex min-w-0 items-center gap-2 rounded-xl border border-transparent bg-white/70 p-1.5 pr-2.5 transition-colors hover:border-miku/40 hover:bg-miku/5 focus-visible:outline-2 focus-visible:outline-offset-2">
                {exact ? <span className="overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><SdPortrait snapshot={exact} unit={unit} name={name} size={58} /></span>
                    : <span className="inline-flex size-[58px] items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{name.slice(0, 2)}</span>}
                <span className="max-w-28 truncate text-xs font-semibold text-slate-600 group-hover/person:text-miku-dark">{name}</span>
            </Link>;
        })}</div>
    </div>)}</div>;
}
