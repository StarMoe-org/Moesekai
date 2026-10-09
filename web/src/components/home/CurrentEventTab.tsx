"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "@/components/LocalizedLink";
import { ErrorState, Icon, LinearProgress } from "@/components/md3";
import { mdBolt } from "@/components/md3/icons";
import Image from "next/image";
import { IEventInfo, getEventStatus, EVENT_STATUS_DISPLAY } from "@/types/events";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterData } from "@/lib/fetch";
import { getEventBannerUrl, getEventLogoUrl } from "@/lib/assets";
import { useTranslation } from "@/contexts/TranslationContext";

export default function CurrentEventTab() {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const { t: translateMasterText } = useTranslation();
    const [currentEvent, setCurrentEvent] = useState<IEventInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    // Update `now` every 60s for real-time stamina calculation
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Stamina reserve calculation for upcoming events
    const STAMINA_RECOVERY_MINUTES = 30;
    const NORMAL_CAP = 25;
    const PASS_CAP = 50;

    const staminaReserve = useMemo(() => {
        if (!currentEvent) return null;
        const status = getEventStatus(currentEvent);
        if (status !== "upcoming") return null;
        const minutesUntilStart = Math.max(0, (currentEvent.startAt - now) / 60000);
        const recoverable = Math.floor(minutesUntilStart / STAMINA_RECOVERY_MINUTES);
        const normalReserve = Math.max(0, NORMAL_CAP - recoverable);
        const passReserve = Math.max(0, PASS_CAP - recoverable);
        return { normalReserve, passReserve, recoverable };
    }, [currentEvent, now]);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const eventsData = await fetchMasterData<IEventInfo[]>("events.json");

                // Find ongoing or upcoming event
                const now = Date.now();
                const sortedEvents = eventsData
                    .filter(e => e.aggregateAt > now) // Not ended yet
                    .sort((a, b) => a.startAt - b.startAt);

                const ongoingEvent = sortedEvents.find(e => e.startAt <= now && e.aggregateAt > now);
                // Only show upcoming event when spoiler mode is enabled
                const upcomingEvent = isShowSpoiler ? sortedEvents.find(e => e.startAt > now) : null;

                setCurrentEvent(ongoingEvent || upcomingEvent || null);
                setError(null);
            } catch (err) {
                console.error("Error fetching event data:", err);
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [isShowSpoiler, t]);

    if (isLoading) {
        return (
            <div className="animate-pulse h-32 w-full rounded-md3-xl bg-surface-container-high" />
        );
    }

    if (error) {
        return (
            <ErrorState title={t("page.home.currentEvent.loadFailedTitle")} message={error} />
        );
    }

    if (!currentEvent) {
        return (
            <div className="p-8 text-center text-on-surface-variant bg-surface-card border border-outline-variant/70 rounded-md3-xl">
                <p className="type-body-l">{t("page.home.currentEvent.noActiveEvent")}</p>
            </div>
        );
    }

    const status = getEventStatus(currentEvent);
    const statusDisplay = EVENT_STATUS_DISPLAY[status];
    const statusLabel = t(`common.status.${status}`);
    const eventTypeLabel = t(`common.eventTypes.${currentEvent.eventType}`);
    const eventTypeName = eventTypeLabel === `common.eventTypes.${currentEvent.eventType}` ? currentEvent.eventType : eventTypeLabel;
    const translatedName = translateMasterText("events", "name", currentEvent.name);

    // Calculate progress
    const totalDuration = currentEvent.aggregateAt - currentEvent.startAt;
    const elapsed = Math.max(0, now - currentEvent.startAt);
    const progressPercent = status === "ongoing"
        ? Math.min(100, (elapsed / totalDuration) * 100)
        : 0;

    // Format dates
    const formatDate = (ts: number) => formatLocaleDate(ts, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div>
            <Link href={`/events/${currentEvent.id}`} className="state-layer focus-ring block group rounded-md3-xl">
                <div className="relative flex h-32 md:h-36 rounded-md3-xl overflow-hidden bg-surface-card shadow-elev-1 transition-shadow duration-200 group-hover:shadow-elev-2">

                    {/* Left Side: Background & Logo (45%) */}
                    <div className="w-[45%] relative overflow-hidden">
                        {/* Background Image */}
                        <div className="absolute inset-0">
                            <Image
                                src={getEventBannerUrl(currentEvent.assetbundleName, assetSource)}
                                alt={currentEvent.name}
                                fill
                                className="object-cover"
                                unoptimized
                            />
                            {/* Dark Overlay Mask */}
                            <div className="absolute inset-0 bg-scrim/50" />
                        </div>

                        {/* Centered Logo */}
                        <div className="absolute inset-0 flex items-center justify-center p-2">
                            <div className="relative w-full h-full max-h-20 sm:max-h-24">
                                <Image
                                    src={getEventLogoUrl(currentEvent.assetbundleName, assetSource)}
                                    alt=""
                                    fill
                                    className="object-contain drop-shadow-xl"
                                    unoptimized
                                    loading="eager"
                                    fetchPriority="high"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Info (55%) */}
                    <div className="w-[55%] relative flex items-center p-3 sm:p-4 overflow-hidden">
                        <div className="min-w-0 flex-1 space-y-1">
                            {/* Status Badge */}
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span
                                    className="type-label-m px-2 py-0.5 rounded-md3-sm text-white"
                                    style={{ backgroundColor: statusDisplay.color }}
                                >
                                    {statusLabel}
                                </span>
                                <span className="type-label-s text-on-surface-variant">
                                    {eventTypeName}
                                </span>
                                {staminaReserve && (() => {
                                    const label = staminaReserve.normalReserve === 0 && staminaReserve.passReserve === 0
                                        ? (staminaReserve.recoverable > PASS_CAP ? t("page.home.stamina.bakerShort") : null)
                                        : staminaReserve.normalReserve >= NORMAL_CAP
                                        ? t("page.home.stamina.keepFullShort")
                                        : staminaReserve.normalReserve === 0
                                        ? t("page.home.stamina.reserveShort", { count: staminaReserve.passReserve })
                                        : t("page.home.stamina.reserveShort", { count: staminaReserve.normalReserve });
                                    if (!label) return null;
                                    return (
                                        <span
                                            className="inline-flex items-center gap-0.5 type-label-s px-1.5 py-0.5 rounded-md3-xs bg-tertiary-container text-on-tertiary-container cursor-help"
                                            title={
                                                staminaReserve.normalReserve > 0 && staminaReserve.passReserve > 0
                                                    ? t("page.home.stamina.detailBoth", { normal: staminaReserve.normalReserve, pass: staminaReserve.passReserve })
                                                    : staminaReserve.passReserve > 0
                                                    ? t("page.home.stamina.detailPass", { pass: staminaReserve.passReserve })
                                                    : undefined
                                            }
                                        >
                                            <Icon path={mdBolt} size={14} />
                                            {label}
                                        </span>
                                    );
                                })()}
                            </div>

                            {/* Title (JP Priority) */}
                            <h3 className="type-title-m text-on-surface line-clamp-1 group-hover:text-primary transition-colors" title={currentEvent.name}>
                                {currentEvent.name}
                            </h3>

                            {/* Title (CN - Second Line) */}
                            <p className="type-body-s text-on-surface-variant line-clamp-1 h-4">
                                {translatedName !== currentEvent.name ? translatedName : ""}
                            </p>

                            {/* Date range, with the progress figure on the same row so the title keeps the full column width */}
                            <div className="flex items-end justify-between gap-2 pt-2">
                                <div className="min-w-0 type-label-s text-on-surface-variant tabular-nums flex flex-col sm:flex-row sm:gap-2">
                                    <span>{formatDate(currentEvent.startAt)}</span>
                                    <span className="hidden sm:inline">-</span>
                                    <span>{formatDate(currentEvent.aggregateAt)}</span>
                                </div>
                                {status === "ongoing" && (
                                    <div className="shrink-0 type-headline-s type-emphasized text-on-surface tabular-nums leading-none select-none sm:type-headline-m sm:leading-none">
                                        {Math.floor(progressPercent)}<span className="type-title-s ml-0.5">%</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {status === "ongoing" && (
                            <LinearProgress
                                value={progressPercent / 100}
                                aria-label={t("page.home.currentEvent.progress")}
                                className="absolute inset-x-0 bottom-0"
                            />
                        )}
                    </div>
                </div>
            </Link>


        </div>
    );
}
