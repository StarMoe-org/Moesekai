"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { signIn } from "@/lib/moesekai-account";
import {
    completeStoryAudioUpload,
    dedupStoryAudio,
    fetchStoryAudioStatus,
    getCommunityErrorMessage,
    initStoryAudioUpload,
    isCommunityApiError,
} from "@/lib/community-api";
import { useCommunitySession } from "@/lib/community-session";
import { SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS, type UiLocale } from "@/lib/i18n/locales";
import {
    STORY_AUDIO_LIMITS,
    SUPPORTED_AUDIO_EXTENSIONS,
    buildAudioTarBundle,
    estimateTarArchiveBytes,
    extractTalkBeatsForVoice,
    formatByteSize,
    formatDurationMs,
    inferStorySourceLocale,
    isSupportedAudioFilename,
    matchAudioFilesToTalkBeats,
    probeAudioDurationMs,
    putBlobWithProgress,
    sha256Hex,
    validateAudioSelection,
    type AudioValidationIssue,
    type StoryDocument,
    type TalkBeatVoiceSlot,
} from "@moesekai/story-core";
import {
    Banner,
    Button,
    Checkbox,
    Chip,
    Icon,
    IconButton,
    LinearProgress,
    Surface,
    cn,
} from "@/components/md3";
import {
    mdClose,
    mdDelete,
    mdFolderOpen,
    mdLogin,
    mdPublish,
    mdRefresh,
    mdUploadFile,
} from "@/components/md3/icons";
import type { StoryAudioStatusResponse, StoryVoiceStatus } from "@/types/community";

interface AssignedAudioClip {
    file: File;
    durationMs: number | null;
    probing: boolean;
}

type UploadPhase =
    | "idle"
    | "hashing"
    | "deduping"
    | "packing"
    | "uploading"
    | "completing";

export interface StoryAudioUploadPanelProps {
    doc: StoryDocument;
    publishedPostId: number | null;
    onRequestPublish?: () => void;
    onVoiceManifestReady?: (manifestUrl: string) => void;
    onNotify?: (message: string) => void;
}

const AUDIO_ACCEPT_ATTR = `${SUPPORTED_AUDIO_EXTENSIONS.join(",")},audio/*`;
const PROBE_CONCURRENCY = 6;

function statusBadgeTone(status: StoryVoiceStatus): string {
    switch (status) {
        case "published":
            return "bg-primary-container text-on-primary-container";
        case "queued":
        case "processing":
        case "uploading":
            return "bg-secondary-container text-on-secondary-container";
        case "pending_review":
            return "bg-warning-container text-on-warning-container";
        case "rejected":
            return "bg-error-container text-on-error-container";
        default:
            return "bg-surface-container-high text-on-surface-variant";
    }
}

function statusLabelKey(status: StoryVoiceStatus): string {
    switch (status) {
        case "published":
            return "page.storyMaker.audioUpload.status.published";
        case "uploading":
        case "queued":
        case "processing":
            return "page.storyMaker.audioUpload.status.queued";
        case "pending_review":
            return "page.storyMaker.audioUpload.status.pendingReview";
        case "rejected":
            return "page.storyMaker.audioUpload.status.rejected";
        default:
            return "page.storyMaker.audioUpload.status.none";
    }
}

