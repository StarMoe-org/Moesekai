"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/*
 * Light shards and scattered shapes behind the page, after the official site's background:
 * three layers drifting at different speeds as the page scrolls, each gliding to a stop
 * a moment after the scroll does.
 *
 * Kept cheap the same way that site is: nothing moves while the page is still, and each layer
 * is painted once and then only translated, so scrolling never repaints the background. (The
 * shard field this replaces floated every shape forever, which kept every frame busy and the
 * glass chrome over it re-blurring even on an idle page.)
 */

/** How far each layer moves per pixel scrolled: small outlines run ahead, big shards lag. */
const SPEEDS = [1.2, 1, 0.4] as const;
/** Time constant of the glide toward the scroll position (about the official site's 1.2s ease-out-circ). */
const GLIDE_MS = 180;

/** Tile size in SVG units; laid over `--brand-pattern-tile`, cropped at the sides on narrow screens. */
const TILE_W = 1600;
const TILE_H = 1000;

type Tone = "a" | "b";

interface Shape {
    kind: "ring" | "dot" | "triangle" | "outline-triangle";
    x: number;
    y: number;
    /** Radius; for triangles, the distance from center to corners. */
    r: number;
    tone: Tone;
    alpha: number;
    /** Triangle corners, already rotated and jittered. */
    points?: string;
}

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A slightly uneven triangle, like a shard rather than a road sign. */
function trianglePoints(rand: () => number, x: number, y: number, r: number): string {
    const turn = rand() * Math.PI * 2;
    return [0, 1, 2]
        .map((i) => {
            const angle = turn + (i * Math.PI * 2) / 3 + (rand() - 0.5) * 0.5;
            const radius = r * (0.8 + rand() * 0.4);
            return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`;
        })
        .join(" ");
}

interface LayerSpec {
    count: number;
    /** Closest two shapes of the layer may sit, in tile units. */
    spacing: number;
    make: (rand: () => number, x: number, y: number, tone: Tone) => Shape;
}

const LAYERS: LayerSpec[] = [
    {
        count: 18,
        spacing: 150,
        make: (rand, x, y, tone) => {
            const pick = rand();
            if (pick < 0.45) return { kind: "ring", x, y, r: 7 + rand() * 5, tone, alpha: 0.85 };
            if (pick < 0.8) return { kind: "dot", x, y, r: 3.5 + rand() * 3, tone, alpha: 0.8 };
            const r = 9 + rand() * 4;
            return { kind: "outline-triangle", x, y, r, tone, alpha: 0.85, points: trianglePoints(rand, x, y, r) };
        },
    },
    {
        count: 8,
        spacing: 280,
        make: (rand, x, y, tone) => {
            const pick = rand();
            if (pick < 0.5) {
                const r = 20 + rand() * 8;
                return { kind: "triangle", x, y, r, tone, alpha: 0.5, points: trianglePoints(rand, x, y, r) };
            }
            if (pick < 0.8) return { kind: "dot", x, y, r: 16 + rand() * 8, tone, alpha: 0.3 };
            const r = 16 + rand() * 4;
            return { kind: "outline-triangle", x, y, r, tone, alpha: 0.7, points: trianglePoints(rand, x, y, r) };
        },
    },
    {
        count: 3,
        spacing: 520,
        make: (rand, x, y, tone) => {
            const r = 60 + rand() * 25;
            return { kind: "triangle", x, y, r, tone, alpha: 0.32, points: trianglePoints(rand, x, y, r) };
        },
    },
];

/** Each layer's shapes, spread out and kept off the tile's top and bottom edges so tiles repeat seamlessly. */
const TILES: Shape[][] = LAYERS.map((spec, index) => {
    const rand = mulberry32(0x5ec4a1 + index * 7919);
    const margin = 90;
    const shapes: Shape[] = [];
    for (let attempt = 0; shapes.length < spec.count && attempt < spec.count * 60; attempt++) {
        const x = rand() * TILE_W;
        const y = margin + rand() * (TILE_H - margin * 2);
        if (shapes.some((shape) => Math.hypot(shape.x - x, shape.y - y) < spec.spacing)) continue;
        shapes.push(spec.make(rand, x, y, shapes.length % 2 === 0 ? "a" : "b"));
    }
    return shapes;
});

function ShapeTile({ shapes }: { shapes: Shape[] }) {
    return (
        <svg viewBox={`0 0 ${TILE_W} ${TILE_H}`} preserveAspectRatio="xMidYMid slice" className="brand-pattern-tile">
            {shapes.map((shape, index) => {
                const tone = `brand-pattern-${shape.tone}`;
                const opacity = shape.alpha.toFixed(2);
                switch (shape.kind) {
                    case "ring":
                        return <circle key={index} cx={shape.x.toFixed(1)} cy={shape.y.toFixed(1)} r={shape.r.toFixed(1)} className={`${tone} brand-pattern-stroke`} strokeOpacity={opacity} />;
                    case "dot":
                        return <circle key={index} cx={shape.x.toFixed(1)} cy={shape.y.toFixed(1)} r={shape.r.toFixed(1)} className={tone} fillOpacity={opacity} />;
                    case "triangle":
                        return <polygon key={index} points={shape.points} className={tone} fillOpacity={opacity} />;
                    case "outline-triangle":
                        return <polygon key={index} points={shape.points} className={`${tone} brand-pattern-stroke`} strokeOpacity={opacity} />;
                }
            })}
        </svg>
    );
}

export default function BackgroundPattern() {
    const { backgroundAnimationBudget } = useTheme();
    const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const layers = layerRefs.current.filter((layer): layer is HTMLDivElement => layer !== null);
        if (backgroundAnimationBudget === "off" || layers.length !== SPEEDS.length) return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        /** Height of one tile; each layer holds two, and wraps by one as it moves. */
        let tile = 0;
        /** The scroll position the layers are drawn at, gliding after the real one. */
        let drawn = reducedMotion.matches ? 0 : window.scrollY;
        let frame = 0;
        let lastTime = 0;
        /** Last offset written per layer, in device pixels; the glide's tail moves less than one. */
        const written = layers.map(() => NaN);

        const draw = () => {
            if (!tile) return;
            const ratio = window.devicePixelRatio || 1;
            layers.forEach((layer, index) => {
                const offset = Math.round(((SPEEDS[index] * drawn) % tile) * ratio);
                if (offset === written[index]) return;
                written[index] = offset;
                layer.style.transform = `translate3d(0, ${(-offset / ratio).toFixed(3)}px, 0)`;
            });
        };

        const step = (now: number) => {
            const elapsed = lastTime ? Math.min(64, now - lastTime) : 16;
            lastTime = now;
            const target = window.scrollY;
            drawn += (target - drawn) * (1 - Math.exp(-elapsed / GLIDE_MS));
            if (Math.abs(target - drawn) < 0.3) {
                drawn = target;
                frame = 0;
                lastTime = 0;
            } else {
                frame = requestAnimationFrame(step);
            }
            draw();
        };

        const onScroll = () => {
            if (!frame && !reducedMotion.matches) frame = requestAnimationFrame(step);
        };

        const measure = () => {
            tile = layers[0].offsetHeight / 2;
            draw();
        };

        const resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(layers[0]);
        measure();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
            for (const layer of layers) layer.style.removeProperty("transform");
        };
    }, [backgroundAnimationBudget]);

    return (
        <div aria-hidden="true" className="brand-pattern">
            <svg viewBox="0 0 1600 900" preserveAspectRatio="none" className="brand-pattern-facets">
                <polygon points="0,0 380,0 0,820" fillOpacity={0.9} />
                <polygon points="250,0 1600,0 1600,380 1040,250" fillOpacity={0.55} />
                <polygon points="120,900 1040,250 1600,380 1600,900" fillOpacity={0.75} />
            </svg>
            {TILES.map((shapes, index) => (
                <div
                    key={index}
                    ref={(layer) => {
                        layerRefs.current[index] = layer;
                    }}
                    className="brand-pattern-layer"
                >
                    <ShapeTile shapes={shapes} />
                    <ShapeTile shapes={shapes} />
                </div>
            ))}
        </div>
    );
}
