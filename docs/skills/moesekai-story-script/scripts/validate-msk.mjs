#!/usr/bin/env node
/**
 * Standalone MoeSekai Script (`.msk`) Validator, Branch/Ending Simulator, and Asset Inspector.
 *
 * Designed for human authors, CI checks, and AI / multimodal agents authoring stories for
 * Moesekai Story Maker (`moesekai-story/2`).
 *
 * Usage:
 *   node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs <file.msk|-> [options]
 *
 * Options:
 *   --simulate            Simulate all reachable choice branches & endings via the runtime VM
 *   --assets              Dump all referenced asset URLs (Live2D, backgrounds, BGM, SE, voices)
 *   --verify-assets       Verify referenced assets & Live2D clips live over HTTPS (requires network)
 *   --strict              Treat compiler warnings (e.g. mergeNodeInheritAmbiguous, portUnwired) as failures
 *   --dump-json           Output machine-readable JSON (includes parsed StoryDocument)
 *   --line <main|backup>  CDN line for asset URLs (default: main -> storage.pjsk.moe)
 *   --region <region>     Override region (jp|cn|tw|kr|en) for asset URL generation
 *   --max-paths <n>       Maximum simulated paths to explore (default: 64)
 *   -h, --help            Print usage help
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

import { ASSET_DOMAIN_BACKUP, ASSET_DOMAIN_MAIN } from "../../../../web/src/lib/assetDomains.ts";
import { live2dSources } from "../../../../web/src/lib/live2dViewer/config.ts";
import { compileStoryGraph } from "../../../../web/src/lib/storyMaker/compiler.ts";
import { advanceRuntime, createInitialRuntime } from "../../../../web/src/lib/storyMaker/runtime.ts";
import { parseStoryScript } from "../../../../web/src/lib/storyMaker/script.ts";
import { STORY_REGIONS } from "../../../../web/src/types/storyMaker.ts";

const HELP_TEXT = `Usage:
  node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs <file.msk|-> [options]

Options:
  --simulate            Simulate all reachable choice branches & endings via the runtime VM
  --assets              Dump all referenced asset URLs (Live2D, backgrounds, BGM, SE, voices)
  --verify-assets       Verify referenced assets & Live2D motion/facial clips live over HTTPS
  --strict              Fail (exit 1) when any compiler warning is emitted
  --dump-json           Emit machine-readable JSON report (includes parsed StoryDocument)
  --line <main|backup>  CDN line for asset URLs (default: main)
  --region <region>     Override document region (jp|cn|tw|kr|en) for asset URLs
  --max-paths <n>       Maximum branches to explore in --simulate (default: 64)
  -h, --help            Show this help message
`;

function parseArgs(argv) {
    const opts = {
        file: null,
        simulate: false,
        assets: false,
        verifyAssets: false,
        strict: false,
        dumpJson: false,
        line: "main",
        regionOverride: null,
        maxPaths: 64,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            opts.help = true;
        } else if (arg === "--simulate") {
            opts.simulate = true;
        } else if (arg === "--assets") {
            opts.assets = true;
        } else if (arg === "--verify-assets") {
            opts.verifyAssets = true;
            opts.assets = true;
        } else if (arg === "--strict") {
            opts.strict = true;
        } else if (arg === "--dump-json") {
            opts.dumpJson = true;
        } else if (arg === "--line") {
            const val = argv[++i];
            if (val !== "main" && val !== "backup") {
                throw new Error(`Invalid --line '${val ?? ""}' (expected 'main' or 'backup')`);
            }
            opts.line = val;
        } else if (arg === "--region") {
            const val = argv[++i];
            if (!STORY_REGIONS.includes(val)) {
                throw new Error(`Invalid --region '${val ?? ""}' (expected one of ${STORY_REGIONS.join(", ")})`);
            }
            opts.regionOverride = val;
        } else if (arg === "--max-paths") {
            const raw = argv[++i];
            const n = Number.parseInt(raw ?? "", 10);
            if (!Number.isInteger(n) || n < 1 || n > 1000) {
                throw new Error(`Invalid --max-paths '${raw ?? ""}' (expected integer 1..1000)`);
            }
            opts.maxPaths = n;
        } else if (arg.startsWith("-") && arg !== "-") {
            throw new Error(`Unknown option '${arg}'`);
        } else if (!opts.file) {
            opts.file = arg;
        } else {
            throw new Error(`Unexpected positional argument '${arg}'`);
        }
    }

    return opts;
}

async function readInput(fileArg) {
    let raw;
    if (fileArg === "-") {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        raw = Buffer.concat(chunks).toString("utf8");
    } else {
        raw = await readFile(fileArg, "utf8");
    }
    return raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
}

// ==================== Asset URL Builders (matching web/src/lib/storyMaker/assets.ts) ====================

function normalizeAssetPath(value) {
    return String(value ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function encodePath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
}

function assetBase(region, line) {
    const domain = line === "backup" ? ASSET_DOMAIN_BACKUP : ASSET_DOMAIN_MAIN;
    return `${domain}/sekai-${region}-assets`;
}

function buildBackgroundUrls(name, region, line) {
    const base = assetBase(region, line);
    const trimmed = normalizeAssetPath(name);
    return {
        webp: `${base}/scenario/background/${trimmed}/${trimmed}.webp`,
        png: `${base}/scenario/background/${trimmed}/${trimmed}.png`,
    };
}

function buildBgmUrl(name, region, line) {
    const base = assetBase(region, line);
    const trimmed = normalizeAssetPath(name);
    if (trimmed.startsWith("mysekai/") || trimmed.startsWith("sound/")) {
        return `${base}/${trimmed}.mp3`;
    }
    if (trimmed.includes("/")) {
        return `${base}/sound/scenario/bgm/${trimmed}.mp3`;
    }
    return `${base}/sound/scenario/bgm/${trimmed}/${trimmed}.mp3`;
}

function buildSeCandidateUrls(name, region, line) {
    const base = assetBase(region, line);
    const trimmed = normalizeAssetPath(name);
    if (!trimmed) return [];
    if (trimmed.startsWith("sound/")) {
        return [`${base}/${trimmed}.mp3`];
    }
    if (trimmed.includes("/")) {
        return [`${base}/sound/scenario/se/${trimmed}.mp3`];
    }
    return [
        `${base}/sound/scenario/se/se_pack00001_b/${trimmed}.mp3`,
        `${base}/sound/scenario/se/se_pack00001/${trimmed}.mp3`,
    ];
}

function buildVoiceCandidateUrls(voice, docRegion, line) {
    const scenarioId = normalizeAssetPath(voice.scenarioId);
    const voiceId = normalizeAssetPath(voice.voiceId);
    if (!scenarioId || !voiceId) return [];

    const effectiveRegion = voice.region ?? docRegion;
    const base = assetBase(effectiveRegion, line);
    const storyUrl = (sc, v) => `${base}/sound/scenario/voice/${sc}/${v}.mp3`;

    let primary;
    switch (voice.kind) {
        case "card":
            primary = `${base}/sound/card_scenario/voice/${scenarioId}/${voiceId}.mp3`;
            break;
        case "area":
            primary = `${base}/sound/actionset/voice/${scenarioId}/${voiceId}.mp3`;
            break;
        case "part":
            primary = `${base}/sound/scenario/part_voice/${scenarioId}/${voiceId}.mp3`;
            break;
        default:
            primary = storyUrl(scenarioId, voiceId);
            break;
    }

    const urls = [primary];
    const add = (url) => {
        if (url && !urls.includes(url)) urls.push(url);
    };

    const isPartVoice = voice.kind === "part" || voiceId.startsWith("partvoice");
    if (isPartVoice) {
        if (voice.kind === "part") {
            const stripped = scenarioId.startsWith("part_voice_")
                ? scenarioId.slice("part_voice_".length)
                : scenarioId;
            if (stripped !== scenarioId) {
                add(`${base}/sound/scenario/part_voice/${stripped}/${voiceId}.mp3`);
            }
            const prefixed = scenarioId.startsWith("part_voice_") ? scenarioId : `part_voice_${scenarioId}`;
            add(storyUrl(prefixed, voiceId));
        } else if (scenarioId.startsWith("part_voice_")) {
            const chara = scenarioId.slice("part_voice_".length);
            if (chara) add(`${base}/sound/scenario/part_voice/${chara}/${voiceId}.mp3`);
        } else {
            add(`${base}/sound/scenario/part_voice/${scenarioId}/${voiceId}.mp3`);
            add(storyUrl(`part_voice_${scenarioId}`, voiceId));
        }
    }

    return urls;
}

function collectAssetReport(doc, region, line) {
    const l2dSources = live2dSources(region);
    const castModelByKey = new Map();
    const live2dMap = new Map();

    for (const member of doc.cast) {
        if (!member.modelId) continue;
        castModelByKey.set(member.key, member.modelId);
        let entry = live2dMap.get(member.modelId);
        if (!entry) {
            entry = {
                modelId: member.modelId,
                castKeys: [],
                modelManifestUrl: `${l2dSources.library}library/live2d/model/${encodePath(member.modelId)}/_ripper.json`,
                motions: new Set(),
                facials: new Set(),
            };
            live2dMap.set(member.modelId, entry);
        }
        entry.castKeys.push(member.key);
    }

    const recordClips = (castKey, motion, facial) => {
        if (!castKey) return;
        const modelId = castModelByKey.get(castKey);
        const entry = modelId ? live2dMap.get(modelId) : undefined;
        if (!entry) return;
        if (motion) entry.motions.add(motion);
        if (facial) entry.facials.add(facial);
    };

    const bgSeen = new Set();
    const backgrounds = [];
    const bgmSeen = new Set();
    const bgm = [];
    const seSeen = new Set();
    const se = [];
    const voiceSeen = new Set();
    const voices = [];

    const recordSe = (name) => {
        if (!name || seSeen.has(name)) return;
        seSeen.add(name);
        se.push({ name, urls: buildSeCandidateUrls(name, region, line) });
    };

    for (const node of Object.values(doc.nodes)) {
        if (node.type !== "scene") continue;
        if (node.background.mode === "set" && node.background.asset && !bgSeen.has(node.background.asset)) {
            bgSeen.add(node.background.asset);
            const urls = buildBackgroundUrls(node.background.asset, region, line);
            backgrounds.push({ name: node.background.asset, webp: urls.webp, png: urls.png });
        }
        if (node.bgm.mode === "play" && node.bgm.name && !bgmSeen.has(node.bgm.name)) {
            bgmSeen.add(node.bgm.name);
            bgm.push({ name: node.bgm.name, url: buildBgmUrl(node.bgm.name, region, line) });
        }
        if (node.stageCast.mode === "set") {
            for (const actor of node.stageCast.actors) {
                recordClips(actor.castKey, actor.motion, actor.facial);
            }
        }
        for (const beat of node.beats) {
            if (beat.kind === "talk") {
                recordClips(beat.speakerKey, beat.motion, beat.facial);
                for (const r of beat.reactions ?? []) {
                    recordClips(r.castKey, r.motion, r.facial);
                }
                if (beat.voice && beat.voice.scenarioId && beat.voice.voiceId) {
                    const effectiveRegion = beat.voice.region ?? region;
                    const key = `${beat.voice.kind}|${effectiveRegion}|${beat.voice.scenarioId}|${beat.voice.voiceId}`;
                    if (!voiceSeen.has(key)) {
                        voiceSeen.add(key);
                        voices.push({
                            ref: beat.voice,
                            urls: buildVoiceCandidateUrls(beat.voice, region, line),
                        });
                    }
                }
                recordSe(beat.se);
            } else if (beat.kind === "narration") {
                recordSe(beat.se);
            } else if (beat.kind === "stageAction") {
                recordClips(beat.castKey, beat.motion, beat.facial);
            } else if (beat.kind === "cue" && beat.cueType === "se") {
                recordSe(beat.se);
            }
        }
    }

    const live2d = [...live2dMap.values()].map(item => ({
        modelId: item.modelId,
        castKeys: item.castKeys,
        modelManifestUrl: item.modelManifestUrl,
        motions: [...item.motions].sort(),
        facials: [...item.facials].sort(),
    }));

    return {
        region,
        line,
        live2dIndexUrl: l2dSources.index,
        live2dLibraryBaseUrl: l2dSources.library,
        live2d,
        backgrounds,
        bgm,
        se,
        voices,
    };
}

// ==================== Live Asset Verifier (--verify-assets) ====================

const ASSET_CHECK_TIMEOUT_MS = 10_000;

async function checkUrlExists(url) {
    let lastResult = { ok: false, status: 0, error: "unknown" };
    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        try {
            const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(ASSET_CHECK_TIMEOUT_MS) });
            if (res.ok) return { ok: true, status: res.status };
            if (res.status === 405 || res.status === 501) {
                const getRes = await fetch(url, {
                    method: "GET",
                    headers: { Range: "bytes=0-0" },
                    signal: AbortSignal.timeout(ASSET_CHECK_TIMEOUT_MS),
                });
                if (getRes.ok) return { ok: true, status: getRes.status };
                lastResult = { ok: false, status: getRes.status };
                if (getRes.status >= 400 && getRes.status < 500) return lastResult;
                continue;
            }
            lastResult = { ok: false, status: res.status };
            if (res.status >= 400 && res.status < 500) return lastResult;
        } catch (err) {
            lastResult = { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
        }
    }
    return lastResult;
}

async function checkAnyCandidate(urls) {
    const tried = [];
    for (const url of urls) {
        const res = await checkUrlExists(url);
        tried.push({ url, ...res });
        if (res.ok) return { ok: true, matchedUrl: url, tried };
    }
    return { ok: false, matchedUrl: null, tried };
}

async function verifyAssetsLive(assetReport) {
    const missing = [];
    const checked = { live2dModels: 0, live2dClips: 0, backgrounds: 0, bgm: 0, se: 0, voices: 0 };

    // 1. Live2D models + motion/facial manifests
    let modelById = new Map();
    if (assetReport.live2d.length > 0) {
        try {
            const res = await fetch(assetReport.live2dIndexUrl);
            if (!res.ok) {
                missing.push({ category: "live2d-index", name: assetReport.live2dIndexUrl, reason: `HTTP ${res.status}` });
            } else {
                const json = await res.json();
                for (const m of json.models ?? []) {
                    if (typeof m?.id === "string") modelById.set(m.id, m);
                }
            }
        } catch (err) {
            missing.push({
                category: "live2d-index",
                name: assetReport.live2dIndexUrl,
                reason: err instanceof Error ? err.message : String(err),
            });
        }

        const ripperCache = new Map();
        const loadMotionBundle = async (bundle) => {
            if (!bundle) return null;
            if (ripperCache.has(bundle)) return ripperCache.get(bundle);
            const url = `${assetReport.live2dLibraryBaseUrl}library/${encodePath(bundle)}/_ripper.json`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    ripperCache.set(bundle, null);
                    return null;
                }
                const data = await res.json();
                const motions = new Set();
                const facials = new Set();
                for (const f of data.files ?? []) {
                    const match = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(String(f?.path ?? ""));
                    if (!match) continue;
                    if (match[1] === "motion") motions.add(match[2]);
                    else facials.add(match[2]);
                }
                const result = { motions, facials, url };
                ripperCache.set(bundle, result);
                return result;
            } catch {
                ripperCache.set(bundle, null);
                return null;
            }
        };

        for (const item of assetReport.live2d) {
            checked.live2dModels += 1;
            const indexed = modelById.get(item.modelId);
            if (!indexed) {
                missing.push({ category: "live2d-model", name: item.modelId, reason: "Not found in models.json" });
                continue;
            }
            if (item.motions.length > 0 || item.facials.length > 0) {
                const bundle = indexed.motion ?? indexed.motions?.[0] ?? null;
                const manifest = await loadMotionBundle(bundle);
                if (!manifest) {
                    missing.push({
                        category: "live2d-motion-bundle",
                        name: `${item.modelId} (${bundle ?? "none"})`,
                        reason: "Motion bundle _ripper.json unavailable",
                    });
                    continue;
                }
                for (const motion of item.motions) {
                    checked.live2dClips += 1;
                    if (!manifest.motions.has(motion)) {
                        missing.push({
                            category: "live2d-motion",
                            name: `${item.modelId}:${motion}`,
                            reason: `Motion not found in ${bundle}`,
                        });
                    }
                }
                for (const facial of item.facials) {
                    checked.live2dClips += 1;
                    if (!manifest.facials.has(facial)) {
                        missing.push({
                            category: "live2d-facial",
                            name: `${item.modelId}:${facial}`,
                            reason: `Facial not found in ${bundle}`,
                        });
                    }
                }
            }
        }
    }

    // 2. Backgrounds
    for (const bg of assetReport.backgrounds) {
        checked.backgrounds += 1;
        const res = await checkUrlExists(bg.webp);
        if (!res.ok) {
            missing.push({ category: "background", name: bg.name, url: bg.webp, reason: `HTTP ${res.status}` });
        }
    }

    // 3. BGM
    for (const track of assetReport.bgm) {
        checked.bgm += 1;
        const res = await checkUrlExists(track.url);
        if (!res.ok) {
            missing.push({ category: "bgm", name: track.name, url: track.url, reason: `HTTP ${res.status}` });
        }
    }

    // 4. SE
    for (const clip of assetReport.se) {
        checked.se += 1;
        const res = await checkAnyCandidate(clip.urls);
        if (!res.ok) {
            missing.push({ category: "se", name: clip.name, urls: clip.urls, reason: "All candidate URLs failed" });
        }
    }

    // 5. Voices
    for (const clip of assetReport.voices) {
        checked.voices += 1;
        const res = await checkAnyCandidate(clip.urls);
        if (!res.ok) {
            missing.push({
                category: "voice",
                name: `${clip.ref.kind}:${clip.ref.scenarioId}:${clip.ref.voiceId}`,
                urls: clip.urls,
                reason: "All candidate URLs failed",
            });
        }
    }

    return { ok: missing.length === 0, checked, missing };
}

// ==================== Exhaustive Branch & Ending Simulator (--simulate) ====================

function simulateAllBranches(program, maxPaths) {
    const MAX_BLOCKING_STEPS_PER_PATH = 1000;
    const declaredEndings = Object.values(program.doc.nodes)
        .filter(n => n.type === "end")
        .map(n => n.id);

    const paths = [];
    const reachedEndingsSet = new Set();
    const offStageTalkMap = new Map();
    let truncated = false;

    const recordOffStageIfNeeded = (frame) => {
        if (frame.stoppedReason !== "blocking" || !frame.nodeId || !frame.beatId) return;
        const inst = program.instructions[frame.pc];
        if (inst?.op === "talk" && inst.beat.speakerKey && frame.stage.speaking === null) {
            const key = `${frame.nodeId}:${frame.beatId}:${inst.beat.speakerKey}`;
            if (!offStageTalkMap.has(key)) {
                offStageTalkMap.set(key, {
                    nodeId: frame.nodeId,
                    beatId: frame.beatId,
                    speakerKey: inst.beat.speakerKey,
                });
            }
        }
    };

    const initial = createInitialRuntime(program);
    const queue = [{
        frame: initial,
        choices: [],
        beatCount: initial.stoppedReason === "blocking" ? 1 : 0,
        seenChoiceStates: new Set(),
    }];

    while (queue.length > 0) {
        if (paths.length >= maxPaths) {
            truncated = true;
            break;
        }
        const entry = queue.shift();
        let cur = entry.frame;
        let beatCount = entry.beatCount;
        let stepsInSegment = 0;

        recordOffStageIfNeeded(cur);

        while (cur.stoppedReason === "blocking") {
            if (stepsInSegment >= MAX_BLOCKING_STEPS_PER_PATH) {
                paths.push({
                    index: paths.length + 1,
                    outcome: "step-limit",
                    choices: entry.choices,
                    ending: null,
                    finalNodeId: cur.nodeId,
                    variables: cur.variables,
                    beatCount,
                    visitedNodeIds: cur.visitedNodeIds,
                });
                cur = null;
                break;
            }
            cur = advanceRuntime(program, cur);
            stepsInSegment += 1;
            if (cur.stoppedReason === "blocking") {
                beatCount += 1;
                recordOffStageIfNeeded(cur);
            }
        }

        if (!cur) continue;

        if (cur.stoppedReason === "choice" && cur.pendingChoice) {
            const available = cur.pendingChoice.options.filter(o => o.available);
            if (available.length === 0) {
                paths.push({
                    index: paths.length + 1,
                    outcome: "deadlock",
                    choices: entry.choices,
                    ending: null,
                    finalNodeId: cur.nodeId,
                    variables: cur.variables,
                    beatCount,
                    visitedNodeIds: cur.visitedNodeIds,
                });
                continue;
            }

            const varSig = JSON.stringify(cur.variables);
            for (const opt of available) {
                const stateKey = `${cur.nodeId}\0${opt.id}\0${varSig}`;
                const nextChoices = [...entry.choices, { nodeId: cur.nodeId, optionId: opt.id, text: opt.text }];
                if (entry.seenChoiceStates.has(stateKey)) {
                    paths.push({
                        index: paths.length + 1,
                        outcome: "choice-cycle",
                        choices: nextChoices,
                        ending: null,
                        finalNodeId: cur.nodeId,
                        variables: cur.variables,
                        beatCount,
                        visitedNodeIds: cur.visitedNodeIds,
                    });
                    continue;
                }
                const nextSeen = new Set(entry.seenChoiceStates);
                nextSeen.add(stateKey);
                const nextFrame = advanceRuntime(program, cur, opt.id);
                queue.push({
                    frame: nextFrame,
                    choices: nextChoices,
                    beatCount: beatCount + (nextFrame.stoppedReason === "blocking" ? 1 : 0),
                    seenChoiceStates: nextSeen,
                });
            }
            continue;
        }

        if (cur.stoppedReason === "end" && cur.ending) {
            reachedEndingsSet.add(cur.ending.nodeId);
        }

        paths.push({
            index: paths.length + 1,
            outcome: cur.stoppedReason,
            choices: entry.choices,
            ending: cur.ending,
            finalNodeId: cur.nodeId,
            variables: cur.variables,
            beatCount,
            visitedNodeIds: cur.visitedNodeIds,
        });
    }

    const reachedEndings = [...reachedEndingsSet];
    const unreachedEndings = declaredEndings.filter(id => !reachedEndingsSet.has(id));
    const disconnectedPaths = paths.filter(p => p.outcome === "disconnected").length;
    const loopPaths = paths.filter(p => p.outcome === "loop" || p.outcome === "step-limit").length;
    const deadlockPaths = paths.filter(p => p.outcome === "deadlock").length;

    return {
        totalPaths: paths.length,
        truncated,
        declaredEndings,
        reachedEndings,
        unreachedEndings,
        disconnectedPaths,
        loopPaths,
        deadlockPaths,
        offStageTalks: [...offStageTalkMap.values()],
        paths,
    };
}

// ==================== Human-Readable Formatting ====================

function formatDiagnostic(d) {
    const loc = d.nodeId ? (d.beatId ? `${d.nodeId}/${d.beatId}` : d.nodeId) : d.path;
    const params = d.params && Object.keys(d.params).length > 0
        ? ` ${JSON.stringify(d.params)}`
        : "";
    return `  [${d.severity.toUpperCase()}] ${d.code} @ ${loc} (${d.path})${params}`;
}

function summarizeDoc(doc, program) {
    const nodes = Object.values(doc.nodes);
    const byType = { start: 0, scene: 0, choice: 0, condition: 0, end: 0 };
    let totalBeats = 0;
    for (const n of nodes) {
        if (n.type in byType) byType[n.type] += 1;
        if (n.type === "scene") totalBeats += n.beats.length;
    }
    return {
        id: doc.id,
        title: doc.meta.title,
        region: doc.region,
        schema: doc.schema,
        castCount: doc.cast.length,
        variableCount: doc.variables.length,
        nodeCount: nodes.length,
        nodesByType: byType,
        edgeCount: doc.edges.length,
        beatCount: totalBeats,
        reachableNodeCount: program.reachableNodeIds.length,
        endingCount: program.endingNodeIds.length,
    };
}

function printHumanReport(report, strictMode = false) {
    const headerStatus = report.parseDiagnostics.length > 0
        ? "PARSE FAILED"
        : report.errors.length > 0
            ? "COMPILE FAILED"
            : report.assetVerification && !report.assetVerification.ok
                ? "ASSETS MISSING"
                : report.warnings.length > 0
                    ? (strictMode ? "FAILED (--strict warnings)" : "OK (with warnings)")
                    : "OK";

    console.log(`=== MoeSekai Script Validation: ${report.file} ===`);
    console.log(`Status: ${headerStatus}`);

    if (report.parseDiagnostics.length > 0) {
        console.log(`\nParse Errors (${report.parseDiagnostics.length}):`);
        for (const d of report.parseDiagnostics) {
            console.log(`  Line ${d.line}:${d.col} - ${d.message}`);
        }
        return;
    }

    const s = report.summary;
    console.log(
        `Story: "${s.title}" (id=${s.id}, region=${s.region}) | `
        + `cast=${s.castCount}, vars=${s.variableCount}, nodes=${s.nodeCount} `
        + `(scene=${s.nodesByType.scene}, choice=${s.nodesByType.choice}, cond=${s.nodesByType.condition}, end=${s.nodesByType.end}), `
        + `edges=${s.edgeCount}, beats=${s.beatCount}`,
    );

    if (report.errors.length > 0) {
        console.log(`\nCompiler Errors (${report.errors.length}):`);
        for (const e of report.errors) console.log(formatDiagnostic(e));
    }

    if (report.warnings.length > 0) {
        console.log(`\nCompiler Warnings (${report.warnings.length}):`);
        for (const w of report.warnings) console.log(formatDiagnostic(w));
    }

    if (report.errors.length === 0 && report.warnings.length === 0) {
        console.log("Diagnostics: 0 errors, 0 warnings.");
    }

    if (report.simulation) {
        const sim = report.simulation;
        console.log(`\n=== Branch & Ending Simulation (${sim.totalPaths} path(s)${sim.truncated ? ", TRUNCATED" : ""}) ===`);
        console.log(`Endings reached: ${sim.reachedEndings.length}/${sim.declaredEndings.length} (${sim.reachedEndings.join(", ") || "none"})`);
        if (sim.unreachedEndings.length > 0) {
            console.log(`Unreached endings: ${sim.unreachedEndings.join(", ")}`);
        }
        if (sim.disconnectedPaths > 0 || sim.loopPaths > 0 || sim.deadlockPaths > 0) {
            console.log(`Anomalies: disconnected=${sim.disconnectedPaths}, loop=${sim.loopPaths}, deadlock=${sim.deadlockPaths}`);
        }
        for (const p of sim.paths) {
            const choiceDesc = p.choices.length > 0
                ? p.choices.map(c => `${c.nodeId}.${c.optionId}`).join(" -> ")
                : "(linear)";
            const outcomeDesc = p.outcome === "end" && p.ending
                ? `END ${p.ending.nodeId} "${p.ending.title}"${p.ending.subtitle ? ` — ${p.ending.subtitle}` : ""}`
                : `${p.outcome.toUpperCase()} @ ${p.finalNodeId ?? "?"}`;
            console.log(`  #${p.index} [${p.beatCount} beats] ${choiceDesc} => ${outcomeDesc} | vars=${JSON.stringify(p.variables)}`);
        }
        if (sim.offStageTalks.length > 0) {
            console.log(`Off-stage speakers (${sim.offStageTalks.length} beat(s) where speakerKey is not mounted on stage):`);
            for (const item of sim.offStageTalks) {
                console.log(`  - ${item.nodeId}/${item.beatId}: speakerKey="${item.speakerKey}"`);
            }
        }
    }

    if (report.assets) {
        const a = report.assets;
        console.log(`\n=== Referenced Assets (region=${a.region}, line=${a.line}) ===`);
        console.log(`Live2D index: ${a.live2dIndexUrl}`);
        console.log(`Live2D models (${a.live2d.length}):`);
        for (const m of a.live2d) {
            console.log(`  - ${m.modelId} (cast: ${m.castKeys.join(", ")})`);
            console.log(`    manifest: ${m.modelManifestUrl}`);
            if (m.motions.length > 0) console.log(`    motions:  ${m.motions.join(", ")}`);
            if (m.facials.length > 0) console.log(`    facials:  ${m.facials.join(", ")}`);
        }
        console.log(`Backgrounds (${a.backgrounds.length}):`);
        for (const bg of a.backgrounds) {
            console.log(`  - ${bg.name}: ${bg.webp}`);
            console.log(`    lossless: ${bg.png}`);
        }
        console.log(`BGM (${a.bgm.length}):`);
        for (const track of a.bgm) {
            console.log(`  - ${track.name}: ${track.url}`);
        }
        console.log(`SE (${a.se.length}):`);
        for (const clip of a.se) {
            console.log(`  - ${clip.name}: ${clip.urls.join(" | ")}`);
        }
        console.log(`Voices (${a.voices.length}):`);
        for (const v of a.voices) {
            const trim = v.ref.start !== undefined || v.ref.end !== undefined
                ? `[${v.ref.start ?? ""}..${v.ref.end ?? ""}]`
                : "";
            console.log(`  - ${v.ref.kind}:${v.ref.scenarioId}:${v.ref.voiceId}${trim}: ${v.urls.join(" | ")}`);
        }
    }

    if (report.assetVerification) {
        const v = report.assetVerification;
        console.log(`\n=== Live Asset Verification (${v.ok ? "ALL OK" : `${v.missing.length} MISSING`}) ===`);
        console.log(`Checked: ${JSON.stringify(v.checked)}`);
        for (const m of v.missing) {
            console.log(`  [MISSING] (${m.category}) ${m.name} — ${m.reason}`);
        }
    }
}

// ==================== Main ====================

async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        console.error(HELP_TEXT);
        process.exit(2);
    }

    if (opts.help || !opts.file) {
        console.log(HELP_TEXT);
        process.exit(opts.help ? 0 : 2);
    }

    let source;
    try {
        source = await readInput(opts.file);
    } catch (err) {
        console.error(`Error reading '${opts.file}': ${err instanceof Error ? err.message : String(err)}`);
        process.exit(2);
    }

    const parsed = parseStoryScript(source);
    if (!parsed.ok) {
        const report = {
            file: opts.file,
            ok: false,
            strictOk: false,
            parseDiagnostics: parsed.diagnostics,
            summary: null,
            errors: [],
            warnings: [],
        };
        if (opts.dumpJson) console.log(JSON.stringify(report, null, 2));
        else printHumanReport(report);
        process.exit(1);
    }

    const doc = parsed.doc;
    const program = compileStoryGraph(doc);
    const effectiveRegion = opts.regionOverride ?? doc.region;

    const simulation = opts.simulate && program.ok
        ? simulateAllBranches(program, opts.maxPaths)
        : opts.simulate
            ? { skipped: true, reason: "Compilation errors prevented simulation" }
            : undefined;

    const assets = opts.assets
        ? collectAssetReport(doc, effectiveRegion, opts.line)
        : undefined;

    const assetVerification = opts.verifyAssets && assets
        ? await verifyAssetsLive(assets)
        : undefined;

    const ok = program.ok && (assetVerification ? assetVerification.ok : true);
    const strictOk = ok && program.warnings.length === 0;

    const report = {
        file: opts.file,
        ok,
        strictOk,
        parseDiagnostics: [],
        summary: summarizeDoc(doc, program),
        errors: program.errors,
        warnings: program.warnings,
        ...(simulation !== undefined ? { simulation } : {}),
        ...(assets !== undefined ? { assets } : {}),
        ...(assetVerification !== undefined ? { assetVerification } : {}),
        ...(opts.dumpJson ? { doc } : {}),
    };

    if (opts.dumpJson) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printHumanReport(report, opts.strict);
    }

    const exitOk = opts.strict ? strictOk : ok;
    process.exit(exitOk ? 0 : 1);
}

main();
