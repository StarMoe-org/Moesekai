let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * One model on a canvas.
     */
    class Viewer {
        static __wrap(ptr) {
            const obj = Object.create(Viewer.prototype);
            obj.__wbg_ptr = ptr;
            ViewerFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            ViewerFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_viewer_free(ptr, 0);
        }
        /**
         * The model of library bundle `model`, with the motions of bundle `motion` (empty: none),
         * on `canvas`, `width` × `height` pixels. `library` is the library's root in the file table,
         * which holds the model bundle's files; a motion bundle's clips are read from it as they are
         * played, so the worker puts each there first. `seed` picks the blink intervals and breath
         * phase.
         * @param {OffscreenCanvas} canvas
         * @param {string} library
         * @param {string} model
         * @param {string} motion
         * @param {number} width
         * @param {number} height
         * @param {number} seed
         * @returns {Promise<Viewer>}
         */
        static create(canvas, library, model, motion, width, height, seed) {
            const ptr0 = passStringToWasm0(library, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(model, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(motion, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ret = wasm.viewer_create(canvas, ptr0, len0, ptr1, len1, ptr2, len2, width, height, seed);
            return ret;
        }
        /**
         * Draws the model as it is (after a resize or a view change while paused).
         */
        draw() {
            wasm.viewer_draw(this.__wbg_ptr);
        }
        /**
         * Advances the model by `dt` seconds and draws it; returns the name of the body motion
         * that ended in this frame, if one did.
         * @param {number} dt
         * @returns {string | undefined}
         */
        frame(dt) {
            const ret = wasm.viewer_frame(this.__wbg_ptr, dt);
            let v1;
            if (ret[0] !== 0) {
                v1 = getStringFromWasm0(ret[0], ret[1]);
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v1;
        }
        /**
         * @returns {boolean}
         */
        get hasPhysics() {
            const ret = wasm.viewer_hasPhysics(this.__wbg_ptr);
            return ret !== 0;
        }
        /**
         * Starts the body motion `name` (its clip must be in the file table); with `looping`, it
         * starts again whenever it ends.
         * @param {string} name
         * @param {boolean} looping
         */
        playMotion(name, looping) {
            const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.viewer_playMotion(this.__wbg_ptr, ptr0, len0, looping);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * Draws at `width` × `height` pixels from now on.
         * @param {number} width
         * @param {number} height
         */
        resize(width, height) {
            wasm.viewer_resize(this.__wbg_ptr, width, height);
        }
        /**
         * @param {boolean} on
         */
        setBreath(on) {
            wasm.viewer_setBreath(this.__wbg_ptr, on);
        }
        /**
         * Changes the facial to `name` (its clip must be in the file table).
         * @param {string} name
         */
        setFacial(name) {
            const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.viewer_setFacial(this.__wbg_ptr, ptr0, len0);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * @param {boolean} on
         */
        setPhysics(on) {
            wasm.viewer_setPhysics(this.__wbg_ptr, on);
        }
        /**
         * Zoom (≥ 1) and where the framing's centre lands, in NDC (see `framing`).
         * @param {number} zoom
         * @param {number} x
         * @param {number} y
         */
        setView(zoom, x, y) {
            wasm.viewer_setView(this.__wbg_ptr, zoom, x, y);
        }
    }
    if (Symbol.dispose) Viewer.prototype[Symbol.dispose] = Viewer.prototype.free;
    exports.Viewer = Viewer;

    /**
     * The facial a model starts with, of its motion bundle's facials (see `defaults`).
     * @param {string[]} names
     * @returns {string | undefined}
     */
    function defaultFacial(names) {
        const ptr0 = passArrayJsValueToWasm0(names, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.defaultFacial(ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    exports.defaultFacial = defaultFacial;

    /**
     * The body motion a model starts with, of its motion bundle's body motions (see `defaults`).
     * @param {string[]} names
     * @returns {string | undefined}
     */
    function defaultMotion(names) {
        const ptr0 = passArrayJsValueToWasm0(names, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.defaultMotion(ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    exports.defaultMotion = defaultMotion;

    /**
     * Puts a fetched file at `path` in the file table.
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
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_CanvasHeight_86cb5e44c754a3b9: function(arg0) {
                const ret = arg0.CanvasHeight;
                return ret;
            },
            __wbg_CanvasOriginX_1edc5ecf052b1605: function(arg0) {
                const ret = arg0.CanvasOriginX;
                return ret;
            },
            __wbg_CanvasOriginY_76d98dc1758365a9: function(arg0) {
                const ret = arg0.CanvasOriginY;
                return ret;
            },
            __wbg_CanvasWidth_19e5cb7982bb9bfc: function(arg0) {
                const ret = arg0.CanvasWidth;
                return ret;
            },
            __wbg_Error_67e7344beaa85059: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return ret;
            },
            __wbg_PixelsPerUnit_c91bc35a29e4d8ed: function(arg0) {
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
            __wbg__release_3b3632a2624171d9: function() { return handleError(function (arg0) {
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
            __wbg_canvasinfo_c3cce5d684552ceb: function(arg0) {
                const ret = arg0.canvasinfo;
                return ret;
            },
            __wbg_configure_1e2c1c9edad07d26: function() { return handleError(function (arg0, arg1) {
                arg0.configure(arg1);
            }, arguments); },
            __wbg_constantFlags_1d341316cac36120: function(arg0) {
                const ret = arg0.constantFlags;
                return ret;
            },
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
            __wbg_csmGetMocVersion_3d08c30bf9f2042d: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.csmGetMocVersion(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_csmGetVersion_82c47798ca7cc531: function() { return handleError(function (arg0) {
                const ret = arg0.csmGetVersion();
                return ret;
            }, arguments); },
            __wbg_defaultValues_36d93f65fc178d91: function(arg0) {
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
            __wbg_drawables_271ffa2cb7ae2b48: function(arg0) {
                const ret = arg0.drawables;
                return ret;
            },
            __wbg_dynamicFlags_9222ae7949cd931a: function(arg0) {
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
            __wbg_fromArrayBuffer_6a22bf729fdf302d: function() { return handleError(function (arg0, arg1) {
                const ret = arg0.fromArrayBuffer(arg1);
                return ret;
            }, arguments); },
            __wbg_fromMoc_da5e9bb6702c95b0: function() { return handleError(function (arg0, arg1) {
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
            __wbg_getRenderOrders_b64b3f86b16d26d5: function() { return handleError(function (arg0) {
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
            __wbg_ids_73e8de46811e7f08: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_ids_9f32710195f1cbcf: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_ids_c30962478714b097: function(arg0) {
                const ret = arg0.ids;
                return ret;
            },
            __wbg_indices_88876a73a959e41b: function(arg0) {
                const ret = arg0.indices;
                return ret;
            },
            __wbg_initializeAmountOfMemory_5b186c99867507c6: function() { return handleError(function (arg0, arg1) {
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
            __wbg_mapAsync_b0597127f5037286: function(arg0, arg1, arg2, arg3) {
                const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
                return ret;
            },
            __wbg_masks_6e8a8fcf1ffd5ab6: function(arg0) {
                const ret = arg0.masks;
                return ret;
            },
            __wbg_maximumValues_b255e4bf942ca222: function(arg0) {
                const ret = arg0.maximumValues;
                return ret;
            },
            __wbg_message_1cbc5bc03dcf1dee: function(arg0) {
                const ret = arg0.message;
                return ret;
            },
            __wbg_minimumValues_c35962e2fe039e5e: function(arg0) {
                const ret = arg0.minimumValues;
                return ret;
            },
            __wbg_multiplyColors_ce28ba12fed63e73: function(arg0) {
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
                            return wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined_______true_(a, state0.b, arg0, arg1);
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
            __wbg_opacities_30b8bc0df67daa3f: function(arg0) {
                const ret = arg0.opacities;
                return ret;
            },
            __wbg_opacities_b33d19dd7cd03d04: function(arg0) {
                const ret = arg0.opacities;
                return ret;
            },
            __wbg_parameters_9a8e1a8a8825b730: function(arg0) {
                const ret = arg0.parameters;
                return ret;
            },
            __wbg_parts_039c8c052267b348: function(arg0) {
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
            __wbg_release_c488cde3ff92a696: function() { return handleError(function (arg0) {
                arg0.release();
            }, arguments); },
            __wbg_renderOrders_161f0530b6100199: function(arg0) {
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
            __wbg_resetDynamicFlags_155575e496f8fff5: function(arg0) {
                arg0.resetDynamicFlags();
            },
            __wbg_resolve_35ec7e0c6af4c82c: function(arg0) {
                const ret = Promise.resolve(arg0);
                return ret;
            },
            __wbg_screenColors_504c9dc1a595f7d8: function(arg0) {
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
            __wbg_submit_077c85cc28e36892: function(arg0, arg1, arg2) {
                arg0.submit(getArrayJsValueViewFromWasm0(arg1, arg2));
            },
            __wbg_textureIndices_2c2433aee7919fc0: function(arg0) {
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
            __wbg_update_3fa893592b6c544e: function(arg0) {
                arg0.update();
            },
            __wbg_values_8e424bb30ad835d7: function(arg0) {
                const ret = arg0.values;
                return ret;
            },
            __wbg_vertexPositions_ddf271f29cc180c6: function(arg0) {
                const ret = arg0.vertexPositions;
                return ret;
            },
            __wbg_vertexUvs_2fbd9433fe681085: function(arg0) {
                const ret = arg0.vertexUvs;
                return ret;
            },
            __wbg_viewer_new: function(arg0) {
                const ret = Viewer.__wrap(arg0);
                return ret;
            },
            __wbg_writeBuffer_f4bb3f54adfe1330: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
                arg0.writeBuffer(arg1, arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
            }, arguments); },
            __wbg_writeTexture_30e592e8c061c3d9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
                arg0.writeTexture(arg1, getArrayU8FromWasm0(arg2, arg3), arg4, arg5);
            }, arguments); },
            __wbindgen_generic_0000000000000001: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 277, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_);
                return ret;
            },
            __wbindgen_generic_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 27, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_);
                return ret;
            },
            __wbindgen_generic_0000000000000003: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 27, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__16);
                return ret;
            },
            __wbindgen_generic_0000000000000004: function(arg0, arg1) {
                // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 27, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
                const ret = makeMutClosure(arg0, arg1, wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__17);
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
            "./sekai_live2d_viewer_bg.js": import0,
        };
    }

    function wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___JsValue__core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true_(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__16(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__16(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__17(arg0, arg1, arg2) {
        const ret = wasm.wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___wasm_bindgen_13dab8c06ff4562a___sys__JsNullable_wgpu_2a0a4b0a37da1593___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_ed718c3d60ebd546___result__Result_____wasm_bindgen_13dab8c06ff4562a___JsError___true__17(arg0, arg1, arg2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }

    function wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
        wasm.wasm_bindgen_13dab8c06ff4562a___convert__closures_____invoke___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined___js_sys_620190cd17e8d420___Function_fn_wasm_bindgen_13dab8c06ff4562a___JsValue_____wasm_bindgen_13dab8c06ff4562a___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
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
    const ViewerFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_viewer_free(ptr, 1));

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
