/**
 * Motion presets for Framer Motion, based on Material 3 Expressive spring tokens.
 * Use spatial springs for movement/shape, effects springs for color/opacity.
 * Honour prefers-reduced-motion via getMotionTransition({ reducedMotion }).
 */

import type { Transition } from "framer-motion";

/* ------------------------------------------------------------------------
 * Material 3 Expressive motion physics (spring tokens).
 * https://m3.material.io/styles/motion/overview/specs
 *
 *   spatial  — position / size / shape / rotation. Slight overshoot.
 *   effects  — color / opacity. Never overshoots.
 *   fast     — small components (buttons, switches, chips)
 *   default  — medium/partial-screen (sheets, menus, nav drawer)
 *   slow     — full-screen transitions
 *
 * Framer damping coefficient c = ζ · 2√(k·m): spatial ζ = 0.9, effects ζ = 1.
 * ---------------------------------------------------------------------- */
export const md3SpatialFast: Transition = { type: "spring", stiffness: 1400, damping: 67, mass: 1 };
export const md3SpatialDefault: Transition = { type: "spring", stiffness: 700, damping: 48, mass: 1 };
export const md3SpatialSlow: Transition = { type: "spring", stiffness: 300, damping: 31, mass: 1 };
export const md3EffectsFast: Transition = { type: "spring", stiffness: 3800, damping: 123, mass: 1 };
export const md3EffectsDefault: Transition = { type: "spring", stiffness: 1600, damping: 80, mass: 1 };
export const md3EffectsSlow: Transition = { type: "spring", stiffness: 800, damping: 57, mass: 1 };

/** M3 easing curves for tween transitions (framer-motion bezier arrays). */
export const md3EasingEmphasizedDecelerate = [0.05, 0.7, 0.1, 1] as const;
export const md3EasingEmphasizedAccelerate = [0.3, 0, 0.8, 0.15] as const;
export const md3EasingStandard = [0.2, 0, 0, 1] as const;

/* Legacy preset names — now backed by MD3 springs so existing call sites
 * pick up Material motion without being rewritten. */

/** Menus, modals, chrome, toggles → MD3 spatial default */
export const springSnappy: Transition = md3SpatialDefault;

/** Large panels / layout shifts → MD3 spatial slow */
export const springSoft: Transition = md3SpatialSlow;

/** Sheet / drawer → MD3 spatial default */
export const springSheet: Transition = md3SpatialDefault;

/** Momentum / flick handoff — under-damped, use with release velocity */
export const springMomentum: Transition = {
  type: "spring",
  bounce: 0.2,
  duration: 0.4,
};

/** Instant press highlight (CSS-friendly ms) */
export const pressDurationMs = 100;

/** Opacity cross-fade when prefers-reduced-motion */
export const reducedMotionFade: Transition = {
  type: "tween",
  duration: 0.18,
  ease: "easeOut",
};

export type MotionPresetName = "snappy" | "soft" | "sheet" | "momentum" | "spatialFast" | "spatial" | "spatialSlow" | "effects";

/**
 * Filter drawer enter/exit — slides in from the left edge with a short
 * horizontal offset. Kept subtle (14px) because the drawer is a docked panel at
 * `lg` and up, where a large travel distance would read as a layout glitch
 * rather than a transition. Exit is slightly shorter so dismissal feels prompt.
 */
export const filterDrawerVariants = {
  initial: { opacity: 0, x: -14 },
  animate: { opacity: 1, x: 0, transition: md3SpatialDefault },
  exit: { opacity: 0, x: -10, transition: { type: "tween", duration: 0.15, ease: md3EasingEmphasizedAccelerate } },
} as const;
const PRESETS: Record<MotionPresetName, Transition> = {
  snappy: springSnappy,
  soft: springSoft,
  sheet: springSheet,
  momentum: springMomentum,
  spatialFast: md3SpatialFast,
  spatial: md3SpatialDefault,
  spatialSlow: md3SpatialSlow,
  effects: md3EffectsDefault,
};

/** Pick a spring preset; falls back to reduced-motion fade when requested. */
export function getMotionTransition(
  name: MotionPresetName = "snappy",
  options?: { reducedMotion?: boolean; velocity?: number }
): Transition {
  if (options?.reducedMotion) {
    return reducedMotionFade;
  }
  const base = PRESETS[name] ?? springSnappy;
  if (typeof options?.velocity === "number" && Number.isFinite(options.velocity)) {
    return { ...base, velocity: options.velocity };
  }
  return base;
}

/**
 * Apple scroll-style momentum projection (exponential decay).
 * Returns how far motion would coast from release velocity (px).
 */
export function projectMomentum(
  initialVelocityPxPerSec: number,
  decelerationRate = 0.998
): number {
  if (!Number.isFinite(initialVelocityPxPerSec) || decelerationRate >= 1 || decelerationRate <= 0) {
    return 0;
  }
  return ((initialVelocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Rubber-band resistance past a boundary (Apple sample form). */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55
): number {
  if (!dimension) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
