# 3D 服装预览接入 Moesekai：需求分析与交互设计

> 状态：设计已定稿，第 9 节的决策已由维护者确认（2026-10-21）。M1 已实现（2026-10-21），见文末「M1 实现记录」。
>
> 配套文档：
> - `costume-3d-preview-plan.md`：总体计划（v2 草案）。其中的导出流水线（3.1、P1）已由 SekaiExtraRipper 0.13.0 完成，本文取代它的 3.2–3.3、P2–P4，以及第 5 节。
> - `costume-3d-unpack-requirements.md`：需要解包哪些内容。
> - SekaiExtraRipper `docs/adr/0020-costume3d.md`：输出格式 `costume3d-*`。
>
> 依据：
> - CN 全量导出：1037 套服装、20,109 个 bundle、13.65 GB。
> - 本地验收页 `cn-viewer`，2026-10-21 已通过验收。它已经实现：
>   - 按角色浏览服装、团体切换、颜色；
>   - 发型与头饰自由搭配（整头、配套发型、禁止组合）；
>   - Toon 着色、描边、眼睛高光、肤色；
>   - costume_setting 动作（入场 → 循环）和表情；
>   - 鞋高抬升、舞台与打光。

## 1. 现状与差距

| 项 | 现状 | 接入时要做的事 |
|---|---|---|
| 数据 | CN 已在本地导出，**尚未发布到 S3**；JP 全量因 API 503 待跑 | 发布到 `assets.pjsk.moe/sekai-extra-assets/costume3d/<region>/`（需维护者批准） |
| 渲染 | 验收页是单个 HTML（three r162 走 CDN importmap），代码约 1,000 行 | 移植成 `web/src/lib/costume3d/`（TypeScript，用项目自带的 `three@0.162`），React 只包一层 |
| 列表数据 | 验收页用脚本生成 3.2 MB 的 `list.json` | 改为前端组合 `moe_costume.json`（站内已有）和 role catalog，不再需要额外文件（见 3.2） |
| 保真度 | 未实现：SpringBone 物理、身高缩放、眉毛模板、头饰按脸偏移（`CharacterAccessoryTransformData`）、脸部 SDF 阴影 | 分期补，见第 8 节 |

## 2. 用户与场景

| # | 用户 | 场景 | 现在怎么做 | 需要 |
|---|---|---|---|---|
| S1 | 普通玩家 | 「我推穿上这套是什么样子？」以角色为中心，翻看他/她的全部服装 | 只能看 2D 部件缩略图 | **角色 → 服装列表 → 3D**（核心场景，验收时已确认） |
| S2 | 普通玩家 | 在服装详情页看到一套衣服，想看 3D 效果、看不同角色穿 | 同上 | 详情页一键进入 3D，带上服装号和颜色 |
| S3 | 抽卡前的玩家 | 卡牌详情页想看这张卡附带的服装 | 卡牌页有服装缩略图 | 卡牌页「3D」按钮，带上角色、团体（Miku 用 `supportUnit`）和服装 |
| S4 | 搭配爱好者 | 游戏里的换装：任意服装 + 发型 + 头饰，分享给别人 | 无 | 发型 / 头饰选择器，状态写进链接 |
| S5 | 同人 / 资料整理 | 截图、看表情、看 T 字姿势 | 无 | 截图、动作控制、视角预设 |
| S6 | 手机用户（占比高） | 上述全部，但流量和性能有限 | — | 竖屏布局、加载量可见、低端设备降级 |

## 3. 功能需求

### 3.1 功能清单

优先级：**P0** = 首发必需，**P1** = 首发后尽快，**P2** = 之后。

