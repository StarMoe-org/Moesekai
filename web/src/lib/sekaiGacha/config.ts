/**
 * Where the 3D gacha presentation (SekaiGacha, a Unity WebGL build) is loaded from.
 *
 * - `NEXT_PUBLIC_SEKAI_GACHA_URL`: the build's `index.html`. Builds are published once per
 *   version under `sekai-gacha/<version>/` and never overwritten, so moving to a new build is
 *   a change of this value (or of the default below) together with a deploy of this site.
 *
 * The value must already be canonical (what the URL parser gives back): https, or http on a
 * loopback host for development, without credentials, query or fragment.
 */
const DEFAULT_URL = "https://assets.pjsk.moe/sekai-extra-assets/sekai-gacha/06835ef/index.html";

/** The page the stage iframe opens. */
export function sekaiGachaUrl(): string {
    const name = "NEXT_PUBLIC_SEKAI_GACHA_URL";
    const invalid = new Error(`sekai_gacha_config_invalid:${name}`);
    const raw = process.env.NEXT_PUBLIC_SEKAI_GACHA_URL?.trim() || DEFAULT_URL;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw invalid;
    }
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (/[?#\\\s]/.test(raw) || !(parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback))
        || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash
        || parsed.pathname.endsWith("/") || parsed.pathname.split("/").some(part => part === "." || part === "..")
        || raw !== parsed.href) throw invalid;
    return parsed.href;
}

/** The origin every stage message must come from, and the only one messages are sent to. */
export function sekaiGachaOrigin(): string {
    return new URL(sekaiGachaUrl()).origin;
}

/** Checks the value above; a wrong one throws. For the build. */
export function sekaiGachaCheckConfig(): void {
    sekaiGachaUrl();
}
