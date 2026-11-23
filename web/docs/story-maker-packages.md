# Story Studio Package Integration (`@moesekai/story-core` & `@moesekai/story-editor`)

The Web Story Maker (`/story-maker`, `/story-maker/edit`, `/story-maker/play`) consumes the public npm packages published from [`StarMoe-org/moesekai-story-studio`](https://github.com/StarMoe-org/moesekai-story-studio) (`MPL-2.0`):

- `@moesekai/story-core` — pure graph/document model, `.msk` parser/serializer/compiler, runtime VM, i18n packs, audio TAR bundler, published link store, IndexedDB draft storage adapter, and PJSK CDN helpers.
- `@moesekai/story-editor` — framework-agnostic React 19 + MD3 Expressive editor/player/hub UI, Live2D multi-actor stage, and 5-locale dictionaries (`zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`).

Web-specific Moesekai Community Stories features (`StoryPublishDialog.tsx`, `StoryAudioUploadPanel.tsx`, `/community/stories`, `/community/post/[id]`, `/community/mod`, and `?postId=` community playback) remain in `web/` and mount cleanly into `<StoryStudioEditor>` / `<StoryStudioPlayer>` via host slots (`StoryStudioWebProvider.tsx`).

## Production Workflow (Public npmjs.org)

`web/package.json` declares standard public npm semver ranges:

```json
"@moesekai/story-core": "^0.1.3",
"@moesekai/story-editor": "^0.1.3"
```

- **Zero authentication required**: Both packages are published publicly under `@moesekai/*` on `registry.npmjs.org`. No `.npmrc` token or private registry secret is needed.
- **China mirror friendly**: Local development uses `https://registry.npmmirror.com/` (configured in repo-root `bunfig.toml`), which mirrors public `npmjs.org` packages automatically. Immediately after a fresh publish to `npmjs.org`, wait a few minutes for npmmirror sync or run `bun install --registry https://registry.npmjs.org/`.
- **Docker & CI ready**: `Dockerfile` installs dependencies cleanly with `bun install --frozen-lockfile` using only `package.json`, `bun.lock`, `web/package.json`, and `refer/re_sekai-calculator/package.json` — no vendored `.tgz` blobs in git.
- **Tailwind CSS v4 & Next.js transpilation**: `web/next.config.ts` transpiles both packages via `transpilePackages`, and `web/src/app/globals.css` scans `@moesekai/story-editor/dist` via `@source "../../../node_modules/@moesekai/story-editor/dist";`.

### Upgrading After a New `vX.Y.Z` Release

After releasing a new lockstep version `vX.Y.Z` of `StarMoe-org/moesekai-story-studio` to npmjs.org, bump both dependencies in one command from the `Snowy_Viewer` root:

```bash
# Option A: pass the published version explicitly (works without a sibling checkout)
bun run --cwd web sync:story-studio --version X.Y.Z
bun install

# Option B: read the lockstep version automatically from a sibling moesekai-story-studio checkout
bun run --cwd web sync:story-studio
bun install
```

Options supported in default (`--mode npm`) mode:
- `--version <X.Y.Z>` (accepts optional leading `v`, e.g. `--version v0.2.0`)
- `--exact` (pins `X.Y.Z` instead of `^X.Y.Z`)
- `--dry-run` (prints planned changes without modifying files)

Running `--mode npm` also cleans any stale local tarballs in `web/.cache/moesekai-story-studio/` or legacy `web/vendor/moesekai-story-studio/`.

## Optional Local Cross-Repo Development (`--mode local`, Dev-Only)

When testing **unreleased** edits in a sibling `moesekai-story-studio` checkout before publishing to npm:

1. Build packages in `moesekai-story-studio`:
   ```bash
   bun run build:packages
   ```
2. Pack content-hashed tarballs into gitignored `web/.cache/moesekai-story-studio/` and install them from the `Snowy_Viewer` root:
   ```bash
   bun run --cwd web sync:story-studio --mode local
   bun install
   ```
   Set `MOESEKAI_STORY_STUDIO_DIR=/path/to/moesekai-story-studio` if the sibling repository is in a custom location.
3. **Before committing**, switch back to clean public npm ranges so `file:` specifiers and local tarballs are never committed:
   ```bash
   bun run --cwd web sync:story-studio --mode npm
   bun install
   ```
