// The web player (ADR-0030, ADR-0031): what a page embeds. Pass 1 and the mix run in one
// worker, Pass 2 on an OffscreenCanvas in another; the page keeps the clock (the audio worklet)
// and the input. A third worker derives the UI kit while the episode loads and is gone before
// playback (kit-worker.js).
//
//   const player = await SsePlayer.create({ canvas, ... });   see create()
//   player.play(); player.pause(); player.setAuto(false); player.click(x, y); player.setVolume(0.5);
//   player.nodes; player.position.node; player.seek(k); player.next(); player.previous();
//   player.destroy();
//
// Playback moves between nodes (ADR-0030): what a tap acts on, a talk, a telop, a full-screen
// text, choices. Node k starts when node k − 1 ends. A seek puts playback at the start of a node
// as AUTO from the first frame reaches it; the clock may go back then, so the reports from before
// it carry an older `gen` and are dropped.
//
// The clock is the audio: the worklet plays the mix sample by sample; the frame shown is the
// one the sample being heard belongs to (60 fps at 48 kHz: 800 samples a frame).

const RATE = 48000;
const PER_FRAME = RATE / 60;
// Cubism Core for Web where Live2D publishes it (ADR-0032): the address has no version in it
// and serves whichever Core Live2D last put there.
const CORE = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

/**
 * Events (`addEventListener`), each a `CustomEvent`:
 *   node    `detail.node`: playback moved into another node (playing on, or a seek)
 *   answer  a choice dialog waits for the player to pick an answer on the canvas
 *   stall   `detail.reason`: playback waits for a frame or a file; `resume` when it goes on
 *   ended   the last frame was shown
 *   error   `detail.message`, `detail.kind`, `detail.url`: playback stopped for good
 *
 * Errors, from `create` (an Error with these as properties) and in the `error` event, have a
 * `kind` a page can word its message by:
 *   unsupported  the browser lacks something (`missing`, see `supported`)
 *   not-found    the library has no such episode
 *   network      a file could not be fetched, after several tries (`url`)
 *   internal     anything else
 */
export class SsePlayer extends EventTarget {
  /**
   * What the browser lacks for playing, checked without loading anything: `{ok, missing}`,
   * `missing` naming each of `webgpu` (no `navigator.gpu`), `webgpu-adapter` (WebGPU is there
   * but gives no adapter: turned off, or the GPU is blocked), `offscreen-canvas`,
   * `audio-worklet` (also missing outside a secure context) and `worker`. `create` checks it
   * first and fails with an Error carrying `missing`; a site can ask before offering playback.
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
    if (typeof AudioWorkletNode === "undefined") missing.push("audio-worklet");
    if (typeof Worker === "undefined") missing.push("worker");
    return { ok: missing.length === 0, missing };
  }

  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas  sized to the render size (width × height)
   * @param {string} o.js       URL of this directory (workers, worklet)
   * @param {string} o.pkg      URL of the wasm-bindgen `no-modules` build of sse-web
   * @param {string} [o.core]   URL of live2dcubismcore.min.js (Cubism Core for Web), for a page
   *   that serves a copy of its own; left out, Core comes from Live2D's address (ADR-0032)
   * @param {{library: string, inapp: string, proxy?: string}} o.sources
   *   URLs of the Ripper library (holding `ripper.lock.json`) and of the client unpack; the
   *   asset source comes from the library's lock. `proxy`: see SseLoader (common.js)
   * @param {string} o.selector e.g. `event:101/8`
   * @param {number} o.width
   * @param {number} o.height
   * @param {{body?: {url: string, weight?: number}[], name?: {url: string, weight?: number}[]}} [o.fonts]
   *   fonts to draw the text with in place of the client's: `body` for the words, `name` for
   *   the names, each a font (TTF or OTF; `weight` sets a variable font's weight) followed by
   *   the fonts that fill in the characters it lacks. With both given, the client's own font
   *   files are not fetched at all. Text in other fonts is not what the game shows
   * @param {string} [o.playerName]
   * @param {boolean} [o.auto]
   * @param {(p: object) => void} [o.onProgress]  while loading: `{sim, render, kit}`, each that
   *   worker's last `{phase, done, total, bytes}` (`kit`: the UI kit being derived from the
   *   client unpack; absent when it was kept from an earlier visit). `create` resolves once
   *   everything is loaded.
   *
   * The canvas' drawing goes to a worker for good: a player made after this one failed or was
   * destroyed needs a canvas of its own.
   */
  static async create(o) {
    const { missing } = await SsePlayer.supported();
    if (missing.length) {
      const e = new Error(`this browser cannot play: no ${missing.join(", ")}`);
      e.kind = "unsupported";
      e.missing = missing;
      throw e;
    }
    const p = new SsePlayer();
    try {
      await p.load(o);
    } catch (e) {
      p.destroy();
      if (e && typeof e === "object" && !e.kind) e.kind = "internal";
      throw e;
    }
    return p;
  }

