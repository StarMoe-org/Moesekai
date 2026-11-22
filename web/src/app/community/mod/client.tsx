"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "@/components/MainLayout";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import {
    deleteModRule,
    fetchCommunityUser,
    fetchModAudit,
    fetchModAudioQueue,
    fetchModMode,
    fetchModQueue,
    fetchModRules,
    getCommunityErrorMessage,
    reviewModAudioBatch,
    setModMode,
    submitModAction,
    upsertModRule,
} from "@/lib/community-api";
import { formatByteSize, formatDurationMs } from "@/lib/storyMaker/audioBundle";
import { setCommunityModeLocal, useCommunitySession } from "@/lib/community-session";
import CommunityAuthorBadge from "@/components/community/CommunityAuthorBadge";
import CommunityAvatar from "@/components/community/CommunityAvatar";
import CommunityMarkdown from "@/components/community/CommunityMarkdown";
import UserGovernancePanel from "@/components/community/UserGovernancePanel";
import {
    Banner,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Icon,
    IconButton,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
    SegmentedButton,
    Surface,
    Switch,
    Tabs,
    TextField,
} from "@/components/md3";
import {
    mdAdd,
    mdArrowBack,
    mdDelete,
    mdLock,
    mdLogin,
    mdOpenInNew,
    mdPerson,
    mdPlayArrowFill,
    mdRecordVoiceOver,
    mdRefresh,
    mdSearch,
    mdShield,
    mdStar,
    mdWarning,
} from "@/components/md3/icons";
import {
    COMMUNITY_MODE_OPTIONS,
    RULE_MATCH_TYPE_OPTIONS,
    RULE_TIER_OPTIONS,
    getTrustLevelLabelKey,
    isModeratorRole,
    type CommunityMode,
    type CommunityProfile,
    type CustomWordRule,
    type ModActionRequest,
    type ModAppealItem,
    type ModAudioQueueItem,
    type ModAuditItem,
    type ModModeResponse,
    type ModPendingItem,
    type ModQueueCounts,
    type ModReportItem,
    type ModerationEvent,
    type RuleMatchType,
    type RuleTier,
} from "@/types/community";

type DashboardTab = "pending" | "audio" | "reports" | "appeals" | "users" | "events" | "rules" | "audit";

