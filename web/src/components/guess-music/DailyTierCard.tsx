"use client";

import { Banner, Button, Icon, IconButton, Surface, cn } from "@/components/md3";
import {
    mdArrowForward,
    mdGridView,
    mdKeyboard,
    mdLock,
    mdLogin,
    mdMilitaryTech,
    mdMusicOff,
    mdPlayArrow,
    mdRestartAlt,
    mdSchedule,
    mdSchool,
    mdScoreboard,
    mdSearch,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { DailyMode, DailyTierInfo, DailyTierStatus } from "@/lib/guess-music/daily-api";
import type { RankedAccess } from "./DailyInfoCard";

const TIER_STYLE: Record<DailyTierInfo["id"], { icon: string; tile: string; level: number }> = {
    easy: { icon: mdGridView, tile: "bg-secondary-container text-on-secondary-container", level: 1 },
    normal: { icon: mdSearch, tile: "bg-primary-container text-on-primary-container", level: 2 },
    hard: { icon: mdKeyboard, tile: "bg-tertiary-container text-on-tertiary-container", level: 3 },
    hell: { icon: mdMusicOff, tile: "bg-error-container text-on-error-container", level: 4 },
};

interface DailyTierCardProps {
    tier: DailyTierInfo;
    ranked: RankedAccess;
    /** Today's ranked status from the server (signed-in players only). */
    status?: DailyTierStatus;
    /** 0-based next round of a practice run kept in this tab, if any. */
    practiceRound: number | null;
    /** The action being started on this tier, if any. */
    pending: DailyMode | null;
    /** Another tier is starting: hold every button. */
    busy: boolean;
    error?: string | null;
    onStart: (mode: DailyMode, fresh?: boolean) => void;
    onLogin: () => void;
}

/**
 * One difficulty of the day: what it plays like, today's ranked status, and the ranked / practice actions.
 * A tier the server cannot run yet (hell while its instrumentals are being prepared) shows a quiet note instead.
 */
export default function DailyTierCard({ tier, ranked, status, practiceRound, pending, busy, error, onStart, onLogin }: DailyTierCardProps) {
    const { t } = useI18n();
    const style = TIER_STYLE[tier.id];
    const name = t(`page.guessMusicDaily.tiers.${tier.id}`);
    const answerMode =
        tier.answerMode === "choice"
            ? t("page.guessMusicDaily.answerModes.choice", { count: tier.optionCount ?? 6 })
            : t(`page.guessMusicDaily.answerModes.${tier.answerMode}`);
    const disabled = busy || pending !== null;
    const titleId = `daily-tier-${tier.id}`;

    let rankedButton: React.ReactNode;
    if (ranked === "unavailable") {
        rankedButton = (
            <Button variant="outlined" icon={mdLock} disabled>
                {t("page.guessMusicDaily.tier.rankedUnavailable")}
            </Button>
        );
    } else if (ranked === "login") {
        rankedButton = (
            <Button variant="filled" icon={mdLogin} onClick={onLogin} disabled={disabled}>
                {t("page.guessMusicDaily.tier.rankedLogin")}
            </Button>
        );
    } else if (status?.status === "finished") {
        rankedButton = (
            <Button variant="tonal" icon={mdScoreboard} onClick={() => onStart("ranked")} disabled={disabled}>
                {pending === "ranked" ? t("page.guessMusicDaily.tier.starting") : t("page.guessMusicDaily.tier.rankedView")}
            </Button>
        );
    } else {
        const resume = status?.status === "in_progress";
        rankedButton = (
            <Button variant="filled" icon={resume ? mdArrowForward : mdMilitaryTech} onClick={() => onStart("ranked")} disabled={disabled || ranked === "loading"}>
                {pending === "ranked"
                    ? t("page.guessMusicDaily.tier.starting")
                    : resume
                      ? t("page.guessMusicDaily.tier.rankedResume", { round: (status?.resumeRound ?? 0) + 1 })
                      : t("page.guessMusicDaily.tier.ranked")}
            </Button>
        );
    }

    return (
        <Surface tone="low" radius="xl" className="flex flex-col gap-4 p-4 sm:p-5" as="section" aria-labelledby={titleId}>
            <div className="flex items-start gap-3">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-md3-lg", style.tile)} aria-hidden="true">
                    <Icon path={style.icon} size={26} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <h3 id={titleId} className="type-title-l text-on-surface">
                            {name}
                        </h3>
                        <span className="flex gap-0.5" role="img" aria-label={t("page.guessMusicDaily.tier.level", { level: style.level, max: 4 })}>
                            {[1, 2, 3, 4].map((n) => (
                                <span key={n} className={cn("h-3 w-1.5 rounded-full", n <= style.level ? "bg-primary" : "bg-surface-container-highest")} />
                            ))}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <Fact>{t("page.guessMusicDaily.tier.clip", { seconds: tier.clipSeconds })}</Fact>
                        <Fact>{answerMode}</Fact>
                        <Fact>{t("page.guessMusicDaily.tier.rounds", { rounds: tier.rounds })}</Fact>
                        {tier.vocalRemoval ? (
                            <span className="inline-flex h-6 items-center gap-1 rounded-md3-sm bg-tertiary-container px-2 type-label-m text-on-tertiary-container">
                                <Icon path={mdMusicOff} size={14} />
                                {t("page.guessMusicDaily.tier.vocalRemoval")}
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            {tier.available ? (
                <>
                    <StatusLine ranked={ranked} status={status} />
                    {error ? <Banner tone="error" title={error} /> : null}
                </>
            ) : (
                <div className="flex items-start gap-3 rounded-md3-md bg-surface-container-high px-3 py-3">
                    <Icon path={mdSchedule} size={20} className="mt-0.5 shrink-0 text-primary" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="type-title-s text-on-surface">{t("page.guessMusicDaily.tier.unavailableTitle")}</span>
                        <span className="type-body-s text-on-surface-variant">{t("page.guessMusicDaily.tier.unavailable")}</span>
                    </div>
                </div>
            )}

            {tier.available ? (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {rankedButton}
                        <Button
                            variant={ranked === "unavailable" ? "filled" : "outlined"}
                            icon={practiceRound !== null ? mdArrowForward : mdSchool}
                            onClick={() => onStart("practice")}
                            disabled={disabled}
                        >
                            {pending === "practice"
                                ? t("page.guessMusicDaily.tier.starting")
                                : practiceRound !== null
                                  ? t("page.guessMusicDaily.tier.practiceResume", { round: practiceRound + 1 })
                                  : t("page.guessMusicDaily.tier.practice")}
                        </Button>
                        {practiceRound !== null ? (
                            <IconButton icon={mdRestartAlt} label={t("page.guessMusicDaily.tier.practiceRestart")} onClick={() => onStart("practice", true)} disabled={disabled} />
                        ) : null}
                    </div>
                    <p className="type-body-s text-on-surface-variant">{t("page.guessMusicDaily.tier.practiceNote")}</p>
                </div>
            ) : null}
        </Surface>
    );
}

function Fact({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex h-6 items-center rounded-md3-sm bg-surface-container-high px-2 type-label-m text-on-surface-variant">{children}</span>;
}

function StatusLine({ ranked, status }: { ranked: RankedAccess; status?: DailyTierStatus }) {
    const { t } = useI18n();
    if (ranked !== "ready") return null;
    if (status?.status === "finished") {
        return (
            <div className="flex flex-wrap items-baseline gap-x-2 rounded-md3-md bg-primary-container px-3 py-2 text-on-primary-container">
                <span className="type-label-l">{t("page.guessMusicDaily.tier.statusFinished")}</span>
                <span className="type-title-m tabular-nums">{t("page.guessMusicDaily.tier.statusScore", { score: (status.score ?? 0).toLocaleString() })}</span>
                {status.rank ? <span className="type-label-l tabular-nums">{t("page.guessMusicDaily.tier.statusRank", { rank: status.rank })}</span> : null}
            </div>
        );
    }
    if (status?.status === "in_progress") {
        return (
            <div className="flex items-center gap-2 rounded-md3-md bg-secondary-container px-3 py-2 type-label-l text-on-secondary-container">
                <Icon path={mdPlayArrow} size={18} />
                {t("page.guessMusicDaily.tier.statusInProgress", { round: (status.resumeRound ?? 0) + 1 })}
            </div>
        );
    }
    return <div className="px-1 type-label-l text-on-surface-variant">{t("page.guessMusicDaily.tier.statusNone")}</div>;
}
