/**
 * Zoom and pan of the model on the viewer's stage, in the viewer's terms (`setView`): a zoom of
 * at least 1 and an offset in normalized device coordinates, `ndc' = zoom · ndc + (x, y)`. The
 * viewer applies it to its camera, so the model stays sharp at any zoom.
 */
export interface Live2DView {
    zoom: number;
    /** Offset in normalized device coordinates (-1..1 across the stage, y up). */
    x: number;
    y: number;
}

export const IDENTITY_VIEW: Live2DView = { zoom: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

/** A view kept in range: the zoom within [MIN_ZOOM, MAX_ZOOM], the offset leaving part of the model on the stage. */
export function clampView(view: Live2DView): Live2DView {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
    const limit = zoom - 1 + (zoom > 1 ? 0.25 : 0);
    // `+ 0` turns -0 into 0, so a clamped view equals the identity view
    const clamp = (value: number) => Math.min(limit, Math.max(-limit, value)) + 0;
    return { zoom, x: clamp(view.x), y: clamp(view.y) };
}

/** The view after zooming by `factor` about a stage point in normalized device coordinates (it stays under the cursor). */
export function zoomAbout(view: Live2DView, factor: number, px: number, py: number): Live2DView {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    // the model point under (px, py): p = zoom · q + offset
    const qx = (px - view.x) / view.zoom;
    const qy = (py - view.y) / view.zoom;
    return clampView({ zoom, x: px - zoom * qx, y: py - zoom * qy });
}

/** The view moved by a drag of (dx, dy) CSS pixels on a stage of `width` × `height`. */
export function panBy(view: Live2DView, dx: number, dy: number, width: number, height: number): Live2DView {
    return clampView({ ...view, x: view.x + (dx / width) * 2, y: view.y - (dy / height) * 2 });
}

/** A stage point in CSS pixels as normalized device coordinates (y up). */
export function toNdc(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number] {
    return [((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2];
}

export function isIdentityView(view: Live2DView): boolean {
    return view.zoom === 1 && view.x === 0 && view.y === 0;
}
