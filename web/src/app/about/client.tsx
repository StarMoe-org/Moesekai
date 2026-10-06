"use client";

import React from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import ExternalLink from "@/components/ExternalLink";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { renderMemberText } from "@/components/MemberText";
import { Divider, Icon, PageContainer, PageHeader, Surface, buttonClassName, cn } from "@/components/md3";
import { mdArrowForward, mdFavoriteFill, mdGavel, mdPolicy } from "@/components/md3/icons";

const techStack = ["Golang", "Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "Cloudflare"];

const GITHUB_PATH =
    "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z";

const panelCls = "flex flex-col p-6";
const panelTitleCls = "mb-4 type-title-l text-on-surface";
const creditLinkCls = "rounded-md3-xs font-medium text-on-surface underline decoration-dotted transition-colors hover:text-primary focus-ring";

function CreditItem({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <div className="text-on-surface-variant">{children}</div>
        </li>
    );
}

export default function AboutClient() {
    const { t } = useI18n();

    return (
        <MainLayout showLoader={true}>
            <PageContainer className="z-10 max-w-5xl flex-grow">
                <PageHeader title={t("page.about.title")} description={t("page.about.description")} className="animate-fade-in-up" />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                    <Surface tone="card" className={cn(panelCls, "md:col-span-2")}>
                        <div className="mb-4 flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-md3-lg bg-primary-container text-on-primary-container">
                                <Icon path={mdFavoriteFill} size={28} />
                            </div>
                            <div className="flex flex-col justify-center">
                                <p className="type-title-l text-on-surface">{t("page.about.nonProfit.title")}</p>
                                <p className="type-label-m text-on-surface-variant">{t("page.about.nonProfit.badge")}</p>
                            </div>
                        </div>
                        <Divider className="mb-4" />
                        <div className="space-y-4 type-body-l text-on-surface-variant">
                            <p>{t("page.about.nonProfit.description")}</p>
                            <p>
                                {t("page.about.nonProfit.supportPrefix")}{" "}
                                <Link href="/patreon" className="rounded-md3-xs font-medium text-primary hover:underline focus-ring">
                                    {t("page.about.nonProfit.supportLink")}
                                </Link>
                                {t("page.about.nonProfit.supportSuffix")}
                            </p>
                        </div>
                    </Surface>

                    <ExternalLink
                        href="https://github.com/StarMoe-org"
                        target="_blank"
                        className="group/org state-layer focus-ring flex cursor-pointer flex-col items-center justify-center rounded-md3-xl bg-inverse-surface p-6 text-center text-inverse-on-surface transition-shadow hover:shadow-elev-2"
                    >
                        <p className="mb-4 w-full text-left type-label-l opacity-80">{t("page.about.organization.label")}</p>
                        <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-full border-4 border-inverse-on-surface/10">
                            <Image
                                src="https://github.com/StarMoe-org.png"
                                alt={t("page.about.organization.avatarAlt")}
                                fill
                                className="object-cover"
                            />
                        </div>
                        <div className="relative mb-1 flex h-10 w-36 select-none items-center justify-center">
                            <div
                                className="h-8 w-full bg-inverse-primary"
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
                        </div>
                        <h3 className="type-headline-s transition-colors group-hover/org:text-inverse-primary">StarMoe</h3>
                        <p className="mt-1 type-label-l text-inverse-primary">{t("page.about.organization.description")}</p>
                        <div className="mt-6 flex flex-col items-center gap-1 type-body-s opacity-60">
                            <span>&quot;Soul by HelloWorld&quot;</span>
                        </div>
                    </ExternalLink>

                    <Surface tone="card" className={panelCls}>
                        <p className={panelTitleCls}>{t("page.about.techStack.title")}</p>
                        <div className="flex flex-grow flex-wrap content-start gap-2">
                            {techStack.map((name) => (
                                <span key={name} className="rounded-md3-sm bg-secondary-container px-3 py-1 type-label-m text-on-secondary-container">
                                    {name}
                                </span>
                            ))}
                        </div>
                        <Divider className="mt-4" />
                        <p className="pt-4 type-body-s text-on-surface-variant">
                            {t("page.about.techStack.description")}
                        </p>
                    </Surface>

                    <Surface tone="card" className={cn(panelCls, "md:col-span-2")}>
                        <p className={panelTitleCls}>{t("page.about.credits.title")}</p>
                        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                            <div>
                                <h4 className="mb-3 border-b border-outline-variant pb-1 type-title-s text-primary">{t("page.about.credits.dataSourceTitle")}</h4>
                                <ul className="space-y-2 type-body-m">
                                    <CreditItem>
                                        <ExternalLink href="https://sekai.best" target="_blank" className={creditLinkCls}>Sekai.best</ExternalLink> (Asset/MasterData API)
                                    </CreditItem>
                                    <CreditItem>
                                        <ExternalLink href="https://github.com/MejiroRina" target="_blank" className={creditLinkCls}>{t("page.about.credits.harukiLabel")}</ExternalLink> (Data)
                                    </CreditItem>
                                    <CreditItem>
                                        <ExternalLink href="https://github.com/watagashi-uni" target="_blank" className={creditLinkCls}>Uni/Haruki</ExternalLink> (Assets Hosting)
                                    </CreditItem>
                                </ul>
                            </div>
                            <div>
                                <h4 className="mb-3 border-b border-outline-variant pb-1 type-title-s text-tertiary">{t("page.about.credits.licenseTitle")}</h4>
                                <p className="mb-4 type-body-m text-on-surface-variant">
                                    {t("page.about.credits.copyrightPrefix")} <b>SEGA</b> {t("page.about.credits.copyrightMiddle")} <b>Colorful Palette</b> {t("page.about.credits.copyrightSuffix")}
                                </p>
                                <div className="rounded-md3-md bg-surface-container p-3">
                                    <p className="mb-2 type-body-s text-on-surface-variant">
                                        {t("page.about.credits.openSourcePrefix")} <b>AGPL-3.0</b> {t("page.about.credits.openSourceSuffix")}
                                    </p>
                                    <ExternalLink
                                        href="https://github.com/StarMoe-org/Moesekai"
                                        target="_blank"
                                        className={buttonClassName({ variant: "outlined", size: "xs" })}
                                    >
                                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d={GITHUB_PATH} /></svg>
                                        StarMoe-org/Moesekai
                                    </ExternalLink>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    <Surface tone="card" className={cn(panelCls, "md:col-span-3")}>
                        <p className={panelTitleCls}>{t("page.about.policies.title")}</p>
                        <p className="mb-4 type-body-l text-on-surface-variant">
                            {t("page.about.policies.description")}
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link href="/privacy" className={buttonClassName({ variant: "outlined", size: "s" })}>
                                <Icon path={mdPolicy} size={20} />
                                <span>{t("page.about.policies.privacy")}</span>
                            </Link>
                            <Link href="/terms" className={buttonClassName({ variant: "outlined", size: "s" })}>
                                <Icon path={mdGavel} size={20} />
                                <span>{t("page.about.policies.terms")}</span>
                            </Link>
                        </div>
                    </Surface>

                    <Surface tone="card" className={cn(panelCls, "md:col-span-3")}>
                        <p className={panelTitleCls}>{t("page.about.sponsors.title")}</p>
                        <p className="text-justify type-body-l text-on-surface-variant">
                            {t("page.about.sponsors.list")}
                        </p>
                    </Surface>

                    <Surface tone="card" className={cn(panelCls, "md:col-span-3")}>
                        <p className={panelTitleCls}>{t("page.about.specialThanks.title")}</p>
                        <p className="text-justify type-body-l text-on-surface-variant">
                            {t("page.about.specialThanks.list")}
                        </p>
                    </Surface>

                    <Surface tone="card" className={cn(panelCls, "md:col-span-3")}>
                        <p className={panelTitleCls}>{t("page.about.teams.title")}</p>
                        <div className="space-y-4 type-body-l text-on-surface-variant">
                            <div>
                                <span className="font-medium text-on-surface">{t("page.about.teams.translationLabel")}</span>
                                {renderMemberText(t("page.about.teams.translationMembers"))}
                            </div>
                            <div>
                                <span className="font-medium text-on-surface">{t("page.about.teams.artLabel")}</span>
                                {renderMemberText(t("page.about.teams.artMembers"))}
                            </div>
                            <div>
                                <span className="font-medium text-on-surface">{t("page.about.teams.guideLabel")}</span>
                                {renderMemberText(t("page.about.teams.guideMembers"))}
                            </div>
                            <Divider />
                            <p className="flex items-center gap-2 font-medium text-primary">
                                <Icon path={mdArrowForward} size={20} />
                                <span>
                                    {t("page.about.teams.joinPrefix")} <span className="text-on-surface">972773827</span>{t("page.about.teams.joinSuffix")}
                                </span>
                            </p>
                        </div>
                    </Surface>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
