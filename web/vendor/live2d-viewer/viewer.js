// SekaiLive2DViewer: one Project SEKAI Live2D model on a canvas (an ES module a page imports).
//
//   const viewer = await SekaiLive2DViewer.create({ canvas, sources: { site, region },
//     model: { asset, motion }, width, height });
//   await viewer.playMotion(viewer.motions[3], { loop: true }); await viewer.setFacial("face_smile_01");
//   viewer.physics = false; viewer.breath = false; viewer.pause(); viewer.play();
//   viewer.setView({ zoom: 2, x: 0, y: -0.5 }); viewer.resize(w, h); viewer.destroy();
//
// The model is drawn by a worker (viewer-worker.js, next to this file) on an OffscreenCanvas,
// with SekaiStoryExporter's Live2D implementation compiled to wasm (pkg/): motions, facials,
// blinking, breathing and physics as the game runs them. The canvas is transparent around the
// model (premultiplied alpha); the page puts its background under it. The model is read from a
// site's published version. Opening it fetches the model and its default motion and facial; any
// other clip is fetched when it is first played.

// Cubism Core for Web where Live2D publishes it (SSE's ADR-0032): the address has no version
// in it and serves whichever Core Live2D last put there.
const CORE = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const HERE = new URL(".", import.meta.url).href;

function withSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function resolveUrl(url) {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) return url;
  return typeof location !== "undefined" ? new URL(url, location.href).href : url;
}

/**
 * The base URL of the published version of `region` on `site`, ending in `/`:
 * `<site>/<region>@<version>/`, the version the site publishes now unless `version` is given.
 * `proxy`, when set, replaces `https://` in front of the URLs (`<proxy><host>/…`), for a
 * development server that relays them.
 * @param {{site: string, region: string, version?: string, proxy?: string}} sources
 * @param {{signal?: AbortSignal}} [opts]
 */
