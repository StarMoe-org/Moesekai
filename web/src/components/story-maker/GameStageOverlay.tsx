"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import type { StoryStageState } from "@/lib/storyMaker/state";
import {
    choiceButtonRects,
    DEFAULT_CHOICE_LAYOUT,
    GAME_CANVAS,
    GAME_COLORS,
    GAME_FONTS,
    GAME_LAYOUT,
    type GameRect,
    type StoryUiKit,
} from "@/lib/storyMaker/uiKit";
import "@/styles/story-game-ui.css";
import type { StoryStepOf } from "@/types/storyMaker";

export interface GameStageOverlayProps {
    state: StoryStageState;
    kit: StoryUiKit | null;
    /** Dialogue text typed so far (falls back to full `state.dialogue.body`). */
    dialogueText?: string;
    /** Player AUTO mode active: renders the in-game `AutoSignal` pill in `TalkWindow`. */
    autoPlay?: boolean;
    /** Manual mode page-forward indicator (`EndSign`) visible when waiting for tap. */
    showEndSign?: boolean;
    /** Active choice step to render via `AnswerChoiceDialog` (interactive in player, preview in editor). */
    choice?: StoryStepOf<"choice"> | null;
    /** Whether choice buttons can be clicked (true in player, false in editor preview). */
    choiceInteractive?: boolean;
    /** Called after brief tap feedback when the player chooses an option. */
    onChoose?: (optionId: string, optionText: string) => void;
    /** Called with `kit.decideSoundUrl` when a choice button is pressed. */
    onChoiceSound?: (url: string) => void;
    /** Renders the top-right circular `UIPartsMenuButton`. */
    showMenuButton?: boolean;
    /** Whether the in-game quick menu is currently open (for aria-expanded). */
    menuOpen?: boolean;
    /** Clicking the top-right `UIPartsMenuButton` (omit for decorative editor preview). */
    onMenuClick?: () => void;
    /** Animate cinemascope entrance (player mode); instant in editor scrubbing. */
    animateCinemascope?: boolean;
}

interface StageTransform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

function rectStyle([x, y, w, h]: GameRect): CSSProperties {
    return {
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
    };
}

/** Approximates CJK-equivalent width units so Unity TMP auto-sizing is preserved across locales. */
function weightedUnits(text: string): number {
    let total = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        total += code > 0x2e7f ? 1.0 : 0.56;
    }
    return total;
}

function placeFontSize(text: string): number {
    const units = weightedUnits(text.trim());
    if (units <= 12.5) return GAME_LAYOUT.placeInfo.fontSize;
    return Math.max(24, Math.round((GAME_LAYOUT.placeInfo.fontSize * 12.5) / units));
}

function telopFontSize(text: string): number {
    const units = weightedUnits(text.trim());
    if (units <= 18.5) return GAME_LAYOUT.telop.fontSize;
    return Math.max(28, Math.round((GAME_LAYOUT.telop.fontSize * 18.5) / units));
}

function estimateVisualLines(text: string, boxWidth: number, fontSize: number): number {
    const unitsPerLine = Math.max(1, boxWidth / fontSize);
    let visualLines = 0;
    for (const line of text.split("\n")) {
        visualLines += Math.max(1, Math.ceil(weightedUnits(line) / unitsPerLine));
    }
    return visualLines;
}

/**
 * Mirrors Unity TMP auto-sizing on `TalkWindow/Words` (`sse-render/src/lib.rs:1302-1311`):
 * 44px with 52px line height for 1-3 lines, stepping down smoothly to 22px for longer dialogue.
 */
