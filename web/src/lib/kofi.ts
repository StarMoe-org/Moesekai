/**
 * Ko-fi sponsor collection — server-only.
 *
 * Ko-fi has NO read API for supporters (only buttons/widgets and an outbound
 * webhook), so unlike Afdian we cannot pull a list. Instead Ko-fi POSTs one
 * webhook per payment to /api/sponsors/kofi-webhook (configured in Ko-fi
 * Settings > API > Webhooks); we verify its `verification_token`, keep only
 * public Donation/Subscription events, and accumulate them in a JSON file.
 * Point KOFI_SUPPORTERS_FILE at persistent storage in production — the list
 * only contains payments received after the webhook was configured, and it
 * is lost if the file lives on ephemeral container storage.
 */
import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface KofiSupporter {
    name: string;
    /** Summed amount of stored payments in `currency`, e.g. "12.00". */
    amount: string;
    currency: string;
    /** Unix seconds of the most recent stored payment (0 when unknown). */
    lastPayTime: number;
    payments: number;
    transactionIds: string[];
}

export interface KofiWebhookEvent {
    type: string;
    fromName: string;
    amount: string;
    currency: string;
    timestampSeconds: number;
    isPublic: boolean;
    transactionId: string;
}

const SUPPORTED_TYPES = new Set(["Donation", "Subscription"]);
const MAX_TRANSACTION_IDS = 200;

export function kofiSupportersFile(): string {
    const configured = (process.env.KOFI_SUPPORTERS_FILE || "").trim();
    if (configured) return configured;
    return path.join(process.cwd(), "data", "kofi-supporters.json");
}

export function verifyKofiToken(received: unknown, expected: string): boolean {
    if (typeof received !== "string" || !received || !expected) return false;
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Parse the JSON payload Ko-fi sends in the form field `data`. */
export function parseKofiWebhookEvent(payload: unknown): KofiWebhookEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const raw = payload as Record<string, unknown>;
    const fromName = typeof raw.from_name === "string" ? raw.from_name.trim() : "";
    if (!fromName) return null;
    const timestamp = typeof raw.timestamp === "string" ? Date.parse(raw.timestamp) : NaN;
    return {
        type: typeof raw.type === "string" ? raw.type : "",
        fromName,
        amount: typeof raw.amount === "string" ? raw.amount : "0",
        currency: typeof raw.currency === "string" ? raw.currency : "",
        timestampSeconds: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0,
        isPublic: raw.is_public !== false,
        transactionId:
            (typeof raw.kofi_transaction_id === "string" && raw.kofi_transaction_id) ||
            (typeof raw.message_id === "string" && raw.message_id) ||
            "",
    };
}

/** Whether an event belongs on the public sponsor wall. */
export function isCollectableKofiEvent(event: KofiWebhookEvent): boolean {
    return event.isPublic && SUPPORTED_TYPES.has(event.type);
}

interface KofiStoreFile {
    version: 1;
    supporters: KofiSupporter[];
}

function emptyStore(): KofiStoreFile {
    return { version: 1, supporters: [] };
}

function normalizeStore(parsed: unknown): KofiStoreFile {
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const list = (parsed as { supporters?: unknown }).supporters;
    if (!Array.isArray(list)) return emptyStore();
    return {
        version: 1,
        supporters: list.filter(
            (entry): entry is KofiSupporter =>
                Boolean(entry) &&
                typeof entry === "object" &&
                typeof (entry as KofiSupporter).name === "string",
        ),
    };
}

export async function readKofiSupporters(file: string = kofiSupportersFile()): Promise<KofiSupporter[]> {
    try {
        const text = await readFile(file, "utf8");
        return normalizeStore(JSON.parse(text)).supporters;
    } catch {
        return [];
    }
}

async function writeStore(file: string, store: KofiStoreFile): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await rename(tmp, file);
}

let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Record one webhook event. Returns true when a new payment was stored,
 * false for duplicates, non-public or unsupported event types.
 */
export function recordKofiEvent(event: KofiWebhookEvent, file: string = kofiSupportersFile()): Promise<boolean> {
    const task = writeChain.then(async () => {
        if (!isCollectableKofiEvent(event)) return false;
        const store = normalizeStore(await readStoreRaw(file));
        if (event.transactionId && store.supporters.some((s) => s.transactionIds?.includes(event.transactionId))) {
            return false;
        }
        const key = event.fromName.toLowerCase();
        const existing = store.supporters.find((s) => s.name.toLowerCase() === key);
        const amount = Number.parseFloat(event.amount) || 0;
        if (existing) {
            const sameCurrency = !existing.currency || !event.currency || existing.currency === event.currency;
            const total = sameCurrency ? (Number.parseFloat(existing.amount) || 0) + amount : amount;
            existing.amount = total.toFixed(2);
            if (event.currency) existing.currency = event.currency;
            existing.lastPayTime = Math.max(existing.lastPayTime || 0, event.timestampSeconds);
            existing.payments = (existing.payments || 0) + 1;
            existing.transactionIds = [...(existing.transactionIds || []), ...(event.transactionId ? [event.transactionId] : [])].slice(-MAX_TRANSACTION_IDS);
        } else {
            store.supporters.push({
                name: event.fromName,
                amount: amount.toFixed(2),
                currency: event.currency,
                lastPayTime: event.timestampSeconds,
                payments: 1,
                transactionIds: event.transactionId ? [event.transactionId] : [],
            });
        }
        store.supporters.sort((a, b) => (b.lastPayTime || 0) - (a.lastPayTime || 0));
        await writeStore(file, store);
        return true;
    });
    writeChain = task.catch(() => undefined);
    return task;
}

async function readStoreRaw(file: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch {
        return null;
    }
}
