"use client";

import { useCallback, type RefCallback } from "react";

/** The rails' motion (see MainLayout): 400ms, M3 emphasized. */
const DURATION_MS = 400;
const emphasized = cubicBezier(0.2, 0, 0, 1);
/** Share of the time an item that changes rows spends leaving its old row, then arriving in the new one. */
const EXIT_SHARE = 0.3;
const ENTER_SHARE = 0.45;
/** Items this far outside the viewport just snap; nobody sees them move. */
const VIEWPORT_MARGIN_PX = 200;
/** Ancestor transitions that can change the grid's width. */
const LAYOUT_TRANSITION = /^(margin|padding|width|min-width|max-width|left|right|inset)/;

interface Slot {
    x: number;
    y: number;
    w: number;
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

interface Run {
    from: Map<HTMLElement, Slot>;
    to: Map<HTMLElement, Slot>;
    wraps: Map<HTMLElement, Wrap>;
    /** Items the run draws. */
    animated: HTMLElement[];
    /** Those plus the neighbors they are placed against. */
    tracked: HTMLElement[];
    gap: number;
    /** Time fraction, 0 to 1. */
    progress: () => number;
    /** The ancestor transitions the run follows; none when it keeps its own time. */
    transitions: CSSTransition[];
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
    return new Map(items.map((el) => [el, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, row: rowOf.get(el.offsetTop) ?? 0, o: 1 }]));
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
        let frame = 0;
        /** What the running reflow last drew, so a new one can pick up from there. */
        const drawn = new Map<HTMLElement, Slot>();

        /** Drops the running reflow's drawing, leaving the grid's column lock in place. */
        const halt = () => {
            if (!run) return;
            cancelAnimationFrame(frame);
            for (const el of run.animated) {
                el.style.removeProperty("transform");
                el.style.removeProperty("transform-origin");
                el.style.removeProperty("opacity");
            }
            run = null;
            drawn.clear();
        };

        const settle = () => {
            halt();
            grid.style.removeProperty("grid-template-columns");
            grid.style.removeProperty("overflow-x");
            grid.style.removeProperty("overflow-clip-margin");
            columns = columnCount(grid);
            baseline = layoutOf(grid, itemsOf(grid));
        };

        const draw = () => {
            if (!run) return;
            const t = clamp01(run.progress());
            const p = emphasized(t);
            const { from, to, wraps, gap } = run;

            // Read everything first, then write, so the frame lays out once.
            const live = new Map(run.tracked.map((el) => [el, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth }]));

            for (const el of run.animated) {
                const start = from.get(el)!;
                const end = live.get(el)!;
                const wrap = wraps.get(el);
                let x = lerp(start.x, end.x, p);
                let y = lerp(start.y, end.y, p);
                let w = lerp(start.w, end.w, p);
                let o = lerp(start.o, 1, p);
                let row = start.row;

                if (wrap) {
                    // Past the end of the old row, keeping pace with the row-mates that stay there.
                    const exitAnchor = wrap.exit && live.get(wrap.exit.el)!;
                    const exitX = exitAnchor && exitAnchor.x + wrap.exit!.k * (exitAnchor.w + gap);
                    // Past the other end of the new row, keeping pace with the row-mates already there.
                    const enterAnchor = wrap.enter && from.get(wrap.enter.el)!;
                    const enterX = enterAnchor && enterAnchor.x + wrap.enter!.k * (enterAnchor.w + gap);

                    if (t < EXIT_SHARE) {
                        // Leaving.
                        x = lerp(start.x, exitX ?? start.x + (end.x - enterX!), p);
                        y = lerp(start.y, exitAnchor?.y ?? start.y, p);
                        w = lerp(start.w, exitAnchor?.w ?? end.w, p);
                        o = start.o * (1 - t / EXIT_SHARE);
                    } else {
                        // Arriving.
                        x = lerp(enterX ?? end.x - (exitX! - start.x), end.x, p);
                        y = lerp(enterAnchor?.y ?? end.y, end.y, p);
                        w = lerp(enterAnchor?.w ?? start.w, end.w, p);
                        o = clamp01((t - EXIT_SHARE) / ENTER_SHARE);
                        row = to.get(el)!.row;
                    }
                }

                drawn.set(el, { x, y, w, row, o });
                el.style.transform = `translate(${x - end.x}px, ${y - end.y}px) scale(${end.w ? w / end.w : 1})`;
                el.style.opacity = String(o);
            }

