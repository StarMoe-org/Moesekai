"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ExternalLink from "@/components/ExternalLink";
import MainLayout from "@/components/MainLayout";
import LyricText from "@/components/lyrics/LyricText";
import TranslationEditionSelect from "@/components/lyrics/TranslationEditionSelect";
import Link from "@/components/LocalizedLink";
import { renderMemberText } from "@/components/MemberText";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, AssetSourceType } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { getCharacterIconUrl, getMusicVocalAudioUrl } from "@/lib/assets";
import { getOutsideCharacterAvatarUrl } from "@/lib/lyrics-performers";
import { getCharacterName } from "@/lib/i18n";
import {
    fetchLyricsDocument,
    getLyricsDisplayLines,
    getLyricsDisplaySegments,
    getLyricsRendition,
    getLyricsRenditions,
    getLyricsSelectedTranslationCredits,
    getLyricsTargetLocale,
    getLyricsTranslationEditions,
    getPublishedLyricsIndexEntry,
    hasFullLyricsVersion,
    resolveLyricsTranslationEdition,
    hasGameLyricsVersion,
    isLyricsUnavailableError,
    type ILyricsAttribution,
    type ILyricsDocument,
    type ILyricsIndexEntry,
    type ILyricsV3ComponentAttribution,
    type LyricsVersion,
} from "@/lib/lyrics";
import { fetchLyricsMusicById } from "@/lib/lyrics-music-source";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import type { IMusicInfo, IMusicVocalInfo, IOutsideCharacter } from "@/types/music";
import { getMusicJacketUrl, MUSIC_CATEGORY_COLORS } from "@/types/music";
import { Button, EmptyState, Icon, LoadingState, PageContainer, SegmentedButton } from "@/components/md3";
import { mdArrowBack, mdArrowForward, mdDownload, mdEditNote, mdInfo, mdLyrics, mdMic, mdPause, mdPlayArrow } from "@/components/md3/icons";
type LyricsDisplayAttribution = ILyricsAttribution | ILyricsV3ComponentAttribution;

function getLyricsDisplayAttributions(attributions: readonly LyricsDisplayAttribution[]): LyricsDisplayAttribution[] {
    const seen = new Set<string>();
    return attributions.filter((attribution) => {
        const identity = [
            attribution.provider,
            attribution.title,
            attribution.revisionId,
            attribution.revisionUrl,
            attribution.licenseName,
            attribution.licenseUrl,
        ].join("\u0000");
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
    });
}

