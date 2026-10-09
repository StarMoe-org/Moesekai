# Material 3 (Expressive) 迁移规范

> 适用范围：`web/` 全部 UI。取代旧的 iOS 26 毛玻璃 / 浮岛规范（`docs/style-unification-progress.md` 仅作历史参考）。

## 1. 体系总览

| 层 | 位置 | 说明 |
|---|---|---|
| 种子色 | `src/lib/theme-seeds.json` | 26 位角色主题色，`defaultSeedId = 21`（Miku）。`CHAR_COLORS` 由此派生 |
| 配色生成 | `scripts/generate-md3-schemes.mjs` → `src/styles/md3-schemes.css` | 「中性舞台，角色原色」（spec 2021）：页面、卡片、描边等表面色是一组与角色无关的冷调中性灰；角色色只用于强调。`primary-container` 就是角色原色（实心填充，文字取近黑或白，≥ 4.5:1），`primary` / `secondary` 是同色板上对卡片 ≥ 4.5:1 的文字强调色，`secondary-container` 是原色在卡片上的淡染（文字 ≥ 7:1）；第三色取 TonalSpot 的色相旋转，提高彩度后同样分为文字、实心、淡染三种。另输出 `surface-card`（卡片底色）、`--md-ext-brand-mark`（标题荧光笔底纹，见下文）与固定的 warning/success。运行时只切换 `<html data-seed data-theme>` |
| 图标生成 | `scripts/generate-material-symbols.mjs` → `src/components/md3/icons.generated.ts` | 扫描源码中 `from "@/components/md3/icons"` 的导入，只打包用到的 Material Symbols Rounded |
| Token | `src/styles/md3-tokens.css` | Tailwind `@theme`：颜色、形状、阴影、动效、字体层级、`state-layer`、`focus-ring`、`dark:` 变体（基于 `data-theme`） |
| 游戏例外 | `src/styles/legacy-games.css` | 仅为 guess-who / guess-jacket / goods-gacha 保留旧样式，选择器由 `<html data-legacy-game="true">` 限定；全站兼容层已删除 |
| 组件原语 | `src/components/md3/*` | `import { Button, Card, … } from "@/components/md3"` |
| 动效 | `src/lib/motion.ts` | `md3SpatialFast/Default/Slow`、`md3EffectsFast/Default/Slow`、MD3 easing |

生成命令：`bun run generate:md3`（`dev` / `build` 已自动执行）。新增图标只需在代码里 `import { mdXxx } from "@/components/md3/icons"` 后重新运行。

图标命名：`md` + PascalCase(symbol) [+ `Fill`]，例如 `arrow_back` → `mdArrowBack`，`favorite` 填充版 → `mdFavoriteFill`。
可用名称参见 https://fonts.google.com/icons （注意新版 `expand_more` 已更名为 `keyboard_arrow_down`）。

## 2. 页面迁移规则（每个文件必须满足）

1. **颜色只用语义角色**：`bg-surface*`、`bg-surface-container{-lowest|-low||-high|-highest}`、`text-on-surface`、`text-on-surface-variant`、`bg-primary text-on-primary`、`bg-primary-container text-on-primary-container`、`bg-secondary-container text-on-secondary-container`、`bg-tertiary*`、`bg-error*`、`bg-warning*` / `bg-success*`（固定语义色，不随种子变化）、`border-outline`、`border-outline-variant`、`bg-scrim/32`、`bg-inverse-surface text-inverse-on-surface`。
   - 禁止：`slate-*`、`gray-*`、`zinc-*`、`white`、`black`、`dark:*`、`miku`、`luka`、`text-primary-text`、`var(--color-miku)`、`glass-card`、`ios-glass-*`、`island-*`、`material-*`、`backdrop-blur*`、`pressable`、`type-title`/`type-body`/`type-caption`/`type-display`（旧）、`--surface-*`/`--text-*`/`--border-*` 等旧变量。
   - 明暗模式由 token 自动处理，**不要写 `dark:`**。
   - 角色官方色（徽章、角色色条）用 `bg-char-<id>` / `text-char-<id>` 或 `var(--md-ext-color-char-<id>)`；属性色、稀有度色、谱面难度色等**游戏数据色**可保留原值（它们不是主题色）。
