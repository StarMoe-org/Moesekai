/**
 * Community system types and stable enum option definitions.
 * All UI labels are resolved through i18n keys (labelKey) rather than hardcoded strings.
 */

import type { StoryDocument, StoryVoiceManifest } from "./storyMaker";

export type CommunityMode = "normal" | "strict_review" | "read_only";
export type CommunityRole = "user" | "mod" | "admin";
export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export type PostCategory =
    | "general"
    | "showcase"
    | "review"
    | "story"
    | "community_story"
    | "guide"
    | "question"
    | "tiering";

export type StoryVoiceStatus =
    | "none"
    | "uploading"
    | "queued"
    | "processing"
    | "published"
    | "pending_review"
    | "rejected";

export type ServerTag = "all" | "jp" | "cn" | "tw" | "en" | "kr";
export type ContentLang = "zh" | "en" | "ja" | "ko" | "other";
export type ContentStatus =
    | "published"
    | "pending_review"
    | "shadowbanned"
    | "hidden"
    | "removed";

export type TargetType =
    | "post"
    | "card"
    | "music"
    | "event"
    | "gacha"
    | "costume"
    | "character"
    | "live"
    | "ranking"
    | "story";

export type EntityLinkType =
    | "card"
    | "music"
    | "event"
    | "gacha"
    | "costume"
    | "character"
    | "live";

export type ReportReason =
    | "political"
    | "harassment"
    | "flame_bait"
    | "nsfw"
    | "spam_ad"
    | "doxxing"
    | "spoiler"
    | "other";

export type NotificationType =
    | "reply_post"
    | "reply_comment"
    | "like_post"
    | "like_comment"
    | "mod_notice"
    | "appeal_result";

export type RuleTier = "p0_block" | "p1_review" | "whitelist";
export type RuleMatchType = "literal" | "regex";

export type PostSort = "hot" | "latest" | "featured";
export type CommentSort = "hot" | "latest";

export type ModQueueTab = "pending" | "reports" | "appeals" | "events";

export type ModActionType =
    | "approve"
    | "reject"
    | "hide"
    | "remove"
    | "shadowban"
    | "auto_spoiler"
    | "unspoiler"
    | "pin"
    | "unpin"
    | "feature"
    | "unfeature"
    | "lock_thread"
    | "unlock_thread"
    | "mute_user"
    | "unmute_user"
    | "set_trust_level"
    | "set_role"
    | "resolve_report"
    | "dismiss_report"
    | "approve_appeal"
    | "reject_appeal";

export interface ModActionRequest {
    action: ModActionType;
    target_type: ModTargetType;
    target_id: string;
    reason?: string;
    health_delta?: number;
    mute_hours?: number;
    trust_level?: number;
    role?: "user" | "mod";
}

export type ModTargetType =
    | "post"
    | "comment"
    | "user"
    | "thread"
    | "report"
    | "appeal";

export type ModerationNotice = "pending_review" | "auto_spoiler" | null;

// ==================== Core API Structs ====================

export interface VerifiedBadge {
    servers: string[];
    primary_server: string;
    haruki_verified: boolean;
}

export interface CardOwnershipBadge {
    owned: boolean;
    server: string;
    master_rank: number;
    skill_level: number;
    trained: boolean;
}

export interface AuthorSummary {
    sub: string;
    display_name: string;
    avatar_url: string;
    avatar_card_id?: number | null;
    avatar_card_trained?: boolean;
    trust_level: TrustLevel;
    role: CommunityRole;
    is_deleted: boolean;
    verified_badge: VerifiedBadge | null;
}

export interface CommunityProfile {
    sub: string;
    display_name: string;
    avatar_url: string;
    avatar_card_id?: number | null;
    avatar_card_trained?: boolean;
    bio: string;
    trust_level: TrustLevel;
    health_score?: number;
    role: CommunityRole;
    show_verified_badges: boolean;
    verified_badge: VerifiedBadge | null;
    has_verified_haruki?: boolean;
    muted_until?: string | null;
    policy_accepted_at?: string | null;
    hidden_categories?: PostCategory[];
    hidden_tags?: string[];
    favorite_stamps?: number[];
    post_count: number;
    comment_count: number;
    likes_received: number;
    created_at: string;
    is_blocked_by_me?: boolean;
}

