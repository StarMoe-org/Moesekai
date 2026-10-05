'use client';

import { useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Button, Icon } from '@/components/md3';
import { mdErrorFill, mdRefresh } from '@/components/md3/icons';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const { t } = useI18n();

    useEffect(() => {
        // Detect ChunkLoadError (caused by stale CDN cache after deployment)
        // Automatically reload the page to fetch the latest chunks
        const isChunkError =
            error.name === 'ChunkLoadError' ||
            error.message?.includes('ChunkLoadError') ||
            error.message?.includes('Loading chunk') ||
            error.message?.includes('Failed to fetch dynamically imported module');

        if (isChunkError) {
            // Use sessionStorage to prevent infinite reload loops
            const reloadKey = 'chunk-error-reload';
            const lastReload = sessionStorage.getItem(reloadKey);
            const now = Date.now();

            if (!lastReload || now - parseInt(lastReload) > 10000) {
                // Only auto-reload if we haven't reloaded in the last 10 seconds
                sessionStorage.setItem(reloadKey, now.toString());
                window.location.reload();
                return;
            }
        }
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-md3-xl bg-error-container text-on-error-container">
                <Icon path={mdErrorFill} size={32} />
            </span>
            <div className="flex flex-col gap-2">
                <h2 className="type-headline-s text-on-surface">{t('common.errorBoundary.title')}</h2>
                <p className="mx-auto max-w-md type-body-l text-on-surface-variant">{t('common.errorBoundary.description')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Button variant="filled" size="m" icon={mdRefresh} onClick={() => window.location.reload()}>
                    {t('common.errorBoundary.refreshPage')}
                </Button>
                <Button variant="outlined" size="m" onClick={reset}>
                    {t('common.action.retry')}
                </Button>
            </div>
        </div>
    );
}
