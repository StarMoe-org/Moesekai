// The render worker (ADR-0031): Pass 2 on an OffscreenCanvas. Frames arrive from the simulation
// worker a few seconds ahead; the files they show (models, backgrounds, effect prefabs, movies)
// are fetched as they arrive, and a frame is drawn only once everything it shows is in. The
// scenario UI's sprites, fonts, transitions and dialog are read by the renderer itself from the
// client view, which it names as it finds one missing (see SseLoader.retryMissing).
//
// Files stay in the file table; the renderer drops textures it has not drawn for a while and
// decodes them again from there (ADR-0029). The pictures of movies are decoded by the browser
// (WebCodecs, movies.js) and handed to the renderer as it asks for them.
//
// From the page:
//   { type: "init", options, canvas, framesPort }   canvas: the OffscreenCanvas
//   { type: "show", frame }                          draw this frame
//   { type: "show", frame, w }                       experimental (a display above 60 Hz): draw
//                                                    the state `w` (in [0, 1)) of the way to
//                                                    the next frame, when that one is in
//   { type: "tap", x, y }                            the player tapped the canvas (pixels)
//   { type: "resize", width, height }                draw at this size from now on
// From the simulation worker (on the frames port), besides frames:
//   { type: "reset", frame, gen }                    a seek: frames start over from `frame`
//   { type: "prefetch", assets }                     model assets that layouts ahead put on
// To the simulation worker (on the frames port):
//   { type: "answer", index }                        a choice dialog's button was tapped
//   { type: "click" }                                any other tap, unless a dialog is up
// To the page:
//   { type: "ready", loadedBytes, msaaSampleCounts }
//   { type: "error", message, kind, url }            see sseErrorMessage (common.js); the worker
//                                                    does nothing more after it
//   { type: "shown", frame, ms, skipped, gen, loadedBytes, tableBytes, wasmBytes }   after each
//                                                    draw; the last two: the files held, the wasm memory
//   { type: "stall", frame, reason, gen }            the frame (or a file it shows) is not in yet
"use strict";

let loader;
let movies;
let renderer;
/** What a renderer is created with: the canvas and the fonts the page gave. */
let canvas;
let fonts;
let models = [];
/** Baked frames not drawn yet, by frame number: [json, what it shows, whether a choice is up]. */
const frames = new Map();
/** Keys (see `needs`) whose files are all in. */
const ready = new Set();
const requested = new Set();
let shown = -1;
/** The frame on screen: its entry (see `frames`), its JSON, and whether a choice dialog is up. */
let shownEntry;
let shownJson;
let shownChoice = false;
/** How far towards the next frame the drawing on screen is (0: the frame itself). */
let shownW = 0;
/** The newest in-between `show` not drawn yet: they are drawn one task later, the newest only. */
let pendingShow;
let framesPort;
// SsePlayer's experimental anti-aliasing of the Live2D models: {method, msaaSamples, ssaaFactor}
let antialiasing;
let skipped = 0;
/** Seeks taken (reported with what is shown). */
let gen = 0;
/** The newest frame received. */
let newest = 0;
/** An error was reported to the page: nothing more is drawn. */
let dead = false;

/** Reports `e` to the page (once) and stops. */
function fatal(e) {
  if (dead) return;
  dead = true;
  // before common.js is in (a script of this worker failed to load) there is no helper yet
  postMessage(typeof sseErrorMessage === "function" ? sseErrorMessage(e)
    : { type: "error", message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url });
}
/** How often fetching what a frame shows has failed, by key (each fetch tries a few times). */
const failures = new Map();

/**
 * What a frame shows that must be fetched, as keys: `asset:<name>` for an asset of the canonical
 * view (a model, an effect or background prefab) with all its files, `file:<table path>` for a
 * single file (a background's picture, a movie).
 */
function needs(state) {
  const out = [];
  const file = (path) => out.push(`file:${SSE_PUB}${path}`);
  for (const c of state.characters) if (models[c.model]) out.push(`asset:${models[c.model]}`);
  for (const path of [state.background?.current, state.background?.previous]) if (path) file(path);
  for (const e of state.effects ?? []) out.push(`asset:${e.prefab}`);
  if (state.movie?.file) file(state.movie.file);
  // a background prefab, drawn instead of the background's picture, and the movie it plays
  const prefab = state.background?.prefab;
  if (prefab) {
    out.push(`asset:${prefab.asset}`);
    if (prefab.movie?.file) file(prefab.movie.file);
  }
  return out;
}

function request(key) {
  if (requested.has(key)) return;
  requested.add(key);
  const done = () => ready.add(key);
  // asked for again when a frame needs it; the second failure is told to the page, which would
  // otherwise wait for good
  const fail = (e) => {
    requested.delete(key);
    failures.set(key, (failures.get(key) ?? 0) + 1);
    if (failures.get(key) >= 2) fatal(e);
    else console.warn(`${key}: ${e?.message ?? e}`);
  };
  if (key.startsWith("asset:")) {
    loader.assetFiles(key.slice(6)).then((files) => loader.getAll(files)).then(done, fail);
  } else {
    loader.get(key.slice(5)).then(done, fail);
  }
}

