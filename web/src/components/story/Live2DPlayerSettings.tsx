"use client";
import { Button, Dialog, SegmentedButton, Select, Switch } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import {
    SSE_WEB_ASPECTS, SSE_WEB_DEFAULT_SETTINGS, SSE_WEB_RESOLUTIONS,
    type SseWebAspect, type SseWebResolution, type SseWebSettings,
} from "@/lib/sseWeb/settings";

interface Live2DPlayerSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    settings: SseWebSettings;
    /** Every change holds at once: the picture behind the dialog follows it. */
    onChange: (settings: SseWebSettings) => void;
}

const ASPECTS = Object.keys(SSE_WEB_ASPECTS) as SseWebAspect[];

/** The Live2D player's settings: the size its picture is rendered at, and the picture's shape. */
export function Live2DPlayerSettings({ isOpen, onClose, settings, onChange }: Live2DPlayerSettingsProps) {
    const { t } = useI18n();
    const isDefault = (Object.keys(SSE_WEB_DEFAULT_SETTINGS) as (keyof SseWebSettings)[])
        .every(key => settings[key] === SSE_WEB_DEFAULT_SETTINGS[key]);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.story.live2d.settings.title")}
            size="sm"
            actions={(
                <>
                    <Button variant="text" disabled={isDefault} onClick={() => onChange(SSE_WEB_DEFAULT_SETTINGS)}>
                        {t("page.story.live2d.settings.reset")}
                    </Button>
                    <Button variant="text" onClick={onClose}>{t("page.story.reader.close")}</Button>
                </>
            )}
        >
            <div className="flex flex-col gap-6">
                <section>
                    <Select<SseWebResolution>
                        label={t("page.story.live2d.settings.resolution")}
                        value={settings.resolution}
                        onValueChange={resolution => onChange({ ...settings, resolution })}
                        options={SSE_WEB_RESOLUTIONS.map(value => ({
                            value,
                            label: value === "auto" ? t("page.story.live2d.settings.resolutionAuto") : `${value}p`,
                        }))}
                        supportingText={t("page.story.live2d.settings.resolutionHint")}
                    />
                </section>

                <section>
                    <h4 className="mb-2 type-title-s text-on-surface">{t("page.story.live2d.settings.aspect")}</h4>
                    <SegmentedButton<SseWebAspect>
                        aria-label={t("page.story.live2d.settings.aspect")}
                        value={settings.aspect}
                        onValueChange={aspect => onChange({ ...settings, aspect })}
                        showCheckmark={false}
                        density={-1}
                        options={ASPECTS.map(value => ({ value, label: value }))}
                    />
                    <p className="mt-2 type-body-s text-on-surface-variant">{t("page.story.live2d.settings.aspectHint")}</p>
                </section>

                <Switch
                    checked={settings.fullscreenFillsScreen}
                    onCheckedChange={fullscreenFillsScreen => onChange({ ...settings, fullscreenFillsScreen })}
                    label={t("page.story.live2d.settings.fullscreenFillsScreen")}
                    description={t("page.story.live2d.settings.fullscreenFillsScreenHint")}
                    icons={false}
                />
                <Switch
                    checked={settings.showStats}
                    onCheckedChange={showStats => onChange({ ...settings, showStats })}
                    label={t("page.story.live2d.settings.showStats")}
                    icons={false}
                />
            </div>
        </Dialog>
    );
}

export default Live2DPlayerSettings;
