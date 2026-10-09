'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { localizePathForBrowser } from '@/lib/localized-path';
import { useI18n } from '@/contexts/I18nContext';
import { MOE_LOGO_URL } from '@/lib/assets';
import { Button, Icon, LoadingState, Surface, buttonClassName } from '@/components/md3';
import { mdHome, mdOpenInNew, mdWarningFill } from '@/components/md3/icons';

function LeavePageContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const router = useRouter();
    const target = searchParams.get('target');
    const [canClose, setCanClose] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCanClose(window.history.length === 1 || !!window.opener);
    }, []);

    const handleClose = () => {
        if (canClose) {
            window.close();
        } else {
            router.push(localizePathForBrowser('/'));
        }
    };

    if (!target) {
        return (
            <div className="flex min-h-[80vh] flex-col items-center justify-center p-4">
                <Surface tone="card" className="w-full max-w-md p-8 text-center">
                    <h1 className="mb-4 type-headline-s text-on-surface">
                        {t("page.leave.missingTitle")}
                    </h1>
                    <p className="mb-6 type-body-l text-on-surface-variant">
                        {t("page.leave.missingDescription")}
                    </p>
                    <Button href="/" variant="filled" size="m" icon={mdHome}>
                        {t("page.leave.backHome")}
                    </Button>
                </Surface>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-4">
            <Surface tone="card" elevation={1} className="relative w-full max-w-lg overflow-hidden p-8 md:p-10">
                {/* Decorative accent bar */}
                <div className="absolute left-0 top-0 h-1.5 w-full bg-primary-container" />

                <div className="flex flex-col items-center text-center">

                    {/* Logo Section */}
                    <div className="mb-8 flex items-center gap-2">
                        <div
                            className="h-9 w-[5.5rem] bg-primary-container"
                            style={{
                                maskImage: `url(${MOE_LOGO_URL})`,
                                maskSize: "contain",
                                maskPosition: "center",
                                maskRepeat: "no-repeat",
                                WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                WebkitMaskSize: "contain",
                                WebkitMaskPosition: "center",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                        />
                        <div className="ml-1 flex h-full items-center gap-1.5 border-l border-outline-variant pl-2">
                            <span className="type-label-l leading-none text-on-surface-variant">
                                {t("page.leave.badge")}
                            </span>
                        </div>
                    </div>

                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
                        <Icon path={mdWarningFill} size={40} />
                    </div>

                    <h2 className="mb-3 type-headline-s text-on-surface">
                        {t("page.leave.title")}
                    </h2>

                    <p className="mb-6 type-body-l text-on-surface-variant">
                        {t("page.leave.description")}
                    </p>

                    <div className="mb-6 w-full break-all rounded-md3-md border border-outline-variant bg-surface-container p-4 font-mono type-body-m text-primary">
                        {target}
                    </div>

                    <p className="mb-8 w-full rounded-md3-sm bg-surface-container-high p-3 type-body-s text-on-surface-variant">
                        {t("page.leave.warningLine1")}
                        <br />
                        {t("page.leave.warningLine2")}
                    </p>

                    <div className="flex w-full flex-col space-y-3">
                        <a
                            href={target}
                            rel="noopener noreferrer"
                            className={buttonClassName({ variant: "filled", size: "m", fullWidth: true })}
                        >
                            <Icon path={mdOpenInNew} size={20} />
                            {t("page.leave.continue")}
                        </a>

                        <Button variant="outlined" size="m" fullWidth onClick={handleClose}>
                            {canClose ? t("page.leave.closePage") : t("page.leave.backHome")}
                        </Button>
                    </div>
                </div>
            </Surface>
        </div>
    );
}

function LeavePageFallback() {
    const { t } = useI18n();

    return (
        <LoadingState label={t("common.state.loading")} className="min-h-screen" />
    );
}

export default function LeavePageClient() {
    return (
        <Suspense fallback={<LeavePageFallback />}>
            <LeavePageContent />
        </Suspense>
    );
}
