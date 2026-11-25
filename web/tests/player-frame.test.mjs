import assert from "node:assert/strict";
import test from "node:test";
import {
    PLAYER_FRAME_CELLS,
    PLAYER_FRAME_PART_IDS,
    computePlayerFrameComposition,
    playerFrameAssetPaths,
    playerFrameCellCanvas,
    playerFramePartFileNames,
    playerFramePartId,
    playerFrameSourceFrameId,
} from "../src/lib/player-frame.ts";

/**
 * Sprite sizes read from the asset site. Any change to the layout constants changes these
 * placements, so these tables are the regression guard for the composed geometry of the
 * combination family (frame_0002) and the single family (frame_0001).
 */
const COMBINATION_VERTICAL = {
    frame_base: { width: 132, height: 132 },
    frame_parts1_center: { width: 108, height: 90 },
    frame_parts1_left: { width: 130, height: 352 },
    frame_parts1_right: { width: 130, height: 352 },
    frame_parts2_left: { width: 130, height: 352 },
    frame_parts3_right: { width: 130, height: 352 },
    frame_parts4_left: { width: 226, height: 352 },
    frame_parts5_right: { width: 72, height: 352 },
    frame_parts6_left: { width: 226, height: 352 },
    frame_parts6_right: { width: 72, height: 352 },
};

const COMBINATION_HORIZONTAL = {
    frame_base: { width: 60, height: 60 },
    frame_parts1_bottom: { width: 536, height: 82 },
    frame_parts1_center: { width: 62, height: 36 },
    frame_parts1_top: { width: 536, height: 82 },
    frame_parts2_top: { width: 536, height: 82 },
    frame_parts3_bottom: { width: 536, height: 82 },
    frame_parts4_top: { width: 536, height: 82 },
    frame_parts5_bottom: { width: 536, height: 82 },
    frame_parts6_bottom: { width: 536, height: 82 },
    frame_parts6_top: { width: 536, height: 82 },
};

const SINGLE_VERTICAL = {
    frame_base: { width: 132, height: 132 },
    frame_centertop: { width: 108, height: 90 },
    frame_lefttop: { width: 130, height: 352 },
    frame_righttop: { width: 130, height: 352 },
    frame_leftbottom: { width: 226, height: 352 },
    frame_rightbottom: { width: 72, height: 352 },
};

const SINGLE_HORIZONTAL = {
    frame_base: { width: 60, height: 60 },
    frame_centertop: { width: 62, height: 36 },
    frame_lefttop: { width: 536, height: 82 },
    frame_righttop: { width: 536, height: 82 },
    frame_leftbottom: { width: 536, height: 82 },
    frame_rightbottom: { width: 536, height: 82 },
};

function placementMap(composition) {
    return Object.fromEntries(
        composition.placements.map(item => [item.name, [item.x, item.y, item.width, item.height]]),
    );
}

test("the combination frame composites onto a 372x788 canvas around its 340x748 root", () => {
    const composition = computePlayerFrameComposition("combination", "vertical", COMBINATION_VERTICAL);
    assert.ok(composition);
    assert.deepEqual([composition.width, composition.height], [372, 788]);
    assert.deepEqual([...composition.rootBox], [16, 32, 356, 780]);
    assert.deepEqual([...composition.border], [50, 50, 50, 50]);
    assert.deepEqual(placementMap(composition), {
        frame_parts1_center: [132, 0, 108, 90],
        frame_parts1_left: [0, 0, 130, 352],
        frame_parts1_right: [242, 0, 130, 352],
        frame_parts2_left: [0, 0, 130, 352],
        frame_parts3_right: [242, 0, 130, 352],
        frame_parts4_left: [0, 436, 226, 352],
        frame_parts5_right: [300, 436, 72, 352],
        frame_parts6_left: [0, 436, 226, 352],
        frame_parts6_right: [300, 436, 72, 352],
    });
});

test("the combination frame composites onto a 1558x170 canvas around its 1542x146 root", () => {
    const composition = computePlayerFrameComposition("combination", "horizontal", COMBINATION_HORIZONTAL);
    assert.ok(composition);
    assert.deepEqual([composition.width, composition.height], [1558, 170]);
    assert.deepEqual([...composition.rootBox], [8, 16, 1550, 162]);
    assert.deepEqual([...composition.border], [21, 21, 21, 21]);
    assert.deepEqual(placementMap(composition), {
        frame_parts1_bottom: [0, 88, 536, 82],
        frame_parts1_center: [233, 0, 62, 36],
        frame_parts1_top: [0, 0, 536, 82],
        frame_parts2_top: [0, 0, 536, 82],
        frame_parts3_bottom: [0, 88, 536, 82],
        frame_parts4_top: [1022, 0, 536, 82],
        frame_parts5_bottom: [1022, 88, 536, 82],
        frame_parts6_bottom: [1022, 88, 536, 82],
        frame_parts6_top: [1022, 0, 536, 82],
    });
});

