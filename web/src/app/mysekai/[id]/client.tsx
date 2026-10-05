"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import { Button, EmptyState, LoadingState, PageContainer, PageHeader, SectionCard } from "@/components/md3";
import { mdArrowBack, mdCheckCircle, mdForum, mdHistory, mdImage, mdInfo, mdInventory2, mdNotes, mdSell } from "@/components/md3/icons";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { useTheme, replaceAssetSourceRegion, type ServerSourceType } from "@/contexts/ThemeContext";
import FixtureCharacterEntries from "@/components/mysekai-interactions/FixtureCharacterEntries";
import InteractionEntryLink from "@/components/mysekai-interactions/InteractionEntryLink";
import { mysekaiSource, mysekaiDatabaseHref } from "@/lib/mysekai-source";

import { getMysekaiFixtureThumbnailUrl, getMysekaiMaterialThumbnailUrl } from "@/lib/assets";
import {
    IMysekaiFixtureInfo,
    IMysekaiFixtureGenre,
    IMysekaiFixtureSubGenre,
    IMysekaiFixtureTag,
    IMysekaiBlueprint,
    IMysekaiBlueprintMaterialCost,
    IMysekaiMaterial,
    IMysekaiCharacterTalkCondition,
    IMysekaiCharacterTalkConditionGroup,
    IMysekaiCharacterTalk,
    IMysekaiGameCharacterUnitGroup,
} from "@/types/mysekai";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { getMysekaiGenreDisplayName, getMysekaiTagDisplayName } from "@/lib/mysekai-i18n";

function MysekaiFixtureDetailContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const fixtureId = Number(params.id);
    const { assetSource: preferredAssetSource, serverSource } = useTheme();
    const sourceRegion = mysekaiSource(searchParams.get("region"), serverSource);
    const assetSource = replaceAssetSourceRegion(preferredAssetSource, sourceRegion ?? serverSource);
    const [dataSource, setDataSource] = useState<ServerSourceType | null>(null);
    const { setDetailName } = useBreadcrumb();
    const { t } = useI18n();

    const [fixture, setFixture] = useState<IMysekaiFixtureInfo | null>(null);
    const [genres, setGenres] = useState<IMysekaiFixtureGenre[]>([]);
    const [subGenres, setSubGenres] = useState<IMysekaiFixtureSubGenre[]>([]);
    const [tags, setTags] = useState<IMysekaiFixtureTag[]>([]);
    const [blueprints, setBlueprints] = useState<IMysekaiBlueprint[]>([]);
    const [materialCosts, setMaterialCosts] = useState<IMysekaiBlueprintMaterialCost[]>([]);
    const [materials, setMaterials] = useState<IMysekaiMaterial[]>([]);
    const [talkConditions, setTalkConditions] = useState<IMysekaiCharacterTalkCondition[]>([]);
    const [talkConditionGroups, setTalkConditionGroups] = useState<IMysekaiCharacterTalkConditionGroup[]>([]);
    const [talks, setTalks] = useState<IMysekaiCharacterTalk[]>([]);
    const [characterGroups, setCharacterGroups] = useState<IMysekaiGameCharacterUnitGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch data
    useEffect(() => {
        let cancelled = false;
        async function fetchData() {
            try {
                setIsLoading(true);
                setError(null);
                setFixture(null);
                if (!sourceRegion) throw new Error(t("page.mysekaiInteractions.sourceMismatch"));

                const [
                    fixturesData, genresData, subGenresData, tagsData,
                    blueprintsData, materialCostsData, materialsData,
                    talkConditionsData, talkConditionGroupsData, talksData, characterGroupsData
                ] = await Promise.all([
                    fetchMasterDataForServer<IMysekaiFixtureInfo[]>(sourceRegion, "mysekaiFixtures.json"),
                    fetchMasterDataForServer<IMysekaiFixtureGenre[]>(sourceRegion, "mysekaiFixtureMainGenres.json"),
                    fetchMasterDataForServer<IMysekaiFixtureSubGenre[]>(sourceRegion, "mysekaiFixtureSubGenres.json"),
                    fetchMasterDataForServer<IMysekaiFixtureTag[]>(sourceRegion, "mysekaiFixtureTags.json"),
                    fetchMasterDataForServer<IMysekaiBlueprint[]>(sourceRegion, "mysekaiBlueprints.json"),
                    fetchMasterDataForServer<IMysekaiBlueprintMaterialCost[]>(sourceRegion, "mysekaiBlueprintMysekaiMaterialCosts.json"),
                    fetchMasterDataForServer<IMysekaiMaterial[]>(sourceRegion, "mysekaiMaterials.json"),
                    fetchMasterDataForServer<IMysekaiCharacterTalkCondition[]>(sourceRegion, "mysekaiCharacterTalkConditions.json"),
                    fetchMasterDataForServer<IMysekaiCharacterTalkConditionGroup[]>(sourceRegion, "mysekaiCharacterTalkConditionGroups.json"),
                    fetchMasterDataForServer<IMysekaiCharacterTalk[]>(sourceRegion, "mysekaiCharacterTalks.json"),
                    fetchMasterDataForServer<IMysekaiGameCharacterUnitGroup[]>(sourceRegion, "mysekaiGameCharacterUnitGroups.json"),
                ]);

                if (cancelled) return;
                const foundFixture = fixturesData.find(f => f.id === fixtureId);
                if (!foundFixture) {
                    throw new Error(`Fixture ${fixtureId} not found`);
                }

                setFixture(foundFixture);
                document.title = `Moesekai - ${foundFixture.name}`;
                setGenres(genresData);
                setSubGenres(subGenresData);
                setTags(tagsData);
                setBlueprints(blueprintsData);
                setMaterialCosts(materialCostsData);
                setMaterials(materialsData);
                setTalkConditions(talkConditionsData);
                setTalkConditionGroups(talkConditionGroupsData);
                setTalks(talksData);
                setCharacterGroups(characterGroupsData);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                console.error("Error fetching fixture:", err);
                setError(err instanceof Error ? err.message : t("page.mysekai.unknownError"));
            } finally {
                if (!cancelled) {
                    setDataSource(sourceRegion);
                    setIsLoading(false);
                }
            }
        }
        if (Number.isFinite(fixtureId)) {
            fetchData();
        } else {
            setIsLoading(false);
        }
        return () => { cancelled = true; };
    }, [fixtureId, sourceRegion, t]);

    // Set breadcrumb detail name
    useEffect(() => {
        if (fixture) setDetailName(fixture.name);
    }, [fixture, setDetailName]);

    // Get genre name
    const genreName = useMemo(() => {
        if (!fixture) return "";
        const genre = genres.find(g => g.id === fixture.mysekaiFixtureMainGenreId);
        return genre ? getMysekaiGenreDisplayName(genre.name, t) : "";
    }, [fixture, genres, t]);

    // Get sub genre name
    const subGenreName = useMemo(() => {
        if (!fixture || !fixture.mysekaiFixtureSubGenreId) return "";
        const subGenre = subGenres.find(sg => sg.id === fixture.mysekaiFixtureSubGenreId);
        return subGenre ? getMysekaiGenreDisplayName(subGenre.name, t) : "";
    }, [fixture, subGenres, t]);

    // Get tag names (deduplicated and excluding tags that match fixture name)
    const tagNames = useMemo(() => {
        if (!fixture || !fixture.mysekaiFixtureTagGroup) return [];
        const names: string[] = [];
        Object.entries(fixture.mysekaiFixtureTagGroup).forEach(([key, val]) => {
            if (key !== 'id' && val) {
                const tag = tags.find(t => t.id === val);
                if (tag && tag.name !== fixture.name) {
                    names.push(getMysekaiTagDisplayName(tag.name, t));
                }
            }
        });
        // Deduplicate tag names
        return [...new Set(names)];
    }, [fixture, tags, t]);

    // Get material costs for this fixture
    const fixtureMaterialCosts = useMemo(() => {
        if (!fixture) return [];
        // Find blueprint for this fixture
        const blueprint = blueprints.find(
            b => b.mysekaiCraftType === 'mysekai_fixture' && b.craftTargetId === fixture.id
        );
        if (!blueprint) return [];
        // Find material costs for this blueprint
        return materialCosts
            .filter(mc => mc.mysekaiBlueprintId === blueprint.id)
            .sort((a, b) => a.seq - b.seq);
    }, [fixture, blueprints, materialCosts]);

    // Get character talks for this fixture
    const fixtureCharacterTalks = useMemo(() => {
        if (!fixture) return [];

        // Find talk conditions that reference this fixture
        const fixtureConditions = talkConditions.filter(
            tc => tc.mysekaiCharacterTalkConditionType === 'mysekai_fixture_id' &&
                tc.mysekaiCharacterTalkConditionTypeValue === fixture.id
        );

        if (fixtureConditions.length === 0) return [];

        // Find condition group IDs (groupId) that contain these conditions
        // Each row in talkConditionGroups links a groupId to a mysekaiCharacterTalkConditionId
        const relevantGroupIds = new Set<number>();
        talkConditionGroups.forEach(row => {
            if (fixtureConditions.some(fc => fc.id === row.mysekaiCharacterTalkConditionId)) {
                relevantGroupIds.add(row.groupId);
            }
        });

        // Find talks that use these condition groups
        // The talk's mysekaiCharacterTalkConditionGroupId should match the groupId
        const relevantTalks = talks.filter(
            t => relevantGroupIds.has(t.mysekaiCharacterTalkConditionGroupId)
        );

        // Get character IDs for each talk (map unit-specific virtual singer IDs to base IDs)
        const talksWithCharacters = relevantTalks.map(talk => {
            const characterIds: number[] = [];
            if (talk.mysekaiGameCharacterUnitGroupId) {
                const group = characterGroups.find(g => g.id === talk.mysekaiGameCharacterUnitGroupId);
                if (group) {
                    [group.gameCharacterUnitId1, group.gameCharacterUnitId2, group.gameCharacterUnitId3,
                    group.gameCharacterUnitId4, group.gameCharacterUnitId5].forEach(id => {
                        if (id) characterIds.push(id);
                    });
                }
            }
            // Deduplicate and sort character IDs within each talk
            const uniqueSortedIds = [...new Set(characterIds)].sort((a, b) => a - b);
            return { ...talk, characterIds: uniqueSortedIds };
        }).filter(t => t.characterIds.length > 0);

        // Deduplicate talks with the same character combination
        const seenCombinations = new Set<string>();
        return talksWithCharacters.filter(talk => {
            const key = talk.characterIds.join(',');
            if (seenCombinations.has(key)) return false;
            seenCombinations.add(key);
            return true;
        });
    }, [fixture, talkConditions, talkConditionGroups, talks, characterGroups]);

    if (isLoading || dataSource !== sourceRegion) {
        return (
            <MainLayout>
                <PageContainer>
                    <LoadingState label={t("common.state.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    if (error || !fixture) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdHistory}
                        title={t("page.mysekai.notFoundTitle", { id: fixtureId })}
                        description={t("page.mysekai.notFoundDesc")}
                        action={
                            <Button
                                variant="filled"
                                icon={mdArrowBack}
                                href={mysekaiDatabaseHref(sourceRegion ?? serverSource, undefined, serverSource)}
                            >
                                {t("page.mysekai.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    const thumbnailUrl = getMysekaiFixtureThumbnailUrl(fixture.assetbundleName, assetSource, fixture.mysekaiFixtureMainGenreId);
    const gridSize = fixture.gridSize;

    return (
        <MainLayout>
            <PageContainer>
                {/* Header Section */}
                <PageHeader
                    eyebrow={
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md3-sm bg-surface-container-high px-3 py-1 font-mono type-label-m text-on-surface-variant">
                                ID: {fixture.id}
                            </span>
                            {genreName && (
                                <span className="rounded-md3-sm bg-secondary-container px-3 py-1 type-label-m text-on-secondary-container">
                                    {genreName}
                                </span>
                            )}
                        </span>
                    }
                    title={
                        <TranslatedText
                            original={fixture.name}
                            category="mysekai"
                            field="fixtureName"
                            originalClassName=""
                            translationClassName="block mt-1 type-title-m text-on-surface-variant"
                        />
                    }
                />

                {/* Main Content Grid - Image LEFT, Info RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* LEFT Column: Image - Smaller size */}
                    <div>
                        <SectionCard title={t("page.mysekai.detail.thumbnail")} icon={mdImage} className="lg:sticky lg:top-24" bodyClassName="p-0">
                            <div className="relative aspect-[4/3] bg-surface-container flex items-center justify-center">
                                <div className="relative w-32 h-32">
                                    <Image
                                        src={thumbnailUrl}
                                        alt={fixture.name}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                        priority
                                    />
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {dataSource && <InteractionEntryLink region={dataSource} fixtureId={fixture.id} />}
                        {/* Basic Info Card */}
                        <SectionCard title={t("page.mysekai.detail.basicInfo")} icon={mdInfo} bodyClassName="p-0 pb-2">
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label="ID" value={`#${fixture.id}`} />
                                <InfoRow
                                    label={t("common.field.name")}
                                    value={
                                        <TranslatedText
                                            original={fixture.name}
                                            category="mysekai"
                                            field="fixtureName"
                                            originalClassName=""
                                            translationClassName="block mt-0.5 type-body-s text-on-surface-variant"
                                        />
                                    }
                                />
                                <InfoRow label={t("page.mysekai.detail.fields.type")} value={fixture.mysekaiFixtureType} />
                                {genreName && <InfoRow label={t("page.mysekai.detail.fields.mainGenre")} value={genreName} />}
                                {subGenreName && <InfoRow label={t("page.mysekai.detail.fields.subGenre")} value={subGenreName} />}
                                {gridSize && gridSize.width > 0 && (
                                    <InfoRow
                                        label={t("page.mysekai.detail.fields.size")}
                                        value={`${gridSize.width} × ${gridSize.depth} × ${gridSize.height}`}
                                    />
                                )}
                                <InfoRow label={t("page.mysekai.detail.fields.layoutType")} value={fixture.mysekaiSettableLayoutType} />
                                <InfoRow label={t("page.mysekai.detail.fields.siteType")} value={fixture.mysekaiSettableSiteType} />
                                <InfoRow
                                    label={t("page.mysekai.detail.fields.assetBundleName")}
                                    value={<span className="rounded-md3-xs bg-surface-container-high px-2 py-0.5 font-mono type-body-s">{fixture.assetbundleName}</span>}
                                />
                            </div>
                        </SectionCard>

                        {/* Status Info Card */}
                        <SectionCard title={t("page.mysekai.detail.statusInfo")} icon={mdCheckCircle} bodyClassName="p-0 pb-2">
                            <div className="divide-y divide-outline-variant">
                                <InfoRow
                                    label={t("page.mysekai.detail.fields.canAssemble")}
                                    value={<YesNoBadge value={fixture.isAssembled} yes={t("common.field.yes")} no={t("common.field.no")} />}
                                />
                                <InfoRow
                                    label={t("page.mysekai.detail.fields.canDisassemble")}
                                    value={<YesNoBadge value={fixture.isDisassembled} yes={t("common.field.yes")} no={t("common.field.no")} />}
                                />
                                <InfoRow label={t("page.mysekai.detail.fields.seq")} value={fixture.seq} />
                            </div>
                        </SectionCard>

                        {/* Material Cost Card */}
                        {fixtureMaterialCosts.length > 0 && (
                            <SectionCard title={t("page.mysekai.detail.materialCost")} icon={mdInventory2}>
                                <div className="flex flex-wrap gap-4">
                                    {fixtureMaterialCosts.map((cost, index) => {
                                        const material = materials.find(m => m.id === cost.mysekaiMaterialId);
                                        if (!material) return null;
                                        return (
                                            <div key={index} className="flex flex-col items-center">
                                                <div className="w-16 h-16 relative bg-surface-container rounded-md3-sm p-1">
                                                    <Image
                                                        src={getMysekaiMaterialThumbnailUrl(material.iconAssetbundleName, assetSource)}
                                                        alt={material.name}
                                                        fill
                                                        className="object-contain"
                                                        unoptimized
                                                    />
                                                </div>
                                                <span className="mt-1 type-label-m text-on-surface-variant">
                                                    ×{cost.quantity}
                                                </span>
                                                <span className="max-w-[60px] truncate text-center type-label-s text-on-surface-variant" title={material.name}>
                                                    {material.name}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </SectionCard>
                        )}

                        {/* Character Talks Card */}
                        {fixtureCharacterTalks.length > 0 && (
                            <SectionCard title={t("page.mysekai.detail.characterTalks")} icon={mdForum}>
                                <FixtureCharacterEntries region={dataSource!} fixture={fixture.id} groups={fixtureCharacterTalks} />
                            </SectionCard>
                        )}

                        {/* Tags Card */}
                        {tagNames.length > 0 && (
                            <SectionCard title={t("page.mysekai.detail.tags")} icon={mdSell}>
                                <div className="flex flex-wrap gap-2">
                                    {tagNames.map((tagName, index) => (
                                        <span
                                            key={index}
                                            className="rounded-md3-sm bg-surface-container-high px-3 py-1 type-label-l text-on-surface-variant"
                                        >
                                            {tagName}
                                        </span>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Flavor Text Card */}
                        {fixture.flavorText && (
                            <SectionCard title={t("page.mysekai.detail.flavorText")} icon={mdNotes}>
                                <p className="type-body-m text-on-surface-variant">
                                    {fixture.flavorText}
                                </p>
                            </SectionCard>
                        )}

                        <DetailPageAdCard />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Button
                        variant="tonal"
                        icon={mdArrowBack}
                        href={mysekaiDatabaseHref(sourceRegion ?? serverSource, undefined, serverSource)}
                    >
                        {t("page.mysekai.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

export default function MysekaiFixtureDetailClient() {
    const { t } = useI18n();
    return <Suspense fallback={<MainLayout><LoadingState label={t("common.state.loading")} /></MainLayout>}><MysekaiFixtureDetailContent /></Suspense>;
}

function YesNoBadge({ value, yes, no }: { value: boolean; yes: string; no: string }) {
    return (
        <span className={`rounded-md3-xs px-2 py-0.5 type-label-m ${value ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}`}>
            {value ? yes : no}
        </span>
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between type-body-m">
            <span className="text-on-surface-variant">{label}</span>
            <span className="type-title-s text-on-surface text-right max-w-[60%]">{value}</span>
        </div>
    );
}
