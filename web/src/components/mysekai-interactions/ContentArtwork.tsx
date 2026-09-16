"use client";

import { useState } from "react";
import Image from "next/image";
import type { MolyEntry } from "@/lib/moly/contract";
import { resourceImage, type ResourceSnapshot } from "@/lib/moly/catalog";

/** Images retain the selected snapshot's provenance; there is no CDN/region fallback. */
export default function ContentArtwork({ entry, snapshot, large = false }: { entry: MolyEntry; snapshot: ResourceSnapshot; large?: boolean }) {
    const src = resourceImage(snapshot, entry.image);
    const [failed, setFailed] = useState<string | null>(null);
    return <div className={`interaction-art${large ? " interaction-art-large" : ""}`} aria-hidden="true">
        {src && failed !== src
            ? <Image src={src} alt="" width={large ? 360 : 144} height={large ? 360 : 144} unoptimized loading="lazy" onError={() => setFailed(src)} />
            : <span className="interaction-cast-mark">{entry.characters.slice(0, 3).map(character => <span key={character.id}>{Array.from(character.name)[0]}</span>)}</span>}
    </div>;
}
