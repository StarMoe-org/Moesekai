"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

import MainLayout from "@/components/MainLayout";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import Modal from "@/components/common/Modal";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import BaseFilters, { FilterSection, FilterButton, FilterToggle } from "@/components/common/BaseFilters";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n/characters";
import { getCharacterIconUrl } from "@/lib/assets";
import { THEME_SEED_COLORS } from "@/lib/theme-seeds";
import type { ICardInfo } from "@/types/types";
import {
    BottomSheet,
    Button,
    Card,
    Checkbox,
    Chip,
    CircularProgress,
    ConnectedButtonGroup,
    Dialog,
    Divider,
    Fab,
    IconButton,
    LinearProgress,
    List,
    ListItem,
    LoadingIndicator,
    Menu,
    Radio,
    SegmentedButton,
    Select,
    SideSheet,
    Slider,
    Snackbar,
    Surface,
    Switch,
    Tabs,
    TextField,
    Tooltip,
    type ButtonVariant,
} from "@/components/md3";
import {
    mdAdd,
    mdCheck,
    mdEdit,
    mdFavorite,
    mdFavoriteFill,
    mdFilterList,
    mdInfo,
    mdKeyboardArrowDown,
    mdLibraryMusic,
    mdPalette,
    mdSearch,
    mdSort,
    mdStyle,
    mdCelebration,
    mdMoreVert,
} from "@/components/md3/icons";

const MysekaiScenePreview = dynamic(() => import("@/components/mysekai-preview/MysekaiScenePreview"), {
    ssr: false,
    loading: () => <MysekaiLoading />,
});

function MysekaiLoading() {
    const { t } = useI18n();
    return (
        <div className="flex h-[560px] items-center justify-center gap-3 rounded-md3-xl bg-surface-container text-on-surface-variant">
            <LoadingIndicator size={40} />
            {t("page.designSystem.mysekaiLoading")}
        </div>
    );
}

/* ── Demo data ─────────────────────────────────────────────────────────── */

function demoCard(id: number, characterId: number, rarity: ICardInfo["cardRarityType"], assetbundleName: string, attr: ICardInfo["attr"]): ICardInfo {
    return {
        id,
        seq: id,
        characterId,
        cardRarityType: rarity,
        specialTrainingPower1BonusFixed: 0,
        specialTrainingPower2BonusFixed: 0,
        specialTrainingPower3BonusFixed: 0,
        attr,
        supportUnit: "none",
        skillId: 1,
        cardSkillName: "Skill",
        prefix: "Demo",
        assetbundleName,
        gachaPhrase: "Phrase",
        archiveDisplayType: "normal",
        archivePublishedAt: 0,
        cardParameters: { param1: [], param2: [], param3: [] },
        specialTrainingCosts: [],
        masterLessonAchieveResources: [],
        releaseAt: 0,
        cardSupplyId: 0,
        cardSupplyType: "normal",
    } as ICardInfo;
}

const DEMO_CARDS: Array<{ key: string; card: ICardInfo; trained?: boolean; mastery?: number; width: number; caption: string }> = [
    { key: "c1", card: demoCard(1, 21, "rarity_4", "res021_no018", "cool"), width: 128, caption: "4★" },
    { key: "c2", card: demoCard(2, 21, "rarity_4", "res021_no018", "cool"), trained: true, mastery: 5, width: 128, caption: "4★ · trained · M5" },
    { key: "c3", card: demoCard(3, 21, "rarity_birthday", "birthday_miku_2023", "pure"), width: 128, caption: "Birthday" },
    { key: "c4", card: demoCard(4, 26, "rarity_2", "res026_no002", "happy"), width: 128, caption: "2★" },
    { key: "c5", card: demoCard(5, 1, "rarity_3", "res001_no007", "mysterious"), width: 64, caption: "64px" },
];

