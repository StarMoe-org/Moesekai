"use client";
import React from "react";
import { Dialog } from "@/components/md3/Dialog";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** Modal width preset. Default: "md" */
    size?: "sm" | "md" | "lg" | "xl";
    /** Optional action buttons shown in header, left of close */
    headerActions?: React.ReactNode;
    /** Whether to sync modal open state to browser history. Default: true */
    syncHistory?: boolean;
}

/**
 * Shared modal — now a thin wrapper over the MD3 `Dialog` (API unchanged).
 * Full-screen on compact windows for the larger presets.
 */
export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    size = "md",
    headerActions,
    syncHistory = true,
}: ModalProps) {
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size={size}
            headerActions={headerActions}
            syncHistory={syncHistory}
            showClose
            fullscreenOnMobile={size === "lg" || size === "xl"}
        >
            {children}
        </Dialog>
    );
}
