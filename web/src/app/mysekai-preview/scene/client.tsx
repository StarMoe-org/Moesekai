"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import AccountSelector from "@/components/AccountSelector";
import MainLayout from "@/components/MainLayout";
import { Banner, Button, PageContainer, PageHeader, SegmentedButton, TextField } from "@/components/md3";
import { mdArrowBack } from "@/components/md3/icons";
import MysekaiScenePreview from "@/components/mysekai-preview/MysekaiScenePreview";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, type AssetSourceType, useTheme } from "@/contexts/ThemeContext";
import { type BaijingServer, getUserMysekaiRoomUrl } from "@/lib/mysekai-preview/baijing";
import type { MysekaiLayoutPayload } from "@/lib/mysekai-preview/types";

const TURNSTILE_SITE_KEY = "0x4AAAAAADSarNCgQKaLAJ6Y";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** UID-based scene preview is JP-only: the upstream room API only serves JP rooms. */
const SCENE_SERVER: BaijingServer = "jp";

type EntryMode = "uid" | "json";
type JsonSourceMode = "file" | "url";

type PreviewState =
    | {
        kind: "uid";
        server: BaijingServer;
        uid: string;
        layoutData: MysekaiLayoutPayload;
        layoutKey: string;
    }
    | {
        kind: "json";
        sourceType: JsonSourceMode;
        sourceLabel: string;
        sourceUrl?: string;
        layoutData: MysekaiLayoutPayload;
        layoutKey: string;
    };

interface TurnstileRenderOptions {
    sitekey: string;
    callback?: (token: string) => void;
    "error-callback"?: () => void;
    "expired-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    size?: "normal" | "compact" | "flexible";
}

interface TurnstileApi {
    render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
    reset: (widgetId?: string) => void;
    remove?: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
        __mysekaiTurnstileLoaded?: () => void;
    }
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function responseErrorDetail(data: unknown) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return "";
    const detail = (data as { message?: unknown; error?: unknown }).message ?? (data as { message?: unknown; error?: unknown }).error;
    return typeof detail === "string" ? detail : "";
}

type TranslationFn = ReturnType<typeof useI18n>["t"];

function jsonLoadErrorMessage(error: unknown, t: TranslationFn) {
    const message = errorMessage(error);
    if (message === "Failed to fetch" || message.includes("NetworkError") || message.includes("Load failed")) {
        return t("page.mysekaiPreview.scene.errors.urlCors");
    }
    return message;
}

function normalizeUid(value: string) {
    return value.replace(/\s+/g, "").trim();
}

function normalizeHttpUrl(value: string, t: TranslationFn) {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(t("page.mysekaiPreview.scene.errors.urlRequired"));
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error(t("page.mysekaiPreview.scene.errors.urlInvalid"));
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(t("page.mysekaiPreview.scene.errors.urlUnsupported"));
    }
    return url.toString();
}

function parseLayoutJsonText(text: string, label: string, t: TranslationFn) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error(t("page.mysekaiPreview.scene.errors.emptyJson", { label }));
    try {
        return JSON.parse(trimmed) as MysekaiLayoutPayload;
    } catch {
        throw new Error(t("page.mysekaiPreview.scene.errors.invalidJson", { label }));
    }
}

