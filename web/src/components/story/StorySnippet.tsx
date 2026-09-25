"use client";
import { useState } from "react";
import Image from "next/image";
import { IProcessedAction, SnippetAction } from "@/types/story";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { UNIT_FIELD_TO_ID, UNIT_ICON_FILES } from "@/types/types";

interface TalkSnippetProps {
    characterId: number;
    characterName: string;
    text: string;
    voiceUrl?: string;
    cnText?: string;
    cnDisplayName?: string;
    translatedText?: string;
    translatedDisplayName?: string;
    translationSource?: 'official_cn' | 'llm' | 'human';
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
            className={`ios-glass-card rounded-xl p-4 my-3 relative border-none shadow-sm overflow-hidden transition-all duration-300 ${
                active 
                    ? "ring-2 ring-miku shadow-[0_0_20px_rgba(51,204,187,0.3)] scale-[1.01] z-10" 
                    : ""
            }`}
        >
            {/* Smooth linear frosted brand progress bar */}
            {active && (
                <div 
                    className="absolute top-0 left-0 h-[3px] bg-gradient-to-r from-miku to-cyan-400 transition-all duration-100 shadow-[0_0_8px_var(--color-miku)]" 
                    style={{ width: `${progress}%` }} 
                />
            )}
            <div className="flex items-start gap-3">
                {/* Character Avatar */}
                <div className="shrink-0 relative">
                    {iconUrl ? (
                        <>
                            <img
                                src={iconUrl}
                                alt={characterName}
                                className="w-12 h-12 rounded-full object-cover bg-slate-100 dark:bg-slate-700 border-2 border-miku/30"
                            />
                            {badgeIcon && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center">
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
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center border-2 border-slate-300 dark:border-slate-600">
                            <span className="text-white text-sm font-bold">
                                {characterName.charAt(0)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Character Name Badge */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="inline-block px-2.5 py-0.5 bg-miku/10 text-miku text-sm font-medium rounded-full border border-miku/20">
                            {characterName}
                        </span>
                        {showTranslatedDisplayName && (
                            <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-full border border-slate-200 dark:border-slate-600">
                                {displayNameTranslation}
                            </span>
                        )}
                    </div>

                    {/* Dialogue Text */}
                    <p className="text-primary-text text-base leading-relaxed whitespace-pre-wrap">
                        {text}
                    </p>

                    {/* CN Translation */}
                    {showTranslatedText && (
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed whitespace-pre-wrap mt-1.5 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
                            {displayTranslation}
                        </p>
                    )}
                </div>

                {/* Voice Button */}
                {voiceUrl && (
                    <AudioPlayButton url={voiceUrl} />
                )}
            </div>
        </div>
    );
}

interface SpecialEffectSnippetProps {
    seType: string;
    text?: string;
    resource?: string;
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

export function SpecialEffectSnippet({ seType, text, resource }: SpecialEffectSnippetProps) {
    const [isImageOpen, setIsImageOpen] = useState(false);
    const { t } = useI18n();

    switch (seType) {
        case "FullScreenText":
            return (
                <div className="ios-glass-panel rounded-2xl p-6 my-4 shadow-xl border border-purple-500/30 dark:border-purple-500/20 relative overflow-hidden backdrop-blur-3xl bg-slate-950/75 dark:bg-slate-950/85">
                    {/* Decorative glow */}
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex items-center gap-2 mb-3 relative z-10">
                        <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs font-semibold rounded-full border border-purple-500/30 tracking-wider shadow-sm">
                            {t("page.story.snippet.fullScreenText")}
                        </span>
                    </div>
                    <p className="text-white text-lg sm:text-xl font-light leading-relaxed text-center whitespace-pre-wrap my-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] relative z-10">
                        {text?.trimStart()}
                    </p>
                    {resource && (
                        <div className="flex justify-center mt-3 relative z-10">
                            <AudioPlayButton url={resource} className="shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30" />
                        </div>
                    )}
                </div>
            );

        case "Telop":
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-amber-500/30 dark:border-amber-500/20 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/40 relative overflow-hidden">
                    {/* Subtle warm decorative glow */}
                    <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-center gap-2 mb-2 relative z-10">
                        <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-300 text-xs font-semibold rounded-full border border-amber-500/30 tracking-wider shadow-sm">
                            {t("page.story.snippet.telop")}
                        </span>
                    </div>
                    <p className="text-amber-900 dark:text-amber-100 text-base leading-relaxed text-center font-medium whitespace-pre-wrap relative z-10">
                        {text?.trimStart()}
                    </p>
                </div>
            );

        case "PlaceInfo":
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-blue-500/30 dark:border-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full">
                            {t("page.story.snippet.placeInfo")}
                        </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed font-medium">
                        {t("page.story.snippet.placeText", { place: text })}
                    </p>
                </div>
            );

        case "ChangeBackground":
            //case "ChangeBackgroundStill":
            const isCg = isCgImage(text || '');
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">
                            {isCg ? t("page.story.snippet.cgInsert") : t("page.story.snippet.backgroundChange")}
                        </span>
                    </div>

                    {isImageOpen && resource ? (
                        <div
                            className="cursor-pointer overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
                            onClick={() => window.open(resource, "_blank")}
                        >
                            <img
                                src={resource}
                                alt="Background"
                                className="w-full rounded-lg hover:scale-[1.02] transition-transform duration-500"
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsImageOpen(true)}
                            className="ios-glass-btn px-4 py-2 text-sm font-medium rounded-lg text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                            {isCg ? t("page.story.snippet.showCg") : t("page.story.snippet.showBackground")}
                        </button>
                    )}
                </div>
            );

        case "FlashbackIn":
            return (
                <div className="ios-glass-card rounded-xl p-3 my-3 border border-yellow-500/30 dark:border-yellow-500/20 bg-yellow-500/10">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
                            {t("page.story.snippet.flashbackIn")}
                        </span>
                    </div>
                </div>
            );

        case "FlashbackOut":
            return (
                <div className="ios-glass-card rounded-xl p-3 my-3 border border-yellow-500/30 dark:border-yellow-500/20 bg-yellow-500/10">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
                            {t("page.story.snippet.flashbackOut")}
                        </span>
                    </div>
                </div>
            );

        case "BlackOut":
            return (
                <div className="ios-glass-card rounded-xl p-3 my-3 border border-slate-600/30 bg-black/40">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-slate-600/30 text-slate-300 text-xs font-medium rounded-full">
                            {t("page.story.snippet.blackOut")}
                        </span>
                    </div>
                </div>
            );

        case "WhiteOut":
            return (
                <div className="ios-glass-card rounded-xl p-3 my-3 border border-white/30 bg-white/40">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-white/30 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full">
                            {t("page.story.snippet.whiteOut")}
                        </span>
                    </div>
                </div>
            );

        case "SimpleSelectable":
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-500/10">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-full">
                            {t("page.story.snippet.choice")}
                        </span>
                    </div>
                    <p className="text-indigo-800 dark:text-indigo-200 text-base leading-relaxed text-center font-medium whitespace-pre-wrap">
                        {text?.trimStart()}
                    </p>
                </div>
            );

