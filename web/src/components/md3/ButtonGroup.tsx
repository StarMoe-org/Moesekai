"use client";
import React from "react";
import { animate, useReducedMotion } from "framer-motion";
import { md3SpatialFast } from "@/lib/motion";
import { cn } from "./cn";

/* ==========================================================================
   M3 Expressive standard button group: buttons 12dp apart that answer a press
   together. The pressed button grows by 15% of its width and its neighbours
   give that width up, so the group keeps its size.
   (ConnectedButtonGroup, for choosing among options, is in Segmented.tsx.)
   ========================================================================== */

const EXPANDED_RATIO = 0.15;

/** How far a neighbour may be compressed: the space beside its content. */
function compressionLimit(item: HTMLElement): number {
    const content = item.firstElementChild?.getBoundingClientRect().width ?? 0;
    return Math.max(0, (item.getBoundingClientRect().width - content) / 2);
}

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export function ButtonGroup({ className, children, onPointerDown, ...rest }: ButtonGroupProps) {
    const reducedMotion = useReducedMotion();
    const pressRef = React.useRef<(() => void) | null>(null);
    const settlingRef = React.useRef<Array<{ stop: () => void }>>([]);

    React.useEffect(() => () => {
        pressRef.current?.();
        settlingRef.current.forEach(animation => animation.stop());
    }, []);

    const press = (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(event);
        if (reducedMotion || pressRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
        const items = Array.from(event.currentTarget.children) as HTMLElement[];
        const index = items.findIndex(item => item.contains(event.target as Node));
        if (index < 0 || items.length < 2) return;

        // a press during the last one's release starts from the buttons' own widths
        settlingRef.current.forEach(animation => animation.stop());
        items.forEach(item => { item.style.width = ""; });
        const widths = items.map(item => item.getBoundingClientRect().width);
        const before = index > 0 ? items[index - 1] : null;
        const after = index < items.length - 1 ? items[index + 1] : null;
        const targets = new Map<HTMLElement, number>();
        if (before && after) {
            const growth = Math.min(EXPANDED_RATIO * widths[index] / 2, compressionLimit(before), compressionLimit(after));
            targets.set(before, widths[index - 1] - growth).set(after, widths[index + 1] - growth).set(items[index], widths[index] + 2 * growth);
        } else {
            const neighbour = (before ?? after) as HTMLElement;
            const growth = Math.min(EXPANDED_RATIO * widths[index], compressionLimit(neighbour));
            targets.set(neighbour, widths[items.indexOf(neighbour)] - growth).set(items[index], widths[index] + growth);
        }

        const running = [...targets].map(([item, width]) => animate(item, { width: `${width}px` }, md3SpatialFast));
        const release = () => {
            window.removeEventListener("pointerup", release);
            window.removeEventListener("pointercancel", release);
            pressRef.current = null;
            running.forEach(animation => animation.stop());
            settlingRef.current = [...targets.keys()].map(item => {
                // back to the width its classes give it, which then holds again
                const settling = animate(item, { width: `${widths[items.indexOf(item)]}px` }, md3SpatialFast);
                void settling.then(() => { item.style.width = ""; });
                return settling;
            });
        };
        pressRef.current = release;
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
    };

    return (
        <div role="group" className={cn("inline-flex shrink-0 items-center gap-3", className)} onPointerDown={press} {...rest}>
            {children}
        </div>
    );
}

export default ButtonGroup;
