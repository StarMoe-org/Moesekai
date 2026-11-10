"use client";

import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import { Banner, Button, LinearProgress, PageContainer, PageHeader, SectionCard, SegmentedButton, Select, TextField } from "@/components/md3";
import { mdCalculate, mdBolt, mdTune } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { FIRE_OPTIONS } from "@/lib/deck-comparator/calculator";
import { fetchMusicMetas } from "@/lib/fetch";
import { calculatePtRange, defaultPtForm, normalizePtSkills, readPtForm, validatePtForm, writePtForm, type LiveMode, type PtFormState } from "@/lib/pt-calculator/calculator";
import { getPtSong, PT_DIFFICULTIES, type PtMusicMeta } from "@/lib/pt-calculator/songs";

export default function PtCalculatorClient() {
    const { t, formatNumber } = useI18n();
    const [form, setForm] = useState<PtFormState>(defaultPtForm);
    const [result, setResult] = useState<ReturnType<typeof calculatePtRange>>(null);
    const [error, setError] = useState<ReturnType<typeof validatePtForm>>(null);
    const [musicData, setMusicData] = useState<{ metas: PtMusicMeta[]; status: "loading" | "ready" | "error" }>({ metas: [], status: "loading" });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchMusicMetas(retryCount > 0)
            .then((metas) => { if (!cancelled) setMusicData({ metas, status: "ready" }); })
            .catch(() => { if (!cancelled) setMusicData({ metas: [], status: "error" }); });
        return () => { cancelled = true; };
    }, [retryCount]);

    useEffect(() => {
        const restore = () => {
            setForm(readPtForm(new URLSearchParams(window.location.search)));
            setResult(null);
            setError(null);
        };
        const frame = requestAnimationFrame(restore);
        window.addEventListener("popstate", restore);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("popstate", restore);
        };
    }, []);

    const update = (patch: Partial<PtFormState>) => {
        const next = normalizePtSkills({ ...form, ...patch });
        setForm(next);
        setResult(null);
        setError(null);
        const url = new URL(window.location.href);
        writePtForm(url.searchParams, next);
        window.history.replaceState(window.history.state, "", url.toString());
    };
    const updateSkill = (index: number, value: string) => {
        const skills = [...form.skills];
        skills[index] = value;
        update({ skills });
    };
    const changeMode = (mode: LiveMode) => update({ mode, skills: defaultPtForm(mode).skills });
    const song = useMemo(() => {
        const meta = musicData.metas.find((item) => String(item.music_id) === form.song && item.difficulty === form.difficulty);
        return meta ? getPtSong(meta, form.mode) : null;
    }, [musicData.metas, form.song, form.difficulty, form.mode]);
    const calculate = () => {
        if (!song) return;
        const validationError = validatePtForm(form);
        setError(validationError);
        setResult(validationError ? null : calculatePtRange(song, form));
    };
    const range = (min: number, max: number) => min === max ? formatNumber(min) : `${formatNumber(min)} ~ ${formatNumber(max)}`;
    const skillError = (index: number) => Boolean(error && (
        !form.skills[index].trim() || !Number.isFinite(Number(form.skills[index]))
        || Number(form.skills[index]) < 10 || Number(form.skills[index]) > 288
    ));

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <PageHeader
                    eyebrow={t("page.ptCalculator.badge")}
                    title={t("page.ptCalculator.title")}
                    highlight={t("page.ptCalculator.titleHighlight")}
                />
                <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); calculate(); }}>
                    <SectionCard title={t("page.ptCalculator.parameters")} icon={mdTune}>
                        <div className="space-y-5">
                            <SegmentedButton<LiveMode>
                                aria-label={t("page.ptCalculator.mode")}
                                value={form.mode} onValueChange={changeMode}
                                options={[{ value: "multi", label: t("page.ptCalculator.multi") }, { value: "solo", label: t("page.ptCalculator.solo") }]}
                            />
                            <MusicSelector selectedMusicId={form.song} onSelect={(song) => update({ song })}
                                recommendMode="event" liveType={form.mode} showRequiredIndicator={false} />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Select label={t("page.ptCalculator.difficulty")} value={form.difficulty} onValueChange={(difficulty) => update({ difficulty })}
                                    options={PT_DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: t(`page.deckComparator.difficulties.${difficulty}`) }))} />
                                <Select label={t("page.ptCalculator.fires")} value={form.fires} onValueChange={(fires) => update({ fires })}
                                    options={FIRE_OPTIONS.map((option) => ({ value: option.fires, label: t("page.ptCalculator.fireOption", { count: option.fires, rate: option.rate }) }))} />
                            </div>
                            {musicData.status === "loading" && <LinearProgress aria-label={t("common.state.loading")} />}
                            {musicData.status === "error" && <Banner tone="error" action={
                                <Button variant="text" onClick={() => {
                                    setMusicData({ metas: [], status: "loading" });
                                    setRetryCount((count) => count + 1);
                                }}>{t("common.action.retry")}</Button>
                            }>{t("page.ptCalculator.dataLoadFailed")}</Banner>}
                            {musicData.status === "ready" && !song && <Banner tone="warning">{t("page.ptCalculator.noMeta")}</Banner>}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <TextField label={t("page.ptCalculator.power")} type="text" inputMode="numeric" aria-required="true"
                                    value={form.power} onValueChange={(power) => update({ power })}
                                    error={error === "incomplete" && !form.power.trim()}
                                    errorText={error === "invalidPower" ? t("page.ptCalculator.invalidPower") : undefined} />
                                <TextField label={t("page.ptCalculator.bonus")} type="text" inputMode="decimal" suffixText="%" aria-required="true"
                                    value={form.bonus} onValueChange={(bonus) => update({ bonus })}
                                    error={error === "incomplete" && !form.bonus.trim()}
                                    errorText={error === "invalidBonus" ? t("page.ptCalculator.invalidBonus") : undefined} />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title={t("page.ptCalculator.skills")} icon={mdBolt}>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            {[0, 1, 2, 3, 4].map((index) => (
                                <TextField key={index} label={t("page.ptCalculator.skillSlot", { index: index + 1 })} type="text" inputMode="decimal" suffixText="%" aria-required="true"
                                    value={form.skills[index]} onValueChange={(value) => updateSkill(index, value)}
                                    error={skillError(index)} />
                            ))}
                            <TextField label={t(form.mode === "solo" ? "page.ptCalculator.leaderEncore" : "page.ptCalculator.encore")} type="text" inputMode="decimal" suffixText="%" aria-required={form.mode === "multi"}
                                value={form.skills[5]} disabled={form.mode === "solo"} onValueChange={(value) => updateSkill(5, value)}
                                error={skillError(5)} />
                        </div>
                        {error === "invalidSkills" && <p role="alert" className="mt-3 type-body-s text-error">{t("page.ptCalculator.invalidSkills")}</p>}
                    </SectionCard>

                    {error === "incomplete" && <Banner tone="error">{t("page.ptCalculator.incomplete")}</Banner>}
                    {!result && <div className="flex sm:justify-end">
                        <Button type="submit" size="m" icon={mdCalculate} className="w-full sm:w-auto sm:min-w-56" disabled={musicData.status !== "ready" || !song}>
                            {t("page.ptCalculator.calculate")}
                        </Button>
                    </div>}
                </form>

                <div aria-live="polite" aria-atomic="true" className="mt-6">
                    {result && <SectionCard title={t("page.ptCalculator.results")} icon={mdCalculate}>
                        <dl className="grid gap-4 sm:grid-cols-2">
                            <div className="min-w-0 rounded-md3-lg bg-primary-container p-5 text-on-primary-container">
                                <dt className="type-label-l">{t("page.ptCalculator.pt")}</dt>
                                <dd className="mt-2 break-words type-headline-s tabular-nums">{range(result.ptMin, result.ptMax)}</dd>
                            </div>
                            <div className="min-w-0 rounded-md3-lg bg-surface-container p-5 text-on-surface">
                                <dt className="type-label-l text-on-surface-variant">{t("page.ptCalculator.score")}</dt>
                                <dd className="mt-2 break-words type-title-l tabular-nums">{range(result.scoreMin, result.scoreMax)}</dd>
                            </div>
                        </dl>
                    </SectionCard>}
                </div>
            </PageContainer>
        </MainLayout>
    );
}
