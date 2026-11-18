"use client";

import ExternalLink from "@/components/ExternalLink";
import { Icon } from "@/components/md3";
import { mdHelp, mdKeyboardArrowDown } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { ASSET_VIEWS } from "@/lib/assetTree";

const EXPORTER_REPO = "https://github.com/StarMoe-org/sekai-exporter";
const RESEKAI_REPO = "https://github.com/MetaSekaiLab/ReSekai";

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

const FILE_KINDS = ["assetJson", "glb", "texture", "moc3", "physics", "motion", "cues", "mp3", "mp4", "image", "bytes", "json"] as const;
const FILE_EXAMPLES: Record<(typeof FILE_KINDS)[number], string> = {
    assetJson: "*.asset.json",
    glb: "*.glb",
    texture: "texture/<n>.png",
    moc3: "*.moc3",
    physics: "physics.json",
    motion: "motion/*.json · facial/*.json",
    cues: "cues.json",
    mp3: "*.mp3",
    mp4: "*.mp4",
    image: "*.png · *.webp",
    bytes: "*.bytes · *.txt",
    json: "*.json",
};

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

/** Pages that explain the terms the questions use, by the key of their label under `page.assetGuide.faq.refs`. */
const REFERENCES = {
    hca: "https://www.criware.com/en/products/adx2.html",
    bs1387: "https://www.itu.int/rec/R-REC-BS.1387",
    bs1116: "https://www.itu.int/rec/R-REC-BS.1116",
    peaq: "https://en.wikipedia.org/wiki/Perceptual_Evaluation_of_Audio_Quality",
    snr: "https://en.wikipedia.org/wiki/Signal-to-noise_ratio",
    masking: "https://en.wikipedia.org/wiki/Auditory_masking",
    flac: "https://xiph.org/flac/",
    generationLoss: "https://en.wikipedia.org/wiki/Generation_loss",
    transcoding: "https://en.wikipedia.org/wiki/Transcoding",
    gapless: "https://en.wikipedia.org/wiki/Gapless_playback",
    vgmstream: "https://github.com/vgmstream/vgmstream",
    sekaiCodec: `${EXPORTER_REPO}/tree/main/crates/sekai-codec`,
    sofdec2: "https://www.criware.com/en/products/sofdec2.html",
    mpeg1: "https://en.wikipedia.org/wiki/MPEG-1",
    h264: "https://en.wikipedia.org/wiki/Advanced_Video_Coding",
    chroma: "https://en.wikipedia.org/wiki/Chroma_subsampling",
    vmaf: "https://github.com/Netflix/vmaf",
    jnd: "https://streaminglearningcenter.com/codecs/finding-the-just-noticeable-difference-with-netflix-vmaf.html",
    vmaf93: "https://www.realnetworks.com/sites/default/files/vmaf_reproducibility_ieee.pdf",
    cridecoder: "https://github.com/Team-Haruki/cridecoder",
} as const;

/** A question of the guide: paragraphs, a list of points, more paragraphs, an optional callout and the references. */
interface Question {
    name: "audio" | "training" | "video" | "videoQuality";
    lead: readonly string[];
    points: readonly string[];
    close: readonly string[];
    callout?: string;
    references: readonly (keyof typeof REFERENCES)[];
}

const QUESTIONS: readonly Question[] = [
    {
        name: "audio",
        lead: ["format", "source", "measured"],
        points: ["listening", "waveform", "size"],
        close: ["export"],
        callout: "official",
        references: ["hca", "bs1387", "bs1116", "peaq", "snr", "masking", "flac", "vgmstream", "sekaiCodec"],
    },
    {
        name: "training",
        lead: ["answer"],
        points: ["compound", "perception", "alignment", "mixing"],
        close: ["advice"],
        references: ["generationLoss", "transcoding", "gapless", "vgmstream", "sekaiCodec"],
    },
    {
        name: "video",
        lead: ["format", "source"],
        points: ["browsers", "compat", "others"],
        close: [],
        references: ["sofdec2", "mpeg1", "h264"],
    },
    {
        name: "videoQuality",
        lead: ["answer", "measured"],
        points: ["vmaf", "kept", "audio"],
        close: ["original"],
        references: ["vmaf", "jnd", "vmaf93", "chroma", "generationLoss", "cridecoder"],
    },
];