export interface EntityLink {
    entity_type: EntityLinkType;
    entity_id: string;
}

export interface CommunityStorySummary {
    story_id: string;
    story_rev: number;
    region: string;
    source_locale: string;
    available_locales: string[];
    beat_count: number;
    has_voice_track: boolean;
    voice_status: StoryVoiceStatus;
    voice_locale: string;
    voice_manifest_url?: string;
    voice_clip_count: number;
    voice_duration_ms: number;
}

export interface PostItem {
    id: number;
    author: AuthorSummary;
    category: PostCategory;
    lang: ContentLang;
    server_tag: ServerTag;
    title: string;
    body_md: string;
    tags: string[];
    entity_links: EntityLink[];
    is_spoiler: boolean;
    is_pinned: boolean;
    is_featured: boolean;
    status: ContentStatus;
    like_count: number;
    comment_count: number;
    liked_by_me: boolean;
    thread_locked: boolean;
    can_edit: boolean;
    can_delete: boolean;
    story_summary?: CommunityStorySummary | null;
    story_doc?: StoryDocument;
    voice_manifest?: StoryVoiceManifest | null;
    created_at: string;
    updated_at: string;
}

export interface CommunityStoryPlayResponse {
    post_id: number;
    title: string;
    status: ContentStatus;
    author: AuthorSummary;
    story_summary: CommunityStorySummary;
    story_doc: StoryDocument;
    voice_manifest?: StoryVoiceManifest | null;
    voice_manifest_url: string;
    updated_at: string;
}

export interface StoryAudioClipMeta {
    beat_id: string;
    raw_sha256: string;
    filename?: string;
    duration_ms: number;
    size_bytes: number;
}

export interface StoryAudioDedupRequest {
    clips: Array<{
        beat_id: string;
        raw_sha256: string;
        duration_ms: number;
        size_bytes: number;
    }>;
}

export interface StoryAudioDedupResponse {
    reusable_hashes: string[];
    blocked_hashes: string[];
    need_upload_hashes: string[];
    remaining_daily_duration_ms: number;
}

export interface StoryAudioUploadInitRequest {
    rights_confirmed: true;
    voice_locale: string;
    archive_format: "tar" | "zip";
    archive_size_bytes: number;
    estimated_duration_ms?: number;
    clips: StoryAudioClipMeta[];
}

export interface StoryAudioUploadInitResponse {
    batch_id: string;
    status: StoryVoiceStatus;
    instant_published?: boolean;
    voice_manifest_url?: string;
    upload_put_url?: string;
    staging_object_key?: string;
    expires_in_sec?: number;
    total_clip_count: number;
    new_clip_count: number;
    reused_clip_count: number;
}

export interface StoryAudioUploadCompleteResponse {
    ok: boolean;
    batch_id: string;
    status: StoryVoiceStatus;
    staging_size_bytes: number;
}

