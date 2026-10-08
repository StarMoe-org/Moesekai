// The render worker (ADR-0031): Pass 2 on an OffscreenCanvas. Frames arrive from the simulation
// worker a few seconds ahead; the files they show (models, backgrounds, effect prefabs) are
// fetched as they arrive, and a frame is drawn only once everything it shows is in. The UI kit
// comes from the page, derived by a worker of its own (kit-worker.js).
//
// Before playback it fetches everything the episode index lists that frames can show (every
// model, effect and particle bundle, every background); playback then
// fetches nothing (should a frame still lack a file, it is fetched and playback waits). Files
// stay in the file table; the renderer drops textures it has not drawn for a while and decodes
// them again from there (ADR-0029). Backgrounds from the asset source are fetched as its WebP and
// decoded by the browser (ADR-0031; lossy, unlike the export's PNG).
//
// From the page:
//   { type: "init", options, canvas, framesPort }   canvas: the OffscreenCanvas
//   { type: "kit", dir, files }                      the UI kit: [name, bytes] for `<dir>/<name>`
//   { type: "show", frame }                          draw this frame
//   { type: "tap", x, y }                            the player tapped the canvas (pixels)
//   { type: "resize", width, height }                draw at this size from now on
// From the simulation worker (on the frames port), besides frames:
//   { type: "reset", frame, gen }                    a seek: frames start over from `frame`
// To the simulation worker (on the frames port):
//   { type: "answer", index }                        a choice dialog's button was tapped
//   { type: "click" }                                any other tap, unless a dialog is up
// To the page:
//   { type: "ready", loadedBytes }
//   { type: "error", message, kind, url }            see sseErrorMessage (common.js); the worker
//                                                    does nothing more after it
//   { type: "shown", frame, ms, skipped, gen, loadedBytes, tableBytes, wasmBytes }   after each
//                                                    draw; the last two: the files held, the wasm memory
//   { type: "stall", frame, reason, gen }            the frame (or a file it shows) is not in yet
"use strict";

let loader;
let index;
let renderer;
let models = [];
/** Baked frames not drawn yet, by frame number: [json, bundles and files it shows]. */
const frames = new Map();
/** Library bundles and single files: "ready" once every file is in. */
const ready = new Set();
const requested = new Set();
/** Encoded WebP backgrounds, by library path; and those being decoded. */
const webp = new Map();
const decoding = new Set();
let shown = -1;
/** The frame on screen: its entry (see `frames`), its JSON, and whether a choice dialog is up. */
let shownEntry;
let shownJson;
let shownChoice = false;
let framesPort;
/** What a renderer is created with: the canvas, the UI kit, the client and the selector. */
let rendererArgs;
let skipped = 0;
/** Seeks taken (reported with what is shown). */
let gen = 0;
/** The newest frame received. */
let newest = 0;
/** An error was reported to the page: nothing more is drawn. */
let dead = false;
/** The UI kit, once the page hands it over (see the top). */
let kitArrived;
const kit = new Promise((resolve) => { kitArrived = resolve; });

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

