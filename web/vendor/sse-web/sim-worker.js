// The simulation worker (ADR-0031): Pass 1 and the mix, ahead of what is heard. Frames go to the
// render worker and samples to the audio worklet, each over a port of its own.
//
// Before playback it fetches every file the episode index lists that Pass 1 and the mix read: the
// scenario, the motions, the models' files other than textures, the voices, BGM (with an
// interactive BGM's ACB), sound effects, movie sound and the sounds of effect prefabs; playback then reads nothing more. (Should
// a file still be missing, the worker fetches it and waits: it does not step into an instruction
// whose audio has not arrived, and Session.step holds a frame whose models are not in.)
//
// From the page:
//   { type: "init", options, framesPort, audioPort }   see SsePlayer.create
//   { type: "kit", dir, files }                         the UI kit's sound effects (the choice
//                                                       dialog's), derived by the kit worker:
//                                                       [name, bytes] for `<dir>/<name>`
// From the audio worklet (on the audio port):
//   { type: "position", position, gen }                 the next sample it plays (after `gen` seeks):
//                                                       what the simulation keeps ahead of, also
//                                                       while the page is hidden
//   { type: "seek", node }                              continue from the start of a node
//   { type: "resize", width, height }                   the render size changed
//   { type: "auto", auto } / { type: "click" }
// From the render worker (on the frames port), for taps on the canvas:
//   { type: "click" } / { type: "answer", index }    see render-worker.js
// To the page:
//   { type: "ready", loadedBytes, nodes, unsupported }
//   { type: "error", message, kind, url }               see sseErrorMessage (common.js); the worker
//                                                       does nothing more after it
//   { type: "seeked", frame, node, gen }                playback goes on from `frame`
//   { type: "state", frame, endFrame, waitsForClick, ended, waitingFor, loadedBytes, tableBytes,
//     wasmBytes }                                       the last two: the file table, the wasm memory
"use strict";

const RATE = 48000;
const PER_FRAME = RATE / 60;
/**
 * Frames are baked this far ahead of what is heard: enough for the render worker to have the
 * next frame when it is due, and no more, because a click applies to the next frame baked (the
 * game handles a tap in the frame after the one on screen).
 */
const FRAME_LEAD = 3 * PER_FRAME;
/**
 * Samples are mixed this far ahead, with the cues known so far. A frame that changes the audio
 * (a cue starts, a click cuts a voice) is baked before its samples are played, and the samples
 * from it on are mixed again (the mix is a function of the cues alone).
 */
const MIX_LEAD = 0.5 * RATE;
/** Decoded audio is kept for cues this far ahead. */
const KEEP = 5 * RATE;
/** The audio of this many instructions past the next one must be in before stepping (a frame can
 * start several), and this many are fetched in the background. */
const AUDIO_NEEDED = 24;
const AUDIO_PREFETCH = 80;
/** Time (ms) spent decoding the coming instructions' audio after each step, in slices of
 * DECODE_PACKETS MP3 packets (about 0.4 ms each): a BGM decoded at once when its cue starts
 * holds the worker for tens of milliseconds, and the frames and the mix with it. */
const DECODE_BUDGET = 3;
const DECODE_PACKETS = 16;

let loader;
let session;
let plan = [];
let modelPlan = [];
const modelsDropped = new Set();
const modelsAsked = new Set();
let framesPort;
let audioPort;
let mixedUntil = 0;
let ended = false;
let modelCount = 0;
let waitingFor;
/**
 * Clicks not applied yet. The scheduler takes one a frame, so each goes to a frame of its own:
 * clicks that come together (the worker was busy, or the player clicked twice in a row) do not
 * merge into one. A few at most are kept, so that clicks made during a stall do not skip ahead.
 */
let clicks = 0;
const MAX_CLICKS = 3;
/** A click is given to the scheduler and the frame it applies to is not stepped yet. */
let clickGiven = false;
/** Seeks taken: what is heard is reported against it, and older reports are dropped. */
let gen = 0;
let seeking = false;
/** An error was reported to the page: nothing more is stepped. */
let dead = false;
/** The UI kit's sounds, once the page hands them over (see the top). */
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

/** The audio of the instructions before position `upto`; prefetches further. */
function audioMissing(next) {
  const needed = [];
  const ahead = [];
  for (const [pos, files] of plan) {
    if (pos >= next + AUDIO_PREFETCH) break;
    for (const f of files) {
      if (loader.has(f)) continue;
      if (pos < next + AUDIO_NEEDED) needed.push(f); else ahead.push(f);
    }
  }
  loader.prefetch([...needed, ...ahead]);
  return needed;
}

/** Fetches the models of the instructions before `next + AUDIO_PREFETCH` ahead of time. */
function prefetchModels(next) {
  const bundles = [];
  for (const [pos, list] of modelPlan) {
    if (pos >= next + AUDIO_PREFETCH) break;
    for (const b of list) if (!modelsAsked.has(b)) { modelsAsked.add(b); bundles.push(b); }
  }
  if (!bundles.length) return;
  framesPort?.postMessage({ type: "prefetch", bundles });
  for (const b of bundles) {
    loader.bundleFiles(b, (f) => f.kind !== "png").then((files) => loader.prefetch(files), (e) => console.warn(`${b}: ${e?.message ?? e}`));
  }
}

