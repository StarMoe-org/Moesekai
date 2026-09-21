import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(await readFile(new URL("../src/lib/moly/stageViewport.ts", import.meta.url), "utf8"));
const { stageAspectRatio, rememberStageAspect } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
assert.equal(stageAspectRatio(1280, 720), 16 / 9);
assert.equal(stageAspectRatio(390, 520), 3 / 4);
for (const [width, height] of [[0, 0], [Infinity, 720], [1280, NaN], [-1, 10]]) {
    assert.equal(stageAspectRatio(width, height), 16 / 9);
}

function mockStage(width, height, initial = "", priority = "") {
    const values = new Map(initial ? [["--moly-stage-aspect", [initial, priority]]] : []);
    return {
        style: {
            getPropertyValue: name => values.get(name)?.[0] ?? "",
            getPropertyPriority: name => values.get(name)?.[1] ?? "",
            setProperty: (name, value, important = "") => values.set(name, [value, important]),
            removeProperty: name => values.delete(name),
        },
        querySelector: selector => {
            assert.equal(selector, ".interaction-runtime");
            return { getBoundingClientRect: () => ({ width, height }) };
        },
    };
}
const stage = mockStage(960, 540);
const restore = rememberStageAspect(stage);
assert.equal(Number(stage.style.getPropertyValue("--moly-stage-aspect")), 16 / 9);
restore();
assert.equal(stage.style.getPropertyValue("--moly-stage-aspect"), "");
const styled = mockStage(390, 520, "1.5", "important");
const restoreStyled = rememberStageAspect(styled);
assert.equal(Number(styled.style.getPropertyValue("--moly-stage-aspect")), 3 / 4);
restoreStyled();
assert.equal(styled.style.getPropertyValue("--moly-stage-aspect"), "1.5");
assert.equal(styled.style.getPropertyPriority("--moly-stage-aspect"), "important");

const css = await readFile(new URL("../src/app/mysekai/interactions/workspace.css", import.meta.url), "utf8");
const fitRule = css.match(/\.workspace-stage:is\(\.interaction-immersive,:fullscreen\) \.interaction-runtime \{([^}]+)\}/)?.[1];
assert.ok(fitRule, "web and browser fullscreen share one contain/centering rule");
assert.match(fitRule, /inset:0;margin:auto/);
assert.match(fitRule, /width:min\(100cqw,calc\(100cqh \* var\(--moly-stage-aspect/);
assert.match(fitRule, /height:min\(100cqh,calc\(100cqw \/ var\(--moly-stage-aspect/);
assert.match(css, /\.interaction-stage-surface \{[^}]*container-type:size/);
assert.match(css, /\.interaction-runtime iframe \{[^}]*min-height:0!important/);
const hook = await readFile(new URL("../src/components/mysekai-interactions/useStagePresentation.ts", import.meta.url), "utf8");
assert.ok(hook.indexOf("remember();", hook.indexOf("const browserFullscreen")) < hook.indexOf("await element.requestFullscreen()"), "capture ratio before browser changes its box");
assert.match(hook, /previous\.restoreAspect\(\)/);
assert.doesNotMatch(hook, /appendChild|replaceChildren|createPortal/, "presentation never remounts the live iframe");
console.log("Moly fullscreen keeps the captured aspect and centers one unchanged iframe in both presentation modes.");
