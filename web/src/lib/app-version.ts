/**
 * Client-safe MoeSekai app version, inlined at build time from NEXT_PUBLIC_*
 * env vars set by next.config.ts (see "@/lib/build-version" and docs/VERSIONING.md).
 * Do not import "@/lib/build-version" here — it shells out to git (Node-only).
 */

/** Keep in sync with BASELINE_VERSION in "@/lib/build-version". */
const FALLBACK_VERSION = "2.0.0";

export const MOESEKAI_GITHUB_REPO_URL = "https://github.com/StarMoe-org/Moesekai";

const version = (process.env.NEXT_PUBLIC_MOESEKAI_VERSION || "").trim().replace(/^v/, "") || FALLBACK_VERSION;
const releaseTagRaw = (process.env.NEXT_PUBLIC_MOESEKAI_RELEASE_TAG || "").trim();
const commit = (process.env.NEXT_PUBLIC_MOESEKAI_COMMIT || "").trim();

export const APP_VERSION = {
    /** Derived semver without the leading "v", e.g. "2.0.37". */
    version,
    /** Display form, e.g. "v2.0.37". */
    display: `v${version}`,
    /** Latest formal release tag this build is based on, e.g. "v2.0.0" (null before the first release). */
    releaseTag: /^v\d+\.\d+\.\d+$/.test(releaseTagRaw) ? releaseTagRaw : null,
    /** Full commit SHA the running build was made from ("" when unknown, e.g. bare local dev). */
    commit,
    commitShort: commit ? commit.slice(0, 7) : "",
    /** ISO build date (yyyy-mm-dd), "" when unknown. */
    buildDate: (process.env.NEXT_PUBLIC_MOESEKAI_BUILD_DATE || "").trim(),
    /** True when the running build is exactly a tagged release. */
    isRelease: process.env.NEXT_PUBLIC_MOESEKAI_IS_RELEASE === "1",
} as const;

/** Release page for the base tag, or the release index before the first tag exists. */
export const APP_RELEASE_URL = APP_VERSION.releaseTag
    ? `${MOESEKAI_GITHUB_REPO_URL}/releases/tag/${APP_VERSION.releaseTag}`
    : `${MOESEKAI_GITHUB_REPO_URL}/releases`;

export const APP_CHANGELOG_URL = `${MOESEKAI_GITHUB_REPO_URL}/blob/main/CHANGELOG.md`;

export const APP_COMMIT_URL = commit ? `${MOESEKAI_GITHUB_REPO_URL}/commit/${commit}` : MOESEKAI_GITHUB_REPO_URL;
