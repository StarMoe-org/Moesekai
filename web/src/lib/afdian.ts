/**
 * Afdian open API client — server-only.
 *
 * Docs: https://afdian.com/dashboard/dev — the creator backend issues a
 * `user_id` + API token. Requests to `POST /api/open/query-sponsor` are signed
 * as md5(token + "params" + <params JSON> + "ts" + <ts> + "user_id" + <user_id>).
 * The token is a secret: it must only ever live in server env vars
 * (AFDIAN_USER_ID / AFDIAN_API_TOKEN), never in NEXT_PUBLIC_* or client code.
 * The /api/sponsors route handler is the only caller.
 */
import { createHash } from "node:crypto";

const DEFAULT_API_BASE = "https://afdian.com/api/open";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface AfdianSponsor {
    name: string;
    avatar: string;
    /** Cumulative sponsored amount as reported by Afdian, e.g. "66.00". */
    amount: string;
    /** Unix seconds of the most recent payment (0 when unknown). */
    lastPayTime: number;
    /** Current plan name, "" when the sponsor has no active plan. */
    plan: string;
}

export interface AfdianSponsorsResult {
    configured: boolean;
    sponsors: AfdianSponsor[];
    total: number;
    error?: string;
}

export function buildSignedAfdianBody(userId: string, token: string, params: Record<string, unknown>, tsSeconds: number) {
    const paramsJson = JSON.stringify(params);
    const sign = createHash("md5")
        .update(`${token}params${paramsJson}ts${tsSeconds}user_id${userId}`)
        .digest("hex");
    return { user_id: userId, params: paramsJson, ts: tsSeconds, sign };
}

interface AfdianSponsorPayload {
    data?: {
        total_count?: unknown;
        total_page?: unknown;
        list?: unknown;
    };
}

function toSponsor(raw: unknown): AfdianSponsor | null {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as Record<string, unknown>;
    const user = entry.user && typeof entry.user === "object" ? (entry.user as Record<string, unknown>) : {};
    const name = typeof user.name === "string" ? user.name.trim() : "";
    if (!name) return null;
    const currentPlan = entry.current_plan && typeof entry.current_plan === "object" ? (entry.current_plan as Record<string, unknown>) : {};
    return {
        name,
        avatar: typeof user.avatar === "string" ? user.avatar : "",
        amount: typeof entry.all_sum_amount === "string" ? entry.all_sum_amount : "0.00",
        lastPayTime: typeof entry.last_pay_time === "number" ? entry.last_pay_time : 0,
        plan: typeof currentPlan.name === "string" ? currentPlan.name : "",
    };
}

export function parseAfdianSponsors(payload: unknown): { total: number; totalPage: number; sponsors: AfdianSponsor[] } {
    const data = (payload as AfdianSponsorPayload | null)?.data ?? {};
    const list = Array.isArray(data.list) ? data.list : [];
    return {
        total: typeof data.total_count === "number" ? data.total_count : list.length,
        totalPage: typeof data.total_page === "number" ? data.total_page : 1,
        sponsors: list.map(toSponsor).filter((sponsor): sponsor is AfdianSponsor => sponsor !== null),
    };
}

export async function fetchAfdianSponsors(): Promise<AfdianSponsorsResult> {
    const userId = (process.env.AFDIAN_USER_ID || "").trim();
    const token = (process.env.AFDIAN_API_TOKEN || "").trim();
    if (!userId || !token) return { configured: false, sponsors: [], total: 0 };

    const apiBase = (process.env.AFDIAN_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
    try {
        const sponsors: AfdianSponsor[] = [];
        let total = 0;
        let totalPage = 1;
        for (let page = 1; page <= Math.min(totalPage, MAX_PAGES); page += 1) {
            const body = buildSignedAfdianBody(userId, token, { page, per_page: PAGE_SIZE }, Math.floor(Date.now() / 1000));
            const response = await fetch(`${apiBase}/query-sponsor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                next: { revalidate: 3600 },
            });
            if (!response.ok) throw new Error(`Afdian HTTP ${response.status}`);
            const payload: unknown = await response.json();
            const ec = (payload as { ec?: unknown } | null)?.ec;
            if (ec !== 200) throw new Error(`Afdian ec ${String(ec)}`);
            const parsed = parseAfdianSponsors(payload);
            sponsors.push(...parsed.sponsors);
            total = parsed.total;
            totalPage = parsed.totalPage;
        }
        return { configured: true, sponsors, total };
    } catch (error) {
        return {
            configured: true,
            sponsors: [],
            total: 0,
            error: error instanceof Error ? error.message : "Afdian request failed",
        };
    }
}