            if (t >= 1) settle();
            else frame = requestAnimationFrame(draw);
        };

        /** Moves from `from` (what is on screen) to the grid's current layout, on the given clock. */
        const start = (from: Map<HTMLElement, Slot>, progress: () => number, transitions: CSSTransition[]) => {
            const items = itemsOf(grid);
            const to = layoutOf(grid, items);
            const wraps = planWraps(items, from, to);

            const gridTop = grid.getBoundingClientRect().top;
            const viewportBottom = window.innerHeight + VIEWPORT_MARGIN_PX;
            const onScreen = (el: HTMLElement, y: number) => gridTop + y + el.offsetHeight > -VIEWPORT_MARGIN_PX && gridTop + y < viewportBottom;
            const animated = items.filter((el) => onScreen(el, from.get(el)!.y) || onScreen(el, to.get(el)!.y));
            const tracked = new Set(animated);
            for (const el of animated) {
                const wrap = wraps.get(el);
                if (wrap?.exit) tracked.add(wrap.exit.el);
                if (wrap?.enter) tracked.add(wrap.enter.el);
                el.style.transformOrigin = "0 0";
            }
            // Items wrap out of and into view across the grid's sides.
            grid.style.overflowX = "clip";
            grid.style.setProperty("overflow-clip-margin", "8px");

            run = { from, to, wraps, animated, tracked: [...tracked], gap: parseFloat(getComputedStyle(grid).columnGap) || 0, progress, transitions };
            draw();
        };

        /** What is on screen now: the running reflow's last frame, or the layout as of `layout`. */
        const onScreenNow = (layout: Map<HTMLElement, Slot>): Map<HTMLElement, Slot> => {
            const items = itemsOf(grid);
            if (items.some((el) => !layout.has(el))) layout = layoutOf(grid, items);
            return new Map(items.map((el) => [el, drawn.get(el) ?? layout.get(el)!]));
        };

        // An ancestor starting to transition its width: jump its transitions to the end to see the
        // grid's final columns (nothing is painted in between), lock them in, and follow along.
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
            const from = onScreenNow(layoutOf(grid, itemsOf(grid)));
            halt();
            grid.style.removeProperty("grid-template-columns");

            const times = transitions.map((animation) => animation.currentTime);
            for (const animation of transitions) animation.currentTime = endTimeOf(animation) - 0.5;
            const finalTracks = getComputedStyle(grid).gridTemplateColumns;
            transitions.forEach((animation, index) => {
                animation.currentTime = times[index];
            });

            // Same columns at both ends: the items just stretch with the grid.
            if (!wasRunning && finalTracks.split(" ").filter(Boolean).length === columns) return;

            grid.style.gridTemplateColumns = finalTracks;
            const longest = transitions.reduce((a, b) => (endTimeOf(b) > endTimeOf(a) ? b : a));
            const end = endTimeOf(longest) || 1;
            start(from, () => (longest.playState === "running" ? Number(longest.currentTime ?? end) / end : 1), transitions);
        };

        const resizeObserver = new ResizeObserver(() => {
            if (run?.transitions.length) return; // following a transition, final columns locked in
            const nextColumns = columnCount(grid);
            if (nextColumns === columns) {
                if (!run) baseline = layoutOf(grid, itemsOf(grid));
                return;
            }
            const from = onScreenNow(baseline);
            halt();
            columns = nextColumns;
            if (reducedMotion.matches) {
                baseline = layoutOf(grid, itemsOf(grid));
                return;
            }
            const startedAt = performance.now();
            start(from, () => (performance.now() - startedAt) / DURATION_MS, []);
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
