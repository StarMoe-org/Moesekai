"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
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
                <div className="container mx-auto px-4 py-16">
                    <div className="flex flex-col items-center justify-center min-h-[50vh]">
                        <div className="loading-spinner"></div>
                        <p className="mt-4 text-slate-500">{t("common.state.loading")}</p>
                    </div>
                </div>
            </MainLayout>
        );
    }

    if (error || !fixture) {
        return (
            <MainLayout>
                <div className="container mx-auto px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
                            <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t("page.mysekai.notFoundTitle", { id: fixtureId })}</h2>
                        <p className="text-slate-500 mb-6">{t("page.mysekai.notFoundDesc")}</p>
                        <Link
                            href={mysekaiDatabaseHref(sourceRegion ?? serverSource)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-miku text-white font-bold rounded-xl hover:bg-miku-dark transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            {t("page.mysekai.backToList")}
                        </Link>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const thumbnailUrl = getMysekaiFixtureThumbnailUrl(fixture.assetbundleName, assetSource, fixture.mysekaiFixtureMainGenreId);
    const gridSize = fixture.gridSize;

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-mono text-slate-500 w-fit">
                            ID: {fixture.id}
                        </span>
                        {genreName && (
                            <span className="px-3 py-1 text-xs font-bold rounded-full bg-miku/10 text-miku w-fit">
                                {genreName}
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800">
                        <TranslatedText
                            original={fixture.name}
                            category="mysekai"
                            field="fixtureName"
                            originalClassName=""
                            translationClassName="block text-lg font-medium text-slate-400 mt-1"
                        />
                    </h1>
                </div>

                {/* Main Content Grid - Image LEFT, Info RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* LEFT Column: Image - Smaller size */}
                    <div>
                        <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden lg:sticky lg:top-24">
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-600">{t("page.mysekai.detail.thumbnail")}</span>
                            </div>
                            <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
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
                        </div>
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {dataSource && <InteractionEntryLink region={dataSource} fixtureId={fixture.id} />}
                        {/* Basic Info Card */}
                        <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t("page.mysekai.detail.basicInfo")}
                                </h2>
                            </div>
                            <div className="divide-y divide-slate-100">
                                <InfoRow label="ID" value={`#${fixture.id}`} />
                                <InfoRow
                                    label={t("common.field.name")}
                                    value={
                                        <TranslatedText
                                            original={fixture.name}
                                            category="mysekai"
                                            field="fixtureName"
                                            originalClassName=""
                                            translationClassName="block text-xs font-normal text-slate-400 mt-0.5"
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
                                    value={<span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{fixture.assetbundleName}</span>}
                                />
                            </div>
                        </div>

                        {/* Status Info Card */}
                        <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t("page.mysekai.detail.statusInfo")}
                                </h2>
                            </div>
                            <div className="divide-y divide-slate-100">
                                <InfoRow
                                    label={t("page.mysekai.detail.fields.canAssemble")}
                                    value={
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${fixture.isAssembled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {fixture.isAssembled ? t("common.field.yes") : t("common.field.no")}
                                        </span>
                                    }
                                />
                                <InfoRow
                                    label={t("page.mysekai.detail.fields.canDisassemble")}
                                    value={
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${fixture.isDisassembled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {fixture.isDisassembled ? t("common.field.yes") : t("common.field.no")}
                                        </span>
                                    }
                                />
                                <InfoRow label={t("page.mysekai.detail.fields.seq")} value={fixture.seq} />
                            </div>
                        </div>

                        {/* Material Cost Card */}
                        {fixtureMaterialCosts.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-500/10 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        {t("page.mysekai.detail.materialCost")}
                                    </h2>
                                </div>
                                <div className="p-5">
                                    <div className="flex flex-wrap gap-4">
                                        {fixtureMaterialCosts.map((cost, index) => {
                                            const material = materials.find(m => m.id === cost.mysekaiMaterialId);
                                            if (!material) return null;
                                            return (
                                                <div key={index} className="flex flex-col items-center">
                                                    <div className="w-16 h-16 relative bg-slate-50 rounded-lg p-1">
                                                        <Image
                                                            src={getMysekaiMaterialThumbnailUrl(material.iconAssetbundleName, assetSource)}
                                                            alt={material.name}
                                                            fill
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    <span className="text-xs text-slate-600 mt-1 font-medium">
                                                        ×{cost.quantity}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 max-w-[60px] text-center truncate" title={material.name}>
                                                        {material.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Character Talks Card */}
                        {fixtureCharacterTalks.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-500/10 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                        {t("page.mysekai.detail.characterTalks")}
                                    </h2>
                                </div>
                                <div className="p-5">
                                    <FixtureCharacterEntries region={dataSource!} fixture={fixture.id} groups={fixtureCharacterTalks} />
                                </div>
                            </div>
                        )}

                        {/* Tags Card */}
                        {tagNames.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                        {t("page.mysekai.detail.tags")}
                                    </h2>
                                </div>
                                <div className="p-5">
                                    <div className="flex flex-wrap gap-2">
                                        {tagNames.map((tagName, index) => (
                                            <span
                                                key={index}
                                                className="px-3 py-1 bg-slate-100 text-slate-600 text-sm font-medium rounded-full"
                                            >
                                                {tagName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Flavor Text Card */}
                        {fixture.flavorText && (
                            <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                        </svg>
                                        {t("page.mysekai.detail.flavorText")}
                                    </h2>
                                </div>
                                <div className="p-5">
                                    <p className="text-slate-600 text-sm leading-relaxed">
                                        {fixture.flavorText}
                                    </p>
                                </div>
                            </div>
                        )}

                        <DetailPageAdCard />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Link
                        href={mysekaiDatabaseHref(sourceRegion ?? serverSource)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        {t("page.mysekai.backToList")}
                    </Link>
                </div>
            </div>
        </MainLayout>
    );
}

export default function MysekaiFixtureDetailClient() {
    const { t } = useI18n();
    return <Suspense fallback={<MainLayout><div className="flex min-h-[50vh] items-center justify-center" role="status">{t("common.state.loading")}</div></MainLayout>}><MysekaiFixtureDetailContent /></Suspense>;
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="text-slate-800 font-bold text-right max-w-[60%]">{value}</span>
        </div>
    );
}
