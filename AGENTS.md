## 项目概况

这是一个PROJECT SEKAI 的查看器项目。前端 Next.js 16 standalone 应用 (`web/`，页面交互以 CSR 为主并使用服务端 metadata/Route Handlers)，后端 Go API (`internal/`)，部署域名 `pjsk.moe`。

## 技术栈

- **前端**: Next.js 16 (`output: "standalone"`, 服务端路由 + CSR 页面交互), React 19, TypeScript, **Tailwind CSS 4**, framer-motion, echarts
- **后端**: Go (net/http), Redis 缓存 + 内存回退

## 核心架构

### Masterdata — `web/src/lib/fetch.ts`

### 资源管理 — `web/src/lib/assets.ts`

### 类型定义 — `web/src/types/`

## 设计规范 — Material 3 Expressive

- 规范与迁移规则：`web/docs/md3-migration.md`；组件目录与示例：`/design-system`（`web/src/app/design-system/client.tsx`）。
- 配色为 MD3 Dynamic Color：角色主题色作种子（`web/src/lib/theme-seeds.json`），由 `bun run generate:md3` 生成 `src/styles/md3-schemes.css`；运行时只切换 `<html data-seed data-theme>`。
- 页面代码只用语义 token：`bg-surface-container*`、`text-on-surface(-variant)`、`bg-primary text-on-primary`、`border-outline-variant` 等；形状 `rounded-md3-*`；字体 `type-{display|headline|title|body|label}-{l|m|s}`；交互 `state-layer focus-ring`。
- 禁止新增 `slate-*` / `white` / `dark:` / `miku` / glass / island / `backdrop-blur` 类；`src/styles/md3-legacy-bridge.css` 仅为过渡兼容层。
- 图标：`import { mdSearch } from "@/components/md3/icons"` + `<Icon path={mdSearch} />`（Material Symbols Rounded，生成脚本按导入自动打包）。


## 页面模块约定

每个页面遵循以下结构:

```
web/src/app/<module>/
├── page.tsx       # 入口：导出 generateMetadata + 渲染 Client 组件
├── client.tsx     # "use client" 主逻辑组件
├── [id]/          # 动态路由（如适用），页面交互逻辑保持 CSR
└── detail/        # 详情子页（如适用）
```

- `page.tsx` 不要再手写 `export const metadata = ...` 或硬编码 SEO 文案。
- 静态/列表页 metadata 使用 `import { pageMetadata } from "@/lib/seo-metadata";` + `export const generateMetadata = pageMetadata("<seoPageKey>");`。
- 动态详情页 metadata 使用 `getRequestSeoLocale()`、`formatDetailSeoDescription()`、`buildDetailMetadata()` 等 server-safe SEO helper；动态名称可继续来自 masterdata，但固定描述模板必须走 SEO i18n。
- 所有交互逻辑在 `client.tsx` 中实现（`"use client"`）
- 页面使用 `<MainLayout>` 包裹


## 组件复用

| 需求 | 使用 |
|------|------|
| 筛选/排序/搜索面板 | `components/common/BaseFilters.tsx` (`FilterSection`, `FilterButton`, `FilterToggle`) |
| 外部链接 | `components/ExternalLink.tsx` (自动添加离站确认) |
| 卡牌缩略图 | `components/cards/SekaiCardThumbnail.tsx` |
| 页面布局 | `components/MainLayout.tsx` |
| MD3 组件原语 | `components/md3`（`Button` / `IconButton` / `Fab` / `Card` / `Surface` / `Chip` / `TextField` / `Switch` / `Checkbox` / `Radio` / `Slider` / `SegmentedButton` / `Tabs` / `Dialog` / `BottomSheet` / `SideSheet` / `Menu` / `List` / `Snackbar` / `Tooltip`） |
| 弹窗 | `components/common/Modal.tsx`（基于 MD3 `Dialog`）或直接使用 `Dialog` |
| 加载器 | `components/md3` 的 `LoadingIndicator` / `CircularProgress` / `LinearProgress`（旧 `.loading-spinner` 仅兼容） |

## 滚动位置保存 — `hooks/useScrollRestore.ts`

列表页必须使用 `useScrollRestore` hook，实现从详情页返回时恢复滚动位置和已加载数量：

```tsx
const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
    storageKey: "cards",          // 唯一标识，用于 sessionStorage key
    defaultDisplayCount: 30,      // 默认显示数量
    increment: 30,                // "加载更多" 每次增量
    isReady: !isLoading,          // 数据加载完成后再恢复滚动
});
```

- 基于 `sessionStorage`，浏览器关闭即清除
- 筛选条件变化时调用 `resetDisplayCount()` 清空已保存的位置
- 已在卡牌、音乐、活动、扭蛋、服装、称号、贴纸、漫画、家具等 14+ 页面使用

