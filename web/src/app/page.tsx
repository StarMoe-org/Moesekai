"use client";
import React, { useState, useEffect, Suspense } from "react";
import Link from "@/components/LocalizedLink";
import SetupGuide from "@/components/home/SetupGuide";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import HeroCarousel from "@/components/home/HeroCarousel";
import CurrentEventTab from "@/components/home/CurrentEventTab";
import LatestCardsTab from "@/components/home/LatestCardsTab";
import LatestMusicTab from "@/components/home/LatestMusicTab";
import UpcomingLiveTab from "@/components/home/UpcomingLiveTab";
import AnnouncementSection from "@/components/home/AnnouncementSection";
import BirthdaySection from "@/components/home/BirthdaySection";
import { MOE_LOGO_URL } from "@/lib/assets";
import { MOESEKAI_BILIBILI_SPACE_URL } from "@/lib/team-links";
import { useI18n } from "@/contexts/I18nContext";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getMotionTransition } from "@/lib/motion";
import { Button, Dialog, Icon, Checkbox } from "@/components/md3";
import {
  mdAccountCircle,
  mdApparel,
  mdArrowForward,
  mdAssignmentTurnedIn,
  mdCalendarMonth,
  mdCasino,
  mdChevronRight,
  mdClose,
  mdEvent,
  mdHelp,
  mdHome,
  mdKeyboardArrowDown,
  mdKeyboardArrowUp,
  mdLiveTv,
  mdMenuBook,
  mdMusicNote,
  mdOpenInNew,
  mdPerson,
  mdPlayCircle,
  mdSentimentSatisfied,
  mdSettings,
  mdStyle,
  mdTrendingUp,
  mdFlag,
  mdVerified,
} from "@/components/md3/icons";

type HomeSectionId = "event" | "cards" | "music" | "live";

type HomeSectionConfig = {
  id: HomeSectionId;
  labelKey: string;
  icon: string;
};

const HOME_SECTIONS: HomeSectionConfig[] = [
  { id: "event", labelKey: "page.home.tabs.event", icon: mdEvent },
  { id: "cards", labelKey: "page.home.tabs.cards", icon: mdStyle },
  { id: "music", labelKey: "page.home.tabs.music", icon: mdMusicNote },
  { id: "live", labelKey: "page.home.tabs.live", icon: mdLiveTv },
];
const HOME_LAYOUT_STORAGE_KEY = "home_dynamic_sections";

function getInitialHomeLayout(): { order: HomeSectionId[]; hidden: HomeSectionId[] } {
  const fallback = { order: HOME_SECTIONS.map((section) => section.id), hidden: [] as HomeSectionId[] };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as { order?: HomeSectionId[]; hidden?: HomeSectionId[] };
    const validIds = new Set(HOME_SECTIONS.map((section) => section.id));
    const savedOrder = Array.isArray(parsed?.order) ? [...new Set(parsed.order.filter((id) => validIds.has(id)))] : [];
    const missingIds = HOME_SECTIONS.map((section) => section.id).filter((id) => !savedOrder.includes(id));
    return {
      order: [...savedOrder, ...missingIds],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => validIds.has(id)) : [],
    };
  } catch {
    return fallback;
  }
}

// Loading fallback component
function TabLoading() {
  return (
    <div className="animate-pulse">
      <div className="rounded-md3-xl bg-surface-container-high h-48 w-full" />
      <div className="mt-4 space-y-2">
        <div className="h-5 bg-surface-container-highest rounded-md3-xs w-3/4" />
        <div className="h-4 bg-surface-container-high rounded-md3-xs w-1/2" />
      </div>
    </div>
  );
}

const BILIBILI_ICON_PATH =
  "M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z";

function BilibiliIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={BILIBILI_ICON_PATH} />
    </svg>
  );
}

