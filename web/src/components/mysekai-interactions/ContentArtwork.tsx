"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import SdPortrait from "./SdPortrait";
import type { MolyEntry, MolyFixture } from "@/lib/moly/contract";
import { resourceImage, type ResourceSnapshot } from "@/lib/moly/catalog";
import { packedImage } from "@/lib/moly/packedImages";

export function FixtureArtwork({
    fixture,
    snapshot,
    size = 48,
}: {
    fixture: MolyFixture;
    snapshot: ResourceSnapshot;
    size?: number;
}) {
    const [packed, setPacked] = useState<{ key: string; url: string } | null>(null);
    const key = `${snapshot.id}:${fixture.image}`;

    useEffect(() => {
        if (!snapshot.packs || !fixture.image) return;
        let cancelled = false;
        let url: string | null = null;
        void packedImage(snapshot, fixture.image)
            .then(blob => {
                if (cancelled) return;
                url = URL.createObjectURL(blob);
                setPacked({ key, url });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [snapshot, fixture.image, key]);

    const src = snapshot.packs
        ? packed?.key === key
            ? packed.url
            : undefined
        : resourceImage(snapshot, fixture.image);
    const [failed, setFailed] = useState<string | null>(null);

    return (
        <span
            className="inline-flex flex-col items-center justify-center shrink-0"
            data-participant-fixture={fixture.id}
            title={fixture.name}
        >
            {src && failed !== src ? (
                <Image
                    src={src}
                    alt={fixture.name}
                    width={size * 2}
                    height={size * 2}
                    unoptimized
                    loading="lazy"
                    className="object-contain drop-shadow-sm transition-transform group-hover:scale-105"
                    style={{ width: size, height: size }}
                    onError={() => setFailed(src)}
                />
            ) : (
                <span
                    className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 grid place-items-center text-[10px] text-slate-400"
                    style={{ width: size, height: size }}
                >
                    {fixture.name.slice(0, 2)}
                </span>
            )}
        </span>
    );
}

/** One cast composition. Sleek, clean and responsive. */
export default function ContentArtwork({
    entry,
    snapshot,
    large = false,
    character,
    fixture: selectFixture,
}: {
    entry: MolyEntry;
    snapshot: ResourceSnapshot;
    large?: boolean;
    character?(id: number): void;
    fixture?(id: number): void;
}) {
    const units = Array.from(new Set(entry.unitIds));
    const fixtures = entry.fixtures?.length
        ? entry.fixtures
        : entry.fixtureIds.slice(0, 1).map(id => ({
              id,
              name: entry.key.startsWith("fixture:") ? entry.title : `#${id}`,
              image: entry.image,
          }));

    const portraitSize = large ? 68 : 46;
    const fixtureSize = large ? 68 : 46;

    if (large) {
        return (
            <div
                className="w-full min-h-[130px] rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900/60 p-4 flex flex-wrap items-center justify-center gap-4 relative border border-slate-200/60 dark:border-slate-800/60"
                aria-hidden={character || selectFixture ? undefined : true}
            >
                {units.length > 0 && (
                    <div className="flex items-center flex-wrap justify-center gap-3">
                        {units.map(unit => {
                            const person = entry.characters.find(c => c.id === unit);
                            const name = person?.name ?? `SD ${unit}`;
                            const portrait = (
                                <div className="flex flex-col items-center gap-1 group/p">
                                    <span className="rounded-full ring-2 ring-white dark:ring-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden p-0.5 flex items-center justify-center transition-transform group-hover/p:scale-105">
                                        <SdPortrait snapshot={snapshot} unit={unit} name={name} size={portraitSize} />
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 max-w-[80px] truncate text-center">
                                        {name}
                                    </span>
                                </div>
                            );
                            return character ? (
                                <button
                                    key={unit}
                                    type="button"
                                    title={name}
                                    onClick={() => character(unit)}
                                    className="cursor-pointer"
                                >
                                    {portrait}
                                </button>
                            ) : (
                                <div key={unit}>{portrait}</div>
                            );
                        })}
                    </div>
                )}

                {units.length > 0 && fixtures.length > 0 && (
                    <span className="text-slate-300 dark:text-slate-600 font-bold text-sm select-none">
                        +
                    </span>
                )}

                {fixtures.length > 0 && (
                    <div className="flex items-center flex-wrap justify-center gap-3">
                        {fixtures.map(f => {
                            const item = (
                                <div className="flex flex-col items-center gap-1 group/f">
                                    <FixtureArtwork fixture={f} snapshot={snapshot} size={fixtureSize} />
                                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 max-w-[80px] truncate text-center">
                                        {f.name}
                                    </span>
                                </div>
                            );
                            return selectFixture ? (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => selectFixture(f.id)}
                                    className="cursor-pointer"
                                    title={f.name}
                                >
                                    {item}
                                </button>
                            ) : (
                                <div key={f.id}>{item}</div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className="w-full aspect-[16/10] sm:aspect-[4/3] rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900/60 p-2.5 flex items-center justify-center gap-2 relative overflow-hidden border border-slate-100 dark:border-slate-800/80"
            aria-hidden={true}
        >
            {/* Character SD portraits stacked */}
            {units.length > 0 && (
                <div className="flex items-center -space-x-2 shrink-0">
                    {units.slice(0, 3).map(unit => {
                        const person = entry.characters.find(c => c.id === unit);
                        const name = person?.name ?? `SD ${unit}`;
                        return (
                            <span
                                key={unit}
                                className="rounded-full ring-2 ring-white dark:ring-slate-800 bg-white dark:bg-slate-800 shadow-xs overflow-hidden flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                                title={name}
                            >
                                <SdPortrait snapshot={snapshot} unit={unit} name={name} size={portraitSize} />
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Subtle separator if both exist */}
            {units.length > 0 && fixtures.length > 0 && (
                <span className="text-slate-300 dark:text-slate-600 text-xs font-bold select-none px-0.5">
                    ×
                </span>
            )}

            {/* Fixture thumbnail */}
            {fixtures.length > 0 && (
                <div className="flex items-center shrink-0">
                    <FixtureArtwork fixture={fixtures[0]} snapshot={snapshot} size={fixtureSize} />
                </div>
            )}
        </div>
    );
}
