"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { Button, IconButton, LinearProgress, LoadingIndicator, cn } from "@/components/md3";
import { mdFullscreen, mdFullscreenExit, mdRemove, mdAdd } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { IDENTITY_VIEW, MAX_ZOOM, isIdentityView, panBy, toNdc, zoomAbout, type Live2DView } from "@/lib/live2dViewer/view";
import type { Live2DViewerPhase } from "./useLive2DViewer";

/** The StarMoe wordmark as a mask, filled with the element's background colour. */
const STARMOE_MARK = {
    maskImage: "url(/starmoe.svg)",
    maskSize: "contain",
    maskPosition: "left center",
    maskRepeat: "no-repeat",
    WebkitMaskImage: "url(/starmoe.svg)",
    WebkitMaskSize: "contain",
    WebkitMaskPosition: "left center",
    WebkitMaskRepeat: "no-repeat",
} as const;

const subscribeNever = () => () => {};

interface Live2DModelStageProps {
    phase: Live2DViewerPhase;
    /** Where the viewer's canvas goes. */
    hostRef: RefObject<HTMLDivElement | null>;
    view: Live2DView;
    setView: Dispatch<SetStateAction<Live2DView>>;
    /** A story background shown behind the model (its URL), or none. */
    background: string | null;
    onRetry: () => void;
    /** What to show over an empty stage (no model chosen). */
    empty?: ReactNode;
}

/**
 * The stage of the Live2D viewer: the model's canvas over a story background or the surface
 * colours, zoom and pan by wheel, drag and pinch (a double click resets), a zoom capsule and a
 * full screen button, and what the viewer is doing (loading, not supported, failed).
 */
export function Live2DModelStage({ phase, hostRef, view, setView, background, onRetry, empty }: Live2DModelStageProps) {
    const { t } = useI18n();
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const canFullscreen = useSyncExternalStore(subscribeNever, () => Boolean(document.fullscreenEnabled), () => false);
    const ready = phase.kind === "ready";

    useLive2DGestures(hostRef, ready, setView);

    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
        const frame = frameRef.current;
        if (!frame) return;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void frame.requestFullscreen().catch(() => {});
    }, []);

    return (
        <div
            ref={frameRef}
            role="region"
            aria-label={t("page.live2d.stage")}
            className={cn(
                "relative w-full overflow-hidden bg-linear-to-b from-surface-container-highest to-surface-container-low",
                fullscreen ? "h-screen" : "aspect-[3/4] max-h-[80vh] rounded-md3-xl @lg:aspect-square",
            )}
        >
            {background && (
                <img src={background} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-cover" />
            )}
            <div ref={hostRef} className="absolute inset-0" />

            <div
                aria-hidden
                className="pointer-events-none absolute left-4 top-3 z-10 h-5 w-24 bg-on-surface/70 select-none sm:h-6 sm:w-28"
                style={STARMOE_MARK}
            />

            {canFullscreen && ready && (
                <div className="absolute right-3 top-3 z-20">
                    <IconButton
                        icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                        label={t(fullscreen ? "page.live2d.exitFullscreen" : "page.live2d.fullscreen")}
                        onClick={toggleFullscreen}
                        className="glass"
                    />
                </div>
            )}

            {ready && (
                <div className="glass absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-full p-1">
                    <IconButton
                        icon={mdRemove}
                        size="xs"
                        label={t("page.live2d.zoomOut")}
                        disabled={view.zoom <= 1}
                        onClick={() => setView(current => zoomAbout(current, 1 / 1.25, 0, 0))}
                    />
                    <Button
                        variant="text"
                        size="xs"
                        onClick={() => setView(IDENTITY_VIEW)}
                        disabled={isIdentityView(view)}
                        aria-label={t("page.live2d.zoomReset")}
                        className="min-w-14 font-mono"
                    >
                        {Math.round(view.zoom * 100)}%
                    </Button>
                    <IconButton
                        icon={mdAdd}
                        size="xs"
                        label={t("page.live2d.zoomIn")}
                        disabled={view.zoom >= MAX_ZOOM}
                        onClick={() => setView(current => zoomAbout(current, 1.25, 0, 0))}
                    />
                </div>
            )}

            {phase.kind === "idle" && empty && <StageMessage>{empty}</StageMessage>}

            {phase.kind === "loading" && (
                <StageMessage>
                    <div className="flex w-64 max-w-full flex-col items-center gap-3 rounded-md3-lg bg-surface-container-high px-5 py-4 text-on-surface shadow-elev-2">
                        <LoadingIndicator size={40} aria-label={t("page.live2d.loading")} />
                        <p className="type-label-l">{t("page.live2d.loading")}</p>
                        {phase.total > 0 && (
                            <>
                                <LinearProgress value={phase.loaded / phase.total} className="w-full" aria-label={t("page.live2d.loading")} />
                                <p className="font-mono type-label-s text-on-surface-variant">
                                    {t("page.live2d.loadingFiles", { loaded: phase.loaded, total: phase.total })}
                                </p>
                            </>
                        )}
                    </div>
                </StageMessage>
            )}

            {(phase.kind === "unsupported" || phase.kind === "failed" || phase.kind === "unavailable") && (
                <StageMessage>
                    <div className="flex max-w-md flex-col items-center gap-2 rounded-md3-lg bg-surface-container-high px-5 py-4 text-center text-on-surface shadow-elev-2">
                        <p className="type-title-m">
                            {t(phase.kind === "unsupported" ? "page.live2d.unsupportedTitle"
                                : phase.kind === "unavailable" ? "page.live2d.unavailableTitle"
                                : phase.error === "not-found" ? "page.live2d.notFoundTitle" : "page.live2d.failedTitle")}
                        </p>
                        <p className="type-body-s text-on-surface-variant">
                            {t(phase.kind === "unsupported" ? "page.live2d.unsupportedDescription"
                                : phase.kind === "unavailable" ? "page.live2d.unavailableDescription"
                                : phase.error === "not-found" ? "page.live2d.notFoundDescription"
                                : phase.error === "network" ? "page.live2d.networkDescription" : "page.live2d.failedDescription")}
                        </p>
                        {phase.kind === "unsupported" && phase.missing.length > 0 && (
                            <p className="font-mono type-label-s text-on-surface-variant">{phase.missing.join(", ")}</p>
                        )}
                        {phase.kind === "failed" && phase.error !== "not-found" && (
                            <>
                                <p className="max-w-full break-all font-mono type-label-s text-on-surface-variant">{phase.url ?? phase.message}</p>
                                <Button variant="tonal" onClick={onRetry}>{t("common.action.retry")}</Button>
                            </>
                        )}
                    </div>
                </StageMessage>
            )}
        </div>
    );
}

