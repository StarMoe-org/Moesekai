// The UI kit worker (ADR-0017, ADR-0031): derives the UI kit from the client unpack, as the CLI
// does, hands its files to the page and is then terminated.
//
// It is a worker of its own because of what the derivation costs: it parses the unpack's object
// documents (tens of MB of JSON) and takes a couple of hundred MB while it runs. wasm memory
// never shrinks, so in the render worker that memory stayed for the whole of playback; here it
// goes with the worker. The derived kit (a few MB: sprites, fonts, the transition effect, the
// choice dialog's layout and sounds) is kept in the browser's Cache API, under the unpack's URL
// and the kit's version, and a later visit takes it from there without reading the unpack.
//
// From the page:
//   { type: "init", options }             see SsePlayer.create
// To the page:
//   { type: "progress", phase: "ui kit", done, total: 0, bytes }   files of the unpack read so far
//   { type: "kit", dir, files, cached }   the kit: `files` are [name, Uint8Array] to be put at
//                                         `<dir>/<name>` of a file table; `cached`: it was kept
//   { type: "error", message, kind, url } see sseErrorMessage (common.js)
"use strict";

const KIT_CACHE = "sse-ui-kit-v1";

/** Reports `e` to the page. */
function fatal(e) {
  // before common.js is in (a script of this worker failed to load) there is no helper yet
  postMessage(typeof sseErrorMessage === "function" ? sseErrorMessage(e)
    : { type: "error", message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url });
}

/** The kit kept for `base` (see `init`), or undefined. */
async function kept(base) {
  try {
    const cache = await caches.open(KIT_CACHE);
    const manifest = await cache.match(`${base}manifest.json`);
    if (!manifest) return undefined;
    const names = await manifest.json();
    const files = [];
    for (const name of names) {
      const hit = await cache.match(base + encodeURIComponent(name));
      if (!hit) return undefined;
      files.push([name, new Uint8Array(await hit.arrayBuffer())]);
    }
    return files;
  } catch {
    // no cache here (private browsing and the like): derive
    return undefined;
  }
}

/** Keeps the kit `files` for `base`; the manifest goes in last, so a kit cut short is not found. */
async function keep(base, files) {
  try {
    const cache = await caches.open(KIT_CACHE);
    for (const [name, bytes] of files) await cache.put(base + encodeURIComponent(name), new Response(bytes));
    await cache.put(`${base}manifest.json`, new Response(JSON.stringify(files.map(([name]) => name))));
  } catch {
    // not kept: the next visit derives it again
  }
}

async function init(o) {
  for (const url of [`${o.pkg}sse_web.js`, "common.js"]) {
    try {
      importScripts(url);
    } catch (e) {
      throw Object.assign(new Error(`${url}: ${e?.message ?? e}`), { kind: "network", url });
    }
  }
  await wasm_bindgen({ module_or_path: `${o.pkg}sse_web_bg.wasm` });
  const { putFile, deriveUiKit, uiKitDir, listFiles, readFile } = wasm_bindgen;
  // a page with fonts of its own gets a kit without the client's (kept apart: its directory
  // has another name), and the client's font files are not read
  const clientFonts = !sseOwnFonts(o.fonts);
  // the kit's directory ends in its version: a kit kept by a build that derived another is
  // not under this key
  const dir = uiKitDir("/inapp", "/cache", clientFonts);
  const base = new URL(`__sse-ui-kit/${dir.split("/").pop()}/`, new URL(o.sources.inapp, location.href)).href;
  let files = await kept(base);
  const cached = files !== undefined;
  if (!cached) {
    // the derivation finds the files it reads one by one: each call fails on the next one missing
    const loader = new SseLoader(putFile, o.sources);
    let calls = 0;
    await loader.retryMissing(() => {
      postMessage({ type: "progress", phase: "ui kit", done: calls++, total: 0, bytes: loader.bytes });
      return deriveUiKit("/inapp", "/cache", clientFonts);
    });
    files = listFiles(dir).map((name) => [name, readFile(`${dir}/${name}`)]);
    postMessage({ type: "progress", phase: "ui kit", done: calls, total: calls, bytes: loader.bytes });
    await keep(base, files);
    // the unpack's files were kept only so that a derivation cut short could go on
    caches.delete("sse-inapp-v1").catch(() => {});
  }
  postMessage({ type: "kit", dir, files, cached }, files.map(([, bytes]) => bytes.buffer));
}

onmessage = (e) => {
  if (e.data.type === "init") init(e.data.options).catch(fatal);
};
