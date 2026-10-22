# 3D 服装预览 — 实施计划（草案 v2）

> 状态：计划，待维护者确认第 6 节「关键决策」后实施。修订日期 2026-10-20。
>
> 2026-10-21 更新：导出流水线已由 SekaiExtraRipper 0.13.0 实现；前端接入的需求、交互设计和待确认决策见 `costume-3d-integration-design.md`，它取代本文的 3.2–3.3、P2–P4 和第 5 节。
>
> 原则：
> - Haruki（Haruki-3D / Haruki-Toolbox）**只作为技术路线和功能范围的参考**，不引用、不 vendor 其代码，也不使用其托管数据。
> - 资源全部由 Moesekai 自己的流水线导出，发布到自有资源站。
> - 渲染引擎基于 three.js 自行编写。
> - 游戏行为与着色的依据是 `~/ReverseProjects/Sekai` 下的逆向产物，以及 `MetaSekaiLab/prsk-reverse-workflow` 的发布产物（JP 7.0.0：`build-38667987948-1` 的 `re-basic`（dump / stubs / cpp2il）、`re-full`（IDA 伪代码）、`ida-database`）。
> - 本文引用的类型与偏移来自本地 `re-jp-pjsk-6.8.1`。实施时以 7.0.0 产物为准，重新核对一遍。

## 1. 目标与功能范围

参考游戏内「服装商店 / 3D 角色预览」和 Haruki 换装页的功能覆盖，v1 计划提供：

| 功能 | 说明 |
|---|---|
| 角色 + 服装预览 | 选择可穿角色（`costume.characterIds`），渲染 body / hair / 头饰（accessory）组合。 |
| 颜色变体 | 与现有详情页的 `selectedColorId` 联动（オリジナル / アナザー1–3）。 |
| 发型与头饰规则 | 默认发型、整头（`head_and_hair`）锁定发型、`costume3dModelNotAvailablePatterns` 黑名单，与游戏一致。 |
| 初音未来团体版本 | Miku 在 piapro + 5 个团体下使用不同的 character3d（由 unit 决定），卡牌页按 `supportUnit` 选择。 |
| 动作 | 播放服装商店待机动作（`character/motion/costume_setting/<NN>_00`，对应 `Model3dMotionType.Costume`）；Result / Preview 动作视导出情况作为 v2 选项。 |
| 交互 | 拖动旋转、滚轮/双指缩放（对应游戏 `ModelRenderStudioBase` 的近/远 zoom）、高度平移、正面复位、全屏、截图（自写引擎可开启 `preserveDrawingBuffer` 或离屏渲染）。 |
| 换装工具页 | 自由组合任意 body / hair / 头饰（Haruki 换装页的功能范围），状态可分享（query）。 |
| 入口 | 服装详情页「3D 预览」、卡牌详情页服装区「3D」按钮、工具菜单。 |

不在 v1：语音（游戏里 `CharacterModelRenderStudio.PlaySystemVoice`）、MV 舞台、多人同屏。

## 2. 逆向依据（游戏怎样组装并渲染一套服装）

