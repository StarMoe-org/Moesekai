"use client";

import { useCallback, type RefCallback } from "react";

/** The rails' motion (see MainLayout): 400ms, M3 emphasized. */
const DURATION_MS = 400;
const emphasized = cubicBezier(0.2, 0, 0, 1);
/** Share of the time an item that changes rows spends leaving its old row, then arriving in the new one. */
const EXIT_SHARE = 0.3;
const ENTER_SHARE = 0.45;
/** Keyframes per item; the compositor interpolates linearly between them. */
const SAMPLES = 24;
/** Items this far outside the viewport just snap; nobody sees them move. */
const VIEWPORT_MARGIN_PX = 200;
/** Ancestor transitions that can change the grid's width. */
const LAYOUT_TRANSITION = /^(margin|padding|width|min-width|max-width|left|right|inset)/;
const ANIMATION_ID = "grid-reflow";

interface Slot {
    x: number;
    y: number;
    w: number;
    h: number;
    /** Row within its section, see `layoutOf`. Rows shift a few pixels as items resize, so compare this, not `y`. */
    row: number;
    /** Opacity; below 1 only for an item caught half-way through changing rows. */
    o: number;
}

/** A neighbor an item moves alongside, `k` places after it (negative: before it). */
interface Anchor {
    el: HTMLElement;
    k: number;
}

/**
 * An item changing rows leaves past one end of its old row and arrives past the other end of its
 * new one, alongside the row-mates that stay. A row with none staying (the last row emptying into
 * the one above) has no anchor on that side and goes the same way as the other side.
 */
interface Wrap {
    exit: Anchor | null;
    enter: Anchor | null;
}

/** What a running reflow is doing to one item, enough to pick it up again half-way. */
interface Moving {
    begin: Slot;
    end: Slot;
    wrap: Wrap | undefined;
}

interface Run {
    /** Time fraction, 0 to 1. */
    progress: () => number;
    /** The ancestor transitions the run follows; none when it keeps its own time. */
    transitions: CSSTransition[];
    from: Map<HTMLElement, Slot>;
    to: Map<HTMLElement, Slot>;
    gap: number;
    moving: Map<HTMLElement, Moving>;
    settleTimer: number;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
    const at = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (at(x1, x2, mid) < x) lo = mid;
            else hi = mid;
        }
        return at(y1, y2, (lo + hi) / 2);
    };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const endTimeOf = (animation: Animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0);

function itemsOf(grid: HTMLElement): HTMLElement[] {
    return Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function columnCount(grid: HTMLElement): number {
    return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
}

/**
 * Where layout puts each item, relative to the grid (its offset parent), ignoring transforms.
 * Rows are numbered within sections separated by full-width items (headings), so a section
 * gaining or losing a row doesn't make every later item look like it changed rows.
 */
function layoutOf(grid: HTMLElement, items: HTMLElement[]): Map<HTMLElement, Slot> {
    const spanning = grid.clientWidth * 0.75;
    const tops = new Map<number, boolean>();
    for (const el of items) tops.set(el.offsetTop, (tops.get(el.offsetTop) ?? false) || el.offsetWidth >= spanning);
    const rowOf = new Map<number, number>();
    let section = 0;
    let row = 0;
    for (const [top, isHeading] of [...tops].sort((a, b) => a[0] - b[0])) {
        if (isHeading) {
            section += 1;
            row = 0;
            rowOf.set(top, section * 1e6);
        } else {
            row += 1;
            rowOf.set(top, section * 1e6 + row);
        }
    }
    return new Map(items.map((el) => [el, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, row: rowOf.get(el.offsetTop) ?? 0, o: 1 }]));
}

