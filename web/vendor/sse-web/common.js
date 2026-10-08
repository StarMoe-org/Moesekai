// Shared by the player's workers (classic scripts, loaded with importScripts).

/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const SSE_FETCH_IDLE_MS = 30000;

/**
 * What a worker tells the page of an error: `kind` is `not-found` (the library has no such
 * episode), `network` (a file could not be fetched; `url` names it) or `internal`.
 */
function sseErrorMessage(e) {
  return { type: "error", message: String(e?.message ?? e), kind: e?.kind ?? "internal", url: e?.url };
}

/**
 * The file at `url`, tried a few times; a response that stops arriving counts as failed. Fails
 * with an Error carrying `kind: "network"`, `url` and the HTTP `status` if there was one. A file
 * the server does not have (404) is not asked for again.
 */
async function sseFetchBytes(url) {
  for (let attempt = 1; ; attempt++) {
    const abort = new AbortController();
    let idle;
    const watch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => abort.abort(), SSE_FETCH_IDLE_MS);
    };
    let status;
    try {
      watch();
      const r = await fetch(url, { signal: abort.signal });
      status = r.status;
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      // piece by piece, so that a body that stalls is noticed
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
      if (pieces.length === 1) return pieces[0];
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const piece of pieces) {
        bytes.set(piece, at);
        at += piece.length;
      }
      return bytes;
    } catch (e) {
      if (attempt >= 4 || status === 404) {
        const failed = new Error(abort.signal.aborted ? `${url}: nothing arrived for ${SSE_FETCH_IDLE_MS / 1000} s` : String(e?.message ?? e));
        failed.kind = "network";
        failed.url = url;
        failed.status = status;
        throw failed;
      }
      await new Promise((done) => setTimeout(done, 200 * attempt));
    } finally {
      clearTimeout(idle);
    }
  }
}

/**
 * Whether a page's `fonts` (see SsePlayer.create) replace both of the client's fonts: the UI
 * kit is then derived without them, and the client's font files are never fetched.
 */
function sseOwnFonts(fonts) {
  return !!(fonts?.body?.length && fonts?.name?.length);
}

/**
 * Where the index of the episode `selector` is in the library: `episodes/<kind>/<key>/<number>.json`.
 * A selector ends in the episode number, except a card's, which names its part: `first` is
 * episode 1 and `second` episode 2 (as `sse_assets` reads them).
 */
function sseEpisodeIndexPath(selector) {
  const [kind, rest = ""] = selector.split(":");
  const cut = rest.lastIndexOf("/");
  let number = rest.slice(cut + 1);
  if (kind === "card") number = { first: "1", second: "2" }[number] ?? number;
  return `episodes/${kind}/${rest.slice(0, cut + 1)}${number}.json`;
}

/**
 * The index of the episode `selector` (`<kind>:<key>/<number>`), through `loader`. An episode
 * the library does not have fails with `kind: "not-found"`.
 */
async function sseEpisodeIndex(loader, selector) {
  try {
    return await loader.json(`/lib/${sseEpisodeIndexPath(selector)}`);
  } catch (e) {
    if (e?.status !== 404) throw e;
    const missing = new Error(`${selector}: the library has no such episode`);
    missing.kind = "not-found";
    missing.url = e.url;
    throw missing;
  }
}

/** Fetches `files` (paths relative to `base`) into the file table at `/<path>`. */
async function sseLoadFiles(putFile, base, files, parallel = 12) {
  const queue = [...files];
  await Promise.all(Array.from({ length: parallel }, async () => {
    for (let f; (f = queue.shift()) !== undefined;) putFile(`/${f}`, await sseFetchBytes(base + f));
  }));
}

/**
 * Cubism Core for Web finishes initialising a moment after its script ran (ADR-0032): retries
 * `make` while Core reports that it is not ready yet.
 */
async function sseWhenCoreReady(make) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await make();
    } catch (e) {
      if (!String(e?.message ?? e).includes("not ready yet") || attempt > 100) throw e;
      await new Promise((done) => setTimeout(done, 20));
    }
  }
}

/** The file-table path a wasm call failed to find, if that is why it failed. */
function sseMissingPath(e) {
  // the message ends "…: <path>: not in the file table"; paths may hold spaces
  const msg = String(e?.message ?? e);
  const end = msg.indexOf(": not in the file table");
  if (end < 0) return undefined;
  const start = msg.lastIndexOf(": ", end - 1);
  const path = msg.slice(start < 0 ? 0 : start + 2, end);
  return path.startsWith("/") ? path : undefined;
}