2. **形状**：卡片 `rounded-md3-md`（默认）/`rounded-md3-lg`/`rounded-md3-xl`（大面板、hero）；chip `rounded-md3-sm`；执行动作的按钮 `rounded-full`；输入与选择类控件（输入框、下拉框、分段按钮、搜索框）统一 `rounded-md3-md`、默认 40px 高（只有带内嵌标签的填充式输入框是 48px），同一行里不要混用胶囊与方角；手写输入框也按这个尺寸（`h-10 px-3 type-body-m rounded-md3-md`）；对话框 `rounded-md3-xl`。不要用 `rounded-2xl/3xl`。
3. **字体层级**：`type-display-{l,m,s}`、`type-headline-{l,m,s}`、`type-title-{l,m,s}`、`type-body-{l,m,s}`、`type-label-{l,m,s}`，需要强调时叠加 `type-emphasized`。不要再用 `text-xs font-bold uppercase tracking-wider` 这类组合当小标题，改用 `type-title-s` 或 `type-label-l`。
   - display / headline / title-l 默认字重 600；非 en-US 界面字距归零，`type-body-{l,m}` 行高放宽到约 1.6。新代码最小字号 11px（`type-label-s`），不要再写 `text-[8px]`～`text-[10px]`。
   - 字体：Roboto Flex 只负责拉丁字符，CJK 走各语言的系统字体（`--md-ref-typeface-cjk` 按 `data-ui-locale` 切换），不再自托管 Noto Sans SC/JP。
   - 页面主标题：`type-headline-m`（移动端）/`type-headline-l`（≥ expanded）。区块标题：`type-title-l`。卡片标题：`type-title-m`。正文：`type-body-m`/`type-body-l`。
4. **层级**：浅色用 `shadow-elev-{0..5}`（卡片 elevated 用 1，悬停 2，菜单 2，FAB 3，对话框 3）。每一级都由三层组成：1px 细描边，一层贴近元素的淡阴影，一层向下偏移、负扩散的散射阴影。阴影色是冷调墨色 `--md3-shadow-ink`；深色模式下改为一道极淡的亮边来表现浮起。不要换回 M3 默认那组 30% 加 15% 的纯黑阴影，它会把卡片边缘糊成一圈灰。不要用 `shadow-lg/xl/2xl`、彩色阴影（`shadow-miku/20`）。表面层级优先用 tonal surface-container 区分。卡片与面板底色统一用 `bg-surface-card`（`Surface tone="card"`；`SectionCard` 默认即是）（浅色 = lowest 白、深色 = container-low），静止无阴影时加 `border-outline-variant/70` 细描边。选中态（分段按钮、筛选芯片、难度等选项）用实心的 `primary-container`，不再加对勾；未选中的筛选芯片和图标按钮用实心的 `surface-container-high`，不用细描边框（一面板的描边框看上去是平的）；分段按钮是一条 `surface-container-high` 底槽，选中段填色，段高与 32px 芯片一致；次要按钮、导航当前项、提示条等安静的强调用淡染的 `secondary-container`。`primary-container` 是角色原色，只用在小面积的选中与徽标上；MoeSekai logo（`MOE_LOGO_URL` 遮罩）也用它，不要用压暗过的 `primary`。亮色模式下浅色角色色当文字看不清，所以要显示角色色的大字不改字色，改加原色底纹：`PageHeader` 的 `highlight` 用 `.brand-mark` 荧光笔底纹（文字保持 on-surface，底纹 `--md-ext-brand-mark` 由生成器按角色算出：文字压在上面仍 ≥ 4.5:1 时就是原色，深色角色调淡），眉题用中性的 `on-surface-variant`，让底纹成为页头唯一的强调色。缺图占位、加载遮罩等大面积底色用 `surface-container-high`。游戏里固定含义的颜色（难度 `DIFFICULTY_COLORS`、属性、组合）用游戏标准色，不跟随角色。
5. **交互状态**：可点击元素加 `state-layer`（hover/focus/pressed 覆盖层，自动取 currentColor）+ `focus-ring`。不要用 `hover:scale-*`、`active:scale-*`、`hover:-translate-y-*`。
6. **组件优先**：按钮→`Button`/`IconButton`/`Fab`；卡片→`Card`/`Surface`；筛选标签→`Chip` 或 `BaseFilters` 的 `FilterButton`；输入→`TextField`（IME 安全）；开关→`Switch`/`Checkbox`/`Radio`；分段→`SegmentedButton`/`ConnectedButtonGroup`（默认撑满整行；传 `className="w-auto"` 或 `w-fit` 时按最长一段等宽收窄；网格/列表切换这类纯图标分段传 `iconOnly`，文字标签会作为无障碍名称和提示）；一组动作按钮→`ButtonGroup`（按下的加宽、相邻的让出）；标签页→`Tabs`；弹窗→`Dialog`（或保留 `common/Modal`，API 不变）；底部/侧边面板→`BottomSheet`/`SideSheet`；菜单→`Menu`；加载→`LoadingIndicator`/`CircularProgress`/`LinearProgress`（确定进度可加 `wavy`）；列表→`List`/`ListItem`；提示→`Tooltip`/`Snackbar`。
7. **图标**：通用 UI 图标（搜索、关闭、箭头、筛选、排序、下载、分享、设置…）用 `<Icon path={mdXxx} />`。业务图形（稀有度星、属性图标、谱面 SVG、logo、角色/团体图标）保留。
8. **动效**：framer-motion 用 `md3Spatial*`（位移/尺寸/形状）与 `md3Effects*`（颜色/透明度）；CSS 用 `ease-md3-*` 与 `duration-*`。必须尊重 `useReducedMotion()`。
9. **不改动**：数据逻辑、URL query param 同步、`useScrollRestore`、SEO metadata、i18n key 语义；`page.tsx` 不动。新增/改动的用户可见文案必须补齐 5 个语言（`zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`）。
10. **导出 / 截图区域**（chart-image、sticker-maker、deck 分享图、`?mode=screenshot`）：需要稳定配色时在容器上加 `data-seed="21" data-theme="light"`，避免随用户主题变化。

