"use client";
import React, { useRef } from "react";
import Modal from "@/components/common/Modal";
import { IBondsHonor, IBondsHonorWord, IGameCharaUnit } from "@/types/honor";
import BondsDegreeImage from "./BondsDegreeImage";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { useSvgPreviewActions } from "@/hooks/useSvgPreviewActions";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";

interface BondsHonorDetailDialogProps {
    open: boolean;
    onClose: () => void;
    bondsHonor?: IBondsHonor;
    bondsHonorWords?: IBondsHonorWord[];
    gameCharaUnits: IGameCharaUnit[];
    source?: AssetSourceType;
}

export default function BondsHonorDetailDialog({
    open,
    onClose,
    bondsHonor,
    bondsHonorWords = [],
    gameCharaUnits,
    source = "main-jp",
}: BondsHonorDetailDialogProps) {
    const { t } = useI18n();
    const previewRef = useRef<HTMLDivElement>(null);
    const { headerActions, errorMessage } = useSvgPreviewActions({
        isOpen: open,
        previewRef,
        fileName: bondsHonor ? `${bondsHonor.name}_${bondsHonor.id}` : "bonds_honor",
    });
    const gcu1 = bondsHonor
        ? gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId1)
        : undefined;
    const gcu2 = bondsHonor
        ? gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId2)
        : undefined;
    const defaultWord = bondsHonor
        ? bondsHonorWords.find(w => w.bondsGroupId === bondsHonor.bondsGroupId)
        : undefined;

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={bondsHonor?.name ?? t("page.honors.bondsDetailTitle")}
            size="md"
            headerActions={headerActions}
        >
            {bondsHonor ? (
                <div className="space-y-5">
                    <div className="flex justify-center">
                        <div ref={previewRef} className="w-full max-w-[380px]">
                            <BondsDegreeImage
                                bondsHonor={bondsHonor}
                                gameCharaUnits={gameCharaUnits}
                                bondsHonorWordAssetbundleName={defaultWord?.assetbundleName}
                                viewType="normal"
                                honorLevel={bondsHonor.levels.length > 0 ? bondsHonor.levels[0].level : undefined}
                                source={source}
                            />
                        </div>
                    </div>

                    <div className="space-y-0">
                        <InfoRow label="ID" value={String(bondsHonor.id)} />
                        <InfoRow label={t("common.field.name")} value={bondsHonor.name} />
                        <InfoRow label={t("common.field.rarity")} value={t(`common.honor.rarities.${bondsHonor.honorRarity}`) === `common.honor.rarities.${bondsHonor.honorRarity}` ? bondsHonor.honorRarity : t(`common.honor.rarities.${bondsHonor.honorRarity}`)} />
                        {gcu1 && (
                            <InfoRow label={t("common.filter.character1")} value={getCharacterName(t, gcu1.gameCharacterId)} />
                        )}
                        {gcu2 && (
                            <InfoRow label={t("common.filter.character2")} value={getCharacterName(t, gcu2.gameCharacterId)} />
                        )}
                    </div>

                    {bondsHonor.levels.length > 0 && (
                        <div>
                            <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.levelDetails")}</h3>
                            <div className="space-y-3">
                                {bondsHonor.levels.map(level => (
                                    <div key={level.level} className="space-y-2 rounded-md3-md bg-surface-container p-4">
                                        <div className="flex items-center justify-between">
                                            <span className="type-label-l text-primary">Lv.{level.level}</span>
                                        </div>
                                        {level.description && (
                                            <p className="type-body-m text-on-surface-variant">{level.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {bondsHonorWords.filter(w => w.bondsGroupId === bondsHonor.bondsGroupId).length > 0 && (
                        <div>
                            <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.availableWords")}</h3>
                            <div className="space-y-2">
                                {bondsHonorWords
                                    .filter(w => w.bondsGroupId === bondsHonor.bondsGroupId)
                                    .map(word => (
                                        <div key={word.id} className="rounded-md3-md bg-surface-container p-3">
                                            <p className="type-body-m text-on-surface">{word.name}</p>
                                            {word.description && (
                                                <p className="mt-1 type-body-s text-on-surface-variant">{word.description}</p>
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
