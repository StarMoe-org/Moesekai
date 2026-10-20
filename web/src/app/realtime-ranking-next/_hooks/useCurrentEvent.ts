"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchEventList } from "@/lib/prediction-api";
import { fetchRealtimeRankingEvents } from "@/lib/realtime-ranking-api";
import { RealtimeRankingRegion } from "@/types/realtime-ranking-next";
import { IEventInfo } from "@/types/events";
import { EventListItem } from "@/types/prediction";

/** Normalize a possibly-seconds timestamp to milliseconds. */
function toMs(value: number): number {
    return value < 10_000_000_000 ? value * 1000 : value;
}

interface SnapshotEventInfo {
    eventId: number;
    startAt: number;
    endAt: number;
}

/**
 * Resolves the current event (name / cover / schedule) for the cover-progress
 * card, mirroring the legacy /realtime-ranking behaviour:
 *  - prediction event-list (CN/JP) provides the active event id + schedule,
 *  - realtime-ranking events.json provides the name / assetbundle / type,
 *  - the live snapshot timestamps take precedence when they match.
 * Falls back to a snapshot-derived placeholder event when lookups fail.
 * Nothing is looked up while `enabled` is false (the region is not settled yet).
 */
export function useCurrentEvent(
    region: RealtimeRankingRegion,
    snapshot: SnapshotEventInfo | null,
    enabled: boolean,
): IEventInfo | null {
    const { t } = useI18n();
    const [currentEvent, setCurrentEvent] = useState<IEventInfo | null>(null);

    // Effect deps below cover the event identity / schedule; the snapshot object
    // identity changes every poll but these primitives stay stable, so we capture
    // them directly instead of holding a render-mutated ref.
    const eventId = snapshot?.eventId;
    const startAt = snapshot?.startAt;
    const endAt = snapshot?.endAt;

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        const snapshotEvent: SnapshotEventInfo | null =
            eventId != null && startAt != null && endAt != null
                ? { eventId, startAt, endAt }
                : null;

        const buildFromSnapshot = (base: SnapshotEventInfo | null): IEventInfo | null => {
            if (!base) return null;
            return {
                id: base.eventId,
                name: t("page.realtimeRanking.eventFallback", { id: base.eventId }),
                eventType: "marathon",
                assetbundleName: "",
                bgmAssetbundleName: "",
                eventOnlyComponentDisplayStartAt: base.startAt,
                startAt: base.startAt,
                aggregateAt: base.endAt,
                rankingAnnounceAt: base.endAt,
                distributionStartAt: base.endAt,
                eventOnlyComponentDisplayEndAt: base.endAt,
                closedAt: base.endAt,
                distributionEndAt: base.endAt,
                virtualLiveId: 0,
                unit: "",
                isCountLeaderCharacterPlay: false,
            };
        };

        async function loadCurrentEvent() {
            try {
                const [eventListResult, masterEvents] = await Promise.all([
                    (region === "cn" || region === "jp"
                        ? fetchEventList(region)
                        : Promise.resolve([] as EventListItem[])
                    ).catch(() => [] as EventListItem[]),
                    fetchRealtimeRankingEvents(region).catch(() => [] as IEventInfo[]),
                ]);

                if (cancelled) return;

                const activeEvent = [...eventListResult]
                    .sort((a, b) => a.id - b.id)
                    .find((event) => event.is_active);

                const resolvedId = activeEvent?.id ?? snapshotEvent?.eventId;
                if (!resolvedId) {
                    setCurrentEvent(null);
                    return;
                }

                const matched = masterEvents.find((event) => event.id === resolvedId);

                const s = snapshotEvent?.eventId === resolvedId
                    ? snapshotEvent.startAt
                    : activeEvent?.start_at
                        ? toMs(activeEvent.start_at)
                        : matched?.startAt;
                const e = snapshotEvent?.eventId === resolvedId
                    ? snapshotEvent.endAt
                    : activeEvent?.end_at
                        ? toMs(activeEvent.end_at)
                        : matched?.aggregateAt;

                const start = s || 0;
                const end = e || 0;

                const correctedEvent: IEventInfo = {
                    id: resolvedId,
                    name: matched?.name || activeEvent?.name || t("page.realtimeRanking.eventFallback", { id: resolvedId }),
                    eventType: matched?.eventType || "marathon",
                    assetbundleName: matched?.assetbundleName || "",
                    bgmAssetbundleName: matched?.bgmAssetbundleName || "",
                    eventOnlyComponentDisplayStartAt: start,
                    startAt: start,
                    aggregateAt: end,
                    rankingAnnounceAt: end,
                    distributionStartAt: end,
                    eventOnlyComponentDisplayEndAt: end,
                    closedAt: end,
                    distributionEndAt: end,
                    virtualLiveId: matched?.virtualLiveId || 0,
                    unit: matched?.unit || "",
                    isCountLeaderCharacterPlay: matched?.isCountLeaderCharacterPlay || false,
                };

                setCurrentEvent(correctedEvent);
            } catch {
                if (!cancelled) {
                    setCurrentEvent(buildFromSnapshot(snapshotEvent));
                }
            }
        }

        void loadCurrentEvent();

        return () => {
            cancelled = true;
        };
    }, [enabled, region, eventId, startAt, endAt, t]);

    return currentEvent;
}
