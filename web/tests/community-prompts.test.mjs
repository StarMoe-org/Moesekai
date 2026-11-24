import assert from "node:assert/strict";
import test from "node:test";
import {
    COMMUNITY_PROMPT_STORAGE_KEY,
    MIN_VIEWS_FOR_RANDOM_PROMPT,
    applyPromptDismissal,
    defaultCommunityPromptState,
    getReachedSponsorMilestones,
    isCountableRoute,
    isSameLocalDay,
    markPromptShown,
    pickCommunityPrompt,
    readCommunityPromptState,
    recordPageView,
    setCommunityPromptsMuted,
    writeCommunityPromptState,
} from "../src/lib/community-prompts.ts";
import lists from "../src/data/community-lists.json" with { type: "json" };

function createMemoryStorage() {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        },
    };
}

test("isCountableRoute excludes auth/bare utility routes", () => {
    assert.equal(isCountableRoute("/"), true);
    assert.equal(isCountableRoute("/cards"), true);
    assert.equal(isCountableRoute("/patreon"), true);
    assert.equal(isCountableRoute("/oauth2/callback"), false);
    assert.equal(isCountableRoute("/leave"), false);
    assert.equal(isCountableRoute("/blank"), false);
    assert.equal(isCountableRoute("/internal-healthz"), false);
    assert.equal(isCountableRoute("/chart-image"), false);
});

test("storage round-trip tolerates missing or malformed data", () => {
    const storage = createMemoryStorage();
    assert.deepEqual(readCommunityPromptState(storage), defaultCommunityPromptState());

    storage.setItem(COMMUNITY_PROMPT_STORAGE_KEY, "{broken json");
    assert.deepEqual(readCommunityPromptState(storage), defaultCommunityPromptState());

    let state = recordPageView(readCommunityPromptState(storage));
    state = recordPageView(state);
    writeCommunityPromptState(state, storage);
    assert.equal(readCommunityPromptState(storage).totalViews, 2);
});

test("random community prompts wait for frequent visits and show at most once per day", () => {
    const day1 = new Date(2026, 10, 20, 10, 0, 0).getTime();
    const sameDayLater = new Date(2026, 10, 20, 22, 30, 0).getTime();
    const day2 = new Date(2026, 10, 21, 9, 0, 0).getTime();
    assert.equal(isSameLocalDay(day1, sameDayLater), true);
    assert.equal(isSameLocalDay(day1, day2), false);

    let state = defaultCommunityPromptState();
    state = { ...state, totalViews: MIN_VIEWS_FOR_RANDOM_PROMPT - 1 };
    assert.equal(
        pickCommunityPrompt(state, { routePath: "/cards", now: day1, random: () => 0 }),
        null,
    );

    state = { ...state, totalViews: MIN_VIEWS_FOR_RANDOM_PROMPT };
    const first = pickCommunityPrompt(state, { routePath: "/cards", now: day1, random: () => 0.05 });
    assert.ok(first);
    assert.equal(first.promptId, "qq-feedback");

    // Later on the same calendar day, no second popup can appear even after many views.
    state = markPromptShown(state, first.promptId, day1);
    state = { ...state, totalViews: state.totalViews + 50 };
    assert.equal(
        pickCommunityPrompt(state, { routePath: "/music", now: sameDayLater, random: () => 0 }),
        null,
    );

    // On the next calendar day, another prompt can appear and avoids repeating lastPromptId.
    const second = pickCommunityPrompt(state, {
        routePath: "/music",
        now: day2,
        random: () => 0.01,
    });
    assert.ok(second);
    assert.notEqual(second.promptId, first.promptId);
});

test("100-view milestone prioritizes sponsor prompt except on /patreon", () => {
    const day1 = new Date(2026, 10, 20, 12, 0, 0).getTime();
    const day2 = new Date(2026, 10, 21, 12, 0, 0).getTime();
    const stateAt100 = {
        ...defaultCommunityPromptState(),
        totalViews: 100,
    };

    // Suppressed on /patreon so we never beg on the sponsor page itself.
    const onPatreon = pickCommunityPrompt(stateAt100, {
        routePath: "/patreon",
        now: day1,
        random: () => 0.99,
    });
    assert.equal(onPatreon, null);

    // Deterministic milestone trigger at 100 views even if random roll is high.
    const onCards = pickCommunityPrompt(stateAt100, {
        routePath: "/cards",
        now: day1,
        random: () => 0.99,
    });
    assert.deepEqual(onCards, { promptId: "sponsor-support", milestone: 100 });

    // Marking shown records milestone 100 so 101 views on the next day does not re-trigger it.
    const afterShown = markPromptShown(stateAt100, "sponsor-support", day1);
    assert.ok(afterShown.shownSponsorMilestones.includes(100));
    assert.equal(
        pickCommunityPrompt(
            { ...afterShown, totalViews: 101 },
            { routePath: "/events", now: day2, random: () => 0.99 },
        ),
        null,
    );
});

