import assert from "node:assert/strict";
import test from "node:test";
import {
    STORY_DESKTOP_GUIDE_DISMISSED_KEY,
    STORY_DESKTOP_GUIDE_SESSION_KEY,
    dismissDesktopGuide,
    isDesktopGuidePermanentlyDismissed,
    isDesktopGuideSessionDismissed,
    resetDesktopGuideDismissal,
    shouldAutoOpenDesktopGuide,
} from "../src/lib/story-desktop-guide.ts";

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
    };
}

function createThrowingStorage() {
    return {
        getItem() {
            throw new Error("storage blocked");
        },
        setItem() {
            throw new Error("storage blocked");
        },
        removeItem() {
            throw new Error("storage blocked");
        },
    };
}

test("1. shouldAutoOpenDesktopGuide returns true on first entry and false when no storages exist (SSR)", () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();

    assert.equal(shouldAutoOpenDesktopGuide({ local: null, session: null }), false);
    assert.equal(shouldAutoOpenDesktopGuide({ local, session }), true);
    assert.equal(isDesktopGuidePermanentlyDismissed(local), false);
    assert.equal(isDesktopGuideSessionDismissed(session), false);
});

test("2. session dismissal suppresses re-opening within the same tab session without permanently dismissing", () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();

    dismissDesktopGuide(false, { local, session });
    assert.equal(session.getItem(STORY_DESKTOP_GUIDE_SESSION_KEY), "1");
    assert.equal(local.getItem(STORY_DESKTOP_GUIDE_DISMISSED_KEY), null);
    assert.equal(isDesktopGuideSessionDismissed(session), true);
    assert.equal(isDesktopGuidePermanentlyDismissed(local), false);
    assert.equal(shouldAutoOpenDesktopGuide({ local, session }), false);

    // Fresh tab session (new sessionStorage) auto-opens again until permanently dismissed.
    const nextSession = createMemoryStorage();
    assert.equal(shouldAutoOpenDesktopGuide({ local, session: nextSession }), true);
});

test("3. permanent dismissal persists across sessions and resetDesktopGuideDismissal restores default state", () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();

    dismissDesktopGuide(true, { local, session });
    assert.equal(session.getItem(STORY_DESKTOP_GUIDE_SESSION_KEY), "1");
    assert.equal(local.getItem(STORY_DESKTOP_GUIDE_DISMISSED_KEY), "1");
    assert.equal(isDesktopGuidePermanentlyDismissed(local), true);
    assert.equal(shouldAutoOpenDesktopGuide({ local, session: createMemoryStorage() }), false);

    resetDesktopGuideDismissal({ local, session });
    assert.equal(shouldAutoOpenDesktopGuide({ local, session }), true);
});

test("4. storage errors degrade safely without throwing or nagging", () => {
    const throwing = createThrowingStorage();

    assert.equal(isDesktopGuidePermanentlyDismissed(throwing), true);
    assert.equal(isDesktopGuideSessionDismissed(throwing), true);
    assert.equal(shouldAutoOpenDesktopGuide({ local: throwing, session: throwing }), false);
    assert.doesNotThrow(() => dismissDesktopGuide(true, { local: throwing, session: throwing }));
    assert.doesNotThrow(() => resetDesktopGuideDismissal({ local: throwing, session: throwing }));
});
