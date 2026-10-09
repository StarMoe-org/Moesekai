"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { EmptyState, ErrorState, Icon, LoadingState, Select, Surface, Tabs, cn } from "@/components/md3";
import { mdBadge, mdLeaderboard, mdPerson } from "@/components/md3/icons";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { normalizeServer } from "@/lib/account-servers";
import {
    DAILY_TIER_IDS,
    formatDuration,
    isAbortError,
    recentDates,
    type DailyApi,
    type DailyLeaderboard,
    type DailyLeaderboardEntry,
    type DailyTierId,
} from "@/lib/guess-music/daily-api";

interface LeaderboardViewProps {
    api: DailyApi;
    /** Today's date (YYYY-MM-DD) in the challenge time zone. */
    today: string;
    tier: DailyTierId;
    onTierChange: (tier: DailyTierId) => void;
    /** Bump to refetch (e.g. after a ranked finish). */
    refreshKey?: number | string;
    /** Players can sign in to rank; when false the empty state says nothing about signing in. */
    canSignIn?: boolean;
    className?: string;
}

const LIMIT = 50;

/** One leaderboard per tier and day: today by default, the previous 30 days selectable, top 50. */
export default function LeaderboardView({ api, today, tier, onTierChange, refreshKey, canSignIn = true, className }: LeaderboardViewProps) {
    const { t, locale } = useI18n();
    const [date, setDate] = useState(today);
    const [board, setBoard] = useState<DailyLeaderboard | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const requestKey = `${tier}|${date}|${refreshKey ?? ""}|${attempt}`;
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const loading = loadedKey !== requestKey;

    // A new day resets the picker to it.
    const [prevToday, setPrevToday] = useState(today);
    if (prevToday !== today) {
        setPrevToday(today);
        setDate(today);
    }

    useEffect(() => {
        const controller = new AbortController();
        api.leaderboard({ tier, date, limit: LIMIT }, controller.signal)
            .then((data) => {
                setBoard(data);
                setFailed(false);
                setLoadedKey(requestKey);
            })
            .catch((error) => {
                if (isAbortError(error)) return;
                setFailed(true);
                setLoadedKey(requestKey);
            });
        return () => controller.abort();
    }, [api, tier, date, requestKey]);

    const dateOptions = useMemo(() => {
        const format = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });
        return recentDates(today, 30).map((value, index) => {
            const label = format.format(new Date(`${value}T00:00:00Z`));
            return { value, label: index === 0 ? t("page.guessMusicDaily.leaderboard.todayOption", { date: label }) : label, textValue: value };
        });
    }, [locale, t, today]);

    const tierItems = useMemo(() => DAILY_TIER_IDS.map((id) => ({ value: id, label: t(`page.guessMusicDaily.tiers.${id}`) })), [t]);
    const tierName = t(`page.guessMusicDaily.tiers.${tier}`);
    const me = board?.me;
    const meInList = Boolean(me && board?.entries.some((entry) => entry.rank === me.rank));

    return (
        <Surface tone="low" radius="xl" className={cn("flex flex-col gap-4 p-4 sm:p-6", className)} as="section" aria-labelledby="daily-leaderboard-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon path={mdLeaderboard} size={24} className="text-primary" />
                    <h2 id="daily-leaderboard-title" className="type-title-l text-on-surface">
                        {t("page.guessMusicDaily.leaderboard.title")}
                    </h2>
                    {board && !loading && !failed ? (
                        <span className="type-label-l text-on-surface-variant">{t("page.guessMusicDaily.leaderboard.players", { count: board.totalPlayers })}</span>
                    ) : null}
                </div>
                <Select value={date} onValueChange={setDate} options={dateOptions} aria-label={t("page.guessMusicDaily.leaderboard.date")} className="w-full sm:w-56" />
            </div>

            <Tabs items={tierItems} value={tier} onValueChange={onTierChange} variant="secondary" aria-label={t("page.guessMusicDaily.leaderboard.tiers")} />

            {loading ? (
                <LoadingState label={t("page.guessMusicDaily.leaderboard.loading")} className="min-h-48" />
            ) : failed || !board ? (
                <ErrorState
                    title={t("page.guessMusicDaily.leaderboard.loadFailed")}
                    message={t("page.guessMusicDaily.errors.network")}
                    retryLabel={t("page.guessMusicDaily.errors.retry")}
                    onRetry={() => setAttempt((n) => n + 1)}
                />
            ) : board.entries.length === 0 ? (
                <EmptyState
                    icon={mdLeaderboard}
                    title={t("page.guessMusicDaily.leaderboard.empty")}
                    description={
                        date !== today
                            ? t("page.guessMusicDaily.leaderboard.emptyPast", { tier: tierName })
                            : canSignIn
                              ? t("page.guessMusicDaily.leaderboard.emptyToday", { tier: tierName })
                              : t("page.guessMusicDaily.leaderboard.emptyTodayNeutral", { tier: tierName })
                    }
                />
            ) : (
                <ol className="flex flex-col gap-1.5">
                    {board.entries.map((entry) => (
                        <LeaderboardRow key={`${entry.rank}-${entry.name}`} entry={entry} isMe={Boolean(me && entry.rank === me.rank && entry.score === me.score)} />
                    ))}
                    {me && !meInList ? (
                        <>
                            <li aria-hidden="true" className="py-1 text-center type-label-l text-on-surface-variant">
                                ⋯
                            </li>
                            <LeaderboardRow
                                entry={{ rank: me.rank, name: t("page.guessMusicDaily.leaderboard.me"), avatar: null, score: me.score, correctCount: me.correctCount, durationMs: me.durationMs }}
                                isMe
                            />
                        </>
                    ) : null}
                </ol>
            )}
        </Surface>
    );
}

