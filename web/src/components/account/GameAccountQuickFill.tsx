"use client";

/**
 * For tools that take any player's UID (deck recommendation, score control, MySekai): the visitor's own game
 * accounts as one-tap fills, plus "add" and a link to manage them. Picking one also makes it the account the
 * site is viewing, as everywhere else.
 */
import { useMemo, useState } from "react";
import AccountAvatar from "@/components/AccountAvatar";
import Link from "@/components/LocalizedLink";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { Button, Snackbar, cn } from "@/components/md3";
import { mdAdd } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { getAccounts, setActiveAccount, type MoesekaiAccount, type ServerType } from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import AddGameAccountDialog from "./AddGameAccountDialog";
import { gameAccountName } from "./GameAccountList";

const CHIP = "state-layer focus-ring flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md3-sm border pl-1.5 pr-2 type-label-l sm:gap-2";

export default function GameAccountQuickFill({
    onSelect,
    currentUserId,
    currentServer,
    allowedServers,
    className,
}: {
    /** Called with the picked (or just added) account's UID and server. */
    onSelect: (gameId: string, server: ServerType) => void;
    /** The UID and server in the tool's inputs, to mark the matching account. */
    currentUserId?: string;
    currentServer?: ServerType;
    /** Only offer accounts on these servers (the tool supports no others). */
    allowedServers?: readonly ServerType[];
    className?: string;
}) {
    const { t } = useI18n();
    useStarMoeAccountSync();
    const { accounts: all } = useGameAccounts();
    const [addOpen, setAddOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const accounts = useMemo(
        () => (allowedServers?.length ? all.filter((account) => allowedServers.includes(account.server)) : all),
        [all, allowedServers],
    );

    function pick(account: MoesekaiAccount) {
        setActiveAccount(account.id);
        onSelect(account.gameId, account.server);
    }

    return (
        <div className={cn("mb-3 max-w-full", className)}>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="type-label-l text-on-surface-variant">{t("page.account.tools.mine")}</span>
                {accounts.length > 0 && <span className="type-label-s text-outline">{t("page.account.tools.fillHint")}</span>}
                <Link href="/account" className="ml-auto rounded-md3-xs type-label-m text-primary hover:underline focus-ring">
                    {t("page.account.tools.manage")}
                </Link>
            </div>
            <div className="flex flex-wrap gap-2">
                {accounts.map((account) => {
                    const active = currentUserId === account.gameId && currentServer === account.server;
                    return (
                        <button
                            key={account.id}
                            type="button"
                            onClick={() => pick(account)}
                            aria-pressed={active}
                            className={cn(
                                CHIP,
                                active
                                    ? "border-transparent bg-primary-container text-on-primary-container"
                                    : "border-outline-variant text-on-surface-variant",
                            )}
                        >
                            <AccountAvatar account={account} size="sm" />
                            <span className="max-w-[65px] shrink-0 truncate type-emphasized sm:max-w-[85px]">{gameAccountName(account)}</span>
                            <span className="min-w-0 flex-1 truncate font-mono">{account.gameId}</span>
                            <span className={cn("shrink-0 whitespace-nowrap rounded-md3-xs px-1.5 type-label-s", active ? "bg-on-secondary-container/12" : "bg-surface-container-highest")}>
                                <ServerRegionLabel server={account.server} size={16} />
                            </span>
                        </button>
                    );
                })}
                <Button variant="text" size="xs" icon={mdAdd} onClick={() => setAddOpen(true)}>
                    {accounts.length > 0 ? t("page.account.tools.add") : t("page.account.games.add")}
                </Button>
            </div>
            <AddGameAccountDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                defaultServer={allowedServers?.[0] ?? currentServer}
                onAdded={(id, notice) => {
                    if (notice) setToast(notice);
                    const added = getAccounts().find((account) => account.id === id);
                    if (added && (!allowedServers?.length || allowedServers.includes(added.server))) onSelect(added.gameId, added.server);
                }}
            />
            <Snackbar open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} />
        </div>
    );
}