test("the single (per-character) frame uses five ornaments and the same root rect", () => {
    const vertical = computePlayerFrameComposition("single", "vertical", SINGLE_VERTICAL);
    const horizontal = computePlayerFrameComposition("single", "horizontal", SINGLE_HORIZONTAL);
    assert.ok(vertical && horizontal);
    assert.deepEqual([vertical.width, vertical.height], [372, 788]);
    assert.deepEqual([...vertical.rootBox], [16, 32, 356, 780]);
    assert.deepEqual(placementMap(vertical), {
        frame_centertop: [132, 0, 108, 90],
        frame_leftbottom: [0, 436, 226, 352],
        frame_lefttop: [0, 0, 130, 352],
        frame_rightbottom: [300, 436, 72, 352],
        frame_righttop: [242, 0, 130, 352],
    });
    assert.deepEqual([horizontal.width, horizontal.height], [1558, 170]);
    assert.deepEqual([...horizontal.rootBox], [8, 16, 1550, 162]);
    assert.deepEqual(placementMap(horizontal), {
        frame_centertop: [233, 0, 62, 36],
        frame_leftbottom: [0, 88, 536, 82],
        frame_lefttop: [0, 0, 536, 82],
        frame_rightbottom: [1022, 88, 536, 82],
        frame_righttop: [1022, 0, 536, 82],
    });
});

test("only the horizontal centre ornament moves to the friend-list position", () => {
    for (const [kind, sizes, centre] of [
        ["combination", COMBINATION_HORIZONTAL, "frame_parts1_center"],
        ["single", SINGLE_HORIZONTAL, "frame_centertop"],
    ]) {
        const ranking = computePlayerFrameComposition(kind, "horizontal", sizes, "ranking");
        const friend = computePlayerFrameComposition(kind, "horizontal", sizes, "friend");
        assert.ok(ranking && friend, kind);
        const rankingMap = placementMap(ranking);
        const friendMap = placementMap(friend);
        assert.equal(friendMap[centre][0], 58, kind);
        assert.notDeepEqual(friendMap[centre], rankingMap[centre], kind);
        for (const name of Object.keys(rankingMap)) {
            if (name === centre) continue;
            assert.deepEqual(friendMap[name], rankingMap[name], `${kind} ${name}`);
        }
    }
});

test("a missing sprite makes the composition unavailable instead of guessing a size", () => {
    assert.equal(
        computePlayerFrameComposition("combination", "vertical", { ...COMBINATION_VERTICAL, frame_parts4_left: undefined }),
        null,
    );
    assert.equal(
        computePlayerFrameComposition("single", "vertical", { ...SINGLE_VERTICAL, frame_righttop: undefined }),
        null,
    );
});

test("every sprite belongs to a part slot and part 1 owns the base", () => {
    assert.deepEqual(playerFramePartFileNames("combination", "vertical"), [
        "frame_base",
        "frame_parts5_right",
        "frame_parts4_left",
        "frame_parts3_right",
        "frame_parts2_left",
        "frame_parts1_left",
        "frame_parts1_right",
        "frame_parts1_center",
        "frame_parts6_right",
        "frame_parts6_left",
    ]);
    assert.deepEqual(playerFramePartFileNames("single", "horizontal"), [
        "frame_base",
        "frame_lefttop",
        "frame_righttop",
        "frame_leftbottom",
        "frame_rightbottom",
        "frame_centertop",
    ]);
    for (const fileName of playerFramePartFileNames("combination", "horizontal")) {
        assert.ok(PLAYER_FRAME_PART_IDS.includes(playerFramePartId(fileName)), fileName);
    }
    assert.equal(playerFramePartId("frame_base"), 1);
    assert.equal(playerFramePartId("frame_parts6_top"), 6);
});

