"use client";

import { useId } from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyEntry, MolyTab } from "@/lib/moly/contract";
import { furnitureHref, type ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";

interface Props {
    entry: MolyEntry;
    snapshot: ResourceSnapshot;
    detailLoading: boolean;
    detailFailed: boolean;
    canPlay: boolean;
    reason: "source_unavailable" | "scene_unavailable" | null;
    playing: boolean;
    replacing: boolean;
    restoring: boolean;
    play(): void;
    share(): void;
    retry(): void;
    related(fixture: number, tab: MolyTab): void;
    character(id: number): void;
}

export default function ContentDetail({ entry, snapshot, detailLoading, detailFailed, canPlay, reason, playing, replacing, restoring, play, share, retry, related, character }: Props) {
    const { t } = useI18n();
    const headingId = useId();
    const action = playing ? "replay" : replacing ? "replace" : entry.presentation.primaryAction;
    const silent = entry.presentation.textMode === "none" && entry.presentation.category !== "furniture";
    const bubble = entry.presentation.textMode === "bubble";
    return <section className="interaction-detail" aria-labelledby={headingId} data-selected-content={entry.key}>
        <div className="interaction-detail-heading">
            <ContentArtwork entry={entry} snapshot={snapshot} large />
            <div>
                <span className="interaction-eyebrow">{t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}</span>
                <h2 id={headingId}>{entry.title}</h2>
                <span className="interaction-detail-source">{snapshot.region.toUpperCase()} · {snapshot.version}</span>
            </div>
        </div>
        <div className="interaction-tags">
            <span>{t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}</span>
            {entry.variant && entry.variant.count > 1 && <span>{t("page.mysekaiInteractions.variant", entry.variant)}</span>}
        </div>
        {entry.characters.length > 0 && <div className="interaction-characters" aria-label={t("page.mysekaiInteractions.characters")}>
            {entry.characters.map(person => <button key={person.id} className="interaction-chip" onClick={() => character(person.id)}>{person.name}</button>)}
        </div>}
        {(silent || bubble) && <div className="interaction-behavior-note">
            <strong>{t(`page.mysekaiInteractions.${bubble ? "bubble" : "noDialogue"}`)}</strong>
            {bubble && <p>{t("page.mysekaiInteractions.bubbleHint")}</p>}
        </div>}
        {entry.description && <p className="interaction-description">{entry.description}</p>}
        <div className="interaction-detail-actions">
            <button className="interaction-button interaction-primary" disabled={!canPlay || restoring} onClick={play} data-action="play-selected">
                {t(`page.mysekaiInteractions.${action}`)}
            </button>
            <button className="interaction-button" onClick={share}>{t("page.mysekaiInteractions.share")}</button>
        </div>
        {reason && <p className="interaction-unavailable" role="status">{t(`page.mysekaiInteractions.${reason === "scene_unavailable" ? "sceneUnavailable" : "unavailable"}`)}</p>}
        {detailLoading && <p className="interaction-muted" role="status">{t("page.mysekaiInteractions.loading")}</p>}
        {detailFailed && <p className="interaction-unavailable">{t("page.mysekaiInteractions.detailFailed")} <button className="interaction-text-button" onClick={retry}>{t("page.mysekaiInteractions.retry")}</button></p>}
        {!detailLoading && Boolean(entry.lines?.length) && <details className={`interaction-transcript${bubble ? " interaction-bubble-text" : ""}`} open={bubble}>
            <summary>{t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)} <span>{entry.lines?.length}</span></summary>
            <div>{entry.lines?.map((line, index) => <p key={index}><strong>{line.speaker}</strong><span>{line.text}</span></p>)}</div>
        </details>}
        {Boolean(entry.fixtures?.length) && <div className="interaction-related-fixtures">
            <h3>{t("page.mysekaiInteractions.fixtureDetails")}</h3>
            {entry.fixtures?.map(fixture => <Link key={fixture.id} href={furnitureHref(snapshot.region, fixture.id)} className="interaction-fixture-link">
                <span>{fixture.name}</span><span aria-hidden="true">↗</span>
            </Link>)}
        </div>}
        {Boolean(entry.related?.length) && <div className="interaction-related">
            <h3>{t("page.mysekaiInteractions.related")}</h3>
            {entry.related?.map(item => <button key={`${item.tab}:${item.fixtureId}`} className="interaction-chip" onClick={() => related(item.fixtureId, item.tab)}>
                {t(`page.mysekaiInteractions.tabs.${item.tab}`)} <span>{item.count}</span>
            </button>)}
        </div>}
    </section>;
}
