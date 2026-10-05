"use client";

import ExternalLink from "@/components/ExternalLink";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { PageContainer, PageHeader, Surface } from "@/components/md3";

const bulletGroups = [
    ["local.preferences", "local.account", "local.tokens", "local.gameData"],
    ["network.oauth", "network.publicApi", "network.analytics"],
    ["use.functionality", "use.sync", "use.analytics"],
    ["controls.delete", "controls.browser"],
] as const;

export default function PrivacyPolicyClient() {
    const { t } = useI18n();
    const bullets = (group: number) => (
        <ul className="mt-3 list-disc space-y-2 pl-5">
            {bulletGroups[group]!.map((key) => <li key={key}>{t(`page.privacy.${key}`)}</li>)}
        </ul>
    );

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl flex-grow">
                <PageHeader title={t("page.privacy.title")} description={t("page.privacy.updated")} />

                <div className="space-y-5">
                    <Section title={t("page.privacy.overview.title")}>
                        <p>{t("page.privacy.overview.body")}</p>
                    </Section>
                    <Section title={t("page.privacy.local.title")}>
                        <p>{t("page.privacy.local.intro")}</p>
                        {bullets(0)}
                        <p className="mt-3">{t("page.privacy.local.note")}</p>
                    </Section>
                    <Section title={t("page.privacy.network.title")}>
                        <p>{t("page.privacy.network.intro")}</p>
                        {bullets(1)}
                    </Section>
                    <Section title={t("page.privacy.cookies.title")}>
                        <p>{t("page.privacy.cookies.analytics")}</p>
                        <p className="mt-3 type-emphasized text-on-surface">{t("page.privacy.cookies.adsDisabled")}</p>
                    </Section>
                    <Section title={t("page.privacy.use.title")}>
                        {bullets(2)}
                    </Section>
                    <Section title={t("page.privacy.sharing.title")}>
                        <p>{t("page.privacy.sharing.body")}</p>
                    </Section>
                    <Section title={t("page.privacy.controls.title")}>
                        {bullets(3)}
                    </Section>
                    <Section title={t("page.privacy.links.title")}>
                        <p>{t("page.privacy.links.body")}</p>
                        <ExternalLink
                            href="https://policies.google.com/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex type-label-l text-primary hover:underline focus-ring rounded-md3-xs"
                        >
                            {t("page.privacy.links.googlePrivacy")}
                        </ExternalLink>
                    </Section>
                    <Section title={t("page.privacy.children.title")}>
                        <p>{t("page.privacy.children.body")}</p>
                    </Section>
                    <Section title={t("page.privacy.changes.title")}>
                        <p>{t("page.privacy.changes.body")}</p>
                    </Section>
                    <Section title={t("page.privacy.contact.title")}>
                        <p>{t("page.privacy.contact.body")}</p>
                        <ul className="mt-3 list-disc space-y-2 pl-5">
                            <li>
                                {t("page.privacy.contact.github")}: {" "}
                                <ExternalLink href="https://github.com/moe-sekai/Moesekai" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline focus-ring rounded-md3-xs">
                                    moe-sekai/Moesekai
                                </ExternalLink>
                            </li>
                            <li>{t("page.privacy.contact.qq")}: 1075068454</li>
                        </ul>
                    </Section>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Surface as="section" tone="low" className="p-5 sm:p-6">
            <h2 className="mb-3 type-title-l text-on-surface">{title}</h2>
            <div className="type-body-l text-on-surface-variant">{children}</div>
        </Surface>
    );
}
