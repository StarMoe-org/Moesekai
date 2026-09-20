"use client";

import { useEffect, useState } from "react";
import type { ServerSourceType } from "@/contexts/ThemeContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { loadTranslations, type TranslationData } from "@/lib/translations";
import { UNIT_DATA } from "@/types/types";
import type { IMysekaiFixtureInfo, IMysekaiFixtureGenre, IMysekaiFixtureSubGenre, IMysekaiFixtureTag, IMysekaiBlueprint, IMysekaiBlueprintMaterialCost, IMysekaiMaterial } from "@/types/mysekai";
import type { CatalogEntry, ContentCatalog } from "./catalog";
import type { MolyCharacter } from "./contract";
import type { BrowseState, FurnitureFilters } from "./workspaceNavigation";

export interface FurnitureData {
    region: ServerSourceType;
    fixtures: IMysekaiFixtureInfo[];
    genres: IMysekaiFixtureGenre[];
    subGenres: IMysekaiFixtureSubGenre[];
    tags: IMysekaiFixtureTag[];
    translations: TranslationData | null;
    partial: boolean;
}
export interface FurnitureMaterials { blueprints: IMysekaiBlueprint[]; costs: IMysekaiBlueprintMaterialCost[]; materials: IMysekaiMaterial[]; }
export interface FixtureRelations { talks: CatalogEntry[]; activities: CatalogEntry[]; characters: MolyCharacter[]; }
const dataCache = new Map<string, Promise<FurnitureData>>();
const materialCache = new Map<string, Promise<FurnitureMaterials>>();

async function loadFurniture(region: ServerSourceType): Promise<FurnitureData> {
    const [fixtures, genres, subGenres, tags, translations] = await Promise.allSettled([
        fetchMasterDataForServer<IMysekaiFixtureInfo[]>(region, "mysekaiFixtures.json"),
        fetchMasterDataForServer<IMysekaiFixtureGenre[]>(region, "mysekaiFixtureMainGenres.json"),
        fetchMasterDataForServer<IMysekaiFixtureSubGenre[]>(region, "mysekaiFixtureSubGenres.json"),
        fetchMasterDataForServer<IMysekaiFixtureTag[]>(region, "mysekaiFixtureTags.json"), loadTranslations(),
    ]);
    if (fixtures.status !== "fulfilled" || !Array.isArray(fixtures.value)) throw new Error("furniture_data_unavailable");
    return {
        region, fixtures: fixtures.value,
        genres: genres.status === "fulfilled" && Array.isArray(genres.value) ? genres.value : [],
        subGenres: subGenres.status === "fulfilled" && Array.isArray(subGenres.value) ? subGenres.value : [],
        tags: tags.status === "fulfilled" && Array.isArray(tags.value) ? tags.value : [],
        translations: translations.status === "fulfilled" ? translations.value : null,
        partial: [genres, subGenres, tags].some(result => result.status === "rejected"),
    };
}

/** Furniture information remains available even where no renderer is published. */
export function useFurnitureData(region: ServerSourceType | null, retry: number) {
    const key = region ? `${region}:${retry}` : "";
    const [state, setState] = useState<{ key: string; data?: FurnitureData; failed?: boolean }>({ key: "" });
    useEffect(() => {
        if (!region) return;
        let cancelled = false;
        let request = dataCache.get(key);
        if (!request) {
            request = loadFurniture(region);
            dataCache.set(key, request);
            void request.catch(() => dataCache.delete(key));
        }
        void request.then(data => { if (!cancelled) setState({ key, data }); }, () => { if (!cancelled) setState({ key, failed: true }); });
        return () => { cancelled = true; };
    }, [key, region]);
    const data = state.key === key ? state.data : undefined;
    const failed = state.key === key && Boolean(state.failed);
    return { data, failed, loading: Boolean(region && !data && !failed) };
}

