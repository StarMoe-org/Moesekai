"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import type { ILyricsDisplaySegment, ILyricsRubySpan, ILyricsV3Performer, LyricsPerformerID } from "@/lib/lyrics";
import { adjustHexForContrast, getLyricsPerformerColors } from "@/lib/lyrics-colors";
import {
    getExternalLyricsPerformer,
    getExternalLyricsPerformerBySourceId,
    getLyricsCharacterIdBySourceId,
} from "@/lib/lyrics-performers";

interface LyricTextProps {
    text?: string;
    performerIds?: LyricsPerformerID[];
    ruby?: ILyricsRubySpan[];
    segments?: ILyricsDisplaySegment[];
    trailingPerformerIds?: LyricsPerformerID[];
    performers?: readonly ILyricsV3Performer[];
    showPerformerAvatars?: boolean;
}

type PerformerStyle = CSSProperties & {
    "--performer-color"?: string;
    "--performer-gradient"?: string;
};

interface PerformerDescriptor {
    id: LyricsPerformerID;
    name: string;
    avatarUrl?: string;
    colors?: { base: string; foreground: string };
}

function samePerformerGroup(left: LyricsPerformerID[], right: LyricsPerformerID[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function linePerformerGroups(segments: ILyricsDisplaySegment[], trailingPerformerIds: LyricsPerformerID[]): LyricsPerformerID[][] {
    const groups: LyricsPerformerID[][] = [];
    for (const segment of segments) {
        if (segment.performerIds.length === 0) continue;
        const previous = groups.at(-1);
        if (!previous || !samePerformerGroup(previous, segment.performerIds)) {
            groups.push([...segment.performerIds]);
        }
    }
    if (groups.length === 0 && trailingPerformerIds.length > 0) groups.push([...trailingPerformerIds]);
    return groups;
}

function readLyricsSurface(): string {
    if (typeof document === "undefined") return "#ffffff";
    const styles = getComputedStyle(document.documentElement);
    return styles.getPropertyValue("--md-sys-color-surface-container-low").trim()
        || styles.getPropertyValue("--md-sys-color-surface").trim()
        || "#ffffff";
}

function segmentStyle(performers: PerformerDescriptor[]): { className: string; style?: PerformerStyle } {
    const colored = performers.filter((performer) => performer.colors);
    if (performers.length === 1 && colored.length === 1) {
        const colors = colored[0].colors as NonNullable<PerformerDescriptor["colors"]>;
        return {
            className: "text-[var(--performer-color)]",
            style: { "--performer-color": colors.foreground },
        };
    }
    if (performers.length > 1 && colored.length === performers.length) {
        const gradient = `linear-gradient(90deg, ${performers.map((performer) => performer.colors?.foreground).join(", ")})`;
        return {
            className: "bg-[image:var(--performer-gradient)] bg-clip-text text-transparent",
            style: { "--performer-gradient": gradient },
        };
    }
    return { className: "text-on-surface" };
}

function RubyText({ spans }: { spans: ILyricsRubySpan[] }) {
    return spans.map((span, index) => span.reading ? (
        <ruby key={`${index}-${span.text}`} className="ruby-annotation">
            {span.text}
            <rp>(</rp>
            <rt className="text-[0.55em] font-normal text-on-surface-variant">{span.reading}</rt>
            <rp>)</rp>
        </ruby>
    ) : (
        <span key={`${index}-${span.text}`}>{span.text}</span>
    ));
}

export default function LyricText({
    text = "",
    performerIds = [],
    ruby,
    segments,
    trailingPerformerIds = [],
    performers = [],
    showPerformerAvatars = true,
}: LyricTextProps) {
    const { t } = useI18n();
    const [surface, setSurface] = useState("#ffffff");

    useEffect(() => {
        const root = document.documentElement;
        const updateSurface = () => setSurface(readLyricsSurface());
        updateSurface();
        const observer = new MutationObserver(updateSurface);
        observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-seed"] });
        return () => observer.disconnect();
    }, []);

    const displaySegments: ILyricsDisplaySegment[] = segments ?? [{
        text,
        performerIds,
        ruby: ruby?.length ? ruby : [{ text }],
    }];

    const performer = (id: LyricsPerformerID): PerformerDescriptor | null => {
        if (typeof id === "number") {
            const colors = getLyricsPerformerColors(id, surface);
            if (!colors) return null;
            const external = getExternalLyricsPerformer(id);
            return {
                id,
                colors,
                name: external?.name ?? getCharacterName(t, id, "short"),
                avatarUrl: external?.avatarUrl ?? getCharacterIconUrl(id),
            };
        }
        const source = performers.find((item) => item.performerId === id);
        if (!source) return null;
        const characterId = getLyricsCharacterIdBySourceId(id);
        const external = getExternalLyricsPerformerBySourceId(id);
        const sourceColor = source.color ?? external?.color;
        const colors = sourceColor ? {
            base: sourceColor,
            foreground: adjustHexForContrast(sourceColor, surface),
        } : characterId ? getLyricsPerformerColors(characterId, surface) : undefined;
        const avatarUrl = characterId ? getCharacterIconUrl(characterId) : external?.avatarUrl;
        return {
            id,
            name: source.name,
            ...(avatarUrl ? { avatarUrl } : {}),
            ...(colors ? { colors } : {}),
        };
    };

    const groups = showPerformerAvatars
        ? linePerformerGroups(displaySegments, trailingPerformerIds)
            .map((ids) => ids.map(performer).filter((item): item is PerformerDescriptor => item !== null))
            .filter((items) => items.length > 0)
        : [];

    return (
        <p className="min-w-0 max-w-full whitespace-pre-wrap break-words font-medium leading-relaxed text-on-surface [overflow-wrap:anywhere]">
            {displaySegments.map((segment, index) => {
                const performers = segment.performerIds
                    .map(performer)
                    .filter((item): item is PerformerDescriptor => item !== null);
                const visual = segmentStyle(performers);
                return (
                    <span key={`${index}-${segment.text}`} className={visual.className} style={visual.style}>
                        <RubyText spans={segment.ruby.length ? segment.ruby : [{ text: segment.text }]} />
                    </span>
                );
            })}
            {groups.length > 0 && (
                <span className="ms-2 inline-flex max-w-full flex-wrap items-center gap-1.5 align-middle">
                    {groups.map((group, groupIndex) => {
                        const names = group.map((item) => item.name).join(", ");
                        return (
                            <span
                                key={`${groupIndex}-${group.map((item) => item.id).join("-")}`}
                                className={`inline-flex shrink-0 items-center ${group.length > 1 ? "-space-x-1.5" : ""}`}
                                aria-label={names}
                            >
                                {group.map((item) => item.avatarUrl ? (
                                    <span
                                        key={String(item.id)}
                                        className="relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 border-surface bg-surface-container-high ring-1 ring-outline-variant"
                                        aria-hidden="true"
                                    >
                                        <Image
                                            src={item.avatarUrl}
                                            alt=""
                                            fill
                                            sizes="24px"
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </span>
                                ) : (
                                    <span
                                        key={String(item.id)}
                                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-outline-variant bg-surface-container px-1.5 text-[9px] font-bold text-on-surface-variant"
                                        aria-hidden="true"
                                    >
                                        {item.name.slice(0, 2)}
                                    </span>
                                ))}
                            </span>
                        );
                    })}
                </span>
            )}
        </p>
    );
}
