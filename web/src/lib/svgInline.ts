/**
 * Replaces external image hrefs with data URLs so the SVG can be shown via <img>
 * (isolating its stylesheet from the page) and exported to PNG without tainting
 * the canvas. Mirrors upstream sekai-sus2img's inlineSvgImages.
 */
export async function inlineSvgImages(svgText: string): Promise<string> {
    const hrefs = Array.from(
        new Set(
            [...svgText.matchAll(/href="([^"]+)"/g)]
                .map((match) => match[1])
                .filter((href) => href && !href.startsWith("#") && !href.startsWith("data:"))
        )
    );

    const dataUrls = new Map<string, string>();
    await Promise.all(
        hrefs.map(async (href) => {
            try {
                const res = await fetch(href);
                if (!res.ok) return;
                const blob = await res.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result ?? ""));
                    reader.onerror = () => reject(new Error("read failed"));
                    reader.readAsDataURL(blob);
                });
                dataUrls.set(href, dataUrl);
            } catch {
                // keep original href when fetch fails (e.g. CORS) — it still renders in-browser
            }
        })
    );

    let inlined = svgText;
    for (const [href, dataUrl] of dataUrls) {
        inlined = inlined.replaceAll(`href="${href}"`, `href="${dataUrl}"`);
    }
    return inlined;
}