export function useFurnitureMaterials(region: ServerSourceType, enabled: boolean, retry: number) {
    const key = `${region}:${retry}`;
    const [state, setState] = useState<{ key: string; data?: FurnitureMaterials; failed?: boolean }>({ key: "" });
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let request = materialCache.get(key);
        if (!request) {
            request = Promise.all([
                fetchMasterDataForServer<IMysekaiBlueprint[]>(region, "mysekaiBlueprints.json"),
                fetchMasterDataForServer<IMysekaiBlueprintMaterialCost[]>(region, "mysekaiBlueprintMysekaiMaterialCosts.json"),
                fetchMasterDataForServer<IMysekaiMaterial[]>(region, "mysekaiMaterials.json"),
            ]).then(([blueprints, costs, materials]) => {
                if (![blueprints, costs, materials].every(Array.isArray)) throw new Error("furniture_materials_invalid");
                return { blueprints, costs, materials };
            });
            materialCache.set(key, request);
            void request.catch(() => materialCache.delete(key));
        }
        void request.then(data => { if (!cancelled) setState({ key, data }); }, () => { if (!cancelled) setState({ key, failed: true }); });
        return () => { cancelled = true; };
    }, [region, enabled, key]);
    return { data: state.key === key ? state.data : undefined, failed: state.key === key && Boolean(state.failed) };
}

export function fixtureRelations(catalog: ContentCatalog | undefined): Map<number, FixtureRelations> {
    const result = new Map<number, FixtureRelations>();
    const characters = new Map(catalog?.characters.map(character => [character.id, character]));
    for (const entry of catalog?.entries ?? []) {
        if (entry.presentation.category === "furniture") continue;
        for (const fixture of new Set(entry.fixtureIds)) {
            let relation = result.get(fixture);
            if (!relation) { relation = { talks: [], activities: [], characters: [] }; result.set(fixture, relation); }
            if (entry.key.startsWith("talk:")) relation.talks.push(entry);
            else if (entry.key.startsWith("activity:")) relation.activities.push(entry);
            for (const unit of entry.unitIds) {
                const character = characters.get(unit) ?? entry.characters.find(character => character.id === unit);
                if (character && !relation.characters.some(existing => existing.id === unit)) relation.characters.push(character);
            }
        }
    }
    return result;
}

/** Search/tag/theme predicates only; playback availability is the Rust projection. */
export function filterFurniture(data: FurnitureData, browse: BrowseState, filters: FurnitureFilters,
    runtimeEntries: Map<string, CatalogEntry>, relations: Map<number, FixtureRelations>): IMysekaiFixtureInfo[] {
    const tokens = browse.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).map(token => token.replace(/^#/, ""));
    const characters = new Set([...filters.characters, ...UNIT_DATA.filter(unit => filters.units.includes(unit.id)).flatMap(unit => unit.charIds)]);
    const characterTagIds = new Set(data.tags.filter(tag => tag.mysekaiFixtureTagType === "game_character" && characters.has(tag.externalId ?? 0)).map(tag => tag.id));
    return data.fixtures.filter(fixture => {
        if (browse.fixture !== null && fixture.id !== browse.fixture) return false;
        if (browse.character !== null && !relations.get(fixture.id)?.characters.some(character => character.id === browse.character)) return false;
        if (browse.availability === "ready" && !runtimeEntries.get(`fixture:${fixture.id}`)?.available) return false;
        if (filters.genre !== null && fixture.mysekaiFixtureMainGenreId !== filters.genre) return false;
        if (filters.subGenre !== null && fixture.mysekaiFixtureSubGenreId !== filters.subGenre) return false;
        const tags = Object.entries(fixture.mysekaiFixtureTagGroup ?? {}).filter(([key]) => key !== "id").map(([, value]) => value);
        if (filters.tag !== null && !tags.includes(filters.tag)) return false;
        if (characters.size && !tags.some(tag => characterTagIds.has(tag ?? 0))) return false;
        const text = `${fixture.id} ${fixture.name} ${fixture.pronunciation ?? ""} ${data.translations?.mysekai?.fixtureName?.[fixture.name] ?? ""}`.toLocaleLowerCase();
        return tokens.every(token => text.includes(token));
    }).sort((a, b) => {
        const order = filters.sortOrder === "asc" ? 1 : -1;
        return order * (filters.sortBy === "name" ? a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id - b.id : a.id - b.id);
    });
}
