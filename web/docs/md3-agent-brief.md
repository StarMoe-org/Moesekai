# MD3 页面迁移 — 子代理工作说明

你负责把指定目录内的 UI 从旧的"毛玻璃/浮岛 + slate"样式改写为 Material 3 Expressive。

## 必读
1. `web/docs/md3-migration.md` —— 规则、页面模式原语、替换速查表（**严格遵守**）。
2. `web/src/components/md3/index.ts` 与各组件源码 —— 可用原语及其 props。
3. `web/src/app/design-system/client.tsx` —— 原语用法示例。

## 工作边界（硬性）
- **只修改分配给你的文件/目录**。不要修改：`src/components/md3/**`、`src/styles/**`、`src/app/globals.css`、`src/lib/i18n/messages/**`、`src/contexts/**`、`MainLayout/Sidebar/MainNavbar/FilterDrawer*/SettingsPanel/CommandPalette` 等外壳文件、`package.json`、其他批次的目录。
- 需要的原语不存在时：在你自己的目录内写小的局部组件，不要改 md3 库。
- **不要运行 git 的任何写操作**（add/commit/stash/checkout/reset 等）。
- 不改数据逻辑、hooks、URL 参数同步、`useScrollRestore`、SEO/metadata、`page.tsx`。只改表现层（JSX 结构/className/图标/文案引用）。
- 游戏/业务数据色（属性色 cute/cool/pure/happy/mysterious、稀有度、谱面难度色、团体色、角色色）可保留；但改用 `bg-char-<id>` 等 token 优先。
- 画布 / three.js / echarts / SVG 谱面渲染逻辑不动；echarts 的颜色若硬编码 slate/白，可读取 CSS 变量（`getComputedStyle(document.documentElement).getPropertyValue("--md-sys-color-on-surface-variant")`），但不是必须。
- 导出成图片的区域（html-to-image / canvas 截图）保留在 `data-seed="21" data-theme="light"` 容器内，避免随主题变色（若原本无此需求可忽略）。

## 图标
- `import { mdXxx } from "@/components/md3/icons";` + `<Icon path={mdXxx} />`（`Icon` 来自 `@/components/md3`）。
- 名称：Material Symbols Rounded 的 snake_case → `md` + PascalCase，填充版加 `Fill`。文件存在于 `D:/Python_Project/Snowy_Viewer/node_modules/@material-symbols/svg-400/rounded/<name>.svg`（填充版 `<name>-fill.svg`）。**使用前用 ls 确认存在**（例如 `expand_more` 不存在，用 `keyboard_arrow_down`）。
- 写完后在 `web/` 运行 `node scripts/generate-material-symbols.mjs`，若报 unknown 就改名。生成文件会被多个代理同时重写，这是正常的；重新运行即可。

## i18n
- 新增/修改的用户可见文案必须有 5 个语言：zh-CN、zh-TW、en-US、ja-JP、ko-KR。
- **不要直接改 messages 文件**。把新 key 写入 `web/scripts/md3-i18n/<你的批次名>.json`：
  ```json
  { "zh-CN": { "page.cards.foo": "…" }, "zh-TW": {…}, "en-US": {…}, "ja-JP": {…}, "ko-KR": {…} }
  ```
  key 是完整点路径，五个语言 key 集必须相同。主控会统一合并。
- 尽量复用已有 key（`common.action.*`、`common.state.*`、`common.filter.*`、`common.md3.*`、页面已有 key）。先用 Grep 在 `src/lib/i18n/messages/zh-CN/index.ts` 搜索。
- 因为新 key 尚未合并，`tsc` 不会因 key 缺失报错（`t()` 接受 string），但 `lint:i18n-usage` 会——这一步由主控在合并后统一跑，你不用跑。

## 自检（每个文件完成后）
在 `web/` 下：
```bash
rg -nP "slate-|gray-[0-9]|zinc-|bg-white|text-white|dark:|glass|island-|material-(thin|regular|thick|chrome)|backdrop-blur|pressable|miku|luka|primary-text|type-(title|body|caption|display|on-glass)(?![-\w])|rounded-(2xl|3xl)|shadow-(lg|xl|2xl)" <你的目录>
```
结果应只剩合理例外（如游戏数据色、`text-white` 叠在图片/角色色上的文字——这种可保留，但优先考虑 `text-on-primary` 等）。
然后：`npx tsc --noEmit -p .`（全项目，只关心你目录内的错误）和 `npx eslint <你的目录>`。

## 完成后汇报
简要列出：修改的文件、新增 i18n JSON 路径与 key 数、保留的例外及理由、任何你无法解决或需要主控处理的问题（例如需要新的 md3 原语）。不要贴大段代码。
