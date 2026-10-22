# SekaiStoryRipper → SekaiExtraRipper：并入 3D 服装解包的可行性与改造方案

> 依据：
> - `StarMoe-org/SekaiStoryRipper` v0.11.3（`5e230da`，2026-10-16）的源码与 ADR 0001–0019；
> - `unity-rs-core` 0.5.1 源码；
> - 需求见 `costume-3d-unpack-requirements.md`。
>
> 本文可以整理后作为 ripper 仓库的 ADR-0020 提交。

## 1. 结论

**可以，而且比在 Asset Updater 里重写更合适。** 3D 服装解包需要的下载、反混淆、清单、增量、跨区服、S3 发布和去重，ripper 都已经实现，并且在生产中运行（`assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/`）。

需要新增的主要是三块：
- **3D 模型的读取与转换**：prefab → 模型图 → glTF，网格、材质、组件、动作；
- **服装的部件解析**：masterdata → recipe；
- **一套与剧情互不影响的输出格式**。

剧情部分的行为和输出格式保持不变。

## 2. 需求 × 现有能力

| 需求（见需求文档第 3 节） | ripper 现状 | 差距 |
|---|---|---|
| 五区服清单、下载、反混淆、长度和 CRC 校验 | `ripper-cdn`：CN/TW/KR 匿名，JP/EN 游客登录；`BundleCache`；`manifest` 归档与 diff | 无 |
| 按前缀选择、跟随依赖、不看 bundle 分类 | `ripper fetch --prefix …`，默认跟随 `dependencies` | 无（加入 3D 的前缀集合即可） |
| masterdata | `ripper masterdata` 从 `haruki-sekai-*-master` 拉取 | 增加 costume3d 相关的 8–9 张表 |
| UnityFS、typetree、Unity 版本回退 | `ripper-unity`（`BundleSource` trait + unity-rs-core） | 只读单个 bundle，class id 只覆盖剧情用到的类型 |
| ASTC 解码 | `texture_rgba`，符合 Khronos 规范，输出 PNG | 无（决定只输出 PNG，见第 4 节） |
| 网格：蒙皮、blendshape、bindpose、多 UV、顶点色 | ripper 未用；**unity-rs-core 已有**：`mesh::read_mesh(_with_collection)` 提供 skin、blend_shapes、bind_poses、子网格 | 接入，并写 glTF |
| Transform 层级、Renderer 绑定、Avatar | ripper 未用；**unity-rs-core 已有**：`scene_hierarchy`、`renderer`、`avatar`，以及 `model_ir::build_model_ir_for_game_object` | 接入；从指定的根 GameObject 构建 |
| Material | **unity-rs-core 已有** `material::read_material` | 跨 bundle 解析着色器名 |
| 跨 bundle 引用（着色器在 `shader/live`、贴图在 `face/common`） | 无，一次只打开一个 bundle | **新增**：按依赖闭包一起加载（unity-rs-core 有 collection API） |
| MonoBehaviour（SpringBone 等） | typetree JSON 已能读取 | 新增：把 PathID 换成骨骼路径的规范化 |
| AnimationClip | `sse-motion`：保留 StreamedClip 原始三次系数和 binding 哈希（Live2D 用） | 3D 需要按骨架反查哈希，输出 TRS 和 morph 轨道。unity-rs-core 有 `model_animation::build_model_animations`。StreamedClip 是三次 Hermite，可以**无损对应 glTF 的 `CUBICSPLINE`** |
| 部件解析（服装 → recipe） | `ripper-resolve` 只做剧情 | 新增 `costume` 模块 |
| 输出格式与版本 | `ripper-format` + lock 中的 `formats` 表（ADR-0013） | 新增 3D 格式，**并与剧情的 formats 表隔离**（见 3.3） |
| 增量 | 账本按 bundle 记录 `_ripper.json` + crc；`rip --missing` 按剧集补 | 3D 按 bundle crc 和 masterdata 版本对账 |
| S3 发布、跨区服硬链接去重 | ADR-0012 / 0019，已在 SeaweedFS 上运行 | 无（3D 的跨区服重复度很高，收益更大） |
| 资源站已有文件不重复产出 | ADR-0015（`/api/assets/bundle-files`） | 3D 只引用缩略图；模型站上没有 |
| 自动化 | SekaiStoryActions：`rip --missing` + 发布 | 新增一个 costume3d 工作流 |

## 3. 改造方案

### 3.1 仓库与命名