// Vocal Audio Player Component aligned with /music/[id]
function VocalPlayer({
    vocal,
    fillerSec,
    assetSource,
    outsideCharacters,
    downloadLabel,
    getCharacterLabel,
}: {
    vocal: IMusicVocalInfo;
    fillerSec: number;
    assetSource: AssetSourceType;
    outsideCharacters: Record<number, string>;
    downloadLabel: string;
    getCharacterLabel: (characterId: number) => string;
}) {
    const { t } = useI18n();
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrl = getMusicVocalAudioUrl(vocal.assetbundleName, assetSource);

    const togglePlay = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.onplay = () => setIsPlaying(true);
            audioRef.current.onpause = () => setIsPlaying(false);
            audioRef.current.onloadedmetadata = () => {
                if (audioRef.current) setDuration(audioRef.current.duration);
            };
            audioRef.current.ontimeupdate = () => {
                if (audioRef.current) {
                    setProgress(audioRef.current.currentTime);
                }
            };

            if (fillerSec > 0) {
                audioRef.current.currentTime = fillerSec;
            }
        }

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        setProgress(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    return (
        <div className="px-5 py-4 transition-colors group">
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? t("common.action.pause") : t("common.action.play")}
                    aria-pressed={isPlaying}
                    className={`state-layer focus-ring shrink-0 w-12 h-12 flex items-center justify-center transition-[border-radius,background-color] duration-200 ease-md3-standard ${isPlaying
                        ? "bg-primary-container text-on-primary-container rounded-md3-lg"
                        : "bg-primary text-on-primary rounded-full shadow-elev-1"
                    }`}
                >
                    <Icon path={isPlaying ? mdPause : mdPlayArrow} size={24} />
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="type-title-s text-on-surface truncate">
                            <TranslatedText
                                original={vocal.caption}
                                category="music"
                                field="vocalCaption"
                                originalClassName="truncate block"
                                translationClassName="type-body-s text-on-surface-variant truncate block"
                            />
                        </div>
                        <a
                            href={audioUrl}
                            download={`${vocal.caption}.mp3`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant"
                            title={downloadLabel}
                            aria-label={downloadLabel}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon path={mdDownload} size={20} />
                        </a>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                        {vocal.characters?.map((chara) => {
                            const isGameChar = chara.characterType === "game_character";
                            const charName = isGameChar
                                ? getCharacterLabel(chara.characterId)
                                : outsideCharacters[chara.characterId] || `Guest ${chara.characterId}`;
                            const externalAvatar = !isGameChar ? getOutsideCharacterAvatarUrl(charName) : null;
                            const hasIcon = (isGameChar && chara.characterId <= 26) || Boolean(externalAvatar);
                            const avatarUrl = isGameChar ? getCharacterIconUrl(chara.characterId) : externalAvatar;

                            return hasIcon && avatarUrl ? (
                                <div
                                    key={chara.id}
                                    className="w-6 h-6 rounded-full overflow-hidden bg-surface-container-high ring-1 ring-surface"
                                    title={charName}
                                >
                                    <Image
                                        src={avatarUrl}
                                        alt={charName}
                                        width={24}
                                        height={24}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <span
                                    key={chara.id}
                                    className="type-label-s px-2 py-0.5 bg-surface-container-high text-on-surface-variant rounded-full"
                                >
                                    {charName}
                                </span>
                            );
                        })}
                    </div>

                    {duration > 0 && (
                        <div className="flex items-center gap-2 type-label-s text-on-surface-variant">
                            <span>{formatTime(progress)}</span>
                            <input
                                type="range"
                                min={0}
                                max={duration}
                                step={0.1}
                                value={progress}
                                onChange={handleSeek}
                                className="flex-1 h-1 bg-surface-container-highest rounded-full appearance-none cursor-pointer accent-primary"
                            />
                            <span>{formatTime(duration)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function LyricsDetailClient() {
    const params = useParams();
    const searchParams = useSearchParams();
    const musicId = Number(params.musicId);
    const { locale, t, formatDate } = useI18n();
    const { assetSource } = useTheme();
    const { setDetailName } = useBreadcrumb();
    const hasValidMusicId = Number.isInteger(musicId) && musicId > 0;
    const searchParamString = searchParams.toString();
    const requestedVersionParams = searchParams.getAll("version");
    const requestedVersionParam = requestedVersionParams.length === 1 ? requestedVersionParams[0] : null;
    const requestedVersion: LyricsVersion = requestedVersionParam === "game" ? "game" : "full";
    const requestedRenditionParams = searchParams.getAll("rendition");
    const requestedRenditionParamCount = requestedRenditionParams.length;
    const requestedRenditionKey = requestedRenditionParamCount === 1 ? requestedRenditionParams[0] : null;
    const requestedTranslationParams = searchParams.getAll("translation");
    const requestedTranslationEditionKey = requestedTranslationParams.length === 1 ? requestedTranslationParams[0] : null;
    const [result, setResult] = useState<{
        musicId: number;
        locale: typeof locale;
        music: IMusicInfo | null;
        publication: ILyricsIndexEntry | null;
        lyrics: ILyricsDocument | null;
        errorKind: "unavailable" | "not-found" | "failed" | null;
    } | null>(null);
    const [vocals, setVocals] = useState<IMusicVocalInfo[]>([]);
    const [outsideCharacters, setOutsideCharacters] = useState<Record<number, string>>({});

    useEffect(() => {
        if (!hasValidMusicId) return;
        let cancelled = false;
        Promise.all([
            fetchLyricsMusicById(musicId),
            getPublishedLyricsIndexEntry(musicId),
            fetchLyricsDocument(musicId).then(
                (document) => ({ document, error: null as unknown }),
                (error: unknown) => ({ document: null, error }),
            ),
            fetchMasterData<IMusicVocalInfo[]>("musicVocals.json").catch(() => []),
            fetchMasterData<IOutsideCharacter[]>("outsideCharacters.json").catch(() => [] as IOutsideCharacter[]),
        ])
            .then(([music, publication, detail, vocalsData, outsideCharsData]) => {
                if (cancelled) return;
                const errorKind = detail.error
                    ? isLyricsUnavailableError(detail.error) ? publication ? "unavailable" : "not-found" : "failed"
                    : null;
                setResult({
                    musicId,
                    locale,
                    music,
                    publication,
                    lyrics: detail.document,
                    errorKind,
                });
                setVocals((vocalsData || []).filter((v) => v.musicId === musicId));
                // Build outside character name map
                const outsideCharMap: Record<number, string> = {};
                for (const oc of outsideCharsData) {
                    outsideCharMap[oc.id] = oc.name;
                }
                setOutsideCharacters(outsideCharMap);
            })
            .catch(() => {
                if (!cancelled) {
                    setResult({
                        musicId,
                        locale,
                        music: null,
                        publication: null,
                        lyrics: null,
                        errorKind: "failed",
                    });
                }
            });
        return () => { cancelled = true; };
    }, [hasValidMusicId, locale, musicId]);

    const currentResult = result?.musicId === musicId && result.locale === locale ? result : null;
    const music = currentResult?.music ?? null;
    const lyrics = currentResult?.lyrics ?? null;
    const publication = currentResult?.publication ?? null;
    const errorKind = currentResult?.errorKind ?? null;
    const isLoading = hasValidMusicId && !currentResult;
    const targetLocale = getLyricsTargetLocale(locale);
    // Public v4 currently carries zh-CN editions only. Other UI locales must
    // remain genuinely source-only instead of relabeling Japanese fallback text.
    const displayTargetLocale = lyrics?.version === 4 && targetLocale !== "zh-CN" ? null : targetLocale;
    const hasRenditionDimension = lyrics?.version === 3 || lyrics?.version === 4;
    const renditions = lyrics && hasRenditionDimension ? [...getLyricsRenditions(lyrics)] : [];
    const activeRendition = lyrics && hasRenditionDimension
        ? getLyricsRendition(lyrics, requestedRenditionKey)
        : null;
    const versionSource = activeRendition ?? lyrics;
    const hasFullVersion = versionSource ? hasFullLyricsVersion(versionSource) : true;
    const hasGameVersion = versionSource ? hasGameLyricsVersion(versionSource) : false;
    const activeVersion: LyricsVersion = requestedVersion === "game" && hasGameVersion
        ? "game"
        : hasFullVersion ? "full" : "game";
    const translationEditions = lyrics ? [...getLyricsTranslationEditions(lyrics, locale)] : [];
    const activeTranslationEdition = lyrics
        ? resolveLyricsTranslationEdition(lyrics, locale, requestedTranslationEditionKey)
        : null;
    const activeTranslationEditionKey = activeTranslationEdition?.key ?? null;
    const displayLines = lyrics
        ? getLyricsDisplayLines(lyrics, activeVersion, activeRendition?.key, activeTranslationEditionKey, locale)
        : [];
    const hasTargetTranslation = displayTargetLocale
        ? displayLines.some((line) => Boolean(line[displayTargetLocale]?.trim()))
        : false;
    const showTargetColumn = Boolean(displayTargetLocale && hasTargetTranslation);
    const translationCredits = lyrics
        ? getLyricsSelectedTranslationCredits(lyrics, activeRendition?.key, activeTranslationEditionKey, locale)
        : undefined;
    const attributions = getLyricsDisplayAttributions(
        activeRendition?.provenance
            ?? ((lyrics?.version === 1 || lyrics?.version === 2) ? (lyrics.attributions ?? []) : []),
    );
    const translationCredit = translationCredits?.translation?.trim();
    const proofreadingCredit = translationCredits?.proofreading?.trim();
    const sharedTranslationCredit = translationCredit && translationCredit === proofreadingCredit
        ? translationCredit
        : undefined;

    useEffect(() => {
        if (!lyrics) return;
        const query = new URLSearchParams(searchParamString);

        const canonicalizeSingleValue = (key: string, canonicalValue: string | null) => {
            const values = query.getAll(key);
            if (canonicalValue === null) {
                if (values.length > 0) query.delete(key);
                return;
            }
            if (values.length !== 1 || values[0] !== canonicalValue) {
                query.delete(key);
                query.set(key, canonicalValue);
            }
        };

        if (hasRenditionDimension && activeRendition) {
            if (requestedRenditionParamCount > 1
                || requestedRenditionParamCount === 1 && requestedRenditionKey !== activeRendition.key) {
                canonicalizeSingleValue("rendition", activeRendition.key);
            }
        } else {
            canonicalizeSingleValue("rendition", null);
        }

        const canonicalVersionParam = activeVersion === "game" && hasFullVersion ? "game" : null;
        canonicalizeSingleValue("version", canonicalVersionParam);

        const canonicalTranslationParam = lyrics.version === 4
            && activeTranslationEdition
            && activeTranslationEdition.key !== lyrics.defaultTranslationEditionKey
            ? activeTranslationEdition.key
            : null;
        canonicalizeSingleValue("translation", canonicalTranslationParam);

        if (query.toString() !== searchParamString) replaceCurrentUrlSearchParams(query);
    }, [
        activeRendition,
        activeTranslationEdition,
        activeVersion,
        hasFullVersion,
        hasRenditionDimension,
        lyrics,
        requestedRenditionKey,
        requestedRenditionParamCount,
        searchParamString,
    ]);

    useEffect(() => {
        if (music) setDetailName(music.title);
    }, [music, setDetailName]);

    const selectRendition = (renditionKey: string) => {
        const rendition = renditions.find((item) => item.key === renditionKey);
        if (!rendition) return;
        const query = new URLSearchParams(window.location.search);
        query.delete("rendition");
        query.set("rendition", renditionKey);
        query.delete("version");
        if (activeVersion === "game" && hasGameLyricsVersion(rendition) && hasFullLyricsVersion(rendition)) {
            query.set("version", "game");
        }
        replaceCurrentUrlSearchParams(query);
    };

    const selectVersion = (version: LyricsVersion) => {
        if (version === "full" && !hasFullVersion || version === "game" && !hasGameVersion) return;
        const query = new URLSearchParams(window.location.search);
        query.delete("version");
        if (version === "game" && hasFullVersion) query.set("version", "game");
        replaceCurrentUrlSearchParams(query);
    };

    const selectTranslationEdition = (editionKey: string) => {
        if (!lyrics || lyrics.version !== 4 || !translationEditions.some((edition) => edition.key === editionKey)) return;
        const query = new URLSearchParams(window.location.search);
        query.delete("translation");
        if (editionKey !== lyrics.defaultTranslationEditionKey) query.set("translation", editionKey);
        replaceCurrentUrlSearchParams(query);
    };

    if (isLoading) {
        return (
            <MainLayout>
                <PageContainer>
                    <LoadingState label={t("page.lyrics.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    if (!music || publication?.state === "satisfied_no_lyrics") {
        return (
            <MainLayout>
                <PageContainer>
                    <div role="alert">
                        <EmptyState
                            icon={mdLyrics}
                            title={errorKind === "failed" ? t("page.lyrics.error") : t("page.lyrics.notFound")}
                            action={
                                <Button variant="filled" icon={mdArrowBack} href="/lyrics">
                                    {t("page.lyrics.backToList")}
                                </Button>
                            }
                        />
                    </div>
                </PageContainer>
            </MainLayout>
        );
    }

    // Upstream failures and index-published-but-missing documents stay on the
    // error boundary; only a plain unpublished lookup renders the in-progress card.
    if (!lyrics && errorKind !== "not-found") {
        return (
            <MainLayout>
                <PageContainer>
                    <div role="alert">
                        <EmptyState
                            icon={mdLyrics}
                            title={errorKind === "failed" ? t("page.lyrics.error") : t("page.lyrics.notFound")}
                            action={
                                <Button variant="filled" icon={mdArrowBack} href="/lyrics">
                                    {t("page.lyrics.backToList")}
                                </Button>
                            }
                        />
                    </div>
                </PageContainer>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <PageContainer>
                <header className="mb-8">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-md3-sm bg-surface-container-high px-3 py-1 font-mono type-label-m text-on-surface-variant">
                            ID: {music.id}
                        </span>
                        {Array.from(new Set(music.categories ?? [])).map((category) => (
                            <span
                                key={category}
                                className="rounded-md3-xs px-2 py-0.5 type-label-m text-white"
                                style={{ backgroundColor: MUSIC_CATEGORY_COLORS[category] }}
                            >
                                {t(`common.musicCategories.${category}`)}
                            </span>
                        ))}
                        <Link
                            href={`/music/${music.id}`}
                            className="state-layer focus-ring inline-flex h-7 items-center gap-1 rounded-md3-sm bg-tertiary-container pl-2.5 pr-1.5 type-label-m text-on-tertiary-container"
                        >
                            <span>{t("page.music.goToMusicDetail")}</span>
                            <Icon path={mdArrowForward} size={16} />
                        </Link>
                    </div>
                    <h1 className="break-words type-headline-m text-on-surface sm:type-headline-l">{music.title}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 type-body-m text-on-surface-variant">
                        {music.composer && <span>{music.composer}</span>}
                        {music.lyricist && music.lyricist !== music.composer && <span>{music.lyricist}</span>}
                    </div>
                </header>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
                    <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                        {/* Music Jacket Card */}
                        <div className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70">
                            <div className="relative aspect-square bg-surface-container">
                                <Image
                                    src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                                    alt={music.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 1024px) 100vw, 34vw"
                                    unoptimized
                                    priority
                                />
                            </div>
                            <div className="border-t border-outline-variant p-5">
                                {lyrics ? (
                                    <dl className="space-y-3 type-body-m">
                                        <div className="flex items-start justify-between gap-4">
                                            <dt className="text-on-surface-variant">{t("page.lyrics.revision")}</dt>
                                            <dd className="font-mono font-bold text-on-surface">v{lyrics.revision}</dd>
                                        </div>
                                        <div className="flex items-start justify-between gap-4">
                                            <dt className="text-on-surface-variant">{t("page.lyrics.updatedAt")}</dt>
                                            <dd className="text-right font-medium text-on-surface">
                                                {formatDate(lyrics.updatedAt, { year: "numeric", month: "short", day: "numeric" })}
                                            </dd>
                                        </div>
                                    </dl>
                                ) : (
                                    <dl className="space-y-3 type-body-m">
                                        <div className="flex items-start justify-between gap-4">
                                            <dt className="text-on-surface-variant">{t("page.lyrics.versionLabel")}</dt>
                                            <dd className="inline-flex items-center rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-m text-on-tertiary-container">
                                                {t("page.lyrics.inProgressBadge")}
                                            </dd>
                                        </div>
                                    </dl>
                                )}
                            </div>
                        </div>

                        {/* Vocal Versions Audio Player Card */}
                        {vocals.length > 0 && (
                            <div className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70">
                                <SectionTitle icon={mdMic}>{t("page.music.vocalVersions", { seconds: Math.round((music.fillerSec || 0) * 10) / 10 })}</SectionTitle>
                                <div className="divide-y divide-outline-variant max-h-80 overflow-y-auto">
                                    {vocals.map((vocal) => (
                                        <VocalPlayer
                                            key={vocal.id}
                                            vocal={vocal}
                                            fillerSec={music.fillerSec}
                                            assetSource={assetSource}
                                            outsideCharacters={outsideCharacters}
                                            downloadLabel={t("page.music.downloadAudio")}
                                            getCharacterLabel={(characterId) => getCharacterName(t, characterId)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Attribution Card */}
                        {lyrics && (
                            <div className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70">
                                <SectionTitle icon={mdInfo}>{t("page.lyrics.attribution")}</SectionTitle>
                                <div className="p-5 pt-2">
                                    {lyrics.version === 1 ? (
                                        lyrics.attribution ? (
                                            <dl className="type-body-m">
                                                <div className="space-y-1">
                                                    <dt className="type-title-s text-on-surface">{t("page.lyrics.translation")}</dt>
                                                    <dd className="whitespace-pre-wrap break-words leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                                                        {renderMemberText(lyrics.attribution, undefined, { stripAtPrefix: true })}
                                                    </dd>
                                                </div>
                                            </dl>
                                        ) : (
                                            <p className="type-body-m text-on-surface-variant">
                                                {t("page.lyrics.translationCreditsEmpty")}
                                            </p>
                                        )
                                    ) : translationCredits ? (
                                        <dl className="space-y-4 type-body-m">
                                            {sharedTranslationCredit ? (
                                                <div className="space-y-1">
                                                    <dt className="type-title-s text-on-surface">{t("page.lyrics.translationAndProofreading")}</dt>
                                                    <dd className="whitespace-pre-wrap break-words leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                                                        {renderMemberText(sharedTranslationCredit, undefined, { stripAtPrefix: true })}
                                                    </dd>
                                                </div>
                                            ) : (
                                                <>
                                                    {translationCredit && (
                                                        <div className="space-y-1">
                                                            <dt className="type-title-s text-on-surface">{t("page.lyrics.translation")}</dt>
                                                            <dd className="whitespace-pre-wrap break-words leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                                                                {renderMemberText(translationCredit, undefined, { stripAtPrefix: true })}
                                                            </dd>
                                                        </div>
                                                    )}
                                                    {proofreadingCredit && (
                                                        <div className="space-y-1">
                                                            <dt className="type-title-s text-on-surface">{t("page.lyrics.proofreading")}</dt>
                                                            <dd className="whitespace-pre-wrap break-words leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                                                                {renderMemberText(proofreadingCredit, undefined, { stripAtPrefix: true })}
                                                            </dd>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </dl>
                                    ) : (
                                        <p className="type-body-m text-on-surface-variant">
                                            {t("page.lyrics.translationCreditsEmpty")}
                                        </p>
                                    )}
                                </div>
                                {attributions.length > 0 && (
                                    <>
                                        <div className="border-y border-outline-variant bg-surface-container px-5 py-3">
                                            <h3 className="type-title-s text-on-surface-variant">
                                                {t("page.lyrics.sourceLicenseTitle")}
                                            </h3>
                                        </div>
                                        <ul className="divide-y divide-outline-variant">
                                            {attributions.map((attribution) => (
                                                <li key={`${attribution.provider}-${attribution.revisionUrl}-${"component" in attribution ? attribution.component : "legacy"}`} className="space-y-2 p-5 type-body-m">
                                                    <div>
                                                        <p className="type-title-s text-on-surface">{t(`page.lyrics.attributionProviders.${attribution.provider}`)}</p>
                                                        <p className="mt-0.5 break-words text-on-surface-variant [overflow-wrap:anywhere]">{attribution.title}</p>
                                                    </div>
                                                    <dl className="space-y-1.5 type-body-s text-on-surface-variant">
                                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                            <dt>{t("page.lyrics.sourceRevision")}</dt>
                                                            <dd>
                                                                <ExternalLink href={attribution.revisionUrl} className="font-mono font-bold text-primary hover:underline">
                                                                    {attribution.revisionId}
                                                                </ExternalLink>
                                                            </dd>
                                                        </div>
                                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                            <dt>{t("page.lyrics.sourceLicense")}</dt>
                                                            <dd>
                                                                <ExternalLink href={attribution.licenseUrl} className="font-medium text-primary hover:underline">
                                                                    {attribution.licenseName}
                                                                </ExternalLink>
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                    </aside>

                    <section className="min-w-0">
                        {!lyrics ? (
                            <div className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70 p-8 sm:p-12 text-center">
                                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-md3-xl bg-primary-container text-on-primary-container">
                                    <Icon path={mdEditNote} size={40} />
                                </div>
                                <div className="mb-3 type-label-l text-primary">{t("page.lyrics.inProgressBadge")}</div>
                                <h2 className="type-headline-s text-on-surface mb-3">{t("page.lyrics.draftTitle")}</h2>
                                <p className="max-w-md mx-auto text-on-surface-variant type-body-m mb-8">
                                    {t("page.lyrics.draftDescription")}
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <Button variant="outlined" trailingIcon={mdArrowForward} href={`/music/${music.id}`}>
                                        {t("page.music.goToMusicDetail")}
                                    </Button>
                                    <Button variant="filled" icon={mdArrowBack} href="/lyrics">
                                        {t("page.lyrics.backToList")}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-md3-xl bg-surface-card border border-outline-variant/70">
                                <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="flex shrink-0 items-center gap-3 type-title-l text-on-surface">
                                    <Icon path={mdLyrics} size={24} className="text-primary" />
                                    {t("page.lyrics.contentTitle")}
                                </h2>
                                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                    {translationEditions.length > 1 && activeTranslationEdition && lyrics.version === 4 && (
                                        <TranslationEditionSelect
                                            options={translationEditions.map((edition) => ({
                                                key: edition.key,
                                                label: edition.label,
                                                isDefault: edition.key === lyrics.defaultTranslationEditionKey,
                                            }))}
                                            value={activeTranslationEdition.key}
                                            onChange={selectTranslationEdition}
                                            label={t("page.lyrics.translationEditionLabel")}
                                            currentLabel={t("page.lyrics.translationEditionCurrent", { label: activeTranslationEdition.label })}
                                            defaultLabel={t("page.lyrics.translationEditionDefault")}
                                            listLabel={t("page.lyrics.translationEditionListLabel")}
                                            className="w-full sm:w-64"
                                        />
                                    )}
                                    {renditions.length > 1 && (
                                        <div role="group" aria-label={t("page.lyrics.renditionLabel")} className="flex max-w-full flex-wrap gap-2">
                                            {renditions.map((rendition) => (
                                                <button
                                                    key={rendition.key}
                                                    type="button"
                                                    aria-pressed={activeRendition?.key === rendition.key}
                                                    onClick={() => selectRendition(rendition.key)}
                                                    className={`state-layer focus-ring h-8 rounded-md3-sm border px-3 type-label-l transition-colors ${activeRendition?.key === rendition.key
                                                        ? "border-transparent bg-primary-container text-on-primary-container"
                                                        : "border-outline-variant text-on-surface-variant"
                                                    }`}
                                                >
                                                    {rendition.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {hasFullVersion && hasGameVersion ? (
                                        <SegmentedButton
                                            aria-label={t("page.lyrics.versionLabel")}
                                            className="w-fit"
                                            density={-1}
                                            value={activeVersion}
                                            onValueChange={(v) => selectVersion(v)}
                                            options={[
                                                { value: "full" as LyricsVersion, label: t("page.lyrics.versionFull") },
                                                { value: "game" as LyricsVersion, label: t("page.lyrics.versionGame") },
                                            ]}
                                        />
                                    ) : (
                                        <span className="inline-flex h-8 items-center rounded-md3-sm bg-secondary-container px-3 type-label-l text-on-secondary-container">
                                            {activeVersion === "game" ? t("page.lyrics.versionGame") : t("page.lyrics.versionFull")}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {displayLines.length === 0 ? (
                                <div className="p-10 text-center type-body-m text-on-surface-variant">
                                    {t("page.lyrics.emptyDocument")}
                                </div>
                            ) : (
                                <div>
                                    <div className={`hidden gap-6 border-b border-outline-variant bg-surface-container px-5 py-3 type-title-s text-on-surface-variant md:grid ${showTargetColumn ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                                        <span>{t("page.lyrics.japanese")}</span>
                                        {showTargetColumn && (
                                            <span>{displayTargetLocale === "zh-CN" ? t("page.lyrics.chinese") : t("page.lyrics.english")}</span>
                                        )}
                                    </div>
                                    <div className="divide-y divide-outline-variant">
                                        {displayLines.map((line) => {
                                            const translated = displayTargetLocale ? line[displayTargetLocale] : undefined;
                                            const targetText = translated || line.japanese;
                                            return (
                                                <article
                                                    key={line.id}
                                                    className={`${line.stanzaBreakBefore ? "border-t-8 border-t-surface-container" : ""} grid grid-cols-1 gap-4 px-5 py-5 md:gap-6 ${showTargetColumn ? "md:grid-cols-2" : "md:grid-cols-1"}`}
                                                >
                                                    <div className="min-w-0">
                                                        <span className="mb-2 block type-label-s text-on-surface-variant md:hidden">
                                                            {t("page.lyrics.japanese")}
                                                        </span>
                                                        <LyricText
                                                            segments={getLyricsDisplaySegments(line)}
                                                            trailingPerformerIds={"trailingPerformerIds" in line ? line.trailingPerformerIds : undefined}
                                                            performers={activeRendition?.performers}
                                                        />
                                                    </div>
                                                    {showTargetColumn && (
                                                        <div className="min-w-0 border-t border-outline-variant pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                                            <span className="mb-2 block type-label-s text-on-surface-variant md:hidden">
                                                                {displayTargetLocale === "zh-CN" ? t("page.lyrics.chinese") : t("page.lyrics.english")}
                                                            </span>
                                                            <LyricText text={targetText} performerIds={[]} />
                                                            {!translated && (
                                                                <span className="mt-2 inline-flex rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                                                    {t("page.lyrics.translationFallback")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>
                </div>

                <div className="mt-12 text-center">
                    <Button variant="tonal" icon={mdArrowBack} href="/lyrics">
                        {t("page.lyrics.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

// Section heading used by the sidebar cards
function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-14 items-center gap-3 px-5 pt-4 pb-2">
            <Icon path={icon} size={24} className="text-primary" />
            <h2 className="min-w-0 flex-1 truncate type-title-l text-on-surface">{children}</h2>
        </div>
    );
}

