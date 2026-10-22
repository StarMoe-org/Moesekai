// Copies the Live2D model viewer's vendored release (web/vendor/live2d-viewer) to
// public/live2d-viewer/<release>/, where the browser loads it from (see vendored-release.mjs).
// Run by `copy:wasm`, before dev and build. Without a vendored release nothing is served and the
// viewer page says the viewer is not available.
import { copyRelease, LIVE2D_VIEWER } from "./vendored-release.mjs";

copyRelease(LIVE2D_VIEWER);
