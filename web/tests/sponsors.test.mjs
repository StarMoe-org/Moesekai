import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSignedAfdianBody, fetchAfdianSponsors, parseAfdianSponsors } from "../src/lib/afdian.ts";
import { isCollectableKofiEvent, parseKofiWebhookEvent, readKofiSupporters, recordKofiEvent, verifyKofiToken } from "../src/lib/kofi.ts";
import { mergeSponsors } from "../src/lib/sponsors.ts";
import lists from "../src/data/community-lists.json" with { type: "json" };

test("afdian request signing follows md5(token + kv) convention", () => {
    const body = buildSignedAfdianBody("user123", "tok-abc", { page: 1, per_page: 100 }, 1700000000);
    const expected = createHash("md5")
        .update('tok-abcparams{"page":1,"per_page":100}ts1700000000user_iduser123')
        .digest("hex");
    assert.equal(body.sign, expected);
    assert.equal(body.user_id, "user123");
    assert.equal(body.ts, 1700000000);
    assert.equal(body.params, '{"page":1,"per_page":100}');
});

test("parseAfdianSponsors keeps only display fields and drops nameless entries", () => {
    const parsed = parseAfdianSponsors({
        ec: 200,
        data: {
            total_count: 3,
            total_page: 1,
            list: [
                {
                    all_sum_amount: "66.00",
                    last_pay_time: 1700000000,
                    current_plan: { name: "月度支持" },
                    user: { user_id: "u1", name: " Sponsor A ", avatar: "https://pic1.afdiancdn.com/a.png", secret: "nope" },
                    address_phone: "should-not-leak",
                },
                { all_sum_amount: "5.00", user: { user_id: "u2", name: "", avatar: "" } },
                "junk",
                { all_sum_amount: "10.00", last_pay_time: 1690000000, current_plan: { name: "" }, user: { name: "Sponsor B" } },
            ],
        },
    });
    assert.equal(parsed.total, 3);
    assert.equal(parsed.sponsors.length, 2);
    assert.deepEqual(parsed.sponsors[0], {
        name: "Sponsor A",
        avatar: "https://pic1.afdiancdn.com/a.png",
        amount: "66.00",
        lastPayTime: 1700000000,
        plan: "月度支持",
    });
    assert.deepEqual(parsed.sponsors[1], { name: "Sponsor B", avatar: "", amount: "10.00", lastPayTime: 1690000000, plan: "" });
    assert.equal(JSON.stringify(parsed).includes("should-not-leak"), false);
    assert.equal(JSON.stringify(parsed).includes("nope"), false);
});

test("parseAfdianSponsors tolerates malformed payloads", () => {
    assert.deepEqual(parseAfdianSponsors(null), { total: 0, totalPage: 1, sponsors: [] });
    assert.deepEqual(parseAfdianSponsors({ data: { list: "nope" } }), { total: 0, totalPage: 1, sponsors: [] });
});

test("kofi token verification is strict and constant-shape", () => {
    assert.equal(verifyKofiToken("token-123", "token-123"), true);
    assert.equal(verifyKofiToken("token-124", "token-123"), false);
    assert.equal(verifyKofiToken("short", "token-123"), false);
    assert.equal(verifyKofiToken("", "token-123"), false);
    assert.equal(verifyKofiToken(undefined, "token-123"), false);
    assert.equal(verifyKofiToken("token-123", ""), false);
});

test("parseKofiWebhookEvent extracts display fields and rejects nameless payloads", () => {
    const event = parseKofiWebhookEvent({
        verification_token: "tok",
        type: "Donation",
        from_name: "  Kofi Fan  ",
        amount: "6.00",
        currency: "USD",
        timestamp: "2024-01-01T00:00:00Z",
        is_public: true,
        kofi_transaction_id: "tx-1",
        email: "private@example.com",
        message: "should not be needed",
    });
    assert.deepEqual(event, {
        type: "Donation",
        fromName: "Kofi Fan",
        amount: "6.00",
        currency: "USD",
        timestampSeconds: 1704067200,
        isPublic: true,
        transactionId: "tx-1",
    });
    // message_id is the fallback transaction id; is_public defaults to public.
    const fallback = parseKofiWebhookEvent({ type: "Subscription", from_name: "Sub", message_id: "msg-9" });
    assert.equal(fallback.transactionId, "msg-9");
    assert.equal(fallback.isPublic, true);
    assert.equal(parseKofiWebhookEvent({ type: "Donation", from_name: "   " }), null);
    assert.equal(parseKofiWebhookEvent(null), null);
    assert.equal(parseKofiWebhookEvent("junk"), null);
});

