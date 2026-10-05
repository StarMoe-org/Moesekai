"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import { ChurnScoreChangeV2 } from "@/types/realtime-ranking-next";
import { sanitizeRecentChanges } from "../_lib/board-utils";

interface RecentChangesFeedProps {
    changes: ChurnScoreChangeV2[];
    /** Max rows to keep in the scroll list. */
    limit?: number;
}

function useRelativeTime(ts: number, now: number, t: ReturnType<typeof useI18n>["t"]): string {
    const sec = Math.max(0, Math.floor((now - ts) / 1000));
    if (sec < 5) return t("page.realtimeRankingNext.detail.feed.justNow");
    if (sec < 60) return t("page.realtimeRankingNext.detail.feed.secondsAgo", { seconds: sec });
    const m = Math.floor(sec / 60);
    if (m < 60) return t("page.realtimeRankingNext.detail.feed.minutesAgo", { minutes: m });
    const h = Math.floor(m / 60);
    return t("page.realtimeRankingNext.detail.feed.hoursAgo", { hours: h });
}

function FeedRow({ change, now }: { change: ChurnScoreChangeV2; now: number }) {
    const { t, formatNumber } = useI18n();
    const rel = useRelativeTime(change.t, now, t);
    const positive = change.delta >= 0;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -12, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: 12, height: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-1.5"
        >
            <span className="flex items-center gap-1.5 text-xs">
                <span className={`text-[10px] ${positive ? "text-tertiary" : "text-error"}`}>{positive ? "▲" : "▼"}</span>
                <span className={`font-black tabular-nums ${positive ? "text-tertiary" : "text-error"}`}>
                    {positive ? "+" : ""}{formatNumber(change.delta)}
                </span>
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-on-surface-variant">{rel}</span>
        </motion.div>
    );
}

export default function RecentChangesFeed({ changes, limit = 30 }: RecentChangesFeedProps) {
    const { t, formatNumber } = useI18n();
    const [now, setNow] = useState(() => Date.now());

    // Tick once a second so relative times stay fresh.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Sanitize changes against upstream cache flapping & micro-delta inflation
    const cleanChanges = useMemo(() => sanitizeRecentChanges(changes), [changes]);

    // Newest first, capped.
    const sorted = useMemo(() => [...cleanChanges].sort((a, b) => b.t - a.t).slice(0, limit), [cleanChanges, limit]);

    // Sum of positive deltas within the last hour.
    const cutoff = now - 3_600_000;
    const total1h = useMemo(
        () => cleanChanges.filter((c) => c.t >= cutoff && c.delta > 0).reduce((acc, c) => acc + c.delta, 0),
        [cleanChanges, cutoff],
    );
    const count1h = useMemo(
        () => cleanChanges.filter((c) => c.t >= cutoff && c.delta > 0).length,
        [cleanChanges, cutoff],
    );

    const scrollRef = useRef<HTMLDivElement>(null);

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-on-surface">{t("page.realtimeRankingNext.detail.feed.title")}</h2>
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-primary-container px-2 py-0.5 font-black text-on-primary-container tabular-nums">
                        +{formatNumber(total1h)}
                    </span>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 font-bold text-on-surface-variant tabular-nums">
                        ×{count1h}
                    </span>
                </div>
            </div>
            {sorted.length === 0 ? (
                <div className="rounded-md3-md border border-dashed border-outline-variant px-3 py-6 text-center text-xs text-on-surface-variant">
                    {t("page.realtimeRankingNext.detail.feed.empty")}
                </div>
            ) : (
                <div
                    ref={scrollRef}
                    className="max-h-72 space-y-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-outline-variant"
                >
                    <AnimatePresence initial={false}>
                        {sorted.map((c) => (
                            <FeedRow key={`${c.t}-${c.delta}`} change={c} now={now} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
