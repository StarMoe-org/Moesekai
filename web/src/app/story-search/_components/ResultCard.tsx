"use client";

import { useMemo, useState } from "react";
import LocalizedLink from "@/components/LocalizedLink";
import { Button, Card } from "@/components/md3";
import { mdCheck, mdContentCopy, mdMenuBook, mdPlayArrow } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { speakerMatchesCharacterIds } from "@/lib/story-search/characters";
import { parseDialogueLines, stripChunkHeader, type DialogueLine } from "@/lib/story-search/dialogue";
import { resolveChunkLinks, type StoryLinkLookup } from "@/lib/story-search/links";
import type { StoryResultView, StorySearchHit, StorySearchMode } from "@/lib/story-search/types";

interface ResultCardProps {
    hit: StorySearchHit;
    mode: StorySearchMode;
    resultView: StoryResultView;
    selectedCharacters: number[];
    highlightQuery: string;
    isRegex: boolean;
    caseSensitive: boolean;
    lookup?: StoryLinkLookup | null;
}

function renderHighlightedText(
    text: string,
    query: string,
    isRegex: boolean,
    caseSensitive: boolean,
): React.ReactNode {
    const q = query.trim();
    if (!q) return text;

    let re: RegExp | null = null;
    try {
        if (isRegex) {
            re = new RegExp(q, caseSensitive ? "g" : "ig");
        } else {
            const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            re = new RegExp(escaped, caseSensitive ? "g" : "ig");
        }
    } catch {
        return text;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchCount = 0;

    for (const match of text.matchAll(re)) {
        const start = match.index ?? 0;
        const matched = match[0];
        if (!matched) {
            if (matchCount++ > 32) break;
            continue;
        }
        if (start > lastIndex) {
            parts.push(text.slice(lastIndex, start));
        }
        parts.push(
            <mark
                key={`${start}-${matchCount}`}
                className="rounded-md3-xs bg-primary-container px-0.5 text-on-primary-container"
            >
                {matched}
            </mark>,
        );
        lastIndex = start + matched.length;
        if (matchCount++ > 64) break;
    }

    if (parts.length === 0) return text;
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

export default function ResultCard({
    hit,
    mode,
    resultView,
    selectedCharacters,
    highlightQuery,
    isRegex,
    caseSensitive,
    lookup,
}: ResultCardProps) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);

    const { chunk } = hit;
    const links = useMemo(() => resolveChunkLinks(chunk, lookup), [chunk, lookup]);
    const bodyText = useMemo(
        () => (chunk.text ? stripChunkHeader(chunk.text) : ""),
        [chunk.text],
    );
    const lines = useMemo<DialogueLine[]>(
        () => (chunk.text ? parseDialogueLines(chunk.text) : []),
        [chunk.text],
    );

    const briefLines = useMemo<DialogueLine[]>(() => {
        if (resultView !== "brief") return lines;
        if (mode === "local" && Array.isArray(hit.matchedLineIndices) && hit.matchedLineIndices.length > 0) {
            return hit.matchedLineIndices
                .map((idx) => lines[idx])
                .filter((item): item is DialogueLine => Boolean(item));
        }
        if (selectedCharacters.length === 0) return lines;
        return lines.filter((item) => item.speaker !== null && speakerMatchesCharacterIds(item.speaker, selectedCharacters));
    }, [hit.matchedLineIndices, lines, mode, resultView, selectedCharacters]);

    const handleCopy = async () => {
        if (!bodyText) return;
        try {
            await navigator.clipboard.writeText(bodyText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard unavailable
        }
    };

    // Brief mode: purely render matched `Speaker: dialogue` lines without story metadata, badges, or action links.
    if (resultView === "brief") {
        return (
            <Card variant="outlined" className="bg-surface-card px-3.5 py-2.5">
                {briefLines.length > 0 ? (
                    <div className="space-y-1 type-body-m text-on-surface">
                        {briefLines.map((item, idx) => {
                            if (item.speaker !== null) {
                                return (
                                    <div key={idx} className="leading-relaxed">
                                        <span className="font-medium text-primary">{item.speaker}: </span>
                                        <span>
                                            {mode === "local"
                                                ? renderHighlightedText(item.speech, highlightQuery, isRegex, caseSensitive)
                                                : item.speech}
                                        </span>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} className="leading-relaxed">
                                    {mode === "local"
                                        ? renderHighlightedText(item.speech, highlightQuery, isRegex, caseSensitive)
                                        : item.speech}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="type-body-s text-on-surface-variant">
                        {bodyText
                            ? t("page.storySearch.results.noSelectedCharLines")
                            : t("page.storySearch.results.noContextAvailable")}
                    </p>
                )}
            </Card>
        );
    }

    const scoreBadge = mode === "semantic"
        ? t("page.storySearch.results.scoreLabel", { score: hit.score.toFixed(3) })
        : hit.matchCount && hit.matchCount > 0
            ? t("page.storySearch.results.matchCount", { count: hit.matchCount })
            : null;

    return (
        <Card variant="outlined" className="bg-surface-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                            {t(`page.storySearch.filters.types.${chunk.type}`)}
                        </span>
                        <span className="inline-flex items-center rounded-md3-xs bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                            {chunk.server.toUpperCase()}
                        </span>
                        {chunk.ep && (
                            <span className="inline-flex items-center rounded-md3-xs bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                                #{chunk.ep}
                            </span>
                        )}
                        <span className="type-label-s text-on-surface-variant">
                            {t("page.storySearch.results.linesRange", {
                                start: chunk.line_start + 1,
                                end: chunk.line_end,
                            })}
                        </span>
                    </div>
                    <h3 className="mt-1.5 type-title-m text-on-surface">{chunk.story}</h3>
                </div>

                {scoreBadge && (
                    <span className="shrink-0 rounded-md3-sm bg-primary-container px-2.5 py-1 type-label-m text-on-primary-container">
                        {scoreBadge}
                    </span>
                )}
            </div>

            {chunk.chars.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {chunk.chars.map((charName, index) => (
                        <span
                            key={`${charName}-${index}`}
                            className="inline-flex items-center rounded-md3-xs bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant"
                        >
                            {charName}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-3 rounded-md3-md bg-surface-container/70 p-3">
                {lines.length > 0 ? (
                    <div className="space-y-1.5 type-body-m text-on-surface">
                        {lines.map((item, idx) => {
                            const isMatchedLine = Array.isArray(hit.matchedLineIndices)
                                ? hit.matchedLineIndices.includes(idx)
                                : false;
                            if (item.speaker !== null) {
                                return (
                                    <div key={idx} className={isMatchedLine ? "leading-relaxed font-medium" : "leading-relaxed"}>
                                        <span className="font-medium text-primary">{item.speaker}: </span>
                                        <span>
                                            {mode === "local"
                                                ? renderHighlightedText(item.speech, highlightQuery, isRegex, caseSensitive)
                                                : item.speech}
                                        </span>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} className={isMatchedLine ? "leading-relaxed font-medium" : "leading-relaxed"}>
                                    {mode === "local"
                                        ? renderHighlightedText(item.speech, highlightQuery, isRegex, caseSensitive)
                                        : item.speech}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="type-body-s text-on-surface-variant">
                        {t("page.storySearch.results.noContextAvailable")}
                    </p>
                )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="truncate type-label-s text-on-surface-variant">
                    {chunk.scenario_id}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                    {bodyText && (
                        <Button
                            variant="text"
                            size="s"
                            icon={copied ? mdCheck : mdContentCopy}
                            onClick={handleCopy}
                        >
                            {copied ? t("page.storySearch.results.copied") : t("page.storySearch.results.copyText")}
                        </Button>
                    )}
                    {links.storyHref && (
                        <LocalizedLink href={links.storyHref}>
                            <Button variant="tonal" size="s" icon={mdMenuBook}>
                                {t("page.storySearch.results.readStory")}
                            </Button>
                        </LocalizedLink>
                    )}
                    {links.playerHref && (
                        <LocalizedLink href={links.playerHref}>
                            <Button variant="outlined" size="s" icon={mdPlayArrow}>
                                {t("page.storySearch.results.playLive2d")}
                            </Button>
                        </LocalizedLink>
                    )}
                </div>
            </div>
        </Card>
    );
}
