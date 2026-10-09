"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/md3";
import { mdContentCopy, mdRefresh, mdReplay, mdTune } from "@/components/md3/icons";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { correctCount, maxCombo, type GameState } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/library";
import type { FreePlaySettings, PresetId } from "@/lib/guess-music/settings";
import ResultList from "./ResultList";

export interface FreePlayResultsProps {
    state: GameState;
    settings: FreePlaySettings;
    preset: PresetId;
    library: SongLibrary;
    assetSource: AssetSourceType;
    shareUrl: string;
    onCopyLink: () => void;
    onReplay: () => void;
    onNewGame: () => void;
    onBackToSetup: () => void;
}

/** Final score, the game's settings with a share link and QR code, and every round. */
export default function FreePlayResults({
    state,
    settings,
    preset,
    library,
    assetSource,
    shareUrl,
    onCopyLink,
    onReplay,
    onNewGame,
    onBackToSetup,
}: FreePlayResultsProps) {
    const { t } = useI18n();
    const [qr, setQr] = useState<{ url: string; image: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!shareUrl) return;
        QRCode.toDataURL(shareUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(
            (image) => {
                if (!cancelled) setQr({ url: shareUrl, image });
            },
            () => undefined,
        );
        return () => {
            cancelled = true;
        };
    }, [shareUrl]);

    const config = state.config;
    const summary: Array<[string, React.ReactNode]> = [
        [t("page.guessMusic.results.difficulty"), t(`page.guessMusic.setup.presets.${preset}`)],
        [t("page.guessMusic.setup.rounds"), t("page.guessMusic.setup.roundCount", { count: state.rounds.length })],
        [t("page.guessMusic.results.clip"), t("page.guessMusic.setup.seconds", { seconds: config.clipSeconds })],
        [
            t("page.guessMusic.results.mode"),
            config.answerMode === "choice"
                ? t("page.guessMusic.results.choiceMode", { count: settings.optionsCount })
                : t(`page.guessMusic.setup.modes.${config.answerMode}`),
        ],
        [t("page.guessMusic.results.vocalRemoval"), config.vocalRemoval ? t("page.guessMusic.results.on") : t("page.guessMusic.results.off")],
        [t("page.guessMusic.results.timeLimit"), t("page.guessMusic.setup.seconds", { seconds: config.timeLimit })],
        [t("page.guessMusic.results.server"), <ServerRegionLabel key="server" server={settings.server} size={18} />],
        [t("page.guessMusic.results.seed"), <code key="seed" className="font-mono">{settings.seed}</code>],
    ];

    return (
        <div className="space-y-4">
            <section className="rounded-md3-xl bg-surface-container-low p-5 text-center sm:p-8">
                <h2 className="type-headline-s text-on-surface">{t("page.guessMusic.results.title")}</h2>
                <p className="mt-4 type-title-m text-on-surface-variant">{t("page.guessMusic.results.finalScore")}</p>
                <div className="type-display-l tabular-nums text-primary">{state.score}</div>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <span className="inline-flex h-8 items-center rounded-md3-sm bg-secondary-container px-3 type-label-l text-on-secondary-container">
                        {t("page.guessMusic.results.correctCount", { correct: correctCount(state.results), total: state.rounds.length })}
                    </span>
                    <span className="inline-flex h-8 items-center rounded-md3-sm bg-secondary-container px-3 type-label-l text-on-secondary-container">
                        {t("page.guessMusic.results.maxCombo", { combo: maxCombo(state.results) })}
                    </span>
                </div>

                <div className="mt-6 flex flex-col items-center gap-6 rounded-md3-lg bg-surface-container p-4 text-left sm:flex-row sm:justify-center sm:p-6">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 type-body-m">
                        {summary.map(([label, value]) => (
                            <div key={label} className="contents">
                                <dt className="text-on-surface-variant">{label}</dt>
                                <dd className="min-w-0 text-on-surface">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="flex flex-col items-center gap-2">
                        {/* The QR code is always dark on light, whatever the theme. */}
                        <div data-theme="light" className="h-32 w-32 rounded-md3-md bg-surface-container-lowest p-2">
                            {qr?.url === shareUrl && <img src={qr.image} alt={t("page.guessMusic.results.qrAlt")} className="h-full w-full" />}
                        </div>
                        <span className="type-label-m text-on-surface-variant">{t("page.guessMusic.results.scanToChallenge")}</span>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button variant="tonal" icon={mdContentCopy} onClick={onCopyLink}>
                        {t("page.guessMusic.results.copyLink")}
                    </Button>
                    <Button variant="outlined" icon={mdReplay} onClick={onReplay}>
                        {t("page.guessMusic.results.replaySeed")}
                    </Button>
                    <Button variant="outlined" icon={mdTune} onClick={onBackToSetup}>
                        {t("page.guessMusic.results.backToSetup")}
                    </Button>
                    <Button variant="filled" icon={mdRefresh} onClick={onNewGame}>
                        {t("page.guessMusic.results.playAgain")}
                    </Button>
                </div>
            </section>

            <ResultList library={library} results={state.results} assetSource={assetSource} />
        </div>
    );
}