export default function CommunityModClient() {
    const { t, formatDate } = useI18n();
    const session = useCommunitySession();

    const [activeTab, setActiveTab] = useState<DashboardTab>("pending");
    const [modeInfo, setModeInfo] = useState<ModModeResponse | null>(null);
    const [selectedMode, setSelectedMode] = useState<CommunityMode>("normal");
    const [modeReason, setModeReason] = useState("");
    const [savingMode, setSavingMode] = useState(false);

    const [counts, setCounts] = useState<ModQueueCounts>({
        pending_posts: 0,
        pending_comments: 0,
        open_reports: 0,
        open_appeals: 0,
    });

    const [pendingItems, setPendingItems] = useState<ModPendingItem[]>([]);
    const [audioQueueItems, setAudioQueueItems] = useState<ModAudioQueueItem[]>([]);
    const [audioReviewReasons, setAudioReviewReasons] = useState<Record<string, string>>({});
    const [audioHealthDeltas, setAudioHealthDeltas] = useState<Record<string, number>>({});
    const [reportItems, setReportItems] = useState<ModReportItem[]>([]);
    const [appealItems, setAppealItems] = useState<ModAppealItem[]>([]);
    const [eventItems, setEventItems] = useState<ModerationEvent[]>([]);
    const [ruleItems, setRuleItems] = useState<CustomWordRule[]>([]);
    const [auditItems, setAuditItems] = useState<ModAuditItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Custom rule form state
    const [newRuleTier, setNewRuleTier] = useState<RuleTier>("p1_review");
    const [newRuleMatch, setNewRuleMatch] = useState<RuleMatchType>("literal");
    const [newRulePattern, setNewRulePattern] = useState("");
    const [newRuleNote, setNewRuleNote] = useState("");
    const [savingRule, setSavingRule] = useState(false);

    // User governance lookup state
    const [lookupSub, setLookupSub] = useState("");
    const [targetUser, setTargetUser] = useState<CommunityProfile | null>(null);
    const [loadingUser, setLoadingUser] = useState(false);

    const isMod = isModeratorRole(session.profile?.role);
    const canManageMods = session.canManageMods;

    const availableRuleTiers = useMemo(
        () =>
            canManageMods
                ? RULE_TIER_OPTIONS
                : RULE_TIER_OPTIONS.filter((opt) => opt.id !== "p0_block"),
        [canManageMods],
    );

    const effectiveNewRuleTier: RuleTier =
        !canManageMods && newRuleTier === "p0_block" ? "p1_review" : newRuleTier;

    const recentQueueUsers = useMemo(() => {
        const seen = new Map<string, string>();
        const add = (sub: string | undefined | null, label?: string) => {
            if (!sub || seen.has(sub)) return;
            seen.set(sub, label || sub);
        };
        pendingItems.forEach((item) => {
            if (!item.author.is_deleted) add(item.author.sub, item.author.display_name);
        });
        reportItems.forEach((rep) => {
            add(rep.target_author_sub);
            if (!rep.reporter.is_deleted) add(rep.reporter.sub, rep.reporter.display_name);
        });
        appealItems.forEach((appeal) => {
            if (!appeal.appellant.is_deleted) add(appeal.appellant.sub, appeal.appellant.display_name);
        });
        audioQueueItems.forEach((audioBatch) => {
            add(audioBatch.author_sub);
        });
        return Array.from(seen.entries())
            .slice(0, 10)
            .map(([sub, label]) => ({ sub, label }));
    }, [appealItems, audioQueueItems, pendingItems, reportItems]);

    const tRef = useRef(t);
    const tabRequestSeqRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const loadMode = useCallback(async () => {
        try {
            const res = await fetchModMode();
            setModeInfo(res);
            setSelectedMode(res.mode);
            setCommunityModeLocal(res.mode);
        } catch {
            // Keep session fallback mode
        }
    }, []);

    const loadActiveTab = useCallback(async () => {
        if (!isMod || activeTab === "users") return;
        const seq = ++tabRequestSeqRef.current;
        setLoading(true);
        setError(null);
        try {
            if (activeTab === "pending") {
                const res = await fetchModQueue("pending", { limit: 30 });
                if (seq !== tabRequestSeqRef.current) return;
                setCounts(res.counts);
                setPendingItems(res.items);
                setSelectedMode(res.community_mode);
            } else if (activeTab === "audio") {
                const res = await fetchModAudioQueue({ limit: 20 });
                if (seq !== tabRequestSeqRef.current) return;
                setAudioQueueItems(res.items);
            } else if (activeTab === "reports") {
                const res = await fetchModQueue("reports", { limit: 30 });
                if (seq !== tabRequestSeqRef.current) return;
                setCounts(res.counts);
                setReportItems(res.items);
            } else if (activeTab === "appeals") {
                const res = await fetchModQueue("appeals", { limit: 30 });
                if (seq !== tabRequestSeqRef.current) return;
                setCounts(res.counts);
                setAppealItems(res.items);
            } else if (activeTab === "events") {
                const res = await fetchModQueue("events", { limit: 30 });
                if (seq !== tabRequestSeqRef.current) return;
                setCounts(res.counts);
                setEventItems(res.items);
            } else if (activeTab === "rules") {
                const items = await fetchModRules();
                if (seq !== tabRequestSeqRef.current) return;
                setRuleItems(items);
            } else if (activeTab === "audit") {
                const res = await fetchModAudit({ limit: 40 });
                if (seq !== tabRequestSeqRef.current) return;
                setAuditItems(res.items);
            }
        } catch (err) {
            if (seq !== tabRequestSeqRef.current) return;
            setError(getCommunityErrorMessage(err, tRef.current));
        } finally {
            if (seq === tabRequestSeqRef.current) {
                setLoading(false);
            }
        }
    }, [activeTab, isMod]);

    const handleLookupUser = useCallback(
        async (overrideSub?: string) => {
            const targetSub = (overrideSub ?? lookupSub).trim();
            if (!targetSub) return;
            if (overrideSub !== undefined) {
                setLookupSub(targetSub);
            }
            setLoadingUser(true);
            setError(null);
            setNotice(null);
            try {
                const profile = await fetchCommunityUser(targetSub);
                setTargetUser(profile);
            } catch (err) {
                setTargetUser(null);
                setError(getCommunityErrorMessage(err, t));
            } finally {
                setLoadingUser(false);
            }
        },
        [lookupSub, t],
    );

    const openUserGovernance = useCallback(
        (sub: string) => {
            setActiveTab("users");
            void handleLookupUser(sub);
        },
        [handleLookupUser],
    );

    useEffect(() => {
        if (isMod) {
            void loadMode();
        }
    }, [isMod, loadMode]);

    useEffect(() => {
        if (isMod) {
            void loadActiveTab();
        }
        return () => {
            tabRequestSeqRef.current += 1;
        };
    }, [isMod, loadActiveTab]);

    const handleApplyMode = async () => {
        setSavingMode(true);
        setError(null);
        setNotice(null);
        try {
            const res = await setModMode(selectedMode, modeReason.trim() || undefined);
            setModeInfo(res);
            setSelectedMode(res.mode);
            setCommunityModeLocal(res.mode);
            setModeReason("");
            setNotice(t("page.community.mod.modeUpdated"));
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingMode(false);
        }
    };

    const runAction = async (key: string, input: ModActionRequest) => {
        setBusyId(key);
        setError(null);
        setNotice(null);
        try {
            await submitModAction(input);
            setNotice(t("page.community.mod.actionSuccess"));
            await loadActiveTab();
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setBusyId(null);
        }
    };

    const runAudioReview = async (batchId: string, action: "approve" | "reject") => {
        const key = `audio-${batchId}`;
        setBusyId(key);
        setError(null);
        setNotice(null);
        try {
            const reason = (audioReviewReasons[batchId] ?? "").trim();
            const delta = action === "reject" ? (audioHealthDeltas[batchId] ?? 0) : 0;
            await reviewModAudioBatch(batchId, {
                action,
                reason,
                ...(delta < 0 ? { health_delta: delta } : {}),
            });
            setNotice(t("page.community.mod.actionSuccess"));
            await loadActiveTab();
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setBusyId(null);
        }
    };

    const handleCreateRule = async () => {
        const pattern = newRulePattern.trim();
        if (!pattern) return;
        setSavingRule(true);
        setError(null);
        try {
            const res = await upsertModRule({
                tier: effectiveNewRuleTier,
                match_type: newRuleMatch,
                pattern,
                note: newRuleNote.trim() || undefined,
                enabled: true,
            });
            setRuleItems(res.items);
            setNewRulePattern("");
            setNewRuleNote("");
            setNotice(t("page.community.mod.ruleSaved"));
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSavingRule(false);
        }
    };

    const handleToggleRule = async (rule: CustomWordRule, enabled: boolean) => {
        setBusyId(`rule-${rule.id}`);
        setError(null);
        try {
            const res = await upsertModRule({
                id: rule.id,
                tier: rule.tier,
                match_type: rule.match_type,
                pattern: rule.pattern,
                note: rule.note,
                enabled,
            });
            setRuleItems(res.items);
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setBusyId(null);
        }
    };

    const handleDeleteRule = async (id: number) => {
        setBusyId(`rule-${id}`);
        setError(null);
        try {
            const res = await deleteModRule(id);
            setRuleItems(res.items);
            setNotice(t("page.community.mod.ruleDeleted"));
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setBusyId(null);
        }
    };

    const pendingTotal = counts.pending_posts + counts.pending_comments;

    return (
        <MainLayout>
            <PageContainer className="max-w-6xl">
                <PageHeader
                    title={t("page.community.mod.title")}
                    description={t("page.community.mod.description")}
                    actions={
                        <>
                            <Button variant="tonal" size="s" icon={mdArrowBack} href="/community">
                                {t("page.community.backToFeed")}
                            </Button>
                            {isMod && (
                                <Button
                                    variant="outlined"
                                    size="s"
                                    icon={mdRefresh}
                                    onClick={() => {
                                        void loadMode();
                                        if (activeTab === "users" && targetUser) {
                                            void handleLookupUser(targetUser.sub);
                                        } else {
                                            void loadActiveTab();
                                        }
                                    }}
                                >
                                    {t("page.community.mod.refresh")}
                                </Button>
                            )}
                        </>
                    }
                />

                {session.status === "idle" || session.status === "loading" ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : !session.authenticated ? (
                    <SectionCard>
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <p className="type-title-m text-on-surface">
                                {t("common.comments.loginPromptTitle")}
                            </p>
                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                {t("common.comments.signInButton")}
                            </Button>
                        </div>
                    </SectionCard>
                ) : !isMod ? (
                    <Banner tone="error" title={t("page.community.mod.accessDeniedTitle")}>
                        {t("page.community.mod.accessDeniedDesc")}
                    </Banner>
                ) : (
                    <div className="space-y-6">
                        {notice && <Banner tone="info">{notice}</Banner>}
                        {error && <Banner tone="error">{error}</Banner>}

                        {/* Panic Switch */}
                        <SectionCard
                            title={t("page.community.mod.panicSwitchTitle")}
                            icon={mdWarning}
                        >
                            <div className="space-y-3">
                                <p className="type-body-s text-on-surface-variant">
                                    {t("page.community.mod.panicSwitchDesc")}
                                </p>
                                {canManageMods ? (
                                    <>
                                        <SegmentedButton
                                            options={COMMUNITY_MODE_OPTIONS.map((opt) => ({
                                                value: opt.id,
                                                label: t(opt.labelKey),
                                            }))}
                                            value={selectedMode}
                                            onValueChange={setSelectedMode}
                                            aria-label={t("page.community.mod.panicSwitchTitle")}
                                        />
                                        <div className="flex flex-wrap items-end gap-2">
                                            <TextField
                                                label={t("page.community.mod.modeReasonLabel")}
                                                value={modeReason}
                                                onValueChange={setModeReason}
                                                placeholder={t("page.community.mod.modeReasonPlaceholder")}
                                                containerClassName="min-w-[220px] flex-1"
                                            />
                                            <Button
                                                variant="filled"
                                                color={selectedMode === "read_only" ? "error" : "primary"}
                                                disabled={savingMode}
                                                onClick={() => void handleApplyMode()}
                                            >
                                                {savingMode
                                                    ? t("common.comments.submitting")
                                                    : t("page.community.mod.applyMode")}
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md3-md bg-surface-container px-4 py-3">
                                        <div className="space-y-0.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="type-label-l text-on-surface">
                                                    {t("page.community.mod.panicSwitchCurrentMode")}
                                                </span>
                                                <span
                                                    className={
                                                        selectedMode === "read_only"
                                                            ? "rounded-md3-xs bg-error-container px-2 py-0.5 type-label-s text-on-error-container"
                                                            : selectedMode === "strict_review"
                                                              ? "rounded-md3-xs bg-warning-container px-2 py-0.5 type-label-s text-on-warning-container"
                                                              : "rounded-md3-xs bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container"
                                                    }
                                                >
                                                    {t(`page.community.mod.modes.${selectedMode}`)}
                                                </span>
                                            </div>
                                            <p className="type-body-s text-on-surface-variant">
                                                {t("page.community.mod.panicSwitchReadOnly")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {modeInfo?.updated_at && (
                                    <p className="type-label-s text-on-surface-variant">
                                        {t("page.community.mod.modeLastUpdated", {
                                            time: formatDate(modeInfo.updated_at, {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }),
                                        })}
                                    </p>
                                )}
                            </div>
                        </SectionCard>

                        {/* Queue & management tabs */}
                        <SectionCard title={t("page.community.mod.workspaceTitle")} icon={mdShield}>
                            <Tabs
                                items={[
                                    {
                                        value: "pending",
                                        label: `${t("page.community.mod.tabs.pending")} (${pendingTotal})`,
                                    },
                                    {
                                        value: "audio",
                                        label: t("page.community.mod.tabs.audio"),
                                    },
                                    {
                                        value: "reports",
                                        label: `${t("page.community.mod.tabs.reports")} (${counts.open_reports})`,
                                    },
                                    {
                                        value: "appeals",
                                        label: `${t("page.community.mod.tabs.appeals")} (${counts.open_appeals})`,
                                    },
                                    { value: "users", label: t("page.community.mod.tabs.users") },
                                    { value: "events", label: t("page.community.mod.tabs.events") },
                                    { value: "rules", label: t("page.community.mod.tabs.rules") },
                                    { value: "audit", label: t("page.community.mod.tabs.audit") },
                                ]}
                                value={activeTab}
                                onValueChange={setActiveTab}
                                variant="secondary"
                                scrollable
                                className="mb-4"
                            />

                            {loading && activeTab !== "users" ? (
                                <LoadingState label={t("common.state.loading")} />
                            ) : error && activeTab !== "rules" && activeTab !== "users" ? (
                                <ErrorState
                                    title={t("common.state.loadingFailed")}
                                    message={error}
                                    onRetry={() => void loadActiveTab()}
                                />
                            ) : activeTab === "pending" ? (
                                pendingItems.length === 0 ? (
                                    <EmptyState
                                        title={t("page.community.mod.emptyPending")}
                                        description={t("page.community.mod.emptyPendingDesc")}
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {pendingItems.map((item) => {
                                            const itemKey = `${item.kind}-${item.id}`;
                                            const isBusy = busyId === itemKey;
                                            return (
                                                <Surface
                                                    key={itemKey}
                                                    tone="default"
                                                    radius="md"
                                                    className="space-y-3 p-4"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <CommunityAuthorBadge
                                                            author={item.author}
                                                            timestamp={item.created_at}
                                                            compact
                                                        />
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface">
                                                                {item.kind.toUpperCase()} #{item.id}
                                                            </span>
                                                            <span className="rounded-md3-xs bg-warning-container px-2 py-0.5 type-label-s text-on-warning-container">
                                                                {t(`common.comments.statuses.${item.status}`)}
                                                            </span>
                                                            <span className="rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                                                {t("page.community.mod.healthBadge", {
                                                                    score: item.author_health_score,
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {item.title && (
                                                        <h3 className="type-title-m text-on-surface">
                                                            {item.kind === "post" ? (
                                                                <Link
                                                                    href={`/community/post/${item.id}`}
                                                                    className="hover:text-primary hover:underline"
                                                                >
                                                                    {item.title}
                                                                </Link>
                                                            ) : (
                                                                item.title
                                                            )}
                                                        </h3>
                                                    )}

                                                    <div className="rounded-md3-sm bg-surface-container-lowest p-3">
                                                        <CommunityMarkdown content={item.body_md} />
                                                    </div>

                                                    {item.latest_event && (
                                                        <div className="rounded-md3-sm border border-outline-variant bg-surface-container-low p-2.5 type-label-s text-on-surface-variant">
                                                            <div>
                                                                {item.latest_event.stage} ·{" "}
                                                                {item.latest_event.decision}
                                                                {item.latest_event.reason
                                                                    ? ` · ${item.latest_event.reason}`
                                                                    : ""}
                                                            </div>
                                                            {item.latest_event.scores &&
                                                                Object.keys(item.latest_event.scores).length > 0 && (
                                                                    <pre className="mt-1 overflow-x-auto font-mono text-[11px]">
                                                                        {JSON.stringify(item.latest_event.scores)}
                                                                    </pre>
                                                                )}
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap gap-1.5">
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "approve",
                                                                    target_type: item.kind,
                                                                    target_id: String(item.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.approve")}
                                                        </Button>
                                                        <Button
                                                            variant="tonal"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "auto_spoiler",
                                                                    target_type: item.kind,
                                                                    target_id: String(item.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.markSpoiler")}
                                                        </Button>
                                                        <Button
                                                            variant="outlined"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "shadowban",
                                                                    target_type: item.kind,
                                                                    target_id: String(item.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.shadowban")}
                                                        </Button>
                                                        <Button
                                                            variant="outlined"
                                                            size="xs"
                                                            color="error"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "reject",
                                                                    target_type: item.kind,
                                                                    target_id: String(item.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.reject")}
                                                        </Button>
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            color="error"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "remove",
                                                                    target_type: item.kind,
                                                                    target_id: String(item.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.remove")}
                                                        </Button>
                                                        {!item.author.is_deleted &&
                                                            item.author.role !== "admin" &&
                                                            (item.author.role === "user" || canManageMods) && (
                                                                <Button
                                                                    variant="text"
                                                                    size="xs"
                                                                    color="error"
                                                                    disabled={isBusy}
                                                                    onClick={() =>
                                                                        void runAction(itemKey, {
                                                                            action: "mute_user",
                                                                            target_type: "user",
                                                                            target_id: item.author.sub,
                                                                            mute_hours: 24,
                                                                        })
                                                                    }
                                                                >
                                                                    {t("page.community.mod.actions.mute24h")}
                                                                </Button>
                                                            )}
                                                        {!item.author.is_deleted && (
                                                            <Button
                                                                variant="text"
                                                                size="xs"
                                                                icon={mdPerson}
                                                                disabled={isBusy}
                                                                onClick={() =>
                                                                    openUserGovernance(item.author.sub)
                                                                }
                                                            >
                                                                {t("page.community.mod.actions.manageUser")}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Surface>
                                            );
                                        })}
                                    </div>
                                )
                            ) : activeTab === "audio" ? (
                                audioQueueItems.length === 0 ? (
                                    <EmptyState
                                        title={t("page.community.mod.audio.emptyTitle")}
                                        description={t("page.community.mod.audio.emptyDesc")}
                                    />
                                ) : (
                                    <div className="space-y-4">
                                        {audioQueueItems.map((batch) => {
                                            const itemKey = `audio-${batch.batch_id}`;
                                            const isBusy = busyId === itemKey;
                                            const currentDelta = audioHealthDeltas[batch.batch_id] ?? 0;
                                            return (
                                                <Surface
                                                    key={batch.batch_id}
                                                    tone="default"
                                                    radius="md"
                                                    className="space-y-3 p-4"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="inline-flex items-center gap-1 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                                                    <Icon path={mdRecordVoiceOver} size={13} />
                                                                    <span>{t("page.community.mod.audio.batchBadge", { postId: batch.post_id })}</span>
                                                                </span>
                                                                <span className="rounded-md3-xs bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-on-surface-variant">
                                                                    {batch.voice_locale}
                                                                </span>
                                                                <span className="type-body-s text-on-surface-variant">
                                                                    {t("page.community.mod.audio.batchMeta", {
                                                                        count: batch.total_clip_count,
                                                                        duration: formatDurationMs(batch.estimated_duration_ms),
                                                                    })}
                                                                </span>
                                                            </div>
                                                            <p className="type-label-s text-on-surface-variant">
                                                                {t("page.community.mod.audio.authorSub", { sub: batch.author_sub })} ·{" "}
                                                                {formatDate(batch.created_at, {
                                                                    year: "numeric",
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                })}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <Button
                                                                size="xs"
                                                                variant="tonal"
                                                                icon={mdOpenInNew}
                                                                href={`/community/post/${batch.post_id}`}
                                                            >
                                                                {t("page.community.mod.audio.openPost")}
                                                            </Button>
                                                            <Button
                                                                size="xs"
                                                                variant="outlined"
                                                                icon={mdPlayArrowFill}
                                                                href={`/story-maker/play?postId=${batch.post_id}`}
                                                            >
                                                                {t("page.community.storyCard.playNow")}
                                                            </Button>
                                                            <Button
                                                                size="xs"
                                                                variant="text"
                                                                icon={mdPerson}
                                                                onClick={() => openUserGovernance(batch.author_sub)}
                                                            >
                                                                {t("page.community.mod.actions.manageUser")}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Flagged clips */}
                                                    <div className="space-y-2">
                                                        <p className="type-label-l text-on-surface">
                                                            {t("page.community.mod.audio.flaggedClipsTitle", {
                                                                count: batch.flagged_clips.length,
                                                            })}
                                                        </p>
                                                        {batch.flagged_clips.length === 0 ? (
                                                            <p className="type-body-s text-on-surface-variant">
                                                                {t("page.community.mod.audio.noFlaggedClips")}
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {batch.flagged_clips.map((clip) => (
                                                                    <div
                                                                        key={`${batch.batch_id}-${clip.beat_id}-${clip.raw_sha256}`}
                                                                        className="space-y-2 rounded-md3-md border border-outline-variant/60 bg-surface-container-low p-3"
                                                                    >
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                                <span className="font-mono type-label-l text-primary">
                                                                                    {clip.beat_id}
                                                                                </span>
                                                                                <span className="type-label-s text-on-surface-variant">
                                                                                    {formatDurationMs(clip.duration_ms)} · {formatByteSize(clip.size_bytes)}
                                                                                </span>
                                                                                {clip.detected_lang && (
                                                                                    <span className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 font-mono type-label-s text-on-surface-variant">
                                                                                        {clip.detected_lang}
                                                                                    </span>
                                                                                )}
                                                                                {clip.block_reason && (
                                                                                    <span className="rounded-md3-xs bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                                                                                        {clip.block_reason}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {clip.preview_url && (
                                                                            <audio
                                                                                controls
                                                                                preload="none"
                                                                                src={clip.preview_url}
                                                                                className="h-9 w-full max-w-md"
                                                                            />
                                                                        )}

                                                                        {clip.asr_transcript && (
                                                                            <div className="rounded-md3-sm bg-surface-container px-2.5 py-1.5 type-body-s text-on-surface">
                                                                                <span className="mr-1.5 type-label-s text-on-surface-variant">
                                                                                    {t("page.community.mod.audio.transcriptLabel")}
                                                                                </span>
                                                                                <span>{clip.asr_transcript}</span>
                                                                            </div>
                                                                        )}

                                                                        {clip.acoustic_summary?.trim() && (
                                                                            <div className="rounded-md3-sm bg-surface-container px-2.5 py-1.5 type-body-s text-on-surface-variant">
                                                                                {clip.acoustic_summary.trim()}
                                                                            </div>
                                                                        )}

                                                                        {clip.scores && Object.keys(clip.scores).length > 0 && (
                                                                            <pre className="max-h-36 overflow-auto rounded-md3-sm bg-surface-container p-2 font-mono type-label-s text-on-surface-variant">
                                                                                {JSON.stringify(clip.scores, null, 2)}
                                                                            </pre>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Review controls */}
                                                    <div className="space-y-2.5 border-t border-outline-variant/60 pt-3">
                                                        <TextField
                                                            label={t("page.community.mod.audio.reasonLabel")}
                                                            value={audioReviewReasons[batch.batch_id] ?? ""}
                                                            onValueChange={(next) =>
                                                                setAudioReviewReasons((prev) => ({
                                                                    ...prev,
                                                                    [batch.batch_id]: next,
                                                                }))
                                                            }
                                                            placeholder={t("page.community.mod.audio.reasonPlaceholder")}
                                                            disabled={isBusy}
                                                        />

                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="type-label-s text-on-surface-variant">
                                                                    {t("page.community.mod.audio.creditPenaltyLabel")}
                                                                </span>
                                                                {[0, -20, -40].map((delta) => (
                                                                    <Chip
                                                                        key={delta}
                                                                        variant="filter"
                                                                        selected={currentDelta === delta}
                                                                        disabled={isBusy}
                                                                        onClick={() =>
                                                                            setAudioHealthDeltas((prev) => ({
                                                                                ...prev,
                                                                                [batch.batch_id]: delta,
                                                                            }))
                                                                        }
                                                                    >
                                                                        {delta === 0
                                                                            ? t("page.community.mod.audio.noPenalty")
                                                                            : `${delta}`}
                                                                    </Chip>
                                                                ))}
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Button
                                                                    variant="filled"
                                                                    size="s"
                                                                    disabled={isBusy}
                                                                    onClick={() => void runAudioReview(batch.batch_id, "approve")}
                                                                >
                                                                    {t("page.community.mod.audio.approvePublish")}
                                                                </Button>
                                                                <Button
                                                                    variant="filled"
                                                                    size="s"
                                                                    color="error"
                                                                    disabled={isBusy}
                                                                    onClick={() => void runAudioReview(batch.batch_id, "reject")}
                                                                >
                                                                    {t("page.community.mod.audio.rejectAction")}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Surface>
                                            );
                                        })}
                                    </div>
                                )
                            ) : activeTab === "reports" ? (
                                reportItems.length === 0 ? (
                                    <EmptyState
                                        title={t("page.community.mod.emptyReports")}
                                        description={t("page.community.mod.emptyReportsDesc")}
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {reportItems.map((rep) => {
                                            const itemKey = `rep-${rep.id}`;
                                            const isBusy = busyId === itemKey;
                                            return (
                                                <Surface
                                                    key={itemKey}
                                                    tone="default"
                                                    radius="md"
                                                    className="space-y-2.5 p-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <CommunityAuthorBadge
                                                            author={rep.reporter}
                                                            timestamp={rep.created_at}
                                                            compact
                                                        />
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className="rounded-md3-xs bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                                                                {t(`common.comments.report.reasons.${rep.reason}`)}
                                                            </span>
                                                            <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant">
                                                                {rep.target_type} #{rep.target_id} · w={rep.weight}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {rep.detail && (
                                                        <p className="type-body-s text-on-surface">{rep.detail}</p>
                                                    )}
                                                    <p className="rounded-md3-sm bg-surface-container-lowest p-2.5 type-body-s text-on-surface-variant">
                                                        {rep.target_excerpt}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "resolve_report",
                                                                    target_type: "report",
                                                                    target_id: String(rep.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.resolveReport")}
                                                        </Button>
                                                        <Button
                                                            variant="outlined"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "dismiss_report",
                                                                    target_type: "report",
                                                                    target_id: String(rep.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.dismissReport")}
                                                        </Button>
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            color="error"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "remove",
                                                                    target_type: rep.target_type,
                                                                    target_id: String(rep.target_id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.removeTarget")}
                                                        </Button>
                                                        {rep.target_author_sub && (
                                                            <Button
                                                                variant="text"
                                                                size="xs"
                                                                icon={mdPerson}
                                                                disabled={isBusy}
                                                                onClick={() =>
                                                                    openUserGovernance(rep.target_author_sub)
                                                                }
                                                            >
                                                                {t("page.community.mod.actions.manageUser")}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Surface>
                                            );
                                        })}
                                    </div>
                                )
                            ) : activeTab === "appeals" ? (
                                appealItems.length === 0 ? (
                                    <EmptyState
                                        title={t("page.community.mod.emptyAppeals")}
                                        description={t("page.community.mod.emptyAppealsDesc")}
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {appealItems.map((appeal) => {
                                            const itemKey = `appeal-${appeal.id}`;
                                            const isBusy = busyId === itemKey;
                                            return (
                                                <Surface
                                                    key={itemKey}
                                                    tone="default"
                                                    radius="md"
                                                    className="space-y-2.5 p-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <CommunityAuthorBadge
                                                            author={appeal.appellant}
                                                            timestamp={appeal.created_at}
                                                            compact
                                                        />
                                                        <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant">
                                                            {appeal.target_type} #{appeal.target_id}
                                                        </span>
                                                    </div>
                                                    <p className="type-body-m text-on-surface">{appeal.reason}</p>
                                                    <p className="rounded-md3-sm bg-surface-container-lowest p-2.5 type-body-s text-on-surface-variant">
                                                        {appeal.target_excerpt}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "approve_appeal",
                                                                    target_type: "appeal",
                                                                    target_id: String(appeal.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.approveAppeal")}
                                                        </Button>
                                                        <Button
                                                            variant="outlined"
                                                            size="xs"
                                                            color="error"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void runAction(itemKey, {
                                                                    action: "reject_appeal",
                                                                    target_type: "appeal",
                                                                    target_id: String(appeal.id),
                                                                })
                                                            }
                                                        >
                                                            {t("page.community.mod.actions.rejectAppeal")}
                                                        </Button>
                                                        {!appeal.appellant.is_deleted && (
                                                            <Button
                                                                variant="text"
                                                                size="xs"
                                                                icon={mdPerson}
                                                                disabled={isBusy}
                                                                onClick={() =>
                                                                    openUserGovernance(appeal.appellant.sub)
                                                                }
                                                            >
                                                                {t("page.community.mod.actions.manageUser")}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Surface>
                                            );
                                        })}
                                    </div>
                                )
                            ) : activeTab === "users" ? (
                                <div className="space-y-5">
                                    <Surface tone="default" radius="md" className="space-y-3 p-4">
                                        <div className="space-y-1">
                                            <h3 className="type-title-s text-on-surface">
                                                {t("page.community.mod.userGov.title")}
                                            </h3>
                                            <p className="type-body-s text-on-surface-variant">
                                                {t("page.community.mod.userGov.description")}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap items-end gap-2">
                                            <TextField
                                                label={t("page.community.mod.userGov.lookupLabel")}
                                                value={lookupSub}
                                                onValueChange={setLookupSub}
                                                placeholder={t("page.community.mod.userGov.lookupPlaceholder")}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        void handleLookupUser();
                                                    }
                                                }}
                                                containerClassName="min-w-[220px] flex-1"
                                            />
                                            <Button
                                                variant="filled"
                                                size="s"
                                                icon={mdSearch}
                                                disabled={loadingUser || !lookupSub.trim()}
                                                onClick={() => void handleLookupUser()}
                                            >
                                                {loadingUser
                                                    ? t("common.state.loading")
                                                    : t("page.community.mod.userGov.lookupButton")}
                                            </Button>
                                        </div>

                                        {recentQueueUsers.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="type-label-m text-on-surface-variant">
                                                    {t("page.community.mod.userGov.recentFromQueue")}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {recentQueueUsers.map((entry) => (
                                                        <Chip
                                                            key={entry.sub}
                                                            variant="assist"
                                                            selected={targetUser?.sub === entry.sub}
                                                            onClick={() => void handleLookupUser(entry.sub)}
                                                        >
                                                            {entry.label !== entry.sub
                                                                ? `${entry.label} (${entry.sub})`
                                                                : entry.sub}
                                                        </Chip>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </Surface>

                                    {loadingUser ? (
                                        <LoadingState label={t("common.state.loading")} />
                                    ) : !targetUser ? (
                                        <EmptyState
                                            title={t("page.community.mod.userGov.emptyTitle")}
                                            description={t("page.community.mod.userGov.emptyDesc")}
                                        />
                                    ) : (
                                        <Surface tone="default" radius="md" className="space-y-4 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <CommunityAvatar
                                                        displayName={targetUser.display_name || targetUser.sub}
                                                        avatarUrl={targetUser.avatar_url}
                                                        avatarCardId={targetUser.avatar_card_id}
                                                        avatarCardTrained={targetUser.avatar_card_trained}
                                                        sizeClassName="h-12 w-12"
                                                        textClassName="type-title-m"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="truncate type-title-m text-on-surface">
                                                                {targetUser.display_name || targetUser.sub}
                                                            </span>
                                                            <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                                                {targetUser.trust_level === 4 && (
                                                                    <Icon path={mdStar} size={13} />
                                                                )}
                                                                <span>
                                                                    {t(getTrustLevelLabelKey(targetUser.trust_level))}
                                                                </span>
                                                            </span>
                                                            {isModeratorRole(targetUser.role) && (
                                                                <span className="inline-flex items-center gap-0.5 rounded-md3-xs bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                                                                    <Icon path={mdShield} size={13} />
                                                                    <span>{t("page.community.roles.mod")}</span>
                                                                </span>
                                                            )}
                                                            {typeof targetUser.health_score === "number" && (
                                                                <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface">
                                                                    {t("page.community.mod.healthBadge", {
                                                                        score: targetUser.health_score,
                                                                    })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <code className="block truncate font-mono type-label-s text-on-surface-variant">
                                                            {targetUser.sub}
                                                        </code>
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="outlined"
                                                    size="xs"
                                                    href={`/community/u/${encodeURIComponent(targetUser.sub)}`}
                                                >
                                                    {t("page.community.mod.userGov.viewProfile")}
                                                </Button>
                                            </div>

                                            <UserGovernancePanel
                                                target={targetUser}
                                                canManageMods={canManageMods}
                                                viewerSub={session.profile?.sub}
                                                onUpdated={(updated, message) => {
                                                    if (updated) setTargetUser(updated);
                                                    setError(null);
                                                    setNotice(message);
                                                }}
                                                onError={(message) => {
                                                    setNotice(null);
                                                    setError(message);
                                                }}
                                            />
                                        </Surface>
                                    )}
                                </div>
                            ) : activeTab === "events" ? (
                                eventItems.length === 0 ? (
                                    <EmptyState
                                        title={t("page.community.mod.emptyEvents")}
                                        description={t("page.community.mod.emptyEventsDesc")}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        {eventItems.map((ev) => (
                                            <Surface
                                                key={ev.id}
                                                tone="default"
                                                radius="md"
                                                className="space-y-1 p-3"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2 type-label-m">
                                                    <span className="text-on-surface">
                                                        #{ev.id} · {ev.target_type} #{ev.target_id} ·{" "}
                                                        {ev.stage} → {ev.decision}
                                                    </span>
                                                    <time className="type-label-s text-on-surface-variant">
                                                        {formatDate(ev.created_at, {
                                                            month: "short",
                                                            day: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </time>
                                                </div>
                                                {ev.reason && (
                                                    <div className="type-body-s text-on-surface-variant">
                                                        {ev.reason}
                                                    </div>
                                                )}
                                                {ev.scores && Object.keys(ev.scores).length > 0 && (
                                                    <pre className="overflow-x-auto rounded-md3-xs bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface-variant">
                                                        {JSON.stringify(ev.scores)}
                                                    </pre>
                                                )}
                                            </Surface>
                                        ))}
                                    </div>
                                )
                            ) : activeTab === "rules" ? (
                                <div className="space-y-5">
                                    {/* Add rule form */}
                                    <Surface tone="default" radius="md" className="space-y-3 p-4">
                                        <h3 className="type-title-s text-on-surface">
                                            {t("page.community.mod.addRuleTitle")}
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {availableRuleTiers.map((opt) => (
                                                <Chip
                                                    key={opt.id}
                                                    variant="filter"
                                                    selected={effectiveNewRuleTier === opt.id}
                                                    onClick={() => setNewRuleTier(opt.id)}
                                                >
                                                    {t(opt.labelKey)}
                                                </Chip>
                                            ))}
                                        </div>
                                        {!canManageMods && (
                                            <p className="type-body-s text-on-surface-variant">
                                                {t("page.community.mod.p0RestrictedHint")}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {RULE_MATCH_TYPE_OPTIONS.map((opt) => (
                                                <Chip
                                                    key={opt.id}
                                                    variant="filter"
                                                    selected={newRuleMatch === opt.id}
                                                    onClick={() => setNewRuleMatch(opt.id)}
                                                >
                                                    {t(opt.labelKey)}
                                                </Chip>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <TextField
                                                label={t("page.community.mod.rulePatternLabel")}
                                                value={newRulePattern}
                                                onValueChange={setNewRulePattern}
                                                placeholder={t("page.community.mod.rulePatternPlaceholder")}
                                            />
                                            <TextField
                                                label={t("page.community.mod.ruleNoteLabel")}
                                                value={newRuleNote}
                                                onValueChange={setNewRuleNote}
                                                placeholder={t("page.community.mod.ruleNotePlaceholder")}
                                            />
                                        </div>
                                        <Button
                                            variant="filled"
                                            size="s"
                                            icon={mdAdd}
                                            disabled={savingRule || !newRulePattern.trim()}
                                            onClick={() => void handleCreateRule()}
                                        >
                                            {t("page.community.mod.addRuleButton")}
                                        </Button>
                                    </Surface>

                                    {/* Existing rules list */}
                                    {ruleItems.length === 0 ? (
                                        <EmptyState
                                            title={t("page.community.mod.emptyRules")}
                                            description={t("page.community.mod.emptyRulesDesc")}
                                        />
                                    ) : (
                                        <div className="space-y-2">
                                            {ruleItems.map((rule) => {
                                                const canEditRule = canManageMods || rule.tier !== "p0_block";
                                                return (
                                                    <Surface
                                                        key={rule.id}
                                                        tone="default"
                                                        radius="md"
                                                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                                                    >
                                                        <div className="min-w-0 flex-1 space-y-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="rounded-md3-xs bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                                                    {t(`page.community.mod.ruleTiers.${rule.tier}`)}
                                                                </span>
                                                                <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant">
                                                                    {t(`page.community.mod.matchTypes.${rule.match_type}`)}
                                                                </span>
                                                                <code className="break-all font-mono type-body-m text-on-surface">
                                                                    {rule.pattern}
                                                                </code>
                                                            </div>
                                                            {rule.note && (
                                                                <p className="type-body-s text-on-surface-variant">
                                                                    {rule.note}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {canEditRule ? (
                                                            <div className="flex items-center gap-2">
                                                                <Switch
                                                                    checked={rule.enabled}
                                                                    disabled={busyId === `rule-${rule.id}`}
                                                                    onCheckedChange={(checked) =>
                                                                        void handleToggleRule(rule, checked)
                                                                    }
                                                                    aria-label={t("page.community.mod.ruleEnabledLabel")}
                                                                />
                                                                <IconButton
                                                                    icon={mdDelete}
                                                                    label={t("common.comments.delete")}
                                                                    disabled={busyId === `rule-${rule.id}`}
                                                                    onClick={() => void handleDeleteRule(rule.id)}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-md3-xs bg-surface-container-high px-2 py-1 type-label-s text-on-surface-variant">
                                                                <Icon path={mdLock} size={14} />
                                                                <span>{t("page.community.mod.ruleReadOnly")}</span>
                                                            </span>
                                                        )}
                                                    </Surface>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : auditItems.length === 0 ? (
                                <EmptyState
                                    title={t("page.community.mod.emptyAudit")}
                                    description={t("page.community.mod.emptyAuditDesc")}
                                />
                            ) : (
                                <div className="space-y-2">
                                    {auditItems.map((row) => (
                                        <Surface
                                            key={row.id}
                                            tone="default"
                                            radius="md"
                                            className="flex flex-wrap items-center justify-between gap-2 p-3"
                                        >
                                            <div className="min-w-0 space-y-0.5">
                                                <div className="type-body-m text-on-surface">
                                                    <span className="font-medium">
                                                        {row.actor_name || row.actor_sub}
                                                    </span>{" "}
                                                    · <span className="text-primary">{row.action}</span> ·{" "}
                                                    <span>
                                                        {row.target_type} #{row.target_id}
                                                    </span>
                                                </div>
                                                {row.reason && (
                                                    <div className="type-body-s text-on-surface-variant">
                                                        {row.reason}
                                                    </div>
                                                )}
                                            </div>
                                            <time className="shrink-0 type-label-s text-on-surface-variant">
                                                {formatDate(row.created_at, {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </time>
                                        </Surface>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
