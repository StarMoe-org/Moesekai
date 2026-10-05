"use client";
import React, { useId, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/md3";
import { mdKeyboardArrowDown, mdKeyboardArrowUp } from "@/components/md3/icons";

interface CollapsibleBlockProps {
    title: React.ReactNode;
    children: React.ReactNode;
}

/** Titled sub-section with a show/hide toggle, open by default; hiding keeps the content mounted. */
export default function CollapsibleBlock({ title, children }: CollapsibleBlockProps) {
    const { t } = useI18n();
    const [open, setOpen] = useState(true);
    const contentId = useId();
    return (
        <div>
            <div className={`flex items-center justify-between gap-2 ${open ? "mb-2" : ""}`}>
                <h3 className="min-w-0 type-title-s text-on-surface">{title}</h3>
                <Button
                    variant="tonal"
                    color="secondary"
                    size="xs"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls={contentId}
                    trailingIcon={open ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                    className="shrink-0"
                >
                    {open ? t("page.predictionPlanner.pt.sectionCollapse") : t("page.predictionPlanner.pt.sectionExpand")}
                </Button>
            </div>
            <div id={contentId} hidden={!open}>
                {children}
            </div>
        </div>
    );
}