- 仓库改名为 `SekaiExtraRipper`。GitHub 会把旧的 clone / release URL 重定向到新名，部署密钥随仓库保留。
- **crate 名、二进制名 `ripper`、命令和配置文件名保持不变**，避免下游大面积改动。
- 产品范围从「剧情」扩展到「剧情 + 额外资源」：ADR-0006 的范围更新，新增 ADR 说明 3D 服装产品。

### 3.2 workspace 结构

```
crates/
  ripper-cdn        不变（只补 3D 的前缀和依赖下载入口）
  ripper-unity      扩展：多 bundle 加载、模型相关读取
  ripper-convert    扩展：model.rs、gltf.rs、anim3d.rs、texture 的网页编码
  ripper-resolve    新增 costume 模块（剧情模块不动）
  ripper-format     story 与 costume 两组格式分开（见 3.3）
  ripper-cli        新增 `ripper costume …` 子命令
```

- 不新增 crate，也不新增依赖包（见第 4 节）。

### 3.3 输出格式：必须与剧情隔离

ADR-0013 规定：读取方（sse）打开 library 时，会把 lock 的 `formats` 和自己编译时所用的 `ripper_format::formats()` **逐项比对，有任何不同就拒绝**。

如果直接把 3D 格式加进 `formats()`，现有 sse（依赖 tag `v0.10.0`）读取新导出的剧情 library 时会全部失败。因此：

- `ripper-format` 拆成 `story::formats()`（现有内容，含义不变）和 `costume::formats()`。剧情 lock 只写前者。
- 3D 有**自己的输出根和 lock**：
  - `s3://sekai-extra-assets/costume3d/<region>/`
  - 公开地址 `https://assets.pjsk.moe/sekai-extra-assets/costume3d/<region>/`
  - 与 `sekai-story/ripper/<region>/` 并列，互不读写。
- 3D 的格式（都带格式名和版本）：

| 格式 | 文件 | 内容 |
|---|---|---|
| `costume3d-lock` | `costume3d.lock.json` | 工具版本、`formats`、app / CDN / Unity 版本、masterdata commit、已处理 bundle 的 crc 表 |
| `costume3d-catalog` | `catalog/<cid>-<unit>.json` | role 信息（身高、肤色、默认部件、动作 id）和可选部件列表 |
| `costume3d-costume` | `costumes/<costumeNumber>.json` | `characterId → unit → colorId → recipe`，并记录缺失原因 |
| `costume3d-part` | `parts/<bundle>/part.json` | GLB、贴图槽、材质参数、挂点、组件 JSON 的引用 |
| `costume3d-components` | `parts/<bundle>/components.json` | SpringManager / SpringBone / 碰撞体 / ExtraBone / RotationConstraint / Eye / Hair，全部以骨骼路径引用 |
| 原始载荷 | `.glb`、`.png` | 结构由 glTF / PNG 规范定义，不属于本项目格式 |

- 目录沿用 `<bundleName>/…` 布局，SeaweedFS 硬链接去重（ADR-0019）直接适用。

### 3.4 CLI

```bash
ripper costume plan  [--report plan.json]          # masterdata → recipe → 需要的 bundle；不下载
ripper costume rip   [all | costume:<n> | role:<cid>-<unit>] [--missing] [--force]
ripper costume catalog                             # 只重写索引（masterdata 变化、bundle 未变时）
```

- `--missing`：对比 lock 里每个 bundle 的 crc，只重做新增或变化的 bundle 和受影响的 recipe（按 bundle crc 对账，ADR-0016 留下的改进点在这里补上）。
- 下载复用 `fetch` 的依赖跟随；默认的 3D 前缀集合写进配置的 `[costume]` 段。

### 3.5 各模块要新增的内容

**`ripper-unity`**
- `BundleSet`：按依赖闭包同时加载多个 bundle，建立 CAB → bundle 映射，支持解析外部 PPtr。
- 新增 class id：Transform、Material、Shader、Mesh、MeshFilter、MeshRenderer、SkinnedMeshRenderer、Animator、Avatar、RotationConstraint、CapsuleCollider。
- 对 unity-rs-core 的 `build_model_ir_for_game_object`、`read_mesh_with_collection`、`read_material`、`read_avatar`、`build_model_animations` 做薄封装，继续放在 trait 后面（ADR-0002）。

