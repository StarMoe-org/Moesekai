# Translation Coverage

This inventory is generated as a human-readable companion to `docs/translation-coverage.json`. It describes the Moesekai repository at 2026-07-22 and deliberately reports **partial coverage**, not full localization.

## Policy

- Fixed UI messages remain compile-time message trees.
- NEXT may produce deterministic artifacts that are checked into this repository and validated by i18n lint.
- Runtime-remote UI message loading is explicitly excluded.
- Dynamic content targets are `zh-CN` and `en-US`.
- `ja-JP`, `zh-TW`, and `ko-KR` never reuse Chinese or English dynamic overlays; they safely render Japanese source content where no official regional content is already selected.
- Community aliases, third-party guides/manga, user identity, and nontext values are not counted as translation coverage.
- `node web/scripts/check-translation-coverage.mjs` uses the TypeScript program to derive every `fetchMasterData` type whose human-readable string fields reach rendered JSX, plus translation categories, story families, event fields, and lyrics consumers; technical IDs, paths, enums, and color codes are explicitly excluded.

## Counts

| Status | Count |
| --- | ---: |
| Covered | 2 |
| Partial | 24 |
| Required but uncovered | 13 |
| Official regional source | 4 |
| Explicitly excluded | 4 |
| Nontext | 1 |
| Total | 48 |

Because 13 required entries remain uncovered and 24 more are partial, this document makes no full-coverage claim.

## Inventory

