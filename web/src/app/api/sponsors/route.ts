import { NextResponse } from "next/server";
import { fetchAfdianSponsors } from "@/lib/afdian";
import { readKofiSupporters } from "@/lib/kofi";
import { mergeSponsors } from "@/lib/sponsors";

/**
 * Public sponsor list merged from two sources:
 * - Afdian: pulled live from its open API (token stays server-side).
 * - Ko-fi: no read API exists, so this merges the supporters collected
 *   from Ko-fi payment webhooks (see /api/sponsors/kofi-webhook).
 * Only sanitized display fields are exposed. When neither source is
 * configured, returns { configured: false } and the UI shows the legacy list.
 */
export async function GET() {
    const [afdian, kofi] = await Promise.all([
        fetchAfdianSponsors(),
        readKofiSupporters().catch(() => []),
    ]);
    const kofiConfigured = Boolean((process.env.KOFI_WEBHOOK_TOKEN || "").trim());
    return NextResponse.json(mergeSponsors(afdian, kofi, kofiConfigured), {
        headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
