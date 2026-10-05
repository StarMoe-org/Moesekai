"use client";

import { useState } from "react";
import Image from "next/image";
import SdPortrait from "./SdPortrait";
import type { MolyEntry, MolyFixture } from "@/lib/moly/contract";
import { resourceImage, type ResourceSnapshot } from "@/lib/moly/catalog";

export function FixtureArtwork({
    fixture,
    snapshot,
    size = 48,
}: {
    fixture: MolyFixture;
    snapshot: ResourceSnapshot;
    size?: number;
}) {
    const src = resourceImage(snapshot, fixture.image);
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
                    className="object-contain drop-shadow-sm transition-transform"
                    style={{ width: size, height: size }}
                    onError={() => setFailed(src)}
                />
            ) : (
                <span
                    className="grid place-items-center rounded-md3-sm border border-dashed border-outline-variant type-label-s text-on-surface-variant"
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
                className="relative flex min-h-[130px] w-full flex-wrap items-center justify-center gap-4 rounded-md3-lg bg-surface-container p-4"
                aria-hidden={character || selectFixture ? undefined : true}
            >
                {units.length > 0 && (
                    <div className="flex items-center flex-wrap justify-center gap-3">
                        {units.map(unit => {
                            const person = entry.characters.find(c => c.id === unit);
                            const name = person?.name ?? `SD ${unit}`;
                            const portrait = (
                                <div className="flex flex-col items-center gap-1 group/p">
                                    <span className="rounded-full ring-2 ring-surface-container-lowest bg-surface-container-lowest shadow-elev-1 overflow-hidden p-0.5 flex items-center justify-center transition-shadow group-hover/p:shadow-elev-2">
                                        <SdPortrait snapshot={snapshot} unit={unit} name={name} size={portraitSize} />
                                    </span>
                                    <span className="type-label-m text-on-surface-variant max-w-[80px] truncate text-center">
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
                                    className="state-layer focus-ring cursor-pointer rounded-md3-md p-1"
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
                    <span className="select-none type-title-s text-outline">
                        +
                    </span>
                )}

                {fixtures.length > 0 && (
                    <div className="flex items-center flex-wrap justify-center gap-3">
                        {fixtures.map(f => {
                            const item = (
                                <div className="flex flex-col items-center gap-1 group/f">
                                    <FixtureArtwork fixture={f} snapshot={snapshot} size={fixtureSize} />
                                    <span className="type-label-m text-on-surface-variant max-w-[80px] truncate text-center">
                                        {f.name}
                                    </span>
                                </div>
                            );
                            return selectFixture ? (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => selectFixture(f.id)}
                                    className="state-layer focus-ring cursor-pointer rounded-md3-md p-1"
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
            className="relative flex aspect-[16/10] w-full items-center justify-center gap-2 overflow-hidden rounded-md3-md bg-surface-container p-2.5 sm:aspect-[4/3]"
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
                                className="rounded-full ring-2 ring-surface-container-lowest bg-surface-container-lowest shadow-elev-1 overflow-hidden flex items-center justify-center shrink-0 transition-transform"
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
                <span className="select-none px-0.5 type-label-l text-outline">
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
