// The stage's worker: several models on the OffscreenCanvas the page handed over, placed as a
// story places its characters. Files are fetched from a site's published version, cached in the
// Cache API, and put in the wasm's in-memory file table under /pub at their publication paths as
// the viewer's worker does (viewer-worker.js; SSE's ADR-0031); Cubism Core for Web is loaded
// with importScripts before the wasm (SSE's ADR-0032).
//
// Adding an actor fetches the documents of its `live2d-model` asset and its `live2d-motions`
// asset (each given by name, or by a directory holding it; resolved once per worker), the
// model's files and the starting body motion and facial; any other clip is fetched the first
// time it is played. An asset two actors use is fetched once: the file table is shared.
//
// From the page (every `id` is answered by one "settled"):
//   { type: "init", options, canvas }   options: see stage.js (`core`, `pkg` and `base`
//                                       absolute; `width`, `height`)
//   { type: "add", id, actor, model: {asset, motion}, placement, motion?, facial? }
//   { type: "remove", actor, tag? }
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
//   { type: "actors", ids, lastRemoveTag }   the actors on stage in draw order, whenever it changes
//   { type: "settled", id, value, info?, error? }
//       "add": `info` (model, motionSet, motions, facials, defaultMotion, defaultFacial,
//              hasPhysics), or `error` (message, kind, url; kind "abort" when a later "add" or a
//              "remove" of the same actor came before it was on stage)
//       "set" / "camera": `value` true when the tween ended, false when overtaken
//       "motion" / "facial": `value` started, or false when replaced by a later one before its
//              clip arrived; `error` when the clip could not be had
//   { type: "motionstart", actor, name, loop }   { type: "motionend", actor, name }
//   { type: "error", message, kind, url }   kind: unsupported, not-found, network or internal;
//                                           nothing more happens after it
"use strict";

/** The Cache API store of the files (shared with the viewer), by URL: a file of a published
 * version never changes. */
const CACHE = "sekai-live2d-v2";
/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const FETCH_IDLE_MS = 30000;
/** Where the files of the published version are in the file table. */
const ROOT = "/pub/";
/** Must match `stage::MAX_ACTORS`. */
const MAX_ACTORS = 8;

let stage;
let canvas;
let wasm;
let loader;
/** Actor id → its entry: `{gen, ready (a promise), live, livePrev, cancel, clips: {asset,
 * motions, facials}, newest: {motion, facial}}`. An entry whose actor is loading has `live` false. */