  /** The rest of `create`: the audio, the workers, and everything the episode needs. */
  async load(o) {
    const options = {
      js: o.js, pkg: o.pkg, core: o.core ?? CORE, sources: o.sources, selector: o.selector,
      width: o.width, height: o.height, playerName: o.playerName ?? "「世界」的居民", auto: o.auto ?? true,
      fonts: o.fonts,
    };
    const p = this;
    p.width = o.width;
    p.height = o.height;
    p.ctx = new AudioContext({ sampleRate: RATE });
    try {
      await p.ctx.audioWorklet.addModule(`${o.js}audio-worklet.js`);
    } catch (e) {
      throw Object.assign(new Error(String(e?.message ?? e)), { kind: "network", url: `${o.js}audio-worklet.js` });
    }
    p.stream = new AudioWorkletNode(p.ctx, "sse-stream", { outputChannelCount: [2] });
    p.gain = new GainNode(p.ctx, { gain: 0.8 });
    p.stream.connect(p.gain).connect(p.ctx.destination);
    p.stream.port.onmessage = (e) => {
      if (e.data.type !== "position" || e.data.gen !== p.gen) return;
      p.heard = e.data;
      if (e.data.starved && !p.state.ended) p.stats.starved++;
    };

    p.sim = new Worker(`${o.js}sim-worker.js`);
    p.render = new Worker(`${o.js}render-worker.js`);
    const frames = new MessageChannel();
    const audio = new MessageChannel();
    p.stream.port.postMessage({ type: "port", port: audio.port2 }, [audio.port2]);
    const offscreen = o.canvas.transferControlToOffscreen();
    const ready = (w, name) => new Promise((resolve, reject) => {
      w.addEventListener("message", function on(e) {
        if (e.data.type === "ready") { w.removeEventListener("message", on); resolve(e.data); }
        if (e.data.type === "error") {
          reject(Object.assign(new Error(`${name}: ${e.data.message}`), { kind: e.data.kind, url: e.data.url }));
        }
      });
      // the worker's own script did not load, or threw outside what it catches
      w.addEventListener("error", (e) => reject(Object.assign(new Error(`${name}: ${e.message ?? "the worker failed to start"}`),
        { kind: e.message ? "internal" : "network" })));
    });
    const progress = { sim: undefined, render: undefined, kit: undefined };
    for (const [w, key] of [[p.sim, "sim"], [p.render, "render"]]) {
      w.addEventListener("message", (e) => {
        if (e.data.type !== "progress") return;
        progress[key] = e.data;
        o.onProgress?.({ ...progress });
      });
    }
    const simReady = ready(p.sim, "simulation");
    const renderReady = ready(p.render, "render");
    // the UI kit: derived in a worker that is terminated with what the derivation took, then
    // handed to the two that use it (the simulation plays its sounds, the renderer draws the rest)
    p.kit = new Worker(`${o.js}kit-worker.js`);
    const kitReady = new Promise((resolve, reject) => {
      p.kit.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") {
          progress.kit = m;
          o.onProgress?.({ ...progress });
        } else if (m.type === "error") {
          reject(Object.assign(new Error(`UI kit: ${m.message}`), { kind: m.kind, url: m.url }));
        } else if (m.type === "kit") resolve(m);
      };
      p.kit.onerror = (e) => reject(Object.assign(new Error(`UI kit: ${e.message ?? "the worker failed to start"}`),
        { kind: e.message ? "internal" : "network" }));
    }).then((kit) => {
      p.kit.terminate();
      p.kit = undefined;
      p.sim.postMessage({ type: "kit", dir: kit.dir, files: kit.files.filter(([name]) => name.endsWith(".wav")) });
      p.render.postMessage({ type: "kit", dir: kit.dir, files: kit.files }, kit.files.map(([, bytes]) => bytes.buffer));
    });
    p.sim.onmessage = (e) => {
      if (e.data.type === "seeked") {
        const at = e.data.frame * PER_FRAME;
        p.gen = e.data.gen;
        p.lastHeard = at;
        p.heard = { position: at, time: p.ctx.currentTime, gen: p.gen };
        p.shown = e.data.frame - 1;
        p.state = { ...p.state, frame: e.data.frame, node: e.data.node, ended: false, waitsForClick: false, waitsForAnswer: false };
        p.seeking = false;
        p.endedSent = false;
        p.setStalled(undefined);
        p.emit("node", { node: p.node });
        return;
      }
      if (e.data.type === "state") {
        const was = p.state;
        p.state = e.data;
        p.stats.simBytes = e.data.loadedBytes;
        p.stats.simTable = e.data.tableBytes;
        p.stats.simWasm = e.data.wasmBytes;
        if (e.data.largest) p.stats.simLargest = e.data.largest;
        if (e.data.node !== was.node) p.emit("node", { node: p.node });
        if (e.data.waitsForAnswer && !was.waitsForAnswer) p.emit("answer");
      }
      else if (e.data.type === "error") p.fail(`simulation: ${e.data.message}`, e.data.kind, e.data.url);
    };
    p.render.onmessage = (e) => {
      const m = e.data;
      if ((m.type === "shown" || m.type === "stall") && m.gen !== p.gen) return;
      if (m.type === "shown") {
        p.stats.presented++;
        p.stats.skipped = m.skipped;
        p.stats.maxPresentMs = Math.max(p.stats.maxPresentMs, m.ms);
        p.stats.renderBytes = m.loadedBytes;
        p.stats.renderTable = m.tableBytes;
        p.stats.renderWasm = m.wasmBytes;
        p.shown = m.frame;
        if (!p.endedSent && p.position.ended) {
          p.endedSent = true;
          p.emit("ended");
        }
        p.setStalled(undefined);
      } else if (m.type === "stall") {
        p.setStalled(m.reason);
      } else if (m.type === "error") p.fail(`render: ${m.message}`, m.kind, m.url);
    };
    p.sim.postMessage({ type: "init", options, framesPort: frames.port1, audioPort: audio.port1 }, [frames.port1, audio.port1]);
    p.render.postMessage({ type: "init", options, canvas: offscreen, framesPort: frames.port2 }, [offscreen, frames.port2]);
    p.kit.postMessage({ type: "init", options });
    const [simInfo] = await Promise.all([simReady, renderReady, kitReady]);
    p.nodes = simInfo.nodes;
    p.unsupported = simInfo.unsupported;
    p.loaded = true;
    p.tick = p.tick.bind(p);
    p.frameRequest = requestAnimationFrame(p.tick);
  }

  constructor() {
    super();
    this.heard = { position: 0, time: 0 };
    /** Seeks taken; see the top. */
    this.gen = 0;
    /**
     * The nodes, in order: `{kind, snippet, …}` with `snippet` the position of its instruction in
     * the scenario's `Snippets`; `kind` is "talk" (`speaker`, `body`), "telop" or "text" (a
     * full-screen text; `body`), or "choices" (`options`).
     */
    this.nodes = [];
    /** What the episode has that a browser does not play: `{reason, name?}` (Session.unsupported). */
    this.unsupported = [];
    this.seeking = false;
    this.playing = false;
    this.shown = -1;
    this.state = { frame: 0, endFrame: undefined, waitsForClick: false, ended: false };
    this.stats = { presented: 0, skipped: 0, stalls: 0, stalledMs: 0, starved: 0, clicks: 0, maxPresentMs: 0, renderBytes: 0 };
    /** Why playback waits (a file or a frame not in yet), or undefined. */
    this.stalled = undefined;
    /** The message of the error playback stopped with (see the `error` event), or undefined. */
    this.error = undefined;
    this.destroyed = false;
  }

  /** Playback waits while the frame to show (or a file it shows) is not in: the audio clock
   * stops with it. */
  setStalled(reason) {
    if (reason === this.stalled || (reason && this.stalled)) {
      this.stalled = reason ?? this.stalled;
      return;
    }
    this.emit(reason ? "stall" : "resume", reason ? { reason } : undefined);
    if (reason) {
      this.stats.stalls++;
      this.stallStart = performance.now();
      this.stream.port.postMessage({ type: "pause" });
    } else {
      this.stats.stalledMs += performance.now() - this.stallStart;
      if (this.playing) this.stream.port.postMessage({ type: "play" });
    }
    this.stalled = reason;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Playback stops for good; told once, and only of a player `create` has returned. */
  fail(message, kind = "internal", url = undefined) {
    if (this.error !== undefined || this.destroyed) return;
    this.error = message;
    this.pause();
    if (this.loaded) this.emit("error", { message, kind, url });
  }

  /**
   * Ends the player and frees what it holds: both workers (with the files and the GPU resources
   * of the episode), the audio and the frame callback. Nothing is reported after it, and the
   * canvas is not usable for another player.
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    if (this.frameRequest !== undefined) cancelAnimationFrame(this.frameRequest);
    this.sim?.terminate();
    this.render?.terminate();
    this.kit?.terminate();
    this.stream?.port.close();
    this.stream?.disconnect();
    this.gain?.disconnect();
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }

  /** The sample being heard now: the last report moved on by the time since, less the output latency. */
  hearing() {
    let now = this.heard.position;
    if (this.playing && !this.stalled) {
      const since = Math.max(0, this.ctx.currentTime - this.heard.time);
      const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
      now = Math.max(0, now + Math.floor((since - latency) * RATE));
    }
    // never backwards: the estimate moves on from reports, a paused worklet reports where it
    // stopped, and the two need not agree to the frame
    this.lastHeard = Math.max(this.lastHeard ?? 0, now);
    return this.lastHeard;
  }

  tick() {
    if (this.destroyed) return;
    const now = this.hearing();
    this.render.postMessage({ type: "show", frame: Math.floor(now / PER_FRAME) });
    this.frameRequest = requestAnimationFrame(this.tick);
  }

  async play() {
    if (this.destroyed || this.error !== undefined) return;
    await this.ctx.resume();
    this.playing = true;
    if (!this.stalled) this.stream.port.postMessage({ type: "play" });
  }

  pause() {
    this.playing = false;
    if (!this.destroyed) this.stream?.port.postMessage({ type: "pause" });
  }

  setAuto(auto) {
    this.sim.postMessage({ type: "auto", auto });
  }

  /**
   * The player clicked at (x, y), canvas pixels (the render size): a choice dialog's button
   * answers it, anything else is a click (a talk's text, a telop, a wait). Without a position it
   * is a click.
   */
  click(x, y) {
    this.stats.clicks++;
    if (x === undefined) this.sim.postMessage({ type: "click" });
    else this.render.postMessage({ type: "tap", x, y });
  }

  /**
   * Renders at `width` × `height` from now on (`width` and `height` give the size): the canvas'
   * shown size times the device pixel ratio, say, or the screen's in full screen (ADR-0030).
   * Another aspect ratio lays the UI out anew, and playback goes on from the start of the node.
   */
  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.render.postMessage({ type: "resize", width, height });
    this.sim.postMessage({ type: "resize", width, height });
  }

  /** Goes on from the start of node `k` (0-based, clamped), in the current mode. */
  seek(k) {
    if (this.seeking) return;
    this.seeking = true;
    this.sim.postMessage({ type: "seek", node: Math.max(0, Math.min(k, this.nodes.length)) });
  }

  /** The node playback is in or before: the nodes ended so far (0-based; `nodes.length` after
   * the last). */
  get node() {
    return this.state.node ?? 0;
  }

  next() {
    this.seek(this.node + 1);
  }

  previous() {
    this.seek(this.node - 1);
  }

  setVolume(v) {
    this.gain.gain.value = v;
  }

  /** Where playback is: frame shown, frames baked, end (once known), waiting for a click. */
  get position() {
    return { shown: this.shown, node: this.node, nodes: this.nodes.length, seeking: this.seeking, baked: this.state.frame, endFrame: this.state.endFrame, waitsForClick: this.state.waitsForClick, waitsForAnswer: this.state.waitsForAnswer, stalled: this.stalled, waitingFor: this.state.waitingFor, ended: this.state.ended && this.shown >= (this.state.endFrame ?? Infinity) - 1 };
  }
}
