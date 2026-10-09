"use client";

import { Button, ErrorState, IconButton, LoadingIndicator, SegmentedButton, Slider, Switch, TextField, cn } from "@/components/md3";
import { mdPlayArrow, mdRefresh, mdShare } from "@/components/md3/icons";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import type { VocalRemovalState } from "@/lib/guess-music/practice-api";
import { createSeed } from "@/lib/guess-music/random";
import {
    ANSWER_MODES,
    CLIP_LENGTHS,
    MAX_STRIKES,
    difficultyMultiplier,
    type AnswerMode,
    type ClipSeconds,
} from "@/lib/guess-music/scoring";
import {
    OPTION_COUNTS,
    PRESET_IDS,
    ROUND_COUNTS,
    SERVER_SCOPES,
    TIME_LIMIT_MAX,
    TIME_LIMIT_MIN,
    TIME_LIMIT_STEP,
    applyPreset,
    clampTimeLimit,
    type FreePlaySettings,
    type PresetId,
    type ServerScope,
} from "@/lib/guess-music/settings";

export interface FreePlaySetupProps {
    settings: FreePlaySettings;
    preset: PresetId;
    onChange: (settings: FreePlaySettings, preset: PresetId) => void;
    /** Whether the server can remove vocals for the chosen server's songs right now. */
    vocalRemoval: VocalRemovalState;
    songCount: number | null;
    loading: boolean;
    failed: boolean;
    /** Why the game cannot start, if it cannot. */
    startError: string | null;
    onRetry: () => void;
    onStart: () => void;
    onShare: () => void;
}

function Field({
    label,
    htmlFor,
    hint,
    className,
    children,
}: {
    label: string;
    htmlFor?: string;
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("space-y-2", className)}>
            {htmlFor ? (
                <label htmlFor={htmlFor} className="block type-title-s text-on-surface">{label}</label>
            ) : (
                <span className="block type-title-s text-on-surface">{label}</span>
            )}
            {children}
            {hint && <p className="type-body-s text-on-surface-variant">{hint}</p>}
        </div>
    );
}

