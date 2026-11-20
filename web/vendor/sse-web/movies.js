// Movie pictures for the render worker (classic script, loaded with importScripts after
// common.js): the pictures of the movies a frame shows are decoded with WebCodecs and handed to
// the renderer, which names the ones it wants (`FrameRenderer.movieFrames`).

/**
 * How many samples past the wanted one are given to a decoder: it holds back pictures while it
 * waits for the B-frames (up to two) that come after them, so its output trails its input.
 */
const SSE_MOVIE_LOOKAHEAD = 4;

/**
 * Decodes the pictures of one movie as playback asks for them: mostly one after the other, now
 * and then an earlier one (a seek) or one far ahead.
 *
 * A picture is named by its index in presentation order; the samples are in decoding order.
 */
class SseMovieDecoder {
  /**
   * @param {{codec: string, width: number, height: number, description: number[],
   *   samples: {offset: number, size: number, shows: number, key: boolean}[]}} track  `movieTrack`
   * @param {Uint8Array} bytes  the movie file, which the samples' offsets point into
   */
  constructor(track, bytes) {
    this.samples = track.samples;
    this.bytes = bytes;
    this.config = {
      codec: track.codec,
      codedWidth: track.width,
      codedHeight: track.height,
      description: new Uint8Array(track.description),
    };
    /** The decoding position of the picture with each index. */
    this.positions = track.samples.map((_, position) => position).sort((a, b) => track.samples[a].shows - track.samples[b].shows);
    /** The index of the picture shown at each time. */
    this.indexAt = new Map(this.positions.map((position, index) => [track.samples[position].shows, index]));
    this.decoder = new VideoDecoder({ output: (picture) => this.received(picture), error: (e) => { this.error = e; } });
    /** Decoded pictures not handed out yet, by index. */
    this.decoded = new Map();
    this.error = undefined;
    this.restart(0);
  }

  /**
   * Starts decoding over at the sample at `position`, a key sample: the decoder is configured
   * again and the pictures it had decoded are dropped.
   */
  restart(position) {
    this.decoder.reset();
    this.decoder.configure(this.config);
    for (const picture of this.decoded.values()) picture.close();
    this.decoded.clear();
    /** The next sample to give the decoder. */
    this.next = position;
    /** Pictures with a lower index are not wanted any more. */
    this.floor = 0;
    /** The decoder was flushed at the end of the stream: only a restart goes on. */
    this.flushed = false;
  }

  received(picture) {
    const index = this.indexAt.get(picture.timestamp);
    if (index === undefined || index < this.floor) picture.close();
    else this.decoded.set(index, picture);
  }

  /** The position of the last key sample at or before the sample at `position`. */
  keyBefore(position) {
    let key = position;
    while (key > 0 && !this.samples[key].key) key--;
    return key;
  }

  /** Gives the decoder the samples before `limit` that it has not got yet. */
  feed(limit) {
    for (; this.next < limit; this.next++) {
      const { offset, size, shows, key } = this.samples[this.next];
      this.decoder.decode(new EncodedVideoChunk({
        type: key ? "key" : "delta",
        timestamp: shows,
        data: this.bytes.subarray(offset, offset + size),
      }));
    }
    // the pictures still held back come out when the stream ends
    if (this.next === this.samples.length && !this.flushed) {
      this.flushed = true;
      // a restart while it runs makes it fail, which is nothing to report
      this.decoder.flush().catch(() => {});
    }
  }

  /**
   * The picture `index`, or undefined while it is not decoded: decoding goes on towards it
   * meanwhile, and the caller asks again. Whoever gets a picture closes it.
   */
  picture(index) {
    if (this.error) throw this.error;
    const position = this.positions[index];
    const key = this.keyBefore(position);
    // an earlier picture than the last asked for, or one past a key sample the decoder has not
    // reached: decoding starts again from that key sample
    if (index < this.floor || this.next < key) this.restart(key);
    for (const [i, picture] of this.decoded) {
      if (i < index) {
        picture.close();
        this.decoded.delete(i);
      }
    }
    this.floor = index;
    this.feed(Math.min(position + 1 + SSE_MOVIE_LOOKAHEAD, this.samples.length));
    const picture = this.decoded.get(index);
    if (picture) {
      this.decoded.delete(index);
      this.floor = index + 1;
    }
    return picture;
  }

  close() {
    for (const picture of this.decoded.values()) picture.close();
    this.decoded.clear();
    if (this.decoder.state !== "closed") this.decoder.close();
  }
}

/**
 * The movies on screen: a decoder for the scenario's movie and one for the background's, each
 * for the movie it plays now.
 *
 * Where the browser has no WebCodecs, or cannot decode a movie, the movie shows no pictures
 * (the renderer leaves its rect black) and playback goes on with its sound: told once a movie
 * in the console.
 */
class SseMovies {
  /** @param {{movieTrack: Function, readFile: Function}} wasm  the wasm module's functions */
  constructor(wasm) {
    this.wasm = wasm;
    this.layers = new Map();
    /** Movies that show no pictures here, by path. */
    this.blank = new Set();
    /** Where pictures are made RGBA (`rgba`). */
    this.canvas = undefined;
  }

  /**
   * `picture` as RGBA, by the browser's 2D canvas, which it closes. A decoded picture is YUV;
   * copied to a WebGPU texture as it is, it comes out brighter than the 2D canvas, and the
   * export, show it (by about 10 of 255 in Chrome).
   */
  rgba(picture) {
    const { displayWidth: width, displayHeight: height, timestamp } = picture;
    if (this.canvas?.width !== width || this.canvas?.height !== height) {
      this.canvas = new OffscreenCanvas(width, height);
      this.context = this.canvas.getContext("2d");
    }
    this.context.drawImage(picture, 0, 0);
    picture.close();
    return new VideoFrame(this.canvas, { timestamp });
  }

  /** The movie at `path` shows no pictures: `reason` is told once. */
  giveUp(path, reason) {
    if (this.blank.has(path)) return;
    this.blank.add(path);
    console.warn(`${path}: the movie shows no pictures (${reason})`);
  }

  /**
   * The picture `index` of the movie at publication path `path` (see `SseMovieDecoder.picture`):
   * the background's movie when `background`, else the scenario's. The movie file must be in the
   * file table; a missing one fails naming it (`not in the file table`), for the caller to fetch.
   */
  picture(path, index, background) {
    if (this.blank.has(path)) return undefined;
    if (typeof VideoDecoder === "undefined") {
      this.giveUp(path, "this browser has no WebCodecs");
      return undefined;
    }
    const layer = background ? "background" : "scenario";
    let playing = this.layers.get(layer);
    if (playing?.path !== path) {
      // the layer's decoder goes before the next is made, which may fail for a file not in yet
      playing?.decoder.close();
      this.layers.delete(layer);
      const track = JSON.parse(this.wasm.movieTrack(path));
      playing = { path, decoder: new SseMovieDecoder(track, this.wasm.readFile(SSE_PUB + path)) };
      this.layers.set(layer, playing);
    }
    try {
      const picture = playing.decoder.picture(index);
      return picture && this.rgba(picture);
    } catch (e) {
      // a codec the browser does not take, or a stream it cannot decode
      playing.decoder.close();
      this.layers.delete(layer);
      this.giveUp(path, e?.message ?? e);
      return undefined;
    }
  }
}
