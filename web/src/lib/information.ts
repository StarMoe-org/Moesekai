
export type InformationServer = "jp" | "cn";
export type InformationBrowseType = "internal" | "external" | string;
export type InformationStatus = "upcoming" | "ongoing" | "ended" | "permanent";

export interface InformationItem {
    id: number;
    seq: number;
    displayOrder: number;
    informationType: string;
    informationTag: string;
    browseType: InformationBrowseType;
    platform: string;
    title: string;
    path: string;
    startAt: number;
    endAt?: number | null;
    bannerAssetbundleName?: string | null;
    channels?: string | null;
}

export interface InformationResponse {
    informations?: InformationItem[];
}

export const INFORMATION_API_BASE = "https://baijing.exmeaning.com";
export const JP_INFORMATION_WEB_BASE = "https://production-web.sekai.colorfulpalette.org";
export const JP_INFORMATION_IMAGE_BASE = `${JP_INFORMATION_WEB_BASE}/images/information`;
export const CN_INFORMATION_IMAGE_BASE = "https://lf3-mkcncdn-tos.dailygn.com/obj/lf-game-lf/gdl_app_5236/images/information";

export function getInformationUrl(server: InformationServer) {
    return `${INFORMATION_API_BASE}/${server}/information`;
}

export async function fetchInformationList(server: InformationServer): Promise<InformationItem[]> {
    const response = await fetch(`${getInformationUrl(server)}?_ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json() as InformationResponse;
    return Array.isArray(data.informations) ? data.informations : [];
}

export function getInformationBannerUrl(server: InformationServer, bannerAssetbundleName?: string | null) {
    if (!bannerAssetbundleName) return "";
    const encodedName = encodeURIComponent(bannerAssetbundleName);
    const base = server === "cn" ? CN_INFORMATION_IMAGE_BASE : JP_INFORMATION_IMAGE_BASE;
    return `${base}/${encodedName}.png`;
}

export function resolveInformationPath(server: InformationServer, item: Pick<InformationItem, "path">) {
    const path = item.path?.trim() ?? "";
    if (!path) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
    if (path.startsWith("//")) return `https:${path}`;

    if (server === "jp") {
        return `${JP_INFORMATION_WEB_BASE}/${path.replace(/^\/+/, "")}`;
    }

    return path.startsWith("/") ? path : `/${path}`;
}

export function getInformationStatus(item: Pick<InformationItem, "startAt" | "endAt">, now = Date.now()): InformationStatus {
    if (Number.isFinite(item.startAt) && item.startAt > now) return "upcoming";
    if (!item.endAt) return "permanent";
    if (item.endAt < now) return "ended";
    return "ongoing";
}

/** Category color for an information tag (categorical data color; not themed). */
export function getInformationTagTone(tag?: string) {
    switch (tag) {
        case "event":
            return "bg-pink-600 text-white";
        case "gacha":
            return "bg-purple-600 text-white";
        case "music":
            return "bg-sky-600 text-white";
        case "campaign":
            return "bg-amber-600 text-white";
        case "bug":
            return "bg-error text-on-error";
        case "update":
            return "bg-emerald-600 text-white";
        case "information":
            return "bg-primary text-on-primary";
        default:
            return "bg-secondary text-on-secondary";
    }
}

/** MD3 tonal status chip colors. */
export function getInformationStatusTone(status: InformationStatus) {
    switch (status) {
        case "upcoming":
            return "bg-tertiary-container text-on-tertiary-container ring-transparent";
        case "ongoing":
            return "bg-primary-container text-on-primary-container ring-transparent";
        case "ended":
            return "bg-surface-container-highest text-on-surface-variant ring-transparent";
        case "permanent":
        default:
            return "bg-secondary-container text-on-secondary-container ring-transparent";
    }
}

export function normalizeInformationServer(value?: string | null): InformationServer {
    return value === "cn" ? "cn" : "jp";
}
