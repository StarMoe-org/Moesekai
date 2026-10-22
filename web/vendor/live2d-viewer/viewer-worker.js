// The viewer's worker: fetches a model's files, keeps them in the browser's Cache API, and
// draws the model on the OffscreenCanvas the page handed over (SSE's ADR-0031 way: the files go
// into the wasm's in-memory file table, which the SSE crates read). Cubism Core for Web is
// loaded here with importScripts before the wasm (SSE's ADR-0032).
//
// Opening a model fetches the two bundles' `_ripper.json`, the model bundle's files and the
// default body motion and facial; any other clip is fetched the first time it is played.
//
// From the page:
//   { type: "init", options, canvas }   options: see viewer.js (`core`, `pkg` and `library`
//                                       absolute; `model: {bundle, motion}`, `width`, `height`)
//   { type: "motion", id, name, loop }  { type: "facial", id, name }   answered by "settled"
//   { type: "physics", on }             { type: "breath", on }       { type: "paused", on }
//   { type: "view", zoom, x, y }        { type: "resize", width, height }
// To the page:
//   { type: "progress", loaded, total }  files of the first opening in the table
//   { type: "ready", motions, facials, defaultMotion, defaultFacial, hasPhysics }
//   { type: "settled", id, started, error? }  a "motion" or "facial": started, or replaced by a
//                                       later one before its clip arrived (`started` false), or
//                                       its clip could not be had (`error`: message, kind, url)
//   { type: "motionend", name }
//   { type: "error", message, kind, url }   kind: unsupported, not-found, network or internal;
//                                           nothing more happens after it
"use strict";

/** The Cache API store of the bundles' files. A file is kept under its URL with its bundle's
 * CRC (`?crc=`), so a bundle the library re-exports is fetched again. */
const CACHE = "sekai-live2d-v1";
/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const FETCH_IDLE_MS = 30000;

let viewer;
let canvas;
/** Where clips come from once the model is up: `{library, bundle, crc, cache, putFile}`, the
 * clips' paths in the bundle by name (`motions`, `facials`), and the files in the table. */
let clips;
/** The newest "motion" and "facial" request: an older one whose clip arrives later is dropped. */
const newest = { motion: 0, facial: 0 };
let paused = false;
let dead = false;
let last = 0;
let scheduled = false;

function fatal(e) {
  if (dead) return;
  dead = true;
  postMessage({ type: "error", message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url });
}

function failure(message, kind, url) {
  return Object.assign(new Error(message), { kind, url });
}

/** `path` with each segment URL-encoded (motion names may hold spaces). */
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * The bytes at `url`, tried up to four times; a response that stops arriving counts as failed.
 * A file the server does not have (404) is not asked for again: the Error then has `status`.
 */
async function fetchBytes(url, init) {
  for (let attempt = 1; ; attempt++) {
    const abort = new AbortController();
    let idle;
    const watch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => abort.abort(), FETCH_IDLE_MS);
    };
    let status;
    try {
      watch();
      const r = await fetch(url, { ...init, signal: abort.signal });
      status = r.status;
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      const reader = r.body.getReader();
      const pieces = [];
      let length = 0;
      for (;;) {
        watch();
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        length += value.length;
      }
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const piece of pieces) {
        bytes.set(piece, at);
        at += piece.length;
      }
      return bytes;
    } catch (e) {
      if (attempt >= 4 || status === 404) {
        const message = abort.signal.aborted ? `${url}: nothing arrived for ${FETCH_IDLE_MS / 1000} s` : String(e?.message ?? e);
        throw Object.assign(failure(message, "network", url), { status });
      }
      await new Promise((done) => setTimeout(done, 300 * attempt));
    } finally {
      clearTimeout(idle);
    }
  }
}

async function openCache() {
  try {
    return typeof caches === "undefined" ? undefined : await caches.open(CACHE);
  } catch {
    return undefined; // no cache (an opaque origin, private mode): fetch every time
  }
}

/** The `_ripper.json` of library bundle `bundle`, asked for afresh each time. A bundle the
 * library does not have fails with `kind: "not-found"`. */