| 主题 | 逆向产物中的位置（6.8.1 dump） | 结论 / 实施时要读的内容 |
|---|---|---|
| 预览场景 | `Sekai.CharacterModelRenderStudio : ModelRenderStudioBase`（`dump.cs` ≈209583、211944）；预制体路径 `Live/Prefabs/CharacterModelRenderStudio`（`UIParts3DCharacterViewer`） | 渲染到 RenderTexture；相机配置来自 `ModelRenderStudioConfig.CameraSettingData`（Perspective：`NearZ / FarZ / Fov`，以及 `NearPosition / FarPosition / ZoomDuration`）；灯光来自 `CharacterLightData`。**取预制体与 Config ScriptableObject 的实际数值**作为默认相机和灯光。 |
| 部件选择 | `Sekai.LiveCharacterModelData`（Character3D、Hair / Body / Accessory 的 Costume + Model、`IsSameHeight`、静态 `FACE_COMMON_BUNDLE`、`SHADER_BUNDLE`）；伪代码 `SetCostumeParts`、`GetAssetBundleNames` | 照搬游戏的选择逻辑：hair 缺省回退 `0001_01`，`headCostume3dAssetbundleType`（`none / head_and_hair / head_only / head_all / head_front / head_back`，`dump.cs` ≈169860）决定整头还是头饰；颜色用 `colorAssetbundleName`。 |
| 角色组装 | `Sekai.Core.CharacterModel`（`dump.cs` ≈515767） | Face / Body / Hair / Acc 节点与 `HeadJoint`、`Hip`、`Neck`；`SpringManager[]`；肤色 `defaultSkinColor / shadow1SkinColor / shadow2SkinColor`；`Height`、`HeelOffset`（鞋跟）；`USE_DITHER_ALPHA`；`_FACE_SHADOW_RANGE_LIMIT`；`SekaiCharacterDirectionalLight`。对照伪代码确认挂接顺序、身高缩放、肤色写入材质的方式。 |
| 着色器 | `shader/live` bundle（≈0.38 MB）中的 `Sekai/Live/Character/Toon`、`Eye-Base`、`Eye-Highlight`；全局属性 `_SekaiShadowColor`、`_SekaiRimLight*`、`_SekaiOutlineWidth / Factor`、`_SekaiCharacterOutlineColorArray`、`_SekaiCharacterSpecularColorArray`、`_CharaShadowColor`、`_FaceSphereShadowEdge / Smoothness`、`_GlobalOutlineDepthBias` 等（`stringliteral.json`） | 用现有 `story/scripts/40_dump_shaders.py`、`50_shader_json_metal.py`（扩展过滤正则到 `Sekai/Live/Character/`）导出 iOS Metal 与 Android GLES3 子程序及属性默认值，再**按语义移植**为 three.js `ShaderMaterial`：主纹理 / 阴影纹理 / 值纹理、两级肤色阴影、边缘光、高光、反向外壳描边（顶点色控制宽度）、脸部阴影、眼睛层级与模板。 |
| 物理 | `ThirdParty.SpringBone.dll`（UTJ：`SpringManager`、`SpringBone`、`SpringSphere/Capsule/PanelCollider`、`ForceProvider`、`WindVolume`、`AngleLimits`）+ 伪代码 | 自写 TS 求解器。参数从 prefab 的 MonoBehaviour typetree 导出；UTJ 上游 UnityChanSpringBone 为 MIT，可对照算法，需在署名中注明。 |
| 动作 | `Model3dMotionType { Costume, Result, Preview }`；bundle `character/motion/costume_setting/<NN>_00` | 导出为 glTF AnimationClip（含表情/口型的 blendshape 曲线）。 |
| 资源链路 | `ASSET_DOWNLOAD_GUIDE.md`、`tools/sekai_client/cdn.py`、`extract_assets.py`（反混淆 + UnityPy，`FALLBACK_UNITY_VERSION = 2022.3.62f3`） | 导出流水线复用这套下载与反混淆方式。 |

bundle 规模（CN 6.0.0 全量清单 `sdk_data/AssetBundleInfoNew.json`）：

| 目录 | 数量 | 体积 |
|---|---|---|
| `live_pv/model/characterv2/body/<model>/<ladies_l\|m\|s\|ss\|mens…>` | 3388 | 2.8 GB |
| `characterv2/color_variation/**` | 11131 | 4.3 GB |
| `characterv2/face/<char>/<nnnn>` | 2588 | 6.6 GB |
| `characterv2/head_optional/<acc>/<node>` | 467 | 0.07 GB |
| `character/motion/costume_setting` | 33 | — |

依赖关系：所有模型依赖 `shader/live`，face 额外依赖 `characterv2/face/common`。JP 全量需用 7.0.0 清单重新统计。

## 3. 架构

```
[导出流水线（独立工程，离线）]                       [自有资源站]                                   [Moesekai web]
masterdata + bundles ──UnityPy──► GLB / KTX2 / JSON ──► assets.pjsk.moe/sekai-extra-assets/costume3d/ ──► lib/costume3d（three.js 引擎）
                                                         manifest.json → snapshots/<id>/…               ↳ Costume3dViewer / 换装页
```

### 3.1 导出流水线（不放在本仓库，同 Moly 运行时的分工）

