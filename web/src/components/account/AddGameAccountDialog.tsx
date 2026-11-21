"use client";

/**
 * The one way to add a game account by UID, on every page: server, UID (digits only), Enter to submit. The hint
 * says where it will be kept for this visitor, and a failure says what to do next.
 */
import { useId, useState } from "react";
import ExternalLink from "@/components/ExternalLink";
import { ServerPicker } from "@/components/common/ServerPicker";
import { Banner, Button, CircularProgress, Dialog, TextField } from "@/components/md3";
import { mdAdd } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { addGameAccount, type AddGameAccountResult, type ServerType } from "@/lib/account";
import { useMoesekaiAccount } from "@/lib/moesekai-account";

const HARUKI_TOOLBOX_URL = "https://haruki.seiunx.com";
const UID_PATTERN = /^\d{1,24}$/;

type Failure = Extract<AddGameAccountResult, { ok: false }>["error"];

export default function AddGameAccountDialog({
    open,
    onClose,
    onAdded,
    defaultServer = "jp",
}: {
    open: boolean;
    onClose: () => void;
    /** Called once the account is in the list; `notice` is set when it could not be saved to the Passport. */
    onAdded?: (accountId: string, notice: string | null) => void;
    defaultServer?: ServerType;
}) {
    const { t } = useI18n();
    const login = useMoesekaiAccount();
    const signedIn = login.status === "signed-in";
    const serverLabelId = useId();
    const [server, setServer] = useState<ServerType>(defaultServer);
    const [uid, setUid] = useState("");
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);

    /** Closes and leaves the form empty for next time. */
    function close() {
        setServer(defaultServer);
        setUid("");
        setFailure(null);
        onClose();
    }

    const trimmed = uid.trim();
    const invalid = trimmed.length > 0 && !UID_PATTERN.test(trimmed);
    const canSubmit = trimmed.length > 0 && !invalid && !busy;

    async function submit() {
        if (!canSubmit) return;
        setBusy(true);
        setFailure(null);
        const result = await addGameAccount(server, trimmed);
        setBusy(false);
        if (!result.ok) {
            setFailure(result.error);
            return;
        }
        const notice = result.addedTo === "device-full"
            ? t("page.account.add.savedLocalFull")
            : result.addedTo === "device-failed"
                ? t("page.account.add.savedLocalFailed")
                : null;
        onAdded?.(result.accountId, notice);
        close();
    }

    const failureText = failure === "DUPLICATE"
        ? t("page.account.add.duplicate")
        : failure === "API_NOT_PUBLIC"
            ? t("page.account.add.errorNotPublic")
            : failure === "NOT_FOUND"
                ? t("page.account.add.errorNotFound")
                : failure
                    ? t("page.account.add.errorNetwork")
                    : null;

    return (
        <Dialog
            isOpen={open}
            onClose={busy ? () => undefined : close}
            title={t("page.account.add.title")}
            icon={mdAdd}
            size="sm"
            actions={
                <>
                    <Button variant="text" onClick={close} disabled={busy}>
                        {t("common.action.cancel")}
                    </Button>
                    <Button variant="filled" onClick={() => void submit()} disabled={!canSubmit}>
                        {busy && <CircularProgress size={16} strokeWidth={2} />}
                        {busy ? t("page.account.add.submitting") : t("page.account.add.submit")}
                    </Button>
                </>
            }
        >
            <form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <div>
                    <div id={serverLabelId} className="mb-2 type-label-l text-on-surface-variant">{t("page.account.add.server")}</div>
                    <ServerPicker value={server} onValueChange={setServer} disabled={busy} labelledBy={serverLabelId} />
                </div>
                <TextField
                    variant="outlined"
                    label={t("page.account.add.uid")}
                    placeholder={t("page.account.add.uidPlaceholder")}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={uid}
                    onChange={(event) => {
                        setUid(event.target.value.replace(/\s+/g, ""));
                        setFailure(null);
                    }}
                    error={invalid}
                    errorText={invalid ? t("page.account.add.uidInvalid") : undefined}
                    disabled={busy}
                />
                <p className="type-body-s text-on-surface-variant">
                    {signedIn ? t("page.account.add.hintSignedIn") : t("page.account.add.hintGuest")}
                </p>
                {failureText && (
                    <Banner tone={failure === "DUPLICATE" ? "info" : "error"} title={failureText}>
                        {failure === "API_NOT_PUBLIC" && <p>{t("page.account.add.errorNotPublicNext")}</p>}
                        {(failure === "API_NOT_PUBLIC" || failure === "NOT_FOUND") && (
                            <ExternalLink
                                href={HARUKI_TOOLBOX_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block rounded-md3-xs text-primary underline focus-ring"
                            >
                                {t("page.account.add.openHaruki")}
                            </ExternalLink>
                        )}
                    </Banner>
                )}
                {/* Enter in the UID field submits. */}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
            </form>
        </Dialog>
    );
}