## 2.1 页面模式原语（`components/md3/Patterns.tsx`）

所有列表/详情页统一使用：

| 场景 | 用法 |
|---|---|
| 页面容器 | `<PageContainer>`（替代 `container mx-auto px-4 sm:px-6 py-8`；超宽数据页加 `wide`） |
| 页面标题 | `<PageHeader eyebrow={t("…badge")} title={t("…title")} highlight={t("…titleHighlight")} description={…} actions={…} />`；列表/数据页一律用默认的左对齐（标题、简介、操作同一行，内容尽量留在首屏）。只有正文本身是居中窄栏的页面（授权卡片、入口页、表单）才传 `align="center"`，让标题与正文同轴 |
| 错误 | `<ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />` |
| 警告/提示条 | `<Banner tone="warning" | "info" | "error" title=… >…</Banner>` |
| 空态 | `<EmptyState title={t("common.state.noResult")} />` |
| 加载 | `<LoadingState label={t("common.state.loading")} />` |
| 加载更多 | `<LoadMore label={t("…loadMore")} shown={displayed.length} total={filtered.length} onLoadMore={loadMore} allLoadedLabel={…} />`（保留 `data-shortcut-load-more`） |
| 内容分区 | `<SectionCard title=… icon={mdXxx} actions=…>…</SectionCard>` |

## 3. 常见替换速查

| 旧 | 新 |
|---|---|
| `ios-glass-card rounded-3xl p-6` | `<Surface tone="low" className="p-6">` 或 `<Card variant="filled" className="p-6">` |
| `glass-card` / `material-regular` / `island-panel` | `bg-surface-container rounded-md3-xl` |
| `ios-glass-btn ios-glass-btn-primary px-6 py-2 rounded-full` | `<Button variant="filled">` |
| `ios-glass-btn` | `<Button variant="tonal">` 或 `variant="outlined"` |
| `island-chip island-chip-active` | `<Chip selected>` |
| `ios-glass-input` | `<TextField variant="outlined">` |
| `ios-glass-tab` / `ios-glass-tab-active` | `<Tabs>` 或 `<SegmentedButton>` |
| `text-slate-800 dark:text-slate-100` | `text-on-surface` |
| `text-slate-500 dark:text-slate-400` / `text-slate-400` | `text-on-surface-variant` |
| `border-slate-200 dark:border-slate-700` | `border-outline-variant` |
| `bg-white dark:bg-slate-800` | `bg-surface-container-lowest` / `bg-surface-container-low` |
| `bg-slate-50` / `bg-slate-100` | `bg-surface-container` / `bg-surface-container-high` |
| `bg-miku text-white` | `bg-primary text-on-primary` |
| `bg-miku/10 text-miku` | `bg-primary-container text-on-primary-container`（或 secondary-container） |
| `text-miku` | `text-primary` |
| `bg-black/35 backdrop-blur` | `bg-scrim/32` |
| `bg-gradient-to-r from-miku to-luka bg-clip-text text-transparent` | `text-primary`（MD3 不使用渐变文字） |
| `.loading-spinner` | `<LoadingIndicator />` |
| `<span className="w-1.5 h-6 bg-miku rounded-full" />`（标题色条） | 删除，或改为 `<Icon path={…} className="text-primary" />` |
| `bg-red-50 text-red-600` 错误提示 | `bg-error-container text-on-error-container` |
| `bg-amber-*` 警告 | `bg-tertiary-container text-on-tertiary-container` |

## 4. 自检

迁移完成的文件运行：

```bash
rg -nP "slate-|gray-|bg-white|text-white|dark:|glass|island-|material-(thin|regular|thick|chrome)|backdrop-blur|pressable|\bmiku\b|bg-miku|text-miku|primary-text" <file>
```

结果只允许出现第 2.1 条中的游戏数据色例外。然后运行：

```bash
bun run generate:md3 && bun run lint:md3 && bun run test:md3 && npx tsc --noEmit -p . && bun run lint && bun run lint:i18n && bun run lint:i18n-usage
```
