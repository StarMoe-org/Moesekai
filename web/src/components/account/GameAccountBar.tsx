"use client";

/**
 * The strip at the top of a page that shows one game account's data (my cards, my songs, my materials): who is
 * being viewed, a menu to switch to another account, and a way to add one. Switching here switches the whole site.
 */
import { useState } from "react";
import AccountAvatar from "@/components/AccountAvatar";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { Button, Snackbar, Surface, cn } from "@/components/md3";
import { mdAdd, mdSwapHoriz } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import type { MoesekaiAccount } from "@/lib/account";
import AddGameAccountDialog from "./AddGameAccountDialog";
import GameAccountSwitchMenu from "./GameAccountSwitchMenu";
import { gameAccountName } from "./GameAccountList";

export default function GameAccountBar({ account, className }: { account: MoesekaiAccount; className?: string }) {
    const { t } = useI18n();
    useStarMoeAccountSync();
    const [addOpen, setAddOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    return (
        <Surface tone="card" radius="lg" className={cn("mb-6 flex items-center gap-3 p-3 sm:gap-4 sm:px-4", className)}>
            <AccountAvatar account={account} size="lg" />
            <div className="min-w-0 flex-1">
                <div className="type-label-m text-on-surface-variant">{t("page.account.tools.viewing")}</div>
                <div className="truncate type-title-s text-on-surface">{gameAccountName(account)}</div>
                <div className="flex min-w-0 items-center gap-2 type-body-s text-on-surface-variant">
                    <span className="truncate font-mono">{account.gameId}</span>
                    <ServerRegionLabel server={account.server} size={14} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <GameAccountSwitchMenu
                    anchor={(anchorProps) => (
                        <Button {...anchorProps} variant="tonal" size="s" icon={mdSwapHoriz} aria-label={t("page.account.tools.switch")}>
                            <span className="hidden sm:inline">{t("page.account.tools.switch")}</span>
                        </Button>
                    )}
                />
                <Button variant="text" size="s" icon={mdAdd} onClick={() => setAddOpen(true)} aria-label={t("page.account.games.add")}>
                    <span className="hidden sm:inline">{t("page.account.tools.add")}</span>
                </Button>
            </div>
            <AddGameAccountDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                defaultServer={account.server}
                onAdded={(_id, notice) => notice && setToast(notice)}
            />
            <Snackbar open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} />
        </Surface>
    );
}
