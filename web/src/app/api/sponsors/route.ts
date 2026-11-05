import { NextResponse } from "next/server";
import { fetchAfdianSponsors } from "@/lib/afdian";

/**
 * Public sponsor list proxied from the Afdian open API.
 * The Afdian API token stays server-side (see "@/lib/afdian"); this route only
 * exposes sanitized display fields (name / avatar / amount / plan).
 * When AFDIAN_USER_ID / AFDIAN_API_TOKEN are not configured, returns
 * { configured: false } and the UI falls back to the legacy sponsor list.
 */
export async function GET() {
    const result = await fetchAfdianSponsors();
    return NextResponse.json(result, {
        headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
