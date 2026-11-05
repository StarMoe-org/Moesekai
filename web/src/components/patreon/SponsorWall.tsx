"use client";

import React, { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { LEGACY_SPONSORS, LEGACY_SPONSOR_ANONYMOUS_COUNT } from "@/lib/community-lists";
import { Icon, cn } from "@/components/md3";
import { mdKeyboardArrowDown } from "@/components/md3/icons";

interface SponsorItem {
    name: string;
    avatar: string;
    amount: string;
    plan: string;
    source?: "afdian" | "kofi";
}

type LoadState =
    | { status: "loading" }
    | { status: "ready"; configured: boolean; failed: boolean; sponsors: SponsorItem[] };

function NameChip({ name, children }: { name: string; children?: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary-container py-1 pl-1 pr-3 type-label-m text-on-secondary-container">
            {children}
            <span>{name}</span>
        </span>
    );
}

export default function SponsorWall() {
    const { t } = useI18n();
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [legacyOpen, setLegacyOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/sponsors/")
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((data: { configured?: boolean; error?: string; sponsors?: SponsorItem[] }) => {
                if (cancelled) return;
                // An upstream hiccup with an empty list is shown as the empty
                // state ("no sponsors yet"), not as a failure. `failed` is
                // reserved for our own /api/sponsors being unreachable.
                setState({
                    status: "ready",
                    configured: Boolean(data.configured),
                    failed: false,
                    sponsors: Array.isArray(data.sponsors) ? data.sponsors : [],
                });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "ready", configured: true, failed: true, sponsors: [] });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="mb-2 type-title-l text-on-surface">{t("page.patreon.sponsors.title")}</h3>
                <p className="type-body-m text-on-surface-variant">{t("page.patreon.sponsors.afdianHint")}</p>
            </div>

            {state.status === "loading" && (
                <p className="type-body-m text-on-surface-variant">{t("page.patreon.sponsors.loading")}</p>
            )}

            {state.status === "ready" && !state.configured && (
                <p className="rounded-md3-md bg-surface-container-high p-4 type-body-m text-on-surface-variant">
                    {t("page.patreon.sponsors.notConfigured")}
                </p>
            )}

            {state.status === "ready" && state.configured && state.failed && (
                <p className="rounded-md3-md bg-surface-container-high p-4 type-body-m text-on-surface-variant">
                    {t("page.patreon.sponsors.loadFailed")}
                </p>
            )}

            {state.status === "ready" && state.configured && !state.failed && state.sponsors.length === 0 && (
                <p className="type-body-m text-on-surface-variant">{t("page.patreon.sponsors.empty")}</p>
            )}

            {state.status === "ready" && state.sponsors.length > 0 && (
                <>
                    <p className="type-label-m text-on-surface-variant">
                        {t("page.patreon.sponsors.count", { count: state.sponsors.length })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {state.sponsors.map((sponsor, index) => (
                            <NameChip key={`${sponsor.name}-${index}`} name={sponsor.name}>
                                {sponsor.avatar ? (
                                    // Afdian CDN avatars; plain img avoids remote image domain config.
                                    <img src={sponsor.avatar} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />
                                ) : (
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container type-label-m text-on-primary-container" aria-hidden="true">
                                        {sponsor.name.slice(0, 1)}
                                    </span>
                                )}
                                {sponsor.plan ? (
                                    <span className="type-label-s text-on-secondary-container/70">{sponsor.plan}</span>
                                ) : null}
                                {sponsor.source ? (
                                    <span className="rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                        {sponsor.source === "kofi" ? "Ko-fi" : "Afdian"}
                                    </span>
                                ) : null}
                            </NameChip>
                        ))}
                    </div>
                </>
            )}

            {/* Legacy sponsors (past sponsors): secondary, collapsed by default. */}
            <div className="rounded-md3-md border border-outline-variant">
                <button
                    type="button"
                    aria-expanded={legacyOpen}
                    onClick={() => setLegacyOpen((open) => !open)}
                    className="state-layer focus-ring flex w-full items-center justify-between gap-3 rounded-md3-md px-4 py-3 text-left"
                >
                    <span>
                        <span className="block type-title-s text-on-surface">{t("page.patreon.sponsors.legacyTitle")}</span>
                        <span className="block type-body-s text-on-surface-variant">{t("page.patreon.sponsors.legacyDescription")}</span>
                    </span>
                    <Icon
                        path={mdKeyboardArrowDown}
                        size={24}
                        className={cn("shrink-0 text-on-surface-variant transition-transform duration-200", legacyOpen && "rotate-180")}
                    />
                </button>
                {legacyOpen && (
                    <div className="space-y-3 border-t border-outline-variant px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                            {LEGACY_SPONSORS.map((sponsor) => (
                                <span
                                    key={sponsor.name}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 type-label-m text-on-surface"
                                >
                                    {sponsor.name}
                                    {sponsor.noteKey ? (
                                        <span className="type-label-s text-on-surface-variant">
                                            ({t(`page.about.sponsors.${sponsor.noteKey}Note`)})
                                        </span>
                                    ) : null}
                                </span>
                            ))}
                        </div>
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.about.sponsors.anonymousNote", { count: LEGACY_SPONSOR_ANONYMOUS_COUNT })}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