**`ripper-convert`**
- `model.rs`：从根 GameObject（`body` / `face` / `optional`）构建模型图，忽略 `sit_body` 和 `mdl_*`。
- `gltf.rs`：写 GLB。包括坐标系转换（Unity 左手 → glTF 右手）、蒙皮、morph targets（位置 / 法线 / 切线）、顶点色、uv0–uv2；材质参数原样放进 `extras`。贴图不内嵌，只引用 id。
- `anim3d.rs`：解析 `genericBindings` 的路径 CRC32（用骨架路径或 Avatar 的 `m_TOS` 反查），blendshape 属性为 `blendShape.<name>` 的 CRC32。StreamedClip 写成 `CUBICSPLINE`；dense / constant 写成 `LINEAR` / `STEP`；欧拉角转四元数。
- `components.rs`：MonoBehaviour 和内置约束的规范化。
- `texture.rs`：沿用现有的 ASTC → PNG，补上色彩空间标记（写进 `part.json`），不做其他编码。

**`ripper-resolve::costume`**
- 按需求文档 3.4 节实现 role、body / face / 头饰路径、颜色变体、默认值、禁止组合，以及 `costumeNumber = floor(costume3dGroupId / 1000)` 的映射。
- 缺失的 bundle 或颜色记为 warning（沿用剧情的 warning / `--strict` 机制），**不静默回退**。

**`ripper-cdn`**：基本不变。

### 3.6 下游影响

| 下游 | 影响 | 处理 |
|---|---|---|
| SekaiStoryExporter / GUI（`ripper-format` git 依赖，tag `v0.10.0`；部署密钥） | 仓库改名后 git URL 走重定向，可以继续用；剧情的 `formats` 不变 | 下次升级 tag 时顺带把 URL 改成新仓库名 |
| SekaiStoryActions（下载 `RIPPER_VERSION` 的 release 二进制） | release URL 走重定向 | 新增 `costume3d.yml` 工作流；剧情工作流不动 |
| SekaiStoryDocs | 无 | 可在其中补 3D 的逆向记录 |
| Moesekai web | 新的读取方 | 引擎按 `costume3d-*` 格式读取，打开时校验 `costume3d.lock.json` 的 `formats` |
| Asset Updater fork | 不再需要 3D 部分 | 删除 fork 里未接线的 `haruki_3d` 和 `raw_bundles` 配置（可选） |

## 4. 已确定的决策（2026-10-20）

1. **现在就改名**为 `SekaiExtraRipper`。
2. **沿用 ADR-0007 的无损原则**：GLB 的顶点数据和动画曲线原样保留（StreamedClip → `CUBICSPLINE`），贴图输出 **PNG**。
3. **不引入新的依赖包**：
   - 读取：网格、模型图、材质、Avatar、动画都用已经依赖的 `unity-rs-core` 0.5.1。它没有 feature 开关，这些模块本来就编译在内。
   - GLB：用现有的 `serde_json` 写 JSON 块，二进制块手工拼装。GLB 容器只有 12 字节文件头 + JSON / BIN 两个分块，不需要 glTF 库。
   - 贴图：沿用现有的 `png` 输出，**不做 KTX2 / WebP 编码，也不在 ripper 里生成 mip**。浏览器加载 PNG 后由 three.js 生成 mip（贴图都是 2 的幂尺寸）。
   - 体积：这些 PNG 比 ASTC 原始数据大数倍。要压缩体积时，再在发布侧或前端另行处理，不放进 ripper。
4. **不单独建 `ripper-model` crate**，模型转换放进 `ripper-convert`、读取放进 `ripper-unity`。当初考虑单独拆出，是为了不让 glTF 和贴图编码的新依赖拖累剧情相关的 crate；既然不引入新包，就没有拆分的理由了。
   - sse 只依赖 `ripper-format`，不链接 `ripper-convert`，所以放在一起也不会影响 sse。
5. **首发区服 JP**：游客登录和签名 cookie 已由 `ripper-cdn` 支持（ADR-0017）。CN 的样本只用于本地开发对照。

## 5. 实施顺序（建议的 PR 序列）

1. 改名 + 文档：更新 README、ADR-0006 范围；新增 ADR-0020（本方案）。
2. `ripper-format` 拆分 story / costume 两组格式表，剧情输出逐字节不变（用现有测试保证）。
3. `ripper-unity`：`BundleSet` 与模型相关读取；用样本 bundle（body、face、头饰、颜色、动作）写回归测试。
4. `ripper-convert`：GLB 输出（网格、蒙皮、morph、材质 extras），并用 glTF validator 检查。
5. `ripper-convert`：组件规范化与动画转换。
6. `ripper-resolve::costume` 与 `ripper costume plan`。
7. `ripper costume rip`、增量、S3 发布到 `costume3d/jp/`。
8. SekaiStoryActions 的 costume3d 工作流；Moesekai 前端接入。

动手前先完成需求文档 3.6 节列出的 7 个逆向确认点，尤其是 face 与 body 的骨骼合并方式和头饰的 per-face 偏移，它们会影响第 4–6 步。
