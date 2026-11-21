"use client";
import { Icon, cn } from "@/components/md3";
import { mdCheckCircle, mdErrorFill, mdWarningFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { StoryCompileDiagnostic, StoryIssue } from "@/types/storyMaker";

/** Formats a single validation or compiler diagnostic into localized copy. */
export function useIssueText() {
    const { t } = useI18n();
    return (issue: Pick<StoryIssue, "code" | "params">) => t(`page.storyMaker.issue.${issue.code}`, issue.params ?? {});
}

export interface StoryIssueListProps {
    diagnostics?: readonly StoryCompileDiagnostic[];
    /** Backwards-friendly list of structural validation issues (treated as errors). */
    issues?: readonly StoryIssue[];
    /** Called with `(nodeId, beatId)` when the user clicks a diagnostic tied to a node or beat. */
    onSelectDiagnostic?: (nodeId: string, beatId?: string) => void;
    compact?: boolean;
    className?: string;
}

/**
 * Renders `moesekai-story/2` compiler diagnostics grouped into blocking Errors and
 * non-blocking Warnings, with click-to-navigate back to `(nodeId, beatId)`.
 */
export function StoryIssueList({
    diagnostics,
    issues,
    onSelectDiagnostic,
    compact = false,
    className,
}: StoryIssueListProps) {
    const { t } = useI18n();
    const issueText = useIssueText();

    const items: StoryCompileDiagnostic[] = diagnostics
        ? [...diagnostics]
        : (issues ?? []).map(issue => ({
            severity: "error" as const,
            code: issue.code,
            path: issue.path,
            ...(issue.params ? { params: issue.params } : {}),
        }));

    if (items.length === 0) {
        return (
            <div className={cn("flex items-center gap-2 rounded-md3-md bg-surface-container px-3 py-2.5 text-primary", className)}>
                <Icon path={mdCheckCircle} size={18} className="shrink-0" />
                <span className="type-body-m text-on-surface">{t("page.storyMaker.v2.compiler.noIssues")}</span>
            </div>
        );
    }

    const errors = items.filter(item => item.severity === "error");
    const warnings = items.filter(item => item.severity === "warning");

    const renderGroup = (
        group: readonly StoryCompileDiagnostic[],
        severity: "error" | "warning",
        titleKey: "page.storyMaker.v2.compiler.errorsTitle" | "page.storyMaker.v2.compiler.warningsTitle",
    ) => {
        if (group.length === 0) return null;
        const isError = severity === "error";
        return (
            <div className="min-w-0 space-y-1.5">
                {(!compact || (errors.length > 0 && warnings.length > 0)) && (
                    <div className="flex items-center justify-between gap-2 px-1">
                        <span className={cn("type-label-l", isError ? "text-error" : "text-tertiary")}>
                            {t(titleKey)}
                        </span>
                        <span
                            className={cn(
                                "rounded-md3-full px-2 py-0.5 font-mono type-label-s",
                                isError
                                    ? "bg-error-container text-on-error-container"
                                    : "bg-tertiary-container text-on-tertiary-container",
                            )}
                        >
                            {group.length}
                        </span>
                    </div>
                )}
                <ul className="space-y-1">
                    {group.map((diag, index) => {
                        const navigable = Boolean(onSelectDiagnostic && diag.nodeId);
                        const content = (
                            <>
                                <Icon
                                    path={isError ? mdErrorFill : mdWarningFill}
                                    size={18}
                                    className={cn("mt-0.5 shrink-0", isError ? "text-error" : "text-tertiary")}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words type-body-m text-on-surface">
                                        {issueText(diag)}
                                    </span>
                                    <span className="block break-all font-mono type-label-s text-on-surface-variant">
                                        {diag.path}
                                    </span>
                                </span>
                            </>
                        );
                        return (
                            <li key={`${severity}-${diag.path}-${diag.code}-${index}`}>
                                {navigable && diag.nodeId ? (
                                    <button
                                        type="button"
                                        onClick={() => onSelectDiagnostic?.(diag.nodeId!, diag.beatId)}
                                        className="state-layer focus-ring flex w-full cursor-pointer items-start gap-2 rounded-md3-md border border-outline-variant/50 bg-surface-container-low px-2.5 py-2 text-left"
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div className="flex items-start gap-2 rounded-md3-md px-2 py-1.5">
                                        {content}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    return (
        <div className={cn("min-w-0 space-y-3", className)}>
            {renderGroup(errors, "error", "page.storyMaker.v2.compiler.errorsTitle")}
            {renderGroup(warnings, "warning", "page.storyMaker.v2.compiler.warningsTitle")}
        </div>
    );
}