| 模块 | 功能 | 优先级 | 说明 |
|---|---|---|---|
| 选择 | 角色选择（按团体分组，26 人） | P0 | 头像 + 团体色，与站内角色选择器风格一致 |
| | 团体（role）切换 | P0 | 只有 VIRTUAL SINGER 有多个 role（piapro + 5 个团体版本），只在这时显示 |
| | 该角色的服装列表 | P0 | 缩略图、名字（含翻译）、服装号、上线日期、颜色数；搜索；排序（最新 / 服装号）；筛选（来源：卡牌 / 商店 / 其他） |
| | 颜色 | P0 | オリジナル / アナザー 1–3，带颜色缩略图 |
| | 发型 | P0 | 该 role 可单独换的发型（一歌 10 种）；「跟随服装」 |
| | 头饰 | P0 | 配件和整头，可搜索；「无头饰」「跟随服装」；本套头饰置顶 |
| | 游戏规则 | P0 | 整头锁定发型、头饰带配套发型（`defaultHairs`）、禁止组合（`notAvailable`）——验收页已实现，照搬 |
| 舞台 | 渲染、描边、舞台、打光 | P0 | 移植验收页 |
| | 视角：拖动旋转、缩放、全身 / 头部预设、复位 | P0 | 手机：单指旋转、双指缩放 |
| | 动作：自动播放入场 → 循环、暂停、重播、T 字姿势 | P0 | 系统「减少动态效果」开启时，默认停在循环首帧 |
| | 转台（自动旋转） | P1 | |
| | 描边开关 | P1 | 移到「更多」菜单，普通用户用不到 |
| | 全屏 | P1 | |
| | 截图（PNG，可选透明背景） | P1 | |
| | 表情（blendshape）面板 | P2 | 验收页的调试功能，正式版只留常用表情预设或不做 |
| 分享 | 链接保存全部状态 | P0 | 见 5.3 |
| | 复制链接按钮 | P1 | |
| 入口 | 导航「3D 服装」 | P0 | 见 4.1 |
| | 服装详情页「3D 预览」 | P0 | |
| | 卡牌详情页服装区「3D」 | P1 | |
| | 角色详情页「3D 服装」 | P1 | |
| 健壮性 | 加载进度、旧模型保留到新模型就绪、取消过期请求 | P0 | |
| | WebGL 不可用、该区服无数据、部件缺失、网络失败（可重试） | P0 | |
| | 数据格式版本校验（ADR-0013 规则） | P0 | 见 3.2 |
| | 剧透：未上线服装按全站「显示剧透」设置隐藏 | P0 | 取代验收页的「含未上线」勾选框 |

不做：语音、MV 舞台、多人同屏、自定义背景、导出模型文件。

### 3.2 数据接入

资源根：`<base>/costume3d/<region>/`，其中 `<base>` 默认为 `https://assets.pjsk.moe/sekai-extra-assets/`（与 Moly 同一个，复用 `molyResourceBase()` 的校验方式）。

| 用途 | 文件 | 大小（CN 实测） | 时机 |
|---|---|---|---|
| 区服是否可用、格式版本 | `costume3d.lock.json` | 1.56 MB（gzip 0.19 MB） | **太大**。ripper 另写小文件 `index/version.json`（决策 6），前端只读这个 |
| role 列表 | `index/roles.json` | 2.7 KB | 进入页面 |
| 一个 role 的全部部件、规则、肤色、动作 | `index/roles/<cid>-<unit>.json` | 1.8 MB（gzip 91 KB，br 54 KB） | 选角色时 |
| 一套服装的组合 | `index/costumes/<n>.json` | 约 50 KB（gzip 2 KB） | 选服装时 |
| 部件 | `library/<bundle>/_part.json`、`model.glb`、`_textures/…png`、动作 `*.motion.json` | 一个造型中位数 **6.8 MB**，P90 8.3 MB，最大 10.3 MB（60 套随机抽样，body 2.0 / face 3.0 / 头饰 0.3 / 动作 1.3） | 选服装 / 颜色 / 发型 / 头饰时 |

