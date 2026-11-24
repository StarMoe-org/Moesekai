"use client";

/**
 * The game accounts on /account. Each row says whose data it is (name, UID, server), where it comes from
 * (verified by Haruki or not), where it is kept (saved to the Passport or on this device only) and how fresh
 * its data is; a failed refresh shows on its own row with a retry.
 */
import { useState } from "react";
import AccountAvatar from "@/components/AccountAvatar";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { Banner, Button, CircularProgress, Dialog, Icon, IconButton, Tooltip, cn } from "@/components/md3";
import { mdDelete, mdLock, mdSync } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { deleteGameAccount, setActiveAccount, type AccountRefreshError, type MoesekaiAccount } from "@/lib/account";
import { LEGACY_OAUTH_END_DATE, isLegacyOAuthAccount } from "@/lib/legacy-oauth";

export function gameAccountName(account: MoesekaiAccount): string {
    return account.userGamedata?.name || account.nickname || account.gameId;
}

function Badge({ tone, children }: { tone: "primary" | "secondary" | "tertiary" | "neutral"; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                "rounded-md3-xs px-1.5 py-0.5 type-label-s",
                tone === "primary" && "bg-primary text-on-primary",
                tone === "secondary" && "bg-secondary-container text-on-secondary-container",
                tone === "tertiary" && "bg-tertiary-container text-on-tertiary-container",
                tone === "neutral" && "bg-surface-container-highest text-on-surface-variant",
            )}
        >
            {children}
        </span>
    );
}

