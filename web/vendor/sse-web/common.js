// Shared by the player's workers (classic scripts, loaded with importScripts).

/** A fetch is given up once nothing has arrived for this long (ms), and tried again. */
const SSE_FETCH_IDLE_MS = 30000;
/** Where the canonical view and the client view of the published version are in the file table. */
const SSE_PUB = "/pub/";
const SSE_CLIENT = "/client/";
/** The browser cache every fetched file is kept in, by URL: a file of a published version never changes. */
const SSE_FILE_CACHE = "sse-files-v1";
/** How many times a call that finds files missing is made again, after fetching what it named. */
const SSE_RETRY_LIMIT = 2000;

/**
 * What a worker tells the page of an error: `kind` is `not-found` (the publication has no such
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
 * A callback that tells the page how far `phase` has got: `(done, total)` as `SseLoader.getAll`
 * calls it, or `(done)` as `SseLoader.retryMissing` does, when the total is not known (0).
 */
function sseReporter(loader, phase) {
  return (done, total = 0) => postMessage({ type: "progress", phase, done, total, bytes: loader.bytes });
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
 *   /pub/<path>    → the canonical view of the published version
 *   /client/<path> → its client view
 * Each file is fetched once; requests for one in flight share it. Fetched files are kept in the
 * browser's Cache API, so that a later visit does not fetch them again.
 */
class SseLoader {
  /**
   * @param {{putFile: Function, removeFile: Function, markAbsent: Function, assetFiles: Function}} wasm
   *   the wasm module's file-table functions
   * @param {{canonical: string, client: string}} views  the base URLs of the two views, each
   *   ending in `/` (with the proxy, if the page uses one, already in front)
   */
  constructor(wasm, views) {
    this.wasm = wasm;
    this.roots = [{ prefix: SSE_PUB, url: views.canonical }, { prefix: SSE_CLIENT, url: views.client }];
    /** The file cache, once opened (undefined where the browser has none). */
    this.cache = typeof caches === "undefined" ? undefined : caches.open(SSE_FILE_CACHE).catch(() => undefined);
    this.loaded = new Set();
    this.inflight = new Map();
    /** Paths whose last fetch failed (each fetch tries a few times): `{times, error}`. */
    this.failed = new Map();
    /** The size of each file in the table, by path. */
    this.sizes = new Map();
    this.bytes = 0;
    this.queue = [];
    this.running = 0;
    /** Fetches at a time for the background queue, and for a batch (getAll). */
    this.parallel = 8;
    this.background = 3;
    /** Requests something waits for (not prefetches) in flight: the background queue holds
     * back while there are any, so they get the bandwidth. */
    this.urgent = 0;
  }

  /**
   * Where the file at table path `path` is served. A directory's listing, `<dir>/.listing.json`
   * in the table, is served at the directory's own address (ending in `/`).
   */
  url(path) {
    const root = this.roots.find((r) => path.startsWith(r.prefix));
    if (!root) throw new Error(`${path}: no source for this path`);
    const served = path.slice(root.prefix.length).replace(/(^|\/)\.listing\.json$/, "$1");
    return root.url + sseEncodePath(served);
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
      p = this.download(path).then((bytes) => {
        this.wasm.putFile(path, bytes);
        this.loaded.add(path);
        this.bytes += bytes.length;
        this.sizes.set(path, bytes.length);
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

  /** The bytes of the file at table path `path`: from the cache when it is there, else fetched. */
  async download(path) {
    const url = this.url(path);
    const cache = await this.cache;
    const hit = await cache?.match(url).catch(() => undefined);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
    const bytes = await sseFetchBytes(url);
    // a file that cannot be kept is fetched again next time
    cache?.put(url, new Response(bytes)).catch(() => {});
    return bytes;
  }

  /** Drops `path` from the table (fetched again if asked for again). */
  drop(path) {
    if (!this.loaded.delete(path)) return;
    this.sizes.delete(path);
    this.wasm.removeFile(path);
  }

  /** The `n` largest files in the table, for diagnosing what it holds. */
  largest(n = 5) {
    return [...this.sizes].sort((a, b) => b[1] - a[1]).slice(0, n).map(([p, b]) => `${(b / 1e6).toFixed(1)} MB ${p}`);
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

  /**
   * Calls `f` until it stops failing for files the table lacks, fetching the ones it names;
   * `progress(round)` after each round of fetching. A file the site does not have (404) is told
   * to the table as absent (`markAbsent`), and `f` goes on without it where it can, as an export
   * does; when `f` then fails over it, the failure is the fetch's (`kind: "network"`, `status`
   * 404, `url`).
   */
  async retryMissing(f, progress) {
    /** The failed fetch of each path found absent, by path. */
    const absent = new Map();
    for (let round = 1; ; round++) {
      try {
        return await f();
      } catch (e) {
        const paths = sseMissingPaths(e);
        if (!paths.length || round > SSE_RETRY_LIMIT) {
          const message = String(e?.message ?? e);
          for (const [path, failed] of absent) if (message.includes(path)) throw failed;
          throw e;
        }
        await Promise.all(paths.map((p) => this.get(p).catch((failed) => {
          if (failed?.status !== 404 || absent.has(p)) throw failed;
          absent.set(p, failed);
          this.wasm.markAbsent(p);
        })));
        progress?.(round);
      }
    }
  }

  /**
   * The table paths of the files of the canonical asset `name`: its document
   * (`<name>.asset.json`) names them, and is fetched first if it is not in the table.
   */
  assetFiles(name) {
    return this.retryMissing(() => this.wasm.assetFiles(name));
  }

  /** Whether `e` is the failure to fetch an episode document that the site does not have. */
  isMissingEpisode(e) {
    return e?.status === 404 && String(e.url).startsWith(this.url(`${SSE_PUB}episode/`));
  }
}