const COLOR_ROLES: Array<{ bg: string; fg: string; name: string }> = [
    { bg: "bg-primary", fg: "text-on-primary", name: "primary" },
    { bg: "bg-primary-container", fg: "text-on-primary-container", name: "primary-container" },
    { bg: "bg-secondary", fg: "text-on-secondary", name: "secondary" },
    { bg: "bg-secondary-container", fg: "text-on-secondary-container", name: "secondary-container" },
    { bg: "bg-tertiary", fg: "text-on-tertiary", name: "tertiary" },
    { bg: "bg-tertiary-container", fg: "text-on-tertiary-container", name: "tertiary-container" },
    { bg: "bg-error", fg: "text-on-error", name: "error" },
    { bg: "bg-error-container", fg: "text-on-error-container", name: "error-container" },
];

const SURFACE_ROLES: Array<{ bg: string; name: string }> = [
    { bg: "bg-surface-container-lowest", name: "surface-container-lowest" },
    { bg: "bg-surface-container-low", name: "surface-container-low" },
    { bg: "bg-surface-container", name: "surface-container" },
    { bg: "bg-surface-container-high", name: "surface-container-high" },
    { bg: "bg-surface-container-highest", name: "surface-container-highest" },
    { bg: "bg-inverse-surface text-inverse-on-surface", name: "inverse-surface" },
];

const TYPE_SCALE = [
    "type-display-l", "type-display-m", "type-display-s",
    "type-headline-l", "type-headline-m", "type-headline-s",
    "type-title-l", "type-title-m", "type-title-s",
    "type-body-l", "type-body-m", "type-body-s",
    "type-label-l", "type-label-m", "type-label-s",
] as const;

const SHAPES = [
    { cls: "rounded-md3-xs", name: "xs · 4" },
    { cls: "rounded-md3-sm", name: "sm · 8" },
    { cls: "rounded-md3-md", name: "md · 12" },
    { cls: "rounded-md3-lg", name: "lg · 16" },
    { cls: "rounded-md3-lg-inc", name: "lg+ · 20" },
    { cls: "rounded-md3-xl", name: "xl · 28" },
    { cls: "rounded-md3-xl-inc", name: "xl+ · 32" },
    { cls: "rounded-md3-xxl", name: "xxl · 48" },
    { cls: "rounded-full", name: "full" },
];

const ELEVATIONS = ["shadow-elev-0", "shadow-elev-1", "shadow-elev-2", "shadow-elev-3", "shadow-elev-4", "shadow-elev-5"];

const BUTTON_VARIANTS: ButtonVariant[] = ["filled", "tonal", "outlined", "elevated", "text"];

/* ── Section scaffold ──────────────────────────────────────────────────── */

function Section({ title, hint, icon, children }: { title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="mb-12">
            <div className="mb-4 flex items-center gap-3">
                {icon}
                <h2 className="type-headline-s text-on-surface">{title}</h2>
            </div>
            {hint && <p className="-mt-2 mb-4 max-w-3xl type-body-m text-on-surface-variant">{hint}</p>}
            {children}
        </section>
    );
}

