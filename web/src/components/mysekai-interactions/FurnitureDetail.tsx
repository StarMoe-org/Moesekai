"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { getMysekaiFixtureThumbnailUrl, getMysekaiMaterialThumbnailUrl } from "@/lib/assets";
import { getMysekaiGenreDisplayName, getMysekaiTagDisplayName } from "@/lib/mysekai-i18n";
import { mysekaiDatabaseHref } from "@/lib/mysekai-source";
import { useFurnitureMaterials, type FurnitureData, type FixtureRelations } from "@/lib/moly/furnitureData";
import type { ResourceSnapshot } from "@/lib/moly/catalog";
import type { MolyEntry, MolyKey, MolyTab } from "@/lib/moly/contract";
import type { IMysekaiFixtureInfo } from "@/types/mysekai";
import SdPortrait from "./SdPortrait";
import ContentArtwork from "./ContentArtwork";
import FurnitureThumbnail from "./FurnitureThumbnail";

interface Props {
    fixture: IMysekaiFixtureInfo;
    data: FurnitureData;
    snapshot?: ResourceSnapshot;
    runtimeEntry?: MolyEntry;
    artworkPending: boolean;
    relation?: FixtureRelations;
    assetSource: Parameters<typeof getMysekaiFixtureThumbnailUrl>[1];
    canPlay: boolean;
    preparing: boolean;
    play(): void;
    select(key: MolyKey): void;
    related(fixture: number, tab: MolyTab): void;
    character(id: number): void;
    share(): void;
}

