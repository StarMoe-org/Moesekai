"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import { connectHref } from "@/lib/starmoe-accounts";
import {
    blockUser,
    fetchBlockedUsers,
    fetchCommunityUser,
    fetchCommunityUserPosts,
    getCommunityErrorMessage,
    likeTarget,
    unblockUser,
    unlikeTarget,
} from "@/lib/community-api";
import {
    patchCommunitySessionPreferences,
    updateBlockedSubLocal,
    useCommunitySession,
} from "@/lib/community-session";
import PostCard from "@/components/community/PostCard";
import CommunityAvatar from "@/components/community/CommunityAvatar";
import CardAvatarPicker from "@/components/community/CardAvatarPicker";
import UserGovernancePanel from "@/components/community/UserGovernancePanel";
import {
    Banner,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    PageContainer,
    SectionCard,
    Switch,
    TextField,
} from "@/components/md3";
import {
    mdArrowBack,
    mdBlock,
    mdEdit,
    mdLink,
    mdShield,
    mdStar,
    mdVerified,
} from "@/components/md3/icons";
import {
    POST_CATEGORY_OPTIONS,
    getTrustLevelLabelKey,
    isModeratorRole,
    type BlockedUserItem,
    type CommunityProfile,
    type PostCategory,
    type PostItem,
} from "@/types/community";