function StageMessage({ children }: { children: ReactNode }) {
    return <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">{children}</div>;
}

/**
 * Zoom and pan on the stage: the wheel zooms about the cursor, a drag pans once zoomed in, two
 * fingers pinch and pan, a double click or double tap resets. Before zooming in, one finger still
 * scrolls the page (touch-action pan-y).
 */
function useLive2DGestures(hostRef: RefObject<HTMLDivElement | null>, enabled: boolean, setView: Dispatch<SetStateAction<Live2DView>>) {
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !enabled) return;
        const pointers = new Map<number, { x: number; y: number }>();
        let pinch: { distance: number; x: number; y: number } | null = null;
        let zoomed = false;
        let lastTap = 0;
        const track = (next: Live2DView) => {
            zoomed = next.zoom > 1;
            host.style.touchAction = zoomed ? "none" : "pan-y";
            host.style.cursor = zoomed ? "grab" : "";
            return next;
        };
        const update = (change: (current: Live2DView) => Live2DView) => setView(current => track(change(current)));
        host.style.touchAction = "pan-y";

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const [px, py] = toNdc(event.clientX, event.clientY, host.getBoundingClientRect());
            // a notch of a mouse wheel (about 100 px) zooms about 1.2×; trackpads send many small deltas
            const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0018));
            update(current => zoomAbout(current, factor, px, py));
        };
        const midpoint = () => {
            const [a, b] = [...pointers.values()];
            return a && b ? { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
        };
        const onDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) pinch = midpoint();
            if (pointers.size === 1 && event.pointerType !== "mouse") {
                const now = performance.now();
                if (now - lastTap < 300) update(() => IDENTITY_VIEW);
                lastTap = now;
            }
            if (zoomed || pointers.size === 2) host.setPointerCapture(event.pointerId);
        };
        const onMove = (event: PointerEvent) => {
            const previous = pointers.get(event.pointerId);
            if (!previous) return;
            const rect = host.getBoundingClientRect();
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size >= 2 && pinch) {
                const next = midpoint();
                if (!next || pinch.distance <= 0) return;
                const factor = next.distance / pinch.distance;
                const [px, py] = toNdc(next.x, next.y, rect);
                const moved = { x: next.x - pinch.x, y: next.y - pinch.y };
                update(current => zoomAbout(panBy(current, moved.x, moved.y, rect.width, rect.height), factor, px, py));
                pinch = next;
                event.preventDefault();
            } else if (zoomed && pointers.size === 1) {
                update(current => panBy(current, event.clientX - previous.x, event.clientY - previous.y, rect.width, rect.height));
                host.style.cursor = "grabbing";
                event.preventDefault();
            }
        };
        const onUp = (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) pinch = null;
            if (zoomed) host.style.cursor = "grab";
        };
        const onDoubleClick = () => update(() => IDENTITY_VIEW);

        host.addEventListener("wheel", onWheel, { passive: false });
        host.addEventListener("pointerdown", onDown);
        host.addEventListener("pointermove", onMove);
        host.addEventListener("pointerup", onUp);
        host.addEventListener("pointercancel", onUp);
        host.addEventListener("dblclick", onDoubleClick);
        return () => {
            host.removeEventListener("wheel", onWheel);
            host.removeEventListener("pointerdown", onDown);
            host.removeEventListener("pointermove", onMove);
            host.removeEventListener("pointerup", onUp);
            host.removeEventListener("pointercancel", onUp);
            host.removeEventListener("dblclick", onDoubleClick);
            host.style.touchAction = "";
            host.style.cursor = "";
        };
    }, [hostRef, enabled, setView]);
}