function LeaderboardRow({ entry, isMe }: { entry: DailyLeaderboardEntry; isMe: boolean }) {
    const { t } = useI18n();
    const server = entry.game ? normalizeServer(entry.game.server) : null;
    const podium = entry.rank <= 3;
    return (
        <li
            className={cn(
                "flex items-center gap-3 rounded-md3-md px-3 py-2.5",
                isMe ? "bg-primary-container text-on-primary-container ring-2 ring-primary" : "bg-surface-container text-on-surface",
            )}
            aria-current={isMe ? "true" : undefined}
        >
            <span
                className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full type-label-l tabular-nums",
                    isMe
                        ? "bg-on-primary-container text-primary-container"
                        : entry.rank === 1
                          ? "bg-tertiary text-on-tertiary"
                          : podium
                            ? "bg-tertiary-container text-on-tertiary-container"
                            : "bg-surface-container-highest text-on-surface-variant",
                )}
            >
                {entry.rank}
            </span>
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-highest text-on-surface-variant">
                {entry.avatar ? <Image src={entry.avatar} alt="" fill sizes="36px" className="object-cover" unoptimized /> : <Icon path={mdPerson} size={20} />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate type-body-l">{entry.name}</span>
                    {isMe ? (
                        <span className="shrink-0 rounded-md3-sm bg-on-primary-container px-1.5 type-label-s text-primary-container">{t("page.guessMusicDaily.leaderboard.me")}</span>
                    ) : null}
                </span>
                {entry.game ? (
                    <span
                        className={cn("flex min-w-0 items-center gap-1 type-label-m", isMe ? "text-on-primary-container" : "text-on-surface-variant")}
                        title={t("page.guessMusicDaily.leaderboard.gameAccount")}
                    >
                        {server ? <ServerRegionIcon server={server} size={14} /> : <Icon path={mdBadge} size={14} />}
                        <span className="truncate">{entry.game.name}</span>
                    </span>
                ) : null}
            </span>
            <span className="flex shrink-0 flex-col items-end">
                <span className="type-title-m tabular-nums">{entry.score.toLocaleString()}</span>
                <span className={cn("type-label-m tabular-nums", isMe ? "text-on-primary-container" : "text-on-surface-variant")}>
                    {t("page.guessMusicDaily.leaderboard.detail", { correct: entry.correctCount, time: formatDuration(entry.durationMs) })}
                </span>
            </span>
        </li>
    );
}
