// The viewer's worker: fetches a model's files from a site's published version, keeps them in
// the browser's Cache API, and draws the model on the OffscreenCanvas the page handed over (SSE's
// ADR-0031 way: the files go into the wasm's in-memory file table, under /pub at their
// publication paths, which the SSE crates read). Cubism Core for Web is loaded here with
// importScripts before the wasm (SSE's ADR-0032).
//
// Opening a model fetches the documents of its `live2d-model` asset and its `live2d-motions`
// asset (each given by name, or by a directory holding it — a trailing `/` skips the
// `<path>.asset.json` probe; resolved directory mappings are cached per published version), the
// model's files and the default body motion and facial; any other clip is fetched the first time
// it is played.
//
// From the page:
//   { type: "init", options, canvas }   options: see viewer.js (`core`, `pkg` and `base`
//                                       absolute; `model: {asset, motion}`, `width`, `height`)
//   { type: "motion", id, name, loop }  { type: "facial", id, name }   answered by "settled"
//   { type: "physics", on }             { type: "breath", on }       { type: "paused", on }
//   { type: "view", zoom, x, y }        { type: "resize", width, height }
// To the page:
//   { type: "progress", loaded, total }  files of the first opening in the table
//   { type: "ready", model, motion, motions, facials, defaultMotion, defaultFacial, hasPhysics }
//                                       `model` and `motion` the asset names opened (`motion`
//                                       null when the model opened without motions)
//   { type: "settled", id, started, error? }  a "motion" or "facial": started, or replaced by a
//                                       later one before its clip arrived (`started` false), or
//                                       its clip could not be had (`error`: message, kind, url)
//   { type: "motionend", name }
//   { type: "error", message, kind, url }   kind: unsupported, not-found, network or internal;
//                                           nothing more happens after it
"use strict";

/** The Cache API store of the files, by URL: a file of a published version never changes. */
const CACHE = "sekai-live2d-v2";
/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const FETCH_IDLE_MS = 30000;
/** Where the files of the published version are in the file table. */
const ROOT = "/pub/";

let viewer;
let canvas;
let loader;
/** The motions asset opened (or null), and its clips by name. */
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
 * table path `/pub/<path>` is served at `<base><path>`. Each file is fetched once and kept in the
 * Cache API.
 */
class Loader {
  constructor(base, putFile, cache) {
    this.base = base;
    this.putFile = putFile;
    this.cache = cache;
    this.loaded = new Map();
    this.jsons = new Map();
    this.assets = new Map();
    this.resolved = new Map();
  }

  url(path) {
    return this.base + encodePath(path.slice(ROOT.length));
  }

  /** Normalized URL for `path` under `this.base` (preserving a single trailing `/` when given). */
  assetUrl(path) {
    const raw = String(path ?? "");
    const trailing = raw.endsWith("/");
    const clean = raw.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
    return clean ? `${this.base}${encodePath(clean)}${trailing ? "/" : ""}` : this.base;
  }