/** The page's own fonts (SsePlayer.create's `fonts`): each file once, at /fonts/<n>-<name>. */
async function placeFonts(wanted) {
  const paths = new Map();
  const place = (list) => Promise.all((list ?? []).map(async ({ url, weight }) => {
    const absolute = new URL(url, location.href).href;
    if (!paths.has(absolute)) {
      const path = `/fonts/${paths.size}-${absolute.split("/").pop().split(/[?#]/)[0]}`;
      paths.set(absolute, sseFetchBytes(absolute).then((bytes) => {
        wasm_bindgen.putFile(path, bytes);
        loader.bytes += bytes.length;
        return path;
      }));
    }
    return { path: await paths.get(absolute), ...(weight === undefined ? {} : { weight }) };
  }));
  return { body: await place(wanted?.body), name: await place(wanted?.name) };
}

/** A renderer for `canvas` at `width` × `height`, with the models known so far. */
async function createRenderer(width, height) {
  const created = await sseWhenCoreReady(() => loader.retryMissing(
    () => wasm_bindgen.FrameRenderer.create(canvas, models, 60, width, height, fonts.body, fonts.name),
    sseReporter(loader, "client")));
  // models that arrived while it was made
  created.setModels(models);
  return created;
}

async function init(o, offscreen, port) {
  // paths relative to this worker: Core and the package come from the options
  for (const url of [o.core, `${o.pkg}sse_web.js`, "common.js", "movies.js"]) {
    try {
      importScripts(url);
    } catch (e) {
      throw Object.assign(new Error(`${url}: ${e?.message ?? e}`), { kind: "network", url });
    }
  }
  const wasm = await wasm_bindgen({ module_or_path: `${o.pkg}sse_web_bg.wasm` });
  // the size of the wasm memory: it holds the file table and only ever grows
  self.wasmBytes = () => wasm.memory.buffer.byteLength;
  self.fileTableSize = wasm_bindgen.fileTableSize;
  loader = new SseLoader(wasm_bindgen, o.views);
  movies = new SseMovies(wasm_bindgen);
  canvas = offscreen;
  const ownFonts = placeFonts(o.fonts);
  // a font that fails to load is reported when the renderer is made; not as an unhandled rejection before
  ownFonts.catch(() => {});
  framesPort = port;
  // frames start arriving now: fetch what they show
  port.onmessage = (e) => {
    if (e.data.type === "reset") {
      gen = e.data.gen;
      frames.clear();
      shown = e.data.frame - 1;
      shownW = 0;
      newest = e.data.frame;
      return;
    }
    if (e.data.type === "prefetch") {
      // models layout instructions ahead will put on: fetch their files early
      for (const name of e.data.assets) request(`asset:${name}`);
      return;
    }
    if (e.data.models) { models = e.data.models; renderer?.setModels(models); }
    for (const [n, json] of e.data.frames) {
      const state = JSON.parse(json);
      const want = needs(state);
      for (const k of want) {
        request(k);
      }
      frames.set(n, [json, want, state.choice !== undefined]);
      newest = Math.max(newest, n);
    }
  };
  fonts = await ownFonts;
  renderer = await createRenderer(o.width, o.height);
  // a setting the device does not take leaves the player without anti-aliasing, not failed
  antialiasing = { method: "none", msaaSamples: 4, ssaaFactor: 2 };
  setAntialiasing(o.antialiasing);
  postMessage({ type: "ready", loadedBytes: loader.bytes, msaaSampleCounts: [...renderer.msaaSampleCounts()] });
}

/**
 * A tap on the canvas at (x, y) pixels, against the frame on screen: a choice dialog's button
 * answers; elsewhere the dialog, while up, takes the tap (`AnswerChoiceDialog` is modal); with no
 * dialog it is a click for the scenario.
 */
function tap(x, y) {
  if (shownJson !== undefined && shownChoice) {
    const answer = renderer.choiceAt(shownJson, x, y);
    if (answer >= 0) framesPort.postMessage({ type: "answer", index: answer });
    return;
  }
  framesPort?.postMessage({ type: "click" });
}

/**
 * Draws at `width` × `height` from now on: a new renderer on the same canvas (models and images
 * load again from the file table as frames show them), and the frame on screen again.
 */
async function resize(width, height) {
  if (!renderer) return;
  const old = renderer;
  renderer = undefined;
  old.free();
  canvas.width = width;
  canvas.height = height;
  renderer = await createRenderer(width, height);
  applyAntialiasing(antialiasing);
  showAgain();
}