function wordsTypography(text: string): { fontSize: number; lineHeight: string } {
    const boxWidth = GAME_LAYOUT.talk.words[2];
    const candidates: readonly { fontSize: number; lineHeight: number; maxLines: number }[] = [
        { fontSize: GAME_LAYOUT.talk.wordsFontSize, lineHeight: 52, maxLines: 3 },
        { fontSize: 36, lineHeight: 42, maxLines: 4 },
        { fontSize: 30, lineHeight: 35, maxLines: 5 },
        { fontSize: 26, lineHeight: 30, maxLines: 6 },
    ];
    for (const candidate of candidates) {
        if (estimateVisualLines(text, boxWidth, candidate.fontSize) <= candidate.maxLines) {
            return { fontSize: candidate.fontSize, lineHeight: `${candidate.lineHeight}px` };
        }
    }
    return { fontSize: GAME_LAYOUT.talk.wordsMinFontSize, lineHeight: "26px" };
}

/**
 * Mirrors `ScenarioFullScreenTextDialog/Text` (`sse-render/src/lib.rs:1395-1415`):
 * 56px default, stepping down to 40px if a very long narration would overflow the 600px frame.
 */
function narrationTypography(text: string): { fontSize: number; lineHeight: number } {
    const boxWidth = GAME_LAYOUT.fullScreenText.centeredText[2];
    const candidates: readonly { fontSize: number; lineHeight: number; maxLines: number }[] = [
        { fontSize: GAME_LAYOUT.fullScreenText.fontSize, lineHeight: 1.55, maxLines: 6 },
        { fontSize: 48, lineHeight: 1.48, maxLines: 8 },
        { fontSize: 44, lineHeight: 1.45, maxLines: 9 },
    ];
    for (const candidate of candidates) {
        if (estimateVisualLines(text, boxWidth, candidate.fontSize) <= candidate.maxLines) {
            return { fontSize: candidate.fontSize, lineHeight: candidate.lineHeight };
        }
    }
    return { fontSize: 40, lineHeight: 1.4 };
}

function choiceFontSize(text: string): number {
    const units = weightedUnits(text.trim());
    if (units <= 14) return GAME_LAYOUT.choice.fontSize;
    return Math.max(22, Math.round((GAME_LAYOUT.choice.fontSize * 14) / units));
}

function measureStage(el: HTMLElement): StageTransform {
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0) return { scale: 0, offsetX: 0, offsetY: 0 };
    if (h <= 0) return { scale: w / GAME_CANVAS.width, offsetX: 0, offsetY: 0 };
    const scaleX = w / GAME_CANVAS.width;
    const scaleY = h / GAME_CANVAS.height;
    if (Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) < 0.015) {
        return { scale: scaleX, offsetX: 0, offsetY: 0 };
    }
    const scale = Math.min(scaleX, scaleY);
    return {
        scale,
        offsetX: (w - GAME_CANVAS.width * scale) * 0.5,
        offsetY: (h - GAME_CANVAS.height * scale) * 0.5,
    };
}

