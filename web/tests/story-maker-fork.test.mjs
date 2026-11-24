import assert from "node:assert/strict";
import test from "node:test";
import { STORY_LIMITS, createStoryDocument, validateStoryDocument } from "@moesekai/story-core";
import {
    buildStoryPlayerLayoutQueryValue,
    clearForkAttribution,
    escapeMarkdownLinkLabel,
    formatForkAttributionMarkdown,
    getForkAttribution,
    prepareClonedCommunityStoryDoc,
    resolveStoryPlayerLayoutMode,
    setForkAttribution,
} from "../src/lib/story-maker-fork.ts";

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

test("1. resolveStoryPlayerLayoutMode defaults community stories to theater and local drafts to workspace", () => {
    assert.equal(resolveStoryPlayerLayoutMode(null, true), "theater");
    assert.equal(resolveStoryPlayerLayoutMode("", true), "theater");
    assert.equal(resolveStoryPlayerLayoutMode("invalid", true), "theater");
    assert.equal(resolveStoryPlayerLayoutMode("workspace", true), "workspace");
    assert.equal(resolveStoryPlayerLayoutMode("theater", true), "theater");

    assert.equal(resolveStoryPlayerLayoutMode(null, false), "workspace");
    assert.equal(resolveStoryPlayerLayoutMode("", false), "workspace");
    assert.equal(resolveStoryPlayerLayoutMode("theater", false), "theater");
    assert.equal(resolveStoryPlayerLayoutMode("workspace", false), "workspace");
});

test("2. buildStoryPlayerLayoutQueryValue persists only non-default overrides symmetrically", () => {
    // Community stories default to theater: only workspace needs explicit ?layout=workspace
    assert.equal(buildStoryPlayerLayoutQueryValue("theater", true), null);
    assert.equal(buildStoryPlayerLayoutQueryValue("workspace", true), "workspace");

    // Local drafts default to workspace: only theater needs explicit ?layout=theater
    assert.equal(buildStoryPlayerLayoutQueryValue("workspace", false), null);
    assert.equal(buildStoryPlayerLayoutQueryValue("theater", false), "theater");
});

test("3. prepareClonedCommunityStoryDoc isolates ID/objects, clears original author/summary, and clamps title", () => {
    const original = createStoryDocument("jp", "Midnight Studio");
    original.meta.author = "OriginalAuthor";
    original.meta.summary = "Original summary text";

    const cloned = prepareClonedCommunityStoryDoc(original, { titleSuffix: "Remix" });
    assert.notEqual(cloned.id, original.id);
    assert.match(cloned.id, /^[a-z0-9]{10}$/);
    assert.equal(cloned.meta.title, "Midnight Studio Remix");
    assert.equal(cloned.meta.author, "");
    assert.equal(cloned.meta.summary, "");

    // Mutating the clone must never mutate the original document
    cloned.meta.title = "Mutated";
    assert.equal(original.meta.title, "Midnight Studio");
    assert.equal(original.meta.author, "OriginalAuthor");

    // Title clamping respects STORY_LIMITS.title even with long titles + suffix
    const longDoc = createStoryDocument("jp", "A".repeat(STORY_LIMITS.title + 20));
    const longCloned = prepareClonedCommunityStoryDoc(longDoc, { titleSuffix: "Remix" });
    assert.ok(longCloned.meta.title.length <= STORY_LIMITS.title);
    assert.ok(longCloned.meta.title.endsWith(" Remix"));

    // Duplicate suffix is not appended twice
    const alreadySuffixed = createStoryDocument("jp", "Demo Remix");
    const dedupCloned = prepareClonedCommunityStoryDoc(alreadySuffixed, { titleSuffix: "Remix" });
    assert.equal(dedupCloned.meta.title, "Demo Remix");

    // Still passes story-core draft structure expectations (no unknown fields added)
    const validated = validateStoryDocument(cloned);
    assert.equal(validated.issues.some((issue) => issue.code === "idInvalid"), false);
});

test("4. escapeMarkdownLinkLabel and formatForkAttributionMarkdown safely escape brackets, backslashes, and newlines", () => {
    assert.equal(
        escapeMarkdownLinkLabel("Act [1] \\ [Final]\nCut"),
        "Act \\[1\\] \\\\ \\[Final\\] Cut",
    );

    const formatted = formatForkAttributionMarkdown(
        {
            sourcePostId: 42,
            sourceTitle: "25:00 [Demo] \\ Part 1\nNext",
            sourceAuthorName: "Kanade\nYoisaki",
            forkedAt: 1700000000000,
        },
        "> Remixed from {postLink} by {author}",
    );
    assert.equal(
        formatted,
        "> Remixed from [25:00 \\[Demo\\] \\\\ Part 1 Next](/community/post/42) by Kanade Yoisaki",
    );

    // Empty title falls back cleanly to #<postId>
    const fallbackFormatted = formatForkAttributionMarkdown(
        {
            sourcePostId: 99,
            sourceTitle: "   ",
            sourceAuthorName: "Miku",
            forkedAt: 1700000000000,
        },
        "> Forked from {postLink} ({author})",
    );
    assert.equal(fallbackFormatted, "> Forked from [#99](/community/post/99) (Miku)");
});

test("5. fork attribution localStorage helpers round-trip, isolate draft IDs, and clear cleanly", () => {
    const storage = createMemoryStorage();
    assert.equal(getForkAttribution("draft_1", storage), null);

    setForkAttribution(
        "draft_1",
        {
            sourcePostId: 123,
            sourceTitle: "  Rooftop Promise  ",
            sourceAuthorName: "  Ichika  ",
            forkedAt: 1700000000000,
        },
        storage,
    );

    const stored = getForkAttribution("draft_1", storage);
    assert.deepEqual(stored, {
        sourcePostId: 123,
        sourceTitle: "Rooftop Promise",
        sourceAuthorName: "Ichika",
        forkedAt: 1700000000000,
    });
    assert.equal(getForkAttribution("draft_2", storage), null);

    clearForkAttribution("draft_1", storage);
    assert.equal(getForkAttribution("draft_1", storage), null);
});