  /** Cache API key for a resolved directory -> nested asset mapping under this published version. */
  resolveCacheUrl(name, form) {
    return `${this.base}${encodePath(name)}/?sekai-asset-resolve=${encodeURIComponent(form)}`;
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
    progress?.(done, queue.length);
    const total = queue.length;
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
   * The asset of form `form` that `path` names:
   * - When `path` ends with `/`, it names a directory directly (skipping `<path>.asset.json` so
   *   cold directory loads never incur a 404 probe) and walks its listings for the first matching
   *   asset (`buildmodeldata` / `buildmotiondata` first).
   * - Otherwise, it checks `<path>.asset.json` first and falls back to walking `<path>/`.
   * Resolved directory -> nested-asset mappings are persisted in `sekai-live2d-v2` (and kept in
   * the worker) per immutable published version so warm reloads jump straight to the resolved
   * `.asset.json`. Its document is put in the table. Undefined when there is none.
   */
  asset(path, form) {
    const raw = String(path ?? "");
    const explicitDir = raw.endsWith("/");
    const name = raw.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
    if (!name) return Promise.resolve(undefined);
    const key = `${form}\0${name}${explicitDir ? "/" : ""}`;
    let p = this.assets.get(key);
    if (!p) {
      p = (async () => {
        const take = async (asset) => {
          const document = await this.json(`${asset}.asset.json`);
          if (document?.form !== form) return undefined;
          this.putFile(`${ROOT}${asset}.asset.json`, new TextEncoder().encode(JSON.stringify(document)));
          return asset;
        };
        const resolvedKey = `${form}\0${name}`;
        const resolveUrl = this.resolveCacheUrl(name, form);

        let cachedAsset = this.resolved.get(resolvedKey);
        let fromCache = false;
        if (!cachedAsset && this.cache) {
          let hit;
          try {
            hit = await this.cache.match(resolveUrl);
          } catch { /* custom scheme or opaque origin */ }
          if (hit) {
            fromCache = true;
            try {
              const data = await hit.json();
              if (typeof data?.asset === "string") {
                const normalized = data.asset.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
                if (normalized.startsWith(`${name}/`) && !normalized.split("/").includes("..")) {
                  cachedAsset = normalized;
                }
              }
            } catch { /* corrupt cache entry */ }
            if (!cachedAsset) {
              try { await this.cache.delete?.(resolveUrl); } catch { /* ignore */ }
            }
          }
        }
        if (cachedAsset) {
          let validated;
          try {
            validated = await take(cachedAsset);
          } catch (e) {
            if (e?.kind === "network") throw e;
          }
          if (validated) {
            this.resolved.set(resolvedKey, validated);
            return validated;
          }
          this.resolved.delete(resolvedKey);
          if (fromCache) {
            try { await this.cache?.delete?.(resolveUrl); } catch { /* ignore */ }
          }
        }

        if (!explicitDir) {
          const own = await take(name);
          if (own) return own;
        }
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
        const found = await walk(name, 0);
        if (found && found !== name) {
          this.resolved.set(resolvedKey, found);
          if (this.cache) {
            try {
              await this.cache.put(
                resolveUrl,
                new Response(JSON.stringify({ asset: found }), {
                  headers: { "Content-Type": "application/json" },
                }),
              );
            } catch { /* custom scheme or opaque origin */ }
          }
        }
        return found;
      })();
      this.assets.set(key, p);
      p.catch(() => this.assets.delete(key));
    }
    return p;
  }
}

/** A "motion" or "facial" request: its clip in, then started unless a newer one came since. */
async function change(kind, m) {
  newest[kind] = m.id;
  try {
    const names = kind === "motion" ? clips.motions : clips.facials;
    if (!clips.asset || !names.includes(m.name)) {
      throw failure(`no ${kind === "motion" ? "body motion" : "facial"} ${m.name}`, "internal");
    }
    await loader.get(wasm_bindgen.clipFile(clips.asset, kind, m.name));
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
  const { Viewer, putFile, modelFiles, clipNames, clipFile, defaultMotion: pickMotion, defaultFacial: pickFacial } = wasm_bindgen;
  loader = new Loader(o.base, putFile, await openCache());
  const [model, motion] = await Promise.all([
    loader.asset(o.model.asset, "live2d-model"),
    o.model.motion ? loader.asset(o.model.motion, "live2d-motions") : undefined,
  ]);
  if (!model) throw failure(`the published version has no model ${o.model.asset}`, "not-found", loader.assetUrl(o.model.asset));
  // a motion set the site does not have leaves the model without motions
  const names = motion ? JSON.parse(await loader.retryMissing(() => clipNames(motion))) : { motions: [], facials: [] };
  const defaultMotion = pickMotion(names.motions);
  const defaultFacial = pickFacial(names.facials);
  const files = await loader.retryMissing(() => modelFiles(model));
  if (defaultMotion !== undefined) files.push(clipFile(motion, "motion", defaultMotion));
  if (defaultFacial !== undefined) files.push(clipFile(motion, "facial", defaultFacial));
  await loader.getAll(files, (loaded, total) => postMessage({ type: "progress", loaded, total }));
  canvas = offscreen;
  const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  viewer = await whenCoreReady(() => Viewer.create(canvas, model, motion ?? "", o.width, o.height, seed));
  clips = { asset: motion, motions: names.motions, facials: names.facials };
  if (defaultMotion !== undefined) viewer.playMotion(defaultMotion, false);
  if (defaultFacial !== undefined) viewer.setFacial(defaultFacial);
  postMessage({
    type: "ready",
    model,
    motion: motion ?? null,
    motions: names.motions,
    facials: names.facials,
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
