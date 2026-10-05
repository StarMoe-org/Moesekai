"use client";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { IMusicInfo, getMusicJacketUrl, MUSIC_CATEGORY_COLORS, MusicCategoryType, MusicDifficultyType, DIFFICULTY_COLORS } from "@/types/music";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { formatBpmValue } from "@/lib/musicBpm";
import { Icon } from "@/components/md3";
import { mdSearch } from "@/components/md3/icons";

const ALL_DIFFICULTIES: MusicDifficultyType[] = ["easy", "normal", "hard", "expert", "master", "append"];
const JACKET_OVERLAY_BADGE_CLASS = "inline-flex h-5 items-center rounded-md3-xs bg-scrim/60 px-1.5 font-mono text-[10px] font-normal leading-4 text-white";

interface MusicItemProps {
    music: IMusicInfo;
    isSpoiler?: boolean;
    constant?: number;
    difficulties?: Record<string, number>;
    showDifficulty?: boolean;
    /** Main BPM value; renders a metronome badge at the jacket's bottom-right corner */
    bpm?: number;
    cnTitle?: string;
    enTitle?: string;
    href?: string;
    hrefBase?: string;
    jacketTopLeftLabel?: string;
    /** Aliases that caused the current search hit (one per text term not explained by title/credits) */
    matchedAliases?: string[];
}

export default function MusicItem({ music, isSpoiler, constant, difficulties, showDifficulty, bpm, cnTitle, enTitle, href, hrefBase = "/music", jacketTopLeftLabel, matchedAliases }: MusicItemProps) {
    const { assetSource, useLLMTranslation } = useTheme();
    const { locale, t } = useI18n();
    const { t: translateMasterText } = useTranslation();
    const jacketUrl = getMusicJacketUrl(music.assetbundleName, assetSource);
    const indexedTitle = locale === "zh-CN" ? cnTitle : locale === "en-US" ? enTitle : undefined;
    const translatedTitle = translateMasterText("music", "title", music.title) ?? (useLLMTranslation ? indexedTitle : undefined);
    const itemHref = href ?? `${hrefBase}/${music.id}`;

    return (
        <Link href={itemHref} className="group state-layer focus-ring block rounded-md3-md [content-visibility:auto] [contain-intrinsic-size:auto_320px]" data-shortcut-item="true">
            <div className="relative rounded-md3-md overflow-hidden bg-surface-container-low text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                {/* Jacket Image */}
                <div className="relative aspect-square overflow-hidden">
                    <Image
                        src={jacketUrl}
                        alt={music.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover"
                        unoptimized
                        loading="lazy"
                        decoding="async"
                    />

                    {/* Category Tags Overlay */}
                    <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                        {Array.from(new Set(music.categories ?? [])).map((cat) => (
                            <span
                                key={cat}
                                className="px-1.5 py-0.5 text-[10px] font-bold rounded-md3-xs text-white shadow-elev-1"
                                style={{ backgroundColor: MUSIC_CATEGORY_COLORS[cat as MusicCategoryType] }}
                            >
                                {t(`common.musicCategories.${cat}`)}
                            </span>
                        ))}
                    </div>

                    {/* ID Badge */}
                    <div className={`absolute right-2 top-2 z-10 ${JACKET_OVERLAY_BADGE_CLASS}`}>
                        #{music.id}
                    </div>

{/* Constant Badge - bottom right */}
                    {constant !== undefined && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-primary text-on-primary rounded-md3-xs text-[10px] font-bold shadow-elev-1">
                            {constant.toFixed(1)}
                        </div>
                    )}

                    {/* Top-left badges: jacket label / spoiler / BPM (BPM sits below the spoiler label) */}
                    {(bpm !== undefined || jacketTopLeftLabel || isSpoiler) && (
                        <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
                            {jacketTopLeftLabel && (
                                <span className={JACKET_OVERLAY_BADGE_CLASS}>
                                    {jacketTopLeftLabel}
                                </span>
                            )}
                            {isSpoiler && (
                                <span className="rounded-md3-xs bg-tertiary px-1.5 py-0.5 text-[10px] font-bold leading-4 text-on-tertiary shadow-elev-1">
                                    {t("common.badge.spoiler")}
                                </span>
                            )}
                            {bpm !== undefined && (
                                <span
                                    className={`${JACKET_OVERLAY_BADGE_CLASS} font-bold`}
                                    title={`${formatBpmValue(bpm)} BPM`}
                                >
                                    <span aria-hidden="true" className="text-[12px] leading-none font-sans">♩</span>
                                    {formatBpmValue(bpm)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="p-3">
                    <h3 className="type-title-s text-on-surface group-hover:text-primary">
                        <span className="flex flex-col">
                            <span className="block">{music.title}</span>
                            {translatedTitle && (
                                <span className="type-body-s text-on-surface-variant block">{translatedTitle}</span>
                            )}
                        </span>
                    </h3>
                    <p className="type-body-s text-on-surface-variant mt-1">
                        {music.composer}
                        {music.composer !== music.arranger && music.arranger !== "-" && ` / ${music.arranger}`}
                    </p>
                    {matchedAliases && matchedAliases.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] leading-4">
                            <Icon path={mdSearch} size={12} className="text-primary" />
                            <span className="shrink-0 text-on-surface-variant">{t("page.music.aliasesLabel")}</span>
                            {matchedAliases.map((alias) => (
                                <span
                                    key={alias}
                                    className="max-w-full truncate rounded-md3-xs bg-primary-container px-1.5 py-0.5 font-bold text-on-primary-container"
                                    title={alias}
                                >
                                    {alias}
                                </span>
                            ))}
                        </div>
                    )}
                    {showDifficulty && difficulties && (
                        <div className="flex justify-center gap-1 mt-1.5">
                            {ALL_DIFFICULTIES.map(diff => {
                                const level = difficulties[diff];
                                if (level === undefined) return null;
                                return (
                                    <span
                                        key={diff}
                                        className="text-[10px] font-bold text-white min-w-[1.25rem] text-center py-0.5 rounded-md3-xs"
                                        style={{ backgroundColor: DIFFICULTY_COLORS[diff] }}
                                    >
                                        {level}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
}
