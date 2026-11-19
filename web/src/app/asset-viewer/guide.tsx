"use client";

import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";

const EXPORTER_REPO = "https://github.com/StarMoe-org/sekai-exporter";

/** The pages of the exporter documentation, in the reader's language where it has one. */
function docUrl(page: string, locale: string): string {
    const suffix = locale.startsWith("zh") ? ".zh-CN.md" : ".md";
    return `${EXPORTER_REPO}/blob/main/docs/${page}${suffix}`;
}

/** Spec pages named after a document format, and the formats documented on another page. */
const SPEC_PAGES = new Set([
    "action-set", "alone-actions", "audio", "characters", "client-config", "communication-actions",
    "costume", "directory-tree", "emoticons", "episode", "facial-tables", "field-camera",
    "fixture-areas", "fixture-attach-points", "fixture-model", "fixture-reactions", "fixture-talks",
    "live2d", "model", "mysekai-fixtures", "path-index", "publication", "scenario",
    "scenario-background", "scenario-prefab", "site-model", "sprite", "talks", "text", "texture",
    "version-history", "video", "virtual-live-script", "font",
]);
const FORMAT_PAGES: Record<string, string> = {
    "asset": "asset-documents",
    "costume-model": "costume",
    "costume-motion": "costume",
    "emoticon": "emoticons",
    "facial-table": "facial-tables",
    "fixture-meta": "mysekai-fixtures",
    "live2d-model": "live2d",
    "live2d-motions": "live2d",
    "audio-cues": "audio",
    "clip": "clip-documents",
    "components": "component-documents",
    "costume-role": "costume",
    "live2d-motion": "live2d",
    "index-root": "publication",
    "index-shard": "publication",
    "index-chunk": "publication",
    "version-changes": "version-history",
};

/** The spec page of a JSON document's `format` or of an asset form, or the index of the specs when there is none. */
export function formatDocUrl(format: string, locale: string): string {
    const page = FORMAT_PAGES[format] ?? (SPEC_PAGES.has(format) ? format : "README");
    return docUrl(`spec/${page}`, locale);
}

/** What a file is, as the key of its description under `page.assetGuide.files`. */
export function fileKind(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
    const ext = name.slice(name.lastIndexOf(".") + 1);
    if (name.endsWith(".asset.json")) return "assetJson";
    if (name === "cues.json") return "cues";
    if (name === "physics.json" || name.endsWith(".physics3.json")) return "physics";
    if (/(^|\/)(motion|facial)\/[^/]+\.json$/.test(path.toLowerCase())) return "motion";
    if (/(^|\/)texture\/\d+\.\w+$/.test(path.toLowerCase())) return "texture";
    switch (ext) {
        case "glb": return "glb";
        case "moc3": return "moc3";
        case "mp3": return "mp3";
        case "mp4": return "mp4";
        case "png":
        case "webp": return "image";
        case "bytes":
        case "txt": return "bytes";
        case "json": return "json";
        default: return "other";
    }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="type-title-m text-on-surface">{title}</h3>
            {children}
        </section>
    );
}

function Paragraph({ children }: { children: React.ReactNode }) {
    return <p className="type-body-m text-on-surface-variant">{children}</p>;
}

/** Concise attribution to sekai-exporter and plain-language explanation of audio format choices. */
export function AssetGuide() {
    const { t } = useI18n();
    return (
        <div className="space-y-5">
            <Section title={t("page.assetGuide.source.title")}>
                <Paragraph>{t("page.assetGuide.source.body")}</Paragraph>
                <ExternalLink href={EXPORTER_REPO} className="inline-block type-label-l text-primary hover:underline">
                    StarMoe-org/sekai-exporter
                </ExternalLink>
            </Section>

            <Section title={t("page.assetGuide.mp3Note.title")}>
                <Paragraph>{t("page.assetGuide.mp3Note.body")}</Paragraph>
            </Section>
        </div>
    );
}
