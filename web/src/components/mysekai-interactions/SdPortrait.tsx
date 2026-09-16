"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { sourcePortraits } from "@/lib/moly/portraits";
import type { ResourceSnapshot } from "@/lib/moly/catalog";

/** A transparent production-rendered SD photo; never an ordinary icon fallback. */
export default function SdPortrait({ snapshot, unit, name, size = 64 }: {
    snapshot: ResourceSnapshot; unit: number; name: string; size?: number;
}) {
    const [image, setImage] = useState<{ identity: string; url: string | null } | null>(null);
    const identity = `${snapshot.id}:${unit}`;
    const [failed, setFailed] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        void sourcePortraits(snapshot).then(rows => { if (!cancelled) setImage({ identity, url: rows.get(unit) ?? null }); })
            .catch(() => { if (!cancelled) setImage({ identity, url: null }); });
        return () => { cancelled = true; };
    }, [snapshot, unit, identity]);
    const url = image?.identity === identity && failed !== identity ? image.url : null;
    return <span className="moly-sd-portrait" data-unit={unit} data-snapshot={snapshot.id}
        data-portrait-state={url ? "rendered" : image?.identity === identity ? "unavailable" : "loading"}
        style={{ display: "inline-grid", placeItems: "center", width: size, height: size, flexShrink: 0 }}>
        {url ? <Image src={url} width={size} height={size} alt={name} unoptimized loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setFailed(identity)} />
            : <span title={name} aria-label={name} style={{ fontSize: ".75rem", opacity: .6 }}>{Array.from(name).slice(0, 2).join("")}</span>}
    </span>;
}