function Code({ children }: { children: React.ReactNode }) {
    return <code className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-[0.8em] text-on-surface-variant">{children}</code>;
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function DesignSystemClient() {
    const { t } = useI18n();
    const { themeCharId, setThemeCharacter } = useTheme();

    // Legacy component demos
    const [modalSize, setModalSize] = useState<"sm" | "md" | "lg" | "xl">("md");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    // MD3 demos
    const [favorite, setFavorite] = useState(true);
    const [chips, setChips] = useState<string[]>(["filter"]);
    const [inputChips, setInputChips] = useState(["Miku", "Rin", "Len"]);
    const [field, setField] = useState("");
    const [switchOn, setSwitchOn] = useState(true);
    const [checked, setChecked] = useState(true);
    const [server, setServer] = useState<"jp" | "cn">("jp");
    const [volume, setVolume] = useState(60);
    const [segment, setSegment] = useState<"cards" | "music" | "events">("cards");
    const [multiSegment, setMultiSegment] = useState<string[]>(["cards"]);
    const [tab, setTab] = useState<"cards" | "music" | "events">("cards");
    const [sort, setSort] = useState("date");
    const [selectValue, setSelectValue] = useState("cards");
    const [snackbar, setSnackbar] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
    const [sideSheetOpen, setSideSheetOpen] = useState(false);

    // Quick filter demo
    const [demoSearch, setDemoSearch] = useState("");
    const [demoSortBy, setDemoSortBy] = useState("name");
    const [demoSortOrder, setDemoSortOrder] = useState<"asc" | "desc">("desc");
    const [demoCategory, setDemoCategory] = useState("all");
    const [demoToggle, setDemoToggle] = useState(false);
    const demoTotalCount = 128;
    const demoFilteredCount = demoSearch || demoCategory !== "all" || demoToggle ? 42 : 128;
    const hasActiveFilters = demoSearch !== "" || demoCategory !== "all" || demoToggle || demoSortBy !== "name";
    const resetDemoFilters = () => {
        setDemoSearch("");
        setDemoSortBy("name");
        setDemoSortOrder("desc");
        setDemoCategory("all");
        setDemoToggle(false);
    };
    const categories = [
        { id: "all", label: t("page.designSystem.categoryAll") },
        { id: "typeA", label: t("page.designSystem.categoryA") },
        { id: "typeB", label: t("page.designSystem.categoryB") },
    ];

    const quickFilterContent = (
        <BaseFilters
            title={t("page.designSystem.quickFilterDemo")}
            filteredCount={demoFilteredCount}
            totalCount={demoTotalCount}
            countUnit={t("page.designSystem.quickFilterUnit")}
            searchQuery={demoSearch}
            onSearchChange={setDemoSearch}
            searchPlaceholder={t("page.designSystem.quickFilterSearch")}
            sortOptions={[
                { id: "name", label: t("page.designSystem.sortName") },
                { id: "date", label: t("page.designSystem.sortDate") },
                { id: "level", label: t("page.designSystem.sortLevel") },
            ]}
            sortBy={demoSortBy}
            sortOrder={demoSortOrder}
            onSortChange={(sortBy, sortOrder) => {
                setDemoSortBy(sortBy);
                setDemoSortOrder(sortOrder);
            }}
            hasActiveFilters={hasActiveFilters}
            onReset={resetDemoFilters}
        >
            <FilterSection label={t("page.designSystem.categoryLabel")}>
                <div className="grid grid-cols-3 gap-2">
                    {categories.map((cat) => (
                        <FilterButton key={cat.id} selected={demoCategory === cat.id} onClick={() => setDemoCategory(cat.id)}>
                            {cat.label}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
            <FilterToggle selected={demoToggle} onClick={() => setDemoToggle((prev) => !prev)} label={t("page.designSystem.onlyCompleted")} />
        </BaseFilters>
    );

    useQuickFilter(t("page.designSystem.quickFilterDemo"), quickFilterContent, [
        demoSearch,
        demoSortBy,
        demoSortOrder,
        demoCategory,
        demoToggle,
        t,
    ]);

    const tabItems = [
        { value: "cards" as const, label: t("page.designSystem.tabCards"), icon: mdStyle },
        { value: "music" as const, label: t("page.designSystem.tabMusic"), icon: mdLibraryMusic },
        { value: "events" as const, label: t("page.designSystem.tabEvents"), icon: mdCelebration },
    ];

    return (
        <MainLayout>
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
                {/* Header */}
                <header className="mb-12">
                    <Chip variant="assist" icon={mdPalette} className="mb-4">
                        {t("page.designSystem.badge")}
                    </Chip>
                    <h1 className="type-display-s text-on-surface sm:type-display-m">{t("page.designSystem.title")}</h1>
                    <p className="mt-3 max-w-3xl type-body-l text-on-surface-variant">{t("page.designSystem.intro")}</p>
                </header>

                {/* Seed */}
                <Section title={t("page.designSystem.seedTitle")} hint={t("page.designSystem.seedHint")}>
                    <Surface tone="card" className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(THEME_SEED_COLORS).map((id) => {
                                const selected = themeCharId === id;
                                const name = getCharacterName(t, Number(id), "short");
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        title={name}
                                        aria-label={name}
                                        aria-pressed={selected}
                                        onClick={() => setThemeCharacter(id)}
                                        className={`focus-ring relative h-12 w-12 overflow-hidden transition-[border-radius] duration-300 ease-md3-standard ${selected ? "rounded-md3-lg ring-[3px] ring-primary ring-offset-2 ring-offset-surface-container-low" : "rounded-full hover:rounded-md3-lg"}`}
                                        style={{ backgroundColor: THEME_SEED_COLORS[id] }}
                                    >
                                        <img src={getCharacterIconUrl(Number(id))} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    </button>
                                );
                            })}
                        </div>
                    </Surface>
                </Section>

                {/* Colors */}
                <Section title={t("page.designSystem.colorsTitle")} hint={t("page.designSystem.colorsHint")}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {COLOR_ROLES.map((role) => (
                            <div key={role.name} className={`flex h-24 flex-col justify-between rounded-md3-lg p-3 ${role.bg} ${role.fg}`}>
                                <span className="type-label-l">{role.name}</span>
                                <span className="font-mono type-label-s opacity-80">on-{role.name}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {SURFACE_ROLES.map((role) => (
                            <div key={role.name} className={`flex h-20 items-end rounded-md3-lg border border-outline-variant p-3 ${role.name === "inverse-surface" ? "text-inverse-on-surface" : "text-on-surface"} ${role.bg}`}>
                                <span className="type-label-m">{role.name}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 type-label-m">
                        <span className="rounded-md3-sm border border-outline px-3 py-2 text-on-surface">outline</span>
                        <span className="rounded-md3-sm border border-outline-variant px-3 py-2 text-on-surface">outline-variant</span>
                        <span className="rounded-md3-sm bg-surface-container px-3 py-2 text-on-surface-variant">on-surface-variant</span>
                    </div>
                </Section>

                {/* Typography */}
                <Section title={t("page.designSystem.typeTitle")}>
                    <Surface tone="card" className="divide-y divide-outline-variant overflow-hidden">
                        {TYPE_SCALE.map((cls) => (
                            <div key={cls} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-6">
                                <span className="w-36 shrink-0 font-mono type-label-m text-on-surface-variant">{cls.replace("type-", "")}</span>
                                <span className={`${cls} min-w-0 truncate text-on-surface`}>{t("page.designSystem.typeSample")}</span>
                            </div>
                        ))}
                    </Surface>
                </Section>

                {/* Shape + elevation */}
                <div className="grid gap-x-8 lg:grid-cols-2">
                    <Section title={t("page.designSystem.shapeTitle")}>
                        <div className="grid grid-cols-3 gap-3">
                            {SHAPES.map((shape) => (
                                <div key={shape.name} className="flex flex-col items-center gap-2">
                                    <div className={`h-16 w-full bg-primary-container ${shape.cls}`} />
                                    <span className="font-mono type-label-s text-on-surface-variant">{shape.name}</span>
                                </div>
                            ))}
                        </div>
                    </Section>
                    <Section title={t("page.designSystem.elevationTitle")} hint={t("page.designSystem.elevationHint")}>
                        <div className="grid grid-cols-3 gap-4">
                            {ELEVATIONS.map((shadow, level) => (
                                <div
                                    key={level}
                                    className={`flex h-16 items-center justify-center rounded-md3-md bg-surface-container-low type-label-l text-on-surface ${shadow}`}
                                >
                                    {level}
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>

                {/* Buttons */}
                <Section title={t("page.designSystem.buttonsTitle")}>
                    <Surface tone="card" className="space-y-5 p-5">
                        {BUTTON_VARIANTS.map((variant) => (
                            <div key={variant} className="flex flex-wrap items-center gap-3">
                                <span className="w-20 font-mono type-label-m text-on-surface-variant">{variant}</span>
                                <Button variant={variant}>{t("page.designSystem.buttonLabel")}</Button>
                                <Button variant={variant} icon={mdAdd}>
                                    {t("page.designSystem.create")}
                                </Button>
                                <Button variant={variant} shape="square">
                                    {t("page.designSystem.buttonLabel")}
                                </Button>
                                <Button variant={variant} disabled>
                                    {t("page.designSystem.buttonLabel")}
                                </Button>
                            </div>
                        ))}
                        <Divider />
                        <div className="flex flex-wrap items-end gap-3">
                            {(["xs", "s", "m", "l"] as const).map((size) => (
                                <Button key={size} size={size} variant="tonal" icon={mdEdit}>
                                    {size.toUpperCase()}
                                </Button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant="filled" color="tertiary">tertiary</Button>
                            <Button variant="tonal" color="secondary">secondary</Button>
                            <Button variant="filled" color="error">error</Button>
                            <Button variant="tonal" selected={favorite} onClick={() => setFavorite((v) => !v)} icon={favorite ? mdFavoriteFill : mdFavorite}>
                                {t("page.designSystem.favorite")}
                            </Button>
                        </div>
                    </Surface>
                </Section>

                {/* Icon buttons & FAB */}
                <Section title={t("page.designSystem.iconButtonsTitle")}>
                    <Surface tone="card" className="flex flex-wrap items-center gap-3 p-5">
                        {(["standard", "filled", "tonal", "outlined"] as const).map((variant) => (
                            <IconButton
                                key={variant}
                                variant={variant}
                                icon={mdFavorite}
                                selectedIcon={mdFavoriteFill}
                                selected={favorite}
                                onClick={() => setFavorite((v) => !v)}
                                label={t("page.designSystem.favorite")}
                            />
                        ))}
                        <IconButton variant="tonal" size="m" width="wide" icon={mdSearch} label={t("common.action.search")} />
                        <span className="mx-2 h-10 w-px bg-outline-variant" />
                        <Fab icon={mdEdit} label={t("page.designSystem.create")} />
                        <Fab icon={mdEdit} label={t("page.designSystem.create")} size="m" color="tertiary-container" />
                        <Fab icon={mdAdd} label={t("page.designSystem.create")} extended color="primary" />
                    </Surface>
                </Section>

                {/* Chips */}
                <Section title={t("page.designSystem.chipsTitle")}>
                    <Surface tone="card" className="flex flex-wrap items-center gap-2 p-5">
                        {["filter", "sort", "owned"].map((id, i) => (
                            <Chip
                                key={id}
                                variant="filter"
                                selected={chips.includes(id)}
                                onClick={() => setChips((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                                trailingIcon={i === 1 ? mdKeyboardArrowDown : undefined}
                            >
                                {t("page.designSystem.chipFilter")} {i + 1}
                            </Chip>
                        ))}
                        <Chip variant="assist" icon={mdInfo}>
                            {t("page.designSystem.chipAssist")}
                        </Chip>
                        <Chip variant="assist" icon={mdInfo} elevated>
                            {t("page.designSystem.chipAssist")}
                        </Chip>
                        <Chip variant="suggestion">{t("page.designSystem.chipSuggestion")}</Chip>
                        {inputChips.map((name) => (
                            <Chip key={name} variant="input" onRemove={() => setInputChips((prev) => prev.filter((x) => x !== name))} removeLabel={t("common.md3.clear")}>
                                {name}
                            </Chip>
                        ))}
                    </Surface>
                </Section>

                {/* Inputs */}
                <Section title={t("page.designSystem.inputsTitle")}>
                    <Surface tone="card" className="grid gap-6 p-5 sm:grid-cols-2">
                        <TextField
                            variant="outlined"
                            label={t("page.designSystem.fieldLabel")}
                            icon={mdSearch}
                            value={field}
                            onValueChange={setField}
                            clearable
                            clearLabel={t("common.md3.clear")}
                            supportingText={t("page.designSystem.fieldSupport")}
                            maxLength={40}
                        />
                        <TextField variant="filled" label={t("page.designSystem.fieldLabel")} value={field} onValueChange={setField} supportingText={t("page.designSystem.fieldSupport")} />
                        <TextField variant="outlined" label={t("page.designSystem.fieldLabel")} defaultValue="" errorText={t("page.designSystem.fieldError")} />
                        <TextField variant="filled" label={t("page.designSystem.fieldLabel")} defaultValue="" disabled />
                    </Surface>
                </Section>

                <Section title={t("page.designSystem.selectTitle")}>
                    <Surface tone="card" className="grid gap-6 p-5 sm:grid-cols-2">
                        <Select label={t("page.designSystem.selectLabel")} value={selectValue} onValueChange={setSelectValue} options={tabItems.map(({ value, label }) => ({ value, label }))} />
                        <Select searchable dense label={t("page.designSystem.selectSearchLabel")} value={selectValue} onValueChange={setSelectValue} options={tabItems.map(({ value, label }) => ({ value, label }))} />
                    </Surface>
                </Section>

                {/* Selection */}
                <Section title={t("page.designSystem.selectionTitle")}>
                    <Surface tone="card" className="grid gap-6 p-5 md:grid-cols-2">
                        <div className="space-y-4">
                            <Switch checked={switchOn} onCheckedChange={setSwitchOn} label={t("page.designSystem.switchLabel")} description={t("page.designSystem.switchDesc")} />
                            <div className="flex items-center gap-4">
                                <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label={t("page.designSystem.switchLabel")} />
                                <Switch checked={!switchOn} onCheckedChange={(v) => setSwitchOn(!v)} icons={false} aria-label={t("page.designSystem.switchLabel")} />
                                <Switch checked={false} onCheckedChange={() => undefined} disabled aria-label={t("page.designSystem.switchLabel")} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Checkbox checked={checked} onCheckedChange={setChecked} label={t("page.designSystem.checkboxLabel")} />
                            <Checkbox checked={false} indeterminate onCheckedChange={() => undefined} label={t("page.designSystem.checkboxLabel")} />
                            <div className="flex flex-wrap">
                                <Radio name="ds-server" checked={server === "jp"} onSelect={() => setServer("jp")} label={t("page.designSystem.radioA")} />
                                <Radio name="ds-server" checked={server === "cn"} onSelect={() => setServer("cn")} label={t("page.designSystem.radioB")} />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="mb-1 type-label-l text-on-surface-variant">
                                {t("page.designSystem.sliderLabel")} · {volume}
                            </div>
                            <Slider value={volume} onValueChange={setVolume} showValue aria-label={t("page.designSystem.sliderLabel")} />
                        </div>
                    </Surface>
                </Section>

                {/* Segmented & tabs */}
                <Section title={t("page.designSystem.segmentedTitle")}>
                    <Surface tone="card" className="space-y-6 p-5">
                        <SegmentedButton
                            value={segment}
                            onValueChange={setSegment}
                            options={tabItems.map(({ value, label }) => ({ value, label }))}
                            aria-label={t("page.designSystem.segmentedTitle")}
                        />
                        <SegmentedButton
                            multiple
                            value={multiSegment}
                            onValueChange={setMultiSegment}
                            options={tabItems.map(({ value, label, icon }) => ({ value, label, icon }))}
                        />
                        <ConnectedButtonGroup value={segment} onValueChange={setSegment} options={tabItems} />
                        <Tabs items={tabItems} value={tab} onValueChange={setTab} aria-label={t("page.designSystem.segmentedTitle")} />
                        <Tabs items={tabItems.map(({ value, label }) => ({ value, label }))} value={tab} onValueChange={setTab} variant="secondary" />
                    </Surface>
                </Section>

                {/* Progress */}
                <Section title={t("page.designSystem.progressTitle")}>
                    <Surface tone="card" className="flex flex-wrap items-center gap-8 p-5">
                        <LoadingIndicator aria-label={t("common.md3.loading")} />
                        <LoadingIndicator contained aria-label={t("common.md3.loading")} />
                        <CircularProgress aria-label={t("common.md3.loading")} />
                        <CircularProgress value={volume / 100} aria-label={t("page.designSystem.sliderLabel")} />
                        <div className="w-full space-y-4">
                            <LinearProgress aria-label={t("common.md3.loading")} />
                            <LinearProgress value={volume / 100} aria-label={t("page.designSystem.sliderLabel")} />
                        </div>
                    </Surface>
                </Section>

                {/* Menu, list, tooltip, snackbar */}
                <Section title={t("page.designSystem.menuTitle")}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Surface tone="card" className="flex flex-wrap items-start gap-3 p-5">
                            <Menu
                                anchor={(props) => (
                                    <Button {...props} variant="outlined" icon={mdSort} trailingIcon={mdKeyboardArrowDown}>
                                        {t("page.designSystem.menuOpen")}
                                    </Button>
                                )}
                                items={[
                                    { key: "date", label: t("page.designSystem.menuItemA"), selected: sort === "date", onSelect: () => setSort("date") },
                                    { key: "name", label: t("page.designSystem.menuItemB"), selected: sort === "name", onSelect: () => setSort("name") },
                                    { key: "level", label: t("page.designSystem.menuItemC"), selected: sort === "level", onSelect: () => setSort("level") },
                                ]}
                            />
                            <Menu
                                align="end"
                                anchor={(props) => <IconButton {...props} icon={mdMoreVert} label={t("common.md3.more")} />}
                                items={[
                                    { key: "edit", label: t("page.designSystem.create"), icon: mdEdit },
                                    { key: "fav", label: t("page.designSystem.favorite"), icon: mdFavorite },
                                    { key: "filter", label: t("page.designSystem.chipFilter"), icon: mdFilterList, dividerBefore: true },
                                ]}
                            />
                            <Tooltip label={t("page.designSystem.tooltip")}>
                                <IconButton icon={mdInfo} label={t("page.designSystem.tooltip")} />
                            </Tooltip>
                            <Button variant="tonal" onClick={() => setSnackbar(true)}>
                                {t("page.designSystem.snackbarShow")}
                            </Button>
                        </Surface>
                        <Surface tone="card" className="overflow-hidden">
                            <List>
                                <ListItem icon={mdStyle} headline={t("page.designSystem.listHeadline")} supportingText={t("page.designSystem.listSupport")} onClick={() => undefined} trailingText="100+" />
                                <ListItem icon={mdLibraryMusic} headline={t("page.designSystem.listHeadline")} selected onClick={() => undefined} />
                                <ListItem
                                    leading={<Checkbox checked={checked} onCheckedChange={setChecked} aria-label={t("page.designSystem.checkboxLabel")} />}
                                    headline={t("page.designSystem.checkboxLabel")}
                                />
                            </List>
                        </Surface>
                    </div>
                    <Snackbar
                        open={snackbar}
                        onClose={() => setSnackbar(false)}
                        message={t("page.designSystem.snackbarMessage")}
                        actionLabel={t("page.designSystem.snackbarAction")}
                        onAction={() => setFavorite(false)}
                    />
                </Section>

                {/* Dialogs & sheets */}
                <Section title={t("page.designSystem.dialogTitle")}>
                    <Surface tone="card" className="flex flex-wrap gap-3 p-5">
                        <Button variant="filled" onClick={() => setDialogOpen(true)}>
                            {t("page.designSystem.dialogOpen")}
                        </Button>
                        <Button variant="tonal" onClick={() => setBottomSheetOpen(true)}>
                            {t("page.designSystem.bottomSheetOpen")}
                        </Button>
                        <Button variant="outlined" onClick={() => setSideSheetOpen(true)}>
                            {t("page.designSystem.sideSheetOpen")}
                        </Button>
                    </Surface>
                    <Dialog
                        isOpen={dialogOpen}
                        onClose={() => setDialogOpen(false)}
                        icon={mdCheck}
                        title={t("page.designSystem.dialogHeadline")}
                        supportingText={t("page.designSystem.dialogBody")}
                        actions={
                            <>
                                <Button variant="text" onClick={() => setDialogOpen(false)}>
                                    {t("common.action.cancel")}
                                </Button>
                                <Button variant="text" onClick={() => setDialogOpen(false)}>
                                    {t("common.action.confirm")}
                                </Button>
                            </>
                        }
                    />
                    <BottomSheet isOpen={bottomSheetOpen} onClose={() => setBottomSheetOpen(false)} title={t("page.designSystem.sheetTitle")}>
                        <p className="type-body-m text-on-surface-variant">{t("page.designSystem.sheetBody")}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {categories.map((cat) => (
                                <Chip key={cat.id} selected={demoCategory === cat.id} onClick={() => setDemoCategory(cat.id)}>
                                    {cat.label}
                                </Chip>
                            ))}
                        </div>
                    </BottomSheet>
                    <SideSheet isOpen={sideSheetOpen} onClose={() => setSideSheetOpen(false)} title={t("page.designSystem.sheetTitle")}>
                        <p className="type-body-m text-on-surface-variant">{t("page.designSystem.sheetBody")}</p>
                        <div className="mt-4 space-y-4">
                            <Switch checked={switchOn} onCheckedChange={setSwitchOn} label={t("page.designSystem.switchLabel")} />
                            <Switch checked={checked} onCheckedChange={setChecked} label={t("page.designSystem.checkboxLabel")} />
                        </div>
                    </SideSheet>
                </Section>

                {/* Legacy shared components */}
                <Section title={t("page.designSystem.legacyTitle")} hint={t("page.designSystem.legacyHint")}>
                    <Card variant="outlined" className="p-5">
                        <div className="flex flex-wrap gap-3">
                            {(["sm", "md", "lg", "xl"] as const).map((size) => (
                                <Button
                                    key={size}
                                    variant={size === "md" ? "filled" : "outlined"}
                                    onClick={() => {
                                        setModalSize(size);
                                        setIsModalOpen(true);
                                    }}
                                >
                                    {t("page.designSystem.modalOpen", { size })}
                                </Button>
                            ))}
                            <Button variant="tonal" onClick={() => setIsImageModalOpen(true)}>
                                {t("page.designSystem.imagePreviewOpen")}
                            </Button>
                        </div>
                        <div className="mt-4 space-y-1 font-mono type-body-s text-on-surface-variant">
                            <div>{`<Modal isOpen onClose title size="sm | md | lg | xl">…</Modal>`}</div>
                            <div>{`<ImagePreviewModal isOpen onClose title imageUrl fileName />`}</div>
                        </div>
                    </Card>
                    <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t("page.designSystem.modalDemoTitle")} size={modalSize}>
                        <p className="type-body-m text-on-surface-variant">{t("page.designSystem.modalDemoBody", { size: modalSize })}</p>
                    </Modal>
                    <ImagePreviewModal
                        isOpen={isImageModalOpen}
                        onClose={() => setIsImageModalOpen(false)}
                        title={t("page.designSystem.imagePreviewTitle")}
                        imageUrl="/sticker-maker/img/ichika/ichika1.png"
                        alt={t("page.designSystem.imagePreviewTitle")}
                        fileName="design_system_image_preview.png"
                    />
                </Section>

                {/* Card thumbnails */}
                <Section title={t("page.designSystem.cardThumbTitle")}>
                    <Surface tone="card" className="flex flex-wrap items-end gap-8 p-6">
                        {DEMO_CARDS.map((demo) => (
                            <div key={demo.key} className="flex flex-col items-center gap-2">
                                <SekaiCardThumbnail card={demo.card} trained={demo.trained} mastery={demo.mastery} width={demo.width} />
                                <span className="font-mono type-label-s text-on-surface-variant">{demo.caption}</span>
                            </div>
                        ))}
                    </Surface>
                </Section>

                {/* Quick filter */}
                <Section title={t("page.designSystem.quickFilterTitle")} hint={t("page.designSystem.quickFilterHint")}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Surface tone="card" className="p-5">
                            {quickFilterContent}
                        </Surface>
                        <Surface tone="card" className="space-y-1 p-5 font-mono type-body-s text-on-surface-variant">
                            <div>search: &quot;{demoSearch}&quot;</div>
                            <div>
                                sortBy: &quot;{demoSortBy}&quot; / order: &quot;{demoSortOrder}&quot;
                            </div>
                            <div>category: &quot;{demoCategory}&quot;</div>
                            <div>toggle: {String(demoToggle)}</div>
                            <div>
                                filtered: {demoFilteredCount} / {demoTotalCount}
                            </div>
                            <div className="pt-3">
                                <Code>{`useQuickFilter(title, <BaseFilters …/>, deps)`}</Code>
                            </div>
                        </Surface>
                    </div>
                </Section>

                {/* MySekai preview */}
                <Section title={t("page.designSystem.mysekaiTitle")}>
                    <Surface tone="card" className="p-4 sm:p-6">
                        <MysekaiScenePreview heightClassName="h-[560px] min-h-[480px]" compact />
                    </Surface>
                </Section>
            </div>
        </MainLayout>
    );
}
