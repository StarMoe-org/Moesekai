import { NextResponse } from "next/server";
import { parseKofiWebhookEvent, recordKofiEvent, verifyKofiToken } from "@/lib/kofi";

/**
 * Ko-fi webhook receiver. Ko-fi has no supporter-list API; it POSTs one
 * form-encoded webhook per payment (field `data` = JSON) to this URL.
 * Configure in Ko-fi: Settings > API > Webhooks ->
 *   https://pjsk.moe/api/sponsors/kofi-webhook
 * and put the same verification token in KOFI_WEBHOOK_TOKEN (server-only).
 * Only public Donation/Subscription events are collected (see "@/lib/kofi").
 */
export async function POST(request: Request) {
    const expectedToken = (process.env.KOFI_WEBHOOK_TOKEN || "").trim();
    if (!expectedToken) {
        return NextResponse.json({ configured: false }, { status: 503 });
    }

    let payload: unknown = null;
    try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
            const form = await request.formData();
            const data = form.get("data");
            payload = typeof data === "string" ? JSON.parse(data) : null;
        } else {
            const body: unknown = await request.json();
            const data = (body as { data?: unknown } | null)?.data;
            payload = typeof data === "string" ? JSON.parse(data) : (data ?? body);
        }
    } catch {
        return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    if (!payload || typeof payload !== "object") {
        return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    if (!verifyKofiToken((payload as { verification_token?: unknown }).verification_token, expectedToken)) {
        return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
    }

    const event = parseKofiWebhookEvent(payload);
    if (!event) {
        return NextResponse.json({ ok: false, error: "invalid event" }, { status: 400 });
    }

    const stored = await recordKofiEvent(event);
    return NextResponse.json({ ok: true, stored });
}