export function StoryAudioUploadPanel({
    doc,
    publishedPostId,
    onRequestPublish,
    onVoiceManifestReady,
    onNotify,
}: StoryAudioUploadPanelProps) {
    const { t } = useI18n();
    const session = useCommunitySession();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const singleBeatInputRef = useRef<HTMLInputElement | null>(null);
    const singleBeatTargetRef = useRef<string | null>(null);
    const uploadAbortRef = useRef<AbortController | null>(null);
    const statusSeqRef = useRef(0);
    const mountedRef = useRef(true);
    const tRef = useRef(t);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        if (folderInputRef.current) {
            folderInputRef.current.setAttribute("webkitdirectory", "");
            folderInputRef.current.setAttribute("directory", "");
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            uploadAbortRef.current?.abort();
            uploadAbortRef.current = null;
            statusSeqRef.current += 1;
        };
    }, []);

    const talkBeats = useMemo<TalkBeatVoiceSlot[]>(() => extractTalkBeatsForVoice(doc), [doc]);
    const beatMap = useMemo(() => {
        const map = new Map<string, TalkBeatVoiceSlot>();
        for (const beat of talkBeats) {
            map.set(beat.beatId, beat);
        }
        return map;
    }, [talkBeats]);

    const [voiceLocale, setVoiceLocale] = useState<UiLocale>(() => inferStorySourceLocale(doc));
    const [assignedByBeat, setAssignedByBeat] = useState<Record<string, AssignedAudioClip>>({});
    const [unmatchedFiles, setUnmatchedFiles] = useState<File[]>([]);
    const [ignoredCount, setIgnoredCount] = useState(0);
    const [rightsConfirmed, setRightsConfirmed] = useState(false);

    const [statusLoading, setStatusLoading] = useState(false);
    const [serverStatus, setServerStatus] = useState<StoryAudioStatusResponse | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);

    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [progressRatio, setProgressRatio] = useState<number>(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadNotice, setUploadNotice] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        if (!publishedPostId || !session.authenticated) return;
        const seq = ++statusSeqRef.current;
        setStatusLoading(true);
        setStatusError(null);
        try {
            const res = await fetchStoryAudioStatus(publishedPostId);
            if (seq !== statusSeqRef.current) return;
            setServerStatus(res);
        } catch (err) {
            if (seq !== statusSeqRef.current) return;
            setStatusError(getCommunityErrorMessage(err, tRef.current));
        } finally {
            if (seq === statusSeqRef.current) {
                setStatusLoading(false);
            }
        }
    }, [publishedPostId, session.authenticated]);

    useEffect(() => {
        setServerStatus(null);
        setStatusError(null);
        if (publishedPostId && session.authenticated) {
            void loadStatus();
        }
        return () => {
            statusSeqRef.current += 1;
        };
    }, [loadStatus, publishedPostId, session.authenticated]);

    const probeFilesForBeats = useCallback(async (pairs: Array<[string, File]>) => {
        if (pairs.length === 0) return;
        let cursor = 0;
        const runWorker = async () => {
            while (cursor < pairs.length) {
                const index = cursor;
                cursor += 1;
                const [beatId, file] = pairs[index];
                let durationMs: number | null = null;
                try {
                    durationMs = await probeAudioDurationMs(file);
                } finally {
                    if (mountedRef.current) {
                        setAssignedByBeat((prev) => {
                            const existing = prev[beatId];
                            if (!existing || existing.file !== file) return prev;
                            return {
                                ...prev,
                                [beatId]: { ...existing, durationMs, probing: false },
                            };
                        });
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, pairs.length) }, runWorker));
    }, []);

    const ingestFiles = useCallback(
        (incoming: FileList | File[]) => {
            const list = Array.from(incoming);
            if (list.length === 0) return;
            setUploadError(null);
            setUploadNotice(null);

            const result = matchAudioFilesToTalkBeats(list, talkBeats);
            setIgnoredCount(result.unsupported.length);

            const pairs: Array<[string, File]> = [];
            if (result.matched.size > 0) {
                setAssignedByBeat((prev) => {
                    const next = { ...prev };
                    for (const [beatId, file] of result.matched.entries()) {
                        next[beatId] = { file, durationMs: null, probing: true };
                        pairs.push([beatId, file]);
                    }
                    return next;
                });
                void probeFilesForBeats(pairs);
            }

            if (result.unmatched.length > 0) {
                setUnmatchedFiles((prev) => [...prev, ...result.unmatched].slice(0, 200));
            }
        },
        [probeFilesForBeats, talkBeats],
    );

    const assignSingleBeatFile = useCallback(
        (beatId: string, file: File) => {
            if (!isSupportedAudioFilename(file.name)) {
                setUploadError(t("page.storyMaker.audioUpload.errors.unsupportedFormat"));
                return;
            }
            setUploadError(null);
            setAssignedByBeat((prev) => ({
                ...prev,
                [beatId]: { file, durationMs: null, probing: true },
            }));
            void probeFilesForBeats([[beatId, file]]);
        },
        [probeFilesForBeats, t],
    );

    const removeBeatAssignment = (beatId: string) => {
        setAssignedByBeat((prev) => {
            if (!(beatId in prev)) return prev;
            const next = { ...prev };
            delete next[beatId];
            return next;
        });
    };

    const assignedEntries = useMemo(
        () =>
            talkBeats
                .map((slot) => ({ slot, clip: assignedByBeat[slot.beatId] }))
                .filter((item): item is { slot: TalkBeatVoiceSlot; clip: AssignedAudioClip } => Boolean(item.clip)),
        [assignedByBeat, talkBeats],
    );

    const probingCount = useMemo(
        () => assignedEntries.filter((entry) => entry.clip.probing).length,
        [assignedEntries],
    );

    const totalDurationMs = useMemo(
        () => assignedEntries.reduce((sum, entry) => sum + (entry.clip.durationMs ?? 0), 0),
        [assignedEntries],
    );

    const estimatedArchiveBytes = useMemo(
        () =>
            assignedEntries.length > 0
                ? estimateTarArchiveBytes(assignedEntries.map((entry) => entry.clip.file.size))
                : 0,
        [assignedEntries],
    );

    const validationIssues = useMemo<AudioValidationIssue[]>(() => {
        if (assignedEntries.length === 0 || probingCount > 0) return [];
        return validateAudioSelection(
            assignedEntries.map((entry) => ({
                beatId: entry.slot.beatId,
                sizeBytes: entry.clip.file.size,
                durationMs: entry.clip.durationMs,
            })),
        );
    }, [assignedEntries, probingCount]);

    const formatIssueMessage = (issue: AudioValidationIssue): string => {
        switch (issue.code) {
            case "tooManyClips":
                return t("page.storyMaker.audioUpload.errors.tooManyClips", {
                    max: STORY_AUDIO_LIMITS.maxArchiveClipFiles,
                });
            case "fileTooLarge":
                return t("page.storyMaker.audioUpload.errors.fileTooLarge", {
                    beatId: issue.beatId ?? "",
                });
            case "clipTooLong":
                return t("page.storyMaker.audioUpload.errors.clipTooLong", {
                    beatId: issue.beatId ?? "",
                });
            case "totalDurationExceeded":
                return t("page.storyMaker.audioUpload.errors.totalDurationExceeded");
            case "archiveTooLarge":
                return t("page.storyMaker.audioUpload.errors.archiveTooLarge");
            case "missingDuration":
                return t("page.storyMaker.audioUpload.errors.unreadableAudio", {
                    beatId: issue.beatId ?? "",
                });
            default:
                return t("page.storyMaker.audioUpload.errors.emptySelection");
        }
    };

    const busy = phase !== "idle";

    const handleCancelUpload = () => {
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        setPhase("idle");
        setProgressRatio(0);
    };

    const handleStartUpload = async () => {
        if (!publishedPostId || !session.authenticated) return;
        if (assignedEntries.length === 0 || probingCount > 0 || validationIssues.length > 0 || !rightsConfirmed) {
            return;
        }

        uploadAbortRef.current?.abort();
        const controller = new AbortController();
        uploadAbortRef.current = controller;

        setUploadError(null);
        setUploadNotice(null);
        setPhase("hashing");
        setProgressRatio(0);

        try {
            // 1. Compute SHA-256 for every matched audio clip
            const hashedClips: Array<{
                beatId: string;
                file: File;
                rawSha256: string;
                durationMs: number;
                sizeBytes: number;
                speaker: string;
            }> = [];

            for (let i = 0; i < assignedEntries.length; i += 1) {
                if (controller.signal.aborted) {
                    throw new DOMException("Aborted", "AbortError");
                }
                const { slot, clip } = assignedEntries[i];
                const rawSha256 = await sha256Hex(clip.file);
                hashedClips.push({
                    beatId: slot.beatId,
                    file: clip.file,
                    rawSha256,
                    durationMs: clip.durationMs ?? 1000,
                    sizeBytes: clip.file.size,
                    speaker: slot.speakerName,
                });
                setProgressRatio((i + 1) / assignedEntries.length);
            }

            // 2. Incremental dedup check
            setPhase("deduping");
            setProgressRatio(0);
            const dedupRes = await dedupStoryAudio(
                publishedPostId,
                {
                    clips: hashedClips.map((c) => ({
                        beat_id: c.beatId,
                        raw_sha256: c.rawSha256,
                        duration_ms: c.durationMs,
                        size_bytes: c.sizeBytes,
                    })),
                },
                { signal: controller.signal },
            );
            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            if (dedupRes.blocked_hashes.length > 0) {
                const blockedSet = new Set(dedupRes.blocked_hashes);
                const blockedBeats = hashedClips
                    .filter((c) => blockedSet.has(c.rawSha256))
                    .map((c) => c.beatId);
                setUploadError(
                    t("page.storyMaker.audioUpload.errors.blockedBeats", {
                        beats: blockedBeats.slice(0, 6).join(", "),
                    }),
                );
                return;
            }

            const needUploadSet = new Set(dedupRes.need_upload_hashes);
            const needUploadClips = hashedClips.filter((c) => needUploadSet.has(c.rawSha256));

            // 3. Build single zero-copy USTAR .tar archive ONLY for clips needing upload
            let archiveBlob: Blob | null = null;
            let archiveSizeBytes = 0;
            const archiveFilenameByBeat = new Map<string, string>();

            if (needUploadClips.length > 0) {
                setPhase("packing");
                const bundle = buildAudioTarBundle(
                    needUploadClips.map((c) => ({
                        beatId: c.beatId,
                        file: c.file,
                        originalFilename: c.file.name,
                        rawSha256: c.rawSha256,
                        speaker: c.speaker,
                    })),
                );
                archiveBlob = bundle.blob;
                archiveSizeBytes = bundle.archiveSizeBytes;
                for (const entry of bundle.entries) {
                    archiveFilenameByBeat.set(entry.beat_id, entry.filename);
                }
            }

            const initRes = await initStoryAudioUpload(
                publishedPostId,
                {
                    rights_confirmed: true,
                    voice_locale: voiceLocale,
                    archive_format: "tar",
                    archive_size_bytes: archiveSizeBytes,
                    estimated_duration_ms: totalDurationMs,
                    clips: hashedClips.map((c) => ({
                        beat_id: c.beatId,
                        raw_sha256: c.rawSha256,
                        filename: archiveFilenameByBeat.get(c.beatId),
                        duration_ms: c.durationMs,
                        size_bytes: c.sizeBytes,
                    })),
                },
                { signal: controller.signal },
            );
            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            if (initRes.instant_published) {
                const msg = t("page.storyMaker.audioUpload.instantPublished");
                setUploadNotice(msg);
                onNotify?.(msg);
                if (initRes.voice_manifest_url) {
                    onVoiceManifestReady?.(initRes.voice_manifest_url);
                }
                await loadStatus();
                return;
            }

            if (!archiveBlob || !initRes.upload_put_url) {
                throw new Error("missing_upload_url");
            }

            // 4. Single direct Presigned PUT with real progress
            setPhase("uploading");
            setProgressRatio(0);
            await putBlobWithProgress(initRes.upload_put_url, archiveBlob, {
                contentType: "application/x-tar",
                signal: controller.signal,
                onProgress: (percent) => {
                    setProgressRatio(percent / 100);
                },
            });
            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            // 5. Commit upload completion -> enters moderation queue
            setPhase("completing");
            await completeStoryAudioUpload(publishedPostId, initRes.batch_id, {
                signal: controller.signal,
            });
            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            const queuedMsg = t("page.storyMaker.audioUpload.queuedToast", {
                uploaded: initRes.new_clip_count,
                reused: initRes.reused_clip_count,
            });
            setUploadNotice(queuedMsg);
            onNotify?.(queuedMsg);
            await loadStatus();
        } catch (err) {
            if (
                controller.signal.aborted
                || (err instanceof DOMException && err.name === "AbortError")
                || uploadAbortRef.current !== controller
            ) {
                return;
            }
            if (isCommunityApiError(err)) {
                setUploadError(getCommunityErrorMessage(err, t));
            } else if (err instanceof Error && err.message.startsWith("Archive size exceeds limit")) {
                setUploadError(t("page.storyMaker.audioUpload.errors.archiveTooLarge"));
            } else if (err instanceof Error && err.message.startsWith("Too many clips")) {
                setUploadError(
                    t("page.storyMaker.audioUpload.errors.tooManyClips", {
                        max: STORY_AUDIO_LIMITS.maxArchiveClipFiles,
                    }),
                );
            } else {
                setUploadError(t("page.storyMaker.audioUpload.errors.uploadFailed"));
            }
        } finally {
            if (uploadAbortRef.current === controller) {
                uploadAbortRef.current = null;
                setPhase("idle");
            }
        }
    };

    if (!publishedPostId) {
        return (
            <Surface tone="low" radius="lg" className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="type-title-m text-on-surface">
                    {t("page.storyMaker.audioUpload.publishFirstTitle")}
                </p>
                <p className="max-w-md type-body-s text-on-surface-variant">
                    {t("page.storyMaker.audioUpload.publishFirstDesc")}
                </p>
                {onRequestPublish && (
                    <Button variant="filled" icon={mdPublish} onClick={onRequestPublish}>
                        {t("page.storyMaker.publish.openAction")}
                    </Button>
                )}
            </Surface>
        );
    }

    if (!session.authenticated) {
        return (
            <Surface tone="low" radius="lg" className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="type-title-m text-on-surface">
                    {t("common.comments.loginPromptTitle")}
                </p>
                <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                    {t("common.comments.signInButton")}
                </Button>
            </Surface>
        );
    }

    return (
        <div className="min-w-0 space-y-4">
            {/* Live server status */}
            <Surface tone="low" radius="lg" className="space-y-2 border border-outline-variant/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="type-label-l text-on-surface">
                            {t("page.storyMaker.audioUpload.serverStatusTitle")}
                        </span>
                        {serverStatus && (
                            <span
                                className={cn(
                                    "rounded-md3-xs px-2 py-0.5 type-label-s",
                                    statusBadgeTone(serverStatus.voice_status),
                                )}
                            >
                                {t(statusLabelKey(serverStatus.voice_status))}
                            </span>
                        )}
                    </div>
                    <IconButton
                        size="xs"
                        icon={mdRefresh}
                        label={t("page.community.mod.refresh")}
                        disabled={statusLoading}
                        onClick={() => void loadStatus()}
                    />
                </div>
                {serverStatus && serverStatus.voice_clip_count > 0 && (
                    <p className="type-body-s text-on-surface-variant">
                        {t("page.storyMaker.audioUpload.serverStats", {
                            count: serverStatus.voice_clip_count,
                            duration: formatDurationMs(serverStatus.voice_duration_ms),
                        })}
                    </p>
                )}
                {serverStatus?.latest_batch?.failure_reason &&
                    (serverStatus.voice_status === "rejected" || serverStatus.latest_batch.status === "failed") && (
                        <Banner tone="error">{serverStatus.latest_batch.failure_reason}</Banner>
                    )}
                {statusError && <Banner tone="error">{statusError}</Banner>}
            </Surface>

            {/* Voice language selector */}
            <div className="space-y-1.5">
                <p className="type-label-l text-on-surface">
                    {t("page.storyMaker.audioUpload.localeLabel")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {SUPPORTED_UI_LOCALES.map((loc) => (
                        <Chip
                            key={loc}
                            variant="filter"
                            selected={voiceLocale === loc}
                            disabled={busy}
                            onClick={() => setVoiceLocale(loc)}
                        >
                            {UI_LOCALE_LABELS[loc]}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Folder / multi-file dropzone */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={AUDIO_ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) ingestFiles(e.target.files);
                    e.target.value = "";
                }}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) ingestFiles(e.target.files);
                    e.target.value = "";
                }}
            />
            <input
                ref={singleBeatInputRef}
                type="file"
                accept={AUDIO_ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                    const targetBeat = singleBeatTargetRef.current;
                    const file = e.target.files?.[0];
                    if (targetBeat && file) {
                        assignSingleBeatFile(targetBeat, file);
                    }
                    e.target.value = "";
                }}
            />

            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    if (!busy && e.dataTransfer.files?.length) {
                        ingestFiles(e.dataTransfer.files);
                    }
                }}
                className="flex flex-col items-center gap-2.5 rounded-md3-lg border-2 border-dashed border-outline-variant bg-surface-container px-4 py-5 text-center"
            >
                <Icon path={mdUploadFile} size={26} className="text-primary" />
                <div className="space-y-0.5">
                    <p className="type-title-s text-on-surface">
                        {t("page.storyMaker.audioUpload.dropTitle")}
                    </p>
                    <p className="type-body-s text-on-surface-variant">
                        {t("page.storyMaker.audioUpload.dropHint")}
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdUploadFile}
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {t("page.storyMaker.audioUpload.pickFiles")}
                    </Button>
                    <Button
                        size="s"
                        variant="outlined"
                        icon={mdFolderOpen}
                        disabled={busy}
                        onClick={() => folderInputRef.current?.click()}
                    >
                        {t("page.storyMaker.audioUpload.pickFolder")}
                    </Button>
                </div>
            </div>

            {/* Summary metrics */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md3-md bg-surface-container-low px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-s text-on-surface">
                    <span>
                        {t("page.storyMaker.audioUpload.matchedCount", {
                            matched: assignedEntries.length,
                            total: talkBeats.length,
                        })}
                    </span>
                    {assignedEntries.length > 0 && (
                        <>
                            <span className="text-on-surface-variant">·</span>
                            <span>
                                {t("page.storyMaker.audioUpload.totalDuration", {
                                    duration: formatDurationMs(totalDurationMs),
                                })}
                            </span>
                            <span className="text-on-surface-variant">·</span>
                            <span>{formatByteSize(estimatedArchiveBytes)}</span>
                        </>
                    )}
                </div>
                {assignedEntries.length > 0 && (
                    <Button
                        size="xs"
                        variant="text"
                        disabled={busy}
                        onClick={() => {
                            setAssignedByBeat({});
                            setUnmatchedFiles([]);
                            setIgnoredCount(0);
                        }}
                    >
                        {t("page.storyMaker.audioUpload.clearAll")}
                    </Button>
                )}
            </div>

            {ignoredCount > 0 && (
                <Banner tone="info">
                    {t("page.storyMaker.audioUpload.ignoredNotice", { count: ignoredCount })}
                </Banner>
            )}

            {/* Unmatched files manual binder */}
            {unmatchedFiles.length > 0 && (
                <Surface tone="low" radius="md" className="space-y-2 border border-outline-variant/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="type-label-l text-on-surface">
                            {t("page.storyMaker.audioUpload.unmatchedTitle", {
                                count: unmatchedFiles.length,
                            })}
                        </span>
                        <Button
                            size="xs"
                            variant="text"
                            disabled={busy}
                            onClick={() => setUnmatchedFiles([])}
                        >
                            {t("common.action.close")}
                        </Button>
                    </div>
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                        {unmatchedFiles.map((file, idx) => (
                            <li
                                key={`${file.name}-${idx}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md3-sm bg-surface-container px-2.5 py-1.5"
                            >
                                <span className="min-w-0 flex-1 truncate font-mono type-label-s text-on-surface">
                                    {file.name}
                                </span>
                                <select
                                    aria-label={t("page.storyMaker.audioUpload.assignBeatLabel")}
                                    defaultValue=""
                                    disabled={busy}
                                    onChange={(e) => {
                                        const chosenBeat = e.target.value;
                                        if (!chosenBeat || !beatMap.has(chosenBeat)) return;
                                        assignSingleBeatFile(chosenBeat, file);
                                        setUnmatchedFiles((prev) => prev.filter((_, i) => i !== idx));
                                    }}
                                    className="max-w-[200px] rounded-md3-xs border border-outline-variant bg-surface-container-lowest px-2 py-1 type-label-s text-on-surface"
                                >
                                    <option value="">{t("page.storyMaker.audioUpload.assignBeatPlaceholder")}</option>
                                    {talkBeats.map((slot) => (
                                        <option key={slot.beatId} value={slot.beatId}>
                                            {slot.beatId} · {slot.textPreview.slice(0, 22)}
                                        </option>
                                    ))}
                                </select>
                                <IconButton
                                    size="xs"
                                    icon={mdClose}
                                    label={t("common.action.close")}
                                    disabled={busy}
                                    onClick={() => setUnmatchedFiles((prev) => prev.filter((_, i) => i !== idx))}
                                />
                            </li>
                        ))}
                    </ul>
                </Surface>
            )}

            {/* Beat assignment list */}
            {talkBeats.length > 0 && (
                <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-md3-md border border-outline-variant/60 bg-surface-container-lowest p-2">
                    {talkBeats.map((slot) => {
                        const assigned = assignedByBeat[slot.beatId];
                        return (
                            <div
                                key={slot.beatId}
                                className="flex items-center justify-between gap-2 rounded-md3-sm bg-surface-container-low px-2.5 py-1.5"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="shrink-0 font-mono type-label-s text-primary">
                                            {slot.beatId}
                                        </span>
                                        {slot.speakerName && (
                                            <span className="shrink-0 type-label-s text-on-surface-variant">
                                                {slot.speakerName}
                                            </span>
                                        )}
                                        <span className="truncate type-body-s text-on-surface">
                                            {slot.textPreview}
                                        </span>
                                    </div>
                                    {assigned && (
                                        <p className="truncate font-mono type-label-s text-on-surface-variant">
                                            {assigned.file.name} ·{" "}
                                            {assigned.probing
                                                ? t("common.state.loading")
                                                : assigned.durationMs !== null
                                                    ? formatDurationMs(assigned.durationMs)
                                                    : "?"}{" "}
                                            · {formatByteSize(assigned.file.size)}
                                        </p>
                                    )}
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        size="xs"
                                        variant={assigned ? "text" : "tonal"}
                                        disabled={busy}
                                        onClick={() => {
                                            singleBeatTargetRef.current = slot.beatId;
                                            singleBeatInputRef.current?.click();
                                        }}
                                    >
                                        {t(
                                            assigned
                                                ? "page.storyMaker.audioUpload.replaceFile"
                                                : "page.storyMaker.audioUpload.chooseFile",
                                        )}
                                    </Button>
                                    {assigned && (
                                        <IconButton
                                            size="xs"
                                            icon={mdDelete}
                                            label={t("common.action.close")}
                                            disabled={busy}
                                            onClick={() => removeBeatAssignment(slot.beatId)}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Validation issues */}
            {validationIssues.length > 0 && (
                <Banner tone="error">
                    <ul className="list-disc space-y-1 pl-4">
                        {validationIssues.slice(0, 5).map((issue, idx) => (
                            <li key={`${issue.code}-${issue.beatId ?? idx}`}>{formatIssueMessage(issue)}</li>
                        ))}
                    </ul>
                </Banner>
            )}

            {/* Mandatory rights confirmation */}
            <Checkbox
                checked={rightsConfirmed}
                disabled={busy}
                onCheckedChange={setRightsConfirmed}
                label={t("page.storyMaker.audioUpload.rightsConfirm")}
            />

            {/* Upload progress */}
            {busy && (
                <Surface tone="low" radius="md" className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2 type-label-m text-on-surface">
                        <span>{t(`page.storyMaker.audioUpload.phase.${phase}`)}</span>
                        {(phase === "hashing" || phase === "uploading") && (
                            <span className="font-mono">{Math.round(progressRatio * 100)}%</span>
                        )}
                    </div>
                    <LinearProgress
                        value={phase === "hashing" || phase === "uploading" ? progressRatio : undefined}
                        aria-label={t(`page.storyMaker.audioUpload.phase.${phase}`)}
                    />
                    <div className="flex justify-end">
                        <Button size="xs" variant="text" onClick={handleCancelUpload}>
                            {t("common.action.cancel")}
                        </Button>
                    </div>
                </Surface>
            )}

            {uploadError && <Banner tone="error">{uploadError}</Banner>}
            {uploadNotice && <Banner tone="info">{uploadNotice}</Banner>}

            <div className="flex justify-end">
                <Button
                    variant="filled"
                    icon={mdUploadFile}
                    disabled={
                        busy ||
                        assignedEntries.length === 0 ||
                        probingCount > 0 ||
                        validationIssues.length > 0 ||
                        !rightsConfirmed
                    }
                    onClick={() => void handleStartUpload()}
                >
                    {t("page.storyMaker.audioUpload.startUpload")}
                </Button>
            </div>
        </div>
    );
}

export default StoryAudioUploadPanel;