export async function resolveBase({ site, region, version, proxy }, { signal } = {}) {
  const relay = proxy ? withSlash(resolveUrl(proxy)) : "";
  const through = (url) => (relay ? url.replace(/^https:\/\//, relay) : url);
  const root = resolveUrl(site).replace(/\/+$/, "");
  if (version === undefined || version === null || version === "") {
    const url = through(`${root}/${region}/`);
    let listing;
    try {
      const r = await fetch(url, { cache: "no-cache", signal });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      listing = await r.json();
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      throw Object.assign(new Error(String(e?.message ?? e)), { kind: "network", url });
    }
    if (typeof listing.published_version !== "string") {
      throw Object.assign(new Error(`${url}: no published version`), { kind: "network", url });
    }
    version = listing.published_version;
  }
  return through(`${root}/${region}@${encodeURIComponent(version)}/`);
}

/**
 * Events (`addEventListener`), each a `CustomEvent`:
 *   ready        the model is drawn (fired before `create` resolves; `create` resolving says
 *                the same)
 *   progress     `detail: {loaded, total}`: files of the first opening in, while loading
 *   motionstart  `detail: {name, loop}`: `playMotion` started a body motion (its clip is in)
 *   motionend    `detail: {name}`: a body motion played once reached its end (the model holds
 *                its last pose, and blinks again)
 *   error        `detail: {message, kind, url}`: the viewer stopped for good
 *
 * Errors, from `create` (an Error with these as properties) and in the `error` event, have a
 * `kind`:
 *   unsupported  the browser lacks something (`missing`, see `supported`)
 *   not-found    the published version has no such model (`url`: where it was looked for); a
 *                motion set it has no is not an error: the model opens without motions
 *   network      a file could not be fetched, after several tries (`url`)
 *   internal     anything else
 */
export class SekaiLive2DViewer extends EventTarget {
  /**
   * What the browser lacks, checked without loading anything: `{ok, missing}`, `missing`
   * naming each of `webgpu` (no `navigator.gpu`), `webgpu-adapter` (WebGPU gives no adapter:
   * turned off, or the GPU is blocked), `offscreen-canvas` and `worker`.
   */
  static async supported() {
    const missing = [];
    if (!globalThis.navigator?.gpu) missing.push("webgpu");
    else {
      let adapter = null;
      try { adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }); } catch {}
      if (!adapter) missing.push("webgpu-adapter");
    }
    if (typeof OffscreenCanvas === "undefined" || !globalThis.HTMLCanvasElement?.prototype.transferControlToOffscreen) {
      missing.push("offscreen-canvas");
    }
    if (typeof Worker === "undefined") missing.push("worker");
    return { ok: missing.length === 0, missing };
  }

  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas  its drawing goes to the viewer for good: a viewer made
   *   after this one was destroyed (or failed) needs a canvas of its own
   * @param {string} [o.js]    URL of the directory of viewer.js and viewer-worker.js; default:
   *   this module's directory. The worker must be of the page's origin
   * @param {string} [o.pkg]   URL of the wasm (`sekai_live2d_viewer.js` and `_bg.wasm`),
   *   relative to `js`; default `pkg/`
   * @param {string} [o.core]  URL of live2dcubismcore.min.js, for a page that serves a copy of
   *   its own; default: Live2D's address
   * @param {{site: string, region: string, version?: string, proxy?: string}} o.sources  the
   *   site that publishes the data (e.g. `https://example.org`), the region (jp, en, tw, kr or
   *   cn) and, to pin it, the published version (default: the one the site publishes now);
   *   `proxy`: see `resolveBase`
   * @param {{asset: string, motion?: string|null}} o.model  the model's `live2d-model` asset and
   *   its `live2d-motions` asset, each by its name, or by a directory of the published version
   *   holding it (the first found going down its listings), such as `live2d/model/<name>` and
   *   `live2d/motion/<name>_motion_base`. A motion set the version does not have leaves the
   *   model without motions
   * @param {number} o.width   drawing size in pixels (the CSS size × devicePixelRatio)
   * @param {number} o.height
   * @param {AbortSignal} [o.signal]  aborts loading: `create` rejects with an AbortError
   * @param {(p: {loaded: number, total: number}) => void} [o.onProgress]
   */
  static async create(o) {
    const { missing } = await SekaiLive2DViewer.supported();
    if (missing.length) {
      throw Object.assign(new Error(`this browser cannot show the viewer: no ${missing.join(", ")}`), {
        kind: "unsupported",
        missing,
      });
    }
    o.signal?.throwIfAborted();
    const v = new SekaiLive2DViewer();
    try {
      await v.#load(o);
    } catch (e) {
      v.destroy();
      if (e && typeof e === "object" && !e.kind && e.name !== "AbortError") e.kind = "internal";
      throw e;
    }
    return v;
  }

  #worker;
  #destroyed = false;
  #paused = false;
  #physics = true;
  #breath = true;
  #view = { zoom: 1, x: 0, y: 0 };
  /** `playMotion` and `setFacial` calls waiting for their clip, by id: {resolve, reject}. */
  #pending = new Map();
  #nextId = 1;

  /** Body motion names, sorted. */
  motions = [];
  /** Facial names, sorted. */
  facials = [];
  defaultMotion = null;
  defaultFacial = null;
  /** The `live2d-model` asset opened, and the `live2d-motions` asset (null: none). */
  model = null;
  motionSet = null;
  /** The resolved published-version base URL, ending in `/`. */
  base = null;
  /** Whether the model has a physics rig (`physics` changes nothing without one). */
  hasPhysics = false;
  /** The body motion last started, and the facial last set. */
  motion = null;
  facial = null;

  async #load(o) {
    const js = withSlash(new URL(o.js ?? HERE, location.href).href);
    const base = await resolveBase(o.sources, { signal: o.signal });
    o.signal?.throwIfAborted();
    this.base = base;
    const options = {
      pkg: withSlash(new URL(o.pkg ?? "pkg/", js).href),
      core: new URL(o.core ?? CORE, location.href).href,
      base,
      model: { asset: o.model.asset, motion: o.model.motion ?? null },
      width: Math.max(1, Math.round(o.width)),
      height: Math.max(1, Math.round(o.height)),
    };
    let worker;
    try {
      worker = this.#worker = new Worker(new URL("viewer-worker.js", js));
    } catch (e) {
      throw Object.assign(new Error(String(e?.message ?? e)), { kind: "network", url: `${js}viewer-worker.js` });
    }
    const offscreen = o.canvas.transferControlToOffscreen();
    await new Promise((resolve, reject) => {
      const abort = () => reject(o.signal.reason ?? new DOMException("aborted", "AbortError"));
      o.signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = (e) => {
        e.preventDefault?.();
        reject(Object.assign(new Error(e.message || "the viewer's worker failed to start"), { kind: "network", url: `${js}viewer-worker.js` }));
      };
      worker.onmessage = (e) => {
        const m = e.data;
        switch (m.type) {
          case "progress":
            o.onProgress?.({ loaded: m.loaded, total: m.total });
            this.dispatchEvent(new CustomEvent("progress", { detail: { loaded: m.loaded, total: m.total } }));
            break;
          case "ready":
            o.signal?.removeEventListener("abort", abort);
            this.model = m.model;
            this.motionSet = m.motion;
            this.motions = m.motions;
            this.facials = m.facials;
            this.defaultMotion = m.defaultMotion ?? null;
            this.defaultFacial = m.defaultFacial ?? null;
            this.hasPhysics = m.hasPhysics;
            this.motion = this.defaultMotion;
            this.facial = this.defaultFacial;
            worker.onmessage = (e) => this.#message(e.data);
            worker.onerror = (e) => this.#fail({ message: e.message || "the viewer's worker failed", kind: "internal" });
            this.dispatchEvent(new CustomEvent("ready"));
            resolve();
            break;
          case "error":
            o.signal?.removeEventListener("abort", abort);
            reject(Object.assign(new Error(m.message), { kind: m.kind, url: m.url }));
            break;
        }
      };
      worker.postMessage({ type: "init", options, canvas: offscreen }, [offscreen]);
    });
  }

  #message(m) {
    if (m.type === "settled") {
      const p = this.#pending.get(m.id);
      this.#pending.delete(m.id);
      if (!p) return;
      if (m.error) p.reject(Object.assign(new Error(m.error.message), { kind: m.error.kind, url: m.error.url }));
      else p.resolve(m.started);
    } else if (m.type === "motionend") {
      this.dispatchEvent(new CustomEvent("motionend", { detail: { name: m.name } }));
    } else if (m.type === "error") {
      this.#fail(m);
    }
  }

  #fail(m) {
    if (this.#destroyed) return;
    this.error = { message: m.message, kind: m.kind ?? "internal", url: m.url };
    this.#worker?.terminate();
    this.#destroyed = true;
    this.#settleAll((p) => p.reject(Object.assign(new Error(this.error.message), this.error)));
    this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
  }

  #settleAll(f) {
    for (const p of this.#pending.values()) f(p);
    this.#pending.clear();
  }

  /** Sends a "motion" or "facial" request; resolves to whether it started (see playMotion). */
  #change(m) {
    if (this.#destroyed) return Promise.resolve(false);
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ ...m, id });
    });
  }

  #post(m) {
    if (!this.#destroyed) this.#worker.postMessage(m);
  }

  /**
   * Starts the body motion `name` (one of `motions`; another name throws at once). It plays once
   * and holds its last pose (`motionend` then), or with `loop` starts again each time it ends.
   * Its clip is fetched the first time (about 1 KB; kept in the cache after that), so this
   * resolves once it has started: to `true`, or to `false` when a later `playMotion` came before
   * the clip did (that one plays instead). It rejects, with `kind` and `url`, when the clip could
   * not be fetched; the viewer goes on with what it was playing.
   */
  playMotion(name, { loop = false } = {}) {
    if (!this.motions.includes(name)) throw new Error(`no body motion ${name}`);
    return this.#change({ type: "motion", name, loop: !!loop }).then((started) => {
      if (started) {
        this.motion = name;
        this.dispatchEvent(new CustomEvent("motionstart", { detail: { name, loop: !!loop } }));
      }
      return started;
    });
  }

  /** Changes the facial to `name` (one of `facials`), fetching its clip the first time: resolves
   * as `playMotion` does. */
  setFacial(name) {
    if (!this.facials.includes(name)) throw new Error(`no facial ${name}`);
    return this.#change({ type: "facial", name }).then((started) => {
      if (started) this.facial = name;
      return started;
    });
  }

  /** Physics on or off; on again, the rig starts at rest. */
  get physics() { return this.#physics; }
  set physics(on) {
    this.#physics = !!on;
    this.#post({ type: "physics", on: this.#physics });
  }

  /** Breathing on or off. */
  get breath() { return this.#breath; }
  set breath(on) {
    this.#breath = !!on;
    this.#post({ type: "breath", on: this.#breath });
  }

  get paused() { return this.#paused; }
  play() {
    this.#paused = false;
    this.#post({ type: "paused", on: false });
  }
  pause() {
    this.#paused = true;
    this.#post({ type: "paused", on: true });
  }

  /**
   * Zoom (≥ 1; 1 shows the whole model) and where the centre of that whole-model framing lands
   * on the canvas, in normalised device coordinates (x right, y up, (0, 0) the canvas' centre,
   * ±1 its edges). Zooming about a point p of the canvas (NDC) from z1 to z2 keeps what is
   * under it when x2 = p.x − (p.x − x1)·z2/z1 (y alike). The model is redrawn at the new size,
   * not enlarged: it stays sharp.
   */
  setView({ zoom = 1, x = 0, y = 0 } = {}) {
    this.#view = { zoom: Math.max(1, +zoom || 1), x: +x || 0, y: +y || 0 };
    this.#post({ type: "view", ...this.#view });
  }

  get view() { return { ...this.#view }; }

  /** Draws at `width` × `height` pixels from now on (the CSS size × devicePixelRatio). */
  resize(width, height) {
    this.#post({ type: "resize", width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
  }

  /** Stops the viewer and frees what it holds (the worker, its files and GPU resources).
   * `playMotion` and `setFacial` calls still waiting resolve to `false`. */
  destroy() {
    this.#worker?.terminate();
    this.#destroyed = true;
    this.#settleAll((p) => p.resolve(false));
  }
}
