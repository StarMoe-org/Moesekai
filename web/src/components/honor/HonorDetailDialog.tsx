"use client";
import React, { useRef, useState } from "react";
import Modal from "@/components/common/Modal";
import { SegmentedButton } from "@/components/md3";
import { IHonorInfo, IHonorGroup } from "@/types/honor";
import DegreeImage from "./DegreeImage";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { useSvgPreviewActions } from "@/hooks/useSvgPreviewActions";
import { useCharacterHonorStyles } from "@/hooks/useCharacterHonorStyles";
import { characterHonorStyleOptions } from "@/lib/character-honor-styles";
import { useI18n } from "@/contexts/I18nContext";

type HonorBadgeVariant = "main" | "sub";

/** The background and word picked for a character honor group; kept while browsing its rarities. */
interface PickedStyle {
    groupId: number;
    backgroundId?: number;
    wordId?: number;
}

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
    const [badgeVariant, setBadgeVariant] = useState<HonorBadgeVariant>("main");
    const isSub = badgeVariant === "sub";
    const previewRef = useRef<HTMLDivElement>(null);

    // Character honors combine a background style with a word, each unlocked by character rank.
    // Not gated on `open`: the tables are cached, and the preview keeps its pick while closing.
    const isCharacter = honorGroup?.honorType === "character";
    const honorStyles = useCharacterHonorStyles(undefined, isCharacter);
    const styleOptions = honor && isCharacter && honorStyles ? characterHonorStyleOptions(honorStyles, honor.groupId) : null;
    const [picked, setPicked] = useState<PickedStyle | null>(null);
    const pickedHere = picked && honor && picked.groupId === honor.groupId ? picked : null;
    const background = styleOptions?.backgrounds.find((row) => row.id === pickedHere?.backgroundId) ?? styleOptions?.backgrounds[0];
    const word = styleOptions?.words.find((row) => row.id === pickedHere?.wordId) ?? styleOptions?.words[0];
    const pick = (change: Omit<PickedStyle, "groupId">) => {
        if (!honor) return;
        setPicked({ groupId: honor.groupId, backgroundId: background?.id, wordId: word?.id, ...change });
    };
    const styleSuffix = background && word ? `_${background.seq}${isSub ? "" : `-${word.seq}`}` : "";

    const { headerActions, errorMessage } = useSvgPreviewActions({
        isOpen: open,
        previewRef,
        fileName: honor ? `${honor.name}_${honor.id}${styleSuffix}${isSub ? "_sub" : ""}` : "honor",
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
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex min-h-[80px] w-full items-center justify-center">
                            <div ref={previewRef} className={isSub ? "w-full max-w-[180px]" : "w-full max-w-[380px]"}>
                                <DegreeImage
                                    honor={honor}
                                    honorGroup={honorGroup}
                                    honorLevel={honor.levels.length > 0 ? honor.levels[0].level : undefined}
                                    sub={isSub}
                                    source={source}
                                    honorBackgroundId={background?.id}
                                    honorWordId={word?.id}
                                />
                            </div>
                        </div>
                        <SegmentedButton<HonorBadgeVariant>
                            density={-1}
                            className="w-auto min-w-[12rem]"
                            aria-label={t("page.honors.badgeVariant.label")}
                            value={badgeVariant}
                            onValueChange={setBadgeVariant}
                            options={[
                                { value: "main", label: t("page.honors.badgeVariant.main") },
                                { value: "sub", label: t("page.honors.badgeVariant.sub") },
                            ]}
                        />
                        {styleOptions && background && styleOptions.backgrounds.length > 1 && (
                            <StylePicker
                                label={t("page.honors.characterStyle.background")}
                                options={styleOptions.backgrounds}
                                selected={background}
                                onSelect={(id) => pick({ backgroundId: id })}
                            />
                        )}
                        {/* The sub honor shows the background only */}
                        {styleOptions && word && !isSub && styleOptions.words.length > 1 && (
                            <StylePicker
                                label={t("page.honors.characterStyle.word")}
                                options={styleOptions.words}
                                selected={word}
                                onSelect={(id) => pick({ wordId: id })}
                            />
                        )}
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
                                            <div className={isSub ? "mt-2 max-w-[180px]" : "mt-2 max-w-[380px]"}>
                                                <DegreeImage
                                                    honor={{ ...honor, assetbundleName: level.assetbundleName }}
                                                    honorGroup={honorGroup}
                                                    honorLevel={level.level}
                                                    sub={isSub}
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

/** One of a character honor's choices (background or word), with what unlocks the picked one. */
function StylePicker({
    label,
    options,
    selected,
    onSelect,
}: {
    label: string;
    options: { id: number; name: string; description: string }[];
    selected: { id: number; description: string };
    onSelect: (id: number) => void;
}) {
    return (
        <div className="w-full max-w-[380px] space-y-1.5">
            <div className="type-label-m text-on-surface-variant">{label}</div>
            <SegmentedButton<string>
                density={-1}
                aria-label={label}
                value={String(selected.id)}
                onValueChange={(value) => onSelect(Number(value))}
                options={options.map((row) => ({ value: String(row.id), label: row.name }))}
            />
            {selected.description && (
                <p className="type-body-s text-on-surface-variant">{selected.description}</p>
            )}
        </div>
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