- **压缩**：catalog 原始 1.8 MB，压缩后不到 0.1 MB。S3 本身不压缩。首发暂不处理（决策 6），加载进度按原始大小计算；上线后如果手机上选角色明显变慢，再处理。
- **服装列表不另建索引**。role catalog 里 `slot = body` 的部件已经带服装号、颜色、名字、发布时间，按服装号分组就是这个 role 能穿的服装。缩略图、来源、稀有度、翻译从站内已有的 `moe_costume.json` 按服装号取。两边服装号一致（JP 1064/1064 已核对）。
- **发型和头饰的缩略图**：catalog 的 `thumbnail` 字段在 CN 为空（`costume3dModels.thumbnailAssetbundleName` 是压缩行）。按「服装号 + 部件类型 + 颜色（+ 角色）」到 `moe_costume.json` 的 `parts` / `extraParts` 查，可以得到缩略图名；查不到的显示占位图标。ripper 不改（决策 6）。
- **切换时的下载量**：
  - 同一角色换颜色：只下载颜色贴图，约 1–2 MB。
  - 换服装：脸和动作已有缓存，约 2–3 MB。
  - 换角色：完整的一个造型。
  - 贴图按内容寻址，跨服装共用的会命中浏览器缓存。
- **区服**：跟随全站的服务器设置（`serverSource`）。当前区服没有 3D 数据时，显示空态，并给出有数据的区服供切换（只切这个页面，用 query `server`，不改全站设置）。

## 4. 信息架构与入口

### 4.1 页面与路由

推荐**一个独立页面**承载全部 3D 功能，其他页面只做入口：

- 路由 `/costume-3d`（`page.tsx` + `client.tsx`，`pageMetadata("costume3d")`）。
- 导航：「工具」分组（决策 1），名称「3D 服装」（英文 `3D Costumes`，日文 `3D衣装`）；面包屑走 `breadcrumb-tools`；命令面板关键词 `3d`、`costume`、`dressup`、`换装`、`衣装`。
- 不放在 `/costumes/3d`，原因是：
  - 会和 `/costumes/[id]` 的详情缓存规则、面包屑混在一起；
  - 这个页面以角色为中心，不从属于某一套服装。

| 入口 | 位置 | 跳转 |
|---|---|---|
| 导航 / 命令面板 | 工具 → 3D 服装 | `/costume-3d`（恢复上次的角色，没有则用当前主题角色） |
| 服装详情 | 左列部件网格下方，颜色选择旁的主按钮「3D 预览」；可穿角色卡片里每个头像也可点 | `/costume-3d?c=<服装号>&col=<当前颜色>&ch=<角色>`，角色默认取可穿角色中的第一个 |
| 卡牌详情 | 服装卡片右上角图标按钮 | `?ch=<卡牌角色>&u=<supportUnit>&c=<服装号>` |
| 角色详情 | 基本信息卡片下方「3D 服装」 | `?ch=<角色>` |

服装详情页内嵌一个小舞台（部件 / 3D 切换）留到 P2，首发只给跳转按钮（决策 2）。

### 4.2 页面结构

```
┌ 顶栏（MainLayout） ───────────────────────────────────────────────────────────┐
│ 3D 服装                                       [区服 CN ▾]  [分享] [⋯]          │
├──────────────────────┬────────────────────────────────────┬──────────────────┤
│ 角色                  │                                    │ 颜色             │
│ ┃ 一歌 咲希 穗波 志步  │          舞台（粘性，占满高度）       │ [原][A1][A2][A3] │
│ ┃ 实乃理 遥 爱莉 雫    │                                    │                  │
│ ┃ …（每团体一行，团体色）│   振奋色彩                          │ 发型    跟随服装 │
│ 团体：仅 Miku 等显示   │   星乃一歌 · Leo/need · オリジナル   │ [默认][天狼星]…  │
│ ───────────────────── │                                    │                  │
│ [搜索服装名/编号]       │              (角色)                │ 头饰    跟随服装 │
│ 排序 ▾  来源 ▾         │                                    │ [搜索]           │
│ ┌──┐ 振奋色彩    #880   │                                    │ ▣ 无头饰         │
│ └──┘ 2026-10-21 · 4 色  │      ◯ 舞台                         │ ▣ 振奋色彩 本套  │
│ ┌──┐ 舒适色彩    #879   │ ┌ 浮动工具条（glass）────────────┐  │ ▣ …              │
│ └──┘ …                  │ │全身 头部 ▶/❚❚ ↻入场 T 转台 ⛶ 📷│  │                  │
│ （列表，滚动恢复）        │ └───────────────────────────────┘  │ 本组合（折叠）    │
└──────────────────────┴────────────────────────────────────┴──────────────────┘
```

