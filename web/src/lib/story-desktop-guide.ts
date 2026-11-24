export const STORY_DESKTOP_GUIDE_DISMISSED_KEY = "moesekai:story-maker:desktop-guide-dismissed:v1";
export const STORY_DESKTOP_GUIDE_SESSION_KEY = "moesekai:story-maker:desktop-guide-session:v1";

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface DesktopGuideStorages {
    local?: StorageLike | null;
    session?: StorageLike | null;
}

function defaultLocalStorage(): StorageLike | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function defaultSessionStorage(): StorageLike | null {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function resolveLocal(storages?: DesktopGuideStorages): StorageLike | null {
    return storages && "local" in storages ? (storages.local ?? null) : defaultLocalStorage();
}

function resolveSession(storages?: DesktopGuideStorages): StorageLike | null {
    return storages && "session" in storages ? (storages.session ?? null) : defaultSessionStorage();
}

/**
 * Checks whether the user permanently dismissed the Desktop Story Studio guide.
 */
export function isDesktopGuidePermanentlyDismissed(localStorageLike?: StorageLike | null): boolean {
    const storage = localStorageLike === undefined ? defaultLocalStorage() : localStorageLike;
    if (!storage) return false;
    try {
        return storage.getItem(STORY_DESKTOP_GUIDE_DISMISSED_KEY) === "1";
    } catch {
        return true;
    }
}

/**
 * Checks whether the guide was already dismissed during the current browser tab session.
 */
export function isDesktopGuideSessionDismissed(sessionStorageLike?: StorageLike | null): boolean {
    const storage = sessionStorageLike === undefined ? defaultSessionStorage() : sessionStorageLike;
    if (!storage) return false;
    try {
        return storage.getItem(STORY_DESKTOP_GUIDE_SESSION_KEY) === "1";
    } catch {
        return true;
    }
}

/**
 * Returns true when entering Web Story Maker should automatically show the
 * Desktop Studio & MoeSekai Agent onboarding guide.
 */
export function shouldAutoOpenDesktopGuide(storages?: DesktopGuideStorages): boolean {
    const local = resolveLocal(storages);
    const session = resolveSession(storages);
    if (!local && !session) return false;
    return !isDesktopGuidePermanentlyDismissed(local) && !isDesktopGuideSessionDismissed(session);
}

/**
 * Records dismissal of the Desktop Studio guide.
 * - Always records session-scoped dismissal so navigating between `/story-maker`
 *   and `/story-maker/edit` does not re-trigger the popup in the same session.
 * - When `permanent` is true, also persists dismissal in `localStorage`.
 */
export function dismissDesktopGuide(permanent: boolean, storages?: DesktopGuideStorages): void {
    const session = resolveSession(storages);
    if (session) {
        try {
            session.setItem(STORY_DESKTOP_GUIDE_SESSION_KEY, "1");
        } catch {
            // Ignore private-mode or quota errors.
        }
    }
    if (permanent) {
        const local = resolveLocal(storages);
        if (local) {
            try {
                local.setItem(STORY_DESKTOP_GUIDE_DISMISSED_KEY, "1");
            } catch {
                // Ignore private-mode or quota errors.
            }
        }
    }
}

/**
 * Clears both session and permanent dismissal flags (mainly for tests/dev).
 */
export function resetDesktopGuideDismissal(storages?: DesktopGuideStorages): void {
    const session = resolveSession(storages);
    if (session) {
        try {
            session.removeItem(STORY_DESKTOP_GUIDE_SESSION_KEY);
        } catch {
            // Ignore storage errors.
        }
    }
    const local = resolveLocal(storages);
    if (local) {
        try {
            local.removeItem(STORY_DESKTOP_GUIDE_DISMISSED_KEY);
        } catch {
            // Ignore storage errors.
        }
    }
}
