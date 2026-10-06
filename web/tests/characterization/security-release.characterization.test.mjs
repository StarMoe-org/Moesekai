import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { importWebTypeScript, readWeb } from "./test-helpers.mjs";



test("privacy disclosures are localized, match disabled ads, and route external links", () => {
  const page = readWeb("src/app/privacy/page.tsx");
  const client = readWeb("src/app/privacy/client.tsx");
  assert.match(page, /PrivacyPolicyClient/);
  assert.match(client, /"local\.tokens"/);
  assert.match(client, /"local\.gameData"/);
  assert.match(client, /page\.privacy\.cookies\.adsDisabled/);
  assert.doesNotMatch(client, /AnalyticsConsentControl|controls\.consent/);
  assert.doesNotMatch(client, /<a\s/i);
  assert.equal((client.match(/<ExternalLink/g) ?? []).length, 2);
});

test("all JSON-LD uses one closing-script-safe serializer", async () => {
  const { serializeJsonLd } = await importWebTypeScript("src/lib/json-ld.ts");
  const payload = { name: "</script><script>window.__jsonLdExecuted = true</script>&\u2028" };
  const serialized = serializeJsonLd(payload);

  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
  assert.deepEqual(JSON.parse(serialized), payload);

  const dom = new JSDOM(
    `<!doctype html><script type="application/ld+json">${serialized}</script>`,
    { runScripts: "dangerously" },
  );
  assert.equal(dom.window.__jsonLdExecuted, undefined);
  assert.equal(dom.window.document.scripts.length, 1, "the payload cannot close JSON-LD and create an executable script");
  dom.window.close();

  const seoMetadata = readWeb("src/lib/seo-metadata.ts");
  const rootLayout = readWeb("src/app/layout.tsx");
  assert.doesNotMatch(seoMetadata, /dangerouslySetInnerHTML:\s*\{ __html: JSON\.stringify/);
  assert.match(seoMetadata, /serializeJsonLd\(breadcrumbJsonLd\)/);
  assert.match(seoMetadata, /serializeJsonLd\(entityJsonLd\)/);
  assert.match(rootLayout, /import \{ serializeJsonLd \} from "@\/lib\/json-ld"/);
});

test("OAuth return routes reject external, protocol-relative, encoded, and control-character forms", async () => {
  const oauth = await importWebTypeScript("src/lib/oauth.ts", [
    [
      'import { normalizeServer, type ServerType } from "./account-servers";',
      'const normalizeServer = (value) => (typeof value === "string" && ["cn", "jp", "tw", "kr", "en"].includes(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null);\ntype ServerType = "cn" | "jp" | "tw" | "kr" | "en";',
    ],
    [
      'import { localizePathForBrowser } from "@/lib/localized-path";',
      "const localizePathForBrowser = (value) => value;",
    ],
  ]);

  assert.equal(oauth.sanitizeOAuthReturnTo("/cards?sort=id#top"), "/cards?sort=id#top");
  for (const unsafe of [
    "https://evil.example/",
    "//evil.example/",
    "///evil.example/",
    "/\\evil.example/",
    "/%5cevil.example/",
    "/%2f%2fevil.example/",
    "/profile\r\nLocation: https://evil.example/",
    "/profile%0d%0aLocation%3a%20https%3a%2f%2fevil.example/",
  ]) {
    assert.equal(oauth.sanitizeOAuthReturnTo(unsafe), "/profile", unsafe);
  }

  assert.match(readWeb("src/app/oauth2/connect/client.tsx"), /sanitizeOAuthReturnTo\(value\)/);
  assert.match(readWeb("src/app/oauth2/callback/code/client.tsx"), /sanitizeOAuthReturnTo\(returnTo\)/);
});

test("public origins are configured and never reflected from arbitrary request headers", async () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_DOMAIN: process.env.NEXT_PUBLIC_SITE_DOMAIN,
    PUBLIC_HOST_ALLOWLIST: process.env.PUBLIC_HOST_ALLOWLIST,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_DOMAIN = "https://pjsk.moe";
    process.env.PUBLIC_HOST_ALLOWLIST = "www.pjsk.moe";
    const origins = await importWebTypeScript("src/lib/site-origin.ts");
    assert.equal(origins.getCanonicalOrigin(), "https://pjsk.moe");
    assert.equal(origins.getPublicRequestOrigin("https://evil.example"), "https://pjsk.moe");
    assert.equal(origins.getPublicRequestOrigin("http://www.pjsk.moe"), "https://pjsk.moe");
    process.env.NEXT_PUBLIC_SITE_DOMAIN = "https://evil.example/path";
    assert.equal(origins.getCanonicalOrigin(), "https://pjsk.moe", "invalid configured origins fail closed");
    process.env.NEXT_PUBLIC_SITE_DOMAIN = "http://pjsk.moe";
    assert.equal(origins.getCanonicalOrigin(), "https://pjsk.moe", "production canonicals require HTTPS");
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const proxy = readWeb("src/proxy.ts");
  const sitemap = readWeb("src/lib/sitemap.ts");
  assert.doesNotMatch(proxy, /x-forwarded-(?:host|proto)/i);
  assert.doesNotMatch(sitemap, /next\/headers|headers\(\)|get\(['"]host['"]\)/);
  assert.match(sitemap, /return getCanonicalOrigin\(\)/);
});

test("staff links are whitelisted in ExternalLink and team translation members are consistent across locales", async () => {
  const teamLinks = await importWebTypeScript("src/lib/team-links.ts");
  assert.equal(teamLinks.MEMBER_LINKS["@御明正"], "https://space.bilibili.com/10820191");
  assert.equal(teamLinks.MEMBER_LINKS["御明正"], "https://space.bilibili.com/10820191");
  assert.equal(teamLinks.MEMBER_LINKS["@深海棉花糖"], "https://space.bilibili.com/33960889");
  assert.equal(teamLinks.MEMBER_LINKS["深海棉花糖"], "https://space.bilibili.com/33960889");

  const externalLinkSource = readWeb("src/components/ExternalLink.tsx");
  assert.match(externalLinkSource, /import\s*\{[^}]*MEMBER_LINKS[^}]*\}\s*from\s*["']@\/lib\/team-links["']/);
  assert.match(externalLinkSource, /Object\.values\(MEMBER_LINKS\)/);

  const zhCN = readWeb("src/lib/i18n/messages/zh-CN/index.ts");
  const zhTW = readWeb("src/lib/i18n/messages/zh-TW/page-primary.ts");
  const enUS = readWeb("src/lib/i18n/messages/en-US/index.ts");
  const jaJP = readWeb("src/lib/i18n/messages/ja-JP/index.ts");
  const koKR = readWeb("src/lib/i18n/messages/ko-KR/index.ts");

  for (const [sourceName, sourceContent] of [
    ["zh-CN", zhCN],
    ["zh-TW", zhTW],
    ["en-US", enUS],
    ["ja-JP", jaJP],
    ["ko-KR", koKR],
  ]) {
    assert.doesNotMatch(sourceContent, /translationMembers:\s*["'](?:翻译\/校对|翻譯\/校對|Translation \/ proofreading:|번역\/교정)/, `${sourceName} should not have role prefix in translationMembers`);
    assert.match(sourceContent, /translationMembers:.*@御明正/, `${sourceName} must include @御明正`);
    assert.match(sourceContent, /guideMembers:.*@深海棉花糖/, `${sourceName} must include @深海棉花糖`);
    assert.match(sourceContent, /guideMembers:.*@羽月/, `${sourceName} must include @羽月`);
  }
});
