"use client";

import type { RefObject } from "react";
import type { StoryStudioEditorHandle } from "@moesekai/story-editor";
import { StoryAgentDraftScreen, StoryAgentPanel, useEditorAgentTarget } from "@moesekai/story-editor/agent";
import { useShellImmersiveMode } from "@/components/AppShell";
import { decodeStoryBrotli } from "@/lib/story-maker-brotli";

/**
 * The story agent's two surfaces. The edit page loads this module only when one is shown, so the
 * agent and its model client stay out of the editor's own bundle.
 */

/** The agent docked beside the editor, editing the open draft. */
export function DockedStoryAgent({
    editorRef,
    draftId,
    onClose,
}: {
    editorRef: RefObject<StoryStudioEditorHandle | null>;
    draftId: string;
    onClose: () => void;
}) {
    const target = useEditorAgentTarget(editorRef, draftId);
    return <StoryAgentPanel target={target} decodeBrotli={decodeStoryBrotli} onClose={onClose} />;
}

/** The agent over a stored draft, for phones where the editor does not run; it owns the whole screen. */
export function PhoneStoryAgent({ draftId }: { draftId: string }) {
    useShellImmersiveMode(true);
    return <StoryAgentDraftScreen draftId={draftId} backToDraftsHref="/story-maker" decodeBrotli={decodeStoryBrotli} />;
}
