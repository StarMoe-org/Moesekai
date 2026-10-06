"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import { IEventInfo, getEventStatus, EVENT_STATUS_DISPLAY } from "@/types/events";
import { IGachaInfo, ICardInfo, CHAR_COLORS } from "@/types/types";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import {
    getEventBannerUrl,
    getEventLogoUrl,
    getGachaLogoUrl,
    getCardFullUrl,
    getCharacterIconUrl,
} from "@/lib/assets";
import { getTodayBirthdays, isVirtualSinger, type UpcomingBirthday } from "@/lib/birthdays";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { Icon, IconButton } from "@/components/md3";
import { mdBolt, mdChevronLeft, mdChevronRight } from "@/components/md3/icons";

// ─── Slide type definitions ───

interface EventSlide {
    type: "event";
    event: IEventInfo;
}

interface GachaSlide {
    type: "gacha";
    gacha: IGachaInfo;
    pickupCard: ICardInfo | null;
}

interface BirthdaySlide {
    type: "birthday";
    birthday: UpcomingBirthday;
    card: ICardInfo | null;
}

type Slide = EventSlide | GachaSlide | BirthdaySlide;

// ─── Auto-play interval ───
const AUTO_PLAY_INTERVAL = 5000;

export default function HeroCarousel() {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const { t: translateMasterText } = useTranslation();
    const [slides, setSlides] = useState<Slide[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    // Touch handling
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // Update `now` every 60s
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Fetch all data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [eventsData, gachasData, cardsData] = await Promise.all([
                    fetchMasterData<IEventInfo[]>("events.json"),
                    fetchMasterData<IGachaInfo[]>("gachas.json"),
                    fetchMasterData<ICardInfo[]>("cards.json"),
                ]);
                const now = Date.now();
                const builtSlides: Slide[] = [];

                // 1. Current/upcoming event
                const sortedEvents = eventsData
                    .filter(e => e.aggregateAt > now)
                    .sort((a, b) => a.startAt - b.startAt);
                const ongoingEvent = sortedEvents.find(e => e.startAt <= now && e.aggregateAt > now);
                const upcomingEvent = isShowSpoiler ? sortedEvents.find(e => e.startAt > now) : null;
                const currentEvent = ongoingEvent || upcomingEvent;

                if (currentEvent) {
                    builtSlides.push({ type: "event", event: currentEvent });
                }

                // 2. Current gachas (filter out "normal" type, keep limited/featured)
                const activeGachas = gachasData
                    .filter(g => g.startAt <= now && g.endAt > now && g.gachaType !== "normal")
                    .sort((a, b) => b.startAt - a.startAt);

                // Also include upcoming gachas if spoiler mode
                const upcomingGachas = isShowSpoiler
                    ? gachasData
                        .filter(g => g.startAt > now && g.gachaType !== "normal")
                        .sort((a, b) => a.startAt - b.startAt)
                        .slice(0, 1)
                    : [];

                const displayGachas = [...activeGachas, ...upcomingGachas].slice(0, 2);
                for (const gacha of displayGachas) {
                    // Find the first pickup card for background
                    let pickupCard: ICardInfo | null = null;
                    if (gacha.gachaPickups && gacha.gachaPickups.length > 0) {
                        const firstPickupCardId = gacha.gachaPickups[0].cardId;
                        pickupCard = cardsData.find(c => c.id === firstPickupCardId) || null;
                    }
                    builtSlides.push({ type: "gacha", gacha, pickupCard });
                }

                // 3. Today's birthdays
                const todayBirthdays = getTodayBirthdays();
                for (const birthday of todayBirthdays) {
                    // Find the latest birthday card for this character
                    const charCards = cardsData.filter(c => c.characterId === birthday.id);
                    let targetCards = charCards.filter(c => c.cardRarityType === "rarity_birthday");
                    if (targetCards.length === 0) targetCards = charCards;
                    targetCards.sort((a, b) => (b.id) - (a.id));
                    const card = targetCards[0] || null;
                    builtSlides.push({ type: "birthday", birthday, card });
                }

                setSlides(builtSlides);
            } catch (err) {
                console.error("HeroCarousel: Failed to fetch data", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [isShowSpoiler]);

    // Auto-play
    useEffect(() => {
        if (slides.length <= 1 || isPaused) return;
        const timer = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % slides.length);
        }, AUTO_PLAY_INTERVAL);
        return () => clearInterval(timer);
    }, [slides.length, isPaused]);

    const goTo = useCallback((index: number) => {
        setCurrentIndex(index);
    }, []);

    const goNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % slides.length);
    }, [slides.length]);

    const goPrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + slides.length) % slides.length);
    }, [slides.length]);

    // Touch handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        setIsPaused(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    }, []);

    const handleTouchEnd = useCallback(() => {
        const diff = touchStartX.current - touchEndX.current;
        if (Math.abs(diff) > 50) {
            if (diff > 0) goNext();
            else goPrev();
        }
        setIsPaused(false);
    }, [goNext, goPrev]);

    // Stamina reserve calculation (for event slides)
    const STAMINA_RECOVERY_MINUTES = 30;
    const NORMAL_CAP = 25;
    const PASS_CAP = 50;

    const getStaminaLabel = useCallback((event: IEventInfo) => {
        const status = getEventStatus(event);
        if (status !== "upcoming") return null;
        const minutesUntilStart = Math.max(0, (event.startAt - now) / 60000);
        const recoverable = Math.floor(minutesUntilStart / STAMINA_RECOVERY_MINUTES);
        const normalReserve = Math.max(0, NORMAL_CAP - recoverable);
        const passReserve = Math.max(0, PASS_CAP - recoverable);

        if (normalReserve === 0 && passReserve === 0) {
            return recoverable > PASS_CAP ? t("page.home.stamina.bakerLong") : null;
        }
        if (normalReserve >= NORMAL_CAP) return t("page.home.stamina.keepFullLong");
        if (normalReserve === 0) return t("page.home.stamina.reservePassLong", { count: passReserve });
        return t("page.home.stamina.reserveLong", { count: normalReserve });
    }, [now, t]);

    // Format date
    const formatDate = (ts: number) => formatLocaleDate(ts, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    // Format remaining time
    const formatRemaining = (endTs: number) => {
        const diff = endTs - now;
        if (diff <= 0) return t("page.home.hero.ended");
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        if (days > 0) return t("page.home.hero.remainingDaysHours", { days, hours });
        const minutes = Math.floor((diff % 3600000) / 60000);
        return t("page.home.hero.remainingHoursMinutes", { hours, minutes });
    };

    if (isLoading) {
        return (
            <div className="w-full h-[180px] lg:h-[260px] rounded-md3-xl animate-pulse bg-surface-container-high" />
        );
    }

    if (slides.length === 0) {
        return (
            <div className="w-full h-[180px] lg:h-[260px] rounded-md3-xl bg-surface-card border border-outline-variant/70 flex items-center justify-center text-on-surface-variant">
                <p className="type-body-l">{t("page.home.hero.noContent")}</p>
            </div>
        );
    }

    return (
        <div
            className="w-full group/carousel select-none"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
        <div
            className="relative w-full h-[180px] lg:h-[260px] rounded-md3-xl overflow-hidden bg-surface-container-high shadow-elev-1"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Slides — MD3 emphasized settle; reduced-motion falls back via CSS tokens */}
            {slides.map((slide, index) => (
                <div
                    key={`${slide.type}-${index}`}
                    className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-md3-emphasized motion-reduce:transition-opacity ${
                        index === currentIndex
                            ? "opacity-100 translate-x-0 scale-100 z-10"
                            : index < currentIndex
                            ? "opacity-0 -translate-x-6 scale-[0.98] z-0"
                            : "opacity-0 translate-x-6 scale-[0.98] z-0"
                    }`}
                    aria-hidden={index !== currentIndex}
                >
                    {slide.type === "event" && (
                        <EventSlideContent
                            slide={slide}
                            isActive={index === currentIndex}
                            assetSource={assetSource}
                            now={now}
                            formatDate={formatDate}
                            getStaminaLabel={getStaminaLabel}
                            t={t}
                            translateMasterText={translateMasterText}
                        />
                    )}
                    {slide.type === "gacha" && (
                        <GachaSlideContent
                            slide={slide}
                            isActive={index === currentIndex}
                            assetSource={assetSource}
                            now={now}
                            formatRemaining={formatRemaining}
                            formatDate={formatDate}
                            t={t}
                        />
                    )}
                    {slide.type === "birthday" && (
                        <BirthdaySlideContent
                            slide={slide}
                            isActive={index === currentIndex}
                            assetSource={assetSource}
                            formatDate={formatDate}
                            t={t}
                        />
                    )}
                </div>
            ))}

            {/* Navigation Arrows */}
            {slides.length > 1 && (
                <>
                    <IconButton
                        icon={mdChevronLeft}
                        variant="tonal"
                        size="s"
                        onClick={(e) => { e.preventDefault(); goPrev(); }}
                        label={t("page.home.hero.previousSlide")}
                        className="!absolute left-3 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity"
                    />
                    <IconButton
                        icon={mdChevronRight}
                        variant="tonal"
                        size="s"
                        onClick={(e) => { e.preventDefault(); goNext(); }}
                        label={t("page.home.hero.nextSlide")}
                        className="!absolute right-3 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity"
                    />
                </>
            )}
        </div>

            {/* Dot Indicators (MD3: primary active pill, outline-variant inactive) */}
            {slides.length > 1 && (
                <div className="mt-3 flex justify-center gap-1.5">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => goTo(index)}
                            aria-current={index === currentIndex ? "true" : undefined}
                            className={`focus-ring h-2 rounded-full cursor-pointer transition-[width,background-color] duration-300 ease-md3-spatial-fast ${
                                index === currentIndex
                                    ? "w-6 bg-primary"
                                    : "w-2 bg-outline-variant hover:bg-outline"
                            }`}
                            aria-label={t("page.home.hero.goToSlide", { index: index + 1 })}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Event Slide ───

function EventSlideContent({
    slide,
    isActive,
    assetSource,
    now,
    formatDate,
    getStaminaLabel,
    t,
    translateMasterText,
}: {
    slide: EventSlide;
    isActive: boolean;
    assetSource: AssetSourceType;
    now: number;
    formatDate: (ts: number) => string;
    getStaminaLabel: (event: IEventInfo) => string | null;
    t: ReturnType<typeof useI18n>["t"];
    translateMasterText: ReturnType<typeof useTranslation>["t"];
}) {
    const { event } = slide;
    const translatedName = translateMasterText("events", "name", event.name);
    const status = getEventStatus(event);
    const statusDisplay = EVENT_STATUS_DISPLAY[status];
    const statusLabel = t(`common.status.${status}`);
    const eventTypeLabel = t(`common.eventTypes.${event.eventType}`);
    const eventTypeName = eventTypeLabel === `common.eventTypes.${event.eventType}` ? event.eventType : eventTypeLabel;

    // Progress
    const totalDuration = event.aggregateAt - event.startAt;
    const elapsed = Math.max(0, now - event.startAt);
    const progressPercent = status === "ongoing"
        ? Math.min(100, (elapsed / totalDuration) * 100)
        : 0;

    const staminaLabel = getStaminaLabel(event);

    return (
        <Link href={`/events/${event.id}`} className="focus-ring block w-full h-full relative rounded-md3-xl">
            {/* Background */}
            <Image
                src={getEventBannerUrl(event.assetbundleName, assetSource)}
                alt={event.name}
                fill
                className="object-cover"
                unoptimized
                loading={isActive ? "eager" : "lazy"}
                fetchPriority={isActive ? "high" : undefined}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/30 to-scrim/10" />

            {/* Event Logo (centered) */}
            <div className="absolute inset-0 flex items-center justify-center p-8 pb-16">
                <div className="relative w-full h-full max-w-[400px] max-h-[120px] lg:max-h-[160px]">
                    <Image
                        src={getEventLogoUrl(event.assetbundleName, assetSource)}
                        alt=""
                        fill
                        className="object-contain drop-shadow-xl"
                        unoptimized
                        loading="lazy"
                    />
                </div>
            </div>

            {/* Bottom Info Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-3 lg:p-4 flex items-end justify-between">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className="type-label-m px-2 py-0.5 rounded-md3-sm text-white"
                            style={{ backgroundColor: statusDisplay.color }}
                        >
                            {statusLabel}
                        </span>
                        <span className="type-label-s text-white/80">
                            {eventTypeName}
                        </span>
                        {staminaLabel && (
                            <span className="inline-flex items-center gap-0.5 type-label-s px-1.5 py-0.5 rounded-md3-xs bg-tertiary-container text-on-tertiary-container">
                                <Icon path={mdBolt} size={14} />
                                {staminaLabel}
                            </span>
                        )}
                    </div>
                    {/* Title */}
                    <h3 className="type-title-m text-white line-clamp-1 drop-shadow-sm">
                        {event.name}
                    </h3>
                    {translatedName && translatedName !== event.name && (
                        <p className="type-body-s text-white/70 line-clamp-1">{translatedName}</p>
                    )}
                    {/* Date */}
                    <div className="type-label-s text-white/60 font-mono">
                        {formatDate(event.startAt)} - {formatDate(event.aggregateAt)}
                    </div>
                </div>

                {/* Progress percentage */}
                {status === "ongoing" && (
                    <div className="type-display-s type-emphasized text-white/90 select-none ml-4 shrink-0 drop-shadow-sm">
                        {Math.floor(progressPercent)}<span className="type-title-l ml-0.5">%</span>
                    </div>
                )}
            </div>

            {/* Progress bar at very bottom */}
            {status === "ongoing" && (
                <div className="absolute bottom-0 left-0 right-0 h-1">
                    <div
                        className="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-md3-standard"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}
        </Link>
    );
}

// ─── Gacha Slide ───

function GachaSlideContent({
    slide,
    isActive,
    assetSource,
    now,
    formatRemaining,
    formatDate,
    t,
}: {
    slide: GachaSlide;
    isActive: boolean;
    assetSource: AssetSourceType;
    now: number;
    formatRemaining: (endTs: number) => string;
    formatDate: (ts: number) => string;
    t: ReturnType<typeof useI18n>["t"];
}) {
    const { gacha, pickupCard } = slide;
    const isUpcoming = gacha.startAt > now;

    // Use the first pickup card's full art as background
    // For rarity_3/rarity_4: use after_training artwork.
    // For rarity_birthday: use normal artwork because birthday cards have no trained art.
    const pickupBgUrl = pickupCard
        ? getCardFullUrl(
            pickupCard.characterId,
            pickupCard.assetbundleName,
            pickupCard.cardRarityType === "rarity_3" || pickupCard.cardRarityType === "rarity_4",
            assetSource
        )
        : null;

    return (
        <Link href={`/gacha/${gacha.id}`} className="focus-ring block w-full h-full relative rounded-md3-xl">
            {/* Background: pickup card full art */}
            {pickupBgUrl ? (
                <Image
                    src={pickupBgUrl}
                    alt={gacha.name}
                    fill
                    className="object-cover object-top"
                    unoptimized
                    loading={isActive ? "eager" : "lazy"}
                    fetchPriority={isActive ? "high" : undefined}
                />
            ) : (
                <div className="absolute inset-0 bg-tertiary-container" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/30 to-scrim/10" />

            {/* Gacha Logo (centered) */}
            <div className="absolute inset-0 flex items-center justify-center p-8 pb-16">
                <div className="relative w-full h-full max-w-[360px] max-h-[100px] lg:max-h-[140px]">
                    <Image
                        src={getGachaLogoUrl(gacha.assetbundleName, assetSource)}
                        alt=""
                        fill
                        className="object-contain drop-shadow-xl"
                        unoptimized
                        loading="lazy"
                    />
                </div>
            </div>

            {/* Bottom Info */}
            <div className="absolute bottom-0 left-0 right-0 p-3 lg:p-4">
                <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={`type-label-m px-2 py-0.5 rounded-md3-sm ${isUpcoming ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-container text-on-tertiary-container"}`}>
                                {isUpcoming ? t("page.home.hero.upcomingGacha") : t("page.home.hero.currentGacha")}
                            </span>
                        </div>
                        <h3 className="type-title-m text-white line-clamp-1 drop-shadow-sm">
                            {gacha.name}
                        </h3>
                    </div>
                    <div className="type-label-l text-white/80 ml-4 shrink-0">
                        {isUpcoming ? t("page.home.hero.gachaStartsAt", { date: formatDate(gacha.startAt) }) : formatRemaining(gacha.endAt)}
                    </div>
                </div>
            </div>
        </Link>
    );
}

// ─── Birthday Slide ───

function BirthdaySlideContent({
    slide,
    isActive,
    assetSource,
    formatDate,
    t,
}: {
    slide: BirthdaySlide;
    isActive: boolean;
    assetSource: AssetSourceType;
    formatDate: (ts: number) => string;
    t: ReturnType<typeof useI18n>["t"];
}) {
    const { birthday, card } = slide;
    const charColor = CHAR_COLORS[birthday.id.toString()] || "#ff66cc";
    const isBirthdayRarity = card?.cardRarityType === "rarity_birthday";

    const cardImageUrl = card
        ? getCardFullUrl(
            card.characterId,
            card.assetbundleName,
            isBirthdayRarity ? false : true,
            assetSource
        )
        : null;

    return (
        <Link href={`/character/${birthday.id}`} className="focus-ring block w-full h-full relative rounded-md3-xl">
            {/* Background */}
            {cardImageUrl ? (
                <>
                    <Image
                        src={cardImageUrl}
                        alt={birthday.name}
                        fill
                        className="object-cover object-top"
                        unoptimized
                        loading={isActive ? "eager" : "lazy"}
                        fetchPriority={isActive ? "high" : undefined}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-scrim/70 via-scrim/40 to-transparent" />
                </>
            ) : (
                <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${charColor}40, ${charColor}15)` }}
                />
            )}

            {/* Content */}
            <div className="absolute inset-0 flex items-center p-6 lg:p-8">
                <div className="flex items-center gap-4 lg:gap-6">
                    {/* Character Icon */}
                    <div
                        className="relative w-16 h-16 lg:w-20 lg:h-20 shrink-0 rounded-full p-0.5 shadow-elev-2"
                        style={{ backgroundColor: charColor }}
                    >
                        <div className="w-full h-full rounded-full overflow-hidden bg-surface-container-lowest">
                            <Image
                                src={getCharacterIconUrl(birthday.id)}
                                alt={birthday.name}
                                fill
                                className="object-contain rounded-full"
                                unoptimized
                            />
                        </div>
                    </div>

                    {/* Text */}
                    <div>
                        <div className="text-white/80 type-label-l mb-1">
                            {formatDate(new Date(2000, birthday.month - 1, birthday.day).getTime())}
                        </div>
                        <h3
                            className="type-headline-s lg:type-headline-l type-emphasized text-white drop-shadow-lg"
                        >
                            {isVirtualSinger(birthday.id)
                                ? t("page.home.hero.anniversaryGreeting", { name: birthday.name })
                                : t("page.home.hero.birthdayGreeting", { name: birthday.name })}
                        </h3>
                        {card && card.cardRarityType === "rarity_birthday" && (
                            <p className="type-body-m text-white/70 mt-1">
                                🎉 {card.prefix}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}
