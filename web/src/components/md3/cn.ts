/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
    return parts.filter(Boolean).join(" ");
}

/* ==========================================================================
   Caller overrides for component defaults.

   Tailwind emits utilities for the same property in its own order (by value:
   `p-0` before `p-4`, `w-auto` before `w-full`), not in className order. So
   when a caller's `className` sets a property the component's defaults
   already set, joining both lets the default win about half the time.
   `withOverrides` drops every default whose properties the caller sets.

   Partial overrides at the same breakpoint need nothing: Tailwind emits
   shorthands before longhands, so a caller's `pt-0` already beats a default
   `p-4`. A default at a wider breakpoint would take the property back
   (`sm:p-5` beats `pt-0` from 640px up), so such a default is dropped whole:
   the caller's value holds and the other sides keep the narrower default.
   Unrecognised utilities are always kept.
   ========================================================================== */

// Min-width breakpoints, narrowest first: Tailwind's plus the M3 window classes.
const BREAKPOINTS = ["medium", "sm", "md", "expanded", "lg", "large", "xl", "2xl", "xlarge"];

const SIDES: Record<string, string[]> = { "": ["t", "r", "b", "l"], x: ["r", "l"], y: ["t", "b"], t: ["t"], r: ["r"], b: ["b"], l: ["l"] };
const CORNERS: Record<string, string[]> = {
    "": ["tl", "tr", "br", "bl"],
    t: ["tl", "tr"],
    b: ["bl", "br"],
    l: ["tl", "bl"],
    r: ["tr", "br"],
    tl: ["tl"],
    tr: ["tr"],
    br: ["br"],
    bl: ["bl"],
};
const KEYWORDS: Record<string, string> = {};
for (const k of ["static", "fixed", "absolute", "relative", "sticky"]) KEYWORDS[k] = "position";
for (const k of ["block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents"]) KEYWORDS[k] = "display";
for (const k of ["flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse"]) KEYWORDS[k] = "flex-direction";
for (const k of ["text-left", "text-center", "text-right", "text-justify", "text-start", "text-end"]) KEYWORDS[k] = "text-align";

/** The properties (as slot names) a utility sets; empty when not recognised. */
function slots(utility: string): string[] {
    const u = utility.replace(/^-/, "");
    if (KEYWORDS[u]) return [KEYWORDS[u]];
    let m: RegExpExecArray | null;
    if ((m = /^([pm])([xytrbl]?)-/.exec(u))) {
        const prop = m[1];
        return SIDES[m[2]].map((side) => prop + side);
    }
    if ((m = /^(min-w|max-w|min-h|max-h|w|h)-/.exec(u))) return [m[1]];
    if (/^size-/.test(u)) return ["w", "h"];
    if ((m = /^gap-(?:([xy])-)?/.exec(u))) return m[1] ? ["gap-" + m[1]] : ["gap-x", "gap-y"];
    if (/^rounded-(s|e|ss|se|es|ee)(-|$)/.test(u)) return [];
    if ((m = /^rounded(?:-(tl|tr|br|bl|t|b|l|r))?(?:-|$)/.exec(u))) return CORNERS[m[1] ?? ""].map((c) => "radius-" + c);
    if ((m = /^overflow-(?:([xy])-)?/.exec(u))) return m[1] ? ["overflow-" + m[1]] : ["overflow-x", "overflow-y"];
    if ((m = /^(justify-items|justify-self|justify|items|self)-/.exec(u))) return [m[1]];
    // text-* is a colour unless it is a size, wrap or overflow mode; arbitrary
    // values could be anything.
    if (/^text-(xs|sm|base|lg|\d*xl|ellipsis|clip|wrap|nowrap|balance|pretty|shadow|\[|\()/.test(u)) return [];
    if (/^text-/.test(u)) return ["color"];
    // The glass materials set the fill and the shadow together.
    if (/^glass(-thick)?$/.test(u)) return ["background-color", "box-shadow"];
    if (/^bg-(linear|radial|conic|gradient|none|clip|origin|fixed|local|scroll|repeat|no-repeat|cover|contain|auto|center|top|bottom|left|right|blend|size|position|\[|\()/.test(u)) return [];
    if (/^bg-/.test(u)) return ["background-color"];
    if (/^shadow(-(none|xs|sm|md|lg|xl|2xl|elev-\d))?$/.test(u)) return ["box-shadow"];
    if (/^border-(?!([xytrblse]|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing)(-|$))(?![\d[(])/.test(u)) return ["border-color"];
    if (/^opacity-/.test(u)) return ["opacity"];
    if (/^z-/.test(u)) return ["z-index"];
    return [];
}

/** Splits `sm:hover:p-4` into its variant (`sm:hover`) and utility (`p-4`). */
function parse(token: string): { variant: string; utility: string } {
    let depth = 0;
    let cut = -1;
    for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch === "[" || ch === "(") depth++;
        else if (ch === "]" || ch === ")") depth--;
        else if (ch === ":" && depth === 0) cut = i;
    }
    return { variant: cut < 0 ? "" : token.slice(0, cut), utility: token.slice(cut + 1).replace(/^!|!$/g, "") };
}

/**
 * Whether a caller utility under `callerVariant` replaces a default under
 * `defaultVariant`. Breakpoints are min-width, so a caller's unprefixed or
 * `sm:` value also overrides the defaults' wider breakpoints: a caller that
 * writes `p-0` means no padding, not "no padding until `sm:p-5` kicks in".
 */
function reaches(callerVariant: string, defaultVariant: string): boolean {
    if (callerVariant === defaultVariant) return true;
    const to = BREAKPOINTS.indexOf(defaultVariant);
    if (to < 0) return false;
    return callerVariant === "" || (BREAKPOINTS.indexOf(callerVariant) > -1 && BREAKPOINTS.indexOf(callerVariant) <= to);
}

/**
 * `cn` for a component's own classes plus the caller's: the last argument is
 * the caller's `className`, and each earlier default it overrides is dropped
 * (see above).
 */
export function withOverrides(...parts: Array<string | false | null | undefined | 0>): string {
    const className = parts.pop();
    const defaults = cn(...parts);
    if (!className) return defaults;
    const covered: Array<{ variant: string; slot: string }> = [];
    for (const token of className.split(/\s+/)) {
        if (!token) continue;
        const { variant, utility } = parse(token);
        for (const slot of slots(utility)) covered.push({ variant, slot });
    }
    if (covered.length === 0) return cn(defaults, className);
    const kept = defaults.split(/\s+/).filter((token) => {
        if (!token) return false;
        const { variant, utility } = parse(token);
        const set = slots(utility);
        const setBy = (slot: string, below: boolean) => covered.some((c) => c.slot === slot && reaches(c.variant, variant) && (!below || c.variant !== variant));
        return set.length === 0 || (!set.every((slot) => setBy(slot, false)) && !set.some((slot) => setBy(slot, true)));
    });
    return cn(kept.join(" "), className);
}
