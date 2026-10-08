"use client";
import { useState } from "react";
import Image from "next/image";
import { IProcessedAction, SnippetAction, type StoryTranslationSource } from "@/types/story";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { UNIT_FIELD_TO_ID, UNIT_ICON_FILES } from "@/types/types";
import { Button, IconButton, cn } from "@/components/md3";
import { mdImage, mdPauseFill, mdPlayArrowFill } from "@/components/md3/icons";

/* --------------------------------------------------------------------------
   Shared snippet chrome
   -------------------------------------------------------------------------- */

type SnippetTone = "primary" | "secondary" | "tertiary" | "neutral" | "inverse" | "error";

const TAG_TONE: Record<SnippetTone, string> = {
    primary: "bg-primary-container text-on-primary-container",
    secondary: "bg-secondary-container text-on-secondary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    neutral: "bg-surface-container-highest text-on-surface-variant",
    inverse: "border border-inverse-primary/40 text-inverse-primary",
    error: "bg-error-container text-on-error-container",
};

function SnippetTag({ tone, children }: { tone: SnippetTone; children: React.ReactNode }) {
    return <span className={cn("inline-flex h-6 items-center rounded-md3-sm px-2 type-label-m", TAG_TONE[tone])}>{children}</span>;
}

function SnippetBox({ className, children }: { className?: string; children: React.ReactNode }) {
    return <div className={cn("my-3 rounded-md3-lg p-4", className)}>{children}</div>;
}

/* --------------------------------------------------------------------------
   Talk (dialogue bubble)
   -------------------------------------------------------------------------- */

interface TalkSnippetProps {
    characterId: number;
    characterName: string;
    text: string;
    voiceUrl?: string;
    cnText?: string;
    cnDisplayName?: string;
    translatedText?: string;
    translatedDisplayName?: string;
    translationSource?: StoryTranslationSource;
    unitName?: string; // Legacy unit name for virtual singers
    unitField?: string; // Unit field for virtual singers (e.g., 'light_sound', 'school_refusal')
    active?: boolean;
    progress?: number;
}

