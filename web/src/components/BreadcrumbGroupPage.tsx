"use client";
import React from "react";
import MainLayout from "@/components/MainLayout";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { useEffect } from "react";
import { Card, PageContainer, PageHeader } from "@/components/md3";
import type { NavGroupData } from "@/lib/navigation";
import { NAV_GROUP_LABEL_KEYS, NAV_ITEM_DESCRIPTION_KEYS, NAV_ITEM_LABEL_KEYS } from "@/lib/navigation";

interface BreadcrumbGroupPageProps {
    group: NavGroupData;
}

export default function BreadcrumbGroupPage({ group }: BreadcrumbGroupPageProps) {
    const { setDetailName } = useBreadcrumb();
    const { t } = useI18n();

    const groupLabel = t(NAV_GROUP_LABEL_KEYS[group.href] ?? group.href);
    const getItemLabel = (href: string) => t(NAV_ITEM_LABEL_KEYS[href] ?? href);
    const getItemDescription = (href: string) => t(NAV_ITEM_DESCRIPTION_KEYS[href] ?? "");

    useEffect(() => {
        setDetailName(null);
    }, [setDetailName]);

    return (
        <MainLayout>
            <PageContainer>
                <div className="mx-auto max-w-5xl">
                <PageHeader title={groupLabel} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((item) => (
                        <Card key={item.href} href={item.href} variant="filled" interactive className="group p-5">
                            <h3 className="type-title-m text-on-surface transition-colors group-hover:text-primary">
                                {getItemLabel(item.href)}
                            </h3>
                            <p className="mt-1 type-body-m text-on-surface-variant">
                                {getItemDescription(item.href)}
                            </p>
                        </Card>
                    ))}
                </div>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