/** Mint-green glowing downward chevron fallback matching `icon_pageForward_gn.png`. */
function EndSignFallbackSvg() {
    return (
        <svg viewBox="0 0 50 44" width={50} height={44} aria-hidden="true" style={{ display: "block" }}>
            <defs>
                <linearGradient id="sekai-end-sign-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#88ffee" />
                    <stop offset="55%" stopColor="#33ddbb" />
                    <stop offset="100%" stopColor="#12b89a" />
                </linearGradient>
            </defs>
            <path
                d="M9 10.5C7.6 8.3 9.2 5.5 11.8 5.5H38.2C40.8 5.5 42.4 8.3 41 10.5L27.8 34.8C26.5 37.1 23.5 37.1 22.2 34.8L9 10.5Z"
                fill="url(#sekai-end-sign-grad)"
                stroke="#d6fff8"
                strokeWidth="2.5"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** White rotated play-triangle fallback matching `icon_triangle_h22_wh.png` rotated +90 deg. */
function AutoIconFallbackSvg() {
    return (
        <svg viewBox="0 0 22 28" width={22} height={28} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
            <polygon points="3,4 20,14 3,24" fill="#ffffff" />
        </svg>
    );
}

/** Three-dot horizontal menu icon fallback matching `icon_menu_story_wh.png` tinted `#444466`. */
function MenuIconFallbackSvg() {
    return (
        <svg viewBox="0 0 52 12" width={52} height={12} aria-hidden="true" style={{ display: "block" }}>
            <circle cx="6.5" cy="6" r="5.5" fill="#444466" />
            <circle cx="26" cy="6" r="5.5" fill="#444466" />
            <circle cx="45.5" cy="6" r="5.5" fill="#444466" />
        </svg>
    );
}

/**
 * Pixel-faithful Project SEKAI in-game scenario UI overlay rendered inside a virtual 1920x1080
 * coordinate space and scaled uniformly to fit any 16:9 stage viewport.
 *
 * Uses authentic sprites extracted via `sse-web`'s `kit-worker.js` when loaded, with matching
 * CSS/SVG fallbacks derived from `sse-render/src/native_ui.rs`.
 */
export function GameStageOverlay({
    state,
    kit,
    dialogueText,
    autoPlay = false,
    showEndSign = false,
    choice = null,
    choiceInteractive = false,
    onChoose,
    onChoiceSound,
    showMenuButton = false,
    menuOpen = false,
    onMenuClick,
    animateCinemascope = false,
}: GameStageOverlayProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const wrapRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<StageTransform>({ scale: 0, offsetX: 0, offsetY: 0 });
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const pressTimerRef = useRef<number | null>(null);
    const activeChoiceId = choice?.id ?? null;

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const sync = () => setTransform(measureStage(el));
        sync();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", sync);
            return () => window.removeEventListener("resize", sync);
        }
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (pressTimerRef.current !== null) {
                window.clearTimeout(pressTimerRef.current);
                pressTimerRef.current = null;
            }
        };
    }, [activeChoiceId]);

    const activePressedPrefix = activeChoiceId ? `${activeChoiceId}:` : null;
    const isAnyChoicePressed = Boolean(activePressedPrefix && pressedKey?.startsWith(activePressedPrefix));

    const handleChoicePress = (choiceId: string, optionId: string, label: string) => {
        if (!choiceInteractive || !onChoose || isAnyChoicePressed) return;
        if (kit?.decideSoundUrl) {
            onChoiceSound?.(kit.decideSoundUrl);
        }
        if (reduced) {
            onChoose(optionId, label);
            return;
        }
        const key = `${choiceId}:${optionId}`;
        setPressedKey(key);
        pressTimerRef.current = window.setTimeout(() => {
            pressTimerRef.current = null;
            setPressedKey(null);
            onChoose(optionId, label);
        }, 180);
    };

    const effectiveDialogueBody = dialogueText ?? state.dialogue?.body ?? "";
    const wordsStyle = wordsTypography(state.dialogue?.body ?? effectiveDialogueBody);
    const narrationStyle = state.narration ? narrationTypography(state.narration.body) : null;
    const endSignRect: GameRect = [
        GAME_LAYOUT.talk.endSignPivot[0] - GAME_LAYOUT.talk.endSignSize[0] * 0.5,
        GAME_LAYOUT.talk.endSignPivot[1] - GAME_LAYOUT.talk.endSignSize[1],
        GAME_LAYOUT.talk.endSignSize[0],
        GAME_LAYOUT.talk.endSignSize[1],
    ];
    const nameRect = GAME_LAYOUT.talk.name;
    const wordsRect = GAME_LAYOUT.talk.words;
    const placeTextRect = GAME_LAYOUT.placeInfo.text;
    const choiceRects = choice
        ? choiceButtonRects(choice.options.length, kit?.choiceLayout ?? DEFAULT_CHOICE_LAYOUT, 1)
        : [];
    const autoSignalLabel = t("page.storyMaker.player.autoSignal");

    const menuIconRelative: CSSProperties = {
        position: "absolute",
        left: GAME_LAYOUT.menu.icon[0] - GAME_LAYOUT.menu.button[0],
        top: GAME_LAYOUT.menu.icon[1] - GAME_LAYOUT.menu.button[1],
        width: GAME_LAYOUT.menu.icon[2],
        height: GAME_LAYOUT.menu.icon[3],
        pointerEvents: "none",
    };

    return (
        <div
            ref={wrapRef}
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
            <div
                className="sekai-game-ui"
                style={{
                    transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
                    transformOrigin: "top left",
                    opacity: transform.scale > 0 ? 1 : 0,
                }}
            >
                {/* 1. PlaceInfo: persistent top-left location band */}
                {state.place && (
                    <div
                        key={state.place}
                        className={cn(!reduced && "sekai-game-ui-place-enter")}
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    >
                        <div
                            className="sekai-game-ui-place-band"
                            style={rectStyle(GAME_LAYOUT.placeInfo.fullSpan)}
                        />
                        <div
                            className="sekai-game-ui-place-text"
                            style={{
                                position: "absolute",
                                left: placeTextRect[0],
                                top: placeTextRect[1] - 4,
                                width: placeTextRect[2],
                                height: placeTextRect[3] + 8,
                                paddingBlock: 4,
                                boxSizing: "border-box",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-start",
                                fontFamily: GAME_FONTS.body,
                                fontWeight: GAME_FONTS.bodyWeight,
                                fontVariationSettings: `"wght" ${GAME_FONTS.bodyWeight}`,
                                fontSize: placeFontSize(state.place),
                                color: "#ffffff",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {state.place}
                        </div>
                    </div>
                )}

                {/* 2. ScenarioTelop: center scene caption band */}
                {state.telop && (
                    <div
                        key={`${state.telop.stepId}:${state.telop.body}`}
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    >
                        <div
                            className={cn(
                                "sekai-game-ui-telop-band",
                                !reduced && "sekai-game-ui-telop-band-show",
                            )}
                            style={rectStyle(GAME_LAYOUT.telop.band)}
                        />
                        <div
                            className={cn(
                                "sekai-game-ui-telop-text",
                                !reduced && "sekai-game-ui-telop-text-show",
                            )}
                            style={{
                                ...rectStyle(GAME_LAYOUT.telop.text),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                paddingInline: 96,
                                boxSizing: "border-box",
                                textAlign: "center",
                                fontFamily: GAME_FONTS.body,
                                fontWeight: GAME_FONTS.bodyWeight,
                                fontVariationSettings: `"wght" ${GAME_FONTS.bodyWeight}`,
                                fontSize: telopFontSize(state.telop.body),
                                color: "#ffffff",
                            }}
                        >
                            <span
                                style={{
                                    maxWidth: "100%",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {state.telop.body}
                            </span>
                        </div>
                    </div>
                )}

                {/* 3. TalkWindow: bottom dialogue box */}
                {state.dialogue && (
                    <div
                        className={cn(!reduced && "sekai-game-ui-talk-enter")}
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    >
                        {kit?.window ? (
                            <img
                                src={kit.window}
                                alt=""
                                draggable={false}
                                style={{
                                    ...rectStyle(GAME_LAYOUT.talk.window),
                                    maxWidth: "none",
                                    maxHeight: "none",
                                    objectFit: "fill",
                                    display: "block",
                                }}
                            />
                        ) : (
                            <div
                                className="sekai-game-ui-talk-window-fallback"
                                style={rectStyle(GAME_LAYOUT.talk.window)}
                            />
                        )}

                        {state.dialogue.speaker && (
                            <>
                                {kit?.nameBar ? (
                                    <img
                                        src={kit.nameBar}
                                        alt=""
                                        draggable={false}
                                        style={{
                                            ...rectStyle(GAME_LAYOUT.talk.nameBar),
                                            maxWidth: "none",
                                            maxHeight: "none",
                                            objectFit: "fill",
                                            display: "block",
                                        }}
                                    />
                                ) : (
                                    <div
                                        className="sekai-game-ui-name-bar-fallback"
                                        style={rectStyle(GAME_LAYOUT.talk.nameBar)}
                                    />
                                )}
                                <div
                                    className="sekai-game-ui-talk-name"
                                    style={{
                                        position: "absolute",
                                        left: nameRect[0] - 6,
                                        top: nameRect[1] - 8,
                                        width: nameRect[2] + 12,
                                        height: nameRect[3] + 16,
                                        padding: "8px 6px",
                                        boxSizing: "border-box",
                                        fontSize: GAME_LAYOUT.talk.nameFontSize,
                                        lineHeight: `${nameRect[3]}px`,
                                        color: GAME_COLORS.talkName,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {state.dialogue.speaker}
                                </div>
                            </>
                        )}

                        <div
                            className="sekai-game-ui-talk-words"
                            style={{
                                position: "absolute",
                                left: wordsRect[0] - 6,
                                top: wordsRect[1] - 6,
                                width: wordsRect[2] + 12,
                                height: 184,
                                padding: "6px",
                                boxSizing: "border-box",
                                fontSize: wordsStyle.fontSize,
                                lineHeight: wordsStyle.lineHeight,
                                color: GAME_COLORS.talkWords,
                                overflow: "hidden",
                            }}
                        >
                            {effectiveDialogueBody}
                        </div>

                        {showEndSign && (
                            <div
                                className="sekai-game-ui-end-sign"
                                style={rectStyle(endSignRect)}
                                aria-hidden="true"
                            >
                                {kit?.endSign ? (
                                    <img
                                        src={kit.endSign}
                                        alt=""
                                        draggable={false}
                                        style={{ width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", display: "block" }}
                                    />
                                ) : (
                                    <EndSignFallbackSvg />
                                )}
                            </div>
                        )}

                        {autoPlay && (
                            <div
                                style={{
                                    ...rectStyle(GAME_LAYOUT.talk.auto),
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: GAME_LAYOUT.talk.autoRowGap,
                                }}
                                aria-label={autoSignalLabel}
                            >
                                {kit?.autoBg ? (
                                    <img
                                        src={kit.autoBg}
                                        alt=""
                                        draggable={false}
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            width: "100%",
                                            height: "100%",
                                            maxWidth: "none",
                                            maxHeight: "none",
                                            objectFit: "fill",
                                            display: "block",
                                        }}
                                    />
                                ) : (
                                    <div
                                        className="sekai-game-ui-auto-bg-fallback"
                                        style={{ position: "absolute", inset: 0 }}
                                    />
                                )}
                                <div
                                    style={{
                                        position: "relative",
                                        zIndex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: GAME_LAYOUT.talk.autoRowGap,
                                    }}
                                >
                                    <span className="sekai-game-ui-auto-icon" style={{ display: "inline-flex" }}>
                                        {kit?.autoIcon ? (
                                            <img
                                                src={kit.autoIcon}
                                                alt=""
                                                draggable={false}
                                                style={{
                                                    width: GAME_LAYOUT.talk.autoIconSize[0],
                                                    height: GAME_LAYOUT.talk.autoIconSize[1],
                                                    maxWidth: "none",
                                                    maxHeight: "none",
                                                    display: "block",
                                                }}
                                            />
                                        ) : (
                                            <AutoIconFallbackSvg />
                                        )}
                                    </span>
                                    <span
                                        className="sekai-game-ui-auto-text"
                                        style={{ letterSpacing: "-2px" }}
                                    >
                                        {autoSignalLabel}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 4. ScenarioFullScreenTextDialog: Cinemascope bars + dimmed narration */}
                {state.narration && narrationStyle && (
                    <div
                        key={state.narration.stepId}
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    >
                        <motion.div
                            className="sekai-game-ui-fst-veil"
                            style={{ position: "absolute", inset: 0 }}
                            initial={animateCinemascope && !reduced ? { opacity: 0 } : false}
                            animate={{ opacity: 1 }}
                            transition={{ duration: animateCinemascope && !reduced ? 0.3 : 0 }}
                        />
                        <motion.div
                            className="sekai-game-ui-fst-bar"
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                width: GAME_CANVAS.width,
                                height: GAME_LAYOUT.fullScreenText.barHeight,
                                transformOrigin: "top center",
                            }}
                            initial={animateCinemascope && !reduced ? { scaleY: 0 } : false}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: animateCinemascope && !reduced ? 0.35 : 0, ease: "easeOut" }}
                        />
                        <motion.div
                            className="sekai-game-ui-fst-bar"
                            style={{
                                position: "absolute",
                                left: 0,
                                bottom: 0,
                                width: GAME_CANVAS.width,
                                height: GAME_LAYOUT.fullScreenText.barHeight,
                                transformOrigin: "bottom center",
                            }}
                            initial={animateCinemascope && !reduced ? { scaleY: 0 } : false}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: animateCinemascope && !reduced ? 0.35 : 0, ease: "easeOut" }}
                        />
                        <motion.div
                            className="sekai-game-ui-fst-text"
                            style={{
                                ...rectStyle(GAME_LAYOUT.fullScreenText.centeredText),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-start",
                                textAlign: "left",
                                fontSize: narrationStyle.fontSize,
                                lineHeight: narrationStyle.lineHeight,
                                color: "#ffffff",
                                overflow: "hidden",
                            }}
                            initial={animateCinemascope && !reduced ? { opacity: 0 } : false}
                            animate={{ opacity: 1 }}
                            transition={{ duration: animateCinemascope && !reduced ? 0.35 : 0, delay: animateCinemascope && !reduced ? 0.1 : 0 }}
                        >
                            {state.narration.body}
                        </motion.div>
                    </div>
                )}

                {/* 5. AnswerChoiceDialog: in-game rounded pill choices (interactive or editor preview) */}
                {choice && choice.options.length > 0 && (
                    <div
                        key={choice.id}
                        className={cn(!reduced && "sekai-game-ui-choice-enter")}
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: choiceInteractive ? "auto" : "none",
                        }}
                        onClick={choiceInteractive ? (event) => event.stopPropagation() : undefined}
                    >
                        {!choiceInteractive && (
                            <div
                                style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: 32,
                                    transform: "translateX(-50%)",
                                    padding: "8px 24px",
                                    borderRadius: 9999,
                                    backgroundColor: GAME_COLORS.band,
                                    color: "#ffffff",
                                    fontFamily: GAME_FONTS.name,
                                    fontWeight: GAME_FONTS.nameWeight,
                                    fontVariationSettings: `"wght" ${GAME_FONTS.nameWeight}`,
                                    fontSize: 24,
                                    lineHeight: 1.2,
                                    letterSpacing: "0.02em",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {t("page.storyMaker.player.choicePreview")}
                            </div>
                        )}
                        {choice.options.map((option, idx) => {
                            const rect = choiceRects[idx];
                            if (!rect) return null;
                            const label = option.text || t("page.storyMaker.player.emptyOption");
                            const optionKey = `${choice.id}:${option.id}`;
                            const isPressed = pressedKey === optionKey;
                            const isHighlighted = hoveredKey === optionKey || focusedKey === optionKey;
                            const fontSize = choiceFontSize(label);
                            const glowOutset = GAME_LAYOUT.choice.glowOutset;
                            const buttonBoxStyle: CSSProperties = {
                                ...rectStyle(rect),
                                pointerEvents: choiceInteractive ? "auto" : "none",
                            };

                            const inner = (
                                <>
                                    {kit?.answerBg ? (
                                        <img
                                            src={kit.answerBg}
                                            alt=""
                                            draggable={false}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                zIndex: 0,
                                                width: "100%",
                                                height: "100%",
                                                maxWidth: "none",
                                                maxHeight: "none",
                                                objectFit: "fill",
                                                pointerEvents: "none",
                                                opacity: isPressed ? 0.85 : 1,
                                                transition: "opacity 0.1s ease",
                                            }}
                                        />
                                    ) : (
                                        <span
                                            className="sekai-game-ui-choice-bg-fallback"
                                            aria-hidden="true"
                                            style={{ zIndex: 0, opacity: isPressed ? 0.85 : 1 }}
                                        />
                                    )}
                                    {kit?.answerGlow ? (
                                        <img
                                            src={kit.answerGlow}
                                            alt=""
                                            draggable={false}
                                            style={{
                                                position: "absolute",
                                                left: -glowOutset,
                                                top: -glowOutset,
                                                zIndex: 1,
                                                width: rect[2] + glowOutset * 2,
                                                height: rect[3] + glowOutset * 2,
                                                maxWidth: "none",
                                                maxHeight: "none",
                                                objectFit: "fill",
                                                pointerEvents: "none",
                                                opacity: isPressed ? 1 : isHighlighted ? 0.35 : 0,
                                                transition: "opacity 0.12s ease",
                                            }}
                                        />
                                    ) : (
                                        <span
                                            className="sekai-game-ui-choice-glow-fallback"
                                            aria-hidden="true"
                                            style={{ zIndex: 1 }}
                                        />
                                    )}
                                    <span
                                        className="sekai-game-ui-choice-label"
                                        style={{
                                            fontSize,
                                            paddingInline: GAME_LAYOUT.choice.textInset,
                                        }}
                                    >
                                        {label}
                                    </span>
                                </>
                            );

                            if (!choiceInteractive) {
                                return (
                                    <div
                                        key={option.id}
                                        role="presentation"
                                        className="sekai-game-ui-choice-button"
                                        style={buttonBoxStyle}
                                    >
                                        {inner}
                                    </div>
                                );
                            }

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    className="sekai-game-ui-choice-button"
                                    style={buttonBoxStyle}
                                    data-pressed={isPressed ? "true" : undefined}
                                    disabled={isAnyChoicePressed}
                                    onMouseEnter={() => setHoveredKey(optionKey)}
                                    onMouseLeave={() => setHoveredKey(curr => (curr === optionKey ? null : curr))}
                                    onFocus={() => setFocusedKey(optionKey)}
                                    onBlur={() => setFocusedKey(curr => (curr === optionKey ? null : curr))}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleChoicePress(choice.id, option.id, label);
                                    }}
                                >
                                    {inner}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 6. UIPartsMenuButton: top-right circular game menu button */}
                {showMenuButton && (
                    onMenuClick ? (
                        <button
                            type="button"
                            className="sekai-game-ui-menu-button"
                            style={rectStyle(GAME_LAYOUT.menu.button)}
                            aria-label={t(menuOpen ? "page.storyMaker.player.menuClose" : "page.storyMaker.player.menuOpen")}
                            aria-expanded={menuOpen}
                            onClick={(event) => {
                                event.stopPropagation();
                                onMenuClick();
                            }}
                        >
                            {kit?.menuBg ? (
                                <img
                                    src={kit.menuBg}
                                    alt=""
                                    draggable={false}
                                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", display: "block" }}
                                />
                            ) : (
                                <span className="sekai-game-ui-menu-bg-fallback" aria-hidden="true" />
                            )}
                            <span style={menuIconRelative} aria-hidden="true">
                                {kit?.menuIcon ? (
                                    <img
                                        src={kit.menuIcon}
                                        alt=""
                                        draggable={false}
                                        style={{ width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", display: "block" }}
                                    />
                                ) : (
                                    <MenuIconFallbackSvg />
                                )}
                            </span>
                        </button>
                    ) : (
                        <div
                            aria-hidden="true"
                            style={{
                                ...rectStyle(GAME_LAYOUT.menu.button),
                                pointerEvents: "none",
                                opacity: 0.72,
                            }}
                        >
                            {kit?.menuBg ? (
                                <img
                                    src={kit.menuBg}
                                    alt=""
                                    draggable={false}
                                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", display: "block" }}
                                />
                            ) : (
                                <span className="sekai-game-ui-menu-bg-fallback" aria-hidden="true" />
                            )}
                            <span style={menuIconRelative}>
                                {kit?.menuIcon ? (
                                    <img
                                        src={kit.menuIcon}
                                        alt=""
                                        draggable={false}
                                        style={{ width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", display: "block" }}
                                    />
                                ) : (
                                    <MenuIconFallbackSvg />
                                )}
                            </span>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