/** For each item that changes rows, the row-mates it leaves alongside and arrives alongside. */
function planWraps(items: HTMLElement[], from: Map<HTMLElement, Slot>, to: Map<HTMLElement, Slot>): Map<HTMLElement, Wrap> {
    const moving = new Set(items.filter((el) => from.get(el)!.row !== to.get(el)!.row));
    const rowsOf = (slots: Map<HTMLElement, Slot>) => {
        const rows = new Map<number, HTMLElement[]>();
        for (const el of items) {
            const row = slots.get(el)!.row;
            rows.set(row, [...(rows.get(row) ?? []), el]);
        }
        return rows;
    };
    const oldRows = rowsOf(from);
    const newRows = rowsOf(to);

    const anchorIn = (row: HTMLElement[], el: HTMLElement): Anchor | null => {
        const staying = row.filter((item) => !moving.has(item));
        if (!staying.length) return null;
        const index = row.indexOf(el);
        const first = row.indexOf(staying[0]);
        if (index < first) return { el: staying[0], k: index - first };
        const last = row.indexOf(staying[staying.length - 1]);
        return { el: staying[staying.length - 1], k: index - last };
    };

    const wraps = new Map<HTMLElement, Wrap>();
    for (const el of moving) {
        const exit = anchorIn(oldRows.get(from.get(el)!.row)!, el);
        const enter = anchorIn(newRows.get(to.get(el)!.row)!, el);
        // Nothing stays on either side: the rows are all moving together, so travel as a block.
        if (exit || enter) wraps.set(el, { exit, enter });
    }
    return wraps;
}

/** Where an item is drawn, relative to the grid, a time fraction `t` into the reflow. */
function placeAt(t: number, start: Slot, end: Slot, wrap: Wrap | undefined, from: Map<HTMLElement, Slot>, to: Map<HTMLElement, Slot>, gap: number): Omit<Slot, "h" | "row"> {
    const p = emphasized(t);
    if (!wrap) return { x: lerp(start.x, end.x, p), y: lerp(start.y, end.y, p), w: lerp(start.w, end.w, p), o: lerp(start.o, 1, p) };

    // Past the end of the old row, keeping pace with the row-mates that stay there.
    const exitAnchor = wrap.exit && to.get(wrap.exit.el)!;
    const exitX = exitAnchor && exitAnchor.x + wrap.exit!.k * (exitAnchor.w + gap);
    // Past the other end of the new row, keeping pace with the row-mates already there.
    const enterAnchor = wrap.enter && from.get(wrap.enter.el)!;
    const enterX = enterAnchor && enterAnchor.x + wrap.enter!.k * (enterAnchor.w + gap);

    if (t < EXIT_SHARE) {
        return {
            x: lerp(start.x, exitX ?? start.x + (end.x - enterX!), p),
            y: lerp(start.y, exitAnchor?.y ?? start.y, p),
            w: lerp(start.w, exitAnchor?.w ?? end.w, p),
            o: start.o * (1 - t / EXIT_SHARE),
        };
    }
    return {
        x: lerp(enterX ?? end.x - (exitX! - start.x), end.x, p),
        y: lerp(enterAnchor?.y ?? end.y, end.y, p),
        w: lerp(enterAnchor?.w ?? start.w, end.w, p),
        o: clamp01((t - EXIT_SHARE) / ENTER_SHARE),
    };
}

/**
 * Animates an auto-fill grid whose column count changes, typically while a side pane opens or
 * collapses and the grid's width eases past one or more column boundaries, so its items reflow
 * like wrapping text instead of jumping to their new cells.
 *
 * Each row slides as a unit; an item that changes rows slides out past one end of its old row
 * and in past the other end of its new one, fading across the grid's edge. When the width
 * change comes from an ancestor's CSS transition, the grid goes straight to its final columns
 * and the reflow follows that transition, so it reads as one movement however many column
 * boundaries the width crosses. Other column changes (resizing the window) get the same reflow
 * on its own 400ms clock.
 *
 * With the columns locked the items' layout holds still, so each item's whole path is worked out
 * up front and handed to the compositor as keyframes: nothing runs on the main thread per frame.
 *
 * The grid must be the offset parent of its items (give it `relative`). Returns a callback ref,
 * so a grid that mounts later (after a loading skeleton) is picked up.
 */
