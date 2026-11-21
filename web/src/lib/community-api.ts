/**
 * Client for moesekai-api /api/community/* endpoints.
 * All GET requests append a per-request cache-buster via uncachedUrl() so edge caches never leak
 * authenticated or shadowbanned content across visitors.
 */

import { MOESEKAI_API_ORIGIN, apiCredentials, uncachedUrl } from "./moesekai-api-origin";
import { markSignedOut } from "./moesekai-account";
import type { MessageInterpolationValues } from "./i18n/format";
import type { UiLocale } from "./i18n/locales";
import type {
    BlockedUserItem,
    CommentItem,
    CommentMutationResponse,
    CommentRepliesResponse,
    CommentSort,
    CommunityMeResponse,
    CommunityMode,
    CommunityProfile,
    ContentLang,
    CustomWordRule,
    EntityLinkType,
    ModActionType,
    ModAppealItem,
    ModAuditItem,
    ModModeResponse,
    ModPendingItem,
    ModQueueResponse,
    ModQueueTab,
    ModReportItem,
    ModTargetType,
    ModerationEvent,
    NotificationsResponse,
    PostCategory,
    PostItem,
    PostListResponse,
    PostMutationResponse,
    PostSort,
    ReactionResponse,
    ReportReason,
    RuleMatchType,
    RuleTier,
    ServerTag,
    TargetType,
    ThreadCommentsResponse,
} from "@/types/community";

const REQUEST_TIMEOUT_MS = 20_000;

export interface CommunityApiErrorPayload {
    error?: string;
    message?: string;
    retry_after_sec?: number;
    reason?: string;
    moderation_id?: number;
    muted_until?: string;
}

export class CommunityApiError extends Error {
    public readonly status: number;
    public readonly code: string;
    public readonly serverMessage?: string;
    public readonly retryAfterSec?: number;
    public readonly reason?: string;
    public readonly moderationId?: number;
    public readonly mutedUntil?: string;

    constructor(status: number, code: string, payload?: CommunityApiErrorPayload) {
        super(code);
        this.name = "CommunityApiError";
        this.status = status;
        this.code = code;
        this.serverMessage = typeof payload?.message === "string" ? payload.message : undefined;
        this.retryAfterSec =
            typeof payload?.retry_after_sec === "number" && Number.isFinite(payload.retry_after_sec)
                ? payload.retry_after_sec
                : undefined;
        this.reason = typeof payload?.reason === "string" ? payload.reason : undefined;
        this.moderationId =
            typeof payload?.moderation_id === "number" && Number.isFinite(payload.moderation_id)
                ? payload.moderation_id
                : undefined;
        this.mutedUntil = typeof payload?.muted_until === "string" ? payload.muted_until : undefined;
    }
}

