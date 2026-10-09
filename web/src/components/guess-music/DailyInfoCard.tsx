"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Icon, Surface, cn } from "@/components/md3";
import { mdCalendarMonth, mdInfo, mdLogin, mdMilitaryTech, mdSchedule, mdSchool, mdVerified } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { formatCountdown, msUntil, type DailyInfo } from "@/lib/guess-music/daily-api";

/** Whether the player can start a ranked run right now. */
export type RankedAccess = "ready" | "login" | "loading" | "unavailable";

interface DailyInfoCardProps {
    info: DailyInfo;
    ranked: RankedAccess;
    /** Display name of the signed-in player. */
    playerName?: string | null;
    onLogin: () => void;
    /** Called once the countdown reaches the next reset. */
    onReset: () => void;
}

/** Today's date, the reset countdown, the rules and the ranked / practice explanation. */
export default function DailyInfoCard({ info, ranked, playerName, onLogin, onReset }: DailyInfoCardProps) {
    const { t, locale } = useI18n();
    const [now, setNow] = useState(() => Date.now());
    const remaining = msUntil(info.nextResetAt, now);
    const timeLimit = info.tiers[0]?.timeLimitSeconds ?? 45;
    const rounds = info.tiers[0]?.rounds ?? 20;

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (remaining <= 0 && Date.parse(info.nextResetAt) > 0) onReset();
    }, [remaining, info.nextResetAt, onReset]);

    const dateLabel = useMemo(() => {
        const at = new Date(`${info.date}T00:00:00Z`);
        if (Number.isNaN(at.getTime())) return info.date;
        return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(at);
    }, [info.date, locale]);

    return (
        <Surface tone="low" radius="xl" className="flex flex-col gap-5 p-4 sm:p-6" as="section" aria-labelledby="daily-info-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5 type-label-l text-primary">
                        <Icon path={mdCalendarMonth} size={18} />
                        {dateLabel}
                    </span>
                    <h2 id="daily-info-title" className="type-headline-s text-on-surface">
                        {t("page.guessMusicDaily.info.title")}
                    </h2>
                    <p className="type-body-m text-on-surface-variant">{t("page.guessMusicDaily.info.summary", { rounds })}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md3-md bg-surface-container-high px-3 py-2 type-label-l tabular-nums text-on-surface-variant">
                    <Icon path={mdSchedule} size={18} />
                    {t("page.guessMusicDaily.info.resetIn", { time: formatCountdown(remaining) })}
                </span>
            </div>

            <ul className="flex flex-col gap-1.5 type-body-m text-on-surface-variant">
                <li>{t("page.guessMusicDaily.info.rules.time", { seconds: timeLimit })}</li>
                <li>{t("page.guessMusicDaily.info.rules.attempts")}</li>
                <li>{t("page.guessMusicDaily.info.rules.score")}</li>
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
                <ModeCard icon={mdMilitaryTech} title={t("page.guessMusicDaily.info.modes.rankedTitle")} text={t("page.guessMusicDaily.info.modes.ranked")} />
                <ModeCard icon={mdSchool} title={t("page.guessMusicDaily.info.modes.practiceTitle")} text={t("page.guessMusicDaily.info.modes.practice")} />
            </div>

            {ranked === "ready" ? (
                <AuthLine icon={mdVerified} tone="primary">
                    {playerName ? t("page.guessMusicDaily.info.signedIn", { name: playerName }) : t("page.guessMusicDaily.info.signedInAnonymous")}
                </AuthLine>
            ) : ranked === "login" ? (
                <AuthLine
                    icon={mdLogin}
                    action={
                        <Button variant="tonal" size="s" icon={mdLogin} onClick={onLogin}>
                            {t("page.guessMusicDaily.info.login")}
                        </Button>
                    }
                >
                    {t("page.guessMusicDaily.info.signedOut")}
                </AuthLine>
            ) : ranked === "unavailable" ? (
                <AuthLine icon={mdInfo}>{t("page.guessMusicDaily.info.disabled")}</AuthLine>
            ) : null}
        </Surface>
    );
}

function ModeCard({ icon, title, text }: { icon: string; title: string; text: string }) {
    return (
        <div className="flex gap-3 rounded-md3-lg bg-surface-container px-4 py-3">
            <Icon path={icon} size={22} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="type-title-s text-on-surface">{title}</span>
                <span className="type-body-s text-on-surface-variant">{text}</span>
            </div>
        </div>
    );
}

function AuthLine({ icon, tone, action, children }: { icon: string; tone?: "primary"; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-3 rounded-md3-md px-4 py-3",
                tone === "primary" ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant",
            )}
        >
            <Icon path={icon} size={20} className="shrink-0" />
            <span className="min-w-0 flex-1 type-body-m">{children}</span>
            {action}
        </div>
    );
}
