"use client";
import React from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import ExternalLink from "@/components/ExternalLink";
import { NAV_ITEM_LABEL_KEYS } from "@/lib/navigation";
import { MOE_LOGO_URL } from "@/lib/assets";
import { MOESEKAI_BILIBILI_SPACE_URL } from "@/lib/team-links";
import { Icon } from "@/components/md3";
import { mdBugReport, mdEdit, mdMail } from "@/components/md3/icons";

const LINK_CLS = "inline-flex min-h-8 items-center gap-2 rounded-full type-body-m text-on-surface-variant transition-colors hover:text-primary focus-ring";
const HEADING_CLS = "type-title-s text-on-surface";

const EXPLORE_LINKS = [
    "/",
    "/cards",
    "/music",
    "/character",
    "/events",
];

export default function MainFooter() {
    const { t } = useI18n();
    return (
        <footer className="relative z-[5] mt-auto w-full px-3 pb-4 sm:px-4 sm:pb-6">
            <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 px-6 py-10 text-on-surface sm:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* Column 1: Brand & Description */}
                    <div className="lg:col-span-4 space-y-3">
                        <Link href="/" className="focus-ring inline-block rounded-md3-sm" title="MoeSekai">
                            <div
                                className="h-9 w-[6.2rem] bg-primary-container sm:h-10 sm:w-[7.2rem]"
                                style={{
                                    maskImage: `url(${MOE_LOGO_URL})`,
                                    maskSize: "contain",
                                    maskPosition: "left center",
                                    maskRepeat: "no-repeat",
                                    WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                    WebkitMaskSize: "contain",
                                    WebkitMaskPosition: "left center",
                                    WebkitMaskRepeat: "no-repeat",
                                }}
                            />
                        </Link>
                        <p className="type-label-s uppercase tracking-widest text-on-surface-variant">
                            PROJECT SEKAI VIEWER
                        </p>
                        <p className="max-w-sm type-body-m text-on-surface-variant">
                            {t("layout.footer.brandDescription")}
                        </p>

                        {/* Social & Community Badges */}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                            <ExternalLink
                                href={MOESEKAI_BILIBILI_SPACE_URL}
                                className="state-layer focus-ring inline-flex h-8 items-center gap-2 rounded-md3-sm border border-outline-variant px-3 type-label-l text-[#fb7299]"
                            >
                                <svg className="h-[18px] w-[18px] fill-current" viewBox="0 0 24 24">
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z"
                                    />
                                </svg>
                                <span>{t("layout.footer.bilibiliAccount")}</span>
                            </ExternalLink>
                            <ExternalLink
                                href="https://github.com/StarMoe-org/Moesekai"
                                className="state-layer focus-ring inline-flex h-8 items-center gap-2 rounded-md3-sm border border-outline-variant px-3 type-label-l text-on-surface-variant"
                            >
                                <svg className="h-[18px] w-[18px] fill-current" viewBox="0 0 24 24">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                                <span>GitHub</span>
                            </ExternalLink>
                        </div>
                    </div>

                    {/* Column 2: Explore */}
                    <div className="lg:col-span-2 space-y-3">
                        <h3 className={HEADING_CLS}>
                            {t("layout.footer.explore")}
                        </h3>
                        <ul className="space-y-1">
                            {EXPLORE_LINKS.map(href => (
                                <li key={href}>
                                    <Link href={href} className={LINK_CLS}>
                                        {t(NAV_ITEM_LABEL_KEYS[href])}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Column 3: Sister Sites & Community */}
                    <div className="lg:col-span-3 space-y-3">
                        <h3 className={HEADING_CLS}>
                            {t("layout.footer.sisterSites")}
                        </h3>
                        <ul className="space-y-1">
                            <li>
                                <ExternalLink href="https://bdon.moe" className={LINK_CLS}>
                                    bdon.moe <span className="type-body-s text-outline">(Moenotes)</span>
                                </ExternalLink>
                            </li>
                            <li>
                                <ExternalLink href={MOESEKAI_BILIBILI_SPACE_URL} className={LINK_CLS}>
                                    {t("page.home.friends.bilibiliTitle")}
                                    <span className="rounded-md3-xs bg-[#fb7299]/15 px-1.5 type-label-s text-[#fb7299]">BILIBILI</span>
                                </ExternalLink>
                            </li>
                        </ul>
                    </div>

                    {/* Column 4: Contact & Legal */}
                    <div className="lg:col-span-3 space-y-3">
                        <h3 className={HEADING_CLS}>
                            {t("layout.footer.contact")}
                        </h3>
                        <ul className="space-y-1">
                            <li>
                                <ExternalLink href="https://github.com/moe-sekai/Moesekai/issues/new?template=feature_request.md" className={LINK_CLS}>
                                    <Icon path={mdEdit} size={20} />
                                    {t("layout.footer.feedback")}
                                </ExternalLink>
                            </li>
                            <li>
                                <ExternalLink href="https://github.com/moe-sekai/Moesekai/issues/new?template=bug_report.md" className={LINK_CLS}>
                                    <Icon path={mdBugReport} size={20} />
                                    {t("layout.footer.bugReport")}
                                </ExternalLink>
                            </li>
                            <li>
                                <ExternalLink href="mailto:mail@exmeaning.com" className={LINK_CLS}>
                                    <Icon path={mdMail} size={20} />
                                    mail@exmeaning.com
                                </ExternalLink>
                            </li>
                            <li className="flex items-center gap-3 pt-2 type-body-s text-on-surface-variant">
                                <Link href="/privacy" className="focus-ring rounded-full hover:text-primary">
                                    {t("layout.footer.privacyPolicy")}
                                </Link>
                                <span className="text-outline-variant">·</span>
                                <Link href="/terms" className="focus-ring rounded-full hover:text-primary">
                                    {t("layout.footer.termsOfService")}
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Divider */}
                <div className="my-8 h-px w-full bg-outline-variant" />

                {/* Bottom Section: Copyright & Disclaimer */}
                <div className="flex flex-col items-start justify-between gap-4 type-body-s text-on-surface-variant md:flex-row md:items-center">
                    <div className="space-y-1">
                        <p>
                            © {new Date().getFullYear()} MoeSekai. {t("layout.footer.generatedBy")}{" "}
                            <ExternalLink href="https://star.moe" className="inline-flex items-center gap-1 type-label-m text-on-surface-variant transition-colors hover:text-primary">
                                <span
                                    className="h-3.5 w-12 bg-current"
                                    style={{
                                        maskImage: "url(/starmoe.svg)",
                                        maskSize: "contain",
                                        maskPosition: "center",
                                        maskRepeat: "no-repeat",
                                        WebkitMaskImage: "url(/starmoe.svg)",
                                        WebkitMaskSize: "contain",
                                        WebkitMaskPosition: "center",
                                        WebkitMaskRepeat: "no-repeat",
                                    }}
                                />
                                StarMoe
                            </ExternalLink>.
                        </p>
                        <p className="type-label-s uppercase tracking-wider text-outline">
                            {t("layout.footer.nonProfit")}
                        </p>
                    </div>
                    <div className="max-w-md text-left md:text-right">
                        <p>
                            {t("layout.footer.copyrightNotice")}
                        </p>
                        <p>
                            {t("layout.footer.fanNotice")}
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