## Query Param 状态管理

筛选/排序/视图等用户状态应同步到 URL query params，使页面状态可分享、可刷新恢复：

```tsx
const searchParams = useSearchParams();
const router = useRouter();

// 读取：初始化时从 URL 恢复状态
useEffect(() => {
    const tag = searchParams.get("tag");
    const sort = searchParams.get("sortBy");
    // ...将 URL 参数应用到组件 state
}, [searchParams]);

// 写入：状态变化时更新 URL（不触发导航）
const updateURL = (params: Record<string, string>) => {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([k, v]) =>
        v ? url.searchParams.set(k, v) : url.searchParams.delete(k)
    );
    window.history.replaceState({}, "", url.toString());
};
```

- 使用 `window.history.replaceState` 更新 URL，**不使用** `router.push/replace`（避免不必要的重渲染）
- 常用 param 命名: `search`, `sortBy`, `sortOrder`, `tag`, `characters`, `units`, `attrs`, `rarities`, `page`, `pageSize`
- 参考实现: `music/client.tsx`, `cards/client.tsx`, `my-cards/client.tsx`

## i18n / SEO 必做项

新功能、新页面、重大 UI 变更必须同步补齐 i18n，不能只写中文或只写英文：

- 用户可见固定文案（标题、说明、按钮、占位符、空态、错误、toast、tooltip、筛选项、tab、badge、弹窗、表单校验）必须放入 `web/src/lib/i18n/messages/zh-CN/index.ts`、`web/src/lib/i18n/messages/en-US/index.ts` 与 `web/src/lib/i18n/messages/ja-JP/index.ts`，组件中通过 `useI18n().t("...")` 使用。
- 新增字典 key 时保持中英日结构一致；优先按现有分区放置：通用复用放 `common.*`，页面专属放 `page.<module>.*`，布局/导航放 `layout.*`。
- 新增枚举/常量给 UI 显示时，常量保存 stable `id` / `value` / `labelKey`，不要直接把中文 label 写进共享常量或工具函数返回值。
- Project SEKAI masterdata、官方角色名/歌曲名/活动名、用户输入、内容页正文可作为边界保留；如果要作为 UI 固定文案展示，需要先设计统一翻译策略。
- 新增页面或路由时必须补 SEO：在 `web/src/lib/seo-keywords.ts` 的 `SEO_PAGE_METADATA` 增加 page key（`zh-CN` / `en-US` title、description、keywords），并在 `page.tsx` 使用 `pageMetadata("<key>")`。
- 新增动态详情页类型时必须补 `DETAIL_SEO_TEMPLATES` / `DETAIL_FALLBACK_TITLES`，并用 `buildDetailMetadata()` 输出 OpenGraph/Twitter/canonical。
- 不要写死 `zh-CN` / `en-US` 二分逻辑；应优先复用 `SUPPORTED_UI_LOCALES`、`UiLocale`、`normalizeUiLocale()`、`SEO_LOCALE_CONFIG`。语言选择器不使用国旗；涉及 `tw` / `TW` 的显示使用中性服务器/区域缩写（如 `繁中 (TW)` / `TW`），避免政治敏感或国别化表述。
- 当前没有 locale-specific URL，不要擅自输出 hreflang / sitemap alternate links；等 `/zh-CN`、`/en-US`、未来 `/ja-JP` 等 URL 策略确定后再做。
- 完成 i18n/SEO 相关改动后至少运行：`bun run --cwd web lint:i18n`、`bun run --cwd web lint:i18n-usage`、`bun run --cwd web lint`；影响 metadata/路由较多时运行 `bun run --cwd web build:next`。

## 关键规则

1. **外链需过 ExternalLink**: 所有站外链接使用 `<ExternalLink>` 组件
2. **资源路径大小写敏感**: 生产环境部署区分大小写，资源路径需与实际文件名完全一致
3. **CSR 页面约定**: 所有页面交互逻辑在 `client.tsx` 中实现；`page.tsx` 只做 server-safe metadata、结构化数据和渲染入口。项目部署模式为 Next.js standalone，不是静态 export
4. **新功能必须补 i18n/SEO**: UI 文案补双语字典，页面补 `SEO_PAGE_METADATA`，详情页补 SEO 模板

## 新模块/重大变更

生成新模块或重大功能变化时，请在实施计划中：
- 列出关键设计决策并提问，等待用户补充
- 说明对现有模块的影响
- 确认是否需要新增类型定义或扩展现有 Context
- 明确新增/修改的 i18n key、SEO page key、动态 metadata 模板与需要运行的校验命令