function Faq({ question }: { question: Question }) {
    const { t } = useI18n();
    const key = (name: string) => t(`page.assetGuide.faq.${question.name}.${name}`);
    return (
        <details className="group rounded-md3-lg bg-tertiary-container/30">
            <summary className="focus-ring flex cursor-pointer list-none items-start gap-2 rounded-md3-lg p-4 type-title-s text-on-surface [&::-webkit-details-marker]:hidden">
                <Icon path={mdHelp} size={20} className="mt-0.5 shrink-0 text-tertiary" />
                <span className="flex-1">{key("question")}</span>
                <Icon
                    path={mdKeyboardArrowDown}
                    size={20}
                    className="mt-0.5 shrink-0 text-on-surface-variant transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="space-y-3 px-4 pb-4">
                {question.lead.map(name => <Paragraph key={name}>{key(name)}</Paragraph>)}
                <ul className="list-disc space-y-1.5 pl-5 type-body-m text-on-surface-variant">
                    {question.points.map(name => <li key={name}>{key(name)}</li>)}
                </ul>
                {question.close.map(name => <Paragraph key={name}>{key(name)}</Paragraph>)}
                {question.callout && (
                    <p className="rounded-md3-lg bg-surface-container px-4 py-3 type-body-m text-on-surface">{key(question.callout)}</p>
                )}
                <p className="type-body-s text-on-surface-variant">
                    {t("page.assetGuide.faq.references")}{" "}
                    {question.references.map((name, i) => (
                        <span key={name}>
                            {i > 0 && " · "}
                            <ExternalLink href={REFERENCES[name]} className="text-primary hover:underline">
                                {t(`page.assetGuide.faq.refs.${name}`)}
                            </ExternalLink>
                        </span>
                    ))}
                </p>
            </div>
        </details>
    );
}

/** The common questions about the formats of the published assets, each with what was measured and its references. */
export function AssetFaq() {
    return (
        <div className="space-y-3">
            {QUESTIONS.map(question => <Faq key={question.name} question={question} />)}
        </div>
    );
}

/** The guide to the published assets: where they come from, the views, what is exported and why. */
export function AssetGuide() {
    const { t, locale } = useI18n();
    const link = "text-primary hover:underline";
    return (
        <div className="space-y-6">
            <Section title={t("page.assetGuide.source.title")}>
                <Paragraph>{t("page.assetGuide.source.body")}</Paragraph>
                <ExternalLink href={EXPORTER_REPO} className={`type-label-l ${link}`}>
                    {t("page.assetGuide.source.docs")}
                </ExternalLink>
            </Section>

            <Section title={t("page.assetGuide.viewsSection.title")}>
                <Paragraph>{t("page.assetGuide.viewsSection.body")}</Paragraph>
                <dl className="space-y-2 rounded-md3-lg bg-surface-container p-4">
                    {ASSET_VIEWS.map(view => (
                        <div key={view}>
                            <dt className="type-title-s text-on-surface">{t(`page.assetGuide.views.${view}.label`)}</dt>
                            <dd className="type-body-s text-on-surface-variant">{t(`page.assetGuide.views.${view}.summary`)}</dd>
                        </div>
                    ))}
                </dl>
            </Section>

            <Section title={t("page.assetGuide.principle.title")}>
                <Paragraph>{t("page.assetGuide.principle.p1")}</Paragraph>
                <Paragraph>{t("page.assetGuide.principle.p2")}</Paragraph>
                <Paragraph>{t("page.assetGuide.principle.p3")}</Paragraph>
            </Section>

            <Section title={t("page.assetGuide.unity.title")}>
                <Paragraph>{t("page.assetGuide.unity.intro")}</Paragraph>
                <ul className="list-disc space-y-1.5 pl-5 type-body-m text-on-surface-variant">
                    {(["r1", "r2", "r3", "r4"] as const).map(reason => (
                        <li key={reason}>{t(`page.assetGuide.unity.${reason}`)}</li>
                    ))}
                </ul>
                <p className="rounded-md3-lg bg-secondary-container/45 px-4 py-3 type-body-m text-on-surface">
                    {t("page.assetGuide.unity.resekai")}{" "}
                    <ExternalLink href={RESEKAI_REPO} className={link}>MetaSekaiLab/ReSekai</ExternalLink>
                </p>
            </Section>

            <Section title={t("page.assetGuide.files.title")}>
                <Paragraph>{t("page.assetGuide.files.body")}</Paragraph>
                <dl className="divide-y divide-outline-variant/60 rounded-md3-lg bg-surface-container">
                    {FILE_KINDS.map(kind => (
                        <div key={kind} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                            <dt className="font-mono type-label-m text-on-surface">{FILE_EXAMPLES[kind]}</dt>
                            <dd className="type-body-s text-on-surface-variant">{t(`page.assetGuide.files.${kind}`)}</dd>
                        </div>
                    ))}
                </dl>
            </Section>

            <Section title={t("page.assetGuide.api.title")}>
                <Paragraph>{t("page.assetGuide.api.body")}</Paragraph>
                <ExternalLink href={docUrl("serving", locale)} className={`type-label-l ${link}`}>
                    {t("page.assetGuide.api.serving")}
                </ExternalLink>
            </Section>
        </div>
    );
}
