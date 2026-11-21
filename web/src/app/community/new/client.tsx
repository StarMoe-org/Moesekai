"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { localizePathForBrowser } from "@/lib/localized-path";
import { signIn } from "@/lib/moesekai-account";
import {
    createCommunityPost,
    getCommunityErrorMessage,
    isCommunityApiError,
} from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import CommunityMarkdown, { SpoilerCurtain } from "@/components/community/CommunityMarkdown";
import StickerPicker from "@/components/community/StickerPicker";
import EntityInserter from "@/components/community/EntityInserter";
import PolicyAgreementDialog from "@/components/community/PolicyAgreementDialog";
import TurnstileWidget from "@/components/community/TurnstileWidget";
import {
    Banner,
    Button,
    Chip,
    IconButton,
    PageContainer,
    PageHeader,
    SectionCard,
    Switch,
    Tabs,
    TextField,
} from "@/components/md3";
import {
    mdAdd,
    mdAddLink,
    mdArrowBack,
    mdLogin,
    mdSend,
    mdSentimentSatisfied,
    mdVisibilityOff,
} from "@/components/md3/icons";
import {
    POST_CATEGORY_OPTIONS,
    SERVER_TAG_OPTIONS,
    type PostCategory,
    type ServerTag,
} from "@/types/community";

const MAX_TAGS = 5;

