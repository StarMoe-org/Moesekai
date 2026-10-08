let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * Pass 2 on a canvas: draws frames of a parameter table as they are handed over.
     */
    class FrameRenderer {
        static __wrap(ptr) {
            const obj = Object.create(FrameRenderer.prototype);
            obj.__wbg_ptr = ptr;
            FrameRendererFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            FrameRendererFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_framerenderer_free(ptr, 0);
        }
        /**
         * The answer whose button is at (`x`, `y`) (canvas pixels) in the choice dialog of a
         * frame (the JSON of a `FrameState`), or −1.
         * @param {string} frame
         * @param {number} x
         * @param {number} y
         * @returns {number}
         */
        choiceAt(frame, x, y) {
            const ptr0 = passStringToWasm0(frame, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.framerenderer_choiceAt(this.__wbg_ptr, ptr0, len0, x, y);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return ret[0];
        }
        /**
         * `canvas` is an `HTMLCanvasElement` or an `OffscreenCanvas` of `width` × `height`
         * pixels. `library` is the library's root, `assets` the asset-source mirror's root and
         * `ui_kit` the UI kit's directory in the file table; `selector`'s episode index says which
         * files come from the asset source (empty: none). `models` is the parameter table's model
         * list and `game` the client the kit is from (`cn` or `jp`).
         *
         * `body_fonts` and `name_fonts` replace the client's fonts for the words and the names:
         * each a list of `{path, weight?}` in the file table, the font first and the fonts that
         * fill in the characters it lacks after it. Left out, the kit's fonts are used.
         * @param {any} canvas
         * @param {string} library
         * @param {string} assets
         * @param {string} selector
         * @param {string} ui_kit
         * @param {string} game
         * @param {string[]} models
         * @param {number} fps
         * @param {number} width
         * @param {number} height
         * @param {any} body_fonts
         * @param {any} name_fonts
         * @returns {Promise<FrameRenderer>}
         */
        static create(canvas, library, assets, selector, ui_kit, game, models, fps, width, height, body_fonts, name_fonts) {
            const ptr0 = passStringToWasm0(library, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(assets, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(selector, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(ui_kit, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(game, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len4 = WASM_VECTOR_LEN;
            const ptr5 = passArrayJsValueToWasm0(models, wasm.__wbindgen_malloc);
            const len5 = WASM_VECTOR_LEN;
            const ret = wasm.framerenderer_create(canvas, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, fps, width, height, body_fonts, name_fonts);
            return ret;
        }
        /**
         * The library image at `path` is on the GPU (it is dropped after a while unused).
         * @param {string} path
         * @returns {boolean}
         */
        hasImage(path) {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.framerenderer_hasImage(this.__wbg_ptr, ptr0, len0);
            return ret !== 0;
        }
        /**
         * Draws one frame, given as the JSON of a `FrameState`.
         * @param {string} frame
         */
        present(frame) {
            const ptr0 = passStringToWasm0(frame, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.framerenderer_present(this.__wbg_ptr, ptr0, len0);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * Takes the pixels of the library image at `path` (`width` × `height` RGBA, not
         * premultiplied), decoded by the browser; drawn instead of the PNG.
         * @param {string} path
         * @param {number} width
         * @param {number} height
         * @param {Uint8Array} rgba
         */
        putImage(path, width, height, rgba) {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.framerenderer_putImage(this.__wbg_ptr, ptr0, len0, width, height, ptr1, len1);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * Takes the parameter table's model list as it grows while Pass 1 runs.
         * @param {string[]} models
         */
        setModels(models) {
            const ptr0 = passArrayJsValueToWasm0(models, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.framerenderer_setModels(this.__wbg_ptr, ptr0, len0);
        }
    }
    if (Symbol.dispose) FrameRenderer.prototype[Symbol.dispose] = FrameRenderer.prototype.free;
    exports.FrameRenderer = FrameRenderer;

    /**
     * One episode played live (ADR-0031): the scheduler and Pass 1 stepped a frame at a time,
     * and the mix of the cues baked so far. The files it reads must be in the file table by the
     * time it needs them; a step or mix that finds one missing fails and can be retried.
     */
    class Session {
        static __wrap(ptr) {
            const obj = Object.create(Session.prototype);
            obj.__wbg_ptr = ptr;
            SessionFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            SessionFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_session_free(ptr, 0);
        }
        /**
         * The player picked answer `index` of the open choice dialog; applies to the next frame
         * stepped.
         * @param {number} index
         */
        answer(index) {
            wasm.session_answer(this.__wbg_ptr, index);
        }
        /**
         * The audio each instruction plays, for loading it ahead of playback: JSON of
         * `[[position, [file table paths]], …]`, positions in instruction order (see
         * [`Session::next_instruction`]); position 0 also holds the initial BGM. A library BGM's
         * ACB comes with its waveforms (Pass 1 reads it; sound effects play without theirs).
         * @returns {string}
         */
        audioPlan() {
            let deferred1_0;
            let deferred1_1;
            try {
                const ret = wasm.session_audioPlan(this.__wbg_ptr);
                deferred1_0 = ret[0];
                deferred1_1 = ret[1];
                return getStringFromWasm0(ret[0], ret[1]);
            } finally {
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }
        /**
         * The player clicked; applies to the next frame stepped.
         */
        click() {
            wasm.session_click(this.__wbg_ptr);
        }
        /**
         * Opens `selector` (e.g. `event:101/8`) of the library at `library` in the file table,
         * with asset-source files mirrored under `assets` (`<assets>/<path as in the index>`).
         * `width` × `height` is the render size the layout is computed for; `player_name`
         * replaces `{{playerName}}`. `ui_kit` is the UI kit's directory ([`derive_ui_kit`]): the
         * scenario UI's sound effects are played from it (none without it).
         * @param {string} library
         * @param {string} assets
         * @param {string} selector
         * @param {number} width
         * @param {number} height
         * @param {string} player_name
         * @param {string | null} [ui_kit]
         * @returns {Session}
         */
        static create(library, assets, selector, width, height, player_name, ui_kit) {
            const ptr0 = passStringToWasm0(library, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(assets, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(selector, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(player_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len3 = WASM_VECTOR_LEN;
            var ptr4 = isLikeNone(ui_kit) ? 0 : passStringToWasm0(ui_kit, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len4 = WASM_VECTOR_LEN;
            const ret = wasm.session_create(ptr0, len0, ptr1, len1, ptr2, len2, width, height, ptr3, len3, ptr4, len4);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return Session.__wrap(ret[0]);
        }
        /**
         * Debugging: the JSON of `{audio, timings, instrs}`, the audio cues baked so far, the
         * timing of every instruction started so far and the episode's instructions.
         * @returns {string}
         */
        debugState() {
            let deferred2_0;
            let deferred2_1;
            try {
                const ret = wasm.session_debugState(this.__wbg_ptr);
                var ptr1 = ret[0];
                var len1 = ret[1];
                if (ret[3]) {
                    ptr1 = 0; len1 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred2_0 = ptr1;
                deferred2_1 = len1;
                return getStringFromWasm0(ptr1, len1);
            } finally {
                wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
            }
        }
        /**
         * Decodes up to `packets` MP3 packets (about 26 ms of audio each) of the waveforms the next
         * few instructions play (and those started but still in their delay), so that a cue does not wait for its waveform when it starts (a BGM
         * takes tens of milliseconds to decode at once). The player calls it when it has time to
         * spare; true while there is more to decode. The mix is the same either way: a waveform
         * decoded ahead is the one [`Session::mix`] would decode. Files not fetched yet are passed
         * over.
         * @param {number} packets
         * @returns {boolean}
         */
        decodeAhead(packets) {
            const ret = wasm.session_decodeAhead(this.__wbg_ptr, packets);
            return ret !== 0;
        }
        /**
         * Bytes of decoded audio the mixer holds.
         * @returns {number}
         */
        get decodedBytes() {
            const ret = wasm.session_decodedBytes(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * One past the last frame, once known.
         * @returns {number | undefined}
         */
        get endFrame() {
            const ret = wasm.session_endFrame(this.__wbg_ptr);
            return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
        }
        /**
         * The frame the next [`Session::step`] bakes.
         * @returns {number}
         */
        get frame() {
            const ret = wasm.session_frame(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * Interleaved stereo samples at 48 kHz for `[start, end)` (sample indices from the start
         * of the episode). Only frames already stepped have their cues: mix behind
         * [`Session::frame`].
         * @param {number} start
         * @param {number} end
         * @returns {Float32Array}
         */
        mix(start, end) {
            const ret = wasm.session_mix(this.__wbg_ptr, start, end);
            if (ret[3]) {
                throw takeFromExternrefTable0(ret[2]);
            }
            var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
            return v1;
        }
        /**
         * The model bundles each instruction may put on screen, for fetching them ahead: JSON of
         * `[[position, [bundles]], …]` like [`Session::audio_plan`]. Position 0 also holds the
         * initial layout. A layout instruction lists its explicit costume and the character's first
         * one (a costume put on earlier is listed where it first appears).
         * @returns {string}
         */
        modelPlan() {
            let deferred1_0;
            let deferred1_1;
            try {
                const ret = wasm.session_modelPlan(this.__wbg_ptr);
                deferred1_0 = ret[0];
                deferred1_1 = ret[1];
                return getStringFromWasm0(ret[0], ret[1]);
            } finally {
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }
        /**
         * The parameter table's model list so far ([`FrameRenderer::set_models`]).
         * @returns {string[]}
         */
        get models() {
            const ret = wasm.session_models(this.__wbg_ptr);
            var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
            return v1;
        }
        /**
         * Position in instruction order of the next instruction to start; the audio of the
         * instructions before it has been read.
         * @returns {number}
         */
        get nextInstruction() {
            const ret = wasm.session_nextInstruction(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * The node playback is in: the nodes finished so far.
         * @returns {number}
         */
        get node() {
            const ret = wasm.session_node(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * The JSON of the nodes of playback, in order. Each has its `kind`, the position `snippet`
         * of its instruction in the scenario's `Snippets`, and its text: a talk `speaker` and
         * `body`, a telop or a full-screen text `body`, choices their `options`.
         * @returns {string}
         */
        nodes() {
            let deferred2_0;
            let deferred2_1;
            try {
                const ret = wasm.session_nodes(this.__wbg_ptr);
                var ptr1 = ret[0];
                var len1 = ret[1];
                if (ret[3]) {
                    ptr1 = 0; len1 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred2_0 = ptr1;
                deferred2_1 = len1;
                return getStringFromWasm0(ptr1, len1);
            } finally {
                wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
            }
        }
        /**
         * Approximations and unsupported content met so far.
         * @returns {string[]}
         */
        get notes() {
            const ret = wasm.session_notes(this.__wbg_ptr);
            var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
            return v1;
        }
        /**
         * The render size became `width` × `height`. When its aspect ratio gives another content
         * size, the UI is laid out anew: the simulation starts over from the first frame (keeping
         * the mode and the models loaded) and this returns true, for the caller to seek back to
         * where playback was ([`Session::seek`]). Otherwise nothing changes.
         * @param {number} width
         * @param {number} height
         * @returns {boolean}
         */
        resize(width, height) {
            const ret = wasm.session_resize(this.__wbg_ptr, width, height);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return ret[0] !== 0;
        }
        /**
         * Drops decoded audio no cue needs within `[start, end)`.
         * @param {number} start
         * @param {number} end
         * @returns {number}
         */
        retain(start, end) {
            const ret = wasm.session_retain(this.__wbg_ptr, start, end);
            return ret >>> 0;
        }
        /**
         * Continues from the start of node `node` (clamped to the nodes), as playing in AUTO from
         * the first frame would reach it (ADR-0030), keeping the mode and returning the frame it
         * continues from. The simulation steps there from the nearest state kept, AUTO and with
         * choices answered by themselves; files it needs must be in the file table (like
         * [`Session::step`], it fails with the missing one, and can be called again).
         * @param {number} node
         * @returns {number}
         */
        seek(node) {
            const ret = wasm.session_seek(this.__wbg_ptr, node);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return ret[0] >>> 0;
        }
        /**
         * @param {boolean} auto
         */
        setAuto(auto) {
            wasm.session_setAuto(this.__wbg_ptr, auto);
        }
        /**
         * Choice dialogs wait for the player ([`Session::answer`]); an export answers by itself.
         * @param {boolean} interactive
         */
        setInteractive(interactive) {
            wasm.session_setInteractive(this.__wbg_ptr, interactive);
        }
        /**
         * The JSON of the next frame's `FrameState`, or `undefined` once the episode has ended.
         * @returns {string | undefined}
         */
        step() {
            const ret = wasm.session_step(this.__wbg_ptr);
            if (ret[3]) {
                throw takeFromExternrefTable0(ret[2]);
            }
            let v1;
            if (ret[0] !== 0) {
                v1 = getStringFromWasm0(ret[0], ret[1]);
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v1;
        }
        /**
         * The first frame whose baking changed the audio since the last call, if any: samples
         * mixed for it and after must be mixed again.
         * @returns {number | undefined}
         */
        takeAudioChange() {
            const ret = wasm.session_takeAudioChange(this.__wbg_ptr);
            return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
        }
        /**
         * The JSON of what a browser does not play in the episode, in order: `[{"reason", "name"?}]`
         * with `reason` one of `movie` (shown black with its name; its sound plays), `music_video`,
         * `input_name`, `selectable`, `unknown_effect_type` and `unknown_action` (left out, timed as
         * the export times them).
         * @returns {string}
         */
        unsupported() {
            let deferred2_0;
            let deferred2_1;
            try {
                const ret = wasm.session_unsupported(this.__wbg_ptr);
                var ptr1 = ret[0];
                var len1 = ret[1];
                if (ret[3]) {
                    ptr1 = 0; len1 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred2_0 = ptr1;
                deferred2_1 = len1;
                return getStringFromWasm0(ptr1, len1);
            } finally {
                wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
            }
        }
        /**
         * A choice dialog waits for the player.
         * @returns {boolean}
         */
        get waitsForAnswer() {
            const ret = wasm.session_waitsForAnswer(this.__wbg_ptr);
            return ret !== 0;
        }
        /**
         * A talk waits for a click (manual mode): the player can stop stepping ahead.
         * @returns {boolean}
         */
        get waitsForClick() {
            const ret = wasm.session_waitsForClick(this.__wbg_ptr);
            return ret !== 0;
        }
    }
    if (Symbol.dispose) Session.prototype[Symbol.dispose] = Session.prototype.free;
    exports.Session = Session;

    /**
     * Derives the UI kit from the client unpack at `inapp` in the file table, as the CLI does
     * (ADR-0017), writing it under `cache`; returns the kit's directory. A file the derivation
     * needs and the table lacks fails it with that path; put it there and call again.
     *
     * `fonts` false leaves the client's fonts out, for a page that gives the renderer fonts of
     * its own ([`FrameRenderer::create`]): the client's font files are then never asked for.
     * @param {string} inapp
     * @param {string} cache
     * @param {boolean | null} [fonts]
     * @returns {string}
     */
    function deriveUiKit(inapp, cache, fonts) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(inapp, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(cache, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.deriveUiKit(ptr0, len0, ptr1, len1, isLikeNone(fonts) ? 0xFFFFFF : fonts ? 1 : 0);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    exports.deriveUiKit = deriveUiKit;

    /**
     * Bytes the file table holds.
     * @returns {number}
     */
    function fileTableSize() {
        const ret = wasm.fileTableSize();
        return ret >>> 0;
    }
    exports.fileTableSize = fileTableSize;

    /**
     * The names of the files and directories directly in `dir` of the file table, sorted.
     * @param {string} dir
     * @returns {string[]}
     */
    function listFiles(dir) {
        const ptr0 = passStringToWasm0(dir, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.listFiles(ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    exports.listFiles = listFiles;

    /**
     * Puts a fetched file at `path` in the file table every crate reads from.
     * @param {string} path
     * @param {Uint8Array} bytes
     */
    function putFile(path, bytes) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.putFile(ptr0, len0, ptr1, len1);
    }
    exports.putFile = putFile;

    /**
     * The file at `path` of the file table.
     * @param {string} path
     * @returns {Uint8Array}
     */
    function readFile(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.readFile(ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    exports.readFile = readFile;

    /**
     * Drops every file under `dir` from the file table; returns how many.
     * @param {string} dir
     * @returns {number}
     */
    function removeDir(dir) {
        const ptr0 = passStringToWasm0(dir, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.removeDir(ptr0, len0);
        return ret >>> 0;
    }
    exports.removeDir = removeDir;

    /**
     * Drops the file at `path` from the file table; false when it was not there.
     * @param {string} path
     * @returns {boolean}
     */
    function removeFile(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.removeFile(ptr0, len0);
        return ret !== 0;
    }
    exports.removeFile = removeFile;

    /**
     * Sets the size of Cubism Core for Web's heap, before the first Core call (it returns false
     * after that). Pass 1 only reads a model's parameters as it loads it and keeps none alive, so the
     * simulation worker does with the smallest heap; the renderer keeps the models it draws.
     * @param {number} bytes
     * @returns {boolean}
     */
    function setCoreHeapSize(bytes) {
        const ret = wasm.setCoreHeapSize(bytes);
        return ret !== 0;
    }
    exports.setCoreHeapSize = setCoreHeapSize;

    /**
     * Where [`derive_ui_kit`] writes the kit of the client unpack at `inapp`, without deriving it.
     * The directory's last component is the kit's version, so a page can keep a derived kit and
     * tell whether it is the one this build would derive.
     * @param {string} inapp
     * @param {string} cache
     * @param {boolean | null} [fonts]
     * @returns {string}
     */
    function uiKitDir(inapp, cache, fonts) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(inapp, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(cache, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.uiKitDir(ptr0, len0, ptr1, len1, isLikeNone(fonts) ? 0xFFFFFF : fonts ? 1 : 0);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    exports.uiKitDir = uiKitDir;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_CanvasHeight_b51e1a6384f163dc: function(arg0) {
                const ret = arg0.CanvasHeight;
                return ret;
            },
            __wbg_CanvasOriginX_5f36237f2f8ddcdc: function(arg0) {
                const ret = arg0.CanvasOriginX;
                return ret;
            },
            __wbg_CanvasOriginY_a766f73b98fd84aa: function(arg0) {
                const ret = arg0.CanvasOriginY;
                return ret;
            },
            __wbg_CanvasWidth_2b4aef0746356530: function(arg0) {
                const ret = arg0.CanvasWidth;
                return ret;
            },
            __wbg_Error_67e7344beaa85059: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return ret;
            },
            __wbg_PixelsPerUnit_b24eca5b0e848dd8: function(arg0) {
                const ret = arg0.PixelsPerUnit;
                return ret;
            },
            __wbg_Window_a2a6c4d665047b14: function(arg0) {
                const ret = arg0.Window;
                return ret;
            },
            __wbg_WorkerGlobalScope_2664448a7c667d67: function(arg0) {
                const ret = arg0.WorkerGlobalScope;
                return ret;
            },
            __wbg___wbindgen_debug_string_0e68cf47c9cbd9b0: function(arg0, arg1) {
                const ret = debugString(arg1);
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_is_function_fcda5e3902d732fe: function(arg0) {
                const ret = typeof(arg0) === 'function';
                return ret;
            },
            __wbg___wbindgen_is_null_5160b3e381865372: function(arg0) {
                const ret = arg0 === null;
                return ret;
            },
            __wbg___wbindgen_is_object_edb6b15aa3afe12e: function(arg0) {
                const val = arg0;
                const ret = typeof(val) === 'object' && val !== null;
                return ret;
            },
            __wbg___wbindgen_is_string_c4f7cb494a2a21f1: function(arg0) {
                const ret = typeof(arg0) === 'string';
                return ret;
            },
            __wbg___wbindgen_is_undefined_8c687d0b90d5b524: function(arg0) {
                const ret = arg0 === undefined;
                return ret;
            },
            __wbg___wbindgen_string_get_92ab86bb19cbc12f: function(arg0, arg1) {
                const obj = arg1;
                const ret = typeof(obj) === 'string' ? obj : undefined;
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg__release_d88c7d0f72d38988: function() { return handleError(function (arg0) {
                arg0._release();
            }, arguments); },
            __wbg__wbg_cb_unref_997e73d32238e655: function(arg0) {
                arg0._wbg_cb_unref();
            },
            __wbg_beginRenderPass_3c53642423af50dc: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.beginRenderPass(arg1);
                return ret;
            }, arguments); },
            __wbg_buffer_4a989bded7035f57: function(arg0) {
                const ret = arg0.buffer;
                return ret;
            },
            __wbg_buffer_c76fa2830d92f5bb: function(arg0) {
                const ret = arg0.buffer;
                return ret;
            },
            __wbg_byteOffset_08def62ab5e8b536: function(arg0) {
                const ret = arg0.byteOffset;
                return ret;
            },
            __wbg_call_6bcf8d3e20937e46: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.call(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_canvasinfo_c4f65429f6d1c14c: function(arg0) {
                const ret = arg0.canvasinfo;
                return ret;
            },
            __wbg_configure_1e2c1c9edad07d26: function() { return handleError(function (arg0, arg1) {
                arg0.configure(arg1);
            }, arguments); },
            __wbg_constantFlags_4106e5c7e02017d5: function(arg0) {
                const ret = arg0.constantFlags;
                return ret;
            },
            __wbg_copyTextureToTexture_d2e6a1eb3254b828: function() { return handleError(function (arg0, arg1, arg2, arg3) {
                arg0.copyTextureToTexture(arg1, arg2, arg3);
            }, arguments); },
            __wbg_createBindGroupLayout_b1bd63b4e88459d8: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.createBindGroupLayout(arg1);
                return ret;
            }, arguments); },
            __wbg_createBindGroup_f539b26ca341308f: function(arg0, arg1) {
                const ret = arg0.createBindGroup(arg1);
                return ret;
            },
            __wbg_createBuffer_d800e9b1d41b2ee5: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.createBuffer(arg1);
                return ret;
            }, arguments); },
            __wbg_createCommandEncoder_3352d1ffc36c6fc0: function(arg0, arg1) {
                const ret = arg0.createCommandEncoder(arg1);
                return ret;
            },
            __wbg_createPipelineLayout_6eab52c327118937: function(arg0, arg1) {
                const ret = arg0.createPipelineLayout(arg1);
                return ret;
            },
            __wbg_createRenderPipeline_0ebb7ebc653e9207: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.createRenderPipeline(arg1);
                return ret;
            }, arguments); },
            __wbg_createSampler_9bd91d7e928c0060: function(arg0, arg1) {
                const ret = arg0.createSampler(arg1);
                return ret;
            },
            __wbg_createShaderModule_cefa51336cb288ae: function(arg0, arg1) {
                const ret = arg0.createShaderModule(arg1);
                return ret;
            },
            __wbg_createTexture_ed7e9fc04dd54d84: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.createTexture(arg1);
                return ret;
            }, arguments); },
            __wbg_createView_da41c2d2cb212715: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.createView(arg1);
                return ret;
            }, arguments); },
            __wbg_csmGetMocVersion_101d91040075ac95: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.csmGetMocVersion(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_csmGetVersion_890440d91cc6fe35: function() { return handleError(function (arg0) {
                const ret = arg0.csmGetVersion();
                return ret;
            }, arguments); },
            __wbg_defaultValues_2a2020ce8c2474e7: function(arg0) {
                const ret = arg0.defaultValues;
                return ret;
            },
            __wbg_document_c7f486c52d63d24e: function(arg0) {
                const ret = arg0.document;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_drawIndexed_638959aae942557c: function(arg0, arg1, arg2, arg3, arg4, arg5) {
                arg0.drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
            },
            __wbg_draw_086a9578fc9898c2: function(arg0, arg1, arg2, arg3, arg4) {
                arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
            },
            __wbg_drawables_3d2d316e4549ce76: function(arg0) {
                const ret = arg0.drawables;
                return ret;
            },
            __wbg_dynamicFlags_7ed96940f9b8ef0f: function(arg0) {
                const ret = arg0.dynamicFlags;
                return ret;
            },
            __wbg_end_b57473834b877409: function(arg0) {
                arg0.end();
            },
            __wbg_finish_09ec094c10f41e7b: function(arg0) {
                const ret = arg0.finish();
                return ret;
            },
            __wbg_finish_ec1c191f66a895b1: function(arg0, arg1) {
                const ret = arg0.finish(arg1);
                return ret;
            },
            __wbg_framerenderer_new: function(arg0) {
                const ret = FrameRenderer.__wrap(arg0);
                return ret;
            },
            __wbg_fromArrayBuffer_d14d59a8cf23d6e8: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.fromArrayBuffer(arg1);
                return ret;
            }, arguments); },
            __wbg_fromMoc_8a1a3e75ff3d6a7f: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.fromMoc(arg1);
                return ret;
            }, arguments); },
            __wbg_getContext_5ff6bd600503b094: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            }, arguments); },
            __wbg_getContext_e0c05ffee530bdcf: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            }, arguments); },
            __wbg_getCurrentTexture_9f3b84d0eaa6cd95: function() { return handleError(function (arg0) {
                const ret = arg0.getCurrentTexture();
                return ret;
            }, arguments); },
            __wbg_getMappedRange_fb54c6327b2d8d20: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.getMappedRange(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_getPreferredCanvasFormat_0ef5034c8902201b: function(arg0) {
                const ret = arg0.getPreferredCanvasFormat();
                return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 102) - 1;
            },
            __wbg_getRenderOrders_95c35203ec7b5439: function() { return handleError(function (arg0) {
                const ret = arg0.getRenderOrders();
                return ret;
            }, arguments); },
            __wbg_get_95e4d462165c92ae: function(arg0, arg1) {
                const ret = arg0[arg1 >>> 0];
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_get_989d0a1309644f2b: function() { return handleError(function (arg0, arg1) {
                const ret = Reflect.get(arg0, arg1);
                return ret;
            }, arguments); },
            __wbg_get_b1f0ab13c737f856: function(arg0, arg1) {
                const ret = arg0[arg1 >>> 0];
                return ret;
            },
            __wbg_get_unchecked_363572bdd397d473: function(arg0, arg1) {
                const ret = arg0[arg1 >>> 0];
                return ret;
            },
            __wbg_gpu_afdd4387c7afe5f9: function(arg0) {
                const ret = arg0.gpu;
                return ret;
            },
            __wbg_ids_34bd308e9aec415e: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_ids_621d4ccff13bebff: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_ids_ac3438ac430e264d: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_indices_29017e0fdf19cfc0: function(arg0) {
                const ret = arg0.indices;
                return ret;
            },
            __wbg_initializeAmountOfMemory_5082916d4c6e6953: function() { return handleError(function (arg0, arg1) {
                arg0.initializeAmountOfMemory(arg1);
            }, arguments); },
            __wbg_instanceof_Error_fe6fa771c78ee4cf: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Error;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_Float32Array_31e80d3e88752523: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Float32Array;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_HtmlCanvasElement_4d7e131643d814c1: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof HTMLCanvasElement;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_Int32Array_161f8242c93743a0: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Int32Array;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_OffscreenCanvas_d6d5c41702ec35aa: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof OffscreenCanvas;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_Uint16Array_6c2c1017ef674da3: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Uint16Array;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_Uint8Array_598adc0fef426aa8: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Uint8Array;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_instanceof_Window_a3b8566f0a9c5d1a: function(arg0) {
                let result;
                try {
                    result = arg0 instanceof Window;
                } catch (_) {
                    result = false;
                }
                const ret = result;
                return ret;
            },
            __wbg_isArray_5674713bb7b79043: function(arg0) {
                const ret = Array.isArray(arg0);
                return ret;
            },
            __wbg_is_61443cc073056436: function(arg0, arg1) {
                const ret = Object.is(arg0, arg1);
                return ret;
            },
            __wbg_label_7add8cb37a6ef98f: function(arg0, arg1) {
                const ret = arg1.label;
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_length_31bdaf014f5fbde2: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_length_4e1adc0d42e23620: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_length_8768c6f6941913e3: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_length_e4c12d3be1f46e71: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_length_fbfce129368ed79c: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_limits_06bcb36c8409843b: function(arg0) {
                const ret = arg0.limits;
                return ret;
            },
            __wbg_mapAsync_b0597127f5037286: function(arg0, arg1, arg2, arg3) {
                const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
                return ret;
            },
            __wbg_masks_dfe28d79f87c7b3d: function(arg0) {
                const ret = arg0.masks;
                return ret;
            },
            __wbg_maxBindGroupsPlusVertexBuffers_52369f089736ef9d: function(arg0) {
                const ret = arg0.maxBindGroupsPlusVertexBuffers;
                return ret;
            },
            __wbg_maxBindGroups_4e424afe6ce86ca2: function(arg0) {
                const ret = arg0.maxBindGroups;
                return ret;
            },
            __wbg_maxBindingsPerBindGroup_7d035da36821c44f: function(arg0) {
                const ret = arg0.maxBindingsPerBindGroup;
                return ret;
            },
            __wbg_maxBufferSize_423f4a084e32a195: function(arg0) {
                const ret = arg0.maxBufferSize;
                return ret;
            },
            __wbg_maxColorAttachmentBytesPerSample_c4cd9126f6d287c6: function(arg0) {
                const ret = arg0.maxColorAttachmentBytesPerSample;
                return ret;
            },
            __wbg_maxColorAttachments_d924670762b9e250: function(arg0) {
                const ret = arg0.maxColorAttachments;
                return ret;
            },
            __wbg_maxComputeInvocationsPerWorkgroup_707a3868f7cebb59: function(arg0) {
                const ret = arg0.maxComputeInvocationsPerWorkgroup;
                return ret;
            },
            __wbg_maxComputeWorkgroupSizeX_0a4d99463cbd6e5e: function(arg0) {
                const ret = arg0.maxComputeWorkgroupSizeX;
                return ret;
            },
            __wbg_maxComputeWorkgroupSizeY_85123ea0587f7558: function(arg0) {
                const ret = arg0.maxComputeWorkgroupSizeY;
                return ret;
            },
            __wbg_maxComputeWorkgroupSizeZ_a3186b4c5267d44f: function(arg0) {
                const ret = arg0.maxComputeWorkgroupSizeZ;
                return ret;
            },
            __wbg_maxComputeWorkgroupStorageSize_57b297355cfb6204: function(arg0) {
                const ret = arg0.maxComputeWorkgroupStorageSize;
                return ret;
            },
            __wbg_maxComputeWorkgroupsPerDimension_4158f95e673d54c4: function(arg0) {
                const ret = arg0.maxComputeWorkgroupsPerDimension;
                return ret;
            },
            __wbg_maxDynamicStorageBuffersPerPipelineLayout_226b0b70910aa16c: function(arg0) {
                const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
                return ret;
            },
            __wbg_maxDynamicUniformBuffersPerPipelineLayout_0e835fda711fc7e6: function(arg0) {
                const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
                return ret;
            },
            __wbg_maxInterStageShaderVariables_8c4a1d727e2aa35a: function(arg0) {
                const ret = arg0.maxInterStageShaderVariables;
                return ret;
            },
            __wbg_maxSampledTexturesPerShaderStage_6675f5e91d9a728a: function(arg0) {
                const ret = arg0.maxSampledTexturesPerShaderStage;
                return ret;
            },
            __wbg_maxSamplersPerShaderStage_1910fa38a6ed1e1f: function(arg0) {
                const ret = arg0.maxSamplersPerShaderStage;
                return ret;
            },
            __wbg_maxStorageBufferBindingSize_2e244bded070b18d: function(arg0) {
                const ret = arg0.maxStorageBufferBindingSize;
                return ret;
            },
            __wbg_maxStorageBuffersPerShaderStage_a285f3ebca51ca0d: function(arg0) {
                const ret = arg0.maxStorageBuffersPerShaderStage;
                return ret;
            },
            __wbg_maxStorageTexturesPerShaderStage_7aa946f0fc322a2b: function(arg0) {
                const ret = arg0.maxStorageTexturesPerShaderStage;
                return ret;
            },
            __wbg_maxTextureArrayLayers_0e699147ad00502d: function(arg0) {
                const ret = arg0.maxTextureArrayLayers;
                return ret;
            },
            __wbg_maxTextureDimension1D_aabf6add54decfe2: function(arg0) {
                const ret = arg0.maxTextureDimension1D;
                return ret;
            },
            __wbg_maxTextureDimension2D_dd598b27e9c0c1c4: function(arg0) {
                const ret = arg0.maxTextureDimension2D;
                return ret;
            },
            __wbg_maxTextureDimension3D_f944266c65dfd1a9: function(arg0) {
                const ret = arg0.maxTextureDimension3D;
                return ret;
            },
            __wbg_maxUniformBufferBindingSize_59fa6be7cfbeeb53: function(arg0) {
                const ret = arg0.maxUniformBufferBindingSize;
                return ret;
            },
            __wbg_maxUniformBuffersPerShaderStage_bee5f00a4d706c7f: function(arg0) {
                const ret = arg0.maxUniformBuffersPerShaderStage;
                return ret;
            },
            __wbg_maxVertexAttributes_5cf6392c4e9033fe: function(arg0) {
                const ret = arg0.maxVertexAttributes;
                return ret;
            },
            __wbg_maxVertexBufferArrayStride_548baa887375d865: function(arg0) {
                const ret = arg0.maxVertexBufferArrayStride;
                return ret;
            },
            __wbg_maxVertexBuffers_75d881156591f5da: function(arg0) {
                const ret = arg0.maxVertexBuffers;
                return ret;
            },
            __wbg_maximumValues_42d540a71e7505bd: function(arg0) {
                const ret = arg0.maximumValues;
                return ret;
            },
            __wbg_message_1cbc5bc03dcf1dee: function(arg0) {
                const ret = arg0.message;
                return ret;
            },
            __wbg_minStorageBufferOffsetAlignment_5ba9b77792bdadb3: function(arg0) {
                const ret = arg0.minStorageBufferOffsetAlignment;
                return ret;
            },
            __wbg_minUniformBufferOffsetAlignment_ab7d52a5293b22bd: function(arg0) {
                const ret = arg0.minUniformBufferOffsetAlignment;
                return ret;
            },
            __wbg_minimumValues_5188981c8b15bf92: function(arg0) {
                const ret = arg0.minimumValues;
                return ret;
            },
            __wbg_multiplyColors_e3137674cfd9e3dd: function(arg0) {
                const ret = arg0.multiplyColors;
                return ret;
            },
            __wbg_navigator_d217ca64c4bbff48: function(arg0) {
                const ret = arg0.navigator;
                return ret;
            },
            __wbg_navigator_d25c0f071226f233: function(arg0) {
                const ret = arg0.navigator;
                return ret;
            },
            __wbg_new_12e5d807044fbfe3: function() { return handleError(function (arg0, arg1) {
                const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
                return ret;
            }, arguments); },
            __wbg_new_bebc3f4757acf305: function() {
                const ret = new Object();
                return ret;
            },
            __wbg_new_from_slice_4ee02165f9de919e: function(arg0, arg1) {
                const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
                return ret;
            },
            __wbg_new_typed_6f8b0d724fe26c07: function(arg0, arg1) {
                try {
                    var state0 = {a: arg0, b: arg1};
                    var cb0 = (arg0, arg1) => {
                        const a = state0.a;
                        state0.a = 0;
                        try {
                            return wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                        } finally {
                            state0.a = a;
                        }
                    };
                    const ret = new Promise(cb0);
                    return ret;
                } finally {
                    state0.a = 0;
                }
            },
            __wbg_new_typed_7d4574ab4b8446c8: function() {
                const ret = new Object();
                return ret;
            },
            __wbg_new_with_byte_offset_and_length_492c969e8b5da8a4: function(arg0, arg1, arg2) {
                const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
                return ret;
            },
            __wbg_onSubmittedWorkDone_1190213cee1ecf7e: function(arg0) {
                const ret = arg0.onSubmittedWorkDone();
                return ret;
            },
            __wbg_opacities_5becd78492d0d566: function(arg0) {
                const ret = arg0.opacities;
                return ret;
            },
            __wbg_opacities_f09d8064a275fe64: function(arg0) {
                const ret = arg0.opacities;
                return ret;
            },
            __wbg_parameters_90dac7d668f5a8c2: function(arg0) {
                const ret = arg0.parameters;
                return ret;
            },
            __wbg_parts_8fdcfd64105ecdf7: function(arg0) {
                const ret = arg0.parts;
                return ret;
            },
            __wbg_prototypesetcall_804a1eb1b047ccb9: function(arg0, arg1, arg2) {
                Float32Array.prototype.set.call(getArrayF32FromWasm0(arg0, arg1), arg2);
            },
            __wbg_prototypesetcall_82f818dd4475225f: function(arg0, arg1, arg2) {
                Uint16Array.prototype.set.call(getArrayU16FromWasm0(arg0, arg1), arg2);
            },
            __wbg_prototypesetcall_ae9f5e7459250748: function(arg0, arg1, arg2) {
                Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
            },
            __wbg_prototypesetcall_e20f3c85f78376cf: function(arg0, arg1, arg2) {
                Int32Array.prototype.set.call(getArrayI32FromWasm0(arg0, arg1), arg2);
            },
            __wbg_querySelectorAll_fdbf93e11103921d: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.querySelectorAll(getStringFromWasm0(arg1, arg2));
                return ret;
            }, arguments); },
            __wbg_queueMicrotask_85c90f6987555d65: function(arg0) {
                const ret = arg0.queueMicrotask;
                return ret;
            },
            __wbg_queueMicrotask_f6a1fa10b81d1fc0: function(arg0) {
                queueMicrotask(arg0);
            },
            __wbg_queue_7b62c28143d44293: function(arg0) {
                const ret = arg0.queue;
                return ret;
            },
            __wbg_release_00ba379466ca69b2: function() { return handleError(function (arg0) {
                arg0.release();
            }, arguments); },
            __wbg_renderOrders_40e06a628e398018: function(arg0) {
                const ret = arg0.renderOrders;
                return ret;
            },
            __wbg_requestAdapter_a539af006419f2e9: function(arg0, arg1) {
                const ret = arg0.requestAdapter(arg1);
                return ret;
            },
            __wbg_requestDevice_5cb8a582e55d08cb: function(arg0, arg1) {
                const ret = arg0.requestDevice(arg1);
                return ret;
            },
            __wbg_resetDynamicFlags_e564e9fe53e98946: function(arg0) {
                arg0.resetDynamicFlags();
            },
            __wbg_resolve_35ec7e0c6af4c82c: function(arg0) {
                const ret = Promise.resolve(arg0);
                return ret;
            },
            __wbg_screenColors_ca085f29508af35f: function(arg0) {
                const ret = arg0.screenColors;
                return ret;
            },
            __wbg_setBindGroup_11bdbb60cc8b54b9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
                arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
            }, arguments); },
            __wbg_setBindGroup_418c3e0eb6943ce0: function(arg0, arg1, arg2) {
                arg0.setBindGroup(arg1 >>> 0, arg2);
            },
            __wbg_setIndexBuffer_241097e303986c14: function(arg0, arg1, arg2, arg3, arg4) {
                arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
            },
            __wbg_setPipeline_b6f981027e02cd16: function(arg0, arg1) {
                arg0.setPipeline(arg1);
            },
            __wbg_setVertexBuffer_6db3b60e99280744: function(arg0, arg1, arg2, arg3) {
                arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3);
            },
            __wbg_setVertexBuffer_cbf4ca1627c02f4c: function(arg0, arg1, arg2, arg3, arg4) {
                arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
            },
            __wbg_set_9cfc0f17d60ff0af: function(arg0, arg1, arg2) {
                arg0.set(arg1, arg2 >>> 0);
            },
            __wbg_set_a377297433dfea63: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = Reflect.set(arg0, arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_set_a_82818effc94f6256: function(arg0, arg1) {
                arg0.a = arg1;
            },
            __wbg_set_access_a099cfbbeec9b96f: function(arg0, arg1) {
                arg0.access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
            },
            __wbg_set_address_mode_u_a68737cf5d288f95: function(arg0, arg1) {
                arg0.addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
            },
            __wbg_set_address_mode_v_b1c3c45933f540d1: function(arg0, arg1) {
                arg0.addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
            },
            __wbg_set_address_mode_w_889c31cf7022c764: function(arg0, arg1) {
                arg0.addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
            },
            __wbg_set_alpha_106f21a936a85eba: function(arg0, arg1) {
                arg0.alpha = arg1;
            },
            __wbg_set_alpha_mode_5544568dbac50280: function(arg0, arg1) {
                arg0.alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[arg1];
            },
            __wbg_set_alpha_to_coverage_enabled_3372ce329447b8f1: function(arg0, arg1) {
                arg0.alphaToCoverageEnabled = arg1 !== 0;
            },
            __wbg_set_array_layer_count_22afa0a979e4ad55: function(arg0, arg1) {
                arg0.arrayLayerCount = arg1 >>> 0;
            },
            __wbg_set_array_stride_f64_6816040e5e7598c3: function(arg0, arg1) {
                arg0.arrayStride = arg1;
            },
            __wbg_set_aspect_a48d046965270281: function(arg0, arg1) {
                arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
            },
            __wbg_set_aspect_b1a9909bf315433f: function(arg0, arg1) {
                arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
            },
            __wbg_set_attributes_9e38cb1dde387a5b: function(arg0, arg1, arg2) {
                arg0.attributes = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_b_a3297ee7e7cac3a8: function(arg0, arg1) {
                arg0.b = arg1;
            },
            __wbg_set_base_array_layer_2435ba92c80346ae: function(arg0, arg1) {
                arg0.baseArrayLayer = arg1 >>> 0;
            },
            __wbg_set_base_mip_level_8b6093e875e7c65d: function(arg0, arg1) {
                arg0.baseMipLevel = arg1 >>> 0;
            },
            __wbg_set_beginning_of_pass_write_index_e552c5e8b8bbf52f: function(arg0, arg1) {
                arg0.beginningOfPassWriteIndex = arg1 >>> 0;
            },
            __wbg_set_bind_group_layouts_458c44ba55100b82: function(arg0, arg1, arg2) {
                arg0.bindGroupLayouts = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_binding_81b3fac7f7acaf8d: function(arg0, arg1) {
                arg0.binding = arg1 >>> 0;
            },
            __wbg_set_binding_b6cee57f35ac5190: function(arg0, arg1) {
                arg0.binding = arg1 >>> 0;
            },
            __wbg_set_blend_1a801617945f7945: function(arg0, arg1) {
                arg0.blend = arg1;
            },
            __wbg_set_buffer_1548ae88a9188037: function(arg0, arg1) {
                arg0.buffer = arg1;
            },
            __wbg_set_buffer_8d0ac64ad20dfc84: function(arg0, arg1) {
                arg0.buffer = arg1;
            },
            __wbg_set_buffers_5d0e0c50791f710e: function(arg0, arg1, arg2) {
                arg0.buffers = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_bytes_per_row_c28583f0063160f1: function(arg0, arg1) {
                arg0.bytesPerRow = arg1 >>> 0;
            },
            __wbg_set_c41f8dbc07a2190f: function(arg0, arg1, arg2) {
                arg0.set(getArrayF32FromWasm0(arg1, arg2));
            },
            __wbg_set_clear_value_gpu_color_dict_a9f763e8372ac1de: function(arg0, arg1) {
                arg0.clearValue = arg1;
            },
            __wbg_set_code_5d5b0b9e2fd0dca7: function(arg0, arg1, arg2) {
                arg0.code = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_color_8ecace4011f47d2e: function(arg0, arg1) {
                arg0.color = arg1;
            },
            __wbg_set_color_attachments_622fe2d5997fda7a: function(arg0, arg1, arg2) {
                arg0.colorAttachments = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_compare_080c9e492ff36990: function(arg0, arg1) {
                arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
            },
            __wbg_set_compare_817cf3695599eaa6: function(arg0, arg1) {
                arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
            },
            __wbg_set_count_8ff0c9474e39a849: function(arg0, arg1) {
                arg0.count = arg1 >>> 0;
            },
            __wbg_set_cull_mode_85d2b4ab0ce3a564: function(arg0, arg1) {
                arg0.cullMode = __wbindgen_enum_GpuCullMode[arg1];
            },
            __wbg_set_depth_bias_95abf479cae3f3cd: function(arg0, arg1) {
                arg0.depthBias = arg1;
            },
            __wbg_set_depth_bias_clamp_ba3d0b8348151350: function(arg0, arg1) {
                arg0.depthBiasClamp = arg1;
            },
            __wbg_set_depth_bias_slope_scale_6b2584d93f5b9cd2: function(arg0, arg1) {
                arg0.depthBiasSlopeScale = arg1;
            },
            __wbg_set_depth_clear_value_e30a4c754c6b3b26: function(arg0, arg1) {
                arg0.depthClearValue = arg1;
            },
            __wbg_set_depth_compare_a90de4e3714397ab: function(arg0, arg1) {
                arg0.depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
            },
            __wbg_set_depth_fail_op_b5c64541d1b6b482: function(arg0, arg1) {
                arg0.depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
            },
            __wbg_set_depth_load_op_932888016d762d3e: function(arg0, arg1) {
                arg0.depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
            },
            __wbg_set_depth_or_array_layers_e2f074a0284e4806: function(arg0, arg1) {
                arg0.depthOrArrayLayers = arg1 >>> 0;
            },
            __wbg_set_depth_read_only_be790175a1c2db9a: function(arg0, arg1) {
                arg0.depthReadOnly = arg1 !== 0;
            },
            __wbg_set_depth_stencil_attachment_54a8922f5fbe08bf: function(arg0, arg1) {
                arg0.depthStencilAttachment = arg1;
            },
            __wbg_set_depth_stencil_b7cffc59ad4da529: function(arg0, arg1) {
                arg0.depthStencil = arg1;
            },
            __wbg_set_depth_store_op_9054814f164ab55d: function(arg0, arg1) {
                arg0.depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
            },
            __wbg_set_depth_write_enabled_31a821ee1fb3b0b3: function(arg0, arg1) {
                arg0.depthWriteEnabled = arg1 !== 0;
            },
            __wbg_set_device_210484a77b675c9c: function(arg0, arg1) {
                arg0.device = arg1;
            },
            __wbg_set_dimension_3da9d03131a9f446: function(arg0, arg1) {
                arg0.dimension = __wbindgen_enum_GpuTextureDimension[arg1];
            },
            __wbg_set_dimension_56332450afa3e0c0: function(arg0, arg1) {
                arg0.dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
            },
            __wbg_set_dst_factor_865ba9aaf187890c: function(arg0, arg1) {
                arg0.dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
            },
            __wbg_set_end_of_pass_write_index_8f164f9e60d4ad16: function(arg0, arg1) {
                arg0.endOfPassWriteIndex = arg1 >>> 0;
            },
            __wbg_set_entries_6f866302103b81e9: function(arg0, arg1, arg2) {
                arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_entries_f26b77ab9548e906: function(arg0, arg1, arg2) {
                arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_entry_point_71cef95c137b5774: function(arg0, arg1, arg2) {
                arg0.entryPoint = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_entry_point_b70f98f5025a114d: function(arg0, arg1, arg2) {
                arg0.entryPoint = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_external_texture_7f966c604c4f8098: function(arg0, arg1) {
                arg0.externalTexture = arg1;
            },
            __wbg_set_fail_op_d59d0187e4111dfe: function(arg0, arg1) {
                arg0.failOp = __wbindgen_enum_GpuStencilOperation[arg1];
            },
            __wbg_set_format_23f7f32549751d43: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_format_283dca56552f07a3: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_format_5080a858117ad2c1: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuVertexFormat[arg1];
            },
            __wbg_set_format_66735b94bd868ba2: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_format_7f2bdbfb101b1ae1: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_format_92732ea75d3b79f5: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_format_f009e603f7d4c28e: function(arg0, arg1) {
                arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
            },
            __wbg_set_fragment_d2b0ec97d7cf8d47: function(arg0, arg1) {
                arg0.fragment = arg1;
            },
            __wbg_set_front_face_d3f8a2e07e7b25dd: function(arg0, arg1) {
                arg0.frontFace = __wbindgen_enum_GpuFrontFace[arg1];
            },
            __wbg_set_g_b527ee8a9bed553d: function(arg0, arg1) {
                arg0.g = arg1;
            },
            __wbg_set_has_dynamic_offset_0c72ffa900c5a269: function(arg0, arg1) {
                arg0.hasDynamicOffset = arg1 !== 0;
            },
            __wbg_set_height_1202ad0eab43cbe0: function(arg0, arg1) {
                arg0.height = arg1 >>> 0;
            },
            __wbg_set_height_698fb3b255bc1348: function(arg0, arg1) {
                arg0.height = arg1 >>> 0;
            },
            __wbg_set_height_f6619158e5735877: function(arg0, arg1) {
                arg0.height = arg1 >>> 0;
            },
            __wbg_set_label_17202740051e9722: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_2fefb39c0e0dbbe8: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_3cb2322e6f6db14c: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_3f2ccaafef5ff7c9: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_612add98a4398f92: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_70a09ee68d6b1b26: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_92cd3811e96b487c: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_9c2a186152427ee0: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_c3eaf136aa464cba: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_c7987704d29f284b: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_cfe64bca8945ee30: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_e02179cf97e95763: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_label_ee172cd5f6a96961: function(arg0, arg1, arg2) {
                arg0.label = getStringFromWasm0(arg1, arg2);
            },
            __wbg_set_layout_454e3a091b390cd4: function(arg0, arg1) {
                arg0.layout = arg1;
            },
            __wbg_set_layout_75dc1ca3f2421cff: function(arg0, arg1) {
                arg0.layout = arg1;
            },
            __wbg_set_layout_gpu_auto_layout_mode_06a2b95af1043098: function(arg0, arg1) {
                arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
            },
            __wbg_set_load_op_c56b1269acc2d51f: function(arg0, arg1) {
                arg0.loadOp = __wbindgen_enum_GpuLoadOp[arg1];
            },
            __wbg_set_lod_max_clamp_db24179f67f3aa31: function(arg0, arg1) {
                arg0.lodMaxClamp = arg1;
            },
            __wbg_set_lod_min_clamp_2bbce566e9fefa04: function(arg0, arg1) {
                arg0.lodMinClamp = arg1;
            },
            __wbg_set_mag_filter_db8e6b42d4f8846d: function(arg0, arg1) {
                arg0.magFilter = __wbindgen_enum_GpuFilterMode[arg1];
            },
            __wbg_set_mapped_at_creation_3f320fef6761b02c: function(arg0, arg1) {
                arg0.mappedAtCreation = arg1 !== 0;
            },
            __wbg_set_mask_c1079e551ec360dc: function(arg0, arg1) {
                arg0.mask = arg1 >>> 0;
            },
            __wbg_set_max_anisotropy_84749fdcec362dc4: function(arg0, arg1) {
                arg0.maxAnisotropy = arg1;
            },
            __wbg_set_min_binding_size_f64_897e3cd4496ddec9: function(arg0, arg1) {
                arg0.minBindingSize = arg1;
            },
            __wbg_set_min_filter_d435bbfc5a637757: function(arg0, arg1) {
                arg0.minFilter = __wbindgen_enum_GpuFilterMode[arg1];
            },
            __wbg_set_mip_level_count_047936c630acee7b: function(arg0, arg1) {
                arg0.mipLevelCount = arg1 >>> 0;
            },
            __wbg_set_mip_level_count_44bc46a1ae6f6daa: function(arg0, arg1) {
                arg0.mipLevelCount = arg1 >>> 0;
            },
            __wbg_set_mip_level_f3745730372683d5: function(arg0, arg1) {
                arg0.mipLevel = arg1 >>> 0;
            },
            __wbg_set_mipmap_filter_62fb49a84b0747ff: function(arg0, arg1) {
                arg0.mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
            },
            __wbg_set_mode_7edfbc344ef9c650: function(arg0, arg1) {
                arg0.mode = __wbindgen_enum_GpuCanvasToneMappingMode[arg1];
            },
            __wbg_set_module_392eeaa269f203b0: function(arg0, arg1) {
                arg0.module = arg1;
            },
            __wbg_set_module_715d37652c4998ec: function(arg0, arg1) {
                arg0.module = arg1;
            },
            __wbg_set_multisample_ff72a7a5456cbeb7: function(arg0, arg1) {
                arg0.multisample = arg1;
            },
            __wbg_set_multisampled_039f032dc4b67367: function(arg0, arg1) {
                arg0.multisampled = arg1 !== 0;
            },
            __wbg_set_offset_f64_127e8a0aa5c5485a: function(arg0, arg1) {
                arg0.offset = arg1;
            },
            __wbg_set_offset_f64_457756429ede426d: function(arg0, arg1) {
                arg0.offset = arg1;
            },
            __wbg_set_offset_f64_a903425d5a8e5815: function(arg0, arg1) {
                arg0.offset = arg1;
            },
            __wbg_set_operation_00a77386523b88f9: function(arg0, arg1) {
                arg0.operation = __wbindgen_enum_GpuBlendOperation[arg1];
            },
            __wbg_set_origin_gpu_origin_3d_dict_0619d4860adb4eb6: function(arg0, arg1) {
                arg0.origin = arg1;
            },
            __wbg_set_pass_op_3cf10feb3d76ab97: function(arg0, arg1) {
                arg0.passOp = __wbindgen_enum_GpuStencilOperation[arg1];
            },
            __wbg_set_power_preference_b42d00a8facfbade: function(arg0, arg1) {
                arg0.powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
            },
            __wbg_set_primitive_e796cf76f0ff89f3: function(arg0, arg1) {
                arg0.primitive = arg1;
            },
            __wbg_set_query_set_f030702f1b69199f: function(arg0, arg1) {
                arg0.querySet = arg1;
            },
            __wbg_set_r_6ece4d74af63364f: function(arg0, arg1) {
                arg0.r = arg1;
            },
            __wbg_set_required_features_bbab71414c45e621: function(arg0, arg1, arg2) {
                arg0.requiredFeatures = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_required_limits_837f62d865e7cfac: function(arg0, arg1) {
                arg0.requiredLimits = arg1;
            },
            __wbg_set_resolve_target_gpu_texture_view_e4c1e3bbb8c27d87: function(arg0, arg1) {
                arg0.resolveTarget = arg1;
            },
            __wbg_set_resource_8fd8658b30d86ecf: function(arg0, arg1) {
                arg0.resource = arg1;
            },
            __wbg_set_resource_gpu_buffer_binding_33099b25da65b610: function(arg0, arg1) {
                arg0.resource = arg1;
            },
            __wbg_set_resource_gpu_texture_view_4cffe7bc7c8e5cbe: function(arg0, arg1) {
                arg0.resource = arg1;
            },
            __wbg_set_rows_per_image_c6d50d227e634379: function(arg0, arg1) {
                arg0.rowsPerImage = arg1 >>> 0;
            },
            __wbg_set_sample_count_481c255a12054e1d: function(arg0, arg1) {
                arg0.sampleCount = arg1 >>> 0;
            },
            __wbg_set_sample_type_ebc5fcd029513bda: function(arg0, arg1) {
                arg0.sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
            },
            __wbg_set_sampler_89cb4a7efcfc6005: function(arg0, arg1) {
                arg0.sampler = arg1;
            },
            __wbg_set_shader_location_3fb9f6a012eba494: function(arg0, arg1) {
                arg0.shaderLocation = arg1 >>> 0;
            },
            __wbg_set_size_f64_2f591b0654540477: function(arg0, arg1) {
                arg0.size = arg1;
            },
            __wbg_set_size_f64_e844c985b8f95261: function(arg0, arg1) {
                arg0.size = arg1;
            },
            __wbg_set_size_gpu_extent_3d_dict_adf57388ab1d4f18: function(arg0, arg1) {
                arg0.size = arg1;
            },
            __wbg_set_src_factor_6f2c9ec8e4d3d979: function(arg0, arg1) {
                arg0.srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
            },
            __wbg_set_stencil_back_c54d0443b8b6a957: function(arg0, arg1) {
                arg0.stencilBack = arg1;
            },
            __wbg_set_stencil_clear_value_a321b0e045bfd8c2: function(arg0, arg1) {
                arg0.stencilClearValue = arg1 >>> 0;
            },
            __wbg_set_stencil_front_3ff3f8385852efff: function(arg0, arg1) {
                arg0.stencilFront = arg1;
            },
            __wbg_set_stencil_load_op_37d20deccb26a0f1: function(arg0, arg1) {
                arg0.stencilLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
            },
            __wbg_set_stencil_read_mask_021ef4271b24352c: function(arg0, arg1) {
                arg0.stencilReadMask = arg1 >>> 0;
            },
            __wbg_set_stencil_read_only_75fe66a2356d6e92: function(arg0, arg1) {
                arg0.stencilReadOnly = arg1 !== 0;
            },
            __wbg_set_stencil_store_op_501f91638dd386e6: function(arg0, arg1) {
                arg0.stencilStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
            },
            __wbg_set_stencil_write_mask_ec1c12237e094bdd: function(arg0, arg1) {
                arg0.stencilWriteMask = arg1 >>> 0;
            },
            __wbg_set_step_mode_3cbbdeba1e5dfd62: function(arg0, arg1) {
                arg0.stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
            },
            __wbg_set_storage_texture_786aea7c5773b6c1: function(arg0, arg1) {
                arg0.storageTexture = arg1;
            },
            __wbg_set_store_op_678f33376d741711: function(arg0, arg1) {
                arg0.storeOp = __wbindgen_enum_GpuStoreOp[arg1];
            },
            __wbg_set_strip_index_format_70313df755145d5e: function(arg0, arg1) {
                arg0.stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
            },
            __wbg_set_targets_674b33931e512fb1: function(arg0, arg1, arg2) {
                arg0.targets = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_texture_95f2bfdf7767e76f: function(arg0, arg1) {
                arg0.texture = arg1;
            },
            __wbg_set_texture_a33be3fe02ac6264: function(arg0, arg1) {
                arg0.texture = arg1;
            },
            __wbg_set_timestamp_writes_de6a09f299b71b76: function(arg0, arg1) {
                arg0.timestampWrites = arg1;
            },
            __wbg_set_tone_mapping_320c1aad31db2e7f: function(arg0, arg1) {
                arg0.toneMapping = arg1;
            },
            __wbg_set_topology_b92cfe523bd9653b: function(arg0, arg1) {
                arg0.topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
            },
            __wbg_set_type_43e0092f16775979: function(arg0, arg1) {
                arg0.type = __wbindgen_enum_GpuSamplerBindingType[arg1];
            },
            __wbg_set_type_79cec55caf4cdb6d: function(arg0, arg1) {
                arg0.type = __wbindgen_enum_GpuBufferBindingType[arg1];
            },
            __wbg_set_unclipped_depth_32b7caf29fa5633d: function(arg0, arg1) {
                arg0.unclippedDepth = arg1 !== 0;
            },
            __wbg_set_usage_1ee33d98267e787d: function(arg0, arg1) {
                arg0.usage = arg1 >>> 0;
            },
            __wbg_set_usage_2365e2704b1fdb10: function(arg0, arg1) {
                arg0.usage = arg1 >>> 0;
            },
            __wbg_set_usage_d53ee6f0c7aedbfa: function(arg0, arg1) {
                arg0.usage = arg1 >>> 0;
            },
            __wbg_set_usage_f3e34822998d2147: function(arg0, arg1) {
                arg0.usage = arg1 >>> 0;
            },
            __wbg_set_vertex_77ed7a1229239b5a: function(arg0, arg1) {
                arg0.vertex = arg1;
            },
            __wbg_set_view_dimension_893e2d16561e56e8: function(arg0, arg1) {
                arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
            },
            __wbg_set_view_dimension_f2c5fe4bf927c3fe: function(arg0, arg1) {
                arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
            },
            __wbg_set_view_formats_427069064d8b7139: function(arg0, arg1, arg2) {
                arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_view_formats_9c2f01a6f3b365c7: function(arg0, arg1, arg2) {
                arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
            },
            __wbg_set_view_gpu_texture_view_35f4655788535c4d: function(arg0, arg1) {
                arg0.view = arg1;
            },
            __wbg_set_view_gpu_texture_view_a532c825c52042c0: function(arg0, arg1) {
                arg0.view = arg1;
            },
            __wbg_set_visibility_d8a6821789538c25: function(arg0, arg1) {
                arg0.visibility = arg1 >>> 0;
            },
            __wbg_set_width_4c3a2252e0dea033: function(arg0, arg1) {
                arg0.width = arg1 >>> 0;
            },
            __wbg_set_width_b20525f5f4df4eb8: function(arg0, arg1) {
                arg0.width = arg1 >>> 0;
            },
            __wbg_set_width_f52a20e39808b138: function(arg0, arg1) {
                arg0.width = arg1 >>> 0;
            },
            __wbg_set_write_mask_42d89f182ade6b2d: function(arg0, arg1) {
                arg0.writeMask = arg1 >>> 0;
            },
            __wbg_set_x_f470b03dd54724cd: function(arg0, arg1) {
                arg0.x = arg1 >>> 0;
            },
            __wbg_set_y_4c44eb40ebca5bfc: function(arg0, arg1) {
                arg0.y = arg1 >>> 0;
            },
            __wbg_set_z_2e6820ef0f5821ed: function(arg0, arg1) {
                arg0.z = arg1 >>> 0;
            },
            __wbg_static_accessor_GLOBAL_8eb4cd83130a11a0: function() {
                const ret = typeof global === 'undefined' ? null : global;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_GLOBAL_THIS_1e7044f654e934db: function() {
                const ret = typeof globalThis === 'undefined' ? null : globalThis;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_SELF_d8b50611246a6d92: function() {
                const ret = typeof self === 'undefined' ? null : self;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_WINDOW_fd0bc376bf0f8b42: function() {
                const ret = typeof window === 'undefined' ? null : window;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_stringify_54b3d9b61602aee6: function() { return handleError(function (arg0) {
                const ret = JSON.stringify(arg0);
                return ret;
            }, arguments); },
            __wbg_submit_077c85cc28e36892: function(arg0, arg1, arg2) {
                arg0.submit(getArrayJsValueViewFromWasm0(arg1, arg2));
            },
            __wbg_textureIndices_bde06cd8e0cd5356: function(arg0) {
                const ret = arg0.textureIndices;
                return ret;
            },
            __wbg_then_7a850dae4493f353: function(arg0, arg1, arg2) {
                const ret = arg0.then(arg1, arg2);
                return ret;
            },
            __wbg_then_b830475380919203: function(arg0, arg1) {
                const ret = arg0.then(arg1);
                return ret;
            },
            __wbg_unconfigure_835307f58dc68d80: function(arg0) {
                arg0.unconfigure();
            },
            __wbg_unmap_6a96b14c9ef5f7f5: function(arg0) {
                arg0.unmap();
            },
            __wbg_update_6c1c53cf4de1d4df: function(arg0) {
                arg0.update();
            },
            __wbg_values_d919cd4ccfe2000f: function(arg0) {
                const ret = arg0.values;
                return ret;
            },
            __wbg_vertexPositions_4019d339e1a56605: function(arg0) {
                const ret = arg0.vertexPositions;
                return ret;
            },
            __wbg_vertexUvs_59ddd80cecb4b24c: function(arg0) {
                const ret = arg0.vertexUvs;
                return ret;
            },
            __wbg_writeBuffer_f4bb3f54adfe1330: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
                arg0.writeBuffer(arg1, arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
            }, arguments); },
            __wbg_writeTexture_30e592e8c061c3d9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
                arg0.writeTexture(arg1, getArrayU8FromWasm0(arg2, arg3), arg4, arg5);
            }, arguments); },
            __wbindgen_generic_0000000000000001: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 391, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_);
                return ret;
            },
            __wbindgen_generic_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 266, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_);
                return ret;
            },
            __wbindgen_generic_0000000000000003: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 266, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__44);
                return ret;
            },
            __wbindgen_generic_0000000000000004: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 266, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__45);
                return ret;
            },
            __wbindgen_generic_0000000000000005: function(arg0) {
                // Cast intrinsic for `F64 -> Externref`.
                const ret = arg0;
                return ret;
            },
            __wbindgen_generic_0000000000000006: function(arg0, arg1) {
                // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
                const ret = getArrayU8FromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_generic_0000000000000007: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./sse_web_bg.js": import0,
        };
    }

    function wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true_(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__44(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__44(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__45(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___wasm_bindgen_cc3ff3a8281c7cff___sys__JsNullable_wgpu_c28a05c088e5c7da___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_cc3ff3a8281c7cff___JsError___true__45(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
        wasm.wasm_bindgen_cc3ff3a8281c7cff___convert__closures_____invoke___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined___js_sys_eede1cec0af79838___Function_fn_wasm_bindgen_cc3ff3a8281c7cff___JsValue_____wasm_bindgen_cc3ff3a8281c7cff___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
    }


    const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];


    const __wbindgen_enum_GpuAutoLayoutMode = ["auto"];


    const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"];


    const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];


    const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];


    const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];


    const __wbindgen_enum_GpuCanvasToneMappingMode = ["standard", "extended"];


    const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];


    const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];


    const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];


    const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];


    const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


    const __wbindgen_enum_GpuLoadOp = ["load", "clear"];


    const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];


    const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


    const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];


    const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];


    const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];


    const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];


    const __wbindgen_enum_GpuStoreOp = ["store", "discard"];


    const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];


    const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];


    const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16unorm", "r16snorm", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16unorm", "rg16snorm", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16unorm", "rgba16snorm", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];


    const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];


    const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];


    const __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"];


    const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];
    const FrameRendererFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_framerenderer_free(ptr, 1));
    const SessionFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_session_free(ptr, 1));

    function addToExternrefTable0(obj) {
        const idx = wasm.__externref_table_alloc();
        wasm.__wbindgen_externrefs.set(idx, obj);
        return idx;
    }

    const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

    function debugString(val) {
        // primitive types
        const type = typeof val;
        if (type == 'number' || type == 'boolean' || val == null) {
            return  `${val}`;
        }
        if (type == 'string') {
            return `"${val}"`;
        }
        if (type == 'symbol') {
            const description = val.description;
            if (description == null) {
                return 'Symbol';
            } else {
                return `Symbol(${description})`;
            }
        }
        if (type == 'function') {
            const name = val.name;
            if (typeof name == 'string' && name.length > 0) {
                return `Function(${name})`;
            } else {
                return 'Function';
            }
        }
        // objects
        if (Array.isArray(val)) {
            const length = val.length;
            let debug = '[';
            if (length > 0) {
                debug += debugString(val[0]);
            }
            for(let i = 1; i < length; i++) {
                debug += ', ' + debugString(val[i]);
            }
            debug += ']';
            return debug;
        }
        // Test for built-in
        const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
        let className;
        if (builtInMatches && builtInMatches.length > 1) {
            className = builtInMatches[1];
        } else {
            // Failed to match the standard '[object ClassName]'
            return toString.call(val);
        }
        if (className == 'Object') {
            // we're a user defined class or Object
            // JSON.stringify avoids problems with cycles, and is generally much
            // easier than looping through ownProperties of `val`.
            try {
                return 'Object(' + JSON.stringify(val) + ')';
            } catch (_) {
                return 'Object';
            }
        }
        // errors
        if (val instanceof Error) {
            return `${val.name}: ${val.message}\n${val.stack}`;
        }
        // TODO we could test for more things here, like `Set`s and `Map`s.
        return className;
    }

    function getArrayF32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    function getArrayI32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    function getArrayJsValueFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        const mem = getDataViewMemory0();
        const result = [];
        for (let i = ptr; i < ptr + 4 * len; i += 4) {
            result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
        }
        wasm.__externref_drop_slice(ptr, len);
        return result;
    }

    function getArrayJsValueViewFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        const mem = getDataViewMemory0();
        const result = [];
        for (let i = ptr; i < ptr + 4 * len; i += 4) {
            result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
        }
        return result;
    }

    function getArrayU16FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
    }

    function getArrayU32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    let cachedDataViewMemory0 = null;
    function getDataViewMemory0() {
        if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
            cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
        }
        return cachedDataViewMemory0;
    }

    let cachedFloat32ArrayMemory0 = null;
    function getFloat32ArrayMemory0() {
        if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
            cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
        }
        return cachedFloat32ArrayMemory0;
    }

    let cachedInt32ArrayMemory0 = null;
    function getInt32ArrayMemory0() {
        if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
            cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
        }
        return cachedInt32ArrayMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint16ArrayMemory0 = null;
    function getUint16ArrayMemory0() {
        if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
            cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
        }
        return cachedUint16ArrayMemory0;
    }

    let cachedUint32ArrayMemory0 = null;
    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function handleError(f, args) {
        try {
            return f.apply(this, args);
        } catch (e) {
            const idx = addToExternrefTable0(e);
            wasm.__wbindgen_exn_store(idx);
        }
    }

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function makeMutClosure(arg0, arg1, f) {
        const state = { a: arg0, b: arg1, cnt: 1 };
        const real = (...args) => {

            // First up with a closure we increment the internal reference
            // count. This ensures that the Rust closure environment won't
            // be deallocated while we're invoking it.
            state.cnt++;
            const a = state.a;
            state.a = 0;
            try {
                return f(a, state.b, ...args);
            } finally {
                state.a = a;
                real._wbg_cb_unref();
            }
        };
        real._wbg_cb_unref = () => {
            if (--state.cnt === 0) {
                wasm.__wbindgen_destroy_closure(state.a, state.b);
                state.a = 0;
                CLOSURE_DTORS.unregister(state);
            }
        };
        CLOSURE_DTORS.register(real, state, state);
        return real;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArrayJsValueToWasm0(array, malloc) {
        const ptr = malloc(array.length * 4, 4) >>> 0;
        for (let i = 0; i < array.length; i++) {
            const add = addToExternrefTable0(array[i]);
            getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
        }
        WASM_VECTOR_LEN = array.length;
        return ptr;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    function takeFromExternrefTable0(idx) {
        const value = wasm.__wbindgen_externrefs.get(idx);
        wasm.__externref_table_dealloc(idx);
        return value;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedDataViewMemory0 = null;
        cachedFloat32ArrayMemory0 = null;
        cachedInt32ArrayMemory0 = null;
        cachedUint16ArrayMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (!module.ok) {
                throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