export default function CommunityUserProfileClient() {
    const { t, formatDate } = useI18n();
    const params = useParams();
    const { setDetailName } = useBreadcrumb();
    const session = useCommunitySession();

    const userSub = decodeURIComponent(
        Array.isArray(params?.id) ? params.id[0] : (params?.id ?? ""),
    );

    const [profile, setProfile] = useState<CommunityProfile | null>(null);
    const [posts, setPosts] = useState<PostItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [blockedList, setBlockedList] = useState<BlockedUserItem[]>([]);

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);

    // Preferences state (own profile only)
    const [bioDraft, setBioDraft] = useState("");
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

    const isSelf = Boolean(session.authenticated && session.profile?.sub === userSub);
    const isViewerMod = isModeratorRole(session.profile?.role);
    const canManageMods = session.canManageMods;

    const tRef = useRef(t);
    const requestSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const loadProfile = useCallback(async () => {
        const seq = ++requestSeqRef.current;
        if (!userSub) {
            setError(tRef.current("common.comments.errors.notFound"));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [loadedProfile, loadedPosts] = await Promise.all([
                fetchCommunityUser(userSub),
                fetchCommunityUserPosts(userSub, { limit: 20 }),
            ]);
            if (seq !== requestSeqRef.current) return;
            setProfile(loadedProfile);
            setBioDraft(loadedProfile.bio || "");
            setPosts(loadedPosts.items);
            setNextCursor(loadedPosts.next_cursor);
            setDetailName(loadedProfile.display_name || userSub);
        } catch (err) {
            if (seq !== requestSeqRef.current) return;
            setError(getCommunityErrorMessage(err, tRef.current));
        } finally {
            if (seq === requestSeqRef.current) {
                setLoading(false);
            }
        }
    }, [setDetailName, userSub]);

    useEffect(() => {
        void loadProfile();
        return () => {
            requestSeqRef.current += 1;
        };
    }, [loadProfile]);

    useEffect(() => {
        if (!isSelf) return;
        let cancelled = false;
        fetchBlockedUsers()
            .then((items) => {
                if (!cancelled) setBlockedList(items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [isSelf]);

    const handleLoadMorePosts = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetchCommunityUserPosts(userSub, { cursor: nextCursor, limit: 20 });
            setPosts((prev) => [...prev, ...res.items]);
            setNextCursor(res.next_cursor);
        } catch {
            // Keep loaded posts
        } finally {
            setLoadingMore(false);
        }
    };

    const handleToggleBlock = async () => {
        if (!profile || !session.authenticated || isSelf) return;
        const currentlyBlocked = Boolean(
            profile.is_blocked_by_me || session.blockedSubs.includes(profile.sub),
        );
        setStatusError(null);
        try {
            if (currentlyBlocked) {
                await unblockUser(profile.sub);
                updateBlockedSubLocal(profile.sub, false);
                setProfile((prev) => (prev ? { ...prev, is_blocked_by_me: false } : prev));
                setStatusMessage(t("page.community.profile.unblocked"));
            } else {
                await blockUser(profile.sub);
                updateBlockedSubLocal(profile.sub, true);
                setProfile((prev) => (prev ? { ...prev, is_blocked_by_me: true } : prev));
                setStatusMessage(t("page.community.profile.blocked"));
            }
        } catch (err) {
            setStatusError(getCommunityErrorMessage(err, t));
        }
    };

    const handleToggleVerifiedBadges = async (checked: boolean) => {
        setSavingPrefs(true);
        setStatusError(null);
        try {
            const updated = await patchCommunitySessionPreferences({ show_verified_badges: checked });
            setProfile(updated);
            setStatusMessage(t("page.community.profile.preferencesSaved"));
        } catch (err) {
            setStatusError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleSaveBio = async () => {
        setSavingPrefs(true);
        setStatusError(null);
        try {
            const updated = await patchCommunitySessionPreferences({ bio: bioDraft.trim() });
            setProfile(updated);
            setStatusMessage(t("page.community.profile.preferencesSaved"));
        } catch (err) {
            setStatusError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleToggleHiddenCategory = async (cat: PostCategory) => {
        if (!profile) return;
        const current = new Set(profile.hidden_categories ?? []);
        if (current.has(cat)) current.delete(cat);
        else current.add(cat);
        setSavingPrefs(true);
        setStatusError(null);
        try {
            const updated = await patchCommunitySessionPreferences({
                hidden_categories: Array.from(current),
            });
            setProfile(updated);
            setStatusMessage(t("page.community.profile.preferencesSaved"));
        } catch (err) {
            setStatusError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleUnblockFromList = async (blockedSub: string) => {
        try {
            await unblockUser(blockedSub);
            updateBlockedSubLocal(blockedSub, false);
            setBlockedList((prev) => prev.filter((item) => item.blocked_sub !== blockedSub));
        } catch (err) {
            setStatusError(getCommunityErrorMessage(err, t));
        }
    };

    const handleLikeToggle = async (post: PostItem) => {
        if (!session.authenticated) {
            signIn();
            return;
        }
        try {
            const res = post.liked_by_me
                ? await unlikeTarget("post", post.id)
                : await likeTarget("post", post.id);
            setPosts((prev) =>
                prev.map((item) =>
                    item.id === post.id
                        ? { ...item, liked_by_me: res.liked, like_count: res.like_count }
                        : item,
                ),
            );
        } catch {
            // Keep existing state
        }
    };

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <div className="mb-4">
                    <Button variant="tonal" size="s" icon={mdArrowBack} href="/community">
                        {t("page.community.backToFeed")}
                    </Button>
                </div>

                {loading ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : error || !profile ? (
                    <ErrorState
                        title={t("common.state.loadingFailed")}
                        message={error || t("common.comments.errors.notFound")}
                        onRetry={() => void loadProfile()}
                    />
                ) : (
                    <div className="space-y-6">
                        {statusMessage && <Banner tone="info">{statusMessage}</Banner>}
                        {statusError && <Banner tone="error">{statusError}</Banner>}

                        {/* Profile overview card */}
                        <SectionCard>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    {isSelf ? (
                                        <button
                                            type="button"
                                            onClick={() => setAvatarPickerOpen(true)}
                                            aria-label={t("page.community.profile.changeAvatar")}
                                            title={t("page.community.profile.changeAvatar")}
                                            className="focus-ring group relative shrink-0 rounded-full"
                                        >
                                            <CommunityAvatar
                                                displayName={profile.display_name}
                                                avatarUrl={profile.avatar_url}
                                                avatarCardId={profile.avatar_card_id}
                                                avatarCardTrained={profile.avatar_card_trained}
                                                sizeClassName="h-16 w-16 ring-2 ring-outline-variant/60 transition-shadow group-hover:ring-primary"
                                                textClassName="type-headline-s"
                                            />
                                            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-outline-variant/70 bg-surface-container-high text-on-surface shadow-elev-1 transition-colors group-hover:bg-primary group-hover:text-on-primary">
                                                <Icon path={mdEdit} size={14} />
                                            </span>
                                        </button>
                                    ) : (
                                        <CommunityAvatar
                                            displayName={profile.display_name}
                                            avatarUrl={profile.avatar_url}
                                            avatarCardId={profile.avatar_card_id}
                                            avatarCardTrained={profile.avatar_card_trained}
                                            sizeClassName="h-16 w-16"
                                            textClassName="type-headline-s"
                                        />
                                    )}

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h1 className="type-headline-s text-on-surface break-words">
                                                {profile.display_name}
                                            </h1>
                                            <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                                {profile.trust_level === 4 && <Icon path={mdStar} size={14} />}
                                                <span>{t(getTrustLevelLabelKey(profile.trust_level))}</span>
                                            </span>
                                            {isModeratorRole(profile.role) && (
                                                <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                                    <Icon path={mdShield} size={14} />
                                                    <span>{t("page.community.roles.mod")}</span>
                                                </span>
                                            )}
                                        </div>

                                        {profile.verified_badge?.haruki_verified && (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                {profile.verified_badge.servers.map((srv) => (
                                                    <span
                                                        key={srv}
                                                        className="inline-flex items-center gap-1 rounded-md3-xs bg-primary-container/70 px-2 py-0.5 type-label-s text-on-primary-container"
                                                    >
                                                        <Icon path={mdVerified} size={14} />
                                                        <span>{srv.toUpperCase()}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <p className="mt-1 type-body-s text-on-surface-variant">
                                            {t("page.community.profile.joinedAt", {
                                                date: formatDate(profile.created_at, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                }),
                                            })}
                                        </p>
                                    </div>
                                </div>

                                {isSelf && (
                                    <Button
                                        variant="tonal"
                                        size="s"
                                        icon={mdEdit}
                                        onClick={() => setAvatarPickerOpen(true)}
                                    >
                                        {t("page.community.profile.changeAvatar")}
                                    </Button>
                                )}

                                {session.authenticated && !isSelf && (
                                    <Button
                                        variant={
                                            profile.is_blocked_by_me ||
                                            session.blockedSubs.includes(profile.sub)
                                                ? "tonal"
                                                : "outlined"
                                        }
                                        size="s"
                                        icon={mdBlock}
                                        onClick={handleToggleBlock}
                                    >
                                        {profile.is_blocked_by_me ||
                                        session.blockedSubs.includes(profile.sub)
                                            ? t("page.community.profile.unblock")
                                            : t("common.comments.blockUser")}
                                    </Button>
                                )}
                            </div>

                            {profile.bio && (
                                <p className="mt-4 whitespace-pre-line type-body-m text-on-surface">
                                    {profile.bio}
                                </p>
                            )}

                            {/* Stats strip */}
                            <div className="mt-5 grid grid-cols-3 gap-2 rounded-md3-md bg-surface-container p-3 text-center">
                                <div>
                                    <div className="type-title-l text-on-surface">{profile.post_count}</div>
                                    <div className="type-label-s text-on-surface-variant">
                                        {t("page.community.profile.statsPosts")}
                                    </div>
                                </div>
                                <div>
                                    <div className="type-title-l text-on-surface">{profile.comment_count}</div>
                                    <div className="type-label-s text-on-surface-variant">
                                        {t("page.community.profile.statsComments")}
                                    </div>
                                </div>
                                <div>
                                    <div className="type-title-l text-on-surface">
                                        {profile.likes_received}
                                    </div>
                                    <div className="type-label-s text-on-surface-variant">
                                        {t("page.community.profile.statsLikes")}
                                    </div>
                                </div>
                            </div>

                            {typeof profile.health_score === "number" && (isSelf || isViewerMod) && (
                                <div className="mt-3 flex items-center justify-between rounded-md3-md bg-surface-container px-4 py-3">
                                    <div>
                                        <div className="type-title-s text-on-surface">
                                            {t("page.community.profile.healthScoreTitle")}
                                        </div>
                                        <div className="type-body-s text-on-surface-variant">
                                            {t("page.community.profile.healthScoreDesc")}
                                        </div>
                                    </div>
                                    <span className="shrink-0 type-headline-s text-primary">
                                        {profile.health_score} / 100
                                    </span>
                                </div>
                            )}
                        </SectionCard>

                        {/* Moderator quick governance actions when viewing another member */}
                        {isViewerMod && !isSelf && (
                            <SectionCard title={t("page.community.mod.userGov.title")} icon={mdShield}>
                                <UserGovernancePanel
                                    target={profile}
                                    canManageMods={canManageMods}
                                    viewerSub={session.profile?.sub}
                                    onUpdated={(updated, message) => {
                                        if (updated) setProfile(updated);
                                        setStatusError(null);
                                        setStatusMessage(message);
                                    }}
                                    onError={(message) => {
                                        setStatusMessage(null);
                                        setStatusError(message);
                                    }}
                                />
                            </SectionCard>
                        )}

                        {/* Own preferences */}
                        {isSelf && (
                            <SectionCard title={t("page.community.profile.preferencesTitle")}>
                                <div className="space-y-5">
                                    {profile.muted_until &&
                                        new Date(profile.muted_until).getTime() > Date.now() && (
                                        <Banner tone="warning">
                                            {t("common.comments.errors.userMutedUntil", {
                                                until: formatDate(profile.muted_until, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                }),
                                            })}
                                        </Banner>
                                    )}

                                    <Switch
                                        checked={profile.show_verified_badges}
                                        disabled={savingPrefs}
                                        onCheckedChange={(checked) => void handleToggleVerifiedBadges(checked)}
                                        label={t("page.community.profile.showVerifiedBadges")}
                                        description={t("page.community.profile.showVerifiedBadgesDesc")}
                                    />

                                    {!profile.has_verified_haruki && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md3-md border border-outline-variant bg-surface-container-low p-3">
                                            <span className="type-body-s text-on-surface-variant">
                                                {t("page.community.profile.connectOptionalHint")}
                                            </span>
                                            <ExternalLink
                                                href={connectHref()}
                                                className="inline-flex items-center gap-1 type-label-l text-primary hover:underline"
                                            >
                                                <Icon path={mdLink} size={16} />
                                                <span>{t("page.community.profile.connectLink")}</span>
                                            </ExternalLink>
                                        </div>
                                    )}

                                    <div className="flex items-end gap-2">
                                        <TextField
                                            label={t("page.community.profile.bioLabel")}
                                            value={bioDraft}
                                            onValueChange={setBioDraft}
                                            maxLength={200}
                                            placeholder={t("page.community.profile.bioPlaceholder")}
                                            containerClassName="flex-1"
                                        />
                                        <Button
                                            variant="tonal"
                                            disabled={savingPrefs}
                                            onClick={() => void handleSaveBio()}
                                        >
                                            {t("common.action.save")}
                                        </Button>
                                    </div>

                                    <div>
                                        <p className="mb-1 type-label-l text-on-surface">
                                            {t("page.community.profile.hiddenCategoriesTitle")}
                                        </p>
                                        <p className="mb-2 type-body-s text-on-surface-variant">
                                            {t("page.community.profile.hiddenCategoriesDesc")}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {POST_CATEGORY_OPTIONS.map((opt) => (
                                                <Chip
                                                    key={opt.id}
                                                    variant="filter"
                                                    selected={Boolean(
                                                        profile.hidden_categories?.includes(opt.id),
                                                    )}
                                                    disabled={savingPrefs}
                                                    onClick={() => void handleToggleHiddenCategory(opt.id)}
                                                >
                                                    {t(opt.labelKey)}
                                                </Chip>
                                            ))}
                                        </div>
                                    </div>

                                    {blockedList.length > 0 && (
                                        <div>
                                            <p className="mb-2 type-label-l text-on-surface">
                                                {t("page.community.profile.blockedUsersTitle")}
                                            </p>
                                            <div className="space-y-1.5">
                                                {blockedList.map((item) => (
                                                    <div
                                                        key={item.blocked_sub}
                                                        className="flex items-center justify-between gap-2 rounded-md3-md bg-surface-container px-3 py-2"
                                                    >
                                                        <div className="flex min-w-0 items-center gap-2.5">
                                                            <CommunityAvatar
                                                                displayName={item.display_name || item.blocked_sub}
                                                                avatarUrl={item.avatar_url}
                                                                avatarCardId={item.avatar_card_id}
                                                                avatarCardTrained={item.avatar_card_trained}
                                                                sizeClassName="h-7 w-7"
                                                                textClassName="type-label-s"
                                                            />
                                                            <span className="truncate type-body-m text-on-surface">
                                                                {item.display_name || item.blocked_sub}
                                                            </span>
                                                        </div>
                                                        <Button
                                                            variant="text"
                                                            size="xs"
                                                            onClick={() =>
                                                                void handleUnblockFromList(item.blocked_sub)
                                                            }
                                                        >
                                                            {t("page.community.profile.unblock")}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </SectionCard>
                        )}

                        {/* User's posts */}
                        <SectionCard title={t("page.community.profile.postsTitle")}>
                            {posts.length === 0 ? (
                                <EmptyState
                                    title={t("page.community.profile.noPostsTitle")}
                                    description={t("page.community.profile.noPostsDesc")}
                                />
                            ) : (
                                <div className="space-y-3">
                                    {posts.map((post) => (
                                        <PostCard
                                            key={post.id}
                                            post={post}
                                            onLikeToggle={handleLikeToggle}
                                        />
                                    ))}
                                    {nextCursor && (
                                        <div className="pt-2 text-center">
                                            <Button
                                                variant="tonal"
                                                disabled={loadingMore}
                                                onClick={() => void handleLoadMorePosts()}
                                            >
                                                {loadingMore ? t("common.state.loading") : t("common.comments.loadMore")}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </SectionCard>

                        {isSelf && (
                            <CardAvatarPicker
                                isOpen={avatarPickerOpen}
                                onClose={() => setAvatarPickerOpen(false)}
                                profile={profile}
                                onSaved={(updated, wasReset) => {
                                    setProfile(updated);
                                    setPosts((prev) =>
                                        prev.map((post) =>
                                            post.author.sub === updated.sub
                                                ? {
                                                      ...post,
                                                      author: {
                                                          ...post.author,
                                                          avatar_card_id: updated.avatar_card_id ?? null,
                                                          avatar_card_trained: Boolean(
                                                              updated.avatar_card_trained,
                                                          ),
                                                      },
                                                  }
                                                : post,
                                        ),
                                    );
                                    setStatusError(null);
                                    setStatusMessage(
                                        wasReset
                                            ? t("page.community.profile.avatarReset")
                                            : t("page.community.profile.avatarSaved"),
                                    );
                                }}
                            />
                        )}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
