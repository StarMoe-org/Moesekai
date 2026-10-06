#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAllMessages } from "./i18n-utils.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.MD3_SMOKE_URL || "http://127.0.0.1:3016";
const output = await fs.mkdtemp(path.join(os.tmpdir(), "md3-controls-"));
const messages = loadAllMessages();
const browser = await chromium.launch();
const results = [];
try {
    for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
        const t = (key) => key.split(".").reduce((value, part) => value[part], messages[locale]);
        for (const width of [1440, 390]) {
            for (const theme of ["light", "dark"]) {
                const context = await browser.newContext({ viewport: { width, height: 950 }, locale, colorScheme: theme, reducedMotion: "reduce", hasTouch: width < 600 });
                await context.addInitScript(({ locale, theme }) => {
                    localStorage.setItem("moesekai_setup_completed", "true");
                    localStorage.setItem("moesekai_ui_locale", locale);
                    localStorage.setItem("color-scheme-preference", theme);
                    localStorage.setItem("theme-char-id", "21");
                }, { locale, theme });
                await context.route("**/*", (route) => {
                    const url = new URL(route.request().url());
                    return url.origin === new URL(base).origin || ["blob:", "data:"].includes(url.protocol) ? route.continue() : route.abort();
                });
                const page = await context.newPage();
                const errors = [];
                page.on("pageerror", (error) => errors.push(error.message));
                const response = await page.goto(`${base}/${locale.toLowerCase()}/design-system/`, { waitUntil: "domcontentloaded", timeout: 45000 });
                assert.equal(response.status(), 200);
                await page.locator("h1").waitFor();
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('select:not([aria-hidden="true"])').count(), 0);
                const control = page.getByRole("combobox", { name: t("page.designSystem.selectLabel"), exact: true });
                await control.click();
                const list = page.getByRole("listbox");
                await list.waitFor();
                const popupBox = await list.boundingBox();
                assert.ok(popupBox.x >= 0 && popupBox.x + popupBox.width <= width + 1);
                assert.ok(popupBox.y >= 0 && popupBox.y + popupBox.height <= 951);
                assert.ok(await control.evaluate((node) => node === document.activeElement));
                await page.keyboard.press("ArrowDown");
                await page.keyboard.press("Enter");
                await list.waitFor({ state: "hidden" });

                const search = page.getByRole("combobox", { name: t("page.designSystem.selectSearchLabel"), exact: true });
                await search.fill("__no_match_for_test__");
                await page.getByRole("listbox").getByText(t("common.md3.selectNoOptions"), { exact: true }).waitFor();
                await page.keyboard.press("Escape");
                await page.getByRole("listbox").waitFor({ state: "hidden" });

                await page.locator("#settings-button").click();
                let panel = page.getByRole("dialog", { name: t("settings.title"), exact: true });
                await panel.waitFor();
                const expand = panel.getByTitle(t("settings.themeColor.expand"), { exact: true });
                assert.equal(await expand.getAttribute("aria-expanded"), "false");
                const box = await panel.boundingBox();
                if (width >= 1024) {
                    assert.ok(Math.abs(box.width - 480) <= 1, `desktop width ${box.width}`);
                    assert.ok(Math.abs(width - box.x - box.width - 12) <= 1, `right inset ${width - box.x - box.width}`);
                    assert.ok(Math.abs(box.y - 12) <= 1, `top inset ${box.y}`);
                    assert.ok(await panel.evaluate((node) => getComputedStyle(node).boxShadow !== "none"));
                }
                await expand.click();
                await panel.getByTitle(t("settings.themeColor.collapse"), { exact: true }).waitFor();
                await page.keyboard.press("Escape");
                await panel.waitFor({ state: "hidden" });
                await page.locator("#settings-button").click();
                panel = page.getByRole("dialog", { name: t("settings.title"), exact: true });
                await panel.waitFor();
                assert.equal(await panel.getByTitle(t("settings.themeColor.expand"), { exact: true }).getAttribute("aria-expanded"), "false");
                assert.equal(await panel.locator('[role="radiogroup"] svg[data-server-region]').count(), 0, "languages never use flag graphics");
                await page.screenshot({ path: path.join(output, `${locale}-${width}-${theme}-settings.png`), animations: "disabled" });
                await panel.getByRole("tab", { name: t("settings.sections.data"), exact: true }).click();
                const hmt = panel.locator('svg[data-server-region="tw"]');
                await hmt.waitFor();
                assert.equal(await hmt.getAttribute("data-display-region"), "HMT");
                assert.equal(await hmt.locator("[data-hmt-petal]").count(), 5);
                const hmtLabel = panel.getByText("HMT", { exact: true });
                await hmtLabel.waitFor();
                assert.ok(await hmtLabel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "HMT label must not be truncated");
                await page.screenshot({ path: path.join(output, `${locale}-${width}-${theme}-regions.png`), animations: "disabled" });
                await page.keyboard.press("Escape");
                await panel.waitFor({ state: "hidden" });
                if (width >= 1024) {
                    const row = page.locator('aside a[data-nav-index="0"]');
                    assert.ok(Math.abs((await row.boundingBox()).height - 40) <= 1);
                }
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                assert.deepEqual(errors, []);
                results.push({ locale, width, theme, passed: true });
                await context.close();
            }
        }
    }
    console.log(JSON.stringify({ passed: results.length, screenshots: output, results }, null, 2));
} finally { await browser.close(); }