// Shortcut definitions with icons
const SHORTCUTS: { href: string; labelKey: string; subLabel: string; icon?: string; isExternal?: boolean; badgeKey?: string }[] = [
  { href: "/cards", labelKey: "page.home.shortcuts.cards", subLabel: "CARD", icon: mdStyle },
  { href: "/music", labelKey: "page.home.shortcuts.music", subLabel: "MUSIC", icon: mdMusicNote },
  { href: "/events", labelKey: "page.home.shortcuts.events", subLabel: "EVENT", icon: mdCalendarMonth },
  { href: "/gacha", labelKey: "page.home.shortcuts.gacha", subLabel: "GACHA", icon: mdCasino },
  { href: "/character", labelKey: "page.home.shortcuts.character", subLabel: "CHARA", icon: mdPerson },
  { href: "/sticker", labelKey: "page.home.shortcuts.sticker", subLabel: "STICKER", icon: mdSentimentSatisfied },
  { href: "/comic", labelKey: "page.home.shortcuts.comic", subLabel: "COMIC", icon: mdMenuBook },
  { href: "/live", labelKey: "page.home.shortcuts.live", subLabel: "LIVE", icon: mdLiveTv },
  { href: "/mysekai", labelKey: "page.home.shortcuts.mysekai", subLabel: "MYSEKAI", icon: mdHome },
  { href: "/costumes", labelKey: "page.home.shortcuts.costumes", subLabel: "COSTUME", icon: mdApparel },
  { href: "/honors", labelKey: "page.home.shortcuts.honors", subLabel: "HONOR", icon: mdVerified },
  { href: "/profile", labelKey: "page.home.shortcuts.profile", subLabel: "PROFILE", icon: mdAccountCircle },
  { href: "/deck-recommend", labelKey: "page.home.shortcuts.deckRecommend", subLabel: "DECK", icon: mdAssignmentTurnedIn },
  { href: "/prediction-next", labelKey: "page.home.shortcuts.prediction", subLabel: "PREDICT", icon: mdTrendingUp },
  { href: "/prediction-next/planner", labelKey: "page.home.shortcuts.predictionPlanner", subLabel: "PLANNER", icon: mdFlag },
  { href: "/guess-who", labelKey: "page.home.shortcuts.guessWho", subLabel: "GUESS", icon: mdHelp },
  { href: "/chart-preview", labelKey: "page.home.shortcuts.chartPreview", subLabel: "CHART", icon: mdPlayCircle },
  {
    href: MOESEKAI_BILIBILI_SPACE_URL,
    labelKey: "page.home.shortcuts.bilibili",
    subLabel: "BILIBILI",
    isExternal: true,
    badgeKey: "page.home.shortcuts.bilibiliBadge",
  },
];

function SectionHeading({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="type-title-l text-on-surface">{children}</h2>
      {actions}
    </div>
  );
}

function DynamicHomeSection({ section }: { section: HomeSectionId }) {
  return (
    <div className="space-y-3">
      {section === "event" && <CurrentEventTab />}
      {section === "cards" && <LatestCardsTab />}
      {section === "music" && <LatestMusicTab />}
      {section === "live" && <UpcomingLiveTab />}
    </div>
  );
}

const FRIEND_LINK_BASE_CLASS =
  "state-layer focus-ring relative group overflow-hidden rounded-md3-lg h-16 bg-surface-card text-on-surface ring-1 transition-shadow duration-200 hover:shadow-elev-1";
const FRIEND_LINK_CLASS = `${FRIEND_LINK_BASE_CLASS} ring-outline-variant/70`;

