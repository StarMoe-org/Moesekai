"use client";

import type { ReactNode } from "react";
import type { DetailSeoSemanticPayload } from "@/contexts/DetailSeoSummaryContext";
import type {
    CardMeta,
    MusicMeta,
    EventMeta,
    GachaMeta,
    CharacterMeta,
    VirtualLiveMeta,
    CostumeMeta,
    FixtureMeta,
    MangaMeta,
    ExchangeMeta,
} from "@/lib/metadata";
import { CHARACTER_NAMES } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import type { UiLocale } from "@/lib/i18n/locales";

export interface DetailSemanticSeoShellProps {
    title: string;
    description: string;
    locale?: UiLocale;
    semantic?: DetailSeoSemanticPayload;
}

const SEO_LABELS: Record<string, Record<UiLocale, string>> = {
    releaseDate: {
        "zh-CN": "发布日期",
        "zh-TW": "發布日期",
        "ja-JP": "配信日",
        "en-US": "Release Date",
        "ko-KR": "출시일",
    },
    skillName: {
        "zh-CN": "技能名称",
        "zh-TW": "技能名稱",
        "ja-JP": "スキル名",
        "en-US": "Skill Name",
        "ko-KR": "스킬 이름",
    },
    skillDesc: {
        "zh-CN": "技能描述",
        "zh-TW": "技能描述",
        "ja-JP": "スキル説明",
        "en-US": "Skill Description",
        "ko-KR": "스킬 설명",
    },
    none: {
        "zh-CN": "无",
        "zh-TW": "無",
        "ja-JP": "なし",
        "en-US": "None",
        "ko-KR": "없음",
    },
    cardParameters: {
        "zh-CN": "卡牌数值表 (Card Parameters)",
        "zh-TW": "卡牌數值表 (Card Parameters)",
        "ja-JP": "カードパラメータ (Card Parameters)",
        "en-US": "Card Parameters",
        "ko-KR": "카드 수치 (Card Parameters)",
    },
    status: {
        "zh-CN": "状态",
        "zh-TW": "狀態",
        "ja-JP": "状態",
        "en-US": "Status",
        "ko-KR": "상태",
    },
    performance: {
        "zh-CN": "表现力 (Performance)",
        "zh-TW": "表現力 (Performance)",
        "ja-JP": "パフォーマンス (Performance)",
        "en-US": "Performance",
        "ko-KR": "퍼포먼스 (Performance)",
    },
    technique: {
        "zh-CN": "技巧 (Technique)",
        "zh-TW": "技巧 (Technique)",
        "ja-JP": "テクニック (Technique)",
        "en-US": "Technique",
        "ko-KR": "테크닉 (Technique)",
    },
    stamina: {
        "zh-CN": "体能 (Stamina)",
        "zh-TW": "體能 (Stamina)",
        "ja-JP": "スタミナ (Stamina)",
        "en-US": "Stamina",
        "ko-KR": "스태미나 (Stamina)",
    },
    totalPower: {
        "zh-CN": "综合力 (Total Power)",
        "zh-TW": "綜合力 (Total Power)",
        "ja-JP": "総合力 (Total Power)",
        "en-US": "Total Power",
        "ko-KR": "종합력 (Total Power)",
    },
    normalUntrained: {
        "zh-CN": "通常 / 特训前",
        "zh-TW": "通常 / 特訓前",
        "ja-JP": "通常 / 特訓前",
        "en-US": "Normal / Untrained",
        "ko-KR": "통상 / 특훈 전",
    },
    trained: {
        "zh-CN": "特训后 / 开花后",
        "zh-TW": "特訓後 / 開花後",
        "ja-JP": "特訓後",
        "en-US": "Trained",
        "ko-KR": "특훈 후",
    },
    featuredEvent: {
        "zh-CN": "登场活动",
        "zh-TW": "登場活動",
        "ja-JP": "登場イベント",
        "en-US": "Featured Event",
        "ko-KR": "등장 이벤트",
    },
    songTitle: {
        "zh-CN": "歌曲名称",
        "zh-TW": "歌曲名稱",
        "ja-JP": "楽曲名",
        "en-US": "Song Title",
        "ko-KR": "악곡명",
    },
    lyricist: {
        "zh-CN": "作词",
        "zh-TW": "作詞",
        "ja-JP": "作詞",
        "en-US": "Lyricist",
        "ko-KR": "작사",
    },
    composer: {
        "zh-CN": "作曲",
        "zh-TW": "作曲",
        "ja-JP": "作曲",
        "en-US": "Composer",
        "ko-KR": "작곡",
    },
    eventName: {
        "zh-CN": "活动名称",
        "zh-TW": "活動名稱",
        "ja-JP": "イベント名",
        "en-US": "Event Name",
        "ko-KR": "이벤트 이름",
    },
    eventType: {
        "zh-CN": "活动类型",
        "zh-TW": "活動類型",
        "ja-JP": "イベントタイプ",
        "en-US": "Event Type",
        "ko-KR": "이벤트 타입",
    },
    startTime: {
        "zh-CN": "开始时间",
        "zh-TW": "開始時間",
        "ja-JP": "開始日時",
        "en-US": "Start Time",
        "ko-KR": "시작 시간",
    },
    endTime: {
        "zh-CN": "结束时间",
        "zh-TW": "結束時間",
        "ja-JP": "終了日時",
        "en-US": "End Time",
        "ko-KR": "종료 시간",
    },
    gachaName: {
        "zh-CN": "扭蛋名称",
        "zh-TW": "轉蛋名稱",
        "ja-JP": "ガチャ名",
        "en-US": "Gacha Name",
        "ko-KR": "가챠 이름",
    },
    gachaType: {
        "zh-CN": "卡池类型",
        "zh-TW": "卡池類型",
        "ja-JP": "ガチャタイプ",
        "en-US": "Gacha Type",
        "ko-KR": "가챠 타입",
    },
    characterProfileSuffix: {
        "zh-CN": "角色资料、卡牌图鉴与关联乐曲",
        "zh-TW": "角色資料、卡牌圖鑑與關聯樂曲",
        "ja-JP": "キャラクター情報・カード図鑑・関連楽曲",
        "en-US": "Character profile, card list, and related songs",
        "ko-KR": "캐릭터 프로필, 카드 도감 및 관련 악곡",
    },
    costumeDetailSuffix: {
        "zh-CN": "服装模型与部件详情",
        "zh-TW": "服裝模型與部件詳情",
        "ja-JP": "衣装モデルとパーツ詳細",
        "en-US": "Costume 3D model and part details",
        "ko-KR": "의상 모델 및 파츠 상세",
    },
    liveName: {
        "zh-CN": "演出名称",
        "zh-TW": "演出名稱",
        "ja-JP": "ライブ名",
        "en-US": "Live Name",
        "ko-KR": "라이브 이름",
    },
    fixtureName: {
        "zh-CN": "设施名称",
        "zh-TW": "設施名稱",
        "ja-JP": "施設名",
        "en-US": "Fixture Name",
        "ko-KR": "시설 이름",
    },
    descriptionLabel: {
        "zh-CN": "介绍说明",
        "zh-TW": "介紹說明",
        "ja-JP": "説明",
        "en-US": "Description",
        "ko-KR": "설명",
    },
    mangaSuffix: {
        "zh-CN": "Project SEKAI 官方四格漫画",
        "zh-TW": "Project SEKAI 官方四格漫畫",
        "ja-JP": "Project SEKAI 公式4コママンガ",
        "en-US": "Project SEKAI Official 4-koma Manga",
        "ko-KR": "Project SEKAI 공식 4컷 만화",
    },
    exchangeItemName: {
        "zh-CN": "兑换项名称",
        "zh-TW": "兌換項名稱",
        "ja-JP": "交換アイテム名",
        "en-US": "Exchange Item Name",
        "ko-KR": "교환 항목 이름",
    },
    exchangeShop: {
        "zh-CN": "兑换所",
        "zh-TW": "交換所",
        "ja-JP": "交換所",
        "en-US": "Exchange Shop",
        "ko-KR": "교환소",
    },
    category: {
        "zh-CN": "分类",
        "zh-TW": "分類",
        "ja-JP": "カテゴリ",
        "en-US": "Category",
        "ko-KR": "분류",
    },
};