test("each part slot reads its own per-character sprite set", () => {
    const paths = playerFrameAssetPaths({
        kind: "combination",
        bundle: "frame_0002",
        frameId: 20001,
        characterIdByPart: { 1: 1, 2: 26, 3: 13, 4: 5, 5: 20, 6: 9 },
        orientation: "vertical",
    });
    assert.equal(paths.frame_base, "player_frame/frame_0002/20001/20001/vertical/frame_base.png");
    assert.equal(paths.frame_parts1_center, "player_frame/frame_0002/20001/20001/vertical/frame_parts1_center.png");
    assert.equal(paths.frame_parts2_left, "player_frame/frame_0002/20001/20026/vertical/frame_parts2_left.png");
    assert.equal(paths.frame_parts3_right, "player_frame/frame_0002/20001/20013/vertical/frame_parts3_right.png");
    assert.equal(paths.frame_parts4_left, "player_frame/frame_0002/20001/20005/vertical/frame_parts4_left.png");
    assert.equal(paths.frame_parts5_right, "player_frame/frame_0002/20001/20020/vertical/frame_parts5_right.png");
    assert.equal(paths.frame_parts6_left, "player_frame/frame_0002/20001/20009/vertical/frame_parts6_left.png");
    assert.equal(Object.keys(paths).length, playerFramePartFileNames("combination", "vertical").length);
    assert.equal(playerFrameSourceFrameId(1), 20001);
    assert.equal(playerFrameSourceFrameId(26), 20026);
});

test("a single frame reads its sprites straight from the frame id", () => {
    const paths = playerFrameAssetPaths({
        kind: "single",
        bundle: "frame_0001",
        frameId: 10027,
        orientation: "horizontal",
    });
    assert.equal(paths.frame_base, "player_frame/frame_0001/10027/horizontal/frame_base.png");
    assert.equal(paths.frame_centertop, "player_frame/frame_0001/10027/horizontal/frame_centertop.png");
    assert.equal(Object.keys(paths).length, playerFramePartFileNames("single", "horizontal").length);
});

test("the preview canvas is the client cell, expanded to hold the frame", () => {
    // The portrait card renders into the 368x784 MultiLiveMatchingRoomPlayerCell at scale 2,
    // and the friend row into the 1552x168 FriendListCell padded by 100/80. The composed frame is
    // fitted per axis onto the cell's frame box, so the canvas is the union of cell and frame.
    const vertical = computePlayerFrameComposition("combination", "vertical", COMBINATION_VERTICAL);
    const horizontal = computePlayerFrameComposition("combination", "horizontal", COMBINATION_HORIZONTAL);
    assert.ok(vertical && horizontal);

    const verticalCanvas = playerFrameCellCanvas(vertical, PLAYER_FRAME_CELLS.vertical);
    assert.deepEqual([verticalCanvas.width, verticalCanvas.height], [744, 1576]);
    assert.deepEqual([verticalCanvas.offsetX, verticalCanvas.offsetY], [4, 28]);

    const horizontalCanvas = playerFrameCellCanvas(horizontal, PLAYER_FRAME_CELLS.horizontal);
    assert.deepEqual([horizontalCanvas.width, horizontalCanvas.height], [3304, 496]);
    assert.deepEqual([horizontalCanvas.offsetX, horizontalCanvas.offsetY], [100, 80]);
});

test("every cell box is inside its own cell", () => {
    for (const orientation of ["vertical", "horizontal"]) {
        const cell = PLAYER_FRAME_CELLS[orientation];
        const [cellWidth, cellHeight] = cell.size;
        const boxes = [cell.body, cell.param, cell.levelText, cell.attribute, cell.name, cell.frame, ...cell.honors];
        for (const optional of [cell.card, cell.overlay, cell.masterRank, cell.panel, cell.indexColor, cell.cardVisual, cell.comment, cell.status]) {
            if (optional) boxes.push(optional);
        }
        for (const box of boxes) {
            assert.ok(box[2] > 0 && box[3] > 0, `${orientation} box size`);
            assert.ok(box[0] >= 0 && box[1] >= 0, `${orientation} box origin`);
            assert.ok(
                box[0] + box[2] <= cellWidth + 0.5 && box[1] + box[3] <= cellHeight + 0.5,
                `${orientation} box inside the cell`,
            );
        }
        if (orientation === "vertical") {
            assert.ok(cell.card, "the portrait card draws the art into its own rect");
            assert.ok(cell.panel, "the portrait card has a lower info panel");
            assert.ok(cell.indexColor, "the portrait card has the index colour bar");
            assert.equal(cell.cardVisual, null);
        } else {
            assert.ok(cell.cardVisual, "the friend row uses the S-size card visual");
            assert.equal(cell.card, null);
            assert.equal(cell.indexColor, null);
            assert.equal(cell.honors.length, 3);
        }
    }
});