/** Free-play settings: difficulty preset and its three dimensions, questions per game, server, time limit, seed and the rules. */
export default function FreePlaySetup({
    settings,
    preset,
    onChange,
    vocalRemoval,
    songCount,
    loading,
    failed,
    startError,
    onRetry,
    onStart,
    onShare,
}: FreePlaySetupProps) {
    const { t } = useI18n();
    /** Any change to a difficulty dimension makes the preset custom. */
    const setDimension = (patch: Partial<FreePlaySettings>) => onChange({ ...settings, ...patch }, "custom");
    const setOther = (patch: Partial<FreePlaySettings>) => onChange({ ...settings, ...patch }, preset);
    const vocalRemovalReady = vocalRemoval === "ready";
    const removeVocals = settings.vocalRemoval && (vocalRemovalReady || vocalRemoval === "loading");
    const multiplier = difficultyMultiplier({
        clipSeconds: settings.clipSeconds,
        answerMode: settings.answerMode,
        vocalRemovalApplied: removeVocals,
    });
    const vocalRemovalHint =
        vocalRemoval === "ready"
            ? t("page.guessMusic.setup.vocalRemovalHint")
            : vocalRemoval === "loading"
              ? t("page.guessMusic.setup.vocalRemovalChecking")
              : vocalRemoval === "serverUnsupported"
                ? t("page.guessMusic.setup.vocalRemovalServerUnsupported")
                : t("page.guessMusic.setup.vocalRemovalUnavailable");

    return (
        <div className="space-y-4">
            <section className="space-y-6 rounded-md3-xl bg-surface-container-low p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="type-title-l text-on-surface">{t("page.guessMusic.setup.difficulty")}</h2>
                    <span className="inline-flex h-8 items-center gap-1 rounded-md3-sm bg-tertiary-container px-3 type-label-l text-on-tertiary-container">
                        {t("page.guessMusic.setup.multiplier")}
                        <span className="tabular-nums">{t("page.guessMusic.setup.multiplierValue", { value: multiplier.toFixed(2) })}</span>
                    </span>
                </div>
                <SegmentedButton
                    aria-label={t("page.guessMusic.setup.difficulty")}
                    className="[&>button]:px-1 sm:[&>button]:px-3"
                    value={preset}
                    onValueChange={(next: PresetId) => onChange(applyPreset(settings, next), next)}
                    // Hell is the vocal-removal preset: it waits for the instrumentals like the switch below.
                    options={PRESET_IDS.map((id) => ({ value: id, label: t(`page.guessMusic.setup.presets.${id}`), disabled: id === "hell" && !vocalRemovalReady }))}
                />
                <Field label={t("page.guessMusic.setup.clipLength")}>
                    <SegmentedButton
                        aria-label={t("page.guessMusic.setup.clipLength")}
                        value={String(settings.clipSeconds)}
                        onValueChange={(value) => setDimension({ clipSeconds: Number(value) as ClipSeconds })}
                        options={CLIP_LENGTHS.map((seconds) => ({ value: String(seconds), label: t("page.guessMusic.setup.seconds", { seconds }) }))}
                    />
                </Field>
                <Field label={t("page.guessMusic.setup.answerMode")} hint={t(`page.guessMusic.setup.modeHints.${settings.answerMode}`)}>
                    <SegmentedButton
                        aria-label={t("page.guessMusic.setup.answerMode")}
                        value={settings.answerMode}
                        onValueChange={(answerMode: AnswerMode) => setDimension({ answerMode })}
                        options={ANSWER_MODES.map((mode) => ({ value: mode, label: t(`page.guessMusic.setup.modes.${mode}`) }))}
                    />
                </Field>
                {settings.answerMode === "choice" && (
                    <Field label={t("page.guessMusic.setup.options")}>
                        <SegmentedButton
                            aria-label={t("page.guessMusic.setup.options")}
                            value={String(settings.optionsCount)}
                            onValueChange={(value) => setDimension({ optionsCount: Number(value) })}
                            options={OPTION_COUNTS.map((count) => ({ value: String(count), label: t("page.guessMusic.setup.optionCount", { count }) }))}
                        />
                    </Field>
                )}
                <Switch
                    checked={removeVocals}
                    onCheckedChange={(checked) => setDimension({ vocalRemoval: checked })}
                    disabled={!vocalRemovalReady}
                    label={t("page.guessMusic.setup.vocalRemoval")}
                    description={vocalRemovalHint}
                />
            </section>

            <section className="space-y-6 rounded-md3-xl bg-surface-container-low p-4 sm:p-6">
                <h2 className="type-title-l text-on-surface">{t("page.guessMusic.setup.match")}</h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Field label={t("page.guessMusic.setup.rounds")}>
                        <SegmentedButton
                            aria-label={t("page.guessMusic.setup.rounds")}
                            value={String(settings.rounds)}
                            onValueChange={(value) => setOther({ rounds: Number(value) })}
                            options={ROUND_COUNTS.map((count) => ({ value: String(count), label: t("page.guessMusic.setup.roundCount", { count }) }))}
                        />
                    </Field>
                    <Field label={t("page.guessMusic.setup.server")}>
                        <SegmentedButton
                            aria-label={t("page.guessMusic.setup.server")}
                            value={settings.server}
                            onValueChange={(server: ServerScope) => setOther({ server })}
                            options={SERVER_SCOPES.map((server) => ({ value: server, label: <ServerRegionLabel server={server} /> }))}
                        />
                    </Field>
                    <Field label={t("page.guessMusic.setup.timeLimit")} className="sm:col-span-2">
                        <div className="flex items-center gap-3">
                            <Slider
                                value={settings.timeLimit}
                                onValueChange={(value) => setOther({ timeLimit: clampTimeLimit(value) })}
                                min={TIME_LIMIT_MIN}
                                max={TIME_LIMIT_MAX}
                                step={TIME_LIMIT_STEP}
                                showValue
                                formatValue={(value) => t("page.guessMusic.setup.seconds", { seconds: value })}
                                aria-label={t("page.guessMusic.setup.timeLimit")}
                            />
                            <span className="w-14 shrink-0 text-right type-label-l tabular-nums text-on-surface">
                                {t("page.guessMusic.setup.seconds", { seconds: settings.timeLimit })}
                            </span>
                        </div>
                    </Field>
                </div>
                <Field label={t("page.guessMusic.setup.seed")} htmlFor="guess-music-seed" hint={t("page.guessMusic.setup.seedHint")}>
                    <div className="flex gap-2">
                        <TextField
                            id="guess-music-seed"
                            value={settings.seed}
                            onValueChange={(seed) => setOther({ seed: seed.slice(0, 32) })}
                            className="min-w-0 flex-1 font-mono"
                            autoComplete="off"
                            spellCheck={false}
                            trailing={
                                <IconButton
                                    icon={mdRefresh}
                                    size="xs"
                                    className="mr-1"
                                    label={t("page.guessMusic.setup.regenerateSeed")}
                                    onClick={() => setOther({ seed: createSeed() })}
                                />
                            }
                        />
                        <Button variant="tonal" icon={mdShare} onClick={onShare}>
                            {t("page.guessMusic.setup.share")}
                        </Button>
                    </div>
                </Field>
            </section>

            <section className="rounded-md3-xl bg-surface-container p-4 sm:p-6">
                <h2 className="mb-2 type-title-m text-on-surface">{t("page.guessMusic.setup.rulesTitle")}</h2>
                <ul className="list-disc space-y-1 pl-5 type-body-m text-on-surface-variant marker:text-primary">
                    <li>{t("page.guessMusic.setup.rules.rounds", { rounds: settings.rounds })}</li>
                    <li>{t("page.guessMusic.setup.rules.timer")}</li>
                    <li>{t("page.guessMusic.setup.rules.strikes", { strikes: MAX_STRIKES })}</li>
                    <li>{t("page.guessMusic.setup.rules.combo")}</li>
                    <li>{t("page.guessMusic.setup.rules.seed")}</li>
                </ul>
            </section>

            {failed ? (
                <ErrorState title={t("page.guessMusic.setup.loadFailed")} retryLabel={t("page.guessMusic.setup.retry")} onRetry={onRetry} />
            ) : (
                <div className="space-y-2">
                    <Button variant="filled" size="m" fullWidth icon={loading ? undefined : mdPlayArrow} onClick={onStart} disabled={loading || Boolean(startError)}>
                        {loading ? (
                            <>
                                <LoadingIndicator size={24} aria-label={t("page.guessMusic.setup.loading")} />
                                {t("page.guessMusic.setup.loading")}
                            </>
                        ) : (
                            t("page.guessMusic.setup.start")
                        )}
                    </Button>
                    <p className="text-center type-body-s text-on-surface-variant">
                        {startError ??
                            (songCount === null
                                ? " "
                                : removeVocals
                                  ? t("page.guessMusic.setup.songCountVocalRemoval", { count: songCount })
                                  : t("page.guessMusic.setup.songCount", { count: songCount }))}
                    </p>
                </div>
            )}
        </div>
    );
}
