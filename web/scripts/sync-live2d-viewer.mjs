// Replaces the Live2D model viewer's vendored release (web/vendor/live2d-viewer) with a build of
// SekaiLive2DViewer's `dist.sh`:
//
//   node scripts/sync-live2d-viewer.mjs --from <SekaiLive2DViewer>/target/web-dist/sekai-live2d-viewer-<version>
import { LIVE2D_VIEWER, syncRelease } from "./vendored-release.mjs";

syncRelease(LIVE2D_VIEWER, process.argv);
