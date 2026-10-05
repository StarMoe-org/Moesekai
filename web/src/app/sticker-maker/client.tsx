"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import NextImage from "next/image";
import ExternalLink from "@/components/ExternalLink";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { Button, EmptyState, Icon, PageContainer, PageHeader, SectionCard, SegmentedButton, Surface, Switch } from "@/components/md3";
import { mdAdd, mdCheck, mdContentCopy, mdDownload, mdFormatColorReset, mdSentimentSatisfied, mdUpload } from "@/components/md3/icons";

const STICKER_MAKER_BASE_URL = "https://moe.exmeaning.com/sticker-maker";

// Types
interface CharacterData {
    id: string;
    name: string;
    character: string;
    img: string;
    color: string;
    defaultText: {
        text: string;
        x: number;
        y: number;
        r: number;
        s: number;
    };
}

// Character ID mapping (string to number)
const CHAR_ID_MAP: Record<string, number> = {
    "ichika": 1, "saki": 2, "honami": 3, "shiho": 4,
    "minori": 5, "haruka": 6, "airi": 7, "shizuku": 8,
    "kohane": 9, "an": 10, "akito": 11, "toya": 12,
    "tsukasa": 13, "emu": 14, "nene": 15, "rui": 16,
    "kanade": 17, "mafuyu": 18, "ena": 19, "mizuki": 20,
    "miku": 21, "rin": 22, "len": 23, "luka": 24, "meiko": 25, "kaito": 26
};

// Available Fonts
const DEFAULT_FONTS: FontOption[] = [
    { name: "MaokenAssortedSans", labelKey: "page.stickerMaker.defaultFontLabel", file: "MaokenAssortedSans-Lite.ttf" },
];

interface FontOption {
    name: string;
    label?: string;
    labelKey?: string;
    file?: string;
    isCustom?: boolean;
}