- **桌面（≥ 1200 px）**：三栏。
  - 左栏 320 px：「选谁、穿哪套」。
  - 中间是舞台，sticky，高度为 `100dvh − 顶栏`。
  - 右栏 300 px：「怎么搭配」，即颜色、发型、头饰。
  - 两侧栏是 `Surface`（内容，不用玻璃）；浮在舞台上的工具条和标题用 `glass`。
- **平板（768–1199 px）**：左栏保留；右栏收进舞台右侧的「搭配」按钮，点开 `SideSheet`。
- **手机（< 768 px）**：竖向。

```
┌──────────────────────────┐
│ 顶栏                      │
│ [头像条，可横向滚动  ▾]    │ ← 点 ▾ 打开全部角色（BottomSheet，按团体分组）
├──────────────────────────┤
│                          │
│         舞台 55dvh        │ ← sticky；工具条收成 3 个按钮 + ⋯
│  振奋色彩 · オリジナル     │
├──────────────────────────┤
│ [服装][颜色][发型][头饰]   │ ← Tabs，下面是对应列表
│ ┌──┐ 振奋色彩  #880        │
│ └──┘ …                    │
└──────────────────────────┘
```

  - 舞台固定在上半屏，下半屏用 Tabs 切换服装、颜色、发型、头饰。列表滚动不影响舞台。
  - 服装列表用两列网格缩略图，比单列更适合手指点选。

### 4.3 视觉

- **舞台背景**：
  - 不用当前主题色作底，而是用**当前 role 的团体色**（`gameCharacterUnits.colorCode`）和 MD3 surface 混合，与验收页一致：径向渐变 + 圆台 + 接触阴影。
  - 深色模式下降低亮度，渐变终点改用 `surface-container-lowest`。
  - 渲染器透明，背景由 CSS 提供，换团体时 0.4 s 过渡。
- **舞台上的文字**：标题、角色、颜色用 `type-headline-s` / `type-body-m`，放在左上角；工具条放在底部居中（手机放在右下角，竖排）。
- **列表项**：
  - 缩略图 56 px，标题 `type-title-s`，副行 `type-body-s text-on-surface-variant`。
  - 选中项用 `bg-secondary-container`。
  - 未上线的徽标用 `tertiary-container`，只在显示剧透时出现。
- **发型**用 `Chip variant="filter"`，带缩略图。
- **头饰**用列表：
  - 「本套」「整头」用小号的 `Chip variant="assist"` 样式标签；
  - 不可选的项置灰，并用 Tooltip 说明原因。
- 图标：`mdViewInAr`（导航）、`mdPlayArrow` / `mdPause`、`mdReplay`、`mdAccessibility`（T 字）、`mdThreeSixty`（转台）、`mdFullscreen`、`mdPhotoCamera`、`mdShare`、`mdMoreVert`。

## 5. 交互逻辑

### 5.1 状态模型

```ts
interface Costume3dSelection {
  server: ServerSourceType;      // 默认跟随全站设置
  characterId: number;
  unit: string;                  // role = characterId + unit
  costumeNumber: number;
  colorId: number;
  hair: number | null;           // costume3dId；null = 跟随服装
  head: number | null;           // costume3dId；0 = 无头饰；null = 跟随服装
}
// 派生（不存）：resolveLook(variant, catalog, selection) → { face, accessory, hair, head, fullHead, notes }
```

