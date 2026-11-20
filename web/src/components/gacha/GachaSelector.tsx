"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { IGachaInfo, ICardInfo, GACHA_TYPE_LABEL_KEYS } from "@/types/types";
import { getGachaLogoUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import { fetchMasterDataForServer, type ServerSourceType } from "@/lib/fetch";
import GachaSelectorModal from "@/components/gacha/GachaSelectorModal";
import { Icon } from "@/components/md3";
import { mdCasino, mdUnfoldMore } from "@/components/md3/icons";

export interface GachaSelectorProps {
    selectedGachaId: number | string | null;
    onSelect: (gacha: IGachaInfo) => void;
    gachas?: IGachaInfo[];
    cards?: ICardInfo[];
    server?: ServerSourceType;
    placeholder?: string;
    modalTitle?: string;
}

export default function GachaSelector({
    selectedGachaId,
    onSelect,
    gachas: propGachas,
    cards: propCards,
    server = "jp",
    placeholder,
    modalTitle,
}: GachaSelectorProps) {
    const { assetSource } = useTheme();
    const { t, formatDate } = useI18n();
    const [modalOpen, setModalOpen] = useState(false);
    const [fetchedGachas, setFetchedGachas] = useState<IGachaInfo[]>([]);
    const [failedLogo, setFailedLogo] = useState<string | null>(null);

    const gachas = propGachas && propGachas.length > 0 ? propGachas : fetchedGachas;

    useEffect(() => {
        if (propGachas && propGachas.length > 0) return;
        let active = true;
        fetchMasterDataForServer<IGachaInfo[]>(server, "gachas.json")
            .then((data) => {
                if (active) setFetchedGachas(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [propGachas, server]);

    const selectedGacha = useMemo(() => {
        if (selectedGachaId === null || selectedGachaId === "") return null;
        const numId = typeof selectedGachaId === "number" ? selectedGachaId : parseInt(selectedGachaId, 10);
        if (Number.isNaN(numId)) return null;
        return gachas.find((g) => g.id === numId) || null;
    }, [gachas, selectedGachaId]);

    const logoUrl = selectedGacha ? getGachaLogoUrl(selectedGacha.assetbundleName, assetSource) : "";
    const typeLabelKey = selectedGacha ? GACHA_TYPE_LABEL_KEYS[selectedGacha.gachaType] : undefined;
    const typeLabel = selectedGacha ? (typeLabelKey ? t(typeLabelKey) : selectedGacha.gachaType) : "";

    return (
        <div>
            <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="state-layer focus-ring w-full rounded-md3-lg border border-outline-variant bg-surface-container-low p-2.5 sm:p-3 text-left transition-colors hover:border-outline flex items-center gap-2.5 sm:gap-3 group"
            >
                {selectedGacha ? (
                    <>
                        <div className="relative w-16 sm:w-20 aspect-video rounded-md3-sm overflow-hidden bg-surface-container-high shrink-0">
                            {failedLogo === logoUrl ? (
                                <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
                                    <Icon path={mdCasino} size={22} />
                                </div>
                            ) : (
                                <Image
                                    src={logoUrl}
                                    alt={selectedGacha.name}
                                    fill
                                    className="object-contain p-1"
                                    unoptimized
                                    onError={() => setFailedLogo(logoUrl)}
                                />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
                                <span className="type-label-s font-mono text-on-surface-variant bg-surface-container-high px-1.5 rounded-md3-xs shrink-0">
                                    #{selectedGacha.id}
                                </span>
                                <span className="type-label-s bg-tertiary-container text-on-tertiary-container px-1.5 rounded-md3-xs truncate">
                                    {typeLabel}
                                </span>
                                <span className="hidden sm:inline type-label-s text-on-surface-variant shrink-0">
                                    {formatDate(selectedGacha.startAt, {
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                    })}
                                </span>
                            </div>
                            <div className="type-title-s text-on-surface group-hover:text-primary transition-colors">
                                <TranslatedText
                                    original={selectedGacha.name}
                                    category="gacha"
                                    field="name"
                                    originalClassName="block truncate"
                                    translationClassName="type-body-s text-on-surface-variant block truncate"
                                />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-16 sm:w-20 aspect-video bg-surface-container-high rounded-md3-sm flex items-center justify-center text-on-surface-variant shrink-0">
                            <Icon path={mdCasino} size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="type-body-m text-on-surface-variant block truncate">
                                {placeholder || t("page.gachaSimulator.selector.placeholder")}
                            </span>
                        </div>
                    </>
                )}
                <Icon path={mdUnfoldMore} size={20} className="shrink-0 text-on-surface-variant" />
            </button>

            <GachaSelectorModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalTitle}
                gachas={gachas}
                cards={propCards}
                selectedGachaId={selectedGacha?.id ?? null}
                onSelectGacha={onSelect}
                server={server}
            />
        </div>
    );
}