async function manifest(library, bundle) {
  const url = `${library}library/${encodePath(bundle)}/_ripper.json`;
  let bytes;
  try {
    bytes = await fetchBytes(url, { cache: "no-cache" });
  } catch (e) {
    if (e.status === 404) throw failure(`the library has no ${bundle}`, "not-found", url);
    throw e;
  }
  const m = JSON.parse(new TextDecoder().decode(bytes));
  return { bundle, crc: m.crc, files: m.files };
}

/** Drops the cached files of `bundle` kept under another CRC than `crc`. */
async function dropStale(cache, library, bundle, crc) {
  const prefix = `${library}library/${encodePath(bundle)}/`;
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (`${u.origin}${u.pathname}`.startsWith(prefix) && u.searchParams.get("crc") !== String(crc)) {
      await cache.delete(req);
    }
  }
}

/** The bytes of `path` in library bundle `bundle` (of CRC `crc`), from the cache if it has
 * them, else fetched and kept there. */
async function bundleFile(library, cache, bundle, crc, path) {
  const url = `${library}library/${encodePath(bundle)}/${encodePath(path)}`;
  const key = `${url}?crc=${crc}`;
  try {
    const hit = await cache?.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch { /* fetch it */ }
  const bytes = await fetchBytes(url);
  cache?.put(key, new Response(bytes)).catch(() => {});
  return bytes;
}

/** Puts `files` (`{bundle, crc, path}`) in the table, a few at a time; `progress(done, total)`. */
async function loadFiles(library, cache, files, putFile, progress) {
  const queue = [...files];
  let done = 0;
  progress?.(done, files.length);
  await Promise.all(Array.from({ length: 12 }, async () => {
    for (let f; (f = queue.shift()) !== undefined;) {
      putFile(`/lib/library/${f.bundle}/${f.path}`, await bundleFile(library, cache, f.bundle, f.crc, f.path));
      progress?.(++done, files.length);
    }
  }));
}

/** The clips of a motion bundle's manifest by name: body motions (`motion/<name>…`) and facials
 * (`facial/<name>…`), each name → its path in the bundle. */
function clipPaths(manifest) {
  const motions = new Map();
  const facials = new Map();
  for (const f of manifest?.files ?? []) {
    const m = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(f.path);
    if (m) (m[1] === "motion" ? motions : facials).set(m[2], f.path);
  }
  const sorted = (map) => new Map([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { motions: sorted(motions), facials: sorted(facials) };
}

/** Puts the clip `path` of the motion bundle in the table (once; requests for one in flight
 * share it). */
function loadClip(path) {
  let p = clips.loaded.get(path);
  if (!p) {
    p = bundleFile(clips.library, clips.cache, clips.bundle, clips.crc, path).then((bytes) => {
      clips.putFile(`/lib/library/${clips.bundle}/${path}`, bytes);
    });
    clips.loaded.set(path, p);
    p.catch(() => clips.loaded.delete(path)); // asked for again next time
  }
  return p;
}

/** A "motion" or "facial" request: its clip in, then started unless a newer one came since. */
async function change(kind, m) {
  newest[kind] = m.id;
  const path = (kind === "motion" ? clips.motions : clips.facials).get(m.name);
  try {
    if (path === undefined) throw failure(`no ${kind === "motion" ? "body motion" : "facial"} ${m.name}`, "internal");
    await loadClip(path);
    if (dead || newest[kind] !== m.id) {
      postMessage({ type: "settled", id: m.id, started: false });
      return;
    }
    if (kind === "motion") viewer.playMotion(m.name, !!m.loop);
    else viewer.setFacial(m.name);
    postMessage({ type: "settled", id: m.id, started: true });
  } catch (e) {
    postMessage({ type: "settled", id: m.id, started: false, error: { message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url } });
  }
}

/** Cubism Core for Web finishes initialising a moment after its script ran (SSE's ADR-0032):
 * retries `make` while Core says it is not ready yet. */
async function whenCoreReady(make) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await make();
    } catch (e) {
      if (!String(e?.message ?? e).includes("not ready yet") || attempt > 100) throw e;
      await new Promise((done) => setTimeout(done, 20));
    }
  }
}