状态写进 URL：`?server=cn&ch=1&u=light_sound&c=880&col=1&hair=897165&head=20003`。

- 用 `window.history.replaceState` 写入，不触发导航（遵循 AGENTS.md）。
- 只写与默认值不同的参数。
- 同时把最近一次的角色和团体存到 `localStorage`，供无参数进入时恢复。

### 5.2 选择的级联规则

| 操作 | 结果 |
|---|---|
| 进入页面 | 按 URL → `localStorage` → 当前主题角色 → 一歌的顺序确定角色。<br>团体：URL → 角色本团 → 第一个 role。<br>服装：URL → 列表第一套（最新）。<br>颜色：URL → 1。 |
| 选角色 | 团体取本团。<br>**服装尽量保持**：当前服装这个角色也能穿就保留，否则取最新一套。<br>颜色同理。<br>发型 / 头饰清空：它们的 id 属于某个 role。 |
| 选团体（Miku 等） | 同「选角色」，服装尽量保持 |
| 选服装 | 颜色保持（新服装没有这个颜色时取 1）。<br>**发型 / 头饰的覆盖保持**，方便试同一发型配不同衣服。 |
| 选颜色 | 只换颜色贴图，不重建模型，动作不重播 |
| 选发型 | 写入 `hair`。<br>当前是整头时，发型按钮不可点，并说明需先换头饰。 |
| 选头饰 | 写入 `head`。<br>头饰有配套发型、且没有手动选发型时，换成配套发型。<br>当前发型与新头饰是禁止组合时，换成该头饰的默认发型，并用 Snackbar 提示。 |
| 「跟随服装」 | 把 `hair` / `head` 置回 `null` |
| 链接里的组合不合法 | 服装或颜色不存在、id 不属于这个 role：静默回退到默认，并修正 URL |

### 5.3 加载与切换

- 页面进入后**自动加载**。这里用户是专门来看 3D 的，跟服装详情页的「点击后加载」不同。
- 进度：
  - 舞台顶部用 `LinearProgress`；
  - 按已知文件的字节数显示实际进度，`_part.json` 读完就知道总量；
  - 首次加载在舞台中央显示「正在加载 3D 模型（约 7 MB）」。
- **切换时不闪白**：旧模型留在舞台上，新模型就绪后在同一帧替换；动作从入场开始。只换颜色时只替换材质贴图。
- 快速连续切换：每次加载带 `AbortController`，新请求取消旧请求；用 token 丢弃过期结果（验收页已有）。
- 缓存：
  - GLB 的解析结果和贴图按 URL 做 LRU，上限约 150 MB 显存估算；
  - catalog 和服装组合用内存缓存。
- 预取：服装列表停留超过 300 ms 的项，预取它的 `index/costumes/<n>.json`（2 KB），不预取模型。

### 5.4 舞台操作

| 操作 | 桌面 | 手机 |
|---|---|---|
| 旋转 | 左键拖动 | 单指拖动 |
| 缩放 | 滚轮（非 passive，只在舞台内生效） | 双指捏合 |
| 平移高度 | 右键拖动，只能上下 | 双指同向拖动 |
| 复位 | 双击 / 「全身」 | 双击 / 「全身」 |
| 头部特写 | 「头部」 | 「头部」 |
| 键盘 | ←/→ 旋转、+/− 缩放、空格播放 / 暂停、R 复位（焦点在舞台时） | — |

- 视角不能低于台面（验收页已限制）。
- 手机上，舞台内的单指竖向拖动超过 20° 时交给页面滚动，避免「卡住页面」。

### 5.5 动作

- 默认：入场播一次，然后循环。
- 工具条上有：
  - 播放 / 暂停；
  - 重播入场；
  - T 字姿势：暂停并回到静止姿势。
