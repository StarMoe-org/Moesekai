import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";

import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { MasterDataProvider } from "@/contexts/MasterDataContext";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { QuickFilterProvider } from "@/contexts/QuickFilterContext";
import { BreadcrumbProvider } from "@/contexts/BreadcrumbContext";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { DEFAULT_THEME_SEED_ID, THEME_SEED_COLORS } from "@/lib/theme-seeds";
import { MD3_DEFAULT_SURFACE } from "@/styles/md3-default-surface.generated";
import "@fontsource-variable/roboto-flex/wght.css";
import {
  COLOR_SCHEME_STORAGE_KEY,
  DARK_MEDIA_QUERY,
  THEME_CHAR_STORAGE_KEY,
} from "@/lib/colorScheme";
import {
  ADSENSE_SCRIPT_ID,
  ADSENSE_SCRIPT_SRC,
  ADS_FEATURE_ENABLED,
  DEFAULT_SHOW_ADS,
  SHOW_ADS_STORAGE_KEY,
} from "@/lib/ads";
import { generateRootMetadata, getSiteBaseUrl } from "@/lib/seo-metadata";
import { generateRootJsonLd, generateSiteNavigationItemListJsonLd } from "@/lib/structured-data";
import GoogleTagBootstrap from "@/components/GoogleTagBootstrap";
import RootHeadScripts from "@/components/RootHeadScripts";
import {
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_HTML_LANG,
  UI_LOCALE_STORAGE_KEY,
  resolveAcceptLanguageUiLocale,
  resolveUiLocale,
} from "@/lib/i18n";
import { BACKGROUND_ANIMATION_BUDGET_STORAGE_KEY } from "@/lib/backgroundAnimation";
import { isRouteLocale, routeLocaleToUiLocale, SUPPORTED_ROUTE_LOCALES } from "@/lib/locale-routing";
import { buildGoogleTagBootstrapScript } from "@/lib/googleTag";
import { serializeJsonLd } from "@/lib/json-ld";

const ROUTE_LOCALE_HEADER = "x-moesekai-route-locale";

const SITE_BASE_URL = getSiteBaseUrl();
const googleTagScript = buildGoogleTagBootstrapScript();

