/**
 * Merged public sponsor list served by GET /api/sponsors.
 * Afdian sponsors are pulled live (see "@/lib/afdian"); Ko-fi has no read
 * API, so its sponsors are the ones collected from webhooks (see "@/lib/kofi").
 */
import type { AfdianSponsorsResult } from "@/lib/afdian";
import type { KofiSupporter } from "@/lib/kofi";

export interface PublicSponsor {
    name: string;
    avatar: string;
    amount: string;
    plan: string;
    source: "afdian" | "kofi";
}

export interface SponsorsResponse {
    /** True when at least one source can provide (or has provided) sponsors. */
    configured: boolean;
    sponsors: PublicSponsor[];
    total: number;
    sources: {
        afdian: { configured: boolean; error?: string };
        kofi: { configured: boolean; count: number };
    };
    /** Set when the primary (Afdian) fetch failed and no sponsors are shown. */
    error?: string;
}

export function mergeSponsors(afdian: AfdianSponsorsResult, kofi: KofiSupporter[], kofiConfigured: boolean): SponsorsResponse {
    const sponsors: PublicSponsor[] = [
        ...afdian.sponsors.map((sponsor) => ({
            name: sponsor.name,
            avatar: sponsor.avatar,
            amount: sponsor.amount,
            plan: sponsor.plan,
            source: "afdian" as const,
        })),
        ...kofi.map((supporter) => ({
            name: supporter.name,
            avatar: "",
            amount: supporter.amount,
            plan: "",
            source: "kofi" as const,
        })),
    ];
    return {
        configured: afdian.configured || kofiConfigured || kofi.length > 0,
        sponsors,
        total: sponsors.length,
        sources: {
            afdian: { configured: afdian.configured, ...(afdian.error ? { error: afdian.error } : {}) },
            kofi: { configured: kofiConfigured, count: kofi.length },
        },
        ...(afdian.error && sponsors.length === 0 ? { error: afdian.error } : {}),
    };
}