const actors = new Map();
let generation = 0;
let lastRemoveTag = 0;
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
async function fetchBytes(url) {
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
      const r = await fetch(url, { signal: abort.signal });
      status = r.status;
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      if (!r.body) return new Uint8Array(await r.arrayBuffer());
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

/** The file-table path a wasm call failed to find, for each of its "not in the file table". */
function missingPaths(e) {
  return String(e?.message ?? e).split("; ").map((msg) => {
    const end = msg.indexOf(": not in the file table");
    if (end < 0) return undefined;
    const start = msg.lastIndexOf(": ", end - 1);
    const path = msg.slice(start < 0 ? 0 : start + 2, end);
    return path.startsWith("/") ? path : undefined;
  }).filter(Boolean);
}

/**
 * Fetches files of the published version at `base` (ending in `/`) into the file table: a
 * table path `/pub/<path>` is served at `<base><path>`. Each file and asset resolution is
 * shared across all actors in the worker and kept in the Cache API.
 */
class Loader {
  constructor(base, putFile, cache) {
    this.base = base;
    this.putFile = putFile;
    this.cache = cache;
    this.loaded = new Map();
    this.jsons = new Map();
    this.assets = new Map();
  }

  /** The bytes of the publication path `path` (a directory's listing when it ends in `/`). */
  async bytes(path) {
    const url = this.base + encodePath(path);
    try {
      const hit = await this.cache?.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch { /* fetch it */ }
    const bytes = await fetchBytes(url);
    try { this.cache?.put(url, new Response(bytes))?.catch(() => {}); } catch { /* custom scheme or opaque origin */ }
    return bytes;
  }

  /** Puts the file at table path `path` in the table (once; requests in flight share it). */
  get(path) {
    let p = this.loaded.get(path);
    if (!p) {
      p = this.bytes(path.slice(ROOT.length)).then((bytes) => this.putFile(path, bytes));
      this.loaded.set(path, p);
      p.catch(() => this.loaded.delete(path)); // asked for again next time
    }
    return p;
  }

  /** Puts all of `paths` in the table, a few at a time; `progress(done, total)`. */
  async getAll(paths, progress) {
    const queue = [...new Set(paths)];
    let done = 0;
    const total = queue.length;
    progress?.(done, total);
    await Promise.all(Array.from({ length: 12 }, async () => {
      for (let p; (p = queue.shift()) !== undefined;) {
        await this.get(p);
        progress?.(++done, total);
      }
    }));
  }

  /** Calls `f` until it stops failing for files the table lacks, fetching the ones it names. */
  async retryMissing(f) {
    for (let round = 1; ; round++) {
      try {
        return f();
      } catch (e) {
        const paths = missingPaths(e);
        if (!paths.length || round > 50) throw e;
        await Promise.all(paths.map((p) => this.get(p)));
      }
    }
  }

  /** The JSON of the publication path `path` (cached in worker); undefined when the site has none. */
  json(path) {
    let p = this.jsons.get(path);
    if (!p) {
      p = (async () => {
        try {
          return JSON.parse(new TextDecoder().decode(await this.bytes(path)));
        } catch (e) {
          if (e?.status === 404) return undefined;
          throw e;
        }
      })();
      this.jsons.set(path, p);
      p.catch(() => this.jsons.delete(path));
    }
    return p;
  }

  /**
   * The asset of form `form` that `path` names: that asset (its document `<path>.asset.json` is
   * there), or one in a directory, the first found going down its listings in order (the ones
   * the client names `buildmodeldata` and `buildmotiondata` first). Its document is put in the
   * table. Undefined when there is none.
   */
  asset(path, form) {
    const name = path.replace(/^\/+|\/+$/g, "");
    const key = `${form}\0${name}`;
    let p = this.assets.get(key);
    if (!p) {
      p = (async () => {
        const take = async (asset) => {
          const document = await this.json(`${asset}.asset.json`);
          if (document?.form !== form) return undefined;
          this.putFile(`${ROOT}${asset}.asset.json`, new TextEncoder().encode(JSON.stringify(document)));
          return asset;
        };
        const own = await take(name);
        if (own) return own;
        const walk = async (dir, depth) => {
          const listing = await this.json(`${dir}/`);
          if (!listing) return undefined;
          const assets = (listing.files ?? [])
            .map((f) => f.name)
            .filter((n) => n.endsWith(".asset.json"))
            .map((n) => n.slice(0, -".asset.json".length))
            .sort((a, b) => Number(!/^build\w*data$/i.test(a)) - Number(!/^build\w*data$/i.test(b)));
          for (const asset of assets) {
            const found = await take(`${dir}/${asset}`);
            if (found) return found;
          }
          if (depth >= 12) return undefined;
          for (const sub of listing.directories ?? []) {
            const found = await walk(`${dir}/${sub}`, depth + 1);
            if (found) return found;
          }
          return undefined;
        };
        return walk(name, 0);
      })();
      this.assets.set(key, p);
      p.catch(() => this.assets.delete(key));
    }
    return p;
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
      loader.asset(m.model.asset, "live2d-model"),
      m.model.motion ? loader.asset(m.model.motion, "live2d-motions") : undefined,
    ]);
    if (!model) {
      throw failure(
        `the published version has no model ${m.model.asset}`,
        "not-found",
        loader.base + encodePath(m.model.asset),
      );
    }
    // a motion set the site does not have leaves the actor without motions
    const names = motion
      ? JSON.parse(await loader.retryMissing(() => wasm.clipNames(motion)))
      : { motions: [], facials: [] };
    const check = (name, list, what) => {
      if (name != null && !list.includes(name)) throw failure(`no ${what} ${name}`, "internal");
    };
    check(m.motion, names.motions, "body motion");
    check(m.facial, names.facials, "facial");
    const defaultMotion = wasm.defaultMotion(names.motions) ?? null;
    const defaultFacial = wasm.defaultFacial(names.facials) ?? null;
    const startMotion = m.motion ?? defaultMotion;
    const startFacial = m.facial ?? defaultFacial;
    const files = await loader.retryMissing(() => wasm.modelFiles(model));
    if (startMotion != null) files.push(wasm.clipFile(motion, "motion", startMotion));
    if (startFacial != null) files.push(wasm.clipFile(motion, "facial", startFacial));
    await loader.getAll(files, (loaded, total) => {
      if (current()) postMessage({ type: "progress", id: m.id, loaded, total });
    });
    if (!current()) throw failure(`actor ${m.actor} was replaced or removed before it was on stage`, "abort");
    const p = m.placement ?? {};
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    await whenCoreReady(() => {
      if (!current()) throw failure(`actor ${m.actor} was replaced or removed before it was on stage`, "abort");
      stage.addActor(
        m.actor, model, motion ?? "", seed,
        num(p.x), num(p.y), num(p.scale), num(p.alpha), bool(p.mirror), num(p.order),
      );
    });
    if (startMotion != null) stage.playMotion(m.actor, startMotion, false);
    if (startFacial != null) stage.setFacial(m.actor, startFacial);
    entry.clips = { asset: motion ?? null, motions: names.motions, facials: names.facials };
    entry.live = true;
    entry.livePrev = null;
    const info = {
      model,
      motionSet: motion ?? null,
      motions: names.motions,
      facials: names.facials,
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
    const names = kind === "motion" ? entry.clips.motions : entry.clips.facials;
    try {
      if (!entry.clips.asset || !names.includes(m.name)) {
        throw failure(`no ${kind === "motion" ? "body motion" : "facial"} ${m.name}`, "internal");
      }
      await loader.get(wasm.clipFile(entry.clips.asset, kind, m.name));
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
  loader = new Loader(o.base, wasm.putFile, await openCache());
  canvas = offscreen;
  stage = await wasm.Stage.create(canvas, o.width, o.height);
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