export function useGridReflowAnimation<T extends HTMLElement>(): RefCallback<T> {
    return useCallback((grid: T | null) => {
        if (!grid || typeof ResizeObserver === "undefined") return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        let columns = columnCount(grid);
        let baseline = layoutOf(grid, itemsOf(grid));
        let run: Run | null = null;

        /** Drops the running reflow's animations, leaving the grid's column lock in place. */
        const halt = () => {
            if (!run) return;
            window.clearTimeout(run.settleTimer);
            for (const el of run.moving.keys()) {
                for (const animation of el.getAnimations()) if (animation.id === ANIMATION_ID) animation.cancel();
            }
            run = null;
        };

        const settle = () => {
            halt();
            grid.style.removeProperty("grid-template-columns");
            grid.style.removeProperty("overflow-x");
            grid.style.removeProperty("overflow-clip-margin");
            columns = columnCount(grid);
            baseline = layoutOf(grid, itemsOf(grid));
        };

        /**
         * What is on screen now, relative to the grid: the last measured layout, with the items a
         * running reflow moves placed where its keyframes have them. Worked out rather than read
         * back, so it costs no style or layout pass; call it before halting.
         */
        const onScreenNow = (): Map<HTMLElement, Slot> => {
            const items = itemsOf(grid);
            if (items.some((el) => !baseline.has(el))) baseline = layoutOf(grid, items);
            const slots = new Map(items.map((el) => [el, baseline.get(el)!]));
            if (!run) return slots;
            const t = clamp01(run.progress());
            for (const [el, { begin, end, wrap }] of run.moving) {
                if (!slots.has(el)) continue;
                const at = placeAt(t, begin, end, wrap, run.from, run.to, run.gap);
                const s = end.w ? at.w / end.w : 1;
                slots.set(el, { ...at, h: end.h * s, row: wrap && t >= EXIT_SHARE ? end.row : begin.row });
            }
            return slots;
        };

        /**
         * Moves from `from` (what is on screen) to the grid's current layout over `duration`,
         * `elapsed` of which has already gone by.
         */
        const start = (from: Map<HTMLElement, Slot>, duration: number, elapsed: number, progress: () => number, transitions: CSSTransition[]) => {
            const items = itemsOf(grid);
            const to = layoutOf(grid, items);
            const wraps = planWraps(items, from, to);
            const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;

            const gridTop = grid.getBoundingClientRect().top;
            const viewportBottom = window.innerHeight + VIEWPORT_MARGIN_PX;
            const onScreen = (y: number, h: number) => gridTop + y + h > -VIEWPORT_MARGIN_PX && gridTop + y < viewportBottom;

            // Everything is measured above; from here on only writes, so nothing forces a layout.
            // Items wrap out of and into view across the grid's sides.
            grid.style.overflowX = "clip";
            grid.style.setProperty("overflow-clip-margin", "8px");

            const moving = new Map<HTMLElement, Moving>();
            for (const el of items) {
                const begin = from.get(el)!;
                const end = to.get(el)!;
                const h = end.h;
                if (!onScreen(begin.y, h) && !onScreen(end.y, h)) continue;
                const wrap = wraps.get(el);
                if (!wrap && Math.abs(begin.x - end.x) < 0.5 && Math.abs(begin.y - end.y) < 0.5 && Math.abs(begin.w - end.w) < 0.5 && begin.o === 1) continue;

                const keyframes: Keyframe[] = [];
                for (let i = 0; i <= SAMPLES; i++) {
                    const t = i / SAMPLES;
                    const at = placeAt(t, begin, end, wrap, from, to, gap);
                    const s = end.w ? at.w / end.w : 1;
                    // Scaled about the item's center (no transform-origin to restyle), so shift the
                    // translation by what the scale moves the top-left corner.
                    const tx = at.x - end.x - ((1 - s) * end.w) / 2;
                    const ty = at.y - end.y - ((1 - s) * h) / 2;
                    keyframes.push({ offset: t, transform: `translate(${tx}px, ${ty}px) scale(${s})`, opacity: at.o });
                }
                const animation = el.animate(keyframes, { duration, easing: "linear" });
                animation.id = ANIMATION_ID;
                animation.currentTime = elapsed;
                moving.set(el, { begin, end, wrap });
            }

            // The keyframes are relative to this layout; a later change picks up from it.
            baseline = to;
            run = { progress, transitions, from, to, gap, moving, settleTimer: window.setTimeout(settle, Math.max(0, duration - elapsed) + 50) };
        };

        /**
         * The grid's columns once an ancestor's transitions end, by the window width and where the
         * transitions are heading. Toggling a pane back and forth reuses them instead of measuring
         * the end state again on every click.
         */
        const finalTracks = new Map<string, string>();

        // An ancestor starting to transition its width: jump its transitions to the end to see the
        // grid's final columns (nothing is painted in between; remembered in `finalTracks`), lock
        // them in, and follow along. Runs inside the frame the click starts, so it measures
        // layout once at most past the first time: everything else is worked out, not read.
        const onTransitionRun = (event: TransitionEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target === grid || !target.contains(grid)) return;
            if (!LAYOUT_TRANSITION.test(event.propertyName) || reducedMotion.matches) return;
            const transitions = target.getAnimations().filter(
                (animation): animation is CSSTransition => animation instanceof CSSTransition && LAYOUT_TRANSITION.test(animation.transitionProperty),
            );
            // Several properties starting together on one ancestor are one change, handled at the first.
            if (!transitions.length || (run && transitions.every((animation) => run!.transitions.includes(animation)))) return;

            const wasRunning = run !== null;
            const from = onScreenNow();
            halt();

            const key = `${window.innerWidth}|${transitions.map((animation) => JSON.stringify((animation.effect as KeyframeEffect | null)?.getKeyframes().at(-1))).join()}`;
            let tracks = finalTracks.get(key);
            if (!tracks) {
                grid.style.removeProperty("grid-template-columns");
                const times = transitions.map((animation) => animation.currentTime);
                for (const animation of transitions) animation.currentTime = endTimeOf(animation) - 0.5;
                tracks = getComputedStyle(grid).gridTemplateColumns;
                transitions.forEach((animation, index) => {
                    animation.currentTime = times[index];
                });
                finalTracks.set(key, tracks);
            }

            // Same columns at both ends: the items just stretch with the grid.
            if (!wasRunning && tracks.split(" ").filter(Boolean).length === columns) return;

            grid.style.gridTemplateColumns = tracks;
            const longest = transitions.reduce((a, b) => (endTimeOf(b) > endTimeOf(a) ? b : a));
            const end = endTimeOf(longest) || 1;
            const elapsed = Number(longest.currentTime ?? 0);
            start(from, end, elapsed, () => (longest.playState === "running" ? Number(longest.currentTime ?? end) / end : 1), transitions);
        };

        const resizeObserver = new ResizeObserver(() => {
            if (run?.transitions.length) return; // following a transition, final columns locked in
            const nextColumns = columnCount(grid);
            if (nextColumns === columns) {
                if (!run) baseline = layoutOf(grid, itemsOf(grid));
                return;
            }
            const from = onScreenNow();
            halt();
            columns = nextColumns;
            if (reducedMotion.matches) {
                settle();
                return;
            }
            const startedAt = performance.now();
            start(from, DURATION_MS, 0, () => (performance.now() - startedAt) / DURATION_MS, []);
        });

        // Items added, removed or reordered (filters, "load more"): settle at once and re-measure.
        const mutationObserver = new MutationObserver(() => settle());

        resizeObserver.observe(grid);
        mutationObserver.observe(grid, { childList: true });
        document.addEventListener("transitionrun", onTransitionRun, true);

        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            document.removeEventListener("transitionrun", onTransitionRun, true);
            settle();
        };
    }, []);
}
