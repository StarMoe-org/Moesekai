#!/usr/bin/env node
/** Production browser smoke test. Playwright is an optional test-only tool:
 * PLAYWRIGHT_MODULE=file:///.../playwright/index.mjs node scripts/smoke-md3-browser.mjs
 * Start the built app first; MD3_SMOKE_URL defaults to http://127.0.0.1:3016.
 * Screenshots go to an OS temporary directory, never into the source tree.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAllMessages } from "./i18n-utils.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.MD3_SMOKE_URL || "http://127.0.0.1:3016";
const output = await fs.mkdtemp(path.join(os.tmpdir(), "md3-browser-smoke-"));
const messages = loadAllMessages()["en-US"];
const text = (key) => key.split(".").reduce((value, part) => value?.[part], messages);
const browser = await chromium.launch({ headless: true });
const results = [];
const routes = ["design-system", "about", "privacy", "prediction-next/planner"];

try {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
        for (const theme of ["light", "dark"]) {
            const context = await browser.newContext({ viewport, locale: "en-US", reducedMotion: "reduce", colorScheme: theme });
            await context.addInitScript(({ theme }) => {
                localStorage.setItem("moesekai_setup_completed", "true");
                localStorage.setItem("color-scheme-preference", theme);
                localStorage.setItem("theme-char-id", "21");
                localStorage.setItem("show-ads", "false");
            }, { theme });
            // Do not send analytics or third-party requests during isolated UI checks.
            await context.route("**/*", (route) => {
                const url = new URL(route.request().url());
                if (url.origin !== new URL(baseUrl).origin && !["data:", "blob:"].includes(url.protocol)) return route.abort();
                return route.continue();
            });
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            for (const route of routes) {
                const response = await page.goto(`${baseUrl}/en-us/${route}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
                assert.equal(response.status(), 200, `${route} should respond successfully`);
                await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
                await page.evaluate(() => document.fonts.ready);
                const state = await page.evaluate(() => ({
                    theme: document.documentElement.dataset.theme,
                    seed: document.documentElement.dataset.seed,
                    legacy: document.documentElement.dataset.legacyGame,
                    width: window.innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    background: getComputedStyle(document.body).backgroundColor,
                    font: getComputedStyle(document.body).fontFamily,
                }));
                assert.equal(state.theme, theme);
                assert.equal(state.seed, "21");
                assert.equal(state.legacy, "false");
                assert.ok(state.scrollWidth <= state.width + 2, `${route} ${name} overflows horizontally (${state.scrollWidth}/${state.width})`);
                assert.match(state.font, /Roboto Flex/);
                assert.notEqual(state.background, "rgba(0, 0, 0, 0)");
                const screenshot = path.join(output, `${name}-${theme}-${route.replaceAll("/", "-")}.png`);
                await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
                results.push({ viewport: name, theme, route, ...state, screenshot });
            }
            await page.goto(`${baseUrl}/en-us/design-system/`, { waitUntil: "domcontentloaded" });
            await page.locator("h1").first().waitFor({ state: "visible" });
            const inverseColor = await page.getByText("inverse-surface", { exact: true }).evaluate((node) => {
                const expected = document.createElement("span");
                expected.style.color = "var(--md-sys-color-inverse-on-surface)";
                document.body.append(expected);
                const colors = { actual: getComputedStyle(node).color, expected: getComputedStyle(expected).color };
                expected.remove();
                return colors;
            });
            assert.equal(inverseColor.actual, inverseColor.expected, "inverse-surface demo uses its own foreground, not on-surface");
            const tokens = await page.evaluate(() => {
                const root = document.documentElement;
                const probe = document.createElement("button");
                probe.className = "shadow-elev-1";
                const disabledProbe = document.createElement("button");
                disabledProbe.className = "md3-disabled";
                document.body.append(probe, disabledProbe);
                const states = [];
                for (let seed = 1; seed <= 26; seed++) {
                    for (const mode of ["light", "dark"]) {
                        root.dataset.seed = String(seed);
                        root.dataset.theme = mode;
                        const style = getComputedStyle(probe);
                        const roles = getComputedStyle(root);
                        states.push({ seed, mode, shadow: style.boxShadow, disabledColor: getComputedStyle(disabledProbe).color, primary: roles.getPropertyValue("--md-sys-color-primary").trim() });
                    }
                }
                root.dataset.seed = "21";
                root.dataset.theme = localStorage.getItem("color-scheme-preference");
                probe.remove();
                disabledProbe.remove();
                return states;
            });
            for (const state of tokens) {
                assert.notEqual(state.shadow, "none", `seed ${state.seed} ${state.mode} elevation should parse`);
                assert.match(state.disabledColor, /rgba\(.+, 0\.38\)/, `seed ${state.seed} ${state.mode} disabled content alpha should parse`);
                assert.match(state.primary, /^#(?:[\da-f]{3}|[\da-f]{6})$/i);
            }
            const dialogLabel = text("page.designSystem.dialogOpen");
            assert.equal(typeof dialogLabel, "string");
            const opener = page.getByRole("button", { name: dialogLabel, exact: true });
            assert.equal(await opener.count(), 1, "catalogue exposes the real dialog opener");
            await opener.click();
            const dialog = page.getByRole("dialog").last();
            await dialog.waitFor({ state: "visible" });
            await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].at(-1)?.contains(document.activeElement));
            assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)), "dialog should own initial focus");
            await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "hidden" });
            assert.deepEqual(errors, [], `${name} ${theme} should not throw uncaught browser errors`);
            await context.close();
        }
    }
    console.log(JSON.stringify({ passed: results.length, tokenChecks: 26 * 2 * 4, screenshots: output, results }, null, 2));
} finally {
    await browser.close();
}
