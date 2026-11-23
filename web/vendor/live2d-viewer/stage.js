// SekaiLive2DStage: several Project SEKAI Live2D models on one canvas, placed as a story places
// its characters (an ES module a page imports).
//
//   const stage = await SekaiLive2DStage.create({ canvas, sources: { site, region }, width, height });
//   await stage.addActor("ichika", { asset, motion }, { x: -0.5 });
//   await stage.setActor("ichika", { x: 0, alpha: 0.5 }, { duration: 0.5, easing: "in-out" });
//   await stage.playMotion("ichika", "w-normal-nod01"); stage.setTalking("ichika", true);
//   await stage.setCamera({ zoom: 1.2, y: -0.1 }, { duration: 1 }); stage.finishTweens();
//   stage.removeActor("ichika"); stage.pause(); stage.play(); stage.resize(w, h); stage.destroy();
//
// The models are drawn by a worker (stage-worker.js, next to this file) on an OffscreenCanvas,
// with SekaiStoryExporter's Live2D implementation compiled to wasm (pkg/, the viewer's): the
// game's story camera, and motions, facials, blinking, breathing and physics as the game runs
// them. The canvas is transparent around the models (premultiplied alpha); the page puts its
// background under it. The models are read from a site's published version.

import { resolveBase } from "./viewer.js";

export { resolveBase };

// Cubism Core for Web where Live2D publishes it (SSE's ADR-0032): the address has no version
// in it and serves whichever Core Live2D last put there.
const CORE = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const HERE = new URL(".", import.meta.url).href;
const EASINGS = ["linear", "in", "out", "in-out"];

function withSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function finite(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The placement fields given, checked (see `setActor`). */
function placement(p) {
  p = p ?? {};
  const out = {};
  for (const k of ["x", "y", "scale", "alpha", "order"]) {
    const v = finite(p[k]);
    if (v !== undefined) out[k] = v;
  }
  if (out.scale !== undefined) out.scale = Math.max(0, out.scale);
  if (out.alpha !== undefined) out.alpha = Math.min(1, Math.max(0, out.alpha));
  if (typeof p.mirror === "boolean") out.mirror = p.mirror;
  return out;
}

function tween(t) {
  t = t ?? {};
  const duration = Math.max(0, finite(t.duration) ?? 0);
  const easing = t.easing ?? "linear";
  if (!EASINGS.includes(easing)) throw new Error(`no easing ${easing} (${EASINGS.join(", ")})`);
  return { duration, easing };
}

function failure(e) {
  return Object.assign(new Error(e.message), { kind: e.kind ?? "internal", url: e.url });
}

/**
 * Events (`addEventListener`), each a `CustomEvent`:
 *   motionstart  `detail: {actor, name, loop}`: `playMotion` started a body motion
 *   motionend    `detail: {actor, name}`: a body motion played once reached its end
 *   actors       `detail: {actors}`: the actors on stage (in draw order) changed
 *   error        `detail: {message, kind, url}`: the stage stopped for good
 *
 * Errors (from `create`, `addActor`, `playMotion`, `setFacial`, and in the `error` event) have a
 * `kind`: unsupported, not-found, network or internal, as the viewer's (viewer.js). An
 * `addActor` overtaken by a later `addActor` or a `removeActor` of the same id before its model
 * was on stage rejects with an AbortError.
 */
export class SekaiLive2DStage extends EventTarget {
  /**
   * What the browser lacks, checked without loading anything: `{ok, missing}`, `missing`
   * naming each of `webgpu`, `webgpu-adapter`, `offscreen-canvas` and `worker` (as the viewer).
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
   * An empty stage; resolves once the device is up.
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas  its drawing goes to the stage for good
   * @param {string} [o.js]    URL of the directory of stage.js and stage-worker.js; default:
   *   this module's directory. The worker must be of the page's origin
   * @param {string} [o.pkg]   URL of the wasm, relative to `js`; default `pkg/`
   * @param {string} [o.core]  URL of live2dcubismcore.min.js; default: Live2D's address
   * @param {{site: string, region: string, version?: string, proxy?: string}} o.sources  the
   *   site that publishes the data (e.g. `https://storage.pjsk.moe`), the region (jp, en, tw, kr
   *   or cn) and, to pin it, the published version (default: the one the site publishes now);
   *   `proxy`: see `resolveBase`
   * @param {number} o.width   drawing size in pixels (the CSS size × devicePixelRatio)
   * @param {number} o.height
   * @param {AbortSignal} [o.signal]  aborts starting: `create` rejects with an AbortError
   */
  static async create(o) {
    const { missing } = await SekaiLive2DStage.supported();
    if (missing.length) {
      throw Object.assign(new Error(`this browser cannot show the stage: no ${missing.join(", ")}`), {
        kind: "unsupported",
        missing,
      });
    }
    o.signal?.throwIfAborted();
    const s = new SekaiLive2DStage();
    try {
      await s.#load(o);
    } catch (e) {
      s.destroy();
      if (e && typeof e === "object" && !e.kind && e.name !== "AbortError") e.kind = "internal";
      throw e;
    }
    return s;
  }

  #worker;
  #destroyed = false;
  #paused = false;
  #physics = true;
  #breath = true;
  #camera = { zoom: 1, x: 0, y: 0 };
  /** Requests waiting for their answer, by id: {resolve, reject, settle(m)}. */
  #pending = new Map();
  /** `addActor` progress callbacks by request id. */
  #progress = new Map();
  #nextId = 1;
  /** Each actor's `ActorInfo` once it is on stage. */
  #info = new Map();
  /** The actors on stage, in draw order (the first at the back). */
  #actors = [];
  /** Local removals not yet reflected in a worker `actors` message: id → remove tag. */
  #pendingRemovals = new Map();
  #removeTag = 0;

  /** The resolved published-version base URL, ending in `/`. */
  base = null;

  /** The actors on stage, in draw order (the first at the back). */
  get actors() { return [...this.#actors]; }

  async #load(o) {
    const js = withSlash(new URL(o.js ?? HERE, location.href).href);
    const base = await resolveBase(o.sources, { signal: o.signal });
    o.signal?.throwIfAborted();
    this.base = base;
    const options = {
      pkg: withSlash(new URL(o.pkg ?? "pkg/", js).href),
      core: new URL(o.core ?? CORE, location.href).href,
      base,
      width: Math.max(1, Math.round(o.width) || 1),
      height: Math.max(1, Math.round(o.height) || 1),
    };
    let worker;
    try {
      worker = this.#worker = new Worker(new URL("stage-worker.js", js));
    } catch (e) {
      throw Object.assign(new Error(String(e?.message ?? e)), { kind: "network", url: `${js}stage-worker.js` });
    }
    const offscreen = o.canvas.transferControlToOffscreen();
    await new Promise((resolve, reject) => {
      const abort = () => reject(o.signal.reason ?? new DOMException("aborted", "AbortError"));
      o.signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = (e) => {
        e.preventDefault?.();
        reject(Object.assign(new Error(e.message || "the stage's worker failed to start"), { kind: "network", url: `${js}stage-worker.js` }));
      };
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") {
          o.signal?.removeEventListener("abort", abort);
          worker.onmessage = (e) => this.#message(e.data);
          worker.onerror = (e) => this.#fail({ message: e.message || "the stage's worker failed", kind: "internal" });
          resolve();
        } else if (m.type === "error") {
          o.signal?.removeEventListener("abort", abort);
          reject(Object.assign(new Error(m.message), { kind: m.kind, url: m.url }));
        }
      };
      worker.postMessage({ type: "init", options, canvas: offscreen }, [offscreen]);
    });
  }

  #message(m) {
    switch (m.type) {
      case "settled": {
        const p = this.#pending.get(m.id);
        this.#pending.delete(m.id);
        this.#progress.delete(m.id);
        p?.settle(m);
        break;
      }
      case "progress":
        this.#progress.get(m.id)?.({ loaded: m.loaded, total: m.total });
        break;
      case "actors": {
        const tag = m.lastRemoveTag ?? 0;
        for (const [id, t] of this.#pendingRemovals) {
          if (t <= tag) this.#pendingRemovals.delete(id);
        }
        const next = m.ids.filter((id) => !this.#pendingRemovals.has(id));
        const changed = next.length !== this.#actors.length || next.some((id, i) => id !== this.#actors[i]);
        this.#actors = next;
        for (const id of this.#info.keys()) if (!next.includes(id)) this.#info.delete(id);
        if (changed) this.dispatchEvent(new CustomEvent("actors", { detail: { actors: [...next] } }));
        break;
      }
      case "motionstart":
        this.dispatchEvent(new CustomEvent("motionstart", { detail: { actor: m.actor, name: m.name, loop: m.loop } }));
        break;
      case "motionend":
        this.dispatchEvent(new CustomEvent("motionend", { detail: { actor: m.actor, name: m.name } }));
        break;
      case "error":
        this.#fail(m);
        break;
    }
  }

  #fail(m) {
    if (this.#destroyed) return;
    this.error = { message: m.message, kind: m.kind ?? "internal", url: m.url };
    this.#worker?.terminate();
    this.#destroyed = true;
    for (const p of this.#pending.values()) p.reject(Object.assign(new Error(this.error.message), this.error));
    this.#pending.clear();
    this.#progress.clear();
    this.#pendingRemovals.clear();
    this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
  }

  /** Sends request `m` with a fresh id; `settle(m, resolve, reject)` turns its answer into the
   * promise's outcome. After `destroy` it resolves to `gone`. */
  #request(m, settle, { gone = false, onProgress } = {}) {
    if (this.#destroyed) return Promise.resolve(gone);
    const id = this.#nextId++;
    if (onProgress) this.#progress.set(id, onProgress);
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, settle: (a) => settle(a, resolve, reject) });
      this.#worker.postMessage({ ...m, id });
    });
  }

  #post(m) {
    if (!this.#destroyed) this.#worker.postMessage(m);
  }

  /**
   * Loads a model (`{ asset, motion? }`, each an asset name or directory holding it; files fetched
   * and cached as the viewer does; an asset another actor uses is not fetched again) and puts it
   * on stage as actor `id`, placed by `p` (x 0, y 0, scale 1, alpha 1, not mirrored, in front of
   * the actors before it). A motion set the published version does not have leaves the actor
   * without motions (`motionSet: null`). It plays its default motion and facial unless `p.motion`
   * / `p.facial` name others. An actor of that id is replaced (in its place in the draw order)
   * once the new model is in. Commands for `id` made before this resolves wait for it.
   * @param {string} id
   * @param {{asset: string, motion?: string|null}} model
   * @param {object} [p]
   * @param {(progress: {loaded: number, total: number}) => void} [onProgress]
   * @returns {Promise<{model: string, motionSet: string|null, motions: string[], facials: string[],
   *   defaultMotion: string|null, defaultFacial: string|null, hasPhysics: boolean}>}
   */
  addActor(id, model, p, onProgress) {
    id = String(id);
    p = p ?? {};
    if (this.#destroyed) return Promise.reject(Object.assign(new Error("the stage is destroyed"), { kind: "internal" }));
    const m = {
      type: "add",
      actor: id,
      model: { asset: model.asset, motion: model.motion ?? null },
      placement: placement(p),
      motion: p.motion ?? null,
      facial: p.facial ?? null,
    };
    return this.#request(m, (a, resolve, reject) => {
      if (a.destroyed) reject(new DOMException("the stage was destroyed", "AbortError"));
      else if (a.error) {
        if (a.error.kind === "abort") reject(new DOMException(a.error.message, "AbortError"));
        else reject(failure(a.error));
      } else {
        this.#info.set(id, a.info);
        resolve(a.info);
      }
    }, { onProgress });
  }

  /** Takes actor `id` off the stage (or stops it being added). Its running tweens resolve
   * `false`. */
  removeActor(id) {
    if (this.#destroyed) return;
    id = String(id);
    this.#info.delete(id);
    const tag = ++this.#removeTag;
    this.#pendingRemovals.set(id, tag);
    const next = this.#actors.filter((a) => a !== id);
    if (next.length !== this.#actors.length) {
      this.#actors = next;
      this.dispatchEvent(new CustomEvent("actors", { detail: { actors: [...next] } }));
    }
    this.#post({ type: "remove", actor: id, tag });
  }

  /** The `ActorInfo` of actor `id` once it is on stage (what `addActor` resolved to). */
  actorInfo(id) {
    return this.#info.get(String(id)) ?? null;
  }

  /**
   * Moves, fades, scales, mirrors or reorders actor `id`: each of x, y, scale and alpha given
   * goes from where it is to the value given over `t.duration` seconds (default 0: at once)
   * with `t.easing` (`linear` (default), `in`, `out`, `in-out`); `mirror` and `order` change at
   * once. Resolves to `true` when the tween ends, or to `false` when a later `setActor` moves
   * one of the same values first, the actor is removed or replaced, or there is no such actor.
   */
  setActor(id, p, t) {
    return this.#request(
      { type: "set", actor: String(id), placement: placement(p), tween: tween(t) },
      (a, resolve) => resolve(!!a.value),
    );
  }

  /**
   * Starts actor `id`'s body motion `name` (one of its `motions`, else this throws at once):
   * as the viewer's `playMotion`, resolving to whether it started.
   */
  playMotion(id, name, { loop = false } = {}) {
    id = String(id);
    const info = this.#info.get(id);
    if (info && !info.motions.includes(name)) throw new Error(`no body motion ${name}`);
    return this.#request({ type: "motion", actor: id, name, loop: !!loop }, (a, resolve, reject) => {
      if (a.error) reject(failure(a.error));
      else resolve(!!a.value);
    });
  }

  /** Changes actor `id`'s facial to `name` (one of its `facials`): as the viewer's `setFacial`. */
  setFacial(id, name) {
    id = String(id);
    const info = this.#info.get(id);
    if (info && !info.facials.includes(name)) throw new Error(`no facial ${name}`);
    return this.#request({ type: "facial", actor: id, name }, (a, resolve, reject) => {
      if (a.error) reject(failure(a.error));
      else resolve(!!a.value);
    });
  }

  /** While `on`, actor `id`'s mouth flaps as the game's lip sync moves it for a line without
   * voice; off, it closes and the motion has it again. */
  setTalking(id, on) {
    this.#post({ type: "talking", actor: String(id), on: !!on });
  }

  /** Actor `id`'s mouth open by `value` (0..1), over talking and the motion; `null` gives it
   * back to them. For a page that drives the mouth from its own audio. */
  setMouth(id, value) {
    const v = finite(value);
    this.#post({ type: "mouth", actor: String(id), value: v === undefined ? null : Math.min(1, Math.max(0, v)) });
  }

  /** Physics on or off, for every actor. */
  setPhysics(on) {
    this.#physics = !!on;
    this.#post({ type: "physics", on: this.#physics });
  }

  /** Breathing on or off, for every actor. */
  setBreath(on) {
    this.#breath = !!on;
    this.#post({ type: "breath", on: this.#breath });
  }

  get physics() { return this.#physics; }
  get breath() { return this.#breath; }

  /**
   * The whole stage's camera: `zoom` (≥ 0.5; 1 is the game's) and where the world's centre
   * lands on the canvas (`x`, `y` in NDC: x right, y up, ±1 the edges), for shakes and close-ups;
   * a value not given stays. Tweened and resolved as `setActor`.
   */
  setCamera(c, t) {
    c = c ?? {};
    const to = {};
    for (const k of ["zoom", "x", "y"]) {
      const v = finite(c[k]);
      if (v !== undefined) to[k] = v;
    }
    if (to.zoom !== undefined) to.zoom = Math.max(0.5, to.zoom);
    Object.assign(this.#camera, to);
    return this.#request({ type: "camera", camera: to, tween: tween(t) }, (a, resolve) => resolve(!!a.value));
  }

  /** Where the camera is going (the targets of the last `setCamera` calls). */
  get camera() { return { ...this.#camera }; }

  /** Every running tween at its end, their promises resolving `true` (for a seek). */
  finishTweens() {
    this.#post({ type: "finish" });
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

  /** Draws at `width` × `height` pixels from now on (the CSS size × devicePixelRatio). */
  resize(width, height) {
    this.#post({ type: "resize", width: Math.max(1, Math.round(width) || 1), height: Math.max(1, Math.round(height) || 1) });
  }

  /** Stops the stage and frees what it holds. Requests still waiting resolve to `false`
   * (`addActor` rejects with an AbortError). */
  destroy() {
    this.#worker?.terminate();
    this.#destroyed = true;
    for (const p of this.#pending.values()) p.settle({ value: false, destroyed: true });
    this.#pending.clear();
    this.#progress.clear();
    this.#pendingRemovals.clear();
    this.#info.clear();
  }
}
