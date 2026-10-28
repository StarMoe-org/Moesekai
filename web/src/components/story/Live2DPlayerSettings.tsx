"use client";
import { Button, ConnectedButtonGroup, Dialog, Select, Switch } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
    SSE_WEB_ASPECTS, SSE_WEB_DEFAULT_SETTINGS, SSE_WEB_MSAA, SSE_WEB_RESOLUTIONS, SSE_WEB_SSAA, sameSseWebSettings,
    type SseWebAntialiasing, type SseWebAspect, type SseWebResolution, type SseWebSettings,
} from "@/lib/sseWeb/settings";

interface Live2DPlayerSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    settings: SseWebSettings;
    /** Every change holds at once: the picture behind the dialog follows it. */
    onChange: (settings: SseWebSettings) => void;
}

const ASPECTS = Object.keys(SSE_WEB_ASPECTS) as SseWebAspect[];

/**
 * The Live2D player's settings: the size its picture is rendered at, the picture's shape and,
 * while the experimental setting offers it, its anti-aliasing.
 */
export function Live2DPlayerSettings({ isOpen, onClose, settings, onChange }: Live2DPlayerSettingsProps) {
    const { t } = useI18n();
    const { storyLive2dAntialiasing } = useTheme();
    // what the dialog shows: the anti-aliasing only while the experimental setting offers it, so a
    // reset does not touch it otherwise
    const defaults = storyLive2dAntialiasing
        ? SSE_WEB_DEFAULT_SETTINGS
        : { ...SSE_WEB_DEFAULT_SETTINGS, antialiasing: settings.antialiasing };
    const isDefault = sameSseWebSettings(settings, defaults);
    const changeAntialiasing = (change: Partial<SseWebAntialiasing>) =>
        onChange({ ...settings, antialiasing: { ...settings.antialiasing, ...change } });
    const off = t("page.story.live2d.settings.antialiasingOff");

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.story.live2d.settings.title")}
            size="sm"
            actions={(
                <>
                    <Button variant="text" disabled={isDefault} onClick={() => onChange(defaults)}>
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
                    <ConnectedButtonGroup<SseWebAspect>
                        aria-label={t("page.story.live2d.settings.aspect")}
                        value={settings.aspect}
                        onValueChange={aspect => onChange({ ...settings, aspect })}
                        options={ASPECTS.map(value => ({ value, label: value }))}
                    />
                    <p className="mt-2 type-body-s text-on-surface-variant">{t("page.story.live2d.settings.aspectHint")}</p>
                </section>

                <Switch
                    checked={settings.fullscreenFillsScreen}
                    onCheckedChange={fullscreenFillsScreen => onChange({ ...settings, fullscreenFillsScreen })}
                    label={t("page.story.live2d.settings.fullscreenFillsScreen")}
                    description={t("page.story.live2d.settings.fullscreenFillsScreenHint")}
                />
                <Switch
                    checked={settings.showStats}
                    onCheckedChange={showStats => onChange({ ...settings, showStats })}
                    label={t("page.story.live2d.settings.showStats")}
                />

                {storyLive2dAntialiasing && (
                    <section className="flex flex-col gap-4">
                        <div>
                            <h4 className="type-title-s text-on-surface">{t("page.story.live2d.settings.antialiasing")}</h4>
                            <p className="mt-1 type-body-s text-on-surface-variant">{t("page.story.live2d.settings.antialiasingHint")}</p>
                        </div>
                        <Select<number>
                            label={t("page.story.live2d.settings.msaa")}
                            value={settings.antialiasing.msaa}
                            onValueChange={msaa => changeAntialiasing({ msaa: SSE_WEB_MSAA.find(n => n === msaa) ?? 1 })}
                            options={SSE_WEB_MSAA.map(value => ({ value, label: value === 1 ? off : `${value}x` }))}
                            supportingText={t("page.story.live2d.settings.msaaHint")}
                        />
                        <Select<number>
                            label={t("page.story.live2d.settings.ssaa")}
                            value={settings.antialiasing.ssaa}
                            onValueChange={ssaa => changeAntialiasing({ ssaa: SSE_WEB_SSAA.find(n => n === ssaa) ?? 1 })}
                            options={SSE_WEB_SSAA.map(value => ({ value, label: value === 1 ? off : `${value}x` }))}
                            supportingText={t("page.story.live2d.settings.ssaaHint")}
                        />
                        <Switch
                            checked={settings.antialiasing.smaa}
                            onCheckedChange={smaa => changeAntialiasing({ smaa })}
                            label={t("page.story.live2d.settings.smaa")}
                            description={t("page.story.live2d.settings.smaaHint")}
                        />
                    </section>
                )}
            </div>
        </Dialog>
    );
}

export default Live2DPlayerSettings;
