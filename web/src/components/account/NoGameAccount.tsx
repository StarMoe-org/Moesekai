"use client";

/**
 * What a page that shows one game account's data says when there is none yet: sign in (the accounts saved with
 * the Passport come back) or add one by UID. `description` says what the page will show once there is one.
 */
import { useState } from "react";
import { Button, EmptyState, Snackbar, Surface } from "@/components/md3";
import { mdAdd, mdLogin, mdPerson } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import { signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import AddGameAccountDialog from "./AddGameAccountDialog";

export default function NoGameAccount({ description, className }: { description: string; className?: string }) {
    const { t } = useI18n();
    useStarMoeAccountSync();
    const login = useMoesekaiAccount();
    const signedOut = login.status === "signed-out";
    const [addOpen, setAddOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    return (
        <Surface tone="card" radius="xl" className={className}>
            <EmptyState
                className="py-12"
                icon={mdPerson}
                title={t("page.account.games.empty")}
                description={
                    <>
                        <p>{description}</p>
                        <p className="mt-1">{signedOut ? t("page.account.games.emptyGuest") : t("page.account.games.emptySignedIn")}</p>
                    </>
                }
                action={
                    <div className="mt-1 flex flex-wrap justify-center gap-2">
                        {signedOut && (
                            <Button variant="filled" icon={mdLogin} onClick={() => signIn()}>
                                {t("page.account.games.signIn")}
                            </Button>
                        )}
                        <Button variant={signedOut ? "outlined" : "filled"} icon={mdAdd} onClick={() => setAddOpen(true)}>
                            {signedOut ? t("page.account.games.addByUid") : t("page.account.games.add")}
                        </Button>
                    </div>
                }
            />
            <AddGameAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={(_id, notice) => notice && setToast(notice)} />
            <Snackbar open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} />
        </Surface>
    );
}
