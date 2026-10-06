export const UI_LOCALE_STORAGE_KEY = "moesekai_ui_locale";

export const SUPPORTED_UI_LOCALES = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"] as const;

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "zh-CN";

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文 (HMT)",
    "en-US": "English",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
};

export const UI_LOCALE_NATIVE_NAMES: Record<UiLocale, string> = {
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文 (HMT)",
    "en-US": "English",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
};

export const UI_LOCALE_HTML_LANG: Record<UiLocale, string> = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    "en-US": "en-US",
    "ja-JP": "ja-JP",
    "ko-KR": "ko-KR",
};

export function isUiLocale(value: unknown): value is UiLocale {
    return typeof value === "string" && (SUPPORTED_UI_LOCALES as readonly string[]).includes(value);
}

export function resolveUiLocale(value: unknown): UiLocale | null {
    if (isUiLocale(value)) return value;
    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith("en")) return "en-US";
    if (normalized.startsWith("ja")) return "ja-JP";
    if (
        normalized === "zh-tw"
        || normalized === "zh-hk"
        || normalized === "zh-hant"
        || normalized.startsWith("zh-hant-")
    ) return "zh-TW";
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("ko")) return "ko-KR";

    return null;
}

export function normalizeUiLocale(value: unknown): UiLocale {
    return resolveUiLocale(value) ?? DEFAULT_UI_LOCALE;
}

export function resolvePreferredUiLocale(values: readonly unknown[], fallback: UiLocale = DEFAULT_UI_LOCALE): UiLocale {
    for (const value of values) {
        const locale = resolveUiLocale(value);
        if (locale) return locale;
    }

    return fallback;
}

export function resolveAcceptLanguageUiLocale(header: string | null | undefined, fallback: UiLocale = DEFAULT_UI_LOCALE): UiLocale {
    if (!header) return fallback;

    const languages = header
        .split(",")
        .map((part, index) => {
            const [language = "", ...parameters] = part.trim().split(";");
            let quality = 1;
            for (const parameter of parameters) {
                const match = parameter.trim().match(/^q\s*=\s*(.+)$/i);
                if (!match) continue;
                const parsed = Number(match[1]);
                quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
                break;
            }
            return { language: language.trim(), quality, index };
        })
        .filter(({ language, quality }) => Boolean(language) && quality > 0)
        .sort((left, right) => right.quality - left.quality || left.index - right.index)
        .map(({ language }) => language);

    return resolvePreferredUiLocale(languages, fallback);
}

export function detectBrowserUiLocale(fallback: UiLocale = DEFAULT_UI_LOCALE): UiLocale {
    if (typeof navigator === "undefined") return fallback;

    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    return resolvePreferredUiLocale(languages, fallback);
}

export function applyUiLocaleToDocument(locale: UiLocale) {
    if (typeof document === "undefined") return;

    document.documentElement.lang = UI_LOCALE_HTML_LANG[locale];
    document.documentElement.dataset.uiLocale = locale;
}