test("muteAll and permanent dismissal suppress future prompts and can be re-enabled", () => {
    const storage = createMemoryStorage();
    let state = {
        ...defaultCommunityPromptState(),
        totalViews: 100,
    };

    state = applyPromptDismissal(state, "qq-feedback", { permanent: true });
    assert.deepEqual(state.dismissedIds, ["qq-feedback"]);

    state = applyPromptDismissal(state, "sponsor-support", { muteAll: true });
    writeCommunityPromptState(state, storage);
    assert.equal(
        pickCommunityPrompt(readCommunityPromptState(storage), {
            routePath: "/cards",
            now: 1_700_000_000_000,
            random: () => 0,
        }),
        null,
    );

    const unmuted = setCommunityPromptsMuted(false, storage);
    assert.equal(unmuted.mutedAll, false);
    assert.deepEqual(unmuted.dismissedIds, []);
    assert.ok(
        pickCommunityPrompt(unmuted, {
            routePath: "/cards",
            now: 1_700_000_000_000,
            random: () => 0,
        }),
    );
});

test("dismissing random sponsor-support does not suppress future milestones", () => {
    const today = new Date(2026, 10, 20, 12, 0, 0).getTime();
    let state = {
        ...defaultCommunityPromptState(),
        totalViews: 150,
        shownSponsorMilestones: [100],
    };
    state = applyPromptDismissal(state, "sponsor-support", { permanent: true });
    // Random pool should exclude sponsor-support when dismissed (high random roll picks nothing).
    const randomOnly = pickCommunityPrompt(state, { routePath: "/cards", now: today, random: () => 0.99 });
    assert.equal(randomOnly, null);

    // Reaching 200 views still triggers the 200-view milestone.
    const at200 = { ...state, totalViews: 200 };
    assert.deepEqual(
        pickCommunityPrompt(at200, { routePath: "/cards", now: today, random: () => 0.99 }),
        { promptId: "sponsor-support", milestone: 200 },
    );
});

test("legacy sponsors keeps 阳子 without serverSponsor noteKey", () => {
    const yokoEntry = lists.sponsors.members.find((m) =>
        typeof m === "string" ? m === "阳子" : m.name === "阳子",
    );
    assert.equal(yokoEntry, "阳子");
});

test("high-count milestones include 200..10000 and recurring 5000-view steps above 10000", () => {
    assert.deepEqual(getReachedSponsorMilestones(99), []);
    assert.deepEqual(getReachedSponsorMilestones(100), [100]);
    assert.deepEqual(getReachedSponsorMilestones(1000), [100, 200, 300, 500, 800, 1000]);
    assert.deepEqual(
        getReachedSponsorMilestones(20000),
        [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000],
    );

    const yesterday = new Date(2026, 10, 19, 12, 0, 0).getTime();
    const today = new Date(2026, 10, 20, 12, 0, 0).getTime();
    const at1000 = {
        ...defaultCommunityPromptState(),
        totalViews: 1000,
        shownSponsorMilestones: [100, 200, 300, 500, 800],
        lastPromptAt: yesterday,
        lastPromptViewCount: 800,
    };
    assert.deepEqual(
        pickCommunityPrompt(at1000, { routePath: "/cards", now: today, random: () => 0.99 }),
        { promptId: "sponsor-support", milestone: 1000 },
    );

    const at15000 = {
        ...defaultCommunityPromptState(),
        totalViews: 15000,
        shownSponsorMilestones: [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000],
        lastPromptAt: yesterday,
        lastPromptViewCount: 10000,
    };
    assert.deepEqual(
        pickCommunityPrompt(at15000, { routePath: "/events", now: today, random: () => 0.99 }),
        { promptId: "sponsor-support", milestone: 15000 },
    );
});
