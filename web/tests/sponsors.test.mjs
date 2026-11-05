import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildSignedAfdianBody, parseAfdianSponsors } from "../src/lib/afdian.ts";
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