/** The frame on screen is drawn again at the next show. */
function showAgain() {
  if (shownEntry && !frames.has(shown)) {
    frames.set(shown, shownEntry);
    shown--;
    shownW = 0;
  }
}

function applyAntialiasing(aa) {
  renderer.setExperimentalAntialiasing(aa.method, aa.msaaSamples, aa.ssaaFactor);
}

/** SsePlayer.setExperimentalAntialiasing: from the frame on screen on; refused values change nothing. */
function setAntialiasing(aa) {
  if (!renderer) return;
  try {
    applyAntialiasing(aa);
  } catch (e) {
    console.warn(`experimental anti-aliasing ${JSON.stringify(aa)} refused: ${e?.message ?? e}`);
    return;
  }
  antialiasing = aa;
  showAgain();
}

/** Experimental: draws `want` `w` of the way to the next frame. At a refresh rate the renderer
 * cannot keep up with, the requests that queued up meanwhile give way to the newest. */
function showBetween(want, w) {
  if (pendingShow === undefined) setTimeout(() => {
    const [f, x] = pendingShow;
    pendingShow = undefined;
    if (!dead) {
      try { show(f, x); } catch (err) { fatal(err); }
    }
  }, 0);
  pendingShow = [want, w];
}

/**
 * Hands the renderer the movie pictures `json` shows that it does not hold. One that is not
 * decoded yet is left out: the renderer keeps the movie's last picture (decoding goes on, and
 * the next draw asks again).
 */
function putMoviePictures(json) {
  for (const { path, index, background } of JSON.parse(renderer.movieFrames(json))) {
    const picture = movies.picture(path, index, background);
    if (!picture) continue;
    // the renderer copies it to the GPU within the call
    renderer.putMovieFrame(path, index, background, picture);
    picture.close();
  }
}

/** The JSON of `want` drawn `w` of the way to the next frame, when that frame is in. */
function present(want, json, w) {
  putMoviePictures(json);
  const next = w > 0 ? frames.get(want + 1) : undefined;
  if (next === undefined) {
    renderer.present(json);
    return 0;
  }
  // the state in between is drawn with `want`'s files: the next frame's need not be in
  renderer.presentBetween(json, next[0], w);
  return w;
}

function show(want, w = 0) {
  if (!renderer) return;
  // the frame on screen, further towards the next one
  if (want === shown && w > shownW && shownJson !== undefined) {
    // without the next frame (waiting for a click, the end) the picture would not change: no draw
    if (!frames.has(want + 1)) return;
    const start = performance.now();
    const drawn = present(want, shownJson, w);
    if (drawn === 0) return;
    shownW = drawn;
    postMessage({ type: "shown", gen, frame: want, ms: performance.now() - start, skipped, loadedBytes: loader.bytes, tableBytes: fileTableSize(), wasmBytes: wasmBytes() });
    return;
  }
  // an older frame than the one on screen (the clock is not to go back): keep what is shown
  if (want <= shown) return;
  const entry = frames.get(want);
  if (entry === undefined) {
    const keys = [...frames.keys()];
    postMessage({ type: "stall", gen, frame: want, reason: `frame ${want} not baked yet (holding ${keys.length}: ${Math.min(...keys)}..${Math.max(...keys)})` });
    return;
  }
  const missing = entry[1].find((k) => !ready.has(k));
  if (missing) {
    request(missing);
    postMessage({ type: "stall", gen, frame: want, reason: missing });
    return;
  }
  for (const k of frames.keys()) {
    if (k >= want) break;
    frames.delete(k);
    if (k > shown) skipped++;
  }
  const start = performance.now();
  try {
    shownW = present(want, entry[0], w);
  } catch (e) {
    // files nothing announced (the renderer reads them on its own): fetch them and draw again
    const paths = sseMissingPaths(e);
    if (!paths.length) throw e;
    for (const path of paths) loader.get(path).catch(fatal);
    postMessage({ type: "stall", gen, frame: want, reason: paths[0] });
    return;
  }
  frames.delete(want);
  shown = want;
  shownEntry = entry;
  shownJson = entry[0];
  shownChoice = entry[2];
  postMessage({ type: "shown", gen, frame: want, ms: performance.now() - start, skipped, loadedBytes: loader.bytes, tableBytes: fileTableSize(), wasmBytes: wasmBytes() });
}

onmessage = (e) => {
  const m = e.data;
  if (dead) return;
  try {
    if (m.type === "init") {
      init(m.options, m.canvas, m.framesPort).catch(fatal);
    } else if (m.type === "show") {
      if (m.w === undefined) show(m.frame);
      else showBetween(m.frame, m.w);
    } else if (m.type === "tap") {
      tap(m.x, m.y);
    } else if (m.type === "resize") {
      resize(m.width, m.height).catch(fatal);
    } else if (m.type === "antialiasing") {
      setAntialiasing(m.antialiasing);
    }
  } catch (err) {
    fatal(err);
  }
};
