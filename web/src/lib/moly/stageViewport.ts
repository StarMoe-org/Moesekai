/** The iframe keeps its pre-fullscreen composition; only its display box grows. */
export function stageAspectRatio(width: number, height: number): number {
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? width / height
        : 16 / 9;
}

export function rememberStageAspect(stage: HTMLElement): () => void {
    const property = "--moly-stage-aspect";
    const previous = stage.style.getPropertyValue(property);
    const priority = stage.style.getPropertyPriority(property);
    // The surface may have borders; measure the actual renderer box first so
    // preserving aspect does not include those extra CSS pixels.
    const surface = stage.querySelector<HTMLElement>(".interaction-runtime")
        ?? stage.querySelector<HTMLElement>(".interaction-stage-surface");
    const bounds = surface?.getBoundingClientRect();
    stage.style.setProperty(property, String(stageAspectRatio(bounds?.width ?? 0, bounds?.height ?? 0)));
    return () => {
        if (previous) stage.style.setProperty(property, previous, priority);
        else stage.style.removeProperty(property);
    };
}
