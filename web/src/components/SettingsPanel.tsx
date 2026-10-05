"use client";
import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme, CHAR_COLORS } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { md3EffectsDefault, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { UNIT_DATA, UNIT_ID_LABEL_KEYS } from "@/types/types";
import { useMasterData } from "@/contexts/MasterDataContext";
import { ADS_SETTINGS_VISIBLE } from "@/lib/ads";
import { MOE_LOGO_URL, getCharacterIconUrl } from "@/lib/assets";
import {
    getShortcutById,
    isEditableEventTarget,
    isKeyboardEventComposing,
    matchesShortcutCombo,
    parseShortcutCombos,
} from "@/lib/shortcuts";
import { getCharacterName, SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, type UiLocale } from "@/lib/i18n";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
    Banner,
    CircularProgress,
    Icon,
    IconButton,
    Radio,
    SegmentedButton,
    Switch,
    Tabs,
    buttonClassName,
    cn,
} from "@/components/md3";
import {
    mdBrightnessAuto,
    mdCheck,
    mdDarkMode,
    mdDatabase,
    mdInfo,
    mdLightMode,
    mdOpenInNew,
    mdPalette,
    mdRefresh,
    mdSettings,
    mdClose,
    mdTune,
} from "@/components/md3/icons";

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsTab = "visual" | "content" | "data" | "about";
type ColorSchemeOption = "system" | "light" | "dark";
type ServerRegion = "en" | "jp" | "cn" | "tw" | "kr";
type AssetLine = "main" | "overseas";

// Group characters by unit for better organization (derived from UNIT_DATA)
const unitGroups = UNIT_DATA.map(u => ({ id: u.id, labelKey: UNIT_ID_LABEL_KEYS[u.id] ?? `common.units.${u.id}`, charIds: u.charIds, color: u.color }));

const SETTINGS_TOGGLE_COMBO = parseShortcutCombos(
    getShortcutById("toggle-settings")?.combos ?? []
)[0] ?? [];
const CLOSE_OVERLAY_COMBOS = parseShortcutCombos(
    getShortcutById("close-overlay")?.combos ?? []
);

const appearanceOptions = [
    { id: "system", labelKey: "settings.appearance.system", icon: mdBrightnessAuto },
    { id: "light", labelKey: "settings.appearance.light", icon: mdLightMode },
    { id: "dark", labelKey: "settings.appearance.dark", icon: mdDarkMode },
] as const;

const assetLineOptions = [
    { key: "main", labelKey: "settings.assetSource.main", value: "main" },
    { key: "overseas", labelKey: "settings.assetSource.overseas", value: "overseas" },
] as const;

const SERVER_REGIONS: readonly ServerRegion[] = ["en", "jp", "cn", "tw", "kr"];

const tabs: { id: SettingsTab; labelKey: string; icon: string }[] = [
    { id: "visual", labelKey: "settings.sections.visual", icon: mdPalette },
    { id: "content", labelKey: "settings.sections.content", icon: mdTune },
    { id: "data", labelKey: "settings.sections.data", icon: mdDatabase },
    { id: "about", labelKey: "settings.sections.about", icon: mdInfo },
];

const WIDE_QUERY = "(min-width: 640px)";