test("only public Donation/Subscription kofi events are collectable", () => {
    const base = { fromName: "Fan", amount: "3.00", currency: "USD", timestampSeconds: 1704067200, transactionId: "tx" };
    assert.equal(isCollectableKofiEvent({ ...base, type: "Donation", isPublic: true }), true);
    assert.equal(isCollectableKofiEvent({ ...base, type: "Subscription", isPublic: true }), true);
    assert.equal(isCollectableKofiEvent({ ...base, type: "Donation", isPublic: false }), false);
    assert.equal(isCollectableKofiEvent({ ...base, type: "Shop Order", isPublic: true }), false);
    assert.equal(isCollectableKofiEvent({ ...base, type: "Commission", isPublic: true }), false);
});

test("recordKofiEvent aggregates per supporter and dedupes by transaction", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kofi-sponsors-"));
    const file = path.join(dir, "nested", "kofi-supporters.json");
    try {
        const donation = {
            type: "Donation",
            fromName: "Alice",
            amount: "5.00",
            currency: "USD",
            timestampSeconds: 1704067200,
            isPublic: true,
            transactionId: "tx-1",
        };
        assert.equal(await recordKofiEvent(donation, file), true);
        // Same transaction pushed twice (Ko-fi retries) must not double-count.
        assert.equal(await recordKofiEvent(donation, file), false);
        // Same supporter (case-insensitive) with a new payment aggregates.
        assert.equal(await recordKofiEvent({ ...donation, fromName: "alice", amount: "7.50", transactionId: "tx-2", timestampSeconds: 1704153600 }, file), true);
        // Private donations and shop orders never reach the wall.
        assert.equal(await recordKofiEvent({ ...donation, fromName: "Secret", isPublic: false, transactionId: "tx-3" }, file), false);
        assert.equal(await recordKofiEvent({ ...donation, type: "Shop Order", transactionId: "tx-4" }, file), false);

        const supporters = await readKofiSupporters(file);
        assert.equal(supporters.length, 1);
        assert.deepEqual(supporters[0], {
            name: "Alice",
            amount: "12.50",
            currency: "USD",
            lastPayTime: 1704153600,
            payments: 2,
            transactionIds: ["tx-1", "tx-2"],
        });
        // Missing file reads as an empty list instead of throwing.
        assert.deepEqual(await readKofiSupporters(path.join(dir, "missing.json")), []);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("mergeSponsors tags sources and stays configured when either side has data", () => {
    const kofiOnly = mergeSponsors(
        { configured: false, sponsors: [], total: 0 },
        [{ name: "Kofi Fan", amount: "6.00", currency: "USD", lastPayTime: 1704067200, payments: 1, transactionIds: ["tx-1"] }],
        false,
    );
    assert.equal(kofiOnly.configured, true);
    assert.equal(kofiOnly.total, 1);
    assert.equal(kofiOnly.sponsors[0].source, "kofi");
    assert.equal(kofiOnly.sources.kofi.count, 1);

    const both = mergeSponsors(
        { configured: true, sponsors: [{ name: "Afdian Fan", avatar: "https://pic1.afdiancdn.com/a.png", amount: "66.00", lastPayTime: 1704067200, plan: "Monthly" }], total: 1 },
        [{ name: "Kofi Fan", amount: "6.00", currency: "USD", lastPayTime: 1704067200, payments: 1, transactionIds: ["tx-1"] }],
        true,
    );
    assert.deepEqual(both.sponsors.map((s) => s.source), ["afdian", "kofi"]);
    assert.equal(both.sponsors[0].plan, "Monthly");
    assert.equal(both.total, 2);

    const failed = mergeSponsors({ configured: true, sponsors: [], total: 0, error: "boom" }, [], false);
    assert.equal(failed.error, "boom");
    assert.equal(mergeSponsors({ configured: false, sponsors: [], total: 0 }, [], false).configured, false);
});

test("community lists keep the union of every locale's names without duplicates", () => {
    const sponsorNames = lists.sponsors.members.map((m) => (typeof m === "string" ? m : m.name));
    // Names that only existed in some locales must survive the migration.
    for (const name of ["阳子", "cike", "晓月", "雪莹ちゃん", "Conrad", "意路二夢", "maveriki"]) {
        assert.ok(sponsorNames.includes(name), `legacy sponsors missing ${name}`);
    }
    assert.equal(new Set(sponsorNames).size, sponsorNames.length, "duplicate legacy sponsors");
    assert.equal(lists.sponsors.anonymousCount, 4);

    const thanks = lists.specialThanks;
    for (const name of ["深海", "晓月", "性价比", "偶像大师希罗酱"]) {
        assert.ok(thanks.includes(name), `special thanks missing ${name}`);
    }
    assert.equal(new Set(thanks).size, thanks.length, "duplicate special thanks");

    for (const group of ["translation", "art", "guide"]) {
        assert.ok(Array.isArray(lists.teams[group]) && lists.teams[group].length > 0, `team ${group} empty`);
    }
    assert.ok(lists.teams.guide.includes("@阿木"));
});

function stubAfdianEnv() {
    const prevFetch = globalThis.fetch;
    const prevUser = process.env.AFDIAN_USER_ID;
    const prevToken = process.env.AFDIAN_API_TOKEN;
    process.env.AFDIAN_USER_ID = "user123";
    process.env.AFDIAN_API_TOKEN = "tok-abc";
    return () => {
        globalThis.fetch = prevFetch;
        if (prevUser === undefined) delete process.env.AFDIAN_USER_ID;
        else process.env.AFDIAN_USER_ID = prevUser;
        if (prevToken === undefined) delete process.env.AFDIAN_API_TOKEN;
        else process.env.AFDIAN_API_TOKEN = prevToken;
    };
}

test("fetchAfdianSponsors treats HTTP 404 (no sponsors yet) as an empty list", async () => {
    const restore = stubAfdianEnv();
    globalThis.fetch = async () => ({ status: 404, ok: false, json: async () => ({}) });
    try {
        const result = await fetchAfdianSponsors();
        assert.deepEqual(result, { configured: true, sponsors: [], total: 0 });
    } finally {
        restore();
    }
});

test("fetchAfdianSponsors treats a zero-count payload as an empty list", async () => {
    const restore = stubAfdianEnv();
    globalThis.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ec: 200, data: { total_count: 0, total_page: 1, list: [] } }),
    });
    try {
        const result = await fetchAfdianSponsors();
        assert.deepEqual(result, { configured: true, sponsors: [], total: 0 });
    } finally {
        restore();
    }
});

test("fetchAfdianSponsors treats a nonzero-ec payload with zero count as empty", async () => {
    const restore = stubAfdianEnv();
    globalThis.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ec: 400, data: { total_count: 0 } }),
    });
    try {
        const result = await fetchAfdianSponsors();
        assert.deepEqual(result, { configured: true, sponsors: [], total: 0 });
    } finally {
        restore();
    }
});

test("fetchAfdianSponsors reports an error on HTTP 500 instead of an empty list", async () => {
    const restore = stubAfdianEnv();
    globalThis.fetch = async () => ({ status: 500, ok: false, json: async () => ({}) });
    try {
        const result = await fetchAfdianSponsors();
        assert.equal(result.configured, true);
        assert.deepEqual(result.sponsors, []);
        assert.equal(result.total, 0);
        assert.match(result.error ?? "", /HTTP 500/);
    } finally {
        restore();
    }
});