- 开启「减少动态效果」时，默认暂停在循环的第一帧，用户可以手动播放。
- 页面不可见时暂停渲染（`visibilitychange`）；舞台滚出视口时也暂停（`IntersectionObserver`）。

### 5.6 截图、分享、全屏

- 截图：
  - 离屏按 2× 渲染当前视角，不含工具条；
  - 「⋯」菜单里可选「透明背景」；
  - 文件名 `moesekai-<角色>-<服装号>-<颜色>.png`。
- 分享：复制当前链接，用 Snackbar 提示结果；支持 Web Share 的手机调用系统分享。
- 全屏：只全屏舞台，`Esc` 退出。

### 5.7 空态与错误

| 情况 | 表现 |
|---|---|
| 浏览器拿不到 WebGL | 舞台位置显示 `EmptyState`，说明原因（硬件加速关闭等）。选择器照常可用，可以看缩略图 |
| 当前区服没有 3D 数据 | 空态，并列出有数据的区服按钮 |
| 数据格式版本不匹配 | 空态「3D 数据正在更新」，`console` 记录详情。不渲染，避免出错的结果 |
| 这套服装没有导出、或缺部件（组合的 `missing` 字段） | 列表里置灰并标「暂不可用」；从链接进入时提示并回退到最新一套 |
| 单个文件加载失败 | 舞台保留旧模型，顶部 `Banner` 显示「加载失败」和「重试」 |
| 角色没有任何可用服装 | 列表空态 |
| WebGL context lost | 自动重建一次；再失败时显示重试 |

### 5.8 性能与可访问性

- 整站同时只有一个 3D 舞台，模块级单实例。离开页面时 `dispose()` 释放几何体、贴图和渲染器。
- DPR 上限：手机 2，桌面 2。低端设备检测（`hardwareConcurrency ≤ 4` 或首帧耗时超过 50 ms）时默认关闭描边、降到 DPR 1.5。
- 所有按钮都有 `aria-label` 和 Tooltip；加载状态用 `aria-live="polite"` 播报；舞台本身 `role="img"`，`aria-label` 为「<角色> 穿着 <服装>」。

## 6. 模块划分

| 层 | 位置 | 内容 |
|---|---|---|
| 数据 | `web/src/lib/costume3d/data.ts` | 资源根与区服、lock / 版本校验、roles、catalog、costume 读取与缓存；`resolveLook()`（纯函数，带单元测试） |
| 引擎 | `web/src/lib/costume3d/stage.ts`、`assemble.ts`、`materials.ts`、`motion.ts` | 从验收页移植：舞台、相机、灯光、Toon / 眼睛 / 描边材质、face → body 骨骼合并、头饰挂点、鞋高、动作曲线求值。对外 API：`createStage(canvas)` → `load(look, { signal, onProgress })`、`setView()`、`play()`、`screenshot()`、`dispose()` |
| 组件 | `web/src/components/costume3d/` | `Costume3dStage`（`next/dynamic`，`ssr: false`）、`CharacterPicker`、`CostumeList`、`ColorPicker`、`HairPicker`、`HeadPicker`、`StageToolbar` |
| 页面 | `web/src/app/costume-3d/{page.tsx, client.tsx}` | 状态、URL 同步、布局 |
| 类型 | `web/src/types/costume3d.ts` | 与 ripper `costume3d-*` 格式对应的 TS 类型 |

- three 保持 `0.162`，不影响 mysekai-preview。
- 不需要新的 Context，也不改 Go 后端：浏览器直接读资源站。

## 7. i18n 与 SEO

5 个 locale（zh-CN、zh-TW、en-US、ja-JP、ko-KR）同步。