| ID | Routes / components | Source and fields | Stable ID / backend mapping | zh-CN | en-US | Status / exclusion |
| --- | --- | --- | --- | --- | --- | --- |
| `ui-messages` | all / I18nProvider | checked-in message trees; dot keys and tokens | i18n key / deterministic NEXT artifact | covered | covered | covered; runtime remote forbidden |
| `cards-text` | cards and card story | cards masterdata + category overlay; prefix, skill names, gachaPhrase | card ID + field / cards category | partial | path supported | partial; typed gachaPhrase gap |
| `skills-text` | card views | skills masterdata + overlay; description, shortDescription | skill ID + field / skills category | description partial | path supported | partial; shortDescription missing |
| `events-name` | event views | events masterdata + overlay; name | event ID + field / events category | partial | path supported | partial |
| `information-title` | information and home | regional API + overlay; title, document | server + ID + field / title only | title partial | title path supported | partial; body uncovered |
| `music-title` | music, lyrics, my-musics | musics + locale overlay; title | music ID + field / music.title | overlay + cn | overlay + en | partial; source-string backend |
| `music-credits` | music detail and selectors | musics; composer, lyricist, arranger | music ID + explicit field / artist map unwired | uncovered | uncovered | required-uncovered |
| `music-vocal-caption` | music detail | musicVocals + overlay; caption | vocal ID + field / vocalCaption | partial | path supported | partial |
| `virtual-live-name` | live views | virtualLives + overlay; name | live ID + field / virtualLive.name | partial | path supported | partial |
| `mysekai-fixture-name` | MySekai and rewards | fixture masterdata + overlay; name, pronunciation | fixture ID + field / fixtureName | name partial | path supported | partial; pronunciation missing |
| `mysekai-taxonomy-and-flavor` | MySekai and materials | fixture/taxonomy masterdata; flavor and names | entity ID + field / declared maps incompletely consumed | incomplete | incomplete | required-uncovered |
| `gacha-name` | gacha views | gachas + overlay; name | gacha ID + field / gacha.name | partial | path supported | partial |
| `gacha-information` | gacha detail | gachas + lazy overlay; gachaInformation summary, bubbleText, description | exact Japanese text (paired by gacha ID) / gachaInfo.* | partial | path supported | partial; loaded only on the detail page |
| `sticker-name` | sticker, maker, rewards | stamps + overlay; name | stamp ID + field / sticker.name | partial | path supported | partial; reuse incomplete |
| `comic-title` | comic | tips + old tips + overlay; title | tip ID + field / comic.title | partial | path supported | partial |
| `character-profile-text` | character views | profiles + overlay; six profile fields plus school fields | character ID + field / six maps | partial | path supported | partial; school fields missing |
| `unit-profile-text` | character and unit story | unitProfiles + overlay; unitName, profileSentence | unit ID + field / units maps | partial | path supported | partial; consumer variance |
| `costume-text` | costume/card/reward views | curated costume data + overlay; name, colorName, designer | costume/variant ID + field / costumes maps | partial | path supported | partial |
| `official-character-names` | all character consumers | regional gameCharacters; firstName/givenName and ruby fields + UI fallback | character ID / regional masterdata | official | official | official-regional; not editorial coverage |
| `official-music-core` | music and lyrics | regional musics core fields | music ID / regional masterdata | official when selected | official when selected | official-regional; nontext excluded |
| `soundtrack-masterdata-text` | soundtrack | musicSoundTrackCategories.name; musicSoundTracks.title/pronunciation | category or track ID + field / regional masterdata | official when available | official when available | official-regional; technical audio metadata excluded |
| `official-event-core` | event views | regional events core fields | event ID / regional masterdata | official when selected | official when selected | official-regional; nontext excluded |
| `materials-text` | materials, inventory, rewards | materials; name and flavor fields | material ID + field / no content type | uncovered | uncovered | required-uncovered |
| `mysekai-materials-text` | materials and MySekai | mysekaiMaterials; name, pronunciation, description | material ID + field / declared map unwired | uncovered | uncovered | required-uncovered |
| `honors-text` | honors and rewards | honors/groups; names and level descriptions | honor/group ID + level + field | uncovered | uncovered | required-uncovered |
| `bonds-honors-text` | honors | bonds honors/words; names and descriptions | bond ID + level + field | uncovered | uncovered | required-uncovered |
| `exchange-text` | exchanges | summaries/exchanges/relations; names and description | exchange/relation ID + field | uncovered | uncovered | required-uncovered |
| `reward-entity-text` | exchange/live/event/profile rewards | cross-entity names and descriptions | resource type + ID + field / shared resolver needed | inconsistent | inconsistent | required-uncovered |
| `outside-character-name` | music detail | outsideCharacters; name | outside character ID + field | uncovered | uncovered | required-uncovered |
| `manga-curated-metadata` | manga views | third-party title and contributors | manga ID / outside artifacts | not claimed | not claimed | excluded; licensing decision |
| `guide-documents` | guide views | community title, tags, Markdown | guide ID + version / outside artifacts | not claimed | not claimed | excluded; ownership decision |
| `event-story-metadata` | event story list/reader | mirror/masterdata + event artifacts; title_jp/title_cn/episode title | event ID + episode + field | mirror/category title partial | artifact title + source fallback | partial |
| `event-story-summaries` | event story group | eventStories + mirror; outline_jp/outline_cn/event and chapter summary_cn | event ID + chapter + summary field | mirror outline/summaries partial | JP outline fallback; summaries uncovered | partial; CN summaries never leak to non-zh |
| `event-story-lines` | event reader | scenario + event artifact; body/display name | scenario + TalkData index required; current source string | backward-compatible partial | isolated artifact supported | partial |
| `unit-story-lines` | unit reader | unitStoryEpisodeGroups + scenarios; group name/outline/title/body/display name | scenario + TalkData index + field | uncovered | uncovered | required-uncovered |
| `card-story-lines` | `/story/card/{cardId}` / card reader | card scenarios + `translation/cardStory/card_{id}.json`, `v2/en-US/translation/cardStory/card_{id}.json`; title/body/display name/gachaPhrase | card ID + episode `1`/`2` (cardEpisodes seq) + exact Japanese text / JP server only | JP-server artifact: official CN, AI or human | JP-server artifact: official EN, AI or human | partial; JP server only, gachaPhrase not in artifact |
| `area-story-lines` | `/story/area/{category}/{scenarioId}` / area reader | area scenarios/masterdata + `translation/areaTalk/group_{n}.json`, `v2/en-US/translation/areaTalk/group_{n}.json`; area/body/display name | group floor(JP actionSet ID / 100) + scenarioId + exact Japanese text / JP server only | JP-server artifact: official CN, AI or human | JP-server artifact: official EN, AI or human | partial; JP server only, area name not in artifact |
| `self-story-lines` | self reader | self scenarios; body/display name | scenario + TalkData index + field | uncovered | uncovered | required-uncovered |
| `special-story-lines` | special reader | special scenarios; group/title/body/display name | story/scenario + TalkData index + field | uncovered | uncovered | required-uncovered |
| `story-special-effects` | all story readers | scenarios + mobs; telop/fullscreen/selectable/mob text | scenario + effect index + field | uncovered | uncovered | required-uncovered; Talk-only merge today |
| `lyrics-index` | lyrics list | published `files/translation/lyrics/index.json`; IDs, revision, timestamps, localized title, strict availability state, Full/Game versions, no-lyrics reason | music ID / NEXT public contracts v1-v3 | published subset | published subset | partial; all catalog states may be indexed, while unresolved/no-lyrics states have no detail |
| `lyrics-detail` | lyrics detail | published `files/translation/lyrics/music_{musicId}.json`; complete or top-level Game-only state, peer renditions, translations, ruby, segmented performers, whole-line trailing performers, per-rendition attribution/credits, and exact or independent Game sides | music ID + immutable rendition key + line ID / NEXT public contracts v1-v3 | per-line + JP fallback | per-line + JP fallback | partial; details exist only for complete and Game-only states |
| `lyrics-performers` | lyrics detail | v3 source performer IDs, segment assignments, whole-line trailing assignments, local colors/avatars, and accessible names | source performer ID (`歌唱者-*` or audited external source ID) / performerIds or trailingPerformerIds | color/gradient lyric text when segmented, line-end circular avatars for whole-line attribution | color/gradient lyric text when segmented, line-end circular avatars for whole-line attribution | covered |
| `search-index` | command palette, music, lyrics | NextTrans publishes `files/data/search-index.json`; n/cn/en/g/c/a plus lyrics titles and music aliases | group + stable entity ID / builder must publish en and aliases by music ID | cn + aliases searched | en + aliases searched | partial; all three consumers now share `SEARCH_INDEX_URL` on the canonical `/files` path, but backend publication and exhaustive entity coverage stay outside this repository |
| `seo-copy-and-entity-names` | static/detail routes | compile-time SEO + regional metadata | page/detail key + entity ID | templates covered | templates covered | partial; overlay entity reuse incomplete |
| `runtime-remote-ui` | all | forbidden fixed UI remote source | i18n key / checked-in artifacts instead | excluded | excluded | excluded by frozen decision |
| `community-music-aliases` | search | reviewed user-submitted aliases projected into shared search index field `a` | music ID + alias / NextTrans search-index builder | searchable only | searchable only | covered for published alias records; not translations |
| `character-colors-and-numeric-data` | all | CHAR_COLORS, IDs, dates, rates, scores | existing IDs/enums / none | N/A | N/A | nontext; labels still use UI i18n |

## Required Follow-Up

The blocking content-model gaps are stable ID-based fields for masterdata text, a scenario ID plus action-index contract for every story family, a locale-aware event/chapter summary artifact, source version/hash invalidation, a shared localized reward/entity resolver, and backend publication of the `en` search field. Lyrics infrastructure is implemented, but coverage remains bounded by the index and detail artifacts actually published.