/** Decodes a WebP background into the renderer (async; the frame waits meanwhile). */
async function decodeBackground(path) {
  decoding.add(path);
  try {
    const bitmap = await createImageBitmap(new Blob([webp.get(path)], { type: "image/webp" }),
      { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    renderer.putImage(path, bitmap.width, bitmap.height, new Uint8Array(data.buffer));
    bitmap.close();
  } finally {
    decoding.delete(path);
  }
}


/** What a frame shows that must be fetched: bundles (whole) and single files. */
function needs(state) {
  const out = [];
  for (const c of state.characters) if (models[c.model]) out.push(`bundle:${models[c.model]}`);
  for (const b of [state.background?.current, state.background?.previous]) {
    if (!b) continue;
    out.push(index.assets?.[b] && b.endsWith(".png") ? `webp:${b}` : `file:${SseLoader.resolve(index, b)}`);
  }
  for (const e of state.effects ?? []) out.push(`bundle:${e.bundle}`);
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
  if (key.startsWith("bundle:")) {
    loader.bundleFiles(key.slice(7)).then((files) => loader.getAll(files)).then(done, fail);
  } else if (key.startsWith("webp:")) {
    const path = key.slice(5);
    const root = loader.roots.find((r) => r.prefix === "/assets/");
    loader.fetchRooted(root, `/assets/${path.replace(/\.png$/, ".webp")}`)
      .then((bytes) => { webp.set(path, bytes); loader.bytes += bytes.length; }).then(done, fail);
  } else {
    loader.get(key.slice(5)).then(done, fail);
  }
}

async function init(o, canvas, port) {
  // paths relative to this worker: Core and the package come from the options
  for (const url of [o.core, `${o.pkg}sse_web.js`, "common.js"]) {
    try {
      importScripts(url);
    } catch (e) {
      throw Object.assign(new Error(`${url}: ${e?.message ?? e}`), { kind: "network", url });
    }
  }
  const wasm = await wasm_bindgen({ module_or_path: `${o.pkg}sse_web_bg.wasm` });
  // the size of the wasm memory: it holds the file table and only ever grows
  self.wasmBytes = () => wasm.memory.buffer.byteLength;
  const { FrameRenderer, putFile, removeFile } = wasm_bindgen;
  self.fileTableSize = wasm_bindgen.fileTableSize;
  loader = new SseLoader(putFile, o.sources);
  loader.removeFile = removeFile;
  const lock = await loader.json("/lib/ripper.lock.json");
  if (lock.assets) loader.setRoot("/assets/", lock.assets.base);
  index = await sseEpisodeIndex(loader, o.selector);
  const report = (phase, done, total) => postMessage({ type: "progress", phase, done, total, bytes: loader.bytes });
  // the page's own fonts (SsePlayer.create's `fonts`): each file once, at /fonts/<n>-<name>
  const ownFonts = (async () => {
    const paths = new Map();
    const place = async (list) => Promise.all((list ?? []).map(async ({ url, weight }) => {
      const absolute = new URL(url, location.href).href;
      if (!paths.has(absolute)) {
        const path = `/fonts/${paths.size}-${absolute.split("/").pop().split(/[?#]/)[0]}`;
        paths.set(absolute, sseFetchBytes(absolute).then((bytes) => {
          putFile(path, bytes);
          loader.bytes += bytes.length;
          return path;
        }));
      }
      return { path: await paths.get(absolute), ...(weight === undefined ? {} : { weight }) };
    }));
    return { body: await place(o.fonts?.body), name: await place(o.fonts?.name) };
  })();
  // a font that fails to load is reported when the renderer is made; not as an unhandled rejection before
  ownFonts.catch(() => {});
  framesPort = port;
  // frames start arriving now: fetch what they show
  port.onmessage = (e) => {
    if (e.data.type === "reset") {
      gen = e.data.gen;
      frames.clear();
      shown = e.data.frame - 1;
      newest = e.data.frame;
      return;
    }
    if (e.data.type === "prefetch") {
      // models layout instructions ahead will put on: fetch their textures early
      for (const b of e.data.bundles) {
        request(`bundle:${b}`);
      }
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
  // everything frames can show
  const bundles = new Set(index.bundles.filter((b) => b.startsWith("shader/")));
  // a costume whose model the library does not have (the index warns of it) is not drawn
  for (const c of Object.values(index.characters)) for (const costume of c.costumes) if (costume.modelBundle) bundles.add(costume.modelBundle);
  for (const b of Object.values(index.effects ?? {})) bundles.add(b);
  const backgrounds = Object.values(index.backgrounds ?? {}).map((b) => b.path);
  let listed = 0;
  report("listing", 0, bundles.size);
  const lists = await Promise.all([...bundles].map((b) => loader.bundleFiles(b)
    .then((files) => { report("listing", ++listed, bundles.size); return files; })));
  const singles = backgrounds.filter((b) => !(index.assets?.[b] && b.endsWith(".png"))).map((b) => SseLoader.resolve(index, b));
  const webps = backgrounds.filter((b) => index.assets?.[b] && b.endsWith(".png"));
  const total = lists.flat().length + singles.length + webps.length;
  let done = 0;
  const step = () => report("files", ++done, total);
  const root = loader.roots.find((r) => r.prefix === "/assets/");
  await Promise.all([
    loader.getAll([...lists.flat(), ...singles], step),
    Promise.all(webps.map((b) => loader.fetchRooted(root, `/assets/${b.replace(/\.png$/, ".webp")}`)
      .then((bytes) => { webp.set(b, bytes); loader.bytes += bytes.length; step(); }))),
  ]);
  for (const b of bundles) ready.add(`bundle:${b}`);
  for (const b of singles) ready.add(`file:${b}`);
  for (const b of webps) ready.add(`webp:${b}`);
  for (const k of ready) requested.add(k);
  const ui = await kit;
  for (const [name, bytes] of ui.files) putFile(`${ui.dir}/${name}`, bytes);
  const fonts = await ownFonts;
  renderer = await sseWhenCoreReady(() => loader.retryMissing(() =>
    FrameRenderer.create(canvas, "/lib", "/assets", o.selector, ui.dir, lock.region ?? "jp", [], 60, o.width, o.height,
      fonts.body, fonts.name)));
  renderer.setModels(models);
  rendererArgs = [canvas, ui.dir, lock.region ?? "jp", o.selector, fonts];
  postMessage({ type: "ready", loadedBytes: loader.bytes });
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
  const [canvas, kit, game, selector, fonts] = rendererArgs;
  canvas.width = width;
  canvas.height = height;
  const { FrameRenderer } = wasm_bindgen;
  renderer = await sseWhenCoreReady(() => loader.retryMissing(() =>
    FrameRenderer.create(canvas, "/lib", "/assets", selector, kit, game, models, 60, width, height,
      fonts.body, fonts.name)));
  if (shownEntry && !frames.has(shown)) {
    frames.set(shown, shownEntry);
    shown--;
  }
}

function show(want) {
  // an older frame than the one on screen (the clock is not to go back): keep what is shown
  if (!renderer || want <= shown) return;
  const entry = frames.get(want);
  if (entry === undefined) {
    const keys = [...frames.keys()];
    postMessage({ type: "stall", gen, frame: want, reason: `frame ${want} not baked yet (holding ${keys.length}: ${Math.min(...keys)}..${Math.max(...keys)})` });
    return;
  }
  const missing = entry[1].find((k) => !ready.has(k) && !k.startsWith("bundle:shader/"));
  if (missing) {
    request(missing);
    postMessage({ type: "stall", gen, frame: want, reason: missing });
    return;
  }
  // backgrounds decoded by the browser: (again, after the renderer dropped one) before drawing
  const undecoded = entry[1].filter((k) => k.startsWith("webp:") && !renderer.hasImage(k.slice(5))).map((k) => k.slice(5));
  if (undecoded.length) {
    for (const p of undecoded) {
      if (!decoding.has(p)) decodeBackground(p).catch((err) => fatal(new Error(`${p}: ${err?.message ?? err}`)));
    }
    postMessage({ type: "stall", gen, frame: want, reason: `decoding ${undecoded[0]}` });
    return;
  }
  for (const k of frames.keys()) {
    if (k >= want) break;
    frames.delete(k);
    if (k > shown) skipped++;
  }
  const start = performance.now();
  try {
    renderer.present(entry[0]);
  } catch (e) {
    // a file nothing announced (the renderer reads it on its own): fetch it and draw again
    const path = sseMissingPath(e);
    if (!path) throw e;
    loader.get(path).catch(fatal);
    postMessage({ type: "stall", gen, frame: want, reason: path });
    return;
  }
  frames.delete(want);
  shown = want;
  shownEntry = entry;
  shownJson = entry[0];
  shownChoice = entry[2];
  postMessage({ type: "shown", gen, frame: want, ms: performance.now() - start, skipped, loadedBytes: loader.bytes, tableBytes: fileTableSize() + [...webp.values()].reduce((a, b) => a + b.length, 0), wasmBytes: wasmBytes() });
}

onmessage = (e) => {
  const m = e.data;
  if (dead) return;
  try {
    if (m.type === "init") {
      init(m.options, m.canvas, m.framesPort).catch(fatal);
    } else if (m.type === "kit") {
      kitArrived(m);
    } else if (m.type === "show") {
      show(m.frame);
    } else if (m.type === "tap") {
      tap(m.x, m.y);
    } else if (m.type === "resize") {
      resize(m.width, m.height).catch(fatal);
    }
  } catch (err) {
    fatal(err);
  }
};
