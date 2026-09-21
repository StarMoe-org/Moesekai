"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import SdPortrait from "./SdPortrait";
import type { MolyEntry, MolyFixture } from "@/lib/moly/contract";
import { resourceImage, type ResourceSnapshot } from "@/lib/moly/catalog";
import { packedImage } from "@/lib/moly/packedImages";

export function FixtureArtwork({ fixture, snapshot }: { fixture: MolyFixture; snapshot: ResourceSnapshot }) {
    const [packed, setPacked] = useState<{ key: string; url: string } | null>(null);
    const key = `${snapshot.id}:${fixture.image}`;
    useEffect(() => {
        if (!snapshot.packs || !fixture.image) return;
        let cancelled = false;
        let url: string | null = null;
        void packedImage(snapshot, fixture.image).then(blob => {
            if (cancelled) return;
            url = URL.createObjectURL(blob);
            setPacked({ key, url });
        }).catch(() => {});
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [snapshot, fixture.image, key]);
    const src = snapshot.packs ? packed?.key === key ? packed.url : undefined : resourceImage(snapshot, fixture.image);
    const [failed, setFailed] = useState<string | null>(null);
    return <span className="interaction-participant-fixture" data-participant-fixture={fixture.id} title={fixture.name}>
        {src && failed !== src ? <Image src={src} alt="" width={144} height={144} unoptimized loading="lazy" onError={() => setFailed(src)} />
            : <span className="interaction-art-unavailable">{fixture.name}</span>}
        <span className="interaction-participant-caption">{fixture.name}</span>
    </span>;
}

/** One cast composition. Source furniture and actual SD units coexist, never replace each other. */
export default function ContentArtwork({ entry, snapshot, large = false, character, fixture: selectFixture }: { entry: MolyEntry; snapshot: ResourceSnapshot; large?: boolean; character?(id: number): void; fixture?(id: number): void }) {
    const units = Array.from(new Set(entry.unitIds));
    const fixtures = entry.fixtures?.length ? entry.fixtures : entry.fixtureIds.slice(0, 1).map(id => ({ id, name: entry.key.startsWith("fixture:") ? entry.title : `#${id}`, image: entry.image }));
    return <div className={`interaction-art interaction-participants${large ? " interaction-art-large" : ""}`} aria-hidden={character || selectFixture ? undefined : true}
        data-participant-count={units.length} data-furniture-count={fixtures.length}>
        {units.length > 0 && <span className="interaction-participant-cast">
            {units.map(unit => {
                const person = entry.characters.find(character => character.id === unit);
                const name = person?.name ?? `SD ${unit}`;
                const portrait = <><span className="interaction-participant-medallion"><SdPortrait snapshot={snapshot} unit={unit} name={name} size={64} /></span>
                    <span className="interaction-participant-caption">{name}</span></>;
                return character ? <button className="interaction-participant-person" key={unit} title={name} onClick={() => character(unit)}>{portrait}</button>
                    : <span className="interaction-participant-person" key={unit} title={name}>{portrait}</span>;
            })}
        </span>}
        {units.length > 0 && fixtures.length > 0 && <span className="interaction-participant-join">×</span>}
        {fixtures.length > 0 && <span className="interaction-participant-furniture">
            {fixtures.map(fixture => selectFixture ? <button key={fixture.id} className="workspace-art-link" onClick={() => selectFixture(fixture.id)}><FixtureArtwork fixture={fixture} snapshot={snapshot} /></button> : <FixtureArtwork key={fixture.id} fixture={fixture} snapshot={snapshot} />)}
        </span>}
    </div>;
}