export interface StoryAudioBatchSummary {
    batch_id: string;
    status: StoryVoiceStatus | "failed";
    voice_locale: string;
    total_clip_count: number;
    new_clip_count: number;
    reused_clip_count: number;
    estimated_duration_ms: number;
    failure_reason: string;
    summary: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface StoryAudioStatusResponse {
    post_id: number;
    story_id: string;
    story_rev: number;
    has_voice_track: boolean;
    voice_status: StoryVoiceStatus;
    voice_locale: string;
    voice_manifest_url: string;
    voice_clip_count: number;
    voice_duration_ms: number;
    latest_batch: StoryAudioBatchSummary | null;
}

export interface ModAudioFlaggedClip {
    beat_id: string;
    raw_sha256: string;
    clean_sha256: string;
    status: string;
    duration_ms: number;
    size_bytes: number;
    asr_transcript: string;
    detected_lang: string;
    acoustic_summary: string;
    scores: Record<string, unknown>;
    block_reason?: string;
    preview_url?: string;
}

export interface ModAudioQueueItem {
    batch_id: string;
    post_id: number;
    author_sub: string;
    story_rev: number;
    voice_locale: string;
    total_clip_count: number;
    estimated_duration_ms: number;
    summary: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    flagged_clips: ModAudioFlaggedClip[];
}

export interface ModAudioQueueResponse {
    items: ModAudioQueueItem[];
}

export interface ModAudioReviewRequest {
    action: "approve" | "reject";
    reason: string;
    health_delta?: number;
}

export interface ModAudioReviewResponse {
    ok: boolean;
    batch_id: string;
    batch_status: StoryVoiceStatus | "failed";
    voice_manifest_url?: string;
}

export interface CommentThread {
    id: number;
    target_type: TargetType;
    target_id: string;
    comment_count: number;
    locked: boolean;
}

export interface CommentItem {
    id: number;
    thread_id: number;
    target_type: TargetType;
    target_id: string;
    author: AuthorSummary;
    root_id: number | null;
    reply_to_id: number | null;
    reply_to_author: AuthorSummary | null;
    body_md: string;
    is_spoiler: boolean;
    author_card_badge: CardOwnershipBadge | null;
    status: ContentStatus;
    like_count: number;
    reply_count: number;
    liked_by_me: boolean;
    can_delete: boolean;
    preview_replies: CommentItem[];
    created_at: string;
}

export interface BlockedUserItem {
    blocked_sub: string;
    display_name: string;
    avatar_url: string;
    avatar_card_id?: number | null;
    avatar_card_trained?: boolean;
    created_at: string;
}

export interface CommunityNotification {
    id: number;
    type: NotificationType;
    actor: AuthorSummary | null;
    target_type: string;
    target_id: string;
    post_id: number | null;
    comment_id: number | null;
    excerpt: string;
    is_read: boolean;
    created_at: string;
}

export interface ModerationEvent {
    id: number;
    target_type: "post" | "comment" | "story_audio";
    target_id: number;
    author_sub: string;
    stage: "rule_l2" | "gemini_decisions_l3" | "report_l4" | "manual" | "colab_audio_l3";
    decision: "pass" | "auto_spoiler" | "flag" | "shadowban" | "block" | "remove";
    reason: string;
    scores: Record<string, unknown>;
    reviewer_sub: string | null;
    created_at: string;
}

export interface ModQueueCounts {
    pending_posts: number;
    pending_comments: number;
    open_reports: number;
    open_appeals: number;
}

export interface ModPendingItem {
    kind: "post" | "comment";
    id: number;
    status: "pending_review" | "hidden" | "shadowbanned";
    author: AuthorSummary;
    author_health_score: number;
    title: string;
    body_md: string;
    target_type: string;
    target_id: string;
    category: string;
    latest_event: ModerationEvent | null;
    report_count: number;
    created_at: string;
}

export interface ModReportItem {
    id: number;
    target_type: "post" | "comment";
    target_id: number;
    reason: ReportReason;
    detail: string;
    weight: number;
    status: "open" | "resolved" | "dismissed";
    reporter: AuthorSummary;
    target_excerpt: string;
    target_status: ContentStatus;
    target_author_sub: string;
    created_at: string;
}

export interface ModAppealItem {
    id: number;
    target_type: "post" | "comment";
    target_id: number;
    moderation_event_id: number | null;
    reason: string;
    status: "open" | "approved" | "rejected";
    appellant: AuthorSummary;
    target_excerpt: string;
    target_status: ContentStatus;
    created_at: string;
}

export interface CustomWordRule {
    id: number;
    tier: RuleTier;
    match_type: RuleMatchType;
    pattern: string;
    note: string;
    enabled: boolean;
    created_by: string;
    updated_at: string;
}

export interface ModAuditItem {
    id: number;
    actor_sub: string;
    actor_name: string;
    action: string;
    target_type: string;
    target_id: string;
    reason: string;
    detail: unknown;
    created_at: string;
}

// ==================== API Responses ====================

export interface CommunityMeResponse {
    authenticated: boolean;
    profile: CommunityProfile | null;
    unread_notifications: number;
    community_mode: CommunityMode;
    turnstile_site_key: string;
    turnstile_required: boolean;
    can_manage_mods: boolean;
    blocked_subs: string[];
}

export interface PostListResponse {
    items: PostItem[];
    next_cursor: string | null;
    community_mode?: CommunityMode;
}

export interface PostMutationResponse {
    post: PostItem;
    auto_spoiler_applied: boolean;
    moderation_notice: ModerationNotice;
}

export interface ThreadCommentsResponse {
    thread: CommentThread;
    items: CommentItem[];
    next_cursor: string | null;
    community_mode: CommunityMode;
}

export interface CommentMutationResponse {
    comment: CommentItem;
    auto_spoiler_applied: boolean;
    moderation_notice: ModerationNotice;
}

export interface CommentRepliesResponse {
    items: CommentItem[];
    next_cursor: string | null;
}

export interface ReactionResponse {
    liked: boolean;
    like_count: number;
}

export interface NotificationsResponse {
    items: CommunityNotification[];
    unread_count: number;
    next_cursor: string | null;
}

export interface ModQueueResponse<T = unknown> {
    community_mode: CommunityMode;
    counts: ModQueueCounts;
    items: T[];
    next_cursor: string | null;
}

export interface ModModeResponse {
    mode: CommunityMode;
    updated_at: string | null;
    updated_by: string | null;
}

// ==================== Stable Option Metadata (i18n-backed) ====================

export interface LabeledOption<T extends string | number> {
    id: T;
    labelKey: string;
}

export const POST_CATEGORY_OPTIONS: readonly LabeledOption<PostCategory>[] = [
    { id: "general", labelKey: "page.community.categories.general" },
    { id: "showcase", labelKey: "page.community.categories.showcase" },
    { id: "review", labelKey: "page.community.categories.review" },
    { id: "story", labelKey: "page.community.categories.story" },
    { id: "community_story", labelKey: "page.community.categories.community_story" },
    { id: "guide", labelKey: "page.community.categories.guide" },
    { id: "question", labelKey: "page.community.categories.question" },
    { id: "tiering", labelKey: "page.community.categories.tiering" },
];

export const POST_CATEGORY_LABEL_KEYS: Record<PostCategory, string> = {
    general: "page.community.categories.general",
    showcase: "page.community.categories.showcase",
    review: "page.community.categories.review",
    story: "page.community.categories.story",
    community_story: "page.community.categories.community_story",
    guide: "page.community.categories.guide",
    question: "page.community.categories.question",
    tiering: "page.community.categories.tiering",
};

export const SERVER_TAG_OPTIONS: readonly LabeledOption<ServerTag>[] = [
    { id: "all", labelKey: "page.community.servers.all" },
    { id: "jp", labelKey: "page.community.servers.jp" },
    { id: "cn", labelKey: "page.community.servers.cn" },
    { id: "tw", labelKey: "page.community.servers.tw" },
    { id: "en", labelKey: "page.community.servers.en" },
    { id: "kr", labelKey: "page.community.servers.kr" },
];

export const SERVER_TAG_LABEL_KEYS: Record<ServerTag, string> = {
    all: "page.community.servers.all",
    jp: "page.community.servers.jp",
    cn: "page.community.servers.cn",
    tw: "page.community.servers.tw",
    en: "page.community.servers.en",
    kr: "page.community.servers.kr",
};

export const CONTENT_LANG_OPTIONS: readonly LabeledOption<ContentLang>[] = [
    { id: "zh", labelKey: "page.community.langs.zh" },
    { id: "en", labelKey: "page.community.langs.en" },
    { id: "ja", labelKey: "page.community.langs.ja" },
    { id: "ko", labelKey: "page.community.langs.ko" },
    { id: "other", labelKey: "page.community.langs.other" },
];

export const CONTENT_LANG_LABEL_KEYS: Record<ContentLang, string> = {
    zh: "page.community.langs.zh",
    en: "page.community.langs.en",
    ja: "page.community.langs.ja",
    ko: "page.community.langs.ko",
    other: "page.community.langs.other",
};

export const POST_SORT_OPTIONS: readonly LabeledOption<PostSort>[] = [
    { id: "hot", labelKey: "page.community.sort.hot" },
    { id: "latest", labelKey: "page.community.sort.latest" },
    { id: "featured", labelKey: "page.community.sort.featured" },
];

export const COMMENT_SORT_OPTIONS: readonly LabeledOption<CommentSort>[] = [
    { id: "hot", labelKey: "common.comments.sort.hot" },
    { id: "latest", labelKey: "common.comments.sort.latest" },
];

export const REPORT_REASON_OPTIONS: readonly LabeledOption<ReportReason>[] = [
    { id: "political", labelKey: "common.comments.report.reasons.political" },
    { id: "harassment", labelKey: "common.comments.report.reasons.harassment" },
    { id: "flame_bait", labelKey: "common.comments.report.reasons.flame_bait" },
    { id: "nsfw", labelKey: "common.comments.report.reasons.nsfw" },
    { id: "spam_ad", labelKey: "common.comments.report.reasons.spam_ad" },
    { id: "doxxing", labelKey: "common.comments.report.reasons.doxxing" },
    { id: "spoiler", labelKey: "common.comments.report.reasons.spoiler" },
    { id: "other", labelKey: "common.comments.report.reasons.other" },
];

export type MemberTrustLevel = 1 | 2 | 3 | 4;

export const TRUST_LEVEL_LABEL_KEYS: Record<TrustLevel, string> = {
    0: "page.community.trustLevels.lv1",
    1: "page.community.trustLevels.lv1",
    2: "page.community.trustLevels.lv2",
    3: "page.community.trustLevels.lv3",
    4: "page.community.trustLevels.lv4",
};

export const TRUST_LEVEL_OPTIONS: readonly LabeledOption<MemberTrustLevel>[] = [
    { id: 1, labelKey: "page.community.trustLevels.lv1" },
    { id: 2, labelKey: "page.community.trustLevels.lv2" },
    { id: 3, labelKey: "page.community.trustLevels.lv3" },
    { id: 4, labelKey: "page.community.trustLevels.lv4" },
];

export function getTrustLevelLabelKey(level: number | undefined | null): string {
    if (level === 4) return TRUST_LEVEL_LABEL_KEYS[4];
    if (level === 3) return TRUST_LEVEL_LABEL_KEYS[3];
    if (level === 2) return TRUST_LEVEL_LABEL_KEYS[2];
    return TRUST_LEVEL_LABEL_KEYS[1];
}

export const COMMUNITY_MODE_OPTIONS: readonly LabeledOption<CommunityMode>[] = [
    { id: "normal", labelKey: "page.community.mod.modes.normal" },
    { id: "strict_review", labelKey: "page.community.mod.modes.strict_review" },
    { id: "read_only", labelKey: "page.community.mod.modes.read_only" },
];

export const RULE_TIER_OPTIONS: readonly LabeledOption<RuleTier>[] = [
    { id: "p0_block", labelKey: "page.community.mod.ruleTiers.p0_block" },
    { id: "p1_review", labelKey: "page.community.mod.ruleTiers.p1_review" },
    { id: "whitelist", labelKey: "page.community.mod.ruleTiers.whitelist" },
];

export const RULE_MATCH_TYPE_OPTIONS: readonly LabeledOption<RuleMatchType>[] = [
    { id: "literal", labelKey: "page.community.mod.matchTypes.literal" },
    { id: "regex", labelKey: "page.community.mod.matchTypes.regex" },
];

export const ENTITY_LINK_TYPE_OPTIONS: readonly LabeledOption<EntityLinkType>[] = [
    { id: "card", labelKey: "page.community.entities.card" },
    { id: "music", labelKey: "page.community.entities.music" },
    { id: "event", labelKey: "page.community.entities.event" },
    { id: "gacha", labelKey: "page.community.entities.gacha" },
    { id: "costume", labelKey: "page.community.entities.costume" },
    { id: "character", labelKey: "page.community.entities.character" },
    { id: "live", labelKey: "page.community.entities.live" },
];

export function isPostCategory(value: string | null | undefined): value is PostCategory {
    return (
        value === "general" ||
        value === "showcase" ||
        value === "review" ||
        value === "story" ||
        value === "community_story" ||
        value === "guide" ||
        value === "question" ||
        value === "tiering"
    );
}

export function sanitizeCommunityTargetId(raw: string): string {
    return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

export function isServerTag(value: string | null | undefined): value is ServerTag {
    return (
        value === "all" ||
        value === "jp" ||
        value === "cn" ||
        value === "tw" ||
        value === "en" ||
        value === "kr"
    );
}

export function isContentLang(value: string | null | undefined): value is ContentLang {
    return value === "zh" || value === "en" || value === "ja" || value === "ko" || value === "other";
}

export function isPostSort(value: string | null | undefined): value is PostSort {
    return value === "hot" || value === "latest" || value === "featured";
}

export function isModeratorRole(role: CommunityRole | undefined | null): boolean {
    return role === "mod" || role === "admin";
}