export function isCommunityApiError(error: unknown): error is CommunityApiError {
    return error instanceof CommunityApiError;
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const method = (init.method ?? "GET").toUpperCase();
        const url = `${MOESEKAI_API_ORIGIN}${path}`;
        const finalUrl = method === "GET" ? uncachedUrl(url) : url;
        const headers: Record<string, string> = {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
        };
        return await fetch(finalUrl, {
            ...init,
            method,
            headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
            credentials: apiCredentials(MOESEKAI_API_ORIGIN),
            cache: "no-store",
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function parseError(response: Response): Promise<CommunityApiError> {
    let payload: CommunityApiErrorPayload = {};
    try {
        const parsed = (await response.json()) as unknown;
        if (parsed && typeof parsed === "object") {
            payload = parsed as CommunityApiErrorPayload;
        }
    } catch {
        // Non-JSON error body
    }
    if (payload.retry_after_sec === undefined) {
        const headerVal = response.headers.get("Retry-After");
        if (headerVal) {
            const parsedSec = Number(headerVal);
            if (Number.isFinite(parsedSec) && parsedSec > 0) {
                payload.retry_after_sec = Math.ceil(parsedSec);
            }
        }
    }
    const code = typeof payload.error === "string" && payload.error ? payload.error : `http_${response.status}`;
    if (response.status === 401) {
        markSignedOut();
    }
    return new CommunityApiError(response.status, code, payload);
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await rawRequest(path, init);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new CommunityApiError(0, "request_timeout");
        }
        throw new CommunityApiError(0, "network_error");
    }
    if (!response.ok) {
        throw await parseError(response);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        if (typeof value === "boolean") {
            search.set(key, value ? "1" : "0");
        } else {
            search.set(key, String(value));
        }
    }
    const qs = search.toString();
    return qs ? `?${qs}` : "";
}

export function uiLocaleToContentLang(locale: UiLocale): ContentLang {
    if (locale === "zh-CN" || locale === "zh-TW") return "zh";
    if (locale === "ja-JP") return "ja";
    if (locale === "ko-KR") return "ko";
    return "en";
}

// ==================== Error Message Localization ====================

type TranslateFn = (key: string, values?: MessageInterpolationValues) => string;

const AVALON_REASON_KEYS: Record<string, string> = {
    political_sensitive: "common.comments.errors.rejectReasons.political_sensitive",
    harassment_abuse: "common.comments.errors.rejectReasons.harassment_abuse",
    fandom_flame_bait: "common.comments.errors.rejectReasons.fandom_flame_bait",
    nsfw_illegal: "common.comments.errors.rejectReasons.nsfw_illegal",
    spam_ad_doxxing: "common.comments.errors.rejectReasons.spam_ad_doxxing",
    policy_violation: "common.comments.errors.rejectReasons.policy_violation",
};

export function getCommunityErrorMessage(error: unknown, t: TranslateFn): string {
    if (!isCommunityApiError(error)) {
        return t("common.comments.errors.generic");
    }
    switch (error.code) {
        case "login_required":
            return t("common.comments.errors.loginRequired");
        case "policy_not_accepted":
            return t("common.comments.errors.policyNotAccepted");
        case "user_muted":
            return error.mutedUntil
                ? t("common.comments.errors.userMutedUntil", { until: error.mutedUntil })
                : t("common.comments.errors.userMuted");
        case "thread_locked":
            return t("common.comments.errors.threadLocked");
        case "turnstile_failed":
            return t("common.comments.errors.turnstileFailed");
        case "author_blocked":
            return t("common.comments.errors.authorBlocked");
        case "rate_limited":
            return error.retryAfterSec
                ? t("common.comments.errors.rateLimitedSeconds", { seconds: error.retryAfterSec })
                : t("common.comments.errors.rateLimited");
        case "community_read_only":
            return t("common.comments.errors.readOnly");
        case "community_unavailable":
        case "auth_unavailable":
        case "unavailable":
        case "upstream_unavailable":
            return t("common.comments.errors.unavailable");
        case "content_rejected": {
            const reasonKey = error.reason ? AVALON_REASON_KEYS[error.reason] : undefined;
            if (reasonKey) {
                return t("common.comments.errors.contentRejectedReason", { reason: t(reasonKey) });
            }
            return t("common.comments.errors.contentRejected");
        }
        case "duplicate_content":
            return t("common.comments.errors.duplicateContent");
        case "empty_content":
            return t("common.comments.errors.emptyContent");
        case "content_too_long":
            return t("common.comments.errors.contentTooLong");
        case "links_not_allowed":
            return t("common.comments.errors.linksNotAllowed");
        case "too_many_tags":
            return t("common.comments.errors.tooManyTags");
        case "already_reported":
            return t("common.comments.errors.alreadyReported");
        case "already_appealed":
            return t("common.comments.errors.alreadyAppealed");
        case "forbidden":
        case "forbidden_origin":
            return t("common.comments.errors.forbidden");
        case "not_found":
            return t("common.comments.errors.notFound");
        case "request_timeout":
        case "network_error":
            return t("common.comments.errors.network");
        default:
            return t("common.comments.errors.generic");
    }
}

// ==================== 1-4. Session & Profiles ====================

export function fetchCommunityMe(): Promise<CommunityMeResponse> {
    return requestJson<CommunityMeResponse>("/api/community/me");
}

export interface UpdateCommunityPreferencesInput {
    accept_policy?: true;
    show_verified_badges?: boolean;
    bio?: string;
    hidden_categories?: PostCategory[];
    hidden_tags?: string[];
    favorite_stamps?: number[];
}

export async function updateCommunityPreferences(
    input: UpdateCommunityPreferencesInput,
): Promise<CommunityProfile> {
    const res = await requestJson<{ profile: CommunityProfile }>("/api/community/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    return res.profile;
}

export async function fetchCommunityUser(sub: string): Promise<CommunityProfile> {
    const res = await requestJson<{ profile: CommunityProfile }>(
        `/api/community/users/${encodeURIComponent(sub)}`,
    );
    return res.profile;
}

export function fetchCommunityUserPosts(
    sub: string,
    params: { cursor?: string; limit?: number } = {},
): Promise<PostListResponse> {
    return requestJson<PostListResponse>(
        `/api/community/users/${encodeURIComponent(sub)}/posts${buildQuery(params)}`,
    );
}

// ==================== 5-9. Posts ====================

export interface FetchPostsParams {
    category?: PostCategory | "";
    lang?: ContentLang | "";
    prefer_lang?: ContentLang | "";
    server?: ServerTag | "";
    tag?: string;
    entity_type?: EntityLinkType | "";
    entity_id?: string;
    search?: string;
    sort?: PostSort;
    include_hidden?: boolean;
    cursor?: string;
    limit?: number;
}

export function fetchCommunityPosts(params: FetchPostsParams = {}): Promise<PostListResponse> {
    return requestJson<PostListResponse>(
        `/api/community/posts${buildQuery({
            category: params.category || undefined,
            lang: params.lang || undefined,
            prefer_lang: params.prefer_lang || undefined,
            server: params.server && params.server !== "all" ? params.server : undefined,
            tag: params.tag || undefined,
            entity_type: params.entity_type || undefined,
            entity_id: params.entity_id || undefined,
            search: params.search || undefined,
            sort: params.sort || undefined,
            include_hidden: params.include_hidden ? 1 : undefined,
            cursor: params.cursor || undefined,
            limit: params.limit || undefined,
        })}`,
    );
}

export interface CreatePostInput {
    category: PostCategory;
    server_tag?: ServerTag;
    title: string;
    body_md: string;
    tags?: string[];
    is_spoiler?: boolean;
    turnstile_token?: string;
}

export function createCommunityPost(input: CreatePostInput): Promise<PostMutationResponse> {
    return requestJson<PostMutationResponse>("/api/community/posts", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function fetchCommunityPost(id: number | string): Promise<PostItem> {
    const res = await requestJson<{ post: PostItem }>(
        `/api/community/posts/${encodeURIComponent(String(id))}`,
    );
    return res.post;
}

export interface UpdatePostInput {
    category?: PostCategory;
    server_tag?: ServerTag;
    title?: string;
    body_md?: string;
    tags?: string[];
    is_spoiler?: boolean;
}

export function updateCommunityPost(
    id: number | string,
    input: UpdatePostInput,
): Promise<PostMutationResponse> {
    return requestJson<PostMutationResponse>(
        `/api/community/posts/${encodeURIComponent(String(id))}`,
        {
            method: "PATCH",
            body: JSON.stringify(input),
        },
    );
}

export function deleteCommunityPost(id: number | string): Promise<void> {
    return requestJson<void>(`/api/community/posts/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
    });
}

// ==================== 10-13. Threads & Comments ====================

export interface FetchCommentsParams {
    sort?: CommentSort;
    owned_only?: boolean;
    cursor?: string;
    limit?: number;
}

export function fetchThreadComments(
    targetType: TargetType,
    targetId: string | number,
    params: FetchCommentsParams = {},
): Promise<ThreadCommentsResponse> {
    return requestJson<ThreadCommentsResponse>(
        `/api/community/threads/${encodeURIComponent(targetType)}/${encodeURIComponent(String(targetId))}/comments${buildQuery({
            sort: params.sort,
            owned_only: params.owned_only ? 1 : 0,
            cursor: params.cursor,
            limit: params.limit,
        })}`,
    );
}

export interface CreateCommentInput {
    body_md: string;
    reply_to_id?: number;
    is_spoiler?: boolean;
    turnstile_token?: string;
}

export function createThreadComment(
    targetType: TargetType,
    targetId: string | number,
    input: CreateCommentInput,
): Promise<CommentMutationResponse> {
    return requestJson<CommentMutationResponse>(
        `/api/community/threads/${encodeURIComponent(targetType)}/${encodeURIComponent(String(targetId))}/comments`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function fetchCommentReplies(
    commentId: number,
    params: { cursor?: string; limit?: number } = {},
): Promise<CommentRepliesResponse> {
    return requestJson<CommentRepliesResponse>(
        `/api/community/comments/${encodeURIComponent(String(commentId))}/replies${buildQuery(params)}`,
    );
}

export function deleteComment(commentId: number): Promise<void> {
    return requestJson<void>(`/api/community/comments/${encodeURIComponent(String(commentId))}`, {
        method: "DELETE",
    });
}

// ==================== 14-15. Reactions ====================

export function likeTarget(targetType: "post" | "comment", targetId: number): Promise<ReactionResponse> {
    return requestJson<ReactionResponse>("/api/community/reactions", {
        method: "POST",
        body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            reaction: "like",
        }),
    });
}

export function unlikeTarget(targetType: "post" | "comment", targetId: number): Promise<ReactionResponse> {
    return requestJson<ReactionResponse>(
        `/api/community/reactions${buildQuery({
            target_type: targetType,
            target_id: targetId,
            reaction: "like",
        })}`,
        {
            method: "DELETE",
        },
    );
}

// ==================== 16-19. Blocks, Reports, Appeals ====================

export async function fetchBlockedUsers(): Promise<BlockedUserItem[]> {
    const res = await requestJson<{ items: BlockedUserItem[] }>("/api/community/blocks");
    return res.items;
}

export function blockUser(sub: string): Promise<{ blocked: boolean }> {
    return requestJson<{ blocked: boolean }>(`/api/community/blocks/${encodeURIComponent(sub)}`, {
        method: "POST",
    });
}

export function unblockUser(sub: string): Promise<{ blocked: boolean }> {
    return requestJson<{ blocked: boolean }>(`/api/community/blocks/${encodeURIComponent(sub)}`, {
        method: "DELETE",
    });
}

export interface CreateReportInput {
    target_type: "post" | "comment";
    target_id: number;
    reason: ReportReason;
    detail?: string;
    turnstile_token?: string;
}

export function createReport(input: CreateReportInput): Promise<{ id: number; auto_collapsed: boolean }> {
    return requestJson<{ id: number; auto_collapsed: boolean }>("/api/community/reports", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export interface CreateAppealInput {
    target_type: "post" | "comment";
    target_id: number;
    reason: string;
    moderation_event_id?: number;
    turnstile_token?: string;
}

export function createAppeal(input: CreateAppealInput): Promise<{ id: number; status: string }> {
    return requestJson<{ id: number; status: string }>("/api/community/appeals", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

// ==================== 20-21. Notifications ====================

export function fetchNotifications(
    params: { unread_only?: boolean; cursor?: string; limit?: number } = {},
): Promise<NotificationsResponse> {
    return requestJson<NotificationsResponse>(
        `/api/community/notifications${buildQuery({
            unread_only: params.unread_only ? 1 : 0,
            cursor: params.cursor,
            limit: params.limit,
        })}`,
    );
}

export function markNotificationsRead(input: { ids?: number[]; all?: boolean }): Promise<{ unread_count: number }> {
    return requestJson<{ unread_count: number }>("/api/community/notifications/read", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

// ==================== 22-27. Moderation ====================

export function fetchModQueue(
    tab: "pending",
    params?: { cursor?: string; limit?: number },
): Promise<ModQueueResponse<ModPendingItem>>;
export function fetchModQueue(
    tab: "reports",
    params?: { cursor?: string; limit?: number },
): Promise<ModQueueResponse<ModReportItem>>;
export function fetchModQueue(
    tab: "appeals",
    params?: { cursor?: string; limit?: number },
): Promise<ModQueueResponse<ModAppealItem>>;
export function fetchModQueue(
    tab: "events",
    params?: { cursor?: string; limit?: number },
): Promise<ModQueueResponse<ModerationEvent>>;
export function fetchModQueue(
    tab: ModQueueTab,
    params: { cursor?: string; limit?: number } = {},
): Promise<ModQueueResponse<unknown>> {
    return requestJson<ModQueueResponse<unknown>>(
        `/api/community/mod/queue${buildQuery({ tab, cursor: params.cursor, limit: params.limit })}`,
    );
}

export interface ModActionInput {
    action: ModActionType;
    target_type: ModTargetType;
    target_id: string;
    reason?: string;
    health_delta?: number;
    mute_hours?: number;
    trust_level?: number;
}

export function submitModAction(input: ModActionInput): Promise<{ ok: boolean; audit_id: number }> {
    return requestJson<{ ok: boolean; audit_id: number }>("/api/community/mod/actions", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function fetchModRules(): Promise<CustomWordRule[]> {
    const res = await requestJson<{ items: CustomWordRule[] }>("/api/community/mod/rules");
    return res.items;
}

export interface UpsertModRuleInput {
    id?: number;
    tier: RuleTier;
    match_type: RuleMatchType;
    pattern: string;
    note?: string;
    enabled?: boolean;
}

export function upsertModRule(
    input: UpsertModRuleInput,
): Promise<{ rule: CustomWordRule | null; items: CustomWordRule[] }> {
    return requestJson<{ rule: CustomWordRule | null; items: CustomWordRule[] }>("/api/community/mod/rules", {
        method: "PUT",
        body: JSON.stringify({ op: "upsert", ...input }),
    });
}

export function deleteModRule(
    id: number,
): Promise<{ rule: CustomWordRule | null; items: CustomWordRule[] }> {
    return requestJson<{ rule: CustomWordRule | null; items: CustomWordRule[] }>("/api/community/mod/rules", {
        method: "PUT",
        body: JSON.stringify({ op: "delete", id }),
    });
}

export function fetchModMode(): Promise<ModModeResponse> {
    return requestJson<ModModeResponse>("/api/community/mod/mode");
}

export function setModMode(mode: CommunityMode, reason?: string): Promise<ModModeResponse> {
    return requestJson<ModModeResponse>("/api/community/mod/mode", {
        method: "PUT",
        body: JSON.stringify({ mode, reason }),
    });
}

export function fetchModAudit(
    params: { cursor?: string; limit?: number } = {},
): Promise<{ items: ModAuditItem[]; next_cursor: string | null }> {
    return requestJson<{ items: ModAuditItem[]; next_cursor: string | null }>(
        `/api/community/mod/audit${buildQuery(params)}`,
    );
}

// Re-export CommentItem for callers importing alongside API functions.
export type { CommentItem };
