"use client";
import React, { useRef } from "react";
import Modal from "@/components/common/Modal";
import { IHonorInfo, IHonorGroup } from "@/types/honor";
import DegreeImage from "./DegreeImage";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { useSvgPreviewActions } from "@/hooks/useSvgPreviewActions";
import { useI18n } from "@/contexts/I18nContext";

interface HonorDetailDialogProps {
    open: boolean;
    onClose: () => void;
    honor?: IHonorInfo;
    honorGroup?: IHonorGroup;
    source?: AssetSourceType;
}

export default function HonorDetailDialog({
    open,
    onClose,
    honor,
    honorGroup,
    source = "main-jp",
}: HonorDetailDialogProps) {
    const { t } = useI18n();
    const previewRef = useRef<HTMLDivElement>(null);
    const { headerActions, errorMessage } = useSvgPreviewActions({
        isOpen: open,
        previewRef,
        fileName: honor ? `${honor.name}_${honor.id}` : "honor",
    });

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={honor?.name ?? t("page.honors.normalDetailTitle")}
            size="md"
            headerActions={headerActions}
        >
            {honor ? (
                <div className="space-y-5">
                    <div className="flex justify-center">
                        <div ref={previewRef} className="w-full max-w-[380px]">
                            <DegreeImage
                                honor={honor}
                                honorGroup={honorGroup}
                                honorLevel={honor.levels.length > 0 ? honor.levels[0].level : undefined}
                                source={source}
                            />
                        </div>
                    </div>

                    <div className="space-y-0">
                        <InfoRow label="ID" value={String(honor.id)} />
                        <InfoRow label={t("common.field.name")} value={honor.name} />
                        {honorGroup && (
                            <InfoRow label={t("common.field.honorGroup")} value={honorGroup.name} />
                        )}
                        {honorGroup && (
                            <InfoRow label={t("common.field.type")} value={t(`common.honor.types.${honorGroup.honorType}`) === `common.honor.types.${honorGroup.honorType}` ? honorGroup.honorType.replace(/_/g, " ") : t(`common.honor.types.${honorGroup.honorType}`)} />
                        )}
                        {honor.honorRarity && (
                            <InfoRow label={t("common.field.rarity")} value={t(`common.honor.rarities.${honor.honorRarity}`) === `common.honor.rarities.${honor.honorRarity}` ? honor.honorRarity : t(`common.honor.rarities.${honor.honorRarity}`)} />
                        )}
                    </div>

                    {honor.levels.length > 0 && (
                        <div>
                            <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.levelDetails")}</h3>
                            <div className="space-y-4">
                                {honor.levels.map(level => (
                                    <div key={level.level} className="space-y-2 rounded-md3-md bg-surface-container p-4">
                                        <div className="flex items-center justify-between">
                                            <span className="type-label-l text-primary">Lv.{level.level}</span>
                                            {level.honorRarity && (
                                                <span className="rounded-md3-sm bg-secondary-container px-2 py-0.5 type-label-m text-on-secondary-container">
                                                    {t(`common.honor.rarities.${level.honorRarity}`) === `common.honor.rarities.${level.honorRarity}` ? level.honorRarity : t(`common.honor.rarities.${level.honorRarity}`)}
                                                </span>
                                            )}
                                        </div>
                                        {level.description && (
                                            <p className="type-body-m text-on-surface-variant">{level.description}</p>
                                        )}
                                        {level.assetbundleName && (
                                            <div className="mt-2">
                                                <DegreeImage
                                                    honor={{ ...honor, assetbundleName: level.assetbundleName }}
                                                    honorGroup={honorGroup}
                                                    honorLevel={level.level}
                                                    source={source}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {errorMessage && <p className="type-body-s text-error">{errorMessage}</p>}
                </div>
            ) : null}
        </Modal>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant py-2.5 last:border-0">
            <span className="type-label-l text-on-surface-variant">{label}</span>
            <span className="max-w-[60%] text-right type-body-m text-on-surface">{value}</span>
        </div>
    );
}
