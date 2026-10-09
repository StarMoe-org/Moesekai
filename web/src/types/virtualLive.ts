// Virtual Live Types for Moesekai
// Based on sekai.best and Haruki master data structure

export type VirtualLiveType =
    | "normal"
    | "beginner"
    | "archive"
    | "cheerful_carnival"
    | "connect_live"
    | "streaming"
    | "virtual_message"
    | "solo_virtual_live";

export interface IVirtualLiveSchedule {
    id: number;
    virtualLiveId: number;
    seq: number;
    startAt: number;
    endAt: number;
    isAfterEvent?: boolean;
}

export interface IVirtualLiveSetlist {
    id: number;
    virtualLiveId: number;
    seq: number;
    virtualLiveSetlistType: "mc" | "music";
    assetbundleName: string;
    virtualLiveStageId: number;
    musicId?: number;
    musicVocalId?: number;
    character3dId1?: number;
    character3dId2?: number;
    character3dId3?: number;
    character3dId4?: number;
    character3dId5?: number;
}

export interface IVirtualLiveReward {
    id?: number;
    virtualLiveType: string;
    virtualLiveId?: number;
    resourceBoxId: number;
}

export interface IResourceBoxDetail {
    resourceBoxPurpose: string;
    resourceBoxId: number;
    seq: number;
    resourceType: string;
    resourceId?: number;
    resourceLevel?: number;
    resourceQuantity?: number;
}

export interface IResourceBoxInfo {
    resourceBoxPurpose: string;
    id: number;
    resourceBoxType?: string;
    description?: string;
    details?: IResourceBoxDetail[];
}

export interface ICompactResourceBoxDetails {
    __ENUM__?: {
        resourceBoxPurpose?: string[];
        resourceType?: string[];
        [key: string]: string[] | undefined;
    };
    resourceBoxId: number[];
    resourceBoxPurpose: Array<number | string>;
    resourceType: Array<number | string>;
    resourceId?: Array<number | undefined>;
    resourceLevel?: Array<number | undefined>;
    resourceQuantity?: Array<number | undefined>;
}

export interface IVirtualLiveInfo {
    id: number;
    virtualLiveType: VirtualLiveType;
    virtualLivePlatform: string;
    seq: number;
    name: string;
    assetbundleName: string;
    screenMvMusicVocalId?: number;
    startAt: number;
    endAt: number;
    rankingAnnounceAt?: number;
    virtualLiveSetlists?: IVirtualLiveSetlist[];
    virtualLiveBeginnerSchedules?: IVirtualLiveSchedule[];
    virtualLiveSchedules?: IVirtualLiveSchedule[];
    virtualLiveReward?: IVirtualLiveReward;
    virtualLiveRewards?: IVirtualLiveReward[];
}

export const VIRTUAL_LIVE_TYPE_IDS = ["normal", "beginner", "archive", "cheerful_carnival", "connect_live", "streaming", "virtual_message", "solo_virtual_live"] as const;
export const VIRTUAL_LIVE_TYPE_LABEL_KEYS: Record<VirtualLiveType, string> = {
    normal: "common.virtualLiveTypes.normal",
    beginner: "common.virtualLiveTypes.beginner",
    archive: "common.virtualLiveTypes.archive",
    cheerful_carnival: "common.virtualLiveTypes.cheerful_carnival",
    connect_live: "common.virtualLiveTypes.connect_live",
    streaming: "common.virtualLiveTypes.streaming",
    virtual_message: "common.virtualLiveTypes.virtual_message",
    solo_virtual_live: "common.virtualLiveTypes.solo_virtual_live",
};

/** Masterdata gains types before the dictionaries do: show the raw id, not the missing key. */
export function getVirtualLiveTypeLabel(type: string, t: (key: string) => string): string {
    const key = `common.virtualLiveTypes.${type}`;
    const label = t(key);
    return label === key ? type : label;
}

// Virtual live type colors
export const VIRTUAL_LIVE_TYPE_COLORS: Record<VirtualLiveType, string> = {
    normal: "#42A5F5",
    beginner: "#66BB6A",
    archive: "#9E9E9E",
    cheerful_carnival: "#FFB74D",
    connect_live: "#AB47BC",
    streaming: "#26C6DA",
    virtual_message: "#EC407A",
    solo_virtual_live: "#5C6BC0",
};

/**
 * Get virtual live status based on current time
 */
export type VirtualLiveStatus = "upcoming" | "ongoing" | "ended";

export function getVirtualLiveStatus(virtualLive: IVirtualLiveInfo): VirtualLiveStatus {
    const now = Date.now();
    if (now < virtualLive.startAt) return "upcoming";
    if (now > virtualLive.endAt) return "ended";
    return "ongoing";
}

/**
 * Get virtual live status display info
 */
export const VIRTUAL_LIVE_STATUS_DISPLAY: Record<VirtualLiveStatus, { labelKey: string; color: string }> = {
    upcoming: { labelKey: "common.status.upcoming", color: "#42A5F5" },
    ongoing: { labelKey: "common.status.ongoing", color: "#66BB6A" },
    ended: { labelKey: "common.status.ended", color: "#9E9E9E" },
};