- **页面**：`page.costume3d.*`，包括：
  - 基本：`title`、`description`；
  - 选择：`characters`、`unit`、`costumes`、`searchPlaceholder`、`sort.*`、`color`、`hair`、`head`、`followCostume`、`noHead`、`ownTag`、`fullHeadTag`、`hairLockedByFullHead`、`hairReplaced`、`incompatible`；
  - 舞台：`viewBody`、`viewHead`、`play`、`pause`、`replay`、`tpose`、`autoRotate`、`outline`、`fullscreen`、`screenshot`、`transparentBackground`、`share`、`linkCopied`；
  - 加载与错误：`loading`、`loadingSize`、`loadFailed`、`retry`、`webglUnavailable*`、`regionUnavailable*`、`formatMismatch*`、`costumeUnavailable`、`emptyCostumes`；
  - 无障碍：`stageLabel`。
- **入口**：`page.costumes.view3d`、`page.cards.view3d`、`page.character.view3d`。
- **导航**：`layout.nav.items.costume3d` 等。
- **复用**：团体名用 `common.units.*`；部件类型用 `common.costume.partTypes.*`；角色名用 `getCharacterName`；服装名走现有的 `TranslatedText`（category `costumes`）。
- **SEO**：
  - `SEO_PAGE_METADATA.costume3d`；
  - `seo-routes-data.json` 条目；
  - `page.tsx` 用 `pageMetadata("costume3d")`。
  - 带参数的分享链接不做动态 metadata（首发），之后可以按服装生成 OG 图。
- **校验**：`lint:i18n`、`lint:i18n-usage`、`lint`、`lint:md3`、`tsc --noEmit`、`build:next`，以及新增的 `test:costume3d`（`resolveLook`、URL 解析、级联规则）。

## 8. 分期

| 期 | 内容 |
|---|---|
| M1 首发 | 第 3.1 节全部 P0：独立页面、角色 / 服装 / 颜色 / 发型 / 头饰、舞台与动作、URL 状态、服装详情入口、错误处理。数据先用 CN（JP 跑完后加上） |
| M2 | P1：卡牌和角色详情入口、截图、全屏、转台、复制链接；JP 数据 |
| M3 保真度 | SpringBone 物理（头发、裙摆）与 Unity 约束已实现（2026-10-22，见文末「物理」）。其余待做：头发与身体的碰撞（`colliderFlag` 的含义待逆向）、`CharacterAccessoryTransformData` 头饰按脸偏移、身高缩放、眉毛透过头发（模板）、脸部 SDF 阴影、`ExtraBone` 手臂扭转 |
| M4 | 服装详情页内嵌舞台、表情预设、按服装生成 OG 图 |

## 9. 决策（2026-10-21 已确认）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 路由和导航位置 | `/costume-3d`，放在 **「工具」** 分组 |
| 2 | 服装详情页 | 首发**只放跳转按钮**，内嵌舞台留到 M4 |
| 3 | 首发区服 | **先上 CN**，JP 跑完全量后补上；发布 CN 到 S3 时另行请维护者批准 |
| 4 | 页面名称 | 中文「**3D 服装**」，英文 `3D Costumes`，日文 `3D衣装` |
| 5 | 首发范围 | 发型和头饰的自由搭配**首发就上** |
| 6 | ripper 侧改动 | **只做**小版本文件 `index/version.json`（`formats` + 区服信息）；缩略图回退和预压缩**不做** |
| 7 | 未上线服装 | **跟随全站「显示剧透」设置** |

## M1 实现记录（2026-10-21）

- **ripper 0.14.0**：新增 `index/version.json`（`costume3d-version`），CN 输出已补写。
- **代码位置**：
  - 页面：`web/src/app/costume-3d/`，路由 `/costume-3d`，放在「工具」分组。
  - 组件：`web/src/components/costume3d/`（`Costume3dViewport`、`CharacterPicker`、`Wardrobe`）。
  - 引擎与数据：`web/src/lib/costume3d/`（`config` / `data` / `look` / `stage` / `materials` / `motion`），从验收页移植。
  - 类型：`web/src/types/costume3d.ts`。
- **配置**：
  - `NEXT_PUBLIC_COSTUME3D_BASE`，默认 `https://assets.pjsk.moe/sekai-extra-assets/costume3d/`；
  - `NEXT_PUBLIC_COSTUME3D_REGIONS`，默认 `cn`。
  - 构建时校验；Dockerfile 和 `.env.example` 已补。