async function fetchLayoutPayloadFromUrl(url: string, t: TranslationFn) {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText || t("page.mysekaiPreview.scene.errors.jsonFetchFailedFallback")}`);
    }
    return parseLayoutJsonText(text, url, t);
}

function isValidRoomPayload(payload: MysekaiLayoutPayload) {
    if (Array.isArray(payload)) return true;
    if (!payload || typeof payload !== "object") return false;
    if ("room" in payload) return Boolean(payload.room);
    return "userMysekaiSiteHousingLayouts" in payload || "mysekaiRank" in payload;
}

function getInitialAssetSource(assetSource: AssetSourceType, server: BaijingServer) {
    return replaceAssetSourceRegion(assetSource, server);
}

function TurnstileBox({ onToken, resetSeed }: { onToken: (token: string) => void; resetSeed: number }) {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [scriptReady, setScriptReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));
    const [message, setMessage] = useState(() => t("page.mysekaiPreview.scene.turnstile.loading"));

    useEffect(() => {
        if (window.turnstile) return;

        window.__mysekaiTurnstileLoaded = () => setScriptReady(true);
        const existingScript = document.querySelector<HTMLScriptElement>(`script[src^="${TURNSTILE_SCRIPT_SRC}"]`);
        if (existingScript) {
            existingScript.addEventListener("load", () => setScriptReady(true), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = `${TURNSTILE_SCRIPT_SRC}&onload=__mysekaiTurnstileLoaded`;
        script.async = true;
        script.defer = true;
        script.onerror = () => setMessage(t("page.mysekaiPreview.scene.turnstile.scriptFailed"));
        document.head.appendChild(script);
    }, [t]);

    useEffect(() => {
        if (!scriptReady || !hostRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return;

        widgetIdRef.current = window.turnstile.render(hostRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "light",
            size: "normal",
            callback: (token) => {
                setMessage(t("page.mysekaiPreview.scene.turnstile.completed"));
                onToken(token);
            },
            "expired-callback": () => {
                setMessage(t("page.mysekaiPreview.scene.turnstile.expired"));
                onToken("");
            },
            "error-callback": () => {
                setMessage(t("page.mysekaiPreview.scene.turnstile.failed"));
                onToken("");
            },
        });

        return () => {
            if (widgetIdRef.current) {
                window.turnstile?.remove?.(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [onToken, scriptReady, t]);

    useEffect(() => {
        if (!resetSeed || !widgetIdRef.current) return;
        window.turnstile?.reset(widgetIdRef.current);
        onToken("");
    }, [onToken, resetSeed]);

    return (
        <div className="rounded-md3-lg bg-surface-container p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="type-label-l text-on-surface-variant">Cloudflare Turnstile</div>
                    <div className="mt-1 type-body-m text-on-surface-variant">{message}</div>
                </div>
                <div ref={hostRef} className="min-h-[65px] min-w-[300px] overflow-hidden rounded-md3-md" />
            </div>
        </div>
    );
}

function ModeTabs({ mode, onChange }: { mode: EntryMode; onChange: (mode: EntryMode) => void }) {
    const { t } = useI18n();
    const options: Array<{ value: EntryMode; label: string; desc: string }> = [
        { value: "uid", label: t("page.mysekaiPreview.scene.modes.uidLabel"), desc: t("page.mysekaiPreview.scene.modes.uidDesc") },
        { value: "json", label: t("page.mysekaiPreview.scene.modes.jsonLabel"), desc: t("page.mysekaiPreview.scene.modes.jsonDesc") },
    ];

    return (
        <div className="mx-auto flex max-w-md justify-center">
            <SegmentedButton
                value={mode}
                onValueChange={onChange}
                options={options.map((item) => ({ value: item.value, label: <span title={item.desc}>{item.label}</span> }))}
            />
        </div>
    );
}

export default function MysekaiPreviewSceneClient() {
    const { t } = useI18n();
    const { assetSource } = useTheme();
    const [mode, setMode] = useState<EntryMode>("uid");
    const [uid, setUid] = useState("");
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetSeed, setTurnstileResetSeed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [jsonSourceMode, setJsonSourceMode] = useState<JsonSourceMode>("file");
    const [layoutFile, setLayoutFile] = useState<File | null>(null);
    const [customLayoutUrl, setCustomLayoutUrl] = useState("");
    const [previewState, setPreviewState] = useState<PreviewState | null>(null);

    const previewAssetSource = useMemo<AssetSourceType>(() => {
        if (previewState?.kind === "uid") return getInitialAssetSource(assetSource, previewState.server);
        return assetSource;
    }, [assetSource, previewState]);

    const jsonSourceOptions = useMemo<Array<{ value: JsonSourceMode; label: string; desc: string }>>(() => [
        { value: "file", label: t("page.mysekaiPreview.scene.jsonSources.fileLabel"), desc: t("page.mysekaiPreview.scene.jsonSources.fileDesc") },
        { value: "url", label: t("page.mysekaiPreview.scene.jsonSources.urlLabel"), desc: t("page.mysekaiPreview.scene.jsonSources.urlDesc") },
    ], [t]);

    const handleUidSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const normalizedUid = normalizeUid(uid);
        if (!/^\d+$/.test(normalizedUid)) {
            setError(t("page.mysekaiPreview.scene.errors.invalidUid"));
            return;
        }
        if (!turnstileToken) {
            setError(t("page.mysekaiPreview.scene.errors.turnstileRequired"));
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const roomUrl = getUserMysekaiRoomUrl(SCENE_SERVER, normalizedUid);
            const response = await fetch(`${roomUrl}?_ts=${Date.now()}`, {
                cache: "no-store",
                headers: {
                    "CF-Turnstile-Response": turnstileToken,
                    "X-CF-Turnstile-Response": turnstileToken,
                    "X-Turnstile-Token": turnstileToken,
                    "x-moe-sekai-token": turnstileToken,
                },
            });
            const data = await response.json().catch(() => null) as MysekaiLayoutPayload | { message?: string; error?: string; status?: number } | null;
            if (!response.ok) {
                const detail = responseErrorDetail(data);
                throw new Error(detail ? `${response.status} ${detail}` : `${response.status} ${response.statusText}`);
            }
            if (!data || !isValidRoomPayload(data as MysekaiLayoutPayload)) {
                throw new Error(t("page.mysekaiPreview.scene.errors.noRoomData"));
            }
            setUid(normalizedUid);
            setPreviewState({
                kind: "uid",
                server: SCENE_SERVER,
                uid: normalizedUid,
                layoutData: data as MysekaiLayoutPayload,
                layoutKey: `${SCENE_SERVER}-${normalizedUid}-${Date.now()}`,
            });
        } catch (submitError) {
            setError(errorMessage(submitError));
            setTurnstileResetSeed((current) => current + 1);
        } finally {
            setLoading(false);
        }
    };

    const handleLayoutFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setLayoutFile(file);
        if (file) {
            setJsonSourceMode("file");
            setError(null);
        }
    };

    const handleJsonSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let data: MysekaiLayoutPayload;
            let sourceLabel: string;
            let sourceUrl: string | undefined;
            let layoutKey: string;

            if (jsonSourceMode === "file") {
                if (!layoutFile) throw new Error(t("page.mysekaiPreview.scene.errors.fileRequired"));
                data = parseLayoutJsonText(await layoutFile.text(), layoutFile.name, t);
                sourceLabel = layoutFile.name;
                layoutKey = `file-${layoutFile.name}-${layoutFile.size}-${layoutFile.lastModified}-${Date.now()}`;
            } else {
                const nextUrl = normalizeHttpUrl(customLayoutUrl, t);
                data = await fetchLayoutPayloadFromUrl(nextUrl, t);
                sourceLabel = nextUrl;
                sourceUrl = nextUrl;
                layoutKey = `url-${nextUrl}-${Date.now()}`;
            }

            if (!isValidRoomPayload(data)) {
                throw new Error(t("page.mysekaiPreview.scene.errors.invalidLayoutData"));
            }

            setPreviewState({
                kind: "json",
                sourceType: jsonSourceMode,
                sourceLabel,
                sourceUrl,
                layoutData: data,
                layoutKey,
            });
        } catch (submitError) {
            setError(jsonSourceMode === "url" ? jsonLoadErrorMessage(submitError, t) : errorMessage(submitError));
        } finally {
            setLoading(false);
        }
    };

    if (previewState) {
        const isUidPreview = previewState.kind === "uid";
        const title = isUidPreview ? `UID ${previewState.uid}` : t("page.mysekaiPreview.scene.preview.customTitle");
        const badge = isUidPreview ? `${previewState.server.toUpperCase()} UID` : previewState.sourceType === "file" ? t("page.mysekaiPreview.scene.preview.fileBadge") : t("page.mysekaiPreview.scene.preview.urlBadge");
        const sourceLabel = isUidPreview ? `${previewState.server.toUpperCase()} · UID ${previewState.uid}` : previewState.sourceLabel;
        const layoutSource = isUidPreview ? getUserMysekaiRoomUrl(previewState.server, previewState.uid) : previewState.sourceUrl ?? `browser-file:${previewState.sourceLabel}`;
        const headerNote = isUidPreview ? t("page.mysekaiPreview.scene.preview.uidHeaderNote") : t("page.mysekaiPreview.scene.preview.jsonHeaderNote");

        return (
            <MainLayout>
                <PageContainer wide>
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <Button variant="tonal" icon={mdArrowBack} onClick={() => setPreviewState(null)}>
                            {t("page.mysekaiPreview.scene.preview.backToEntry")}
                        </Button>
                        <div className="max-w-full truncate rounded-md3-md bg-surface-container-high px-4 py-2 type-label-l text-on-surface-variant">
                            {sourceLabel}
                        </div>
                    </div>

                    <section className="overflow-hidden rounded-md3-xl bg-surface-container-low p-4 sm:p-5">
                        <MysekaiScenePreview
                            key={previewState.layoutKey}
                            defaultLayoutUrl={layoutSource}
                            layoutData={previewState.layoutData}
                            layoutKey={previewState.layoutKey}
                            assetSourceOverride={previewAssetSource}
                            persistOptionsEnabled={false}
                            showLayoutUrlInput={false}
                            headerTitle={title}
                            headerBadge={badge}
                            headerNote={headerNote}
                            heightClassName="h-[min(76vh,760px)] min-h-[560px]"
                            compact
                        />
                    </section>
                </PageContainer>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <PageContainer className="max-w-5xl">
                <PageHeader
                    align="center"
                    eyebrow={t("page.mysekaiPreview.badges.scene")}
                    title={t("page.mysekaiPreview.scene.title")}
                    highlight={t("page.mysekaiPreview.scene.titleHighlight")}
                    description={t("page.mysekaiPreview.scene.description")}
                />

                <ModeTabs mode={mode} onChange={(nextMode) => { setMode(nextMode); setError(null); }} />

                {error && (
                    <Banner tone="error" className="mx-auto mt-6 max-w-3xl">
                        {error}
                    </Banner>
                )}

                {mode === "uid" ? (
                    <form onSubmit={handleUidSubmit} className="mx-auto mt-6 max-w-3xl rounded-md3-xl bg-surface-container-low p-5 sm:p-6">
                        <div className="mb-5">
                            <h2 className="type-title-l text-on-surface">{t("page.mysekaiPreview.scene.uidForm.title")}</h2>
                            <p className="mt-1 type-body-m text-on-surface-variant">{t("page.mysekaiPreview.scene.uidForm.description")}</p>
                        </div>

                        <AccountSelector
                            allowedServers={[SCENE_SERVER]}
                            currentUserId={uid}
                            currentServer={SCENE_SERVER}
                            onSelect={(gameId) => {
                                setUid(gameId);
                                setError(null);
                            }}
                        />

                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                            <TextField
                                label="UID"
                                value={uid}
                                onValueChange={setUid}
                                inputMode="numeric"
                                placeholder={t("page.mysekaiPreview.scene.uidForm.uidPlaceholder")}
                            />
                            <div className="block">
                                <span className="mb-1 block type-label-l text-on-surface-variant">{t("page.mysekaiPreview.scene.uidForm.server")}</span>
                                <div className="rounded-md3-sm bg-secondary-container px-3 py-2 text-center type-label-l text-on-secondary-container">
                                    {t(`common.server.${SCENE_SERVER}`)}
                                </div>
                                <p className="mt-1 type-body-s text-on-surface-variant">{t("page.mysekaiPreview.scene.uidForm.serverJpOnly")}</p>
                            </div>
                        </div>

                        <div className="mt-5">
                            <TurnstileBox onToken={setTurnstileToken} resetSeed={turnstileResetSeed} />
                        </div>

                        <Button
                            type="submit"
                            variant="filled"
                            size="m"
                            fullWidth
                            className="mt-5"
                            disabled={loading || !normalizeUid(uid) || !turnstileToken}
                        >
                            {loading ? t("page.mysekaiPreview.scene.uidForm.loading") : t("page.mysekaiPreview.scene.uidForm.submit")}
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={handleJsonSubmit} className="mx-auto mt-6 max-w-3xl rounded-md3-xl bg-surface-container-low p-5 sm:p-6">
                        <div className="mb-5">
                            <h2 className="type-title-l text-on-surface">{t("page.mysekaiPreview.scene.jsonForm.title")}</h2>
                            <p className="mt-1 type-body-m text-on-surface-variant">
                                {t("page.mysekaiPreview.scene.jsonForm.description")}
                            </p>
                        </div>

                        <div className="mb-4 grid gap-2 sm:grid-cols-2">
                            {jsonSourceOptions.map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => {
                                        setJsonSourceMode(item.value);
                                        setError(null);
                                    }}
                                    aria-pressed={jsonSourceMode === item.value}
                                    className={`state-layer focus-ring rounded-md3-lg px-4 py-3 text-left transition-colors ${jsonSourceMode === item.value
                                        ? "bg-secondary-container text-on-secondary-container"
                                        : "border border-outline-variant text-on-surface-variant"
                                        }`}
                                >
                                    <div className="type-title-s">{item.label}</div>
                                    <div className="mt-1 type-body-s opacity-80">{item.desc}</div>
                                </button>
                            ))}
                        </div>

                        {jsonSourceMode === "file" ? (
                            <label className="block">
                                <span className="mb-1 block type-label-l text-on-surface-variant">{t("page.mysekaiPreview.scene.jsonForm.fileLabel")}</span>
                                <input
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={handleLayoutFileChange}
                                    className="focus-ring w-full rounded-md3-xs border border-dashed border-outline bg-surface-container-lowest px-4 py-3 type-body-m text-on-surface outline-none file:mr-4 file:rounded-full file:border-0 file:bg-secondary-container file:px-4 file:py-2 file:type-label-l file:text-on-secondary-container"
                                />
                                {layoutFile && (
                                    <p className="mt-2 type-body-s text-on-surface-variant">
                                        {t("page.mysekaiPreview.scene.jsonForm.selectedFile", { name: layoutFile.name, size: Math.max(1, Math.round(layoutFile.size / 1024)) })}
                                    </p>
                                )}
                            </label>
                        ) : (
                            <TextField
                                label={t("page.mysekaiPreview.scene.jsonForm.urlLabel")}
                                value={customLayoutUrl}
                                onValueChange={setCustomLayoutUrl}
                                placeholder="https://example.com/mysekai-room.json"
                                supportingText={t("page.mysekaiPreview.scene.jsonForm.urlHint")}
                            />
                        )}

                        <Button
                            type="submit"
                            variant="filled"
                            size="m"
                            fullWidth
                            className="mt-5"
                            disabled={loading || (jsonSourceMode === "file" ? !layoutFile : !customLayoutUrl.trim())}
                        >
                            {loading ? t("page.mysekaiPreview.scene.jsonForm.loading") : t("page.mysekaiPreview.scene.jsonForm.submit")}
                        </Button>
                    </form>
                )}
            </PageContainer>
        </MainLayout>
    );
}