/** Fetches what a step reported missing; true when the error was that. */
function fetchReported(e) {
  const paths = sseMissingPaths(e);
  if (!paths.length) return false;
  waitingFor = paths[0];
  for (const p of paths) loader.fetchMissing(p).catch(fatal);
  return true;
}

/**
 * Drops the files of models Pass 1 has loaded (it keeps what it read). Audio stays: the mix may
 * decode a waveform again after dropping its samples, and playback is not to fetch.
 */
function dropUsed(next) {
  for (const b of session.models) {
    if (!modelsDropped.has(b)) { modelsDropped.add(b); loader.dropUnder(`/lib/library/${b}`); }
  }
  // models fetched ahead for a costume the episode did not put on after all
  for (const [pos, list] of modelPlan) {
    if (pos >= next - 32) break;
    for (const b of list) {
      if (!modelsDropped.has(b) && !session.models.includes(b)) { modelsDropped.add(b); loader.dropUnder(`/lib/library/${b}`); }
    }
  }
}

function stepAhead(now) {
  waitingFor = undefined;
  prefetchModels(session.nextInstruction);
  const frames = [];
  while (!ended) {
    if (session.frame * PER_FRAME >= now + FRAME_LEAD) break;
    const missing = audioMissing(session.nextInstruction);
    if (missing.length) {
      // fetched in the background, where a failure is only tried again: say so once it is clear
      // that the file is not coming
      const lost = missing.map((f) => loader.gaveUp(f)).find(Boolean);
      if (lost) throw lost;
      waitingFor = missing[0];
      break;
    }
    const n = session.frame;
    if (clicks && !clickGiven) {
      session.click();
      clicks--;
      clickGiven = true;
    }
    let f;
    try {
      f = session.step();
      clickGiven = false;
    } catch (e) {
      // audio the scheduler reads when an instruction starts, or models a frame puts on: the
      // same frame carries on once they are in
      if (!fetchReported(e)) throw e;
      break;
    }
    if (f === undefined) { ended = true; break; }
    frames.push([n, f]);
  }
  const changed = session.takeAudioChange();
  if (changed !== undefined && changed * PER_FRAME < mixedUntil) {
    // the samples mixed for that frame and after are stale: mix them again (the worklet
    // replaces what it has queued from there when they come)
    mixedUntil = changed * PER_FRAME;
  }
  const models = session.models;
  if (frames.length) {
    framesPort.postMessage({ type: "frames", frames, models: models.length !== modelCount ? models : undefined });
    modelCount = models.length;
  }
  const endFrame = session.endFrame;
  const until = Math.min(now + MIX_LEAD, endFrame === undefined ? Infinity : endFrame * PER_FRAME);
  while (mixedUntil < until) {
    const end = Math.min(until, mixedUntil + 4800);
    let samples;
    try {
      samples = session.mix(mixedUntil, end);
    } catch (e) {
      // a waveform no plan listed (an interactive BGM's blocks, a movie's sound): fetch and retry
      if (!fetchReported(e)) throw e;
      break;
    }
    audioPort.postMessage({ type: "chunk", start: mixedUntil, samples }, [samples.buffer]);
    mixedUntil = end;
  }
  session.retain(now, now + KEEP);
  const t = performance.now();
  while (performance.now() - t < DECODE_BUDGET && session.decodeAhead(DECODE_PACKETS)) {}
  dropUsed(session.nextInstruction);
  postMessage({ type: "state", frame: session.frame, node: session.node, endFrame: session.endFrame, waitsForClick: session.waitsForClick, waitsForAnswer: session.waitsForAnswer, ended, waitingFor, loadedBytes: loader.bytes, tableBytes: fileTableSize(), wasmBytes: wasmBytes(), largest: session.frame % 600 < 3 ? loader.largest() : undefined });
}

/**
 * Continues from the start of node `node` (ADR-0030): the simulation is put there as AUTO from the
 * first frame reaches it, and the render worker, the worklet and the page start over from its
 * frame. Steps nothing while it runs.
 */
async function seek(node) {
  seeking = true;
  try {
    const frame = await loader.retryMissing(() => session.seek(node));
    gen++;
    clicks = 0;
    clickGiven = false;
    ended = false;
    waitingFor = undefined;
    session.takeAudioChange();
    mixedUntil = frame * PER_FRAME;
    // let go of the audio decoded for where playback was before decoding what plays here: a
    // BGM is tens of MB, and memory taken while both are held is not given back
    session.decodeAhead(0);
    session.retain(mixedUntil, mixedUntil + KEEP);
    framesPort.postMessage({ type: "reset", frame, gen });
    audioPort.postMessage({ type: "seek", position: frame * PER_FRAME, gen });
    postMessage({ type: "seeked", frame, node: session.node, gen });
    stepAhead(frame * PER_FRAME);
  } finally {
    seeking = false;
  }
}