/** Every file-table path a wasm call failed to find (Pass 1 reports several at once). */
function sseMissingPaths(e) {
  return String(e?.message ?? e).split("; ").map(sseMissingPath).filter(Boolean);
}

/** `path` with each segment URL-encoded. */
function sseEncodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Fetches files into the file table on demand. File-table roots map to URLs:
 *   /lib/<path>    → the library (`ripper.lock.json`, `episodes/…`, `library/…`)
 *   /assets/<path> → the asset source (the library lock's `assets.base`)
 *   /inapp/<path>  → the client unpack
 * Each file is fetched once; requests for one in flight share it.
 */
class SseLoader {
  /**
   * @param {(path: string, bytes: Uint8Array) => void} putFile
   * @param {{library: string, assets?: string, inapp?: string, proxy?: string}} sources
   *   URLs ending in `/`; `proxy`, when set, is put in front of `https://host/…` URLs
   *   (`<proxy><host>/…`), for a development server that relays them.
   */
  constructor(putFile, sources) {
    this.putFile = putFile;
    this.proxy = sources.proxy ?? "";
    this.roots = [];
    this.loaded = new Set();
    this.inflight = new Map();
    /** Paths whose last fetch failed (each fetch tries a few times): `{times, error}`. */
    this.failed = new Map();
    this.bytes = 0;
    this.queue = [];
    this.running = 0;
    /** Fetches at a time for the background queue, and for a batch (getAll). */
    this.parallel = 8;
    this.background = 3;
    /** Requests something waits for (not prefetches) in flight: the background queue holds
     * back while there are any, so they get the bandwidth. */
    this.urgent = 0;
    this.setRoot("/lib/", sources.library);
    if (sources.assets) this.setRoot("/assets/", sources.assets);
    if (sources.inapp) this.setRoot("/inapp/", sources.inapp);
  }

  url(u) {
    return this.proxy ? u.replace(/^https:\/\//, this.proxy) : u;
  }

  setRoot(prefix, url) {
    this.roots = this.roots.filter((r) => r.prefix !== prefix);
    this.roots.push({ prefix, url: this.url(url.endsWith("/") ? url : `${url}/`) });
  }

  has(path) {
    return this.loaded.has(path);
  }

  /**
   * The error of `path` once fetching it has failed twice over (playback waiting for it is not
   * going to go on), else undefined.
   */
  gaveUp(path) {
    const f = this.failed.get(path);
    return f && f.times >= 2 ? f.error : undefined;
  }

  /** Puts the file at `path` in the table, fetching it if needed; the background queue waits
   * for it. */
  get(path) {
    if (this.loaded.has(path)) return Promise.resolve();
    this.urgent++;
    return this.fetchInto(path).finally(() => { this.urgent--; this.pump(); });
  }

  fetchInto(path) {
    if (this.loaded.has(path)) return Promise.resolve();
    let p = this.inflight.get(path);
    if (!p) {
      const root = this.roots.find((r) => path.startsWith(r.prefix));
      if (!root) return Promise.reject(new Error(`${path}: no source for this path`));
      p = this.fetchRooted(root, path).then((bytes) => {
        this.putFile(path, bytes);
        this.loaded.add(path);
        this.bytes += bytes.length;
        (this.sizes ??= new Map()).set(path, bytes.length);
        this.inflight.delete(path);
        this.failed.delete(path);
      }, (e) => {
        this.inflight.delete(path);
        this.failed.set(path, { times: (this.failed.get(path)?.times ?? 0) + 1, error: e });
        throw e;
      });
      this.inflight.set(path, p);
    }
    return p;
  }

  /**
   * The bytes of `path` under `root`. A client unpack is an immutable snapshot (its version is in
   * its URL), so its files are kept in the browser's Cache API and fetched only once.
   */
  async fetchRooted(root, path) {
    const url = root.url + sseEncodePath(path.slice(root.prefix.length));
    const keep = root.prefix === "/inapp/" && typeof caches !== "undefined";
    if (keep) {
      try {
        const hit = await (await caches.open("sse-inapp-v1")).match(url);
        if (hit) { this.cached = (this.cached ?? 0) + 1; return new Uint8Array(await hit.arrayBuffer()); }
      } catch { /* no cache (private mode and the like): fetch */ }
    }
    const bytes = await sseFetchBytes(url);
    if (keep) {
      caches.open("sse-inapp-v1").then((c) => c.put(url, new Response(bytes))).catch(() => {});
    }
    return bytes;
  }

  /** Drops `path` from the table (fetched again if asked for again). */
  drop(path) {
    if (!this.loaded.delete(path)) return;
    this.sizes?.delete(path);
    this.jsonCache?.delete(path);
    this.removeFile?.(path);
  }

  /** The `n` largest files in the table, for diagnosing what it holds. */
  largest(n = 5) {
    return [...(this.sizes ?? new Map())].sort((a, b) => b[1] - a[1]).slice(0, n).map(([p, b]) => `${(b / 1e6).toFixed(1)} MB ${p}`);
  }

  /** Drops every file under the directory `dir` from the table. */
  dropUnder(dir) {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    for (const p of [...this.loaded]) if (p.startsWith(prefix)) this.drop(p);
  }

  /** Fetches all of `paths`, a few at a time; `progress(done, total)` after each one. */
  async getAll(paths, progress) {
    const queue = [...new Set(paths)].filter((p) => !this.loaded.has(p));
    const total = queue.length;
    let done = 0;
    await Promise.all(Array.from({ length: this.parallel }, async () => {
      for (let p; (p = queue.shift()) !== undefined;) {
        await this.get(p);
        progress?.(++done, total);
      }
    }));
  }

  /** Queues `paths` to be fetched in the background, in order, a few at a time. */
  prefetch(paths) {
    for (const p of paths) if (!this.loaded.has(p) && !this.inflight.has(p) && !this.queue.includes(p)) this.queue.push(p);
    this.pump();
  }

  pump() {
    while (this.running < this.background && this.urgent === 0 && this.queue.length) {
      const p = this.queue.shift();
      if (this.loaded.has(p)) continue;
      this.running++;
      this.fetchInto(p).catch((e) => console.warn(`prefetch ${p}: ${e?.message ?? e}`)).finally(() => { this.running--; this.pump(); });
    }
  }

  /** The JSON file at `path`, parsed (and put in the table like any other). */
  async json(path) {
    this.jsonCache ??= new Map();
    let v = this.jsonCache.get(path);
    if (v === undefined) {
      const root = this.roots.find((r) => path.startsWith(r.prefix));
      if (!root) throw new Error(`${path}: no source for this path`);
      const bytes = await this.fetchRooted(root, path);
      if (!this.loaded.has(path)) {
        this.putFile(path, bytes);
        this.loaded.add(path);
        this.bytes += bytes.length;
      }
      v = JSON.parse(new TextDecoder().decode(bytes));
      this.jsonCache.set(path, v);
    }
    return v;
  }

  /** Calls `f` until it stops failing for files the table lacks, fetching them. */
  async retryMissing(f, limit = 2000) {
    for (let n = 0; ; n++) {
      try {
        return await f();
      } catch (e) {
        const paths = sseMissingPaths(e);
        if (!paths.length || n >= limit) throw e;
        await Promise.all(paths.map((p) => this.fetchMissing(p)));
      }
    }
  }

  /**
   * Fetches a file a wasm call reported missing. A model bundle's directory (reported when its
   * `buildmodeldata.json` is not there yet) brings the bundle's files other than textures.
   */
  fetchMissing(path) {
    const m = /^\/lib\/library\/(live2d\/model\/[^/]+)\/?$/.exec(path);
    if (m) return this.bundleFiles(m[1], (f) => f.kind !== "png").then((files) => this.getAll(files));
    return this.get(path);
  }

  /** The files of a library bundle (from its `_ripper.json`), as file-table paths. */
  async bundleFiles(bundle, filter = () => true) {
    const r = await this.json(`/lib/library/${bundle}/_ripper.json`);
    return r.files.filter(filter).map((f) => `/lib/library/${bundle}/${f.path}`);
  }

  /** Where `path` of the episode index `index` is in the table: the asset source or the library. */
  static resolve(index, path) {
    return index.assets && index.assets[path] ? `/assets/${path}` : `/lib/library/${path}`;
  }
}