export async function generateMetadata(): Promise<Metadata> {
  return generateRootMetadata();
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // MD3 surface of the default seed (Miku) in light / dark.
    { media: "(prefers-color-scheme: light)", color: MD3_DEFAULT_SURFACE.light },
    { media: "(prefers-color-scheme: dark)", color: MD3_DEFAULT_SURFACE.dark },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const routeLocaleHeader = requestHeaders.get(ROUTE_LOCALE_HEADER);
  const routeLocale = isRouteLocale(routeLocaleHeader) ? routeLocaleHeader : undefined;
  const initialUiLocale = routeLocale
    ? routeLocaleToUiLocale(routeLocale)
    : resolveUiLocale(cookieStore.get(UI_LOCALE_STORAGE_KEY)?.value) ??
      resolveAcceptLanguageUiLocale(requestHeaders.get("accept-language"));
  const jsonLd = generateRootJsonLd(SITE_BASE_URL, initialUiLocale);
  const navigationJsonLd = generateSiteNavigationItemListJsonLd(SITE_BASE_URL, initialUiLocale);
  const supportedUiLocales = JSON.stringify(SUPPORTED_UI_LOCALES);
  // Inline script to apply theme color before React hydration
  const themeScript = `
    (function() {
      var routeSegments = window.location.pathname.split('/').filter(Boolean);
      var pageSegment = ${JSON.stringify(SUPPORTED_ROUTE_LOCALES)}.indexOf((routeSegments[0] || '').toLowerCase()) >= 0 ? routeSegments[1] : routeSegments[0];
      document.documentElement.dataset.legacyGame = ['guess-who', 'guess-jacket', 'goods-gacha'].indexOf(pageSegment) >= 0 ? 'true' : 'false';
      var adsFeatureEnabled = ${ADS_FEATURE_ENABLED ? "true" : "false"};
      var showAds = ${DEFAULT_SHOW_ADS ? "true" : "false"};

      if (adsFeatureEnabled) {
        try {
          var savedShowAds = localStorage.getItem('${SHOW_ADS_STORAGE_KEY}');
          if (savedShowAds === 'true') showAds = true;
          if (savedShowAds === 'false') showAds = false;
        } catch (e) {}
      } else {
        showAds = false;
      }

      document.documentElement.dataset.showAds = showAds ? 'true' : 'false';

      try {
        var savedBackgroundAnimationBudget = localStorage.getItem('${BACKGROUND_ANIMATION_BUDGET_STORAGE_KEY}');
        var backgroundAnimationBudget = savedBackgroundAnimationBudget === 'off' ? 'off' : 'on';
        document.documentElement.dataset.backgroundAnimation = backgroundAnimationBudget;
      } catch (e) {
        document.documentElement.dataset.backgroundAnimation = 'on';
      }

      if (showAds && !document.getElementById('${ADSENSE_SCRIPT_ID}')) {
        var adsenseScript = document.createElement('script');
        adsenseScript.id = '${ADSENSE_SCRIPT_ID}';
        adsenseScript.async = true;
        adsenseScript.crossOrigin = 'anonymous';
        adsenseScript.src = '${ADSENSE_SCRIPT_SRC}';
        document.head.appendChild(adsenseScript);
      }

      try {
        var savedColorSchemePreference = localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');
        var colorSchemePreference =
          savedColorSchemePreference === 'light' ||
          savedColorSchemePreference === 'dark' ||
          savedColorSchemePreference === 'system'
            ? savedColorSchemePreference
            : 'system';
        var prefersDark = window.matchMedia('${DARK_MEDIA_QUERY}').matches;
        var resolvedColorScheme =
          colorSchemePreference === 'system'
            ? (prefersDark ? 'dark' : 'light')
            : colorSchemePreference;

        document.documentElement.dataset.theme = resolvedColorScheme;
        document.documentElement.dataset.themePreference = colorSchemePreference;
        document.documentElement.style.colorScheme = resolvedColorScheme;
        document.documentElement.classList.toggle('dark', resolvedColorScheme === 'dark');

        // MD3 Dynamic Color: palettes are pre-generated per seed in md3-schemes.css,
        // so only the seed id needs to be applied before paint.
        var themeSeedIds = ${JSON.stringify(Object.keys(THEME_SEED_COLORS))};
        var savedCharId = localStorage.getItem('${THEME_CHAR_STORAGE_KEY}');
        if (savedCharId && themeSeedIds.indexOf(savedCharId) !== -1) {
          document.documentElement.dataset.seed = savedCharId;
        }
      } catch(e) {}

      try {
        var supportedUiLocales = ${supportedUiLocales};
        var routeUiLocale = ${routeLocale ? `'${initialUiLocale}'` : "null"};
        var savedUiLocale = routeUiLocale ? null : localStorage.getItem('${UI_LOCALE_STORAGE_KEY}');
        var browserUiLocales = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
        var localeCandidates = routeUiLocale ? [routeUiLocale] : (savedUiLocale ? [savedUiLocale] : browserUiLocales);
        var resolvedUiLocale = '${initialUiLocale}';
        for (var i = 0; i < localeCandidates.length; i++) {
          var normalizedUiLocale = String(localeCandidates[i] || '').toLowerCase();
          var matchedUiLocale = supportedUiLocales.find(function(locale) {
            return normalizedUiLocale === locale.toLowerCase() || normalizedUiLocale.split('-')[0] === locale.toLowerCase().split('-')[0];
          });
          if (matchedUiLocale) {
            resolvedUiLocale = matchedUiLocale;
            break;
          }
        }
        document.documentElement.lang = resolvedUiLocale;
        document.documentElement.dataset.uiLocale = resolvedUiLocale;
      } catch (e) {}
    })();
  `;
  return (
    <html
      lang={UI_LOCALE_HTML_LANG[initialUiLocale]}
      data-ui-locale={initialUiLocale}
      data-seed={DEFAULT_THEME_SEED_ID}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <RootHeadScripts
          themeScript={themeScript}
          websiteJsonLd={serializeJsonLd(jsonLd.website)}
          videoGameJsonLd={serializeJsonLd(jsonLd.videoGame)}
          navigationJsonLd={serializeJsonLd(navigationJsonLd)}
          googleTagScript={googleTagScript}
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <I18nProvider initialLocale={initialUiLocale} routeLocale={routeLocale}>
            <MasterDataProvider>
              <TranslationProvider>
                <QuickFilterProvider>
                  <BreadcrumbProvider>
                    {children}
                  </BreadcrumbProvider>
                </QuickFilterProvider>
              </TranslationProvider>
            </MasterDataProvider>
          </I18nProvider>
        </ThemeProvider>
        <GoogleTagBootstrap />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