// ==================== RangeSlider Component ====================
function RangeSlider({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step?: number;
}) {
    return (
        <div className="flex items-center gap-3">
            <label className="min-w-[4rem] whitespace-nowrap type-label-l text-on-surface-variant">
                {label}
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                onPointerDown={() => {
                    // Fix for mobile: Blur active element (like textarea) when touching slider
                    // to prevent keyboard from popping up or staying open
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                }}
                className="focus-ring h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary-container accent-primary
                    [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-elev-1"
            />
            <span className="min-w-[2rem] text-right font-mono type-label-m text-on-surface-variant">
                {typeof value === "number" ? (Number.isInteger(step) ? value : value.toFixed(1)) : value}
            </span>
        </div>
    );
}

// ==================== Main StickerMakerContent ====================
export default function StickerMakerContent() {
    const { t, formatNumber } = useI18n();

    // Data
    const [allStickers, setAllStickers] = useState<CharacterData[]>([]);

    // Filters
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);

    // Editor State
    const [selectedSticker, setSelectedSticker] = useState<CharacterData | null>(null);
    const [bgColor, setBgColor] = useState<"transparent" | "white">("transparent");
    const [text, setText] = useState("");
    const [position, setPosition] = useState({ x: 148, y: 58 });
    const [fontSize, setFontSize] = useState(47);
    const [textColor, setTextColor] = useState("");
    const [spaceSize, setSpaceSize] = useState(1);
    const [charSpacing, setCharSpacing] = useState(0);
    const [rotate, setRotate] = useState(-2);
    const [curve, setCurve] = useState(false);
    const [fontFamily, setFontFamily] = useState("MaokenAssortedSans");
    const [customFonts, setCustomFonts] = useState<FontOption[]>([]);

    // Canvas State
    const [loaded, setLoaded] = useState(false);
    const [fontsReady, setFontsReady] = useState(false);
    const [copied, setCopied] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    // Identifies the newest requested sticker so a slower earlier load cannot
    // overwrite it.
    const imgLoadSeqRef = useRef(0);
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const stickerFileInputRef = useRef<HTMLInputElement>(null);

    // Load characters.json
    useEffect(() => {
        fetch(`${STICKER_MAKER_BASE_URL}/characters.json?v=${new Date().getTime()}`)
            .then((r) => r.json())
            .then((data: CharacterData[]) => {
                setAllStickers(data);
            });
    }, []);

    // Load fonts
    useEffect(() => {
        const loadFonts = async () => {
            const fontPromises = DEFAULT_FONTS.filter(f => f.file).map(async (font) => {
                const f = new FontFace(font.name, `url(${STICKER_MAKER_BASE_URL}/fonts/${font.file})`);
                try {
                    await f.load();
                    document.fonts.add(f);
                } catch (e) {
                    console.error(`Failed to load font ${font.name}`, e);
                }
            });
            await Promise.all(fontPromises);
            setFontsReady(true);
        };
        loadFonts();
    }, []);

    const allFonts = useMemo(() => [...DEFAULT_FONTS, ...customFonts], [customFonts]);

    // Handle Custom Font Upload
    const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const fontName = `CustomFont_${Date.now()}`;
            const fontFace = new FontFace(fontName, buffer);

            await fontFace.load();
            document.fonts.add(fontFace);

            const newFontOption: FontOption = {
                name: fontName,
                label: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                isCustom: true
            };

            setCustomFonts(prev => [...prev, newFontOption]);
            setFontFamily(fontName);

            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("Error loading custom font:", error);
            alert(t("page.stickerMaker.errors.fontLoadFailed"));
        }
    };



    // Handle Custom Sticker Image Upload
    const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;

            // Create a temporary sticker object
            const customSticker: CharacterData = {
                id: `custom_${Date.now()}`,
                name: t("page.stickerMaker.customImageName"),
                character: "custom", // Or use current selected char
                img: dataUrl,
                color: selectedSticker?.color || "#33CEC3", // Default color or current
                defaultText: {
                    text: t("page.stickerMaker.defaultText"),
                    x: 148,
                    y: 58,
                    r: -2,
                    s: 47
                }
            };

            handleStickerClick(customSticker);
        };
        reader.readAsDataURL(file);

        // Reset input
        if (stickerFileInputRef.current) stickerFileInputRef.current.value = "";
    };

    // Filter Logic
    const handleUnitClick = (unitId: string) => {
        if (selectedUnitIds.includes(unitId)) {
            setSelectedUnitIds(selectedUnitIds.filter((id) => id !== unitId));
        } else {
            setSelectedUnitIds([...selectedUnitIds, unitId]);
        }
        // Reset character if it doesn't belong to new unit selection
        if (selectedCharacterId) {
            // Logic to check if character belongs to remaining units can be complex,
            // for simplicity we might keep it unless strictly required to clear.
            // But let's check if we should clear it.
            // If we deselect a unit that contains the current char, we might want to clear.
            // However, sticking to "if filter allows" is better.
            // Here we just update unit selection.
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const currentUnits = selectedUnitIds.length > 0
        ? UNIT_DATA.filter(u => selectedUnitIds.includes(u.id))
        : [];

    const availableCharacterIds = useMemo(() => {
        if (currentUnits.length > 0) {
            // Flatten charIds from selected units
            return Array.from(new Set(currentUnits.flatMap(u => u.charIds)));
        } else if (selectedUnitIds.length > 0) {
            return [];
        } else {
            // Show all characters if no unit selected? 
            // Or maybe show grouped?
            // Let's show all characters available in stickermaker
            // We can derive this from allStickers, but it's better to use static data
            return Object.values(CHAR_ID_MAP);
        }
    }, [currentUnits, selectedUnitIds]);

    // Derived filtered stickers
    const filteredStickers = useMemo(() => {
        if (!selectedCharacterId) return [];
        return allStickers.filter(s => {
            const charId = CHAR_ID_MAP[s.character];
            return charId === selectedCharacterId;
        });
    }, [allStickers, selectedCharacterId]);

    // Handle Character Selection
    const handleCharacterClick = (charId: number) => {
        if (selectedCharacterId === charId) {
            setSelectedCharacterId(null);
            setSelectedSticker(null); // Clear sticker selection
        } else {
            setSelectedCharacterId(charId);
            setSelectedSticker(null); // Clear sticker selection when changing character
        }
    };

    // Handle Sticker Selection
    const handleStickerClick = (sticker: CharacterData) => {
        setSelectedSticker(sticker);
        // Reset or keep previous settings? Let's reset relevant ones but maybe keep color if desired?
        // Actually, let's keep it simple and reset.
        // setBgColor("transparent"); // Optional: reset background on new sticker? Let's keep user preference.

        // Set defaults from sticker
        // Override "text" default if it is the generic "text"
        setText(sticker.defaultText.text === "text" ? t("page.stickerMaker.defaultText") : sticker.defaultText.text);
        setPosition({ x: sticker.defaultText.x, y: sticker.defaultText.y });
        setRotate(sticker.defaultText.r);
        setFontSize(sticker.defaultText.s);
        setSpaceSize(1);
        setTextColor("");
        setCurve(false);
        // setFontFamily("YurukaStd"); // Keep previous font selection or reset? Let's keep.

        // Scroll to editor
        setTimeout(() => {
            editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);

        // Load image
        setLoaded(false);
        const seq = ++imgLoadSeqRef.current;
        const img = new Image(); // Browser Image
        img.crossOrigin = "anonymous";

        // Check if img is a data URL (custom upload) or path
        const isDataUrl = sticker.img.startsWith("data:") || sticker.img.startsWith("blob:");
        img.src = isDataUrl ? sticker.img : `${STICKER_MAKER_BASE_URL}/img/${sticker.img}`;

        img.onload = () => {
            if (seq !== imgLoadSeqRef.current) return;
            imgRef.current = img;
            setLoaded(true);
        };
    };

    // Draw on canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !loaded || !fontsReady || !selectedSticker) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = 296;
        canvas.height = 256;

        const hRatio = canvas.width / img.width;
        const vRatio = canvas.height / img.height;
        const ratio = Math.min(hRatio, vRatio);
        const centerShiftX = (canvas.width - img.width * ratio) / 2;
        const centerShiftY = (canvas.height - img.height * ratio) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Background
        if (bgColor === "white") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(
            img, 0, 0, img.width, img.height,
            centerShiftX, centerShiftY, img.width * ratio, img.height * ratio
        );

        // Draw Text
        ctx.lineWidth = 9;
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(rotate / 10);
        ctx.textAlign = "center";
        ctx.strokeStyle = "white";
        ctx.fillStyle = textColor || selectedSticker.color;

        const lines = text.split("\n");
        const angle = (Math.PI * text.length) / 7;


        // Helper: get font for char
        const getFont = (char: string) => {
            if (fontFamily !== "Auto") return fontFamily;
            return /[\u4e00-\u9fa5]/.test(char) ? "SSFangTangTi" : "YurukaStd";
        };

        if (curve) {
            for (const line of lines) {
                // Adjust angle step based on charSpacing
                // Radius is roughly 3.5 * fontSize
                // Additional angle = charSpacing / Radius
                const radius = fontSize * 3.5;
                const spacingAngle = charSpacing / radius;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    ctx.font = `${fontSize}px ${getFont(char)}`;

                    // Original rotation logic + spacing adjustment
                    const baseRotation = angle / line.length / 2.5;
                    ctx.rotate(baseRotation + spacingAngle);

                    ctx.save();
                    ctx.translate(0, -1 * fontSize * 3.5);
                    ctx.strokeText(char, 0, 0);
                    ctx.fillText(char, 0, 0);
                    ctx.restore();
                }
            }
        } else {
            let k = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Calculate total width first to center
                let totalWidth = 0;
                const charWidths: number[] = [];

                // Prepare context for measurement
                // Note: We need to set font per char if Auto is selected, 
                // but for width calculation we iterate through chars anyway.

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    ctx.font = `${fontSize}px ${getFont(char)}`;
                    const w = ctx.measureText(char).width;
                    charWidths.push(w);
                    totalWidth += w;
                }

                // Add spacing to total width (n-1 spaces)
                if (line.length > 1) {
                    totalWidth += (line.length - 1) * charSpacing;
                }

                let currentX = -totalWidth / 2;

                ctx.textAlign = "left"; // Draw from left to control spacing manually

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    ctx.font = `${fontSize}px ${getFont(char)}`;

                    ctx.strokeText(char, currentX, k);
                    ctx.fillText(char, currentX, k);

                    currentX += charWidths[j] + charSpacing;
                }

                k += spaceSize;
            }
        }
        ctx.restore();
    }, [loaded, fontsReady, selectedSticker, text, position, fontSize, spaceSize, charSpacing, rotate, curve, fontFamily, bgColor, textColor]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Download
    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (!canvas || !selectedSticker) return;
        const link = document.createElement("a");
        link.download = `${selectedSticker.name}_sticker.png`;
        link.href = canvas.toDataURL();
        link.click();
    };

    // Copy
    const handleCopy = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        try {
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
                const ClipboardItemCtor = (window as Window & { ClipboardItem?: ClipboardItemConstructor }).ClipboardItem;
                if (!ClipboardItemCtor) {
                    alert(t("page.stickerMaker.errors.clipboardUnsupported"));
                    return;
                }
                await navigator.clipboard.write([
                    new ClipboardItemCtor({ "image/png": blob }),
                ]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        } catch {
            alert(t("page.stickerMaker.errors.copyFailed"));
        }
    };

    return (
        <MainLayout>
            <PageContainer className="pb-12">
                {/* Page Header */}
                <PageHeader
                    align="center"
                    eyebrow={t("page.stickerMaker.badge")}
                    title={t("page.stickerMaker.title")}
                    highlight={t("page.stickerMaker.titleHighlight")}
                    description={t("page.stickerMaker.description")}
                />

                <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
                    {/* Left Sidebar: Filters & Selection */}
                    <div className="w-full flex-shrink-0 space-y-6 lg:w-96">
                        {/* Unit Filter */}
                        <SectionCard title={t("page.stickerMaker.sections.unitFilter")}>
                            <div className="flex flex-wrap gap-2">
                                {UNIT_DATA.map(unit => {
                                    const iconName = UNIT_ICON_FILES[unit.id] || "";
                                    const unitLabel = t(UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`);
                                    const active = selectedUnitIds.includes(unit.id);
                                    return (
                                        <button
                                            key={unit.id}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => handleUnitClick(unit.id)}
                                            className={`state-layer focus-ring rounded-md3-md p-1.5 transition-colors duration-150 ease-md3-standard ${active
                                                ? "bg-secondary-container ring-2 ring-primary"
                                                : "bg-transparent"
                                                }`}
                                            title={unitLabel}
                                        >
                                            <div className="relative h-8 w-8">
                                                <NextImage
                                                    src={`/data/icon/${iconName}`}
                                                    alt={unitLabel}
                                                    fill
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        {/* Character Filter */}
                        <SectionCard title={t("page.stickerMaker.sections.characterSelect")}>
                            <div className="flex flex-wrap gap-2">
                                {availableCharacterIds.map(charId => {
                                    const characterName = getCharacterName(t, charId);
                                    const active = selectedCharacterId === charId;
                                    return (
                                        <button
                                            key={charId}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => handleCharacterClick(charId)}
                                            className={`focus-ring relative rounded-full ring-2 transition-[opacity,filter,box-shadow] duration-150 ease-md3-standard ${active
                                                ? "z-10 shadow-elev-1 ring-primary"
                                                : "opacity-80 ring-transparent grayscale hover:opacity-100 hover:ring-outline-variant hover:grayscale-0"
                                                }`}
                                            title={characterName}
                                        >
                                            <div className="h-10 w-10 overflow-hidden rounded-full bg-surface-container-high">
                                                <NextImage
                                                    src={getCharacterIconUrl(charId)}
                                                    alt={characterName}
                                                    width={40}
                                                    height={40}
                                                    className="h-full w-full object-cover"
                                                    unoptimized
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        {/* Sticker Grid */}
                        {selectedCharacterId && (
                            <SectionCard title={t("page.stickerMaker.sections.stickerSelect", { count: formatNumber(filteredStickers.length) })}>
                                <div className="max-h-[400px] min-h-0 overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* Custom Upload Button */}
                                        <button
                                            type="button"
                                            onClick={() => stickerFileInputRef.current?.click()}
                                            className="state-layer focus-ring relative flex aspect-[296/256] flex-col items-center justify-center gap-1 overflow-hidden rounded-md3-sm border-2 border-dashed border-outline-variant text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                                            title={t("page.stickerMaker.uploadCustomImageTitle")}
                                        >
                                            <Icon path={mdUpload} size={32} />
                                            <span className="type-label-m">{t("page.stickerMaker.uploadImage")}</span>
                                        </button>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            ref={stickerFileInputRef}
                                            className="hidden"
                                            onChange={handleStickerUpload}
                                        />

                                        {filteredStickers.map((sticker) => (
                                            <button
                                                key={sticker.id}
                                                type="button"
                                                onClick={() => handleStickerClick(sticker)}
                                                className={`state-layer focus-ring relative overflow-hidden rounded-md3-sm border-2 transition-colors ${selectedSticker?.id === sticker.id
                                                    ? "border-primary shadow-elev-1"
                                                    : "border-transparent hover:border-outline-variant"
                                                    }`}
                                            >
                                                <img
                                                    src={`${STICKER_MAKER_BASE_URL}/img/${sticker.img}`}
                                                    alt={sticker.name}
                                                    loading="lazy"
                                                    className="aspect-[296/256] w-full bg-surface-container object-contain"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </SectionCard>
                        )}
                    </div>

                    {/* Right Area: Editor */}
                    <div className="flex-1" ref={editorRef}>
                        {!selectedSticker ? (
                            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-md3-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-8">
                                <EmptyState
                                    icon={mdSentimentSatisfied}
                                    title={t("page.stickerMaker.emptyTitle")}
                                    description={t("page.stickerMaker.emptyDescription")}
                                />
                            </div>
                        ) : (
                            <Surface tone="low" radius="xl" className="sticker-editor-container grid grid-cols-1 gap-6 p-6 text-on-surface md:grid-cols-2 lg:p-8">
                                {/* Canvas Area */}
                                <div className="order-2 mb-4 mt-4 flex flex-col items-center gap-6 md:order-1 md:col-span-2 md:mb-8 md:mt-0">
                                    <div className="group relative">
                                        {/* Canvas Wrapper */}
                                        <div className="flex items-center gap-4">
                                            <div
                                                data-seed="21"
                                                data-theme="light"
                                                className="relative overflow-hidden rounded-md3-lg border-4 border-surface-container-lowest bg-surface-container-high shadow-elev-3"
                                                style={{ width: 296, height: 256 }}
                                            >
                                                <canvas
                                                    ref={canvasRef}
                                                    width={296}
                                                    height={256}
                                                    className="block"
                                                />
                                            </div>

                                            {/* Vertical Y Control */}
                                            <div className="flex h-[256px] w-8 justify-center rounded-full bg-surface-container-high py-4">
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={256}
                                                    step={1}
                                                    value={curve ? 256 - position.y + fontSize * 3 : 256 - position.y}
                                                    onChange={(e) =>
                                                        setPosition({
                                                            ...position,
                                                            y: curve
                                                                ? 256 + fontSize * 3 - Number(e.target.value)
                                                                : 256 - Number(e.target.value),
                                                        })
                                                    }
                                                    onPointerDown={() => {
                                                        if (document.activeElement instanceof HTMLElement) {
                                                            document.activeElement.blur();
                                                        }
                                                    }}
                                                    className="h-full w-2 cursor-pointer accent-primary"
                                                    style={{
                                                        writingMode: "vertical-lr",
                                                        direction: "rtl",
                                                        WebkitAppearance: "slider-vertical",
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Horizontal X Control */}
                                        <div className="mt-4 w-[296px]">
                                            <input
                                                type="range"
                                                min={0}
                                                max={296}
                                                step={1}
                                                value={position.x}
                                                onChange={(e) =>
                                                    setPosition({ ...position, x: Number(e.target.value) })
                                                }
                                                onPointerDown={() => {
                                                    if (document.activeElement instanceof HTMLElement) {
                                                        document.activeElement.blur();
                                                    }
                                                }}
                                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary-container accent-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Text & Font Controls */}
                                <div className="order-1 space-y-4 md:order-2">
                                    <div>
                                        <label className="mb-2 block type-label-l text-on-surface-variant">
                                            {t("page.stickerMaker.textContent")}
                                        </label>
                                        <textarea
                                            value={text}
                                            onChange={(e) => setText(e.target.value)}
                                            rows={3}
                                            className="w-full resize-none rounded-md3-xs border border-outline bg-transparent px-4 py-3 type-body-l text-on-surface outline-none transition-colors placeholder:text-on-surface-variant focus:border-2 focus:border-primary"
                                            placeholder={t("page.stickerMaker.textPlaceholder")}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block type-label-l text-on-surface-variant">
                                            {t("page.stickerMaker.fontSelect")}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {allFonts.map(font => (
                                                <Button
                                                    key={font.name}
                                                    variant={fontFamily === font.name ? "tonal" : "outlined"}
                                                    selected={fontFamily === font.name ? true : undefined}
                                                    shape="square"
                                                    className="min-w-0 justify-center truncate"
                                                    onClick={() => setFontFamily(font.name)}
                                                    title={font.labelKey ? t(font.labelKey) : font.label}
                                                >
                                                    <span className="truncate">{font.labelKey ? t(font.labelKey) : font.label}</span>
                                                </Button>
                                            ))}

                                            {/* Custom Font Upload Button */}
                                            <Button
                                                variant="text"
                                                shape="square"
                                                icon={mdAdd}
                                                className="justify-center border border-dashed border-outline-variant"
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                {t("page.stickerMaker.customFont")}
                                            </Button>
                                            <input
                                                type="file"
                                                accept=".ttf,.otf,.woff,.woff2"
                                                ref={fileInputRef}
                                                className="hidden"
                                                onChange={handleFontUpload}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Param Sliders */}
                                <div className="order-3 space-y-5 rounded-md3-lg bg-surface-container p-5 md:order-3">
                                    <RangeSlider
                                        label={t("page.stickerMaker.sliders.rotate")}
                                        value={rotate}
                                        onChange={setRotate}
                                        min={-10}
                                        max={10}
                                        step={0.2}
                                    />
                                    <RangeSlider
                                        label={t("page.stickerMaker.sliders.fontSize")}
                                        value={fontSize}
                                        onChange={setFontSize}
                                        min={10}
                                        max={100}
                                    />
                                    <RangeSlider
                                        label={t("page.stickerMaker.sliders.lineSpacing")}
                                        value={spaceSize}
                                        onChange={setSpaceSize}
                                        min={18}
                                        max={100}
                                    />
                                    <RangeSlider
                                        label={t("page.stickerMaker.sliders.charSpacing")}
                                        value={charSpacing}
                                        onChange={setCharSpacing}
                                        min={-10}
                                        max={50}
                                        step={0.5}
                                    />

                                    <div className="border-t border-outline-variant pt-2">
                                        <Switch
                                            checked={curve}
                                            onCheckedChange={setCurve}
                                            label={t("page.stickerMaker.curveText")}
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 border-t border-outline-variant pt-2">
                                        <span className="whitespace-nowrap type-label-l text-on-surface-variant">{t("page.stickerMaker.textColor")}</span>
                                        <label className="focus-ring relative h-7 w-7 flex-shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-outline-variant shadow-elev-1 transition-colors hover:border-primary" title={t("page.stickerMaker.chooseTextColor")}>
                                            <div
                                                className="absolute inset-0 rounded-full"
                                                style={{ backgroundColor: textColor || selectedSticker?.color }}
                                            />
                                            <input
                                                type="color"
                                                value={textColor || selectedSticker?.color || '#000000'}
                                                onChange={(e) => setTextColor(e.target.value)}
                                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            />
                                        </label>
                                        <span className="font-mono type-label-m text-on-surface-variant">
                                            {textColor || selectedSticker?.color}
                                        </span>
                                        {textColor && (
                                            <Button
                                                variant="text"
                                                size="xs"
                                                icon={mdFormatColorReset}
                                                onClick={() => setTextColor("")}
                                                title={t("page.stickerMaker.resetDefaultColor")}
                                            >
                                                {t("page.stickerMaker.reset")}
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 border-t border-outline-variant pt-2">
                                        <span className="type-label-l text-on-surface-variant">
                                            {t("page.stickerMaker.backgroundColor")}
                                        </span>
                                        <SegmentedButton
                                            className="w-auto"
                                            density={-2}
                                            value={bgColor === "white" ? "white" : "transparent"}
                                            onValueChange={(v) => setBgColor(v)}
                                            options={[
                                                { value: "transparent", label: t("page.stickerMaker.transparent") },
                                                { value: "white", label: t("page.stickerMaker.white") },
                                            ]}
                                        />
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="order-4 mt-8 flex items-center justify-center gap-4 border-t border-outline-variant pt-6 md:order-4 md:col-span-2">
                                    <Button variant="tonal" size="m" icon={copied ? mdCheck : mdContentCopy} onClick={handleCopy}>
                                        {copied ? t("page.stickerMaker.copied") : t("page.stickerMaker.copyImage")}
                                    </Button>

                                    <Button variant="filled" size="m" icon={mdDownload} onClick={handleDownload}>
                                        {t("page.stickerMaker.downloadImage")}
                                    </Button>
                                </div>
                            </Surface>
                        )}
                    </div>
                </div>

                {/* Footer / Credits */}
                <div className="mt-12 space-y-2 border-t border-outline-variant pt-8 text-center type-body-m text-on-surface-variant">
                    <p>
                        {t("page.stickerMaker.credits.sourcePrefix")}{" "}
                        <ExternalLink
                            href="https://github.com/TheOriginalAyaka/sekai-stickers"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                            sekai-stickers (TheOriginalAyaka)
                        </ExternalLink>
                    </p>
                    <p>
                        {t("page.stickerMaker.credits.fontLicensePrefix")} <ExternalLink href="https://scripts.sil.org/OFL" target="_blank" rel="noopener noreferrer" className="hover:underline">SIL Open Font License 1.1</ExternalLink>{t("page.stickerMaker.credits.fontLicenseSuffix") ? ` ${t("page.stickerMaker.credits.fontLicenseSuffix")}` : ""}
                    </p>
                    <p className="mt-4 type-body-s text-on-surface-variant/80">
                        {t("page.stickerMaker.credits.localNotice")}
                    </p>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
