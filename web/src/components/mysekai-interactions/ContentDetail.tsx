"use client";

import { useId } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyEntry, MolyTab } from "@/lib/moly/contract";
import type { ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";

interface Props {
    entry: MolyEntry;
    snapshot: ResourceSnapshot;
    detailLoading: boolean;
    detailFailed: boolean;
    canPlay: boolean;
    preparing: boolean;
    reason: "source_unavailable" | "scene_unavailable" | null;
    playing: boolean;
    replacing: boolean;
    restoring: boolean;
    play(): void;
    preview(): void;
    previewing: boolean;
    share(): void;
    retry(): void;
    related(fixture: number, tab: MolyTab): void;
    character(id: number): void;
    fixture(id: number): void;
}

/** A readable source document first. The scene is an explicit, separate action. */
export default function ContentDetail({ entry, snapshot, detailLoading, detailFailed, canPlay, preparing, reason, playing,
    replacing, restoring, play, preview, previewing, share, retry, related, character, fixture }: Props) {
    const { t } = useI18n();
    const headingId = useId();
    const silent = entry.presentation.textMode === "none" && entry.presentation.category !== "furniture";
    const bubble = entry.presentation.textMode === "bubble";
    const action = playing ? "replay" : replacing ? "replace" : entry.presentation.primaryAction === "inspect" ? "inspectScene" : "playScene";
    return <section className="interaction-detail workspace-content-detail" aria-labelledby={headingId} data-selected-content={entry.key}>
        <div className="workspace-detail-heading">
            <span className="workspace-overline">{t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}
                {entry.variant && entry.variant.count > 1 && <> · {t("page.mysekaiInteractions.variant", entry.variant)}</>}</span>
            <h2 id={headingId}>{entry.title}</h2>
        </div>
        <ContentArtwork entry={entry} snapshot={snapshot} large character={character} fixture={fixture} />
        <div className="workspace-detail-actions">
            <button className="interaction-button interaction-primary" disabled={!canPlay || restoring} onClick={play} data-action="play-selected">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M6 3.8a.7.7 0 0 1 1.04-.61l9 5.5a.7.7 0 0 1 0 1.22l-9 5.5A.7.7 0 0 1 6 14.8v-11Z" /></svg>
                {preparing ? t("page.mysekaiWorkspace.preparing") : previewing ? t("page.mysekaiInteractions.r4b.engage")
                    : t(`${playing || replacing ? "page.mysekaiInteractions" : "page.mysekaiWorkspace"}.${action}`)}
            </button>
            <button className="interaction-button" onClick={share}>{t("common.action.share")}</button>
        </div>
        {reason && <p className="workspace-inline-notice" role="status">{t(`page.mysekaiInteractions.${reason === "scene_unavailable" ? "sceneUnavailable" : "unavailable"}`)}</p>}
        {!reason && !playing && !preparing && <p className="workspace-inline-note">{t("page.mysekaiWorkspace.explicitDownload")}</p>}
        {detailLoading && <div className="workspace-transcript-skeleton" role="status"><span>{t("common.state.loading")}</span><i /><i /><i /></div>}
        {detailFailed && <div className="workspace-inline-notice" role="alert">{t("page.mysekaiInteractions.detailFailed")} <button className="interaction-text-button" onClick={retry}>{t("common.action.retry")}</button></div>}
        {!detailLoading && Boolean(entry.lines?.length) && <section className={`workspace-transcript${bubble ? " workspace-transcript-bubble" : ""}`} aria-label={t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}>
            <div className="workspace-section-title"><h3>{t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}</h3><span>{entry.lines?.length}</span></div>
            {entry.lines?.map((line, index) => <div className="workspace-transcript-line" key={index}>
                <span className="workspace-line-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{line.speaker}</strong><p>{line.text}</p></div>
            </div>)}
        </section>}
        {silent && !detailLoading && <div className="workspace-silent-activity"><h3>{t("page.mysekaiInteractions.noDialogue")}</h3>
            <p>{entry.description || t("page.mysekaiWorkspace.silentActivity")}</p>
            <span>{t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}</span></div>}
        {entry.description && !silent && entry.description !== entry.title && <p className="workspace-flavor">{entry.description}</p>}
        {entry.preview && <details className="workspace-source-record workspace-source-preview">
            <summary>{t("page.mysekaiInteractions.r4b.previewSource")}</summary>
            {entry.preview.available ? <><p className="workspace-source-tweet">{entry.preview.text}</p>
                <button className="interaction-button" disabled={!canPlay || restoring || previewing} onClick={preview} data-action="preview-bubble">{t("page.mysekaiInteractions.r4b.previewBubble")}</button></>
                : <p>{t("page.mysekaiInteractions.r4b.previewUnavailable")}</p>}
        </details>}
        {Boolean(entry.fixtures?.length) && <section className="workspace-related-section">
            <h3>{t("page.mysekaiInteractions.fixtureDetails")}</h3>
            {entry.fixtures?.map(item => <button key={item.id} onClick={() => fixture(item.id)} className="workspace-related-row"><span>{item.name}</span><span aria-hidden="true">›</span></button>)}
        </section>}
        {Boolean(entry.related?.length) && <div className="workspace-related-chips">
            {entry.related?.map(item => <button key={`${item.tab}:${item.fixtureId}`} className="interaction-chip" onClick={() => related(item.fixtureId, item.tab)}>
                {t(`page.mysekaiInteractions.tabs.${item.tab}`)} <span>{item.count}</span>
            </button>)}
        </div>}
        <details className="workspace-source-record"><summary>{t("page.mysekaiWorkspace.sourceRecord")}</summary>
            <p>{t("page.mysekaiWorkspace.authoredSource", { region: snapshot.region.toUpperCase(), version: snapshot.version })}</p><code>{entry.key}</code>
        </details>
    </section>;
}