- 位置：独立工程（建议放在 `~/ReverseProjects/Sekai/tools/costume3d_export/` 或单独 repo）。本仓库只定义**消费契约**（`docs/costume3d-asset-contract.md`）。
- 输入：区服 masterdata（`costume3ds`、`costume3dModels`、`character3ds`、`costume3dModelDefaultHairs`、`costume3dModelNotAvailablePatterns`、`gameCharacters`、`gameCharacterUnits`、`cardCostume3ds`、以及 CN/TW/KR 的 `costume3dGroups`）+ 对应 bundle。
- 输出（每个区服一个 snapshot，内容寻址，字节不可覆盖）：
  - `costume3d/manifest.json`：各区服当前 snapshot id，不长缓存。
  - `snapshots/<id>/catalog.json`：每个 role（`characterId + unit`）的默认部件、身高、肤色、可用部件列表（id、partType、组 / 颜色、thumbnail 名、headType、资源 key），以及兼容黑名单。按 role 拆分文件，单个保持在小体积，避免 Haruki 那种约 5 MB 的整表。
  - `snapshots/<id>/costumes/<costumeNumber>.json`：Moesekai 服装 → 每个角色 / 颜色的完整 recipe（body / hair / head / acc 的部件 key）。**映射在导出时一次完成**，前端不再自行推导。连接键：`costumeNumber == floor(costume3dGroupId / 1000)` + characterId + partType + colorId，在 jp 已验证 1064/1064。
  - `asset-store/sha256/<hh>/<hash>.glb`：部件网格（蒙皮、保留骨骼名、face 的 morph target、描边宽度用的顶点色、多套 UV），不含贴图。
  - `asset-store/sha256/<hh>/<hash>.ktx2`（或 `.webp`）：贴图。颜色变体只替换贴图和材质参数，共享网格。
  - `asset-store/…/<hash>.json`：材质参数（Toon 属性）、SpringBone / Collider 参数、挂点信息；动作为单独的 `.glb`（只含动画）。
- 发布规则沿用 Moly 已有的存储要求（`docs/moly-integration.md`）：
  - 跨域 GET 允许任意 origin；
  - 版本化文件 `immutable` 长缓存，manifest 不长缓存；
  - 先上传 snapshot，最后切换 manifest。
- 需要在 P0 实测：每个部件的产出体积，JP 全量的总量（原始 bundle 约 14 GB，网格去重后预计显著下降），以及首屏预览的下载量。

### 3.2 自写引擎 `web/src/lib/costume3d/`（three.js，客户端动态加载）

| 模块 | 职责 |
|---|---|
| `manifest.ts` / `catalog.ts` | 读取 manifest → snapshot → role catalog / costume recipe；LRU 缓存；区服切换。 |
| `loader.ts` | `GLTFLoader` + `KTX2Loader`（Basis 转码器从 three 包复制到 `public/`）；内容寻址的请求去重；`AbortController` 取消。 |
| `assembler.ts` | 按游戏 `CharacterModel` 的逻辑组装：body 骨架为主，face / hair 按骨骼名重绑到 body 骨架（`HeadJoint`），头饰挂到 attach node；整头时跳过 hair；身高缩放与鞋跟偏移。 |
| `materials/toon.ts`、`materials/eye.ts`、`materials/outline.ts` | 从导出的着色器语义移植的 `ShaderMaterial`，全局参数集中在一个 uniforms 对象里，对应游戏的 `_Sekai*` 全局属性。 |
| `spring.ts` | UTJ SpringBone 求解器（球 / 胶囊 / 面板碰撞、角度限制、风）。固定步长，可关闭（低端设备）。 |
| `animation.ts` | `AnimationMixer` 播放 costume_setting 动作（入场 → 循环），包括表情 morph。 |
| `stage.ts` | 渲染器（WebGL2、DPR 上限、可选 `preserveDrawingBuffer`）、相机预设（取自 `ModelRenderStudioConfig`）、灯光（取自 `CharacterLightData`）、**透明背景**（由 MD3 外层提供主题色背景，这是自写引擎相对 Haruki 的优势）、ResizeObserver、可见性暂停、context lost 处理、`dispose()`。 |
| `controls.ts` | yaw 拖动、缩放、高度平移、复位，手势用 `pointer` 事件，`wheel` 用非 passive 监听。 |

- 公共 API（React 只依赖这一层）：`createCostumeStage({ canvas, assetBase, region })` → `load(recipe, { signal })`、`setView()`、`play() / pause()`、`screenshot()`、`dispose()`，加上进度回调 `onProgress(loaded, total)`。下载总量来自 catalog 里记录的字节数，所以可以显示真实进度。
- three 版本：自写引擎不受 Haruki 的 r186 约束。v1 沿用现有 `three@0.162`（GLTFLoader / KTX2Loader 均可用），不影响 mysekai-preview；是否升级另行决定。

### 3.3 React 层

- `web/src/components/costume3d/Costume3dViewer.tsx`（`"use client"`，经 `next/dynamic(..., { ssr: false })` 加载）：
  - 用户点击后才加载；
  - WebGL2 探测失败时显示 `ErrorState`；
  - `LinearProgress` 显示真实进度；
  - 模块级单实例，限制同时存在的 WebGL context；
  - 浮于画布上的控件用 MD3 `IconButton` + `glass`。
