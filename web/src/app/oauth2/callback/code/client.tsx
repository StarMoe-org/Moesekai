"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { localizePathForBrowser } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { isValidServer, SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, Card, CircularProgress, Icon, PageContainer, PageHeader, Surface } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";
import { createOrUpdateOAuthAccount, fetchOAuthBindingInitialData } from "@/lib/account";
import {
    clearPendingOAuthState,
    formatOAuthErrorMessage,
    getOAuthReturnTo,
    normalizeBindingGameId,
    normalizeBindingServer,
    resolveOAuthAuthorization,
    sanitizeOAuthReturnTo,
    type OAuthAuthorizationPhase,
    type OAuthBinding,
} from "@/lib/oauth";

type CallbackPhase = OAuthAuthorizationPhase | "loading_initial_data" | "saving_account" | "redirecting" | "selecting_binding";

function getPhaseMessage(phase: CallbackPhase, t: (key: string) => string): string {
    switch (phase) {
        case "validating_state":
            return t("page.oauth2.callback.phases.validatingState");
        case "exchanging_token":
            return t("page.oauth2.callback.phases.exchangingToken");
        case "loading_profile":
            return t("page.oauth2.callback.phases.loadingProfile");
        case "loading_bindings":
            return t("page.oauth2.callback.phases.loadingBindings");
        case "loading_initial_data":
            return t("page.oauth2.callback.phases.loadingInitialData");
        case "saving_account":
            return t("page.oauth2.callback.phases.savingAccount");
        case "redirecting":
            return t("page.oauth2.callback.phases.redirecting");
        case "selecting_binding":
            return t("page.oauth2.callback.phases.selectingBinding");
        default:
            return t("page.oauth2.callback.defaultPhase");
    }
}

function buildSuccessReturnUrl(returnTo: string, accountId: string): string {
    const safeReturnTo = sanitizeOAuthReturnTo(returnTo);
    if (typeof window === "undefined") {
        return `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}oauth=success&account=${encodeURIComponent(accountId)}`;
    }

    const url = new URL(localizePathForBrowser(safeReturnTo), window.location.origin);
    url.searchParams.set("oauth", "success");
    url.searchParams.set("account", accountId);
    return url.toString();
}

export default function CallbackClient() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [phase, setPhase] = useState<CallbackPhase>("validating_state");
    const [bindings, setBindings] = useState<OAuthBinding[]>([]);
    const [resolved, setResolved] = useState<Awaited<ReturnType<typeof resolveOAuthAuthorization>> | null>(null);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");
    const returnTo = useMemo(() => getOAuthReturnTo(state), [state]);

    useEffect(() => {
        let cancelled = false;
        if (oauthError) {
            clearPendingOAuthState(state);
            setError(oauthError);
            setLoading(false);
            return;
        }
        if (!code || !state) {
            clearPendingOAuthState(state);
            setError("OAUTH_CALLBACK_PARAMS_MISSING");
            setLoading(false);
            return;
        }

        void (async () => {
            try {
                const result = await resolveOAuthAuthorization(code, state, (nextPhase) => {
                    if (!cancelled) setPhase(nextPhase);
                });
                if (cancelled) return;
                setResolved(result);
                setBindings(result.bindings);
                if (result.bindings.length === 1) {
                    await handleBinding(result.bindings[0]!, result);
                } else if (result.bindings.length > 1) {
                    setPhase("selecting_binding");
                    setLoading(false);
                } else {
                    clearPendingOAuthState(state);
                    setError("OAUTH_NO_BINDINGS");
                    setLoading(false);
                }
            } catch (err) {
                clearPendingOAuthState(state);
                console.error("[OAuth2] callback resolve failed", err);
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "OAUTH_PROCESS_FAILED");
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, state, oauthError]);

    const handleBinding = async (
        binding: OAuthBinding,
        source = resolved,
    ) => {
        if (!source) return;
        const server = normalizeBindingServer(binding);
        const gameId = normalizeBindingGameId(binding);
        if (!server || !gameId) {
            setError("OAUTH_BINDING_PARSE_FAILED");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        setPhase("loading_initial_data");
        try {
            const initialData = await fetchOAuthBindingInitialData(source.tokenSet.accessToken, server, gameId);
            setPhase("saving_account");
            const account = createOrUpdateOAuthAccount({
                binding,
                profile: source.profile,
                tokenSet: source.tokenSet,
                initialData,
            });
            const redirectUrl = buildSuccessReturnUrl(returnTo, account.id);
            clearPendingOAuthState(state);
            setPhase("redirecting");
            console.info("[OAuth2] redirecting to", redirectUrl);
            window.location.replace(redirectUrl);
        } catch (err) {
            clearPendingOAuthState(state);
            console.error("[OAuth2] save account failed", err);
            setError(err instanceof Error ? err.message : "OAUTH_SYNC_ACCOUNT_FAILED");
            setLoading(false);
        }
    };

    const errorMessage = error ? formatOAuthErrorMessage(error, t) : null;

    return (
        <MainLayout>
            <PageContainer className="max-w-3xl">
                <Surface tone="low" className="p-6 sm:p-8">
                    <PageHeader eyebrow={t("page.oauth2.callback.badge")} title={t("page.oauth2.callback.title")} className="mb-4 sm:mb-4" />
                    {loading ? (
                        <div className="space-y-2 type-body-m text-on-surface-variant">
                            <div className="flex items-center gap-3">
                                <CircularProgress size={20} strokeWidth={2} />
                                <span>{getPhaseMessage(phase, t)}</span>
                            </div>
                            <p className="type-body-s text-on-surface-variant">{t("page.oauth2.callback.currentPhase", { phase })}</p>
                        </div>
                    ) : errorMessage ? (
                        <Banner tone="error" title={t("page.oauth2.callback.failureTitle")}>
                            <p className="break-all">{errorMessage}</p>
                            <p className="mt-2 type-body-s opacity-80">{t("page.oauth2.callback.failedPhase", { phase })}</p>
                            <Button
                                variant="filled"
                                color="error"
                                className="mt-4"
                                onClick={() => router.replace(localizePathForBrowser(returnTo))}
                            >
                                {t("page.oauth2.callback.returnSource")}
                            </Button>
                        </Banner>
                    ) : bindings.length > 1 ? (
                        <div>
                            <p className="mb-4 type-body-m text-on-surface-variant">{t("page.oauth2.callback.selectBindingDescription")}</p>
                            <div className="space-y-3">
                                {bindings.map((binding, index) => {
                                    const server = normalizeBindingServer(binding) || t("page.oauth2.callback.unknownServer");
                                    const gameId = normalizeBindingGameId(binding) || t("page.oauth2.callback.unknownUid");
                                    return (
                                        <Card
                                            key={`${binding.bindingId ?? binding.id ?? index}`}
                                            variant="outlined"
                                            onClick={() => void handleBinding(binding)}
                                            className="p-4"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="type-title-s text-on-surface">{gameId}</p>
                                                    <p className="mt-1 flex items-center gap-1.5 type-body-s text-on-surface-variant">{isValidServer(server) && <ServerRegionIcon server={server} size={18} decorative />}{t("page.oauth2.callback.serverLabel", { server: isValidServer(server) ? t(SERVER_LABEL_KEYS[server]) : server })}</p>
                                                </div>
                                                <span className="flex items-center gap-1 type-label-l text-primary">
                                                    {t("page.oauth2.callback.selectAction")}
                                                    <Icon path={mdChevronRight} size={18} />
                                                </span>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </Surface>
            </PageContainer>
        </MainLayout>
    );
}