export default function Home() {
  const { t } = useI18n();
  const [homeOrder, setHomeOrder] = useState<HomeSectionId[]>(HOME_SECTIONS.map((section) => section.id));
  const [hiddenHomeSections, setHiddenHomeSections] = useState<HomeSectionId[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const layout = getInitialHomeLayout();
      setHomeOrder(layout.order);
      setHiddenHomeSections(layout.hidden);
      setLayoutReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [isHomeCustomizeOpen, setIsHomeCustomizeOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showSettingsHint, setShowSettingsHint] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hintTransition = getMotionTransition("soft", {
    reducedMotion: !!prefersReducedMotion,
  });

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const completed = localStorage.getItem("moesekai_setup_completed") === "true";
      if (!completed) {
        setShowSetup(true);
      }
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (!layoutReady) return;
    try {
      localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify({ order: homeOrder, hidden: hiddenHomeSections }));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [homeOrder, hiddenHomeSections, layoutReady]);

  useEffect(() => {
    if (!showSettingsHint) return;
    const timer = setTimeout(() => {
      setShowSettingsHint(false);
    }, 6000);
    return () => clearTimeout(timer);
  }, [showSettingsHint]);

  return (
    <MainLayout showLoader={true}>
      {showSetup && (
        <SetupGuide
          onComplete={(showHint) => {
            setShowSetup(false);
            if (showHint) {
              setShowSettingsHint(true);
            }
          }}
        />
      )}

      <AnimatePresence>
        {showSettingsHint && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            transition={hintTransition}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-md bg-inverse-surface text-inverse-on-surface shadow-elev-3 p-4 rounded-md3-lg flex items-center gap-3 text-left"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-inverse-primary/20 text-inverse-primary flex items-center justify-center">
              <Icon path={mdSettings} size={24} />
            </div>
            <div className="flex-1 pr-2">
              <p className="type-body-m">
                {t("page.setup.settingsHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettingsHint(false)}
              aria-label={t("common.action.close")}
              className="state-layer focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-inverse-on-surface"
            >
              <Icon path={mdClose} size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pt-6 pb-16 flex flex-col items-center gap-8">

        {/* ─── Logo (compact inline) ─── */}
        <div className="flex flex-col items-center gap-1 animate-fade-in-up">
          <h1 className="flex items-center gap-2">
            <div
              className="h-10 w-40 sm:h-12 sm:w-48 bg-primary"
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
              aria-label="Moesekai"
            />
            <span className="sr-only">Moesekai</span>
          </h1>
          <span className="type-label-m text-on-surface-variant">{t("page.home.formerName")}</span>
        </div>

        {/* ─── Hero Carousel ─── */}
        <div className="w-full max-w-5xl">
          <HeroCarousel />
        </div>

        {/* ─── Dynamic home sections ─── */}
        <div className="w-full max-w-5xl">
          <SectionHeading
            actions={
              <Button variant="tonal" size="xs" icon={mdSettings} onClick={() => setIsHomeCustomizeOpen(true)}>
                {t("page.home.customize.open")}
              </Button>
            }
          >
            {t("page.home.sections.latest")}
          </SectionHeading>

          <Suspense fallback={<TabLoading />}>
            <div className="space-y-6 text-left">
              {homeOrder.filter((id) => !hiddenHomeSections.includes(id)).map((id) => {
                const section = HOME_SECTIONS.find((item) => item.id === id);
                if (!section) return null;
                return (
                  <section key={id} aria-labelledby={`home-section-${id}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <Icon path={section.icon} size={20} className="text-primary" />
                      <h3 id={`home-section-${id}`} className="type-title-m text-on-surface">{t(section.labelKey)}</h3>
                    </div>
                    <DynamicHomeSection section={id} />
                  </section>
                );
              })}
            </div>
          </Suspense>
        </div>

        <Dialog
          isOpen={isHomeCustomizeOpen}
          onClose={() => setIsHomeCustomizeOpen(false)}
          title={t("page.home.customize.title")}
          size="sm"
          syncHistory={false}
        >
          <p className="mb-4 type-body-m text-on-surface-variant">{t("page.home.customize.description")}</p>
          <div className="space-y-2">
            {homeOrder.map((id, index) => {
              const section = HOME_SECTIONS.find((item) => item.id === id);
              if (!section) return null;
              const isHidden = hiddenHomeSections.includes(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-md3-md bg-surface-container-low px-3 py-2">
                  <Checkbox
                    checked={!isHidden}
                    onCheckedChange={(checked) => setHiddenHomeSections((current) => checked ? current.filter((item) => item !== id) : [...current, id])}
                    label={t(section.labelKey)}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => setHomeOrder((current) => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })}
                    className="state-layer focus-ring flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant disabled:opacity-38"
                    aria-label={t("page.home.customize.moveUp")}
                  >
                    <Icon path={mdKeyboardArrowUp} size={20} />
                  </button>
                  <button
                    type="button"
                    disabled={index === homeOrder.length - 1}
                    onClick={() => setHomeOrder((current) => {
                      const next = [...current];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      return next;
                    })}
                    className="state-layer focus-ring flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant disabled:opacity-38"
                    aria-label={t("page.home.customize.moveDown")}
                  >
                    <Icon path={mdKeyboardArrowDown} size={20} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="text"
              onClick={() => {
                setHomeOrder(HOME_SECTIONS.map((section) => section.id));
                setHiddenHomeSections([]);
              }}
            >
              {t("page.home.customize.reset")}
            </Button>
            <Button variant="filled" onClick={() => setIsHomeCustomizeOpen(false)}>
              {t("common.action.close")}
            </Button>
          </div>
        </Dialog>

        {/* ─── Shortcuts ─── */}
        <div className="w-full max-w-5xl">
          <SectionHeading>{t("page.home.sections.shortcuts")}</SectionHeading>
          <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-9 gap-2">
            {SHORTCUTS.map((shortcut, index) => {
              const content = (
                <div className={`relative h-full p-3 rounded-md3-lg bg-surface-card flex flex-col items-center gap-1.5 text-center transition-[background-color,box-shadow] duration-200 ease-md3-standard group-hover:shadow-elev-1 ring-1 ${shortcut.isExternal ? "ring-[#fb7299]/40" : "ring-outline-variant/70"}`}>
                  {shortcut.badgeKey && (
                    <span className="absolute -top-1.5 -right-1 bg-[#fb7299] text-white text-[9px] font-black px-1.5 rounded-full">
                      {t(shortcut.badgeKey)}
                    </span>
                  )}
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md3-md transition-[border-radius] duration-200 ease-md3-standard group-hover:rounded-full ${shortcut.isExternal ? "bg-[#fb7299]/15 text-[#fb7299]" : "bg-secondary-container text-on-secondary-container"}`}>
                    {shortcut.icon ? <Icon path={shortcut.icon} size={22} /> : <BilibiliIcon className="w-5 h-5" />}
                  </span>
                  <div>
                    <h3 className={`type-label-m leading-tight ${shortcut.isExternal ? "text-[#fb7299]" : "text-on-surface"}`}>{t(shortcut.labelKey)}</h3>
                    <p className="text-[8px] text-on-surface-variant font-bold tracking-wider uppercase hidden sm:block">{shortcut.subLabel}</p>
                  </div>
                </div>
              );

              if (shortcut.isExternal) {
                return (
                  <ExternalLink key={index} href={shortcut.href} className="group state-layer focus-ring block rounded-md3-lg">
                    {content}
                  </ExternalLink>
                );
              }

              return (
                <Link key={index} href={shortcut.href} className="group state-layer focus-ring block rounded-md3-lg">
                  {content}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ─── Announcements ─── */}
        <div className="w-full max-w-5xl text-left space-y-3">
          <SectionHeading
            actions={
              <Button variant="text" size="xs" trailingIcon={mdChevronRight} href="/information">
                {t("page.home.announcements.viewAll")}
              </Button>
            }
          >
            {t("page.information.latestAnnouncements")}
          </SectionHeading>

          {/* Scheme B: PJSK Intelligence Bureau Collaborative Banner */}
          <div className="rounded-md3-lg bg-surface-container-low p-3.5 sm:p-4 border-l-4 border-l-[#fb7299] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 overflow-hidden">
            <div className="flex items-start sm:items-center gap-3 min-w-0 w-full">
              <div className="w-10 h-10 rounded-md3-md bg-[#fb7299] text-white flex items-center justify-center shrink-0">
                <BilibiliIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="type-title-s text-on-surface">{t("page.home.announcements.bilibiliTitle")}</span>
                  <span className="bg-[#fb7299]/15 text-[#fb7299] text-[10px] font-black px-1.5 py-0.5 rounded-md3-xs">
                    {t("page.home.announcements.bilibiliBadge")}
                  </span>
                </div>
                <p className="type-body-s text-on-surface-variant mt-0.5 break-words">
                  {t("page.home.announcements.bilibiliDescription")}
                </p>
              </div>
            </div>
            <ExternalLink
              href={MOESEKAI_BILIBILI_SPACE_URL}
              className="state-layer focus-ring shrink-0 h-10 type-label-l bg-[#fb7299] text-white px-4 rounded-full flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>{t("page.home.announcements.bilibiliAction")}</span>
              <Icon path={mdOpenInNew} size={18} />
            </ExternalLink>
          </div>

          <AnnouncementSection />
        </div>

        {/* ─── Birthdays / Anniversaries ─── */}
        <BirthdaySection />

        {/* ─── Friend Links ─── */}
        <div className="w-full max-w-5xl">
          <SectionHeading>{t("page.home.sections.friends")}</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Scheme A: Bilibili Intelligence Bureau Card */}
            <ExternalLink
              href={MOESEKAI_BILIBILI_SPACE_URL}
              target="_blank"
              className={`${FRIEND_LINK_BASE_CLASS} ring-[#fb7299]/40`}
            >
              <div className="relative z-10 h-full flex items-center justify-between px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md3-sm bg-[#fb7299]/15 text-[#fb7299] flex items-center justify-center shrink-0 group-hover:bg-[#fb7299] group-hover:text-white transition-colors duration-200">
                    <BilibiliIcon className="w-4 h-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <h3 className="type-title-s text-on-surface group-hover:text-[#fb7299] transition-colors truncate">
                      {t("page.home.friends.bilibiliTitle")}
                    </h3>
                    <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider truncate">
                      BILIBILI
                    </p>
                  </div>
                </div>
                <Icon path={mdArrowForward} size={18} className="text-on-surface-variant group-hover:text-[#fb7299] transition-colors ml-2" />
              </div>
            </ExternalLink>

            <ExternalLink href="https://haruki.seiunx.com" target="_blank" className={FRIEND_LINK_CLASS}>
              <div className="relative z-10 h-full flex items-center justify-between px-4">
                <div className="text-left min-w-0">
                  <h3 className="type-title-s text-on-surface truncate">{t("page.home.friends.harukiTitle")}</h3>
                  <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider truncate">Haruki Toolbox</p>
                </div>
                <Icon path={mdArrowForward} size={18} className="text-on-surface-variant group-hover:text-primary transition-colors ml-2" />
              </div>
            </ExternalLink>

            <ExternalLink href="https://viewer.unipjsk.com" target="_blank" className={FRIEND_LINK_CLASS}>
              <div className="relative z-10 h-full flex items-center justify-between px-4">
                <div className="text-left min-w-0">
                  <h3 className="type-title-s text-on-surface truncate">Uni Viewer</h3>
                  <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider truncate">Uni PJSK</p>
                </div>
                <Icon path={mdArrowForward} size={18} className="text-on-surface-variant group-hover:text-primary transition-colors ml-2" />
              </div>
            </ExternalLink>

            <ExternalLink href="https://3-3.dev" target="_blank" className={FRIEND_LINK_CLASS}>
              <div className="relative z-10 h-full flex items-center justify-between px-4">
                <div className="text-left min-w-0">
                  <h3 className="type-title-s text-on-surface truncate">33kit</h3>
                  <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider truncate">3-3.dev</p>
                </div>
                <Icon path={mdArrowForward} size={18} className="text-on-surface-variant group-hover:text-primary transition-colors ml-2" />
              </div>
            </ExternalLink>
          </div>
        </div>

        {/* ─── Credits ─── */}
        <div className="w-full max-w-5xl pt-6 border-t border-outline-variant">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="type-title-s text-on-surface-variant">{t("page.home.sections.specialThanks")}</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center type-body-m">
              <span className="text-on-surface-variant">{t("page.home.specialThanksPrefix")}</span>
              <ExternalLink href="https://github.com/MejiroRina" target="_blank" className="font-bold text-on-surface-variant hover:text-primary transition-colors">{t("page.home.specialThanksHaruki")}</ExternalLink>
              <span className="text-outline-variant">|</span>
              <ExternalLink href="https://sekai.best" target="_blank" className="font-bold text-on-surface-variant hover:text-primary transition-colors">Sekai.best</ExternalLink>
              <span className="text-outline-variant">|</span>
              <ExternalLink href="https://github.com/watagashi-uni" target="_blank" className="font-bold text-on-surface-variant hover:text-primary transition-colors">Uni</ExternalLink>
            </div>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}
