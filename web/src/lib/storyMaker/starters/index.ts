/**
 * Built-in localized MoeSekai Script (`.msk`) starter templates (`zh` / `en` / `ja`).
 *
 * Official showcase story ("After-School Starlight Chorus") featuring Leo/need
 * (Ichika, Saki, Honami, Shiho) with live-verified Project SEKAI assets across JP/CN/EN,
 * 13 nodes, 51 beats, 3 variables, locked conditional choice, multi-branch convergence
 * with explicit stage slots (0 errors, 0 warnings), and 3 reachable named endings.
 */
import { STARTER_STORY_EN } from "./en.ts";
import { STARTER_STORY_JA } from "./ja.ts";
import { STARTER_STORY_ZH } from "./zh.ts";

export { STARTER_STORY_EN, STARTER_STORY_JA, STARTER_STORY_ZH };

export type StarterLocale = "zh" | "en" | "ja";

export const STARTER_STORY_SCRIPTS: Record<StarterLocale, string> = {
    zh: STARTER_STORY_ZH,
    en: STARTER_STORY_EN,
    ja: STARTER_STORY_JA,
};
