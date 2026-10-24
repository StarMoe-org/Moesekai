"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

type Props = Omit<ImageProps, "src" | "onError"> & { srcs: string[] };

/** A next/image that moves on to the next candidate URL whenever one fails to load. */
export default function FallbackImage({ srcs, alt, ...props }: Props) {
    const key = srcs.join("\n");
    const [failed, setFailed] = useState({ key, count: 0 });
    const count = failed.key === key ? failed.count : 0;
    const src = srcs[Math.min(count, srcs.length - 1)];
    return <Image {...props} src={src} alt={alt} onError={() => setFailed({ key, count: count + 1 })} />;
}
