"use client";

import React, { useState } from "react";
import Modal from "@/components/common/Modal";
import { Button, Chip, Icon, SegmentedButton, Tabs, buttonClassName } from "@/components/md3";
import { mdArrowForward, mdDelete } from "@/components/md3/icons";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import type { ServerSourceType } from "@/contexts/ThemeContext";
import type {
    MolyPlayerDataCommand,
    MolyPlayerDataState,
    MolySnapshot,
} from "@/lib/moly/contract";
import type { ResourceSnapshot } from "@/lib/moly/catalog";
import PlayerDataPanel from "./PlayerDataPanel";
import WeatherControl from "./WeatherControl";
import { resourceCacheCommand } from "@/lib/moly/resourceCache";
import LocalizedLink from "@/components/LocalizedLink";

interface InteractionsSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    source: string;
    onSourceChange: (server: string) => void;
    servers: ServerSourceType[];
    soundEnabled: boolean;
    onSoundChange: (enabled: boolean) => void;
    mode: "independent" | "current";
    onModeChange: (mode: "independent" | "current") => void;
    snapshot?: ResourceSnapshot;
    live: MolySnapshot | null;
    sessionActive: boolean;
    closing: boolean;
    onSetWeather?: (id: number) => void;
    playerData: MolyPlayerDataState | null;
    onSendPlayerData?: (value: MolyPlayerDataCommand) => void;
    onExplorePlayerData?: () => void;
}

type SettingsTab = "general" | "weather" | "playerData" | "storage";