- **测试**：`bun run --cwd web test:costume3d` 覆盖配置、服装列表、发型 / 头饰列表、`resolveLook` 的各条规则和地址参数。
- **入口**：
  - 服装详情页颜色选择下方的「3D 预览」；
  - 可穿角色的头像改为链接，带上该角色。
- **与设计稿的出入**：
  - 选择器改成衣柜式（2026-10-22，参考 Haruki 换装页的交互，未使用其代码）：
    - 全部角色排成一行，按团体分组，每组下方是团体色条；
    - 舞台在左，衣柜在右；
    - 衣柜是「服装 / 发型 / 头饰」三个带数量的标签页，各自有搜索，下面是大缩略图卡片网格；
    - 卡片右上角是「N 色」，下面一排颜色小图，点一下直接换色；
    - 头饰按服装分组，第一张是「无头饰」；
    - 列表滚到底时再加载下一批。
  - 再次改版（2026-10-22）：
    - 角色选择移进右侧面板，和站内角色筛选一样分两步：先选团体图标，再选该团体的头像（带名字）；虚拟歌手多出一行「版本」，用团体图标选。
    - 页面标题压成一行；内容宽 ≥ 768 px 时舞台和面板并排，填满窗口高度，只有衣柜网格自己滚动，带侧栏的 1280 宽笔记本也是这种布局。
    - 更窄时上下排列，舞台吸顶。
    - 选中卡片只在衣柜内部滚到可见，不再带动整页滚动。
  - 加载进度按部件组计数（模型、颜色贴图、动作），不是按字节。
  - 截图、全屏、复制链接、描边开关属于 P1，留到 M2。
- **上线前还需要**：
  - 把 CN 输出发布到 `s3://sekai-extra-assets/costume3d/cn/`（需维护者批准）；
  - 确认资源站对 pjsk.moe 的跨域放行。

## 物理（2026-10-22）

此前舞台上的裙摆和头发不会动，动作时腿直接穿过裙子。现在 `web/src/lib/costume3d/physics.ts` 读取 body 和 face 的 `components.json`，在每帧动作之后运行：

- **Unity 约束**：
  - 支持的类型：`AimConstraint`（裙摆前后的支点朝向两膝之间）、`PositionConstraint`（大腿碰撞体跟随两膝中点）、`RotationConstraint`（后发跟随胸部）、`ParentConstraint`。
  - 偏移按静止姿势计算，相当于 Unity「Activate」时记下的值，再按权重与静止姿势混合。这样不用复刻 Unity 的欧拉角约定，在镜像坐标下也保持正确。
- **SpringBone**：按 UTJ SpringBone（MIT）的算法实现，游戏的 SekaiSpringBone / SpringManager 就基于它：
  - 以固定 60 Hz 步长做 Verlet 积分，刚度把骨骼拉回静止方向，阻尼抵消速度；
  - 保持骨骼长度；
  - 用球形和胶囊碰撞体把骨尖和骨骼中点推出去（胶囊沿节点本地 +Y 延伸 `height`）；
  - 绕支点的 y / z 角度限制：数据里裙摆都只允许向外摆，不允许向身体内侧摆；
  - 最后由骨尖位置反推骨骼旋转，按 `dynamicRatio` 与动作给的旋转混合。
- **实测**：用固定步长逐帧驱动 CN 的 10 套服装，覆盖女性、男性体型和虚拟歌手：
  - 没有 NaN，骨骼最大摆角 47°；
  - 穿模基本消失：初音未来「时髦少女连衣裙」从 100% 的采样帧穿模、最深 4.4 cm，降到 2%、1.5 cm；星乃一歌「振奋色彩」从 6.7 cm 降到 1.3 cm；
  - 每帧耗时约 0.1 ms（38 根骨骼）。