        case "Movie":
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-red-500/30 dark:border-red-500/20 bg-red-950/20">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                            {t("page.story.snippet.movie")}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">{text}</span>
                    </div>
                </div>
            );

        case "PlayMV":
            // resource format: "id:name" or just "id"
            const mvParts = resource?.split(':') || [];
            const mvId = mvParts[0] || '';
            const mvName = mvParts[1] || '';
            
            return (
                <div className="ios-glass-card rounded-xl p-4 my-3 border border-purple-500/30 dark:border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-semibold rounded-full border border-purple-500/20">
                                {t("page.story.snippet.playMv")}
                            </span>
                        </div>
                        {mvName ? (
                            <p className="text-purple-700 dark:text-purple-300 text-base font-semibold">{mvName}</p>
                        ) : (
                            <p className="text-purple-600 dark:text-purple-400 text-sm font-medium">MV ID: {mvId}</p>
                        )}
                    </div>
                </div>
            );

        default:
            return null;
    }
}

interface SoundSnippetProps {
    hasBgm: boolean;
    hasSe: boolean;
    audioUrl?: string;
}

export function SoundSnippet({ hasBgm, hasSe, audioUrl }: SoundSnippetProps) {
    const isNoSound = audioUrl?.endsWith("bgm00000.mp3");
    const { t } = useI18n();

    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 my-2 border border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${hasBgm
                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                    : "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                    }`}>
                    {hasBgm ? "BGM" : hasSe ? "SE" : t("page.story.snippet.soundEffect")}
                </span>

                {isNoSound ? (
                    <span className="text-slate-400 text-sm">{t("page.story.snippet.silent")}</span>
                ) : audioUrl ? (
                    <AudioPlayButton url={audioUrl} />
                ) : null}
            </div>
        </div>
    );
}

// Simple audio play button component
interface AudioPlayButtonProps {
    url: string;
    className?: string;
}

function AudioPlayButton({ url, className = "" }: AudioPlayButtonProps) {
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
        <button
            onClick={handlePlay}
            className={`p-2 rounded-full transition-colors ${isPlaying
                ? "bg-miku/20 text-miku"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-miku/10 hover:text-miku"
                } ${className}`}
            title={isPlaying ? t("page.story.snippet.stopAudio") : t("page.story.snippet.playAudio")}
        >
            {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
            ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
            )}
        </button>
    );
}

// Main snippet renderer
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