export default function GameAccountList({
    accounts,
    activeId,
    signedIn,
    refreshing,
    refreshErrors,
    onRefresh,
}: {
    accounts: MoesekaiAccount[];
    activeId: string | null;
    signedIn: boolean;
    refreshing: ReadonlySet<string>;
    refreshErrors: ReadonlyMap<string, AccountRefreshError>;
    onRefresh: (account: MoesekaiAccount) => void;
}) {
    const { t, formatDate } = useI18n();
    const [deleting, setDeleting] = useState<MoesekaiAccount | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteFailed, setDeleteFailed] = useState(false);
    const legacyEnd = formatDate(`${LEGACY_OAUTH_END_DATE}T00:00:00`, { dateStyle: "medium" });

    const errorReason = (error: AccountRefreshError): string =>
        error === "API_NOT_PUBLIC"
            ? t("page.account.games.errorNotPublic")
            : error === "NOT_FOUND"
                ? t("page.account.games.errorNotFound")
                : error === "OAUTH"
                    ? t("page.account.games.errorOAuth")
                    : t("page.account.games.errorNetwork");

    async function confirmDelete() {
        if (!deleting) return;
        setDeleteBusy(true);
        setDeleteFailed(false);
        try {
            await deleteGameAccount(deleting.id);
            setDeleting(null);
        } catch {
            setDeleteFailed(true);
        } finally {
            setDeleteBusy(false);
        }
    }

    return (
        <>
            <ul className="space-y-3">
                {accounts.map((account) => {
                    const active = account.id === activeId;
                    const busy = refreshing.has(account.id);
                    const error = refreshErrors.get(account.id);
                    const verified = account.starmoeSource === "verified";
                    const legacy = isLegacyOAuthAccount(account) && !account.starmoeSource;
                    const locked = verified && signedIn;
                    return (
                        <li
                            key={account.id}
                            className={cn(
                                "rounded-md3-lg border p-4 transition-colors duration-200 ease-md3-standard",
                                active ? "border-primary bg-primary-container/40" : "border-outline-variant bg-surface-container",
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <AccountAvatar
                                    account={account}
                                    size="lg"
                                    className={cn("ring-2 ring-offset-1 ring-offset-surface", active ? "ring-primary" : "ring-outline-variant")}
                                />
                                <div className="min-w-0 flex-1 basis-48">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="truncate type-title-s text-on-surface">{gameAccountName(account)}</span>
                                        <span className="font-mono type-body-s text-on-surface-variant">{account.gameId}</span>
                                        <Badge tone="neutral"><ServerRegionLabel server={account.server} size={16} /></Badge>
                                        {active && <Badge tone="primary">{t("page.account.games.viewing")}</Badge>}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {verified || legacy ? (
                                            <Badge tone="secondary">{t("page.account.games.verified")}</Badge>
                                        ) : (
                                            <Badge tone="neutral">{t("page.account.games.unverified")}</Badge>
                                        )}
                                        {signedIn && (account.starmoeSource
                                            ? <Badge tone="neutral">{t("page.account.games.saved")}</Badge>
                                            : <Badge tone="tertiary">{t("page.account.games.localOnly")}</Badge>)}
                                        {legacy && <Badge tone="tertiary">{t("page.account.games.legacy", { date: legacyEnd })}</Badge>}
                                        {legacy && account.authError === "reauth_required" && (
                                            <Badge tone="tertiary">{t("page.account.games.reauth")}</Badge>
                                        )}
                                    </div>
                                    <p className="mt-1 type-label-s text-on-surface-variant">
                                        {account.uploadTime
                                            ? t("page.account.games.updatedAt", { date: formatDate(account.uploadTime * 1000, { dateStyle: "medium", timeStyle: "short" }) })
                                            : t("page.account.games.noData")}
                                    </p>
                                </div>
                                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
                                    {!active && (
                                        <Button variant="text" size="xs" onClick={() => setActiveAccount(account.id)}>
                                            {t("page.account.games.view")}
                                        </Button>
                                    )}
                                    <Button
                                        variant="text"
                                        size="xs"
                                        color="secondary"
                                        icon={busy ? undefined : mdSync}
                                        disabled={busy}
                                        onClick={() => onRefresh(account)}
                                    >
                                        {busy && <CircularProgress size={14} strokeWidth={2} />}
                                        {t("page.account.games.refresh")}
                                    </Button>
                                    {locked ? (
                                        <Tooltip label={t("page.account.games.verifiedLocked")}>
                                            <span
                                                tabIndex={0}
                                                aria-label={t("page.account.games.verifiedLocked")}
                                                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                                            >
                                                <Icon path={mdLock} size={18} />
                                            </span>
                                        </Tooltip>
                                    ) : (
                                        <IconButton
                                            icon={mdDelete}
                                            label={t("page.account.games.delete")}
                                            size="xs"
                                            className="hover:text-error"
                                            onClick={() => {
                                                setDeleteFailed(false);
                                                setDeleting(account);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                            {error && !busy && (
                                <Banner
                                    tone="error"
                                    className="mt-3"
                                    action={
                                        <Button variant="text" color="error" size="xs" onClick={() => onRefresh(account)}>
                                            {t("page.account.games.retry")}
                                        </Button>
                                    }
                                >
                                    {t("page.account.games.refreshFailed", { reason: errorReason(error) })}
                                </Banner>
                            )}
                        </li>
                    );
                })}
            </ul>

            <Dialog
                isOpen={deleting !== null}
                onClose={deleteBusy ? () => undefined : () => setDeleting(null)}
                title={t("page.account.remove.title")}
                icon={mdDelete}
                size="sm"
                actions={
                    <>
                        <Button variant="text" onClick={() => setDeleting(null)} disabled={deleteBusy}>
                            {t("common.action.cancel")}
                        </Button>
                        <Button variant="filled" color="error" onClick={() => void confirmDelete()} disabled={deleteBusy}>
                            {deleteBusy && <CircularProgress size={16} strokeWidth={2} />}
                            {t("page.account.remove.confirm")}
                        </Button>
                    </>
                }
            >
                {deleting && (
                    <div className="space-y-3 type-body-m text-on-surface-variant">
                        <p>
                            {signedIn && deleting.starmoeSource === "manual"
                                ? t("page.account.remove.bodySaved", { name: gameAccountName(deleting) })
                                : t("page.account.remove.bodyLocal", { name: gameAccountName(deleting) })}
                        </p>
                        {isLegacyOAuthAccount(deleting) && <p>{t("page.account.remove.bodyLegacy")}</p>}
                        {deleteFailed && <Banner tone="error">{t("page.account.remove.failed")}</Banner>}
                    </div>
                )}
            </Dialog>
        </>
    );
}
