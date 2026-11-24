/**
 * Registers one-shot window pointerend listeners so a touch-pressed card preview
 * always resets even if the pointer leaves the card or the gesture is cancelled.
 */
export function registerTouchEndCleanup(
    cleanupRef: { current: (() => void) | null },
    onEnd: () => void,
): void {
    cleanupRef.current?.();
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
    cleanupRef.current = () => {
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
    };
}
