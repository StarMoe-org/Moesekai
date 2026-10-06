"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme, type ServerSourceType, type AssetSourceType, type BackgroundAnimationBudget, CHAR_COLORS } from "@/contexts/ThemeContext";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName, SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, UI_LOCALE_STORAGE_KEY, detectBrowserUiLocale, type UiLocale } from "@/lib/i18n";
import { MOE_LOGO_URL } from "@/lib/assets";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button, Icon, Switch } from "@/components/md3";
import { mdArrowForward, mdBrightnessAuto, mdCheck, mdCheckCircle, mdChevronLeft, mdChevronRight, mdDarkMode, mdInfo, mdLightMode } from "@/components/md3/icons";
import { md3SpatialDefault, md3EffectsFast } from "@/lib/motion";
// Character subset for theme selection
// Full character list for theme selection
const SELECTED_THEME_CHARACTERS = [
  // Virtual Singers
  { id: "21" }, { id: "22" }, { id: "23" }, { id: "24" }, { id: "25" }, { id: "26" },
  // Leo/need
  { id: "1" }, { id: "2" }, { id: "3" }, { id: "4" },
  // MORE MORE JUMP!
  { id: "5" }, { id: "6" }, { id: "7" }, { id: "8" },
  // Vivid BAD SQUAD
  { id: "9" }, { id: "10" }, { id: "11" }, { id: "12" },
  // Wonderlands x Showtime
  { id: "13" }, { id: "14" }, { id: "15" }, { id: "16" },
  // 25-ji
  { id: "17" }, { id: "18" }, { id: "19" }, { id: "20" }
];

const BACKGROUND_ANIMATION_BUDGET_OPTIONS: { id: BackgroundAnimationBudget; labelKey: string; descriptionKey: string }[] = [
  {
    id: "on",
    labelKey: "settings.backgroundAnimationBudget.on",
    descriptionKey: "settings.backgroundAnimationBudget.onDescription",
  },
  {
    id: "off",
    labelKey: "settings.backgroundAnimationBudget.off",
    descriptionKey: "settings.backgroundAnimationBudget.offDescription",
  },
];

