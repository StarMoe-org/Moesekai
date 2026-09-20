"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { ResourceSnapshot } from "@/lib/moly/catalog";
import { packedImage } from "@/lib/moly/packedImages";

interface Props {
    snapshot?: ResourceSnapshot;
    image?: string | null;
    pending: boolean;
    fallback: string;
    alt: string;
    width: number;
    height: number;
    priority?: boolean;
}

/** Prefer the published source thumbnail to an unrelated live CDN projection. */
export default function FurnitureThumbnail({ snapshot, image, pending, fallback, alt, width, height, priority = false }: Props) {
    const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const packed = Boolean(snapshot?.packs && image);
    const key = `${snapshot?.id ?? ""}:${image ?? ""}`;
    useEffect(() => {
        if (!snapshot?.packs || !image) return;
        let cancelled = false;
        let url: string | null = null;
        void packedImage(snapshot, image).then(blob => {
            if (cancelled) return;
            url = URL.createObjectURL(blob);
            setLoaded({ key, url });
        }).catch(() => { if (!cancelled) setLoaded({ key, url: "" }); });
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [snapshot, image, key]);
    const src = pending ? undefined : packed ? loaded?.key === key ? loaded.url : undefined : fallback;
    if (src && src !== failed) return <Image src={src} alt={alt} width={width} height={height} unoptimized priority={priority}
        loading={priority ? undefined : "lazy"} onError={() => setFailed(src)} />;
    return <span className="workspace-thumbnail-placeholder" aria-hidden="true" data-image-pending={pending || (packed && loaded?.key !== key)}>
        <svg viewBox="0 0 32 32" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="m16 3 12 7v13l-12 7-12-7V10l12-7ZM4 10l12 7 12-7M16 17v13" /></svg>
    </span>;
}
