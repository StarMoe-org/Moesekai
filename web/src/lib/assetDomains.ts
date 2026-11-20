/**
 * The asset site of each line (CORS `*`; please credit Moesekai / pjsk.moe when you embed it).
 * - ASSET_DOMAIN_MAIN: main line (Cloudflare)
 * - ASSET_DOMAIN_BACKUP: backup line (EdgeOne)
 *
 * Each server's files are at `/sekai-<server>-assets/` under the game's asset paths and file
 * names. The site also serves every asset in its own form at `/<server>/`, the directory tree of
 * each view at `/trees/<server>/<view>` and the client package at `/client/<server>/`.
 *
 * This module has no imports, so `next.config.ts` can read it too.
 */
export const ASSET_DOMAIN_MAIN = "https://storage.pjsk.moe";
export const ASSET_DOMAIN_BACKUP = "https://storage.exmeaning.com";