- `web/src/lib/costume-parts.ts`：抽出服装页与卡牌页重复的 `getVariantBaseName` / displayItems 逻辑。

## 4. 实施阶段

### P0 逆向核对 + 单件打通（spike）
1. 下载 prsk-reverse-workflow 的 JP 7.0.0 `re-basic` / `re-full`，核对第 2 节的类与方法，重点读以下伪代码：
   - `LiveCharacterModelData.SetCostumeParts / GetAssetBundleNames`；
   - `CharacterModel` 的初始化、肤色写入、身高 / 鞋跟；
   - `ModelRenderStudioBase.Initialize / SetupZoom`；
   - `SekaiCharacterDirectionalLight`；
   - UTJ `SpringBone.UpdateSpring`。
2. 导出 `shader/live` 中 Toon / Eye 着色器的子程序与属性默认值；导出 `Live/Prefabs/CharacterModelRenderStudio` 预制体、`ModelRenderStudioConfig`、`CharacterLightData` 的数值。
3. 手工导出一套（一歌 cos0001 color 1：body `99/0001/ladies_m`、face `01/0001`、costume_setting `01_00`）为 GLB + 贴图 + JSON，在本地 three 沙盒页渲染，并与游戏截图对比。
4. 产出：`docs/costume3d-asset-contract.md` 初稿、体积实测、保真度差距清单。

### P1 导出流水线（独立工程）
- 批量导出 + 去重 + 内容寻址 + snapshot / manifest 生成；校验（每个 recipe 的所有 key 都存在、体积、MIME、缓存头）；先做 JP，再扩展到其他区服。
- 发布到 `assets.pjsk.moe/sekai-extra-assets/costume3d/`（或决策 1 选定的位置）。

### P2 引擎 `web/src/lib/costume3d/`
- 按 3.2 实现；单元测试覆盖纯逻辑部分（recipe 解析、兼容规则、URL 映射、进度计算）。参照 `scripts/test-*.mjs`，用 `node --experimental-strip-types`，新增 `test:costume3d`。
- 配置：`web/src/lib/costume3d/config.ts`。`NEXT_PUBLIC_COSTUME3D_RESOURCE_BASE` 可选，默认等于 Moly 的资源目录；校验方式参照 `moly/resourceBase.ts`。同时补 Dockerfile ARG/ENV 和 `.env.example`。
- `scripts/copy-basis-transcoder.mjs` 并入 `copy:wasm`：把 three 的 `basis_transcoder.{js,wasm}` 复制到 `public/costume3d/basis/`（gitignore）。

### P3 服装详情页集成
- `/costumes/[id]` 左侧 Surface 增加「3D 预览」：
  - 角色选择（限 `characterIds`；Miku 加 unit 选择）；
  - 复用颜色选择；
  - 点击后加载；
  - 该服装在当前区服尚未导出时显示「暂不可用」。
- query：`color`、`character`、`unit`、`view3d=1`，用 `replaceCurrentUrlSearchParams` 写入。

### P4 换装工具页 + 卡牌入口
- 新路由 `web/src/app/costume-dressup/{page.tsx, client.tsx}`：
  - 布局：角色条 + 粘性舞台 + 衣柜（body / hair / 头饰标签、搜索、按组分组、颜色 chip、`useScrollRestore`）；
  - query：`server`、`character`、`unit`、`body`、`hair`、`head`；
  - 不兼容组合置灰并提示。
- 卡牌详情 `CostumeInlineDetail` 加「3D」按钮（传 `characterId` 与 `supportUnit`，截图模式下隐藏）。
- 导航：`Sidebar.tsx` 工具组（`mdViewInAr`）、`navigation.ts`（breadcrumb-tools、命令面板关键词、label / description key）。

### P5 文档与验收
- `web/docs/costume-3d-viewer.md`：数据来源、契约、更新流程、署名。
- About 页 credits：注明 three.js 与 UTJ SpringBone（MIT）的参考 / 使用；Basis 转码器（Apache-2.0）的 notice 随 public 文件一起发布。
- 视觉对比：与游戏截图逐项核对描边、阴影、肤色、脸部阴影、眼睛、头饰挂点、物理。
- 移动端性能：中端 Android、iOS Safari 的帧率与内存。

## 5. i18n / SEO 清单

