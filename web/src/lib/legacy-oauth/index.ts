/**
 * LEGACY: the browser's own Haruki OAuth2 binding, kept for visitors who still have one until 2026-12-20, then
 * removed together with /oauth2/*, OAuthMigrationPrompt and the "oauth2" branches in ../account/game-data.ts.
 */
export * from "./client";
export {
    LEGACY_OAUTH_END_DATE,
    createOrUpdateOAuthAccount,
    disconnectOAuthAccount,
    fetchOAuthBindingInitialData,
    isLegacyOAuthAccount,
    type CreateOrUpdateOAuthAccountInput,
} from "./accounts";