export function TalkSnippet({
    characterId,
    characterName,
    text,
    voiceUrl,
    cnText,
    cnDisplayName,
    translatedText,
    translatedDisplayName,
    translationSource: _translationSource,
    unitName: _unitName,
    unitField,
    active = false,
    progress = 0
}: TalkSnippetProps) {
    const { useLLMTranslation } = useTheme();
    const iconUrl = characterId > 0 && characterId <= 26
        ? getCharacterIconUrl(characterId)
        : null;

    // Show CN text when translation is enabled and different from original (after trimming)
    const showCnText = useLLMTranslation && !!cnText && cnText.trim() !== text.trim();
    // Show CN display name when translation is enabled, available, and different from original (after trimming)
    const showCnDisplayName = useLLMTranslation && !!cnDisplayName && cnDisplayName.trim() !== characterName.trim();
    const displayTranslation = translatedText ?? cnText;
    const displayNameTranslation = translatedDisplayName ?? cnDisplayName;
    const showTranslatedText = translatedText !== undefined
        ? useLLMTranslation && !!translatedText && translatedText.trim() !== text.trim()
        : showCnText;
    const showTranslatedDisplayName = translatedDisplayName !== undefined
        ? useLLMTranslation && !!translatedDisplayName && translatedDisplayName.trim() !== characterName.trim()
        : showCnDisplayName;

    // Determine badge unit icon for virtual singers (21-26)
    const isVirtualSinger = characterId >= 21 && characterId <= 26;
    let badgeUnitId: string | null = null;
    if (isVirtualSinger && unitField && unitField !== "piapro") {
        // Directly use UNIT_FIELD_TO_ID to get the unit id
        badgeUnitId = UNIT_FIELD_TO_ID[unitField] || null;
    }
    const badgeIcon = badgeUnitId ? UNIT_ICON_FILES[badgeUnitId] : null;

    return (
        <div
            className={cn(
                "relative my-3 overflow-hidden rounded-md3-lg bg-surface-container-lowest p-4 transition-shadow duration-300 ease-md3-standard",
                active && "z-10 shadow-elev-2 ring-2 ring-primary",
            )}
        >
            {/* Playback progress */}
            {active && (
                <div
                    className="absolute left-0 top-0 h-[3px] bg-primary transition-[width] duration-100"
                    style={{ width: `${progress}%` }}
                />
            )}
            <div className="flex items-start gap-3">
                {/* Character Avatar */}
                <div className="relative shrink-0">
                    {iconUrl ? (
                        <>
                            <img
                                src={iconUrl}
                                alt={characterName}
                                className="h-12 w-12 rounded-full bg-surface-container-high object-cover"
                            />
                            {badgeIcon && (
                                <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-container-highest shadow-elev-1">
                                    <Image
                                        src={`/data/icon/${badgeIcon}`}
                                        alt=""
                                        width={16}
                                        height={16}
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest">
                            <span className="type-title-m text-on-surface-variant">{characterName.charAt(0)}</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    {/* Character name */}
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-7 items-center rounded-md3-sm bg-secondary-container px-2.5 type-label-l text-on-secondary-container">
                            {characterName}
                        </span>
                        {showTranslatedDisplayName && (
                            <span className="inline-flex h-7 items-center rounded-md3-sm bg-surface-container-high px-2.5 type-label-l text-on-surface-variant">
                                {displayNameTranslation}
                            </span>
                        )}
                    </div>

                    {/* Dialogue text */}
                    <p className="whitespace-pre-wrap type-body-l leading-7! text-on-surface">{text}</p>

                    {/* Translation */}
                    {showTranslatedText && (
                        <p className="mt-2 whitespace-pre-wrap border-t border-outline-variant pt-2 type-body-m leading-6! text-on-surface-variant">
                            {displayTranslation}
                        </p>
                    )}
                </div>

                {/* Voice Button */}
                {voiceUrl && <AudioPlayButton url={voiceUrl} />}
            </div>
        </div>
    );
}

/* --------------------------------------------------------------------------
   Special effects
   -------------------------------------------------------------------------- */

interface SpecialEffectSnippetProps {
    seType: string;
    text?: string;
    resource?: string;
    /** Playback is on this row. */
    active?: boolean;
}

// Helper function to check if a background is a CG
function isCgImage(picName: string): boolean {
    if (picName.startsWith('bg_a')) {
        const numPart = picName.substring(4);
        const num = parseInt(numPart, 10);
        return !isNaN(num) && num >= 1 && num <= 99;
    }
    return picName.startsWith('bg_s');
}

export function SpecialEffectSnippet({ seType, text, resource, active = false }: SpecialEffectSnippetProps) {
    const [isImageOpen, setIsImageOpen] = useState(false);
    const { t } = useI18n();
    // the rows playback can be in (a telop, a full-screen text, choices) are marked as a talk is
    const mark = active && "relative z-10 shadow-elev-2 ring-2 ring-primary";

    switch (seType) {
        case "FullScreenText":
            return (
                <SnippetBox className={cn("my-4 bg-inverse-surface p-6 text-inverse-on-surface", mark)}>
                    <div className="mb-3 flex items-center gap-2">
                        <SnippetTag tone="inverse">{t("page.story.snippet.fullScreenText")}</SnippetTag>
                    </div>
                    <p className="my-4 whitespace-pre-wrap text-center type-title-l font-normal leading-8!">
                        {text?.trimStart()}
                    </p>
                    {resource && (
                        <div className="mt-3 flex justify-center">
                            <AudioPlayButton url={resource} inverse />
                        </div>
                    )}
                </SnippetBox>
            );

        case "Telop":
            return (
                <SnippetBox className={cn("bg-tertiary-container text-on-tertiary-container", mark)}>
                    <div className="mb-2 flex items-center gap-2">
                        <SnippetTag tone="tertiary">{t("page.story.snippet.telop")}</SnippetTag>
                    </div>
                    <p className="whitespace-pre-wrap text-center type-body-l type-emphasized leading-7!">{text?.trimStart()}</p>
                </SnippetBox>
            );

        case "PlaceInfo":
            return (
                <SnippetBox className="bg-surface-container-low">
                    <div className="mb-2 flex items-center gap-2">
                        <SnippetTag tone="secondary">{t("page.story.snippet.placeInfo")}</SnippetTag>
                    </div>
                    <p className="type-body-l text-on-surface">{t("page.story.snippet.placeText", { place: text })}</p>
                </SnippetBox>
            );

        case "ChangeBackground": {
            //case "ChangeBackgroundStill":
            const isCg = isCgImage(text || '');
            return (
                <SnippetBox className="bg-surface-container-low">
                    <div className="mb-3 flex items-center gap-2">
                        <SnippetTag tone="primary">
                            {isCg ? t("page.story.snippet.cgInsert") : t("page.story.snippet.backgroundChange")}
                        </SnippetTag>
                    </div>

                    {isImageOpen && resource ? (
                        <button
                            type="button"
                            className="state-layer focus-ring block w-full cursor-pointer overflow-hidden rounded-md3-md"
                            onClick={() => window.open(resource, "_blank")}
                        >
                            <img src={resource} alt="Background" className="w-full rounded-md3-md" />
                        </button>
                    ) : (
                        <Button variant="tonal" size="s" icon={mdImage} onClick={() => setIsImageOpen(true)}>
                            {isCg ? t("page.story.snippet.showCg") : t("page.story.snippet.showBackground")}
                        </Button>
                    )}
                </SnippetBox>
            );
        }

        case "FlashbackIn":
            return (
                <SnippetBox className="bg-surface-container-low p-3">
                    <SnippetTag tone="tertiary">{t("page.story.snippet.flashbackIn")}</SnippetTag>
                </SnippetBox>
            );

        case "FlashbackOut":
            return (
                <SnippetBox className="bg-surface-container-low p-3">
                    <SnippetTag tone="tertiary">{t("page.story.snippet.flashbackOut")}</SnippetTag>
                </SnippetBox>
            );

        case "BlackOut":
            return (
                <SnippetBox className="bg-inverse-surface p-3">
                    <SnippetTag tone="inverse">{t("page.story.snippet.blackOut")}</SnippetTag>
                </SnippetBox>
            );

        case "WhiteOut":
            return (
                <SnippetBox className="border border-outline-variant bg-surface-container-lowest p-3">
                    <SnippetTag tone="neutral">{t("page.story.snippet.whiteOut")}</SnippetTag>
                </SnippetBox>
            );

        case "SimpleSelectable":
            return (
                <SnippetBox className={cn("bg-primary-container text-on-primary-container", mark)}>
                    <div className="mb-2 flex items-center gap-2">
                        <SnippetTag tone="primary">{t("page.story.snippet.choice")}</SnippetTag>
                    </div>
                    <p className="whitespace-pre-wrap text-center type-body-l type-emphasized leading-7!">{text?.trimStart()}</p>
                </SnippetBox>
            );

        case "Movie":
            return (
                <SnippetBox className="bg-surface-container-low">
                    <div className="flex items-center gap-2">
                        <SnippetTag tone="error">{t("page.story.snippet.movie")}</SnippetTag>
                        <span className="type-body-m text-on-surface">{text}</span>
                    </div>
                </SnippetBox>
            );

        case "PlayMV": {
            // resource format: "id:name" or just "id"
            const mvParts = resource?.split(':') || [];
            const mvId = mvParts[0] || '';
            const mvName = mvParts[1] || '';

            return (
                <SnippetBox className="bg-tertiary-container text-on-tertiary-container">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <SnippetTag tone="tertiary">{t("page.story.snippet.playMv")}</SnippetTag>
                        </div>
                        {mvName ? (
                            <p className="type-title-m">{mvName}</p>
                        ) : (
                            <p className="type-body-m">MV ID: {mvId}</p>
                        )}
                    </div>
                </SnippetBox>
            );
        }

        default:
            return null;
    }
}

/* --------------------------------------------------------------------------
   Sound
   -------------------------------------------------------------------------- */

interface SoundSnippetProps {
    hasBgm: boolean;
    hasSe: boolean;
    audioUrl?: string;
}

export function SoundSnippet({ hasBgm, hasSe, audioUrl }: SoundSnippetProps) {
    const isNoSound = audioUrl?.endsWith("bgm00000.mp3");
    const { t } = useI18n();

    return (
        <div className="my-2 rounded-md3-md bg-surface-container px-3 py-2">
            <div className="flex min-h-10 items-center gap-3">
                <SnippetTag tone={hasBgm ? "primary" : "secondary"}>
                    {hasBgm ? "BGM" : hasSe ? "SE" : t("page.story.snippet.soundEffect")}
                </SnippetTag>

                {isNoSound ? (
                    <span className="type-body-m text-on-surface-variant">{t("page.story.snippet.silent")}</span>
                ) : audioUrl ? (
                    <AudioPlayButton url={audioUrl} />
                ) : null}
            </div>
        </div>
    );
}

/* --------------------------------------------------------------------------
   Audio play button
   -------------------------------------------------------------------------- */

interface AudioPlayButtonProps {
    url: string;
    /** Render on an inverse surface (full screen text). */
    inverse?: boolean;
}

function AudioPlayButton({ url, inverse = false }: AudioPlayButtonProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
    const { t } = useI18n();

    const handlePlay = () => {
        if (isPlaying && audio) {
            audio.pause();
            setIsPlaying(false);
            return;
        }

        const newAudio = new Audio(url);
        newAudio.onended = () => setIsPlaying(false);
        newAudio.onerror = () => setIsPlaying(false);
        newAudio.play().catch(() => setIsPlaying(false));
        setAudio(newAudio);
        setIsPlaying(true);
    };

    return (
        <IconButton
            icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
            label={isPlaying ? t("page.story.snippet.stopAudio") : t("page.story.snippet.playAudio")}
            variant={inverse ? "standard" : "tonal"}
            selected={isPlaying}
            onClick={handlePlay}
            className={inverse ? "text-inverse-primary" : undefined}
        />
    );
}

/* --------------------------------------------------------------------------
   Main snippet renderer
   -------------------------------------------------------------------------- */

interface StorySnippetProps {
    action: IProcessedAction;
    index?: number;
    activeIndex?: number;
    playbackProgress?: number;
}

export function StorySnippet({ action, index, activeIndex, playbackProgress }: StorySnippetProps) {
    const active = index !== undefined && activeIndex !== undefined && index === activeIndex;

    switch (action.type) {
        case SnippetAction.Talk:
            return (
                <TalkSnippet
                    characterId={action.chara?.id || 0}
                    characterName={action.chara?.name || "???"}
                    text={action.body || ""}
                    voiceUrl={action.voice}
                    cnText={action.cnBody}
                    cnDisplayName={action.cnDisplayName}
                    translatedText={action.translatedBody}
                    translatedDisplayName={action.translatedDisplayName}
                    translationSource={action.translationSource}
                    unitName={action.chara?.unitName}
                    unitField={action.chara?.unitField}
                    active={active}
                    progress={playbackProgress}
                />
            );

        case SnippetAction.SpecialEffect:
            return (
                <SpecialEffectSnippet
                    seType={action.seType || ""}
                    text={action.body}
                    resource={action.resource}
                    active={active}
                />
            );

        case SnippetAction.Sound:
            return (
                <SoundSnippet
                    hasBgm={action.hasBgm || false}
                    hasSe={action.hasSe || false}
                    audioUrl={action.hasBgm ? action.bgm : action.se}
                />
            );

        default:
            return null;
    }
}

export default StorySnippet;
