// The stage's worker: several models on the OffscreenCanvas the page handed over, placed as a
// story places its characters. Files are fetched, cached and put in the wasm's file table as the
// viewer's worker does (viewer-worker.js; SSE's ADR-0031); Cubism Core for Web is loaded with
// importScripts before the wasm (SSE's ADR-0032).
//
// Adding an actor fetches its two bundles' `_ripper.json` (once per bundle while the worker
// lives), the model bundle's files and the starting body motion and facial; any other clip is
// fetched the first time it is played. A bundle two actors use is fetched once: the file table
// is shared.
//
// From the page (every `id` is answered by one "settled"):
//   { type: "init", options, canvas }   options: see stage.js (`core`, `pkg` and `library`
//                                       absolute; `width`, `height`)
//   { type: "add", id, actor, model: {bundle, motion}, placement, motion?, facial? }
//   { type: "remove", actor }
//   { type: "set", id, actor, placement, tween: {duration, easing} }
//   { type: "motion", id, actor, name, loop }   { type: "facial", id, actor, name }
//   { type: "talking", actor, on }      { type: "mouth", actor, value }   (value null: released)
//   { type: "camera", id, camera: {zoom?, x?, y?}, tween }
//   { type: "finish" }                  { type: "physics", on }   { type: "breath", on }
//   { type: "paused", on }              { type: "resize", width, height }
// Commands for an actor still loading wait for it; for one that is gone (or whose loading
// failed or was replaced) they settle `false`.
// To the page:
//   { type: "ready" }                   the device is up
//   { type: "progress", id, loaded, total }  files of an "add" in the table
//   { type: "actors", ids }             the actors on stage in draw order, whenever it changes
//   { type: "settled", id, value, info?, error? }
//       "add": `info` (motions, facials, defaultMotion, defaultFacial, hasPhysics), or `error`
//              (message, kind, url; kind "abort" when a later "add" or a "remove" of the same
//              actor came before it was on stage)
//       "set" / "camera": `value` true when the tween ended, false when overtaken
//       "motion" / "facial": `value` started, or false when replaced by a later one before its
//              clip arrived; `error` when the clip could not be had
//   { type: "motionstart", actor, name, loop }   { type: "motionend", actor, name }
//   { type: "error", message, kind, url }   kind: unsupported, not-found, network or internal;
//                                           nothing more happens after it
"use strict";

/** The Cache API store of the bundles' files (shared with the viewer). A file is kept under
 * its URL with its bundle's CRC (`?crc=`), so a bundle the library re-exports is fetched again. */
const CACHE = "sekai-live2d-v1";
/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const FETCH_IDLE_MS = 30000;
/** Must match `stage::MAX_ACTORS`. */
const MAX_ACTORS = 8;

let stage;
let canvas;
let wasm;
let library;
let cache;
/** Actor id → its entry: `{gen, ready (a promise), live, livePrev, cancel, clips: {bundle, crc,
 * motions, facials}, newest: {motion, facial}}`. An entry whose actor is loading has `live` false. */
const actors = new Map();
let generation = 0;
let lastRemoveTag = 0;
/** `_ripper.json` of each bundle, by bundle (promises; a failed one is asked for again). */
const manifests = new Map();
/** The files in the table, by `bundle/path?crc` (promises; a failed one is fetched again). */
const files = new Map();
/** Bundles whose stale cache entries have been dropped this session. */
const swept = new Set();
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