export default function NewPostClient() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const session = useCommunitySession();

    const [category, setCategory] = useState<PostCategory>("general");
    const [serverTag, setServerTag] = useState<ServerTag>("all");
    const [title, setTitle] = useState("");
    const [bodyMd, setBodyMd] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [isSpoiler, setIsSpoiler] = useState(false);
    const [editorTab, setEditorTab] = useState<"write" | "preview">("write");

    const [stickerOpen, setStickerOpen] = useState(false);
    const [entityOpen, setEntityOpen] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [cooldownSec, setCooldownSec] = useState(0);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prefilledRef = useRef(false);

    // Support deep link from entity detail pages (e.g. /community/new?entityType=card&entityId=1234)
    useEffect(() => {
        if (prefilledRef.current) return;
        const entityType = searchParams.get("entityType");
        const entityId = searchParams.get("entityId");
        if (
            entityType &&
            entityId &&
            /^(card|music|event|gacha|costume|character)$/.test(entityType) &&
            /^\d{1,8}$/.test(entityId)
        ) {
            prefilledRef.current = true;
            setBodyMd(`[${entityType}:${entityId}]\n\n`);
            if (entityType === "card") {
                setCategory("review");
            }
        }
    }, [searchParams]);

    useEffect(() => {
        if (cooldownSec <= 0) return;
        const timer = window.setInterval(() => {
            setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownSec]);

    const insertAtCursor = useCallback((token: string) => {
        const el = textareaRef.current;
        if (!el) {
            setBodyMd((prev) => (prev ? `${prev} ${token}` : token));
            return;
        }
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        setBodyMd((prev) => `${prev.slice(0, start)}${token}${prev.slice(end)}`);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + token.length;
            el.setSelectionRange(pos, pos);
        });
    }, []);

    const handleAddTag = () => {
        const cleaned = tagInput.trim().replace(/^#+/, "");
        if (!cleaned || tags.length >= MAX_TAGS) return;
        if (!tags.includes(cleaned)) {
            setTags((prev) => [...prev, cleaned]);
        }
        setTagInput("");
    };

    const handleSubmit = useCallback(async () => {
        const trimmedTitle = title.trim();
        const trimmedBody = bodyMd.trim();
        if (!trimmedTitle || !trimmedBody) {
            setError(t("page.community.composer.missingFields"));
            return;
        }
        if (session.communityMode === "read_only") {
            setError(t("common.comments.errors.readOnly"));
            return;
        }
        if (session.authenticated && session.profile && !session.profile.policy_accepted_at) {
            setPolicyOpen(true);
            return;
        }
        if (session.turnstileSiteKey && !turnstileToken) {
            setError(t("common.comments.errors.turnstileFailed"));
            return;
        }
        setSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            const res = await createCommunityPost({
                category,
                server_tag: serverTag,
                title: trimmedTitle,
                body_md: trimmedBody,
                tags,
                is_spoiler: isSpoiler,
                turnstile_token: turnstileToken || undefined,
            });
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            if (res.moderation_notice === "pending_review") {
                setNotice(t("page.community.composer.pendingReviewRedirect"));
            } else if (res.auto_spoiler_applied || res.moderation_notice === "auto_spoiler") {
                setNotice(t("common.comments.notices.autoSpoiler"));
            }
            router.push(localizePathForBrowser(`/community/post/${res.post.id}`));
        } catch (err) {
            setTurnstileToken("");
            setTurnstileResetNonce((n) => n + 1);
            if (isCommunityApiError(err)) {
                if (err.code === "policy_not_accepted") {
                    setPolicyOpen(true);
                    return;
                }
                if (err.code === "rate_limited" && err.retryAfterSec) {
                    setCooldownSec(err.retryAfterSec);
                }
            }
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSubmitting(false);
        }
    }, [
        bodyMd,
        category,
        isSpoiler,
        router,
        serverTag,
        session.authenticated,
        session.communityMode,
        session.profile,
        session.turnstileSiteKey,
        t,
        tags,
        title,
        turnstileToken,
    ]);

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <PageHeader
                    title={t("page.community.composer.pageTitle")}
                    description={t("page.community.composer.pageDesc")}
                    actions={
                        <Button variant="tonal" size="s" icon={mdArrowBack} href="/community">
                            {t("page.community.backToFeed")}
                        </Button>
                    }
                />

                {session.communityMode === "read_only" && (
                    <Banner
                        tone="warning"
                        title={t("common.comments.modeBanner.readOnlyTitle")}
                        className="mb-4"
                    >
                        {t("common.comments.modeBanner.readOnlyDesc")}
                    </Banner>
                )}

                {session.communityMode === "strict_review" && (
                    <Banner
                        tone="info"
                        title={t("common.comments.modeBanner.strictReviewTitle")}
                        className="mb-4"
                    >
                        {t("common.comments.modeBanner.strictReviewDesc")}
                    </Banner>
                )}

                {!session.authenticated ? (
                    <SectionCard>
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <p className="type-title-m text-on-surface">
                                {t("common.comments.loginPromptTitle")}
                            </p>
                            <p className="max-w-md type-body-m text-on-surface-variant">
                                {t("common.comments.loginPromptDesc")}
                            </p>
                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                {t("common.comments.signInButton")}
                            </Button>
                        </div>
                    </SectionCard>
                ) : (
                    <SectionCard>
                        <div className="space-y-5">
                            {/* Category */}
                            <div>
                                <p className="mb-2 type-label-l text-on-surface">
                                    {t("page.community.filters.category")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {POST_CATEGORY_OPTIONS.map((opt) => (
                                        <Chip
                                            key={opt.id}
                                            variant="filter"
                                            selected={category === opt.id}
                                            onClick={() => setCategory(opt.id)}
                                        >
                                            {t(opt.labelKey)}
                                        </Chip>
                                    ))}
                                </div>
                                {category === "story" && !isSpoiler && (
                                    <Banner tone="warning" className="mt-2.5">
                                        {t("page.community.composer.storySpoilerReminder")}
                                    </Banner>
                                )}
                            </div>

                            {/* Server tag */}
                            <div>
                                <p className="mb-2 type-label-l text-on-surface">
                                    {t("page.community.filters.server")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {SERVER_TAG_OPTIONS.map((opt) => (
                                        <Chip
                                            key={opt.id}
                                            variant="filter"
                                            selected={serverTag === opt.id}
                                            onClick={() => setServerTag(opt.id)}
                                        >
                                            {t(opt.labelKey)}
                                        </Chip>
                                    ))}
                                </div>
                            </div>

                            {/* Title */}
                            <TextField
                                label={t("page.community.composer.titleLabel")}
                                value={title}
                                onValueChange={setTitle}
                                maxLength={120}
                                placeholder={t("page.community.composer.titlePlaceholder")}
                                required
                            />

                            {/* Body editor & preview */}
                            <div>
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <Tabs
                                        items={[
                                            { value: "write", label: t("common.comments.editMode") },
                                            { value: "preview", label: t("common.comments.previewMode") },
                                        ]}
                                        value={editorTab}
                                        onValueChange={setEditorTab}
                                        variant="secondary"
                                        className="border-b-0"
                                    />
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdSentimentSatisfied}
                                            onClick={() => setStickerOpen(true)}
                                        >
                                            {t("common.comments.stickerPicker.open")}
                                        </Button>
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdAddLink}
                                            onClick={() => setEntityOpen(true)}
                                        >
                                            {t("common.comments.entityInserter.open")}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="xs"
                                            icon={mdVisibilityOff}
                                            onClick={() => insertAtCursor("||spoiler||")}
                                        >
                                            {t("page.community.composer.insertInlineSpoiler")}
                                        </Button>
                                    </div>
                                </div>

                                {editorTab === "write" ? (
                                    <textarea
                                        ref={textareaRef}
                                        value={bodyMd}
                                        onChange={(e) => setBodyMd(e.target.value)}
                                        rows={10}
                                        maxLength={10000}
                                        placeholder={t("page.community.composer.bodyPlaceholder")}
                                        className="w-full resize-y rounded-md3-md border border-outline-variant bg-surface-container-lowest p-3.5 type-body-m text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                                    />
                                ) : (
                                    <div className="min-h-[220px] rounded-md3-md border border-outline-variant bg-surface-container-lowest p-4">
                                        {bodyMd.trim() ? (
                                            <SpoilerCurtain isSpoiler={isSpoiler}>
                                                <CommunityMarkdown content={bodyMd} />
                                            </SpoilerCurtain>
                                        ) : (
                                            <p className="type-body-m text-on-surface-variant">
                                                {t("common.comments.previewEmpty")}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <p className="mt-1.5 type-label-s text-on-surface-variant">
                                    {t("page.community.composer.markdownHint")}
                                </p>
                            </div>

                            {/* Tags */}
                            <div>
                                <div className="flex items-center gap-2">
                                    <TextField
                                        label={t("page.community.composer.tagsLabel")}
                                        value={tagInput}
                                        onValueChange={setTagInput}
                                        maxLength={24}
                                        placeholder={t("page.community.composer.tagsPlaceholder")}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddTag();
                                            }
                                        }}
                                        disabled={tags.length >= MAX_TAGS}
                                        containerClassName="flex-1"
                                    />
                                    <IconButton
                                        icon={mdAdd}
                                        label={t("page.community.composer.addTag")}
                                        onClick={handleAddTag}
                                        disabled={!tagInput.trim() || tags.length >= MAX_TAGS}
                                    />
                                </div>
                                {tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {tags.map((tag) => (
                                            <Chip
                                                key={tag}
                                                variant="input"
                                                selected
                                                onRemove={() =>
                                                    setTags((prev) => prev.filter((item) => item !== tag))
                                                }
                                                removeLabel={t("common.action.close")}
                                            >
                                                #{tag}
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Spoiler toggle */}
                            <Switch
                                checked={isSpoiler}
                                onCheckedChange={setIsSpoiler}
                                label={t("page.community.composer.spoilerLabel")}
                                description={t("page.community.composer.spoilerDesc")}
                            />

                            {session.turnstileSiteKey && (
                                <TurnstileWidget
                                    siteKey={session.turnstileSiteKey}
                                    onToken={setTurnstileToken}
                                    resetNonce={turnstileResetNonce}
                                />
                            )}

                            {error && <Banner tone="error">{error}</Banner>}
                            {notice && <Banner tone="info">{notice}</Banner>}

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="text" href="/community">
                                    {t("common.action.cancel")}
                                </Button>
                                <Button
                                    variant="filled"
                                    icon={mdSend}
                                    disabled={
                                        submitting ||
                                        cooldownSec > 0 ||
                                        session.communityMode === "read_only" ||
                                        !title.trim() ||
                                        !bodyMd.trim() ||
                                        (Boolean(session.turnstileSiteKey) && !turnstileToken)
                                    }
                                    onClick={() => void handleSubmit()}
                                >
                                    {cooldownSec > 0
                                        ? t("common.comments.cooldownButton", { seconds: cooldownSec })
                                        : submitting
                                          ? t("common.comments.submitting")
                                          : t("page.community.composer.publish")}
                                </Button>
                            </div>
                        </div>
                    </SectionCard>
                )}

                <StickerPicker
                    isOpen={stickerOpen}
                    onClose={() => setStickerOpen(false)}
                    onSelect={(stampId) => insertAtCursor(`[stamp:${stampId}]`)}
                />
                <EntityInserter
                    isOpen={entityOpen}
                    onClose={() => setEntityOpen(false)}
                    onInsert={(token) => insertAtCursor(token)}
                />
                <PolicyAgreementDialog
                    isOpen={policyOpen}
                    onClose={() => setPolicyOpen(false)}
                    onAccepted={() => void handleSubmit()}
                />
            </PageContainer>
        </MainLayout>
    );
}
