/**
 * Metadata Map Generator Script
 *
 * 在 CI/构建阶段从远程 master API 拉取数据，
 * 提取每个实体的 SEO 所需最小字段，生成 metadata-map.json。
 * 运行时 generateMetadata 从本地文件读取，零网络请求。
 *
 * 构建环境网络可能与宿主不同；当远程数据源临时不可用时，
 * 本脚本会优先保留已存在的 metadata-map.json，避免把完整 SEO 数据覆盖为空。
 *
 * 使用方法: node scripts/generate-metadata-map.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
    BUILD_DATA_REGIONS,
    fetchMangaJson,
    fetchMasterJson,
    getBuildFetchConcurrency,
    getConfiguredMangaDataUrls,
    getConfiguredMasterDataUrls,
    mapWithConcurrency,
    readJsonIfExists,
    requireFreshBuildData,
} from './lib/build-fetch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_REGION = String(process.env.BUILD_DATA_REGION || 'cn').toLowerCase();
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', `metadata-map.${BUILD_REGION}.json`);
const REQUIRE_FRESH = requireFreshBuildData();

function countEntries(section) {
    return Object.keys(section || {}).length;
}

function shortenError(error) {
    const message = error?.message || String(error);
    return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

function existingSection(existingMap, key) {
    const section = existingMap?.[key];
    return section && typeof section === 'object' && !Array.isArray(section) ? section : null;
}

function mergeSections(sections) {
    return Object.assign({}, ...sections.filter(section => section && typeof section === 'object' && !Array.isArray(section)));
}

function pickExistingSections(existingMap, keys) {
    return mergeSections(keys.map(key => ({ [key]: existingSection(existingMap, key) || {} })));
}

function sectionKeysForDataset(dataset) {
    return Array.isArray(dataset.sectionKeys) && dataset.sectionKeys.length > 0 ? dataset.sectionKeys : [dataset.key];
}

function sectionCounts(section) {
    return Object.entries(section || {}).map(([key, value]) => `${key}: ${countEntries(value)}`).join(', ');
}

function totalEntries(section) {
    return Object.values(section || {}).reduce((total, value) => total + countEntries(value), 0);
}

function normalizeDatasetSection(dataset, section) {
    return dataset.sectionKeys ? section : { [dataset.key]: section };
}

function eventMetaById(eventsRaw) {
    return new Map((Array.isArray(eventsRaw) ? eventsRaw : []).map(event => [event.id, event]));
}

function characterName(character) {
    return `${character?.firstName || ''}${character?.givenName || ''}` || '';
}

function characterNameById(charactersRaw) {
    return new Map((Array.isArray(charactersRaw) ? charactersRaw : []).map(character => [character.id, characterName(character)]));
}

function unitProfilesBySeq(unitProfilesRaw) {
    return new Map((Array.isArray(unitProfilesRaw) ? unitProfilesRaw : []).map(profile => [profile.seq, profile]));
}

function areaName(area) {
    if (!area) return '';
    return area.subName ? `${area.name} - ${area.subName}` : area.name;
}

function actionCategory(action) {
    const scenarioId = action?.scenarioId;
    const releaseConditionId = Number(action?.releaseConditionId);
    const cond = String(action?.releaseConditionId ?? '');

    if (scenarioId && cond.length === 6 && cond[0] === '1') return `event_${parseInt(cond.slice(1, 4), 10) + 1}`;
    if (action?.id === 2373) return 'event_145';
    if (scenarioId && scenarioId.includes('aprilfool')) return scenarioId.split('_')[1] || '';
    if (scenarioId && action?.actionSetType === 'limited') return `limited_${action.areaId}`;
    if (scenarioId && action?.actionSetType === 'normal' && action?.isNextGrade === false && releaseConditionId === 1) return 'grade1';
    if (scenarioId && action?.actionSetType === 'normal' && action?.isNextGrade === true && releaseConditionId === 1) return 'grade2';
    if (scenarioId && releaseConditionId >= 2000000 && releaseConditionId <= 2000036) return 'theater';
    return '';
}

function actionCategoryLabel(category, eventsMap) {
    if (category === 'grade1') return 'Daily Area Conversations';
    if (category === 'grade2') return 'Next Grade Area Conversations';
    if (category === 'theater') return 'Movie Theater Conversations';
    if (category.startsWith('limited_')) return `Limited Area ${category.replace('limited_', '')}`;
    if (category.startsWith('aprilfool')) return `April Fools ${category.replace('aprilfool', '')}`;
    if (category.startsWith('event_')) {
        const eventId = Number(category.replace('event_', ''));
        return eventsMap.get(eventId)?.name || `Event ${eventId}`;
    }
    return category;
}

function buildStoryEventGroupMetadata(raw) {
    const eventsMap = eventMetaById(raw?.events);
    return Object.fromEntries(
        (Array.isArray(raw?.eventStories) ? raw.eventStories : []).flatMap(story => {
            const event = eventsMap.get(story.eventId);
            if (!event) return [];
            return [[story.eventId, {
                name: event.name || '',
                asset: event.assetbundleName || story.assetbundleName || '',
                episodeCount: Array.isArray(story.eventStoryEpisodes) ? story.eventStoryEpisodes.length : 0,
                firstEpisodeTitle: story.eventStoryEpisodes?.[0]?.title || '',
            }]];
        })
    );
}

function buildStoryEventEpisodeMetadata(raw) {
    const eventsMap = eventMetaById(raw?.events);
    return Object.fromEntries(
        (Array.isArray(raw?.eventStories) ? raw.eventStories : []).flatMap(story => {
            const event = eventsMap.get(story.eventId);
            if (!event) return [];
            return (story.eventStoryEpisodes || []).map(episode => [`${story.eventId}/${episode.episodeNo}`, {
                eventName: event.name || '',
                episodeTitle: episode.title || '',
                episodeNo: episode.episodeNo,
                asset: event.assetbundleName || story.assetbundleName || '',
            }]);
        })
    );
}

function buildStoryUnitGroupMetadata(raw) {
    const profiles = unitProfilesBySeq(raw?.unitProfiles);
    return Object.fromEntries(
        (Array.isArray(raw?.unitStories) ? raw.unitStories : []).flatMap(story => {
            const profile = profiles.get(story.seq);
            if (!profile) return [];
            const episodeCount = (story.chapters || []).reduce((count, chapter) => count + (chapter.episodes?.length || 0), 0);
            return [[story.seq, {
                unitName: profile.unitName || profile.unit || '',
                unit: profile.unit || story.unit || '',
                episodeCount,
            }]];
        })
    );
}

function buildStoryUnitEpisodeMetadata(raw) {
    const profiles = unitProfilesBySeq(raw?.unitProfiles);
    return Object.fromEntries(
        (Array.isArray(raw?.unitStories) ? raw.unitStories : []).flatMap(story => {
            const profile = profiles.get(story.seq);
            if (!profile) return [];
            return (story.chapters || []).flatMap(chapter => (chapter.episodes || []).map(episode => [`${story.seq}/${episode.scenarioId}`, {
                unitName: profile.unitName || profile.unit || '',
                unit: profile.unit || story.unit || '',
                episodeTitle: episode.title || '',
                episodeNoLabel: episode.episodeNoLabel || String(episode.episodeNo || ''),
            }]));
        })
    );
}

function buildStoryCardReaderMetadata(raw) {
    const names = characterNameById(raw?.gameCharacters);
    const episodeCardIds = new Set((Array.isArray(raw?.cardEpisodes) ? raw.cardEpisodes : []).map(episode => episode.cardId));
    return Object.fromEntries(
        (Array.isArray(raw?.cards) ? raw.cards : [])
            .filter(card => episodeCardIds.has(card.id))
            .map(card => [card.id, {
                cardPrefix: card.prefix || '',
                characterName: names.get(card.characterId) || '',
                asset: card.assetbundleName || '',
                characterId: card.characterId,
            }])
    );
}

function buildStorySelfReaderMetadata(raw) {
    const profileCharacterIds = new Set((Array.isArray(raw?.characterProfiles) ? raw.characterProfiles : [])
        .filter(profile => profile.scenarioId)
        .map(profile => profile.characterId));
    return Object.fromEntries(
        (Array.isArray(raw?.gameCharacters) ? raw.gameCharacters : [])
            .filter(character => profileCharacterIds.has(character.id))
            .map(character => [character.id, {
                characterName: characterName(character),
                characterId: character.id,
            }])
    );
}

function buildStorySpecialReaderMetadata(raw) {
    return Object.fromEntries(
        (Array.isArray(raw?.specialStories) ? raw.specialStories : [])
            .filter(story => story.id !== 2 && Array.isArray(story.episodes) && story.episodes.length > 0)
            .map(story => [story.id, {
                title: story.title || story.episodes?.[0]?.title || `SP${story.id}`,
                episodeCount: story.episodes.length,
            }])
    );
}

function buildStoryAreaCategoryMetadata(raw) {
    const eventsMap = eventMetaById(raw?.events);
    const counts = new Map();
    for (const action of Array.isArray(raw?.actionSets) ? raw.actionSets : []) {
        const category = actionCategory(action);
        if (!category) continue;
        counts.set(category, (counts.get(category) || 0) + 1);
    }

    return Object.fromEntries([...counts.entries()].map(([category, count]) => [category, {
        label: actionCategoryLabel(category, eventsMap),
        count,
    }]));
}

function buildStoryAreaReaderMetadata(raw) {
    const areaMap = new Map((Array.isArray(raw?.areas) ? raw.areas : []).map(area => [area.id, areaName(area)]));
    return Object.fromEntries(
        (Array.isArray(raw?.actionSets) ? raw.actionSets : []).flatMap(action => {
            const category = actionCategory(action);
            if (!category || !action.scenarioId) return [];
            return [[`${category}/${action.scenarioId}`, {
                areaName: areaMap.get(action.areaId) || `Area ${action.areaId}`,
                scenarioId: action.scenarioId,
            }]];
        })
    );
}

function hasUsefulMetadata(map) {
    return [
        'cards',
        'musics',
        'events',
        'gachas',
        'characters',
        'virtualLives',
    ].some(key => countEntries(map[key]) > 0);
}

function computeCardPower(c) {
    if (!c?.cardParameters) return null;
    let p1Max = 0, p2Max = 0, p3Max = 0;
    if (Array.isArray(c.cardParameters)) {
        for (const p of c.cardParameters) {
            if (p.cardParameterType === 'param1' && p.power > p1Max) p1Max = p.power;
            else if (p.cardParameterType === 'param2' && p.power > p2Max) p2Max = p.power;
            else if (p.cardParameterType === 'param3' && p.power > p3Max) p3Max = p.power;
        }
    } else if (Array.isArray(c.cardParameters.param1)) {
        const p1 = c.cardParameters.param1;
        const p2 = c.cardParameters.param2;
        const p3 = c.cardParameters.param3;
        p1Max = p1[p1.length - 1] || 0;
        p2Max = p2[p2.length - 1] || 0;
        p3Max = p3[p3.length - 1] || 0;
    }
    if (!p1Max || !p2Max || !p3Max) return null;
    const normalTotal = p1Max + p2Max + p3Max;
    const result = {
        normal: {
            performance: p1Max,
            technique: p2Max,
            stamina: p3Max,
            total: normalTotal,
        },
    };
    if (c.specialTrainingPower1BonusFixed || c.specialTrainingPower2BonusFixed || c.specialTrainingPower3BonusFixed) {
        const trainedPerf = p1Max + (c.specialTrainingPower1BonusFixed || 0);
        const trainedTech = p2Max + (c.specialTrainingPower2BonusFixed || 0);
        const trainedStam = p3Max + (c.specialTrainingPower3BonusFixed || 0);
        result.trained = {
            performance: trainedPerf,
            technique: trainedTech,
            stamina: trainedStam,
            total: trainedPerf + trainedTech + trainedStam,
        };
    }
    return result;
}

function formatSkillDescription(skill, skillLevel, card, charaNamesMap) {
    if (!skill || !skill.description) return '';
    let newSkillInfo = skill.description;

    const singleRegExp = /{{(\d+);(\w+)}}/g;
    const doubleRegExp = /{{(\d+),(\d+);(\w+)}}/g;

    newSkillInfo = newSkillInfo.replace(singleRegExp, (match, idStr, type) => {
        const id = Number(idStr);

        if (type === 'c' && card) {
            const charaName = charaNamesMap?.get(card.characterId);
            return charaName || match;
        }

        const skillEffect = skill.skillEffects?.find(eff => eff.id === id);
        if (!skillEffect) return match;

        const detail = skillEffect.skillEffectDetails?.find(d => d.level === skillLevel);
        if (!detail) return match;

        switch (type) {
            case 'd':
                return String(detail.activateEffectDuration);
            case 'v':
                return String(detail.activateEffectValue);
            case 'e':
                return skillEffect.skillEnhance?.activateEffectValue
                    ? String(skillEffect.skillEnhance.activateEffectValue)
                    : match;
            case 'm':
                if (skillEffect.skillEnhance?.activateEffectValue) {
                    return String(
                        skillEffect.skillEnhance.activateEffectValue * 5 +
                        detail.activateEffectValue
                    );
                }
                return match;
            default:
                return match;
        }
    });

    newSkillInfo = newSkillInfo.replace(doubleRegExp, (match, id1Str, id2Str, type) => {
        const id1 = Number(id1Str);
        const id2 = Number(id2Str);

        const getEffectValue = effectId => {
            const effect = skill.skillEffects?.find(e => e.id === effectId);
            if (!effect) return 0;
            const detail = effect.skillEffectDetails?.find(d => d.level === skillLevel);
            return detail ? detail.activateEffectValue : 0;
        };

        const val1 = getEffectValue(id1);
        const val2 = getEffectValue(id2);

        switch (type) {
            case 'u':
            case 'o':
            case 's':
            case 'v':
                return String(val1 + val2);
            case 'r':
                return String(val2 > 0 ? val2 : val1);
            default:
                return match;
        }
    });

    return newSkillInfo;
}

const datasets = [
    {
        key: 'cards',
        label: 'cards',
        filename: 'cards.json + skills.json + gameCharacters.json',
        fallback: { cards: [], skills: [], gameCharacters: [] },
        validate: data => Array.isArray(data?.cards) && Array.isArray(data?.skills),
        fetch: async () => ({
            cards: await fetchMasterJson('cards.json', 'cards'),
            skills: await fetchMasterJson('skills.json', 'skills'),
            gameCharacters: await fetchMasterJson('gameCharacters.json', 'characters').catch(() => []),
        }),
        build: (raw, existingMap) => {
            const cards = Array.isArray(raw?.cards) ? raw.cards : [];
            const skills = Array.isArray(raw?.skills) ? raw.skills : [];
            const characters = Array.isArray(raw?.gameCharacters) ? raw.gameCharacters : [];
            const charNames = characterNameById(characters);
            const skillsMap = new Map(skills.map(s => [s.id, s]));

            return Object.fromEntries(
                cards.map(c => {
                    const existing = existingMap?.cards?.[String(c.id)] || {};
                    const power = existing.power || computeCardPower(c);
                    const skill = skillsMap.get(c.skillId);
                    const formattedSkill = skill ? formatSkillDescription(skill, 4, c, charNames) : '';
                    const skillDesc = formattedSkill || existing.skillDesc || '';
                    const entry = {
                        prefix: c.prefix,
                        characterId: c.characterId,
                        rarity: c.cardRarityType,
                        attr: c.attr,
                        asset: c.assetbundleName,
                        releaseAt: c.releaseAt ?? existing.releaseAt,
                        skillName: c.cardSkillName || existing.skillName,
                        skillDesc,
                    };
                    if (power) entry.power = power;
                    if (existing.event) entry.event = existing.event;
                    return [c.id, entry];
                })
            );
        },
    },
    {
        key: 'musics',
        label: 'musics',
        filename: 'musics.json',
        fallback: [],
        validate: Array.isArray,
        build: musics => Object.fromEntries(
            (Array.isArray(musics) ? musics : []).map(m => [m.id, {
                title: m.title,
                lyricist: m.lyricist,
                composer: m.composer,
                asset: m.assetbundleName,
            }])
        ),
    },
    {
        key: 'events',
        label: 'events',
        filename: 'events.json',
        fallback: [],
        validate: Array.isArray,
        build: events => Object.fromEntries(
            (Array.isArray(events) ? events : []).map(e => [e.id, {
                name: e.name,
                type: e.eventType,
                asset: e.assetbundleName,
                startAt: e.startAt || null,
                endAt: e.aggregateAt || e.closedAt || e.endAt || null,
            }])
        ),
    },
    {
        key: 'gachas',
        label: 'gachas',
        filename: 'gachas.json',
        fallback: [],
        validate: Array.isArray,
        build: gachas => Object.fromEntries(
            (Array.isArray(gachas) ? gachas : []).map(g => [g.id, {
                name: g.name,
                type: g.gachaType,
                asset: g.assetbundleName,
            }])
        ),
    },
    {
        key: 'characters',
        label: 'characters',
        filename: 'gameCharacters.json',
        fallback: [],
        validate: Array.isArray,
        build: characters => Object.fromEntries(
            (Array.isArray(characters) ? characters : []).map(c => [c.id, {
                name: `${c.firstName || ''}${c.givenName || ''}`,
            }])
        ),
    },
    {
        key: 'virtualLives',
        label: 'virtualLives',
        filename: 'virtualLives.json',
        fallback: [],
        validate: Array.isArray,
        build: virtualLives => Object.fromEntries(
            (Array.isArray(virtualLives) ? virtualLives : []).map(v => [v.id, {
                name: v.name,
                asset: v.assetbundleName,
                startAt: v.startAt || null,
                endAt: v.endAt || null,
            }])
        ),
    },
    {
        key: 'costumes',
        label: 'costumes',
        filename: 'moe_costume.json',
        fallback: { costumes: [] },
        validate: data => data && Array.isArray(data.costumes),
        build: costumesRaw => Object.fromEntries(
            (costumesRaw?.costumes || []).map(c => [c.costumeNumber, {
                name: c.name,
            }])
        ),
    },
    {
        key: 'mysekaiFixtures',
        label: 'fixtures',
        filename: 'mysekaiFixtures.json',
        fallback: [],
        validate: Array.isArray,
        build: fixtures => Object.fromEntries(
            (Array.isArray(fixtures) ? fixtures : []).map(f => [f.id, {
                name: f.name,
                flavor: f.flavorText || '',
                asset: f.assetbundleName,
            }])
        ),
    },
    {
        key: 'mangas',
        label: 'mangas',
        fallback: {},
        validate: data => data && typeof data === 'object' && !Array.isArray(data),
        fetch: () => fetchMangaJson('mangas'),
        build: mangasRaw => Object.fromEntries(
            Object.entries(mangasRaw || {}).map(([k, v]) => [k, {
                title: v?.title || '',
            }])
        ),
    },
    {
        key: 'exchanges',
        label: 'exchangeSummaries',
        filename: 'materialExchangeSummaries.json',
        fallback: [],
        validate: Array.isArray,
        build: exchangeSummaries => Object.fromEntries(
            (Array.isArray(exchangeSummaries) ? exchangeSummaries : [])
                .flatMap(summary => (summary.materialExchanges || []).map(exchange => [exchange.id, {
                    name: exchange.displayName || summary.name || `兑换项 #${exchange.id}`,
                    summaryName: summary.name || '',
                    category: summary.exchangeCategory || '',
                    type: summary.materialExchangeType || '',
                }]))
        ),
    },
    {
        key: 'storyEvents',
        label: 'story events',
        filename: 'events.json + eventStories.json',
        fallback: { events: [], eventStories: [] },
        validate: data => Array.isArray(data?.events) && Array.isArray(data?.eventStories),
        fetch: async () => ({
            events: await fetchMasterJson('events.json', 'story events'),
            eventStories: await fetchMasterJson('eventStories.json', 'story event episodes'),
        }),
        build: raw => ({
            storyEventGroups: buildStoryEventGroupMetadata(raw),
            storyEventEpisodes: buildStoryEventEpisodeMetadata(raw),
        }),
        sectionKeys: ['storyEventGroups', 'storyEventEpisodes'],
    },
    {
        key: 'storyUnits',
        label: 'story units',
        filename: 'unitProfiles.json + unitStories.json',
        fallback: { unitProfiles: [], unitStories: [] },
        validate: data => Array.isArray(data?.unitProfiles) && Array.isArray(data?.unitStories),
        fetch: async () => ({
            unitProfiles: await fetchMasterJson('unitProfiles.json', 'story unit profiles'),
            unitStories: await fetchMasterJson('unitStories.json', 'story unit episodes'),
        }),
        build: raw => ({
            storyUnitGroups: buildStoryUnitGroupMetadata(raw),
            storyUnitEpisodes: buildStoryUnitEpisodeMetadata(raw),
        }),
        sectionKeys: ['storyUnitGroups', 'storyUnitEpisodes'],
    },
    {
        key: 'storyCards',
        label: 'story cards',
        filename: 'cards.json + cardEpisodes.json + gameCharacters.json',
        fallback: { cards: [], cardEpisodes: [], gameCharacters: [] },
        validate: data => Array.isArray(data?.cards) && Array.isArray(data?.cardEpisodes) && Array.isArray(data?.gameCharacters),
        fetch: async () => ({
            cards: await fetchMasterJson('cards.json', 'story cards'),
            cardEpisodes: await fetchMasterJson('cardEpisodes.json', 'card story episodes'),
            gameCharacters: await fetchMasterJson('gameCharacters.json', 'story card characters'),
        }),
        build: raw => ({
            storyCardReaders: buildStoryCardReaderMetadata(raw),
        }),
        sectionKeys: ['storyCardReaders'],
    },
    {
        key: 'storySelf',
        label: 'story self introductions',
        filename: 'gameCharacters.json + characterProfiles.json',
        fallback: { gameCharacters: [], characterProfiles: [] },
        validate: data => Array.isArray(data?.gameCharacters) && Array.isArray(data?.characterProfiles),
        fetch: async () => ({
            gameCharacters: await fetchMasterJson('gameCharacters.json', 'story self characters'),
            characterProfiles: await fetchMasterJson('characterProfiles.json', 'story self profiles'),
        }),
        build: raw => ({
            storySelfReaders: buildStorySelfReaderMetadata(raw),
        }),
        sectionKeys: ['storySelfReaders'],
    },
    {
        key: 'storySpecial',
        label: 'story special',
        filename: 'specialStories.json',
        fallback: { specialStories: [] },
        validate: data => Array.isArray(data?.specialStories),
        fetch: async () => ({
            specialStories: await fetchMasterJson('specialStories.json', 'special stories'),
        }),
        build: raw => ({
            storySpecialReaders: buildStorySpecialReaderMetadata(raw),
        }),
        sectionKeys: ['storySpecialReaders'],
    },
    {
        key: 'storyAreas',
        label: 'story areas',
        filename: 'actionSets.json + areas.json + events.json',
        fallback: { actionSets: [], areas: [], events: [] },
        validate: data => Array.isArray(data?.actionSets) && Array.isArray(data?.areas) && Array.isArray(data?.events),
        fetch: async () => ({
            actionSets: await fetchMasterJson('actionSets.json', 'story area action sets'),
            areas: await fetchMasterJson('areas.json', 'story areas'),
            events: await fetchMasterJson('events.json', 'story area events'),
        }),
        build: raw => ({
            storyAreaCategories: buildStoryAreaCategoryMetadata(raw),
            storyAreaReaders: buildStoryAreaReaderMetadata(raw),
        }),
        sectionKeys: ['storyAreaCategories', 'storyAreaReaders'],
    },
];

async function loadDataset(dataset, existingMap) {
    console.log(`  Fetching ${dataset.label}...`);
    const sectionKeys = sectionKeysForDataset(dataset);
    const previous = pickExistingSections(existingMap, sectionKeys);
    const previousCount = totalEntries(previous);

    try {
        const raw = dataset.fetch
            ? await dataset.fetch()
            : await fetchMasterJson(dataset.filename, dataset.label);

        if (dataset.validate && !dataset.validate(raw)) {
            throw new Error(`Unexpected ${dataset.label} response shape`);
        }

        const built = dataset.build(raw, existingMap);
        const section = normalizeDatasetSection(dataset, built);
        const sectionCount = totalEntries(section);

        if (sectionCount === 0) {
            if (previousCount > 0 && !REQUIRE_FRESH) {
                console.warn(`    ⚠ ${dataset.label} returned 0 entries, keeping existing ${previousCount} entries`);
                return { key: dataset.key, section: previous, source: 'existing-empty-response' };
            }
            if (REQUIRE_FRESH) {
                throw new Error(`${dataset.label} returned 0 entries`);
            }
        }

        return { key: dataset.key, section, source: 'fresh' };
    } catch (error) {
        if (REQUIRE_FRESH) {
            throw error;
        }

        if (previousCount > 0) {
            console.warn(`    ⚠ ${dataset.label} failed: ${shortenError(error)}, keeping existing ${previousCount} entries`);
            return { key: dataset.key, section: previous, source: 'existing' };
        }

        console.warn(`    ⚠ ${dataset.label} failed: ${shortenError(error)}, using empty fallback`);
        return { key: dataset.key, section: normalizeDatasetSection(dataset, dataset.build(dataset.fallback)), source: 'fallback' };
    }
}

async function main() {
    console.log(`=== Metadata Map Generator (${BUILD_REGION}) ===\n`);
    console.log(`Master APIs: ${getConfiguredMasterDataUrls().join(', ')}`);
    console.log(`Manga APIs: ${getConfiguredMangaDataUrls().join(', ')}`);
    console.log(`Require fresh build data: ${REQUIRE_FRESH ? 'yes' : 'no'}`);
    console.log(`Output: ${OUT_FILE}\n`);

    const legacyFile = path.join(__dirname, '..', 'public', 'data', 'metadata-map.json');
    const existingMap = readJsonIfExists(
        OUT_FILE,
        BUILD_REGION === 'jp' ? readJsonIfExists(legacyFile, null) : null
    );
    if (existingMap) {
        const existingCounts = Object.entries(existingMap).map(([key, val]) => `${key}: ${countEntries(val)}`);
        console.log(`Existing metadata map: ${existingCounts.join(', ')}\n`);
    }

    // Fetch all data with bounded concurrency. Docker build networking can be more fragile
    // than the host, so avoid opening every remote request at the exact same time.
    console.log('Fetching master data...');
    const results = await mapWithConcurrency(
        datasets,
        getBuildFetchConcurrency(3),
        dataset => loadDataset(dataset, existingMap)
    );

    // Build metadata map — only extract fields needed for SEO
    console.log('\nBuilding metadata map...');
    const map = mergeSections(results.map(result => result.section));

    if (!hasUsefulMetadata(map)) {
        throw new Error('Metadata map has no useful entries. Refusing to write an empty SEO data file.');
    }

    const counts = Object.entries(map).map(([key, val]) => `${key}: ${countEntries(val)}`);
    const sources = results.map(result => `${result.key}: ${result.source}${sectionCounts(result.section) ? ` (${sectionCounts(result.section)})` : ''}`);
    console.log(`  Entries: ${counts.join(', ')}`);
    console.log(`  Sources: ${sources.join(', ')}`);

    // Write output
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(map), 'utf-8');

    const fileSize = fs.statSync(OUT_FILE).size;
    console.log(`\n✓ Generated metadata-map.json (${(fileSize / 1024).toFixed(1)} KB)`);
    console.log('\n=== Metadata map generation complete! ===');
}

if (!process.env.BUILD_DATA_REGION) {
    for (const region of BUILD_DATA_REGIONS) {
        const result = spawnSync(process.execPath, [__filename], {
            stdio: 'inherit',
            env: { ...process.env, BUILD_DATA_REGION: region },
        });
        if (result.status !== 0) process.exit(result.status || 1);
    }
} else {
    main().catch(error => {
        console.error('\nFatal error:', error);
        process.exit(1);
    });
}
