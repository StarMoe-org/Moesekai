"use client";

import { useState } from "react";
import Image from "next/image";
import SdPortrait from "./SdPortrait";
import type { MolyEntry, MolyFixture } from "@/lib/moly/contract";
import { resourceImage, type ResourceSnapshot } from "@/lib/moly/catalog";

function FixtureArtwork({ fixture, snapshot }: { fixture: MolyFixture; snapshot: ResourceSnapshot }) {
    const src = resourceImage(snapshot, fixture.image);
    const [failed, setFailed] = useState<string | null>(null);
    return <span className="interaction-participant-fixture" data-participant-fixture={fixture.id} title={fixture.name}>
        {src && failed !== src ? <Image src={src} alt="" width={144} height={144} unoptimized loading="lazy" onError={() => setFailed(src)} />
            : <span className="interaction-art-unavailable">{fixture.name}</span>}
        <span className="interaction-participant-caption">{fixture.name}</span>
    </span>;
}

/** One cast composition. Source furniture and actual SD units coexist, never replace each other. */
export default function ContentArtwork({ entry, snapshot, large = false }: { entry: MolyEntry; snapshot: ResourceSnapshot; large?: boolean }) {
    const units = Array.from(new Set(entry.unitIds));
    const fixtures = entry.fixtures?.length ? entry.fixtures : entry.fixtureIds.slice(0, 1).map(id => ({ id, name: entry.key.startsWith("fixture:") ? entry.title : `#${id}`, image: entry.image }));
    return <div className={`interaction-art interaction-participants${large ? " interaction-art-large" : ""}`} aria-hidden="true"
        data-participant-count={units.length} data-furniture-count={fixtures.length}>
        {units.length > 0 && <span className="interaction-participant-cast">
            {units.map(unit => {
                const person = entry.characters.find(character => character.id === unit);
                const name = person?.name ?? `SD ${unit}`;
                return <span className="interaction-participant-person" key={unit} title={name}>
                    <span className="interaction-participant-medallion"><SdPortrait snapshot={snapshot} unit={unit} name={name} size={64} /></span>
                    <span className="interaction-participant-caption">{person?.originalName ?? name}</span>
                </span>;
            })}
        </span>}
        {units.length > 0 && fixtures.length > 0 && <span className="interaction-participant-join">×</span>}
        {fixtures.length > 0 && <span className="interaction-participant-furniture">
            {fixtures.map(fixture => <FixtureArtwork key={fixture.id} fixture={fixture} snapshot={snapshot} />)}
        </span>}
    </div>;
}
