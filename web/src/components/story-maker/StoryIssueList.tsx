"use client";
import { Icon, cn } from "@/components/md3";
import { mdErrorFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { StoryIssue } from "@/types/storyMaker";

/** The step a validation issue is about (`steps[3].body` → 3), or null. */
export function issueStepIndex(issue: StoryIssue): number | null {
    const match = /^steps\[(\d+)\]/.exec(issue.path);
    return match ? Number(match[1]) : null;
}

/** An issue in words. */
export function useIssueText() {
    const { t } = useI18n();
    return (issue: StoryIssue) => t(`page.storyMaker.issue.${issue.code}`, issue.params ?? {});
}

interface StoryIssueListProps {
    issues: readonly StoryIssue[];
    /** Called with the step an issue is about, when the list is clickable. */
    onSelectStep?: (index: number) => void;
    className?: string;
}

/** Validation issues, each with where it is. */
export function StoryIssueList({ issues, onSelectStep, className }: StoryIssueListProps) {
    const text = useIssueText();
    return (
        <ul className={cn("space-y-1", className)}>
            {issues.map((issue, index) => {
                const step = issueStepIndex(issue);
                const content = (
                    <>
                        <Icon path={mdErrorFill} size={18} className="mt-0.5 shrink-0 text-error" />
                        <span className="min-w-0">
                            <span className="block type-body-m text-on-surface">{text(issue)}</span>
                            <span className="block break-all font-mono type-label-s text-on-surface-variant">{issue.path}</span>
                        </span>
                    </>
                );
                return (
                    <li key={`${issue.path}-${issue.code}-${index}`}>
                        {onSelectStep && step !== null ? (
                            <button
                                type="button"
                                onClick={() => onSelectStep(step)}
                                className="state-layer focus-ring flex w-full items-start gap-2 rounded-md3-md px-2 py-1.5 text-left"
                            >
                                {content}
                            </button>
                        ) : (
                            <div className="flex items-start gap-2 px-2 py-1.5">{content}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
