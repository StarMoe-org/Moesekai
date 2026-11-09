// Synthesised sound effects for the gacha stage. Everything is generated with
// the Web Audio API, so nothing has to be fetched. Voices are played separately
// through an HTMLAudioElement by the page.

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
// Kept outside the context so the setting can be applied before any audio exists.
let masterGain = 0.5;

export function getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!context) {
        const Ctor: AudioContextCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
        if (!Ctor) return null;
        context = new Ctor();
        master = context.createGain();
        master.gain.value = masterGain;
        master.connect(context.destination);
    }
    return context;
}

/** Call from a user gesture so browsers allow audio to start. */
export async function unlockAudio(): Promise<void> {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") await ctx.resume();
}

/** 0 mutes the synthesized effects; 1 is the default level. Creates no audio context by itself. */
export function setSfxVolume(volume: number): void {
    masterGain = Math.min(1, Math.max(0, volume)) * 0.5;
    if (master) master.gain.value = masterGain;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.5) {
    if (!master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
}

function noiseBurst(ctx: AudioContext, start: number, duration: number, gain: number) {
    if (!master) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    const env = ctx.createGain();
    env.gain.value = gain;
    source.buffer = buffer;
    source.connect(env).connect(master);
    source.start(start);
}

/** Rising sweep while the orb charges. */
export function playCharge(seconds: number): void {
    const ctx = getAudioContext();
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + seconds);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.12, now + 0.1);
    env.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(env).connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
}

/** Reveal chime that scales with rarity: 1–2★ soft, 3★ bright, 4★/birthday full chord + burst. */
export function playReveal(rarity: "rarity_1" | "rarity_2" | "rarity_3" | "rarity_4" | "rarity_birthday"): void {
    const ctx = getAudioContext();
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    if (rarity === "rarity_1" || rarity === "rarity_2") {
        tone(ctx, 660, now, 0.25, "triangle", 0.3);
        return;
    }
    if (rarity === "rarity_3") {
        [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, f, now + i * 0.05, 0.5, "triangle", 0.35));
        return;
    }
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, now + i * 0.06, 1.1, "sawtooth", 0.25));
    noiseBurst(ctx, now, 0.4, 0.4);
}

/** Short click when the next card is shown. */
export function playTick(): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    tone(ctx, 1200, ctx.currentTime, 0.05, "square", 0.08);
}