async function init(o, offscreen) {
  for (const url of [o.core, `${o.pkg}sekai_live2d_viewer.js`]) {
    try {
      importScripts(url);
    } catch (e) {
      throw failure(`${url}: ${e?.message ?? e}`, "network", url);
    }
  }
  try {
    await wasm_bindgen({ module_or_path: `${o.pkg}sekai_live2d_viewer_bg.wasm` });
  } catch (e) {
    throw failure(`${o.pkg}sekai_live2d_viewer_bg.wasm: ${e?.message ?? e}`, "network", `${o.pkg}sekai_live2d_viewer_bg.wasm`);
  }
  const { Viewer, putFile, defaultMotion: pickMotion, defaultFacial: pickFacial } = wasm_bindgen;
  const [model, motion] = await Promise.all([
    manifest(o.library, o.model.bundle),
    o.model.motion ? manifest(o.library, o.model.motion) : undefined,
  ]);
  const cache = await openCache();
  const { motions, facials } = clipPaths(motion);
  const defaultMotion = pickMotion([...motions.keys()]);
  const defaultFacial = pickFacial([...facials.keys()]);
  // the model (a model bundle carries no clips the viewer plays) and the two default clips
  const files = model.files.filter((f) => f.kind !== "motion").map((f) => ({ bundle: model.bundle, crc: model.crc, path: f.path }));
  for (const name of [motions.get(defaultMotion), facials.get(defaultFacial)]) {
    if (name !== undefined) files.push({ bundle: motion.bundle, crc: motion.crc, path: name });
  }
  await loadFiles(o.library, cache, files, putFile, (loaded, total) => postMessage({ type: "progress", loaded, total }));
  if (cache) {
    for (const m of [model, motion]) if (m) dropStale(cache, o.library, m.bundle, m.crc).catch(() => {});
  }
  canvas = offscreen;
  const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  viewer = await whenCoreReady(() =>
    Viewer.create(canvas, "/lib", o.model.bundle, o.model.motion ?? "", o.width, o.height, seed));
  clips = { library: o.library, cache, putFile, bundle: motion?.bundle, crc: motion?.crc, motions, facials, loaded: new Map() };
  for (const f of files) if (f.bundle === motion?.bundle) clips.loaded.set(f.path, Promise.resolve());
  if (defaultMotion !== undefined) viewer.playMotion(defaultMotion, false);
  if (defaultFacial !== undefined) viewer.setFacial(defaultFacial);
  postMessage({
    type: "ready",
    motions: [...motions.keys()],
    facials: [...facials.keys()],
    defaultMotion,
    defaultFacial,
    hasPhysics: viewer.hasPhysics,
  });
  schedule();
}

const nextFrame = self.requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(() => f(performance.now()), 1000 / 60));

function schedule() {
  if (scheduled || paused || dead || !viewer) return;
  scheduled = true;
  nextFrame(tick);
}

function tick(now) {
  scheduled = false;
  if (paused || dead) return;
  try {
    // a long gap (a hidden tab, a stall) is not played through: at most 1/15 s a frame
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 1 / 15) : 1 / 60;
    last = now;
    const ended = viewer.frame(dt);
    if (ended !== undefined) postMessage({ type: "motionend", name: ended });
  } catch (e) {
    fatal(e);
    return;
  }
  schedule();
}

/** Shows a change while paused (nothing else draws then). */
function redraw() {
  if (paused && viewer) viewer.draw();
}

onmessage = (e) => {
  const m = e.data;
  if (dead) return;
  try {
    switch (m.type) {
      case "init":
        init(m.options, m.canvas).catch(fatal);
        break;
      case "motion":
      case "facial":
        change(m.type, m);
        break;
      case "physics":
        viewer.setPhysics(!!m.on);
        break;
      case "breath":
        viewer.setBreath(!!m.on);
        break;
      case "paused":
        paused = !!m.on;
        last = 0;
        schedule();
        break;
      case "view":
        viewer.setView(m.zoom, m.x, m.y);
        redraw();
        break;
      case "resize":
        canvas.width = m.width;
        canvas.height = m.height;
        viewer.resize(m.width, m.height);
        redraw();
        break;
    }
  } catch (err) {
    fatal(err);
  }
};