// Helper to measure latency to a CDN server
const pingServer = async (url: string): Promise<number> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

  const start = performance.now();
  try {
    await fetch(`${url}?t=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal,
    });
    const duration = performance.now() - start;
    clearTimeout(timeoutId);
    return Math.round(duration);
  } catch (_err) {
    clearTimeout(timeoutId);
    return 9999; // Return high latency for failed pings
  }
};

const SETUP_STORAGE_KEYS = {
  completed: "moesekai_setup_completed",
  inProgress: "moesekai_setup_in_progress",
  step: "moesekai_setup_step",
} as const;

function getLanguageGuideCopy(t: (key: string) => string, locale: UiLocale) {
  return {
    title: t("page.setup.languageBilingualTitle"),
    description: t("page.setup.languageBilingualDesc"),
    subtitle: t(`page.setup.languageOptionSubtitles.${locale}`),
  };
}

// Hello greetings list to cycle in Step 0
const GREETINGS = [
  "Hello",       // English
  "\u4f60\u597d", // Chinese
  "こんにちは",  // Japanese
  "Bonjour",     // French
  "Hola",        // Spanish
  "Ciao",        // Italian
  "Hallo",       // German
  "안녕하세요",    // Korean
];

interface SetupGuideProps {
  onComplete?: (showHint: boolean) => void;
}

export default function SetupGuide({ onComplete }: SetupGuideProps) {
  const { t, locale, setLocale } = useI18n();
  const {
    themeCharId,

    setThemeCharacter,
    colorSchemePreference,
    setColorSchemePreference,
    backgroundAnimationBudget,
    setBackgroundAnimationBudget,
    isShowSpoiler,
    setShowSpoiler,
    useTrainedThumbnail,
    setUseTrainedThumbnail,
    assetSource,
    setAssetSource,
    serverSource,
    setServerSource,
    useLLMTranslation,
    setUseLLMTranslation,
  } = useTheme();

  const prefersReducedMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [pings, setPings] = useState<Record<string, number | null>>({
    main: null,
    overseas: null
  });
  const [isPinging, setIsPinging] = useState(false);

  // Defer mounting to avoid SSR hydration mismatches
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setMounted(true);

      const completed = localStorage.getItem(SETUP_STORAGE_KEYS.completed) === "true";
      const inProgress = localStorage.getItem(SETUP_STORAGE_KEYS.inProgress);
      const savedStep = localStorage.getItem(SETUP_STORAGE_KEYS.step);
      const savedLocale = localStorage.getItem(UI_LOCALE_STORAGE_KEY);

      if (!completed && !savedLocale) {
        setLocale((currentLocale) => detectBrowserUiLocale(currentLocale));
      }

      if (inProgress === "true" && savedStep) {
        setCurrentStep(Number(savedStep));
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [setLocale]);

  // Sync step changes to localStorage in case of page reload/refresh
  const handleStepChange = (step: number) => {
    setCurrentStep(step);
    if (step > 0 && step < 6) {
      localStorage.setItem(SETUP_STORAGE_KEYS.inProgress, "true");
      localStorage.setItem(SETUP_STORAGE_KEYS.step, String(step));
    }
  };

  // Cycle through greetings in Step 0
  useEffect(() => {
    if (currentStep !== 0) return;
    const interval = setInterval(() => {
      setGreetingIndex((prev) => (prev + 1) % GREETINGS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Assets latency ping test & auto-selection
  useEffect(() => {
    if (currentStep !== 3 || isPinging || (pings.main !== null && pings.overseas !== null)) return;

    const runPingTest = async () => {
      setIsPinging(true);
      const [mainPing, overseasPing] = await Promise.all([
        pingServer("https://storage.exmeaning.com"),
        pingServer("https://storage.pjsk.moe")
      ]);

      setPings({
        main: mainPing,
        overseas: overseasPing
      });
      setIsPinging(false);

      // Auto select the route with the lower latency
      const preferredType = mainPing <= overseasPing ? "main" : "overseas";
      setAssetSource(preferredType as AssetSourceType);
    };

    runPingTest();
  }, [currentStep, pings, isPinging, setAssetSource]);

  if (!mounted || isExiting) return null;

  // Render check for completed setup
  const isCompleted = localStorage.getItem(SETUP_STORAGE_KEYS.completed) === "true";
  if (isCompleted) return null;

  const completeSetup = () => {
    setIsExiting(true);
    localStorage.setItem(SETUP_STORAGE_KEYS.completed, "true");
    localStorage.removeItem(SETUP_STORAGE_KEYS.inProgress);
    localStorage.removeItem(SETUP_STORAGE_KEYS.step);
    onComplete?.(true);
  };

  const handleFinish = () => {
    completeSetup();
  };

  const handleSkip = () => {
    completeSetup();
  };

  const languageCopy = getLanguageGuideCopy(t, locale);

  // MD3 Expressive container variants (spatial spring for position, effects for opacity)
  const slideVariants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: md3EffectsFast },
        exit: { opacity: 0, transition: md3EffectsFast },
      }
    : {
        initial: { opacity: 0, x: 48 },
        animate: { opacity: 1, x: 0, transition: md3SpatialDefault },
        exit: { opacity: 0, x: -48, transition: md3EffectsFast },
      };


  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/32 p-0 sm:p-6 overflow-hidden">
      {/* Main setup container: Dialog card on desktop, full screen on mobile */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full h-full sm:max-w-md sm:h-[720px] rounded-none sm:rounded-md3-xl shadow-none sm:shadow-elev-3 overflow-hidden bg-surface-container-high flex flex-col justify-between p-6 sm:p-8 text-on-surface"
      >

        {/* ─── Top Header (Step counter & branding) ─── */}
        <div className="flex items-center justify-between w-full h-8 z-10">
          {currentStep > 0 && currentStep < 6 ? (
            <Button variant="text" size="xs" icon={mdChevronLeft} onClick={() => handleStepChange(currentStep - 1)} className="-ml-3">
              {t("page.setup.back")}
            </Button>
          ) : (
            <div />
          )}

          {currentStep > 0 && currentStep < 6 && (
            <span className="type-label-m text-on-surface-variant">
              {t("page.setup.stepIndicator", { current: String(currentStep), total: "5" })}
            </span>
          )}
          {currentStep < 6 ? (
            <Button variant="text" size="xs" onClick={handleSkip} className="-mr-3 text-on-surface-variant">
              {currentStep <= 1 ? t("page.setup.skipBilingual") : t("page.setup.skip")}
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* ─── Step Contents (framer-motion animated) ─── */}
        <div className="flex-1 flex flex-col justify-center my-4 sm:my-6 overflow-y-auto px-1 z-10 select-none">
          <AnimatePresence mode="wait">
            
            {/* STEP 0: Hello & Moesekai branding */}
            {currentStep === 0 && (
              <motion.div
                key="step0"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center text-center space-y-6"
              >
                {/* Greeting animation */}
                <div className="h-16 flex items-center justify-center">
                  <motion.h1
                    key={greetingIndex}
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -15 }}
                    transition={md3SpatialDefault}
                    className="type-display-m type-emphasized text-primary"
                  >
                    {GREETINGS[greetingIndex]}
                  </motion.h1>
                </div>

                {/* Brand Logo & Name */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="h-12 w-44 bg-primary"
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
                  <h2 className="type-title-l text-on-surface mt-1">
                    Moesekai
                  </h2>
                  <p className="type-label-m text-on-surface-variant">
                    {t("page.home.formerName")}
                  </p>
                  <p className="type-title-s text-on-surface">
                    {t("page.setup.welcomeBilingual")}
                  </p>
                </div>

                <p className="type-body-m text-on-surface-variant max-w-xs whitespace-pre-line">
                  {t("page.setup.welcomeBilingualDesc")}
                </p>
              </motion.div>
            )}

            {/* STEP 1: Language Selector */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col space-y-5"
              >
                <div className="space-y-2">
                  <h2 className="type-headline-s text-on-surface">
                    {languageCopy.title}
                  </h2>
                  <p className="type-body-m text-on-surface-variant">
                    {languageCopy.description}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  {SUPPORTED_UI_LOCALES.map((l) => {
                    const isSelected = locale === l;
                    return (
                      <button
                        key={l}
                        onClick={() => {
                          setLocale(l);
                          if (l !== "zh-CN") {
                            setUseLLMTranslation(false);
                          }
                          handleStepChange(2);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        className={`state-layer focus-ring w-full p-4 rounded-md3-lg flex items-center justify-between border text-left transition-colors duration-200 ${
                          isSelected
                            ? "bg-secondary-container text-on-secondary-container border-transparent"
                            : "bg-surface-container-low border-outline-variant"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="type-title-m">
                            {UI_LOCALE_LABELS[l]}
                          </span>
                          <span className="type-body-s opacity-75">
                            {getLanguageGuideCopy(t, l).subtitle}
                          </span>
                        </div>
                        {isSelected && (
                          <Icon path={mdCheckCircle} size={24} className="text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-1 flex items-start gap-2 rounded-md3-md bg-tertiary-container px-3 py-2 type-body-s text-on-tertiary-container">
                  <Icon path={mdInfo} size={16} className="mt-0.5 shrink-0" />
                  <span>{t("settings.uiLanguage.machineTranslationNotice")}</span>
                </p>
              </motion.div>
            )}

            {/* STEP 2: Data Server Source */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col space-y-5"
              >
                <div className="space-y-2">
                  <h2 className="type-headline-s text-on-surface">
                    {t("page.setup.serverTitle")}
                  </h2>
                  <p className="type-body-m text-on-surface-variant">
                    {t("page.setup.serverDesc")}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2 max-h-[360px] overflow-y-auto pr-1">
                  {(["jp", "cn", "en", "tw", "kr"] as ServerSourceType[]).map((srv) => {
                    const isSelected = serverSource === srv;
                    const serverDescription = t(`common.serverDescription.${srv}`);
                    return (
                      <button
                        key={srv}
                        onClick={() => {
                          setServerSource(srv);
                          handleStepChange(3);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        className={`state-layer focus-ring w-full p-4 rounded-md3-lg flex items-center justify-between border text-left transition-colors duration-200 shrink-0 ${
                          isSelected
                            ? "bg-secondary-container text-on-secondary-container border-transparent"
                            : "bg-surface-container-low border-outline-variant"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="type-title-m">
                            <ServerRegionLabel server={srv} size={24} />
                          </span>
                          <span className="type-body-s opacity-75">
                            {serverDescription}
                          </span>
                        </div>
                        {isSelected && (
                          <Icon path={mdCheckCircle} size={24} className="text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 3: Assets Route (only main and overseas main) */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col space-y-5"
              >
                <div className="space-y-2">
                  <h2 className="type-headline-s text-on-surface">
                    {t("page.setup.assetTitle")}
                  </h2>
                  <p className="type-body-m text-on-surface-variant">
                    {t("page.setup.assetDesc")}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  {[
                    { type: "main" as AssetSourceType, label: t("page.setup.assetMain"), desc: "Primary CDN optimized for loading speeds" },
                    { type: "overseas" as AssetSourceType, label: t("page.setup.assetOverseas"), desc: "Global CDN fallback for overseas connections" }
                  ].map((assetOpt) => {
                    const isSelected = assetSource === assetOpt.type;
                    return (
                      <button
                        key={assetOpt.type}
                        onClick={() => {
                          setAssetSource(assetOpt.type);
                          handleStepChange(4);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        className={`state-layer focus-ring w-full p-4 rounded-md3-lg flex items-center justify-between border text-left transition-colors duration-200 ${
                          isSelected
                            ? "bg-secondary-container text-on-secondary-container border-transparent"
                            : "bg-surface-container-low border-outline-variant"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="type-title-m flex items-center gap-2">
                            {assetOpt.label}
                            {assetOpt.type.startsWith("main") ? (
                              pings.main === null ? (
                                isPinging ? (
                                  <span className="type-label-s text-on-surface-variant animate-pulse">({t("page.setup.testingPing")})</span>
                                ) : null
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded-md3-xs type-label-s border ${
                                  pings.main === 9999
                                    ? "text-red-500 bg-red-500/10 border-red-500/20"
                                    : pings.main < 100
                                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                                    : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                                }`}>
                                  {pings.main === 9999 ? t("page.setup.timeout") : `${pings.main} ms`}
                                </span>
                              )
                            ) : (
                              pings.overseas === null ? (
                                isPinging ? (
                                  <span className="type-label-s text-on-surface-variant animate-pulse">({t("page.setup.testingPing")})</span>
                                ) : null
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded-md3-xs type-label-s border ${
                                  pings.overseas === 9999
                                    ? "text-red-500 bg-red-500/10 border-red-500/20"
                                    : pings.overseas < 100
                                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                                    : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                                }`}>
                                  {pings.overseas === 9999 ? t("page.setup.timeout") : `${pings.overseas} ms`}
                                </span>
                              )
                            )}
                          </span>
                          <span className="type-body-s opacity-75">
                            {assetOpt.desc}
                          </span>
                        </div>
                        {isSelected && (
                          <Icon path={mdCheckCircle} size={24} className="text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 4: Appearance & Character Theme Color Selection */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="type-headline-s text-on-surface">
                    {t("page.setup.themeTitle")}
                  </h2>
                  <p className="type-body-m text-on-surface-variant">
                    {t("page.setup.themeDesc")}
                  </p>
                </div>

                {/* Appearance cards */}
                <div className="space-y-2">
                  <h3 className="type-title-s text-on-surface-variant">
                    {t("page.setup.appearanceTitle")}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "light" as const, label: t("page.setup.appearanceMockLight"), icon: mdLightMode },
                      { id: "dark" as const, label: t("page.setup.appearanceMockDark"), icon: mdDarkMode },
                      { id: "system" as const, label: t("page.setup.appearanceMockSystem"), icon: mdBrightnessAuto }
                    ].map((pref) => {
                      const isSelected = colorSchemePreference === pref.id;
                      return (
                        <button
                          key={pref.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setColorSchemePreference(pref.id)}
                          className={`state-layer focus-ring p-3 rounded-md3-md border text-center transition-colors duration-200 flex flex-col items-center gap-1.5 ${
                            isSelected ? "bg-secondary-container text-on-secondary-container border-transparent" : "bg-surface-container-low text-on-surface-variant border-outline-variant"
                          }`}
                        >
                          <Icon path={pref.icon} size={20} />
                          <span className="type-label-s truncate w-full">{pref.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Background animation budget */}
                <div className="space-y-2">
                  <h3 className="type-title-s text-on-surface-variant">
                    {t("page.setup.backgroundAnimationTitle")}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_ANIMATION_BUDGET_OPTIONS.map((option) => {
                      const isSelected = backgroundAnimationBudget === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setBackgroundAnimationBudget(option.id)}
                          type="button"
                          aria-pressed={isSelected}
                          className={`state-layer focus-ring p-3 rounded-md3-md border text-center transition-colors duration-200 flex flex-col items-center gap-1 ${
                            isSelected
                              ? "bg-secondary-container text-on-secondary-container border-transparent"
                              : "bg-surface-container-low text-on-surface border-outline-variant"
                          }`}
                        >
                          <span className="type-label-m truncate w-full">
                            {t(option.labelKey)}
                          </span>
                          <span className="text-[10px] leading-tight opacity-75 line-clamp-2">
                            {t(option.descriptionKey)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Theme character color scroll list */}
                <div className="space-y-2">
                  <h3 className="type-title-s text-on-surface-variant">
                    {t("page.setup.themeColorTitle")}
                  </h3>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin">
                    {SELECTED_THEME_CHARACTERS.map((char) => {
                      const color = CHAR_COLORS[char.id];
                      const isSelected = themeCharId === char.id;
                      const charName = getCharacterName(t, Number(char.id), "short");
                      return (
                        <button
                          key={char.id}
                          onClick={() => setThemeCharacter(char.id)}
                          type="button"
                          aria-pressed={isSelected}
                          className={`state-layer focus-ring flex flex-col items-center gap-1 shrink-0 p-2.5 rounded-md3-lg transition-colors duration-200 ${
                            isSelected
                              ? "bg-secondary-container text-on-secondary-container"
                              : "bg-surface-container-low text-on-surface-variant"
                          }`}
                        >
                          <span
                            className={`w-10 h-10 flex items-center justify-center text-white shadow-elev-1 transition-[border-radius] duration-300 ease-md3-standard ${isSelected ? "rounded-md3-md" : "rounded-full"}`}
                            style={{
                              backgroundColor: color,
                            }}
                          >
                            {isSelected && (
                              <Icon path={mdCheck} size={22} className="drop-shadow" />
                            )}
                          </span>
                          <span className="type-label-s">
                            {charName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 5: Content Preferences */}
            {currentStep === 5 && (
              <motion.div
                key="step5"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col space-y-5"
              >
                <div className="space-y-2">
                  <h2 className="type-headline-s text-on-surface">
                    {t("page.setup.contentTitle")}
                  </h2>
                  <p className="type-body-m text-on-surface-variant">
                    {t("page.setup.contentDesc")}
                  </p>
                </div>

                <div className="flex flex-col bg-surface-card border border-outline-variant/70 rounded-md3-lg divide-y divide-outline-variant">
                  {/* Spoiler toggle */}
                  <Switch
                    className="p-4"
                    checked={!!isShowSpoiler}
                    onCheckedChange={(checked) => setShowSpoiler(checked)}
                    label={t("settings.showSpoiler.label")}
                    description={t("settings.showSpoiler.description")}
                  />

                  {/* Trained thumbnail toggle */}
                  <Switch
                    className="p-4"
                    checked={!!useTrainedThumbnail}
                    onCheckedChange={(checked) => setUseTrainedThumbnail(checked)}
                    label={t("settings.trainedThumbnail.label")}
                    description={t("settings.trainedThumbnail.description")}
                  />

                  {/* LLM translation toggle — only shown when locale is zh-CN */}
                  {locale === "zh-CN" && (
                    <Switch
                    className="p-4"
                    checked={!!useLLMTranslation}
                    onCheckedChange={(checked) => setUseLLMTranslation(checked)}
                    label={t("settings.translation.label")}
                    description={t("settings.translation.description")}
                  />
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 6: Activation Success */}
            {currentStep === 6 && (
              <motion.div
                key="step6"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center text-center space-y-6"
              >
                {/* Huge animated checkmark circle */}
                <motion.div
                  initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                  transition={md3SpatialDefault}
                  className="w-24 h-24 rounded-md3-xl flex items-center justify-center bg-primary text-on-primary shadow-elev-2"
                >
                  <Icon path={mdCheck} size={48} />
                </motion.div>

                <div className="space-y-2">
                  <h2 className="type-headline-l text-on-surface">
                    {t("page.setup.finishTitle")}
                  </h2>
                  <p className="type-body-m text-on-surface-variant max-w-xs">
                    {t("page.setup.finishDesc")}
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ─── Bottom Actions (Pill buttons) ─── */}
        <div className="w-full flex flex-col gap-3 z-10">
          {currentStep === 0 ? (
            <Button variant="filled" size="m" fullWidth trailingIcon={mdChevronRight} onClick={() => handleStepChange(1)}>
              {t("page.setup.getStartedBilingual")}
            </Button>
          ) : currentStep === 6 ? (
            <Button variant="filled" size="m" fullWidth trailingIcon={mdArrowForward} onClick={handleFinish}>
              {t("page.setup.startExploring")}
            </Button>
          ) : (
            <Button variant="filled" size="m" fullWidth trailingIcon={mdChevronRight} onClick={() => handleStepChange(currentStep + 1)}>
              {t("page.setup.next")}
            </Button>
          )}

          {/* Indicator bar style */}
          <div className="flex justify-center gap-1.5 pt-2">
            {[0, 1, 2, 3, 4, 5, 6].map((stepIdx) => {
              const isActive = currentStep === stepIdx;
              return (
                <span
                  key={stepIdx}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-md3-spatial-fast ${isActive ? "w-4 bg-primary" : "w-1.5 bg-outline-variant"}`}
                />
              );
            })}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