- `lint:i18n` 实际强制 **5 个 locale**（zh-CN、zh-TW、en-US、ja-JP、ko-KR），不是 AGENTS.md 写的 3 个。
- 新 key（草案）：
  - `page.costumes.viewer.*`：`title`、`load`、`loading`、`progress`、`unavailable`、`webglUnsupported`、`loadFailed`、`retry`、`character`、`unit`、`rotateLeft`、`rotateRight`、`zoomIn`、`zoomOut`、`resetView`、`fullscreen`、`screenshot`、`physicsToggle`
  - `page.costumeDressup.*`：`title`、`description`、`body`、`hair`、`head`、`searchPlaceholder`、`empty`、`hairLockedHint`、`incompatibleHint`、`resetOutfit`、`copyLink`、`linkCopied`、`linkCopyFailed`、`colorCount`、`roleLoadError`
  - `layout.nav.items.costumeDressup`、`layout.groupPages.costumeDressup`
  - unit 名称复用现有 key；区服显示复用 `ServerRegionLabel`。
- SEO：新增 `SEO_PAGE_METADATA.costume_dressup`（含 zh-TW / ko-KR）+ `seo-routes-data.json` 条目 + `page.tsx` 使用 `pageMetadata("costume_dressup")`。服装详情页沿用 `DETAIL_SEO_TEMPLATES.costume`。
- 校验命令：`bun run --cwd web lint:i18n`、`lint:i18n-usage`、`lint`、`lint:md3`、`test:md3`、`tsc --noEmit`、`build:next`（启动 standalone 实测）、`test:costume3d`。

## 6. 需要维护者确认的关键决策

1. **资源发布位置**：
   - `assets.pjsk.moe/sekai-extra-assets/costume3d/`（推荐：与 Moly 同一套版本化 snapshot / manifest / 存储契约）；
   - 还是 `storage.exmeaning.com` / `storage.pjsk.moe` 的 `sekai-<region>-assets/` 路径？
2. **区服范围**：v1 只做 JP（推荐，先测体积与保真度），还是五区同步？
3. **保真度分级**：v1 是否要求完整的描边 + 脸部阴影 + SpringBone + 动作？还是先静态 Toon（无物理），之后再补？
4. **贴图格式**：KTX2（显存小，需要转码器约 0.6 MB）还是 WebP（简单，移动端显存大）？
5. **导出流水线放在哪里**：`~/ReverseProjects/Sekai/tools` 下，还是单独 repo？由谁、多久运行一次（跟随游戏版本 / masterdata 更新）？
6. **入口与路由**：
   - 先做服装详情页内嵌，再做 `/costume-dressup` 工具页和卡牌入口（推荐分阶段）；
   - 工具页放 Tools 分组，还是放在 `/costumes/dressup`（后者会继承 costumes 的 180 天 detail 缓存与 Database 面包屑）？
7. **three 版本**：v1 保持 0.162（推荐），还是借机升级到最新版并对 mysekai-preview 做回归？
8. **动作范围**：只做 costume_setting 待机，还是同时导出 Result / Preview 动作并提供切换？

## 7. 对现有模块的影响

- 修改：服装详情页、卡牌详情页（抽取共享 costume-parts）、Sidebar / navigation、About 页、`copy:wasm`、Dockerfile、`.env.example`、`.gitignore`。
- 新增类型：`web/src/types/costume3d.ts`（manifest、catalog、recipe、部件、材质参数）。
- 不需要新 Context，也不需要改 Go 后端（资源由浏览器直连资源站）。
- 不改动 mysekai-preview（除非决策 7 选择升级 three）。

## 8. 风险

- **着色保真度**：Toon 着色器依赖 URP 管线全局参数和模板缓冲。移植需要逐项对照导出的着色器与游戏截图，这是工作量最大的部分。
- **导出正确性**：蒙皮重绑（face / hair → body 骨架）、morph target、颜色变体 bundle 的结构（推测只含贴图 / 材质，P0 验证）、男性 / 特殊体型（`mens`、`boys`）。
- **体积与移动端**：原始 bundle 约 14 GB（CN），需要实测去重后的产出；首屏下载量和显存需控制在可接受范围（目标在 P0 定）。
- **维护**：游戏版本更新可能改变 bundle 结构、Unity 版本或混淆方式，要随 prsk-reverse-workflow 的新版本产物复核。
- **版权**：模型与贴图来自 SEGA / Colorful Palette 的游戏资源，着色器为依据逆向结果的再实现，与站内现有缩略图、Moly 资源属于同类。