/**
 * The render size changed: when its aspect ratio lays the UI out anew, the simulation starts
 * over at that size and playback goes on from the start of the node it was in.
 */
async function resize(width, height) {
  const node = session.node;
  seeking = true;
  let again;
  try {
    again = await loader.retryMissing(() => session.resize(width, height));
  } finally {
    seeking = false;
  }
  if (again) await seek(node);
}

async function init(o, frames, audio) {
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
  const { Session, putFile, removeFile, setCoreHeapSize } = wasm_bindgen;
  // Pass 1 holds no Core model: the smallest Core heap instead of the renderer's 64 MiB, which
  // took about 130 MB here
  setCoreHeapSize(16 * 1024 * 1024);
  self.fileTableSize = wasm_bindgen.fileTableSize;
  loader = new SseLoader(putFile, o.sources);
  loader.removeFile = removeFile;
  const lock = await loader.json("/lib/ripper.lock.json");
  if (lock.assets) loader.setRoot("/assets/", lock.assets.base);
  const index = await sseEpisodeIndex(loader, o.selector);
  // everything Pass 1 and the mix read, as the episode index lists it
  const files = [SseLoader.resolve(index, index.scenario.path)];
  const models = new Set();
  for (const c of Object.values(index.characters)) {
    for (const costume of c.costumes) {
      // a costume whose model the library does not have (the index warns of it) is not drawn
      if (costume.modelBundle) models.add(costume.modelBundle);
      for (const m of Object.values(costume.motions)) files.push(SseLoader.resolve(index, m.path));
    }
  }
  for (const group of [index.voices, index.bgm, index.se]) {
    for (const cue of Object.values(group ?? {})) for (const f of cue.files) files.push(SseLoader.resolve(index, f));
  }
  // Pass 1 reads a BGM's ACB (an interactive BGM's block structure); sound effects play without it
  for (const cue of Object.values(index.bgm ?? {})) if (cue.acb) files.push(SseLoader.resolve(index, cue.acb));
  for (const movie of Object.values(index.movies ?? {})) {
    for (const f of movie.files) if (f.endsWith(".wav")) files.push(SseLoader.resolve(index, f));
  }
  const report = (phase) => (done, total) => postMessage({ type: "progress", phase, done, total, bytes: loader.bytes });
  let listed = 0;
  report("listing")(0, models.size);
  const modelFiles = await Promise.all([...models].map((b) => loader.bundleFiles(b, (f) => f.kind !== "png")
    .then((list) => { report("listing")(++listed, models.size); return list; })));
  // effect prefabs' sounds: Pass 1 reads their animator and cue sheets, and the mix their
  // waveforms (the raw ACB is not read)
  const effects = new Set(Object.values(index.effects ?? {}));
  const effectFiles = await Promise.all([...effects].map((b) => loader.bundleFiles(b, (f) => f.kind !== "png" && !f.path.endsWith(".acb"))));
  await loader.getAll([...files, ...modelFiles.flat(), ...effectFiles.flat()], report("files"));
  // the UI's sound effects (the choice dialog's): the kit has them when the client unpack does
  const ui = await kit;
  for (const [name, bytes] of ui.files) putFile(`${ui.dir}/${name}`, bytes);
  session = await sseWhenCoreReady(() => loader.retryMissing(() =>
    Session.create("/lib", "/assets", o.selector, o.width, o.height, o.playerName, ui.dir)));
  session.setAuto(o.auto);
  // choice dialogs wait for the player, in AUTO too, as in the game
  session.setInteractive(true);
  plan = JSON.parse(session.audioPlan());
  modelPlan = JSON.parse(session.modelPlan());
  framesPort = frames;
  framesPort.onmessage = (e) => {
    if (e.data.type === "click") clicks = Math.min(clicks + 1, MAX_CLICKS);
    else if (e.data.type === "answer") session.answer(e.data.index);
  };
  prefetchModels(0);
  await loader.getAll(audioMissing(0));
  audioPort = audio;
  audioPort.onmessage = (e) => {
    // reports from before the last seek are stale
    if (e.data.type === "position" && !seeking && !dead && e.data.gen === gen) {
      try {
        stepAhead(e.data.position);
      } catch (err) {
        fatal(err);
      }
    }
  };
  stepAhead(0);
  postMessage({ type: "ready", loadedBytes: loader.bytes, nodes: JSON.parse(session.nodes()), unsupported: JSON.parse(session.unsupported()) });
}

onmessage = (e) => {
  const m = e.data;
  if (dead) return;
  try {
    switch (m.type) {
      case "init":
        init(m.options, m.framesPort, m.audioPort).catch(fatal);
        break;
      case "seek":
        if (session && framesPort && !seeking) seek(m.node).catch(fatal);
        break;
      case "resize":
        if (session && framesPort && !seeking) resize(m.width, m.height).catch(fatal);
        break;
      case "kit":
        kitArrived(m);
        break;
      case "auto":
        session?.setAuto(m.auto);
        break;
      case "click":
        clicks = Math.min(clicks + 1, MAX_CLICKS);
        break;
    }
  } catch (err) {
    fatal(err);
  }
};