export default function FurnitureDetail({ fixture, data, snapshot, runtimeEntry, artworkPending, relation, assetSource, canPlay, preparing,
    play, select, related, character, share }: Props) {
    const { t } = useI18n();
    const [retry, setRetry] = useState(0);
    const materials = useFurnitureMaterials(data.region, true, retry);
    const blueprint = materials.data?.blueprints.find(row => row.mysekaiCraftType === "mysekai_fixture" && row.craftTargetId === fixture.id);
    const costs = materials.data?.costs.filter(row => row.mysekaiBlueprintId === blueprint?.id).sort((a, b) => a.seq - b.seq) ?? [];
    const tags = new Set(Object.entries(fixture.mysekaiFixtureTagGroup ?? {}).filter(([key]) => key !== "id").map(([, value]) => value));
    const genre = data.genres.find(row => row.id === fixture.mysekaiFixtureMainGenreId);
    const subGenre = data.subGenres.find(row => row.id === fixture.mysekaiFixtureSubGenreId);
    const records = [
        [t("page.mysekai.detail.fields.size"), `${fixture.gridSize.width} × ${fixture.gridSize.depth} × ${fixture.gridSize.height}`],
        [t("page.mysekai.detail.fields.canAssemble"), t(`page.mysekaiWorkspace.${fixture.isAssembled ? "yes" : "no"}`)],
        [t("page.mysekai.detail.fields.canDisassemble"), t(`page.mysekaiWorkspace.${fixture.isDisassembled ? "yes" : "no"}`)],
    ];
    return <section className="workspace-fixture-detail" data-selected-content={`fixture:${fixture.id}`} aria-labelledby="workspace-fixture-title">
        <div className="workspace-detail-art">
            <FurnitureThumbnail snapshot={snapshot} image={runtimeEntry?.image} pending={artworkPending}
                fallback={getMysekaiFixtureThumbnailUrl(fixture.assetbundleName, assetSource, fixture.mysekaiFixtureMainGenreId)} alt={fixture.name}
                width={300} height={240} priority />
            <span className="workspace-fixture-id">#{fixture.id}</span>
        </div>
        <div className="workspace-detail-heading">
            <span className="workspace-overline">{[genre?.name, subGenre?.name].filter(Boolean).map(name => getMysekaiGenreDisplayName(name!, t)).join(" / ")}</span>
            <h2 id="workspace-fixture-title"><TranslatedText original={fixture.name} category="mysekai" field="fixtureName" translationClassName="workspace-translation" /></h2>
            {fixture.flavorText && fixture.flavorText !== fixture.name && <p className="workspace-flavor">{fixture.flavorText}</p>}
        </div>
        <div className="workspace-detail-actions">
            <button className="interaction-button interaction-primary" data-action="play-selected" disabled={!canPlay || preparing} onClick={play}>
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Z M3 6l7 4 7-4 M10 10v8" /></svg>
                {t(`page.mysekaiWorkspace.${preparing ? "preparing" : "inspectScene"}`)}
            </button>
            <button className="interaction-button" onClick={share}>{t("common.action.share")}</button>
        </div>
        {!snapshot?.available || !runtimeEntry?.available ? <p className="workspace-inline-note">{t("page.mysekaiWorkspace.readingAvailable")}</p>
            : <p className="workspace-inline-note">{t("page.mysekaiWorkspace.explicitDownload")}</p>}
        <dl className="workspace-facts">{records.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="workspace-tags">{data.tags.filter(tag => tags.has(tag.id) && tag.name !== fixture.name)
            .map(tag => <span key={tag.id}>{getMysekaiTagDisplayName(tag.name, t)}</span>)}</div>
        {snapshot && relation && relation.characters.length > 0 && <section className="workspace-related-cast">
            <h3>{t("page.mysekaiWorkspace.participants")}</h3>
            <div className="workspace-cast-grid">{relation.characters.map(person => <button key={person.id} onClick={() => character(person.id)} className="workspace-person" title={person.name}>
                <SdPortrait snapshot={snapshot} unit={person.id} name={person.name} size={58} /><span>{person.name}</span>
            </button>)}</div>
        </section>}
        {snapshot && relation && ([{ tab: "performances" as const, entries: relation.talks }, { tab: "activities" as const, entries: relation.activities }]).map(group => group.entries.length > 0 && <section className="workspace-related-section" key={group.tab}>
            <div className="workspace-section-title"><h3>{t(`page.mysekaiWorkspace.${group.tab === "performances" ? "conversations" : "activities"}`)} <span>{group.entries.length}</span></h3>
                <button className="interaction-text-button" onClick={() => related(fixture.id, group.tab)}>{t("page.mysekaiWorkspace.seeAll")}</button></div>
            <div className="workspace-related-list">{group.entries.slice(0, 4).map(entry => <button key={entry.key} onClick={() => select(entry.key)} data-related-key={entry.key}>
                <ContentArtwork entry={entry} snapshot={snapshot} />
                <span><strong>{entry.title}</strong><small>{entry.characters.map(person => person.name).join(" · ")}</small></span><span aria-hidden="true">›</span>
            </button>)}</div>
        </section>)}
        <section className="workspace-materials">
            <h3>{t("page.mysekai.detail.materialCost")}</h3>
            {materials.failed ? <p className="workspace-inline-notice">{t("common.state.loadingFailed")} <button className="interaction-text-button" onClick={() => setRetry(value => value + 1)}>{t("common.action.retry")}</button></p>
                : !materials.data ? <p className="workspace-inline-note" role="status">{t("common.state.loading")}</p>
                    : !costs.length ? <p className="workspace-inline-note">{t("page.mysekaiWorkspace.noRecipe")}</p>
                        : <div className="workspace-material-grid">{costs.map(cost => {
                            const material = materials.data?.materials.find(row => row.id === cost.mysekaiMaterialId);
                            return <div key={cost.id}>{material && <Image src={getMysekaiMaterialThumbnailUrl(material.iconAssetbundleName, assetSource)} alt="" width={44} height={44} unoptimized />}
                                <span><strong>{material?.name ?? `#${cost.mysekaiMaterialId}`}</strong><small>× {cost.quantity}</small></span></div>;
                        })}</div>}
        </section>
        <details className="workspace-source-record">
            <summary>{t("page.mysekaiWorkspace.sourceRecord")}</summary>
            <p>{t("page.mysekaiWorkspace.databaseSource", { region: data.region.toUpperCase() })}</p>
            {snapshot && <p>{t("page.mysekaiWorkspace.authoredSource", { region: snapshot.region.toUpperCase(), version: snapshot.version })}</p>}
            <dl className="workspace-facts">
                <div><dt>{t("page.mysekai.detail.fields.type")}</dt><dd>{fixture.mysekaiFixtureType}</dd></div>
                <div><dt>{t("page.mysekai.detail.fields.layoutType")}</dt><dd>{fixture.mysekaiSettableLayoutType}</dd></div>
                <div><dt>{t("page.mysekai.detail.fields.siteType")}</dt><dd>{fixture.mysekaiSettableSiteType}</dd></div>
                <div><dt>{t("page.mysekai.detail.fields.assetBundleName")}</dt><dd>{fixture.assetbundleName}</dd></div>
            </dl>
            <Link className="interaction-text-button" href={mysekaiDatabaseHref(data.region, fixture.id)}>{t("page.mysekaiWorkspace.permanentPage")} ↗</Link>
        </details>
    </section>;
}
