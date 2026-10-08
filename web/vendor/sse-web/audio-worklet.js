// The audio output of the web player (ADR-0031): plays the PCM the mixer produced, as it is,
// and is the player's clock. Nothing here decides what is heard; that is sse-mix.
//
// The stream is interleaved stereo f32 at the context's sample rate, addressed by absolute
// sample index from the start of the episode. Chunks arrive in order on a port:
//   { type: "chunk", start, samples: Float32Array }   samples for [start, start + n); a chunk
//                                                      starting inside what is queued replaces
//                                                      the rest (it was mixed again), and until it
//                                                      comes the old samples keep playing
//   { type: "seek", position, gen }                    drop everything, continue from position
//   { type: "play" } / { type: "pause" }
// and the processor reports where it is, to the page and to the worker that mixes:
//   { type: "position", position, time, starved, gen } `time` is the context time of `position`;
//                                                      `gen` counts the seeks taken
// While it has no samples for the next block it outputs silence and does not advance: the
// clock stops with the sound, which is what buffering looks like to the rest of the player.

class SseStream extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Chunks not played out yet, in order. */
    this.queue = [];
    /** Next sample index to play. */
    this.position = 0;
    this.playing = false;
    this.starved = false;
    this.blocks = 0;
    this.gen = 0;
    this.source = this.port;
    this.port.onmessage = (e) => this.receive(e.data);
  }

  receive(m) {
    switch (m.type) {
      case "port":
        // chunks come straight from the worker that mixes them, which is told where playback
        // is from here: the audio thread runs on in a hidden tab, the page's frames do not
        this.sim = m.port;
        m.port.onmessage = (e) => this.receive(e.data);
        break;
      case "chunk": {
        const from = Math.max(m.start, this.position);
        this.queue = this.queue.filter((c) => c.start < from);
        const last = this.queue.at(-1);
        if (last && last.start + last.samples.length / 2 > from) {
          last.samples = last.samples.subarray(0, (from - last.start) * 2);
        }
        this.queue.push({ start: m.start, samples: m.samples });
        break;
      }
      case "seek":
        this.queue.length = 0;
        this.position = m.position;
        this.gen = m.gen;
        break;
      case "play":
        this.playing = true;
        break;
      case "pause":
        this.playing = false;
        break;
    }
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    const n = left.length;
    let wrote = 0;
    if (this.playing) {
      // drop chunks that lie wholly behind the position (after a seek)
      while (this.queue.length && this.queue[0].start + this.queue[0].samples.length / 2 <= this.position) {
        this.queue.shift();
      }
      while (wrote < n && this.queue.length) {
        const chunk = this.queue[0];
        const offset = this.position - chunk.start;
        if (offset < 0) break; // a gap: wait for the missing samples
        const available = chunk.samples.length / 2 - offset;
        const take = Math.min(available, n - wrote);
        for (let i = 0; i < take; i++) {
          left[wrote + i] = chunk.samples[(offset + i) * 2];
          if (right) right[wrote + i] = chunk.samples[(offset + i) * 2 + 1];
        }
        wrote += take;
        this.position += take;
        if (take === available) this.queue.shift();
      }
    }
    // the rest of the block stays silent (the output buffers come zeroed)
    this.starved = this.playing && wrote < n;
    if (++this.blocks % 4 === 0 || this.starved) {
      this.sim?.postMessage({ type: "position", position: this.position, gen: this.gen });
      this.port.postMessage({
        type: "position",
        position: this.position,
        time: currentTime + n / sampleRate,
        starved: this.starved,
        gen: this.gen,
        queued: this.queue.reduce((s, c) => s + c.samples.length / 2, 0),
      });
    }
    return true;
  }
}

registerProcessor("sse-stream", SseStream);