/** Reload the current page with a cache-busting param after a data-source change. */
function scheduleRefreshReload() {
    setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("_refresh", Date.now().toString());
        window.location.href = url.toString();
    }, 100);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h4 className="mb-2 type-title-s text-primary">{children}</h4>;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
    const {
        themeCharId,
        setThemeCharacter,
        colorSchemePreference,
        setColorSchemePreference,
        isShowSpoiler,
        setShowSpoiler,
        useTrainedThumbnail,
        setUseTrainedThumbnail,
        assetSource,
        setAssetSource,
        useLLMTranslation,
        setUseLLMTranslation,
        showAds,
        setShowAds,
        backgroundAnimationBudget,
        setBackgroundAnimationBudget,
        customCursorEnabled,
        setCustomCursorEnabled,
        serverSource,
        setServerSource,
    } = useTheme();
    const { locale, setLocale, t } = useI18n();
    const { cloudVersion, localVersion, isLoading, isRefreshing, forceRefreshData } = useMasterData();
    const [activeTab, setActiveTab] = useState<SettingsTab>("visual");
    const languageOptions = SUPPORTED_UI_LOCALES.map((id) => ({ id, label: UI_LOCALE_LABELS[id] }));
    const panelRef = useRef<HTMLDivElement>(null);
    const isWide = useMediaQuery(WIDE_QUERY, true);

    const [mounted, setMounted] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            setMounted(true);
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    // Prevent body scroll while preserving any existing overflow override.
    useEffect(() => {
        if (!isOpen) return;
        // Skip locking on touch devices to avoid page reflow and viewport flicker
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
            return;
        }
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousBodyOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isKeyboardEventComposing(event)) return;
            if (isEditableEventTarget(event.target)) return;

            const shouldCloseByEscape = CLOSE_OVERLAY_COMBOS.some((combo) =>
                matchesShortcutCombo(event, combo)
            );
            const shouldCloseByToggle = matchesShortcutCombo(event, SETTINGS_TOGGLE_COMBO);

            if (!shouldCloseByEscape && !shouldCloseByToggle) return;

            event.preventDefault();
            onClose();
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleNavigateAbout = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        window.location.href = "/about";
    };

    const handleSelectLocale = (id: UiLocale) => {
        setLocale(id);
        if (id !== "zh-CN") {
            setUseLLMTranslation(false);
        }
    };

    const handleSelectServer = (region: ServerRegion) => {
        if (serverSource === region) return;
        setServerSource(region);
        scheduleRefreshReload();
    };

    const handleSelectAssetLine = (value: AssetLine) => {
        if (assetSource === value) return;
        setAssetSource(value);
        scheduleRefreshReload();
    };

    if (!mounted) return null;

    const panelMotion = prefersReducedMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: reducedMotionFade }
        : isWide
          ? {
                initial: { opacity: 0, scale: 0.92, y: -8 },
                animate: { opacity: 1, scale: 1, y: 0 },
                exit: { opacity: 0, scale: 0.96, y: -4 },
                transition: md3SpatialDefault,
            }
          : {
                initial: { y: "100%" },
                animate: { y: 0 },
                exit: { y: "100%" },
                transition: md3SpatialDefault,
            };

    const localStale = Boolean(localVersion && localVersion !== cloudVersion);

    const tabContent = (
        <>
            {/* TAB 1: VISUAL */}
            {activeTab === "visual" && (
                <div className="space-y-6">
                    <section>
                        <SectionTitle>{t("settings.appearance.sectionTitle")}</SectionTitle>
                        <SegmentedButton<ColorSchemeOption>
                            aria-label={t("settings.appearance.sectionTitle")}
                            value={colorSchemePreference as ColorSchemeOption}
                            onValueChange={(v) => setColorSchemePreference(v)}
                            showCheckmark={false}
                            options={appearanceOptions.map((option) => ({
                                value: option.id,
                                label: t(option.labelKey),
                                icon: option.icon,
                            }))}
                        />
                    </section>

                    <section>
                        <SectionTitle>{t("settings.themeColor.sectionTitle")}</SectionTitle>
                        <div className="space-y-3">
                            {unitGroups.map((unit) => (
                                <div key={unit.id}>
                                    <div className="mb-1.5 type-label-m text-on-surface-variant">{t(unit.labelKey)}</div>
                                    <div className="flex flex-wrap gap-2">
                                        {unit.charIds.map((charId) => {
                                            const id = String(charId);
                                            const isSelected = themeCharId === id;
                                            const name = getCharacterName(t, charId, "short");
                                            return (
                                                <button
                                                    key={charId}
                                                    type="button"
                                                    title={name}
                                                    aria-label={name}
                                                    aria-pressed={isSelected}
                                                    onClick={() => setThemeCharacter(id)}
                                                    className={cn(
                                                        "focus-ring relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden transition-[border-radius] duration-300 ease-md3-spatial-fast",
                                                        isSelected
                                                            ? "rounded-md3-lg ring-[3px] ring-primary ring-offset-2 ring-offset-surface-container-high"
                                                            : "rounded-full hover:rounded-md3-lg",
                                                    )}
                                                    style={{ backgroundColor: CHAR_COLORS[id] }}
                                                >
                                                    <img src={getCharacterIconUrl(charId)} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <SectionTitle>{t("settings.uiLanguage.sectionTitle")}</SectionTitle>
                        <div role="radiogroup" aria-label={t("settings.uiLanguage.label")} className="-mx-2 flex flex-col">
                            {languageOptions.map((option) => (
                                <Radio
                                    key={option.id}
                                    name="settings-ui-locale"
                                    checked={locale === option.id}
                                    onSelect={() => handleSelectLocale(option.id)}
                                    label={option.label}
                                    className="w-full rounded-full"
                                />
                            ))}
                        </div>
                        {locale !== "zh-CN" && (
                            <Banner tone="warning" className="mt-2">
                                {t("settings.uiLanguage.machineTranslationNotice")}
                            </Banner>
                        )}
                    </section>

                    <section className="space-y-4">
                        <Switch
                            checked={backgroundAnimationBudget === "on"}
                            onCheckedChange={(checked) => setBackgroundAnimationBudget(checked ? "on" : "off")}
                            label={t("settings.backgroundAnimationBudget.sectionTitle")}
                            description={t(backgroundAnimationBudget === "on" ? "settings.backgroundAnimationBudget.onDescription" : "settings.backgroundAnimationBudget.offDescription")}
                        />
                        <Switch
                            checked={customCursorEnabled}
                            onCheckedChange={setCustomCursorEnabled}
                            label={t("settings.customCursor.sectionTitle")}
                            description={t(customCursorEnabled ? "settings.customCursor.onDescription" : "settings.customCursor.offDescription")}
                        />
                    </section>
                </div>
            )}

            {/* TAB 2: CONTENT */}
            {activeTab === "content" && (
                <div className="space-y-5">
                    <SectionTitle>{t("settings.contentDisplay.sectionTitle")}</SectionTitle>
                    <Switch
                        checked={isShowSpoiler}
                        onCheckedChange={setShowSpoiler}
                        label={t("settings.showSpoiler.label")}
                        description={t("settings.showSpoiler.description")}
                    />
                    <Switch
                        checked={useTrainedThumbnail}
                        onCheckedChange={setUseTrainedThumbnail}
                        label={
                            <span className="inline-flex items-center gap-2">
                                {t("settings.trainedThumbnail.label")}
                                <kbd className="hidden rounded-md3-xs border border-outline-variant px-1.5 type-label-s text-on-surface-variant sm:inline-block">]</kbd>
                            </span>
                        }
                        description={t("settings.trainedThumbnail.description")}
                    />
                    <Switch
                        checked={useLLMTranslation}
                        onCheckedChange={setUseLLMTranslation}
                        label={t("settings.translation.label")}
                        description={t("settings.translation.description")}
                    />
                    {ADS_SETTINGS_VISIBLE && (
                        <Switch
                            checked={showAds}
                            onCheckedChange={setShowAds}
                            label={t("settings.ads.label")}
                            description={t("settings.ads.description")}
                        />
                    )}
                </div>
            )}

            {/* TAB 3: DATA */}
            {activeTab === "data" && (
                <div className="space-y-6">
                    <section>
                        <SectionTitle>{t("settings.serverSource.sectionTitle")}</SectionTitle>
                        <SegmentedButton<ServerRegion>
                            aria-label={t("settings.serverSource.sectionTitle")}
                            value={serverSource as ServerRegion}
                            onValueChange={handleSelectServer}
                            showCheckmark={false}
                            density={-1}
                            options={SERVER_REGIONS.map((region) => ({ value: region, label: region.toUpperCase() }))}
                        />
                        <p className="mt-2 type-body-s text-on-surface-variant">{t(`settings.serverSource.${serverSource}`)}</p>
                    </section>

                    <section>
                        <SectionTitle>{t("settings.assetSource.sectionTitle")}</SectionTitle>
                        <SegmentedButton<AssetLine>
                            aria-label={t("settings.assetSource.sectionTitle")}
                            value={assetSource as AssetLine}
                            onValueChange={handleSelectAssetLine}
                            options={assetLineOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                        />
                    </section>

                    <section>
                        <SectionTitle>{t("settings.dataVersion.sectionTitle")}</SectionTitle>
                        <dl className="space-y-2 type-body-m">
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-on-surface-variant">{t("settings.dataVersion.cloudVersion")}</dt>
                                <dd className="font-mono text-on-surface">
                                    {isLoading ? t("settings.dataVersion.checking") : (cloudVersion || t("settings.dataVersion.loadFailed"))}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-on-surface-variant">{t("settings.dataVersion.localCacheVersion")}</dt>
                                <dd className={cn("flex items-center gap-1 font-mono", localStale ? "text-tertiary type-emphasized" : "text-on-surface")}>
                                    {localVersion ? (
                                        <>
                                            {localVersion}
                                            {localVersion === cloudVersion && <Icon path={mdCheck} size={16} className="text-primary" />}
                                        </>
                                    ) : t("settings.dataVersion.noCache")}
                                </dd>
                            </div>
                        </dl>
                        <button
                            type="button"
                            onClick={forceRefreshData}
                            disabled={isRefreshing || isLoading}
                            className={cn(buttonClassName({ variant: "tonal", fullWidth: true, disabled: isRefreshing || isLoading }), "mt-4")}
                        >
                            {isRefreshing ? <CircularProgress size={18} strokeWidth={2} /> : <Icon path={mdRefresh} size={20} />}
                            {isRefreshing ? t("settings.refresh.refreshing") : t("settings.refresh.idle")}
                        </button>
                    </section>
                </div>
            )}

            {/* TAB 4: ABOUT */}
            {activeTab === "about" && (
                <div className="flex flex-col items-center gap-3 rounded-md3-lg bg-surface-container p-6 text-center">
                    <a
                        href="/about"
                        onClick={handleNavigateAbout}
                        className="focus-ring group flex cursor-pointer flex-col items-center rounded-md3-md p-1"
                    >
                        <div
                            className="my-1 h-9 w-32 bg-primary"
                            style={{
                                maskImage: `url(${MOE_LOGO_URL})`,
                                maskSize: "contain",
                                maskPosition: "center",
                                maskRepeat: "no-repeat",
                                WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                WebkitMaskSize: "contain",
                                WebkitMaskPosition: "center",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                            role="img"
                            aria-label="Moesekai Logo"
                        />
                        <span className="mt-1 type-title-m text-on-surface transition-colors group-hover:text-primary">
                            Moesekai Viewer
                        </span>
                    </a>
                    <p className="type-body-m text-on-surface-variant">{t("settings.about.projectDescription")}</p>
                    <a
                        href="/about"
                        onClick={handleNavigateAbout}
                        className={cn(buttonClassName({ variant: "filled", fullWidth: true }), "mt-2")}
                    >
                        {t("settings.about.viewDetails")}
                        <Icon path={mdOpenInNew} size={20} />
                    </a>
                </div>
            )}
        </>
    );

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className={cn("fixed inset-0 z-[200] isolate", !isWide && "flex items-end justify-center")}>
                    {/* Click-outside layer: transparent for the anchored panel, scrim for the bottom sheet */}
                    <motion.div
                        className={cn("absolute inset-0", isWide ? "bg-transparent" : "bg-scrim/32")}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={prefersReducedMotion ? reducedMotionFade : md3EffectsDefault}
                        onClick={onClose}
                    />

                    <motion.div
                        id="settings-panel-content"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("settings.title")}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            "flex flex-col overflow-hidden bg-surface-container-high text-on-surface shadow-elev-3",
                            isWide
                                ? "absolute right-3 top-[4.25rem] max-h-[calc(100dvh-5rem)] w-[400px] rounded-md3-xl"
                                : "relative max-h-[90dvh] w-full rounded-t-md3-xl",
                        )}
                        style={{ transformOrigin: "top right" }}
                        {...panelMotion}
                    >
                        {!isWide && (
                            <div className="flex shrink-0 justify-center pt-3" aria-hidden>
                                <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
                            </div>
                        )}

                        {/* Header */}
                        <div className="flex h-14 shrink-0 items-center gap-3 pl-5 pr-2">
                            <Icon path={mdSettings} size={24} className="text-on-surface-variant" />
                            <h3 className="flex-1 truncate type-title-l text-on-surface">{t("settings.title")}</h3>
                            <IconButton icon={mdClose} label={t("common.action.close")} onClick={onClose} />
                        </div>

                        <Tabs<SettingsTab>
                            aria-label={t("settings.title")}
                            value={activeTab}
                            onValueChange={setActiveTab}
                            items={tabs.map((tab) => ({ value: tab.id, label: t(tab.labelKey), icon: tab.icon }))}
                            className="shrink-0"
                        />

                        {/* Tab content */}
                        <div className="min-h-[260px] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
                            <motion.div
                                key={activeTab}
                                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={prefersReducedMotion ? reducedMotionFade : md3EffectsDefault}
                            >
                                {tabContent}
                            </motion.div>
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 border-t border-outline-variant px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-center">
                            <span className="type-label-s text-on-surface-variant">{t("settings.footer.version")}</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