export default function InteractionsSettingsModal({
    isOpen,
    onClose,
    source,
    onSourceChange,
    servers,
    soundEnabled,
    onSoundChange,
    mode,
    onModeChange,
    snapshot,
    live,
    sessionActive,
    closing,
    onSetWeather,
    playerData,
    onSendPlayerData,
    onExplorePlayerData,
}: InteractionsSettingsModalProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<SettingsTab>("general");
    const [cacheClearing, setCacheClearing] = useState(false);
    const [cacheCleared, setCacheCleared] = useState(false);

    const handleClearCache = async () => {
        try {
            setCacheClearing(true);
            await resourceCacheCommand("clear");
            setCacheCleared(true);
            setTimeout(() => setCacheCleared(false), 3000);
        } catch (e) {
            console.error("Failed to clear cache", e);
        } finally {
            setCacheClearing(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.mysekaiWorkspace.settingsModalTitle")}
            size="lg"
        >
            <div className="flex flex-col gap-5">
                {/* Navigation Tabs */}
                <Tabs<SettingsTab>
                    scrollable
                    variant="secondary"
                    value={activeTab}
                    onValueChange={setActiveTab}
                    items={[
                        { value: "general", label: t("page.mysekaiWorkspace.settingsTabGeneral") },
                        {
                            value: "weather",
                            label: t("page.mysekaiWorkspace.settingsTabWeather"),
                            badge: live?.weather ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> : undefined,
                        },
                        { value: "playerData", label: t("page.mysekaiWorkspace.settingsTabPlayerData") },
                        { value: "storage", label: t("page.mysekaiWorkspace.settingsTabStorage") },
                    ]}
                />

                {/* Tab: General */}
                {activeTab === "general" && (
                    <div className="flex flex-col gap-4 type-body-m">
                        {/* Server selection */}
                        <div className="p-4 rounded-md3-lg bg-surface-container flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className="type-title-s text-on-surface">
                                    {t("page.mysekaiInteractions.source")}
                                </span>
                                {snapshot && (
                                    <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 font-mono type-label-m text-on-surface-variant">
                                        <ServerRegionLabel server={snapshot.region} size={16} /> · {snapshot.version}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {servers.map(server => (
                                    <Chip
                                        key={server}
                                        disabled={closing}
                                        selected={source === server}
                                        onClick={() => onSourceChange(server)}
                                    >
                                        <ServerRegionLabel server={server} />
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        {/* Sound Toggle */}
                        <div className="p-4 rounded-md3-lg bg-surface-container flex items-center justify-between gap-4">
                            <div>
                                <h4 className="type-title-s text-on-surface">
                                    {t("page.mysekaiWorkspace.soundTitle")}
                                </h4>
                                <p className="mt-0.5 type-body-s text-on-surface-variant">
                                    {t("page.mysekaiWorkspace.soundDesc")}
                                </p>
                            </div>
                            <SegmentedButton
                                className="w-auto shrink-0"
                                density={-1}
                                value={soundEnabled ? "on" : "off"}
                                onValueChange={(v) => onSoundChange(v === "on")}
                                options={[
                                    { value: "on", label: t("page.mysekaiWorkspace.soundOn") },
                                    { value: "off", label: t("page.mysekaiWorkspace.soundOff") },
                                ]}
                            />
                        </div>

                        {/* Mode Toggle */}
                        <div className="p-4 rounded-md3-lg bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h4 className="type-title-s text-on-surface">
                                    {t("page.mysekaiWorkspace.sceneMode")}
                                </h4>
                                <p className="mt-0.5 type-body-s text-on-surface-variant">
                                    {mode === "independent"
                                        ? t("page.mysekaiWorkspace.modeIndependentDesc")
                                        : t("page.mysekaiWorkspace.modeCurrentDesc")}
                                </p>
                            </div>
                            <SegmentedButton
                                className="w-auto shrink-0"
                                density={-1}
                                value={mode}
                                onValueChange={onModeChange}
                                options={[
                                    { value: "independent", label: t("page.mysekaiInteractions.mode.independent"), disabled: closing },
                                    { value: "current", label: t("page.mysekaiInteractions.mode.current"), disabled: closing },
                                ]}
                            />
                        </div>
                    </div>
                )}

                {/* Tab: Weather */}
                {activeTab === "weather" && (
                    <div className="flex flex-col gap-3">
                        {live?.weather && onSetWeather ? (
                            <div className="p-4 rounded-md3-lg bg-surface-container">
                                <WeatherControl
                                    weather={live.weather}
                                    disabled={closing}
                                    choose={onSetWeather}
                                />
                            </div>
                        ) : (
                            <div className="rounded-md3-lg border border-dashed border-outline-variant p-8 text-center type-body-m text-on-surface-variant">
                                <p className="mb-1 type-title-s">
                                    {t("page.mysekaiWorkspace.weatherNeedsActiveScene")}
                                </p>
                                <p className="type-body-s text-on-surface-variant">
                                    {t("page.mysekaiWorkspace.weatherNeedsActiveSceneDesc")}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Player Data */}
                {activeTab === "playerData" && (
                    <div className="flex flex-col gap-3">
                        {!sessionActive ? (
                            <div className="rounded-md3-lg bg-surface-container p-6 text-center type-body-m text-on-surface-variant">
                                <p className="mb-2 type-title-s">
                                    {t("page.mysekaiWorkspace.importNeedsScene")}
                                </p>
                                <p className="mx-auto max-w-md type-body-s text-on-surface-variant">
                                    {t("page.mysekaiWorkspace.importNeedsSceneDesc")}
                                </p>
                            </div>
                        ) : snapshot && onSendPlayerData && onExplorePlayerData ? (
                            <div className="p-4 rounded-md3-lg bg-surface-container">
                                <PlayerDataPanel
                                    key={snapshot.id}
                                    region={snapshot.region}
                                    ready={Boolean(live?.ready && live.scene?.ready)}
                                    blocked={Boolean(live?.status.activeKey || closing)}
                                    value={playerData}
                                    send={onSendPlayerData}
                                    onExplore={onExplorePlayerData}
                                />
                            </div>
                        ) : null}
                    </div>
                )}

                {/* Tab: Storage & Cache */}
                {activeTab === "storage" && (
                    <div className="flex flex-col gap-4 type-body-m">
                        <div className="p-4 rounded-md3-lg bg-surface-container flex flex-col gap-3">
                            <div>
                                <h4 className="type-title-s text-on-surface">
                                    {t("page.mysekaiInteractions.cache.title")}
                                </h4>
                                <p className="mt-1 type-body-s text-on-surface-variant">
                                    {t("page.mysekaiWorkspace.cacheManagerDesc")}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2.5 pt-2">
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    color="error"
                                    icon={mdDelete}
                                    disabled={cacheClearing || closing || sessionActive}
                                    onClick={handleClearCache}
                                >
                                    {cacheClearing
                                        ? t("common.state.loading")
                                        : cacheCleared
                                        ? t("page.mysekaiInteractions.cache.cleared")
                                        : t("page.mysekaiInteractions.cache.clear")}
                                </Button>
                                <LocalizedLink
                                    href={`/mysekai/interactions/resources/?${new URLSearchParams({
                                        region: source,
                                        ...(snapshot ? { snapshot: snapshot.id } : {}),
                                    })}`}
                                    className={buttonClassName({ variant: "outlined", size: "xs" })}
                                >
                                    {t("page.mysekaiInteractions.r4b.manageResources")}
                                    <Icon path={mdArrowForward} size={18} />
                                </LocalizedLink>
                            </div>
                            {sessionActive && (
                                <p className="mt-1 type-body-s text-tertiary">
                                    {t("page.mysekaiWorkspace.clearCacheWarningActive")}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
