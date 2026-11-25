/**
 * Brotli decoding for official story assets fetched by the in-page story agent. The WASM
 * decoder loads on first use, so pages that never run the agent do not download it.
 */
export async function decodeStoryBrotli(compressed: Uint8Array): Promise<Uint8Array> {
    const { default: brotliPromise } = await import("brotli-dec-wasm");
    const brotli = await brotliPromise;
    return brotli.decompress(compressed);
}
