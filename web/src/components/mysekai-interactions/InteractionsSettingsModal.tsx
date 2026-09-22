"use client";

import React, { useState } from "react";
import Modal from "@/components/common/Modal";
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
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 sm:gap-2 overflow-x-auto pb-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("general")}
                        className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                            activeTab === "general"
                                ? "bg-miku/10 text-miku font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                    >
                        {t("page.mysekaiWorkspace.settingsTabGeneral")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("weather")}
                        className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "weather"
                                ? "bg-miku/10 text-miku font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                    >
                        {t("page.mysekaiWorkspace.settingsTabWeather")}
                        {live?.weather && (
                            <span className="w-1.5 h-1.5 rounded-full bg-miku animate-pulse" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("playerData")}
                        className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                            activeTab === "playerData"
                                ? "bg-miku/10 text-miku font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                    >
                        {t("page.mysekaiWorkspace.settingsTabPlayerData")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("storage")}
                        className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                            activeTab === "storage"
                                ? "bg-miku/10 text-miku font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                    >
                        {t("page.mysekaiWorkspace.settingsTabStorage")}
                    </button>
                </div>

                {/* Tab: General */}
                {activeTab === "general" && (
                    <div className="flex flex-col gap-4 text-sm">
                        {/* Server selection */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 dark:text-slate-100">
                                    {t("page.mysekaiInteractions.source")}
                                </span>
                                {snapshot && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded font-mono">
                                        {snapshot.region.toUpperCase()} · {snapshot.version}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {servers.map(server => (
                                    <button
                                        key={server}
                                        type="button"
                                        disabled={closing}
                                        onClick={() => onSourceChange(server)}
                                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                                            source === server
                                                ? "bg-miku text-white border-miku shadow-sm font-bold"
                                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-miku/60"
                                        }`}
                                    >
                                        {t(`common.server.${server}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sound Toggle */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-4">
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                                    {t("page.mysekaiWorkspace.soundTitle")}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {t("page.mysekaiWorkspace.soundDesc")}
                                </p>
                            </div>
                            <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 p-0.5 bg-slate-200/50 dark:bg-slate-700/50 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => onSoundChange(true)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                        soundEnabled
                                            ? "bg-white dark:bg-slate-800 text-miku shadow-xs font-bold"
                                            : "text-slate-600 dark:text-slate-400"
                                    }`}
                                >
                                    {t("page.mysekaiWorkspace.soundOn")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSoundChange(false)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                        !soundEnabled
                                            ? "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs font-bold"
                                            : "text-slate-600 dark:text-slate-400"
                                    }`}
                                >
                                    {t("page.mysekaiWorkspace.soundOff")}
                                </button>
                            </div>
                        </div>

                        {/* Mode Toggle */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                                    {t("page.mysekaiWorkspace.sceneMode")}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {mode === "independent"
                                        ? t("page.mysekaiWorkspace.modeIndependentDesc")
                                        : t("page.mysekaiWorkspace.modeCurrentDesc")}
                                </p>
                            </div>
                            <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 p-0.5 bg-slate-200/50 dark:bg-slate-700/50 shrink-0">
                                <button
                                    type="button"
                                    disabled={closing}
                                    onClick={() => onModeChange("independent")}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                        mode === "independent"
                                            ? "bg-white dark:bg-slate-800 text-miku shadow-xs font-bold"
                                            : "text-slate-600 dark:text-slate-400"
                                    }`}
                                >
                                    {t("page.mysekaiInteractions.mode.independent")}
                                </button>
                                <button
                                    type="button"
                                    disabled={closing}
                                    onClick={() => onModeChange("current")}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                        mode === "current"
                                            ? "bg-white dark:bg-slate-800 text-miku shadow-xs font-bold"
                                            : "text-slate-600 dark:text-slate-400"
                                    }`}
                                >
                                    {t("page.mysekaiInteractions.mode.current")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Weather */}
                {activeTab === "weather" && (
                    <div className="flex flex-col gap-3">
                        {live?.weather && onSetWeather ? (
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                                <WeatherControl
                                    weather={live.weather}
                                    disabled={closing}
                                    choose={onSetWeather}
                                />
                            </div>
                        ) : (
                            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm">
                                <p className="font-semibold mb-1">
                                    {t("page.mysekaiWorkspace.weatherNeedsActiveScene")}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">
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
                            <div className="p-6 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-sm">
                                <p className="font-semibold mb-2">
                                    {t("page.mysekaiWorkspace.importNeedsScene")}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                                    {t("page.mysekaiWorkspace.importNeedsSceneDesc")}
                                </p>
                            </div>
                        ) : snapshot && onSendPlayerData && onExplorePlayerData ? (
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
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
                    <div className="flex flex-col gap-4 text-sm">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-3">
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                                    {t("page.mysekaiInteractions.cache.title")}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {t("page.mysekaiWorkspace.cacheManagerDesc")}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2.5 pt-2">
                                <button
                                    type="button"
                                    disabled={cacheClearing || closing || sessionActive}
                                    onClick={handleClearCache}
                                    className="px-3.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/40 dark:text-red-400 font-semibold text-xs transition-colors border border-red-200 dark:border-red-900/50 disabled:opacity-50"
                                >
                                    {cacheClearing
                                        ? t("common.state.loading")
                                        : cacheCleared
                                        ? t("page.mysekaiInteractions.cache.cleared")
                                        : t("page.mysekaiInteractions.cache.clear")}
                                </button>
                                <LocalizedLink
                                    href={`/mysekai/interactions/resources/?${new URLSearchParams({
                                        region: source,
                                        ...(snapshot ? { snapshot: snapshot.id } : {}),
                                    })}`}
                                    className="px-3.5 py-2 rounded-lg bg-slate-200/70 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 font-semibold text-xs transition-colors"
                                >
                                    {t("page.mysekaiInteractions.r4b.manageResources")} →
                                </LocalizedLink>
                            </div>
                            {sessionActive && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
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
