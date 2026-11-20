"use client";

import { signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import { connectHref, useStarMoeAccounts } from "@/lib/starmoe-accounts";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/md3";
import { mdLink } from "@/components/md3/icons";

type ButtonSize = "xs" | "s" | "m";

/**
 * The one way to give Moesekai access to a Haruki account: connect it on StarMoe Connect (connect.star.moe),
 * which keeps the authorization for the visitor's StarMoe account. Signed out, it asks to sign in first.
 */
export default function HarukiConnectButton({
    size = "xs",
    variant = "outlined",
    fullWidth,
    className,
}: {
    size?: ButtonSize;
    variant?: "outlined" | "text" | "tonal" | "filled";
    fullWidth?: boolean;
    className?: string;
}) {
    const { t } = useI18n();
    const account = useMoesekaiAccount();
    const saved = useStarMoeAccounts();

    if (account.status !== "signed-in") {
        return (
            <Button
                variant={variant}
                size={size}
                icon={mdLink}
                fullWidth={fullWidth}
                className={className}
                disabled={account.status === "loading"}
                onClick={() => signIn()}
            >
                {t("common.account.signInToConnectHaruki")}
            </Button>
        );
    }

    const label = saved.haruki === "active"
        ? t("common.account.manageHarukiConnection")
        : saved.haruki === "needs_reconnect"
            ? t("common.account.reconnectHaruki")
            : t("common.account.connectHaruki");
    return (
        <Button
            variant={variant}
            size={size}
            icon={mdLink}
            fullWidth={fullWidth}
            className={className}
            onClick={() => window.location.assign(connectHref())}
        >
            {label}
        </Button>
    );
}