function lbl(key: keyof typeof SEO_LABELS, loc: UiLocale): string {
    return SEO_LABELS[key]?.[loc] || SEO_LABELS[key]?.["zh-CN"] || key;
}

function formatDateSafe(val?: number | string | null): string {
    if (!val) return "";
    const num = Number(val);
    if (!Number.isNaN(num) && num > 0) {
        try {
            return new Date(num).toISOString().split("T")[0];
        } catch {
            return String(val);
        }
    }
    return String(val);
}

function renderCardSemantic(card: CardMeta, title: string, loc: UiLocale) {
    const charaName = CHARACTER_NAMES[card.characterId] || "";
    const normalPower = card.power?.normal;
    const trainedPower = card.power?.trained;

    return (
        <>
            <h1>{title}</h1>
            <p>
                {charaName ? `${charaName} - ` : ""}{card.prefix} | {card.rarity} | {card.attr}
                {card.releaseAt ? ` | ${lbl("releaseDate", loc)}: ${formatDateSafe(card.releaseAt)}` : ""}
            </p>

            {card.power && (
                <table>
                    <caption>{lbl("cardParameters", loc)}</caption>
                    <thead>
                        <tr>
                            <th scope="col">{lbl("status", loc)}</th>
                            <th scope="col">{lbl("performance", loc)}</th>
                            <th scope="col">{lbl("technique", loc)}</th>
                            <th scope="col">{lbl("stamina", loc)}</th>
                            <th scope="col">{lbl("totalPower", loc)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {normalPower && (
                            <tr>
                                <td>{lbl("normalUntrained", loc)}</td>
                                <td>{normalPower.performance}</td>
                                <td>{normalPower.technique}</td>
                                <td>{normalPower.stamina}</td>
                                <td>{normalPower.total}</td>
                            </tr>
                        )}
                        {trainedPower && (
                            <tr>
                                <td>{lbl("trained", loc)}</td>
                                <td>{trainedPower.performance}</td>
                                <td>{trainedPower.technique}</td>
                                <td>{trainedPower.stamina}</td>
                                <td>{trainedPower.total}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}

            {(card.skillName || card.skillDesc) && (
                <dl>
                    <dt>{lbl("skillName", loc)}</dt>
                    <dd>{card.skillName || lbl("none", loc)}</dd>
                    <dt>{lbl("skillDesc", loc)}</dt>
                    <dd>{card.skillDesc || lbl("none", loc)}</dd>
                </dl>
            )}

            {card.event && (
                <ul>
                    <li>{lbl("featuredEvent", loc)}: {card.event.name}</li>
                </ul>
            )}
        </>
    );
}

function renderMusicSemantic(music: MusicMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{music.title || title}</h1>
            <dl>
                <dt>{lbl("songTitle", loc)}</dt>
                <dd>{music.title}</dd>
                {music.lyricist && (
                    <>
                        <dt>{lbl("lyricist", loc)}</dt>
                        <dd>{music.lyricist}</dd>
                    </>
                )}
                {music.composer && (
                    <>
                        <dt>{lbl("composer", loc)}</dt>
                        <dd>{music.composer}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function renderEventSemantic(event: EventMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{event.name || title}</h1>
            <dl>
                <dt>{lbl("eventName", loc)}</dt>
                <dd>{event.name}</dd>
                {event.type && (
                    <>
                        <dt>{lbl("eventType", loc)}</dt>
                        <dd>{event.type}</dd>
                    </>
                )}
                {event.startAt && (
                    <>
                        <dt>{lbl("startTime", loc)}</dt>
                        <dd>{formatDateSafe(event.startAt)}</dd>
                    </>
                )}
                {event.endAt && (
                    <>
                        <dt>{lbl("endTime", loc)}</dt>
                        <dd>{formatDateSafe(event.endAt)}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function renderGachaSemantic(gacha: GachaMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{gacha.name || title}</h1>
            <dl>
                <dt>{lbl("gachaName", loc)}</dt>
                <dd>{gacha.name}</dd>
                {gacha.type && (
                    <>
                        <dt>{lbl("gachaType", loc)}</dt>
                        <dd>{gacha.type}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function renderCharacterSemantic(character: CharacterMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{character.name || title}</h1>
            <p>{character.name} Project SEKAI {lbl("characterProfileSuffix", loc)}</p>
        </>
    );
}

function renderCostumeSemantic(costume: CostumeMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{costume.name || title}</h1>
            <p>{costume.name} Project SEKAI {lbl("costumeDetailSuffix", loc)}</p>
        </>
    );
}

function renderVirtualLiveSemantic(vl: VirtualLiveMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{vl.name || title}</h1>
            <dl>
                <dt>{lbl("liveName", loc)}</dt>
                <dd>{vl.name}</dd>
                {vl.startAt && (
                    <>
                        <dt>{lbl("startTime", loc)}</dt>
                        <dd>{formatDateSafe(vl.startAt)}</dd>
                    </>
                )}
                {vl.endAt && (
                    <>
                        <dt>{lbl("endTime", loc)}</dt>
                        <dd>{formatDateSafe(vl.endAt)}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function renderFixtureSemantic(fixture: FixtureMeta, title: string, loc: UiLocale) {
    const hasFlavor = Boolean(fixture.flavor && fixture.flavor.trim() !== "" && fixture.flavor.trim() !== fixture.name.trim());
    return (
        <>
            <h1>{fixture.name || title}</h1>
            <dl>
                <dt>{lbl("fixtureName", loc)}</dt>
                <dd>{fixture.name}</dd>
                {hasFlavor && (
                    <>
                        <dt>{lbl("descriptionLabel", loc)}</dt>
                        <dd>{fixture.flavor}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

function renderMangaSemantic(manga: MangaMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{manga.title || title}</h1>
            <p>{manga.title} {lbl("mangaSuffix", loc)}</p>
        </>
    );
}

function renderExchangeSemantic(exchange: ExchangeMeta, title: string, loc: UiLocale) {
    return (
        <>
            <h1>{exchange.name || title}</h1>
            <dl>
                <dt>{lbl("exchangeItemName", loc)}</dt>
                <dd>{exchange.name}</dd>
                {exchange.summaryName && (
                    <>
                        <dt>{lbl("exchangeShop", loc)}</dt>
                        <dd>{exchange.summaryName}</dd>
                    </>
                )}
                {exchange.category && (
                    <>
                        <dt>{lbl("category", loc)}</dt>
                        <dd>{exchange.category}</dd>
                    </>
                )}
            </dl>
        </>
    );
}

export default function DetailSemanticSeoShell({
    title,
    description,
    locale,
    semantic,
}: DetailSemanticSeoShellProps) {
    const { locale: contextLocale } = useI18n();
    const loc: UiLocale = locale || contextLocale || "zh-CN";

    let content: ReactNode = null;

    if (semantic && semantic.data) {
        switch (semantic.kind) {
            case "card":
                content = renderCardSemantic(semantic.data as CardMeta, title, loc);
                break;
            case "music":
            case "lyrics":
                content = renderMusicSemantic(semantic.data as MusicMeta, title, loc);
                break;
            case "event":
                content = renderEventSemantic(semantic.data as EventMeta, title, loc);
                break;
            case "gacha":
                content = renderGachaSemantic(semantic.data as GachaMeta, title, loc);
                break;
            case "character":
                content = renderCharacterSemantic(semantic.data as CharacterMeta, title, loc);
                break;
            case "costume":
                content = renderCostumeSemantic(semantic.data as CostumeMeta, title, loc);
                break;
            case "virtualLive":
                content = renderVirtualLiveSemantic(semantic.data as VirtualLiveMeta, title, loc);
                break;
            case "mysekai":
                content = renderFixtureSemantic(semantic.data as FixtureMeta, title, loc);
                break;
            case "manga":
                content = renderMangaSemantic(semantic.data as MangaMeta, title, loc);
                break;
            case "exchange":
            case "exchanges":
                content = renderExchangeSemantic(semantic.data as ExchangeMeta, title, loc);
                break;
            default:
                content = (
                    <>
                        <h1>{title}</h1>
                        <p>{description}</p>
                    </>
                );
        }
    } else {
        content = (
            <>
                <h1>{title}</h1>
                <p>{description}</p>
            </>
        );
    }

    return (
        <article className="sr-only" aria-label={title}>
            {content}
            <p>{description}</p>
        </article>
    );
}
