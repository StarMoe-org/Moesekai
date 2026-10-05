"use client";
import React from "react";
import { getDisplayCombos, SHORTCUT_GROUP_ORDER, SHORTCUTS } from "@/lib/shortcuts";
import { useI18n } from "@/contexts/I18nContext";
import { Dialog } from "@/components/md3";

interface KeyboardShortcutsHelpProps {
    isOpen: boolean;
    onClose: () => void;
}

const SHORTCUT_GROUP_LABEL_KEYS: Record<string, string> = {
    navigation: "shortcuts.groups.navigation",
    interface: "shortcuts.groups.interface",
    search: "shortcuts.groups.search",
    other: "shortcuts.groups.other",
};

const shortcutGroups = SHORTCUT_GROUP_ORDER
    .map((groupTitle) => {
        const shortcuts = SHORTCUTS
            .filter((shortcut) => shortcut.group === groupTitle)
            .map((shortcut) => ({
                ...shortcut,
                displayCombos: getDisplayCombos(shortcut.combos),
            }));

        return {
            titleKey: SHORTCUT_GROUP_LABEL_KEYS[groupTitle] ?? groupTitle,
            shortcuts,
        };
    })
    .filter((group) => group.shortcuts.length > 0);

const KBD_CLASS = "inline-flex min-w-[1.5rem] justify-center rounded-md3-xs border border-outline-variant px-1.5 type-label-s text-on-surface-variant";
const SEP_CLASS = "mx-0.5 type-label-s text-outline";

export default function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
    const { t } = useI18n();

    const renderRows = (group: (typeof shortcutGroups)[number]) => {
        return group.shortcuts.map((shortcut) => (
            <div key={shortcut.id} className="flex items-center justify-between gap-3 py-2">
                <span className="type-body-m text-on-surface">{t(`shortcuts.entries.${shortcut.id}`)}</span>
                <div className="flex flex-wrap items-center justify-end gap-1">
                    {shortcut.displayCombos.map((combo, comboIndex) => (
                        <React.Fragment key={`${shortcut.id}-${combo.combo}`}>
                            {comboIndex > 0 && <span className={SEP_CLASS}>{t("common.separator.or")}</span>}
                            {combo.steps.map((step, stepIndex) => (
                                <React.Fragment key={`${shortcut.id}-${combo.combo}-step-${stepIndex}`}>
                                    {stepIndex > 0 && <span className={SEP_CLASS}>{t("common.separator.then")}</span>}
                                    {step.keys.map((key, keyIndex) => (
                                        <React.Fragment key={`${shortcut.id}-${combo.combo}-step-${stepIndex}-key-${keyIndex}`}>
                                            {keyIndex > 0 && <span className={SEP_CLASS}>+</span>}
                                            <kbd className={KBD_CLASS}>{key}</kbd>
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        ));
    };


    return (
        // MainLayout owns the history sentinel for top-bar overlays.
        <Dialog isOpen={isOpen} onClose={onClose} title={t("shortcuts.title")} size="md" syncHistory={false} bodyClassName="pb-4">
            {shortcutGroups.map((group) => (
                <section key={group.titleKey} className="mb-4 last:mb-0">
                    <h3 className="mb-1 type-title-s text-primary">{t(group.titleKey)}</h3>
                    <div className="divide-y divide-outline-variant">
                        {renderRows(group)}
                    </div>
                </section>
            ))}
            <p className="mt-4 border-t border-outline-variant pt-3 text-center type-body-s text-on-surface-variant">
                {t("shortcuts.footer")}
            </p>
        </Dialog>
    );
}
