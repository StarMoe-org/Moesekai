// Replaces the Live2D story player's vendored release (web/vendor/sse-web) with a build of
// SekaiStoryExporter's `crates/sse-web/dist.sh`:
//
//   node scripts/sync-sse-web.mjs --from <SekaiStoryExporter>/target/web-dist/sse-web-<version>
import { SSE_WEB, syncRelease } from "./vendored-release.mjs";

syncRelease(SSE_WEB, process.argv);
