"use client";

import { useId, type ReactNode } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS, type ServerType } from "@/lib/account-servers";

interface ServerRegionProps {
    server: ServerType;
    size?: number;
    className?: string;
}

export interface ServerRegionIconProps extends ServerRegionProps {
    /** Omit for the translated server name; use decorative beside visible text. */
    label?: string;
    decorative?: boolean;
}

export interface ServerRegionLabelProps extends ServerRegionProps {
    label?: ReactNode;
}

const STAR = "0,-1 .2245,-.309 .9511,-.309 .3633,.118 .5878,.809 0,.382 -.5878,.809 -.3633,.118 -.9511,-.309 -.2245,-.309";

function Star({ x, y, radius, rotation = 0 }: { x: number; y: number; radius: number; rotation?: number }) {
    return <polygon points={STAR} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${radius})`} />;
}

// Geon (sky), Gam (water), Ri (fire), Gon (earth), in their flag corners.
const TRIGRAMS = [
    { name: "geon", x: 27, y: 34.67, rotation: -56.31, broken: [false, false, false] },
    { name: "gam", x: 73, y: 34.67, rotation: 56.31, broken: [true, false, true] },
    { name: "ri", x: 27, y: 65.33, rotation: 56.31, broken: [false, true, false] },
    { name: "gon", x: 73, y: 65.33, rotation: -56.31, broken: [true, true, true] },
] as const;

function RegionArtwork({ server }: { server: ServerType }) {
    switch (server) {
        case "cn":
            return <>
                <rect width="100" height="100" fill="#de2910" />
                <g fill="#ffde00">
                    <Star x={26} y={34} radius={12} />
                    {[[43, 21], [50, 30], [50, 42], [43, 51]].map(([x, y]) => (
                        <Star key={`${x}-${y}`} x={x} y={y} radius={4} rotation={Math.atan2(34 - y, 26 - x) * 180 / Math.PI + 90} />
                    ))}
                </g>
            </>;
        case "jp":
            return <><rect width="100" height="100" fill="#fff" /><circle cx="50" cy="50" r="25" fill="#bc002d" /></>;
        case "en":
            // Simplified artwork fills the disc and remains legible at 16–20px.
            return <>
                <rect width="100" height="100" fill="#fff" />
                <path d="M0 0h100v14H0zm0 28h100v14H0zm0 28h100v14H0zm0 28h100v16H0z" fill="#b22234" />
                <rect width="54" height="56" fill="#3c3b6e" />
                <g fill="#fff"><Star x={30} y={30} radius={16} /></g>
            </>;
        case "kr":
            return <>
                <rect width="100" height="100" fill="#fff" />
                <g transform="rotate(33.69 50 50)">
                    <circle cx="50" cy="50" r="16" fill="#0047a0" />
                    <path d="M34 50a16 16 0 0 1 32 0a8 8 0 0 0-16 0a8 8 0 0 1-16 0" fill="#cd2e3a" />
                </g>
                {TRIGRAMS.map(({ name, x, y, rotation, broken }) => (
                    <g key={name} data-trigram={name} transform={`translate(${x} ${y}) rotate(${rotation})`} fill="#111">
                        {broken.map((split, row) => split
                            ? <path key={row} d={`M-8 ${row * 4 - 5.33}h7.33v2.67h-7.33z M.67 ${row * 4 - 5.33}H8v2.67H.67z`} />
                            : <rect key={row} x="-8" y={row * 4 - 5.33} width="16" height="2.67" />)}
                    </g>
                ))}
            </>;
        case "tw":
            // Hong Kong regional flag artwork, used for the HMT display region.
            // Public-domain vector: Wikimedia Commons / Flag_of_Hong_Kong.svg.
            // The backend identity remains tw; this is presentation only.
            return <>
                <rect width="100" height="100" fill="#ee1c25" />
                <g transform="translate(50 50) scale(.2) translate(-450 -300)">
                    {[0, 72, 144, 216, 288].map((angle) => (
                        <g key={angle} data-hmt-petal transform={`rotate(${angle} 450 300)`}>
                            <path d="M492.936022 125.19583a27.917245 27.917245 0 0 0-14.901582 41.791893 45.171052 45.171052 0 0 1-20.289932 66.204239 38.650583 38.650583 0 0 0-10.816469 64.313021 68.374981 68.374981 0 0 1-17.067835-93.913589 15.809868 15.809868 0 0 1-1.109109-1.047777 69.880683 69.880683 0 0 0 16.754434 95.793146 90.342104 90.342104 0 0 1 47.430493-173.140933" fill="#fff" />
                            <path d="M451.979333 181.099409l-27.564739 12.021638 29.366483 6.476437-19.951229-22.500734 2.915284 29.930515" fill="#ee1c25" />
                        </g>
                    ))}
                </g>
            </>;
    }
}

/** Display aliases must never be written back to server IDs or resource paths. */
export function getServerDisplayCode(server: ServerType): string {
    return server === "tw" ? "HMT" : server.toUpperCase();
}

/** Game server artwork only: never use flags to represent UI languages. */
export function ServerRegionIcon({ server, size = 20, className = "", label, decorative = false }: ServerRegionIconProps) {
    const { t } = useI18n();
    const clipId = `server-region-${useId().replace(/:/g, "")}`;
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" focusable="false"
            className={`inline-block shrink-0 align-middle ${className}`}
            role={decorative ? undefined : "img"} aria-hidden={decorative || undefined}
            aria-label={decorative ? undefined : label ?? t(SERVER_LABEL_KEYS[server])} data-server-region={server} data-display-region={getServerDisplayCode(server)}>
            <defs><clipPath id={clipId}><circle cx="50" cy="50" r="49" /></clipPath></defs>
            <g clipPath={`url(#${clipId})`}><RegionArtwork server={server} /></g>
            <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" />
        </svg>
    );
}

export function ServerRegionLabel({ server, size = 20, className = "", label }: ServerRegionLabelProps) {
    const { t } = useI18n();
    const displayLabel = server === "tw" && typeof label === "string" && label.trim().toUpperCase() === "TW" ? getServerDisplayCode(server) : label;
    return <span className={`inline-flex min-w-0 items-center gap-1.5 align-middle ${className}`}>
        <ServerRegionIcon server={server} size={size} decorative />
        <span className="min-w-0">{displayLabel ?? t(SERVER_LABEL_KEYS[server])}</span>
    </span>;
}