function errorOf(e) {
  return { message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url };
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

/** The `_ripper.json` of library bundle `bundle`, asked for afresh once per worker. A bundle
 * the library does not have fails with `kind: "not-found"`. */
function manifest(bundle) {
  let p = manifests.get(bundle);
  if (!p) {
    p = (async () => {
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
    })();
    manifests.set(bundle, p);
    p.catch(() => manifests.delete(bundle));
  }
  return p;
}

/** Drops the cached files of `bundle` kept under another CRC than `crc` (once a session). */
async function dropStale(bundle, crc) {
  if (!cache || swept.has(bundle)) return;
  swept.add(bundle);
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
async function bundleFile(bundle, crc, path) {
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

/** Puts file `path` of `bundle` in the table (once; requests for one in flight share it). */
function loadFile(bundle, crc, path) {
  const key = `${bundle}/${path}?${crc}`;
  let p = files.get(key);
  if (!p) {
    p = bundleFile(bundle, crc, path).then((bytes) => wasm.putFile(`/lib/library/${bundle}/${path}`, bytes));
    files.set(key, p);
    p.catch(() => files.delete(key)); // asked for again next time
  }
  return p;
}

/** Puts `list` (`{bundle, crc, path}`) in the table, a few at a time; `progress(done, total)`. */
async function loadFiles(list, progress) {
  const queue = [...list];
  let done = 0;
  progress?.(done, list.length);
  await Promise.all(Array.from({ length: 12 }, async () => {
    for (let f; (f = queue.shift()) !== undefined;) {
      await loadFile(f.bundle, f.crc, f.path);
      progress?.(++done, list.length);
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

/** Posts the stage's events (tween ends, motion ends). */
function post(events) {
  for (const e of events ?? []) {
    if (e.type === "tween") postMessage({ type: "settled", id: e.token, value: e.completed });
    else if (e.type === "motionend") postMessage({ type: "motionend", actor: e.actor, name: e.name });
  }
}

/** After a command: its events, and the picture while paused (nothing else draws then). */
function flush() {
  post(stage.takeEvents());
  if (paused) stage.draw();
}

function postActors() {
  postMessage({ type: "actors", ids: stage.actors(), lastRemoveTag });
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bool(v) {
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Runs `f(entry)` on actor `id` now if it is on stage, once it is if it is loading; or
 * `gone()` if there is no such actor, or its loading fails or is overtaken.
 */
function withActor(id, f, gone) {
  const entry = actors.get(id);
  if (!entry) return gone();
  const run = () => {
    if (dead) return;
    if (actors.get(id) !== entry || !entry.live) return gone();
    try {
      f(entry);
    } catch (e) {
      fatal(e);
    }
  };
  if (entry.live) run();
  else entry.ready.then(run, () => { if (!dead) gone(); });
}

async function add(m) {
  const prev = actors.get(m.actor);
  if (!prev && actors.size >= MAX_ACTORS) {
    postMessage({ type: "settled", id: m.id, value: false, error: { message: "too many actors", kind: "internal" } });
    return;
  }
  const livePrev = prev?.live ? prev : prev?.livePrev;
  if (prev && !prev.live) prev.cancel?.();
  let ready;
  const entry = { gen: ++generation, live: false, livePrev, newest: { motion: 0, facial: 0 }, cancel: null };
  entry.ready = new Promise((resolve, reject) => { ready = { resolve, reject }; });
  entry.ready.catch(() => {});
  entry.cancel = () => ready.reject(new Error("cancelled"));
  actors.set(m.actor, entry);
  const current = () => !dead && actors.get(m.actor) === entry;
  try {
    const [model, motion] = await Promise.all([
      manifest(m.model.bundle),
      m.model.motion ? manifest(m.model.motion) : undefined,
    ]);
    const { motions, facials } = clipPaths(motion);
    const check = (name, names, what) => {
      if (name != null && !names.has(name)) throw failure(`no ${what} ${name}`, "internal");
    };
    check(m.motion, motions, "body motion");
    check(m.facial, facials, "facial");
    const defaultMotion = wasm.defaultMotion([...motions.keys()]) ?? null;
    const defaultFacial = wasm.defaultFacial([...facials.keys()]) ?? null;
    const startMotion = m.motion ?? defaultMotion;
    const startFacial = m.facial ?? defaultFacial;
    // the model (a model bundle carries no clips the stage plays) and the two starting clips
    const list = model.files.filter((f) => f.kind !== "motion").map((f) => ({ bundle: model.bundle, crc: model.crc, path: f.path }));
    for (const path of [motions.get(startMotion), facials.get(startFacial)]) {
      if (path !== undefined) list.push({ bundle: motion.bundle, crc: motion.crc, path });
    }
    await loadFiles(list, (loaded, total) => { if (current()) postMessage({ type: "progress", id: m.id, loaded, total }); });
    for (const b of [model, motion]) if (b) dropStale(b.bundle, b.crc).catch(() => {});
    if (!current()) throw failure(`actor ${m.actor} was replaced or removed before it was on stage`, "abort");
    const p = m.placement ?? {};
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    await whenCoreReady(() => {
      if (!current()) throw failure(`actor ${m.actor} was replaced or removed before it was on stage`, "abort");
      stage.addActor(m.actor, model.bundle, motion?.bundle ?? "", seed,
        num(p.x), num(p.y), num(p.scale), num(p.alpha), bool(p.mirror), num(p.order));
    });
    if (startMotion != null) stage.playMotion(m.actor, startMotion, false);
    if (startFacial != null) stage.setFacial(m.actor, startFacial);
    entry.clips = { bundle: motion?.bundle, crc: motion?.crc, motions, facials };
    entry.live = true;
    entry.livePrev = null;
    const info = {
      motions: [...motions.keys()],
      facials: [...facials.keys()],
      defaultMotion,
      defaultFacial,
      hasPhysics: stage.hasPhysics(m.actor),
    };
    postActors();
    flush(); // a replaced actor's tweens end overtaken
    postMessage({ type: "settled", id: m.id, value: true, info });
    ready.resolve();
    schedule();
  } catch (e) {
    if (actors.get(m.actor) === entry) {
      // the actor that was on stage before (if any) stays
      if (livePrev) actors.set(m.actor, livePrev);
      else actors.delete(m.actor);
    }
    ready.reject(e);
    if (!dead) postMessage({ type: "settled", id: m.id, value: false, error: errorOf(e) });
  }
}

function remove(m) {
  if (typeof m.tag === "number" && m.tag > lastRemoveTag) lastRemoveTag = m.tag;
  const entry = actors.get(m.actor);
  if (entry) {
    actors.delete(m.actor);
    if (!entry.live) entry.cancel?.();
  }
  if (stage.removeActor(m.actor)) {
    postActors();
    flush();
  } else if (typeof m.tag === "number") {
    postActors();
  }
}

/** A "motion" or "facial" request: its clip in, then started unless a newer one came since. */
function change(kind, m) {
  const settle = (value, error) => postMessage({ type: "settled", id: m.id, value, error });
  withActor(m.actor, async (entry) => {
    entry.newest[kind] = m.id;
    const path = (kind === "motion" ? entry.clips.motions : entry.clips.facials).get(m.name);
    try {
      if (path === undefined) throw failure(`no ${kind === "motion" ? "body motion" : "facial"} ${m.name}`, "internal");
      await loadFile(entry.clips.bundle, entry.clips.crc, path);
      if (dead || actors.get(m.actor) !== entry || entry.newest[kind] !== m.id) {
        settle(false);
        return;
      }
      if (kind === "motion") stage.playMotion(m.actor, m.name, !!m.loop);
      else stage.setFacial(m.actor, m.name);
      if (kind === "motion") postMessage({ type: "motionstart", actor: m.actor, name: m.name, loop: !!m.loop });
      settle(true);
      if (paused) stage.draw();
    } catch (e) {
      settle(false, errorOf(e));
    }
  }, () => settle(false));
}

function setActor(m) {
  withActor(m.actor, () => {
    const p = m.placement ?? {};
    const t = m.tween ?? {};
    stage.setActor(m.actor, num(p.x), num(p.y), num(p.scale), num(p.alpha), bool(p.mirror), num(p.order),
      num(t.duration) ?? 0, t.easing ?? "linear", m.id);
    if (p.order !== undefined) postActors();
    flush();
  }, () => postMessage({ type: "settled", id: m.id, value: false }));
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
  wasm = wasm_bindgen;
  library = o.library;
  cache = await openCache();
  canvas = offscreen;
  stage = await wasm.Stage.create(canvas, "/lib", o.width, o.height);
  postMessage({ type: "ready" });
  schedule();
}

const nextFrame = self.requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(() => f(performance.now()), 1000 / 60));

function schedule() {
  if (scheduled || paused || dead || !stage) return;
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
    post(stage.frame(dt));
  } catch (e) {
    fatal(e);
    return;
  }
  schedule();
}

onmessage = (e) => {
  const m = e.data;
  if (dead) return;
  try {
    switch (m.type) {
      case "init":
        init(m.options, m.canvas).catch(fatal);
        break;
      case "add":
        add(m);
        break;
      case "remove":
        remove(m);
        break;
      case "set":
        setActor(m);
        break;
      case "motion":
      case "facial":
        change(m.type, m);
        break;
      case "talking":
        withActor(m.actor, () => stage.setTalking(m.actor, !!m.on), () => {});
        break;
      case "mouth":
        withActor(m.actor, () => { stage.setMouth(m.actor, num(m.value)); if (paused) stage.draw(); }, () => {});
        break;
      case "camera": {
        const c = m.camera ?? {};
        const t = m.tween ?? {};
        stage.setCamera(num(c.zoom), num(c.x), num(c.y), num(t.duration) ?? 0, t.easing ?? "linear", m.id);
        flush();
        break;
      }
      case "finish":
        stage.finishTweens();
        flush();
        break;
      case "physics":
        stage.setPhysics(!!m.on);
        break;
      case "breath":
        stage.setBreath(!!m.on);
        break;
      case "paused":
        paused = !!m.on;
        last = 0;
        schedule();
        break;
      case "resize":
        canvas.width = m.width;
        canvas.height = m.height;
        stage.resize(m.width, m.height);
        if (paused) stage.draw();
        break;
    }
  } catch (err) {
    fatal(err);
  }
};
