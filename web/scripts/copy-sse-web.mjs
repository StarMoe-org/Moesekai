// Copies the Live2D story player's vendored release (web/vendor/sse-web) to
// public/sse-web/<release>/, where the browser loads it from (see vendored-release.mjs). Run by
// `copy:wasm`, before dev and build.
import { copyRelease, SSE_WEB } from "./vendored-release.mjs";

copyRelease(SSE_WEB);
