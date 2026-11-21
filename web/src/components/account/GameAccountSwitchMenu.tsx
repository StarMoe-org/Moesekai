"use client";

/** A menu of the visitor's game accounts that switches the one being viewed, ending with "Manage game accounts". */
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import { Menu, type MenuItemDef, type MenuProps } from "@/components/md3";
import { mdManageAccounts } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { setActiveAccount } from "@/lib/account";
import { useGameAccounts } from "@/lib/account/hooks";
import { gameAccountName } from "./GameAccountList";

export default function GameAccountSwitchMenu({ anchor, align = "end" }: { anchor: MenuProps["anchor"]; align?: MenuProps["align"] }) {
    const { t } = useI18n();
    const { accounts, active } = useGameAccounts();
    const items: MenuItemDef[] = accounts.map((account) => ({
        key: account.id,
        label: gameAccountName(account),
        selected: account.id === active?.id,
        trailing: <ServerRegionIcon server={account.server} size={18} />,
        onSelect: () => setActiveAccount(account.id),
    }));
    items.push({ key: "manage", icon: mdManageAccounts, label: t("page.account.profile.manage"), href: "/account", dividerBefore: true });
    return <Menu align={align} items={items} anchor={anchor} />;
}
