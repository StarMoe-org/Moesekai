# 3D 服装预览：需求分析与解包器设计

> 配套文档：`costume-3d-preview-plan.md`（整体计划）、`sekai-extra-ripper-plan.md`（解包器并入 SekaiExtraRipper 的方案）。本文只回答两件事：完整的 3D 服装预览需要解包哪些内容，以及重写后的解包器（Asset Updater 的 3D 部分）需要实现什么。
>
> 依据：
> - 2026-10-20 从 CN CDN 实际下载并用 UnityPy 解析的样本 bundle：
>   - `characterv2/body/99/0001/ladies_m`
>   - `characterv2/face/01/0001`、`face/14/0095a`、`face/common`
>   - `characterv2/head_optional/{0521/a03,0611/a01,0679/a05,0747/a02,0884/a02,1095/a05}`
>   - `character/head_optional/0095/a03`
>   - `color_variation/body/99/0001/ladies_m/01`、`color_variation/head_optional/0521/a03/01`
>   - `character/motion/costume_setting/01_00`
>   - `character_settings/water_eye_preset`
>   - `shader/live`
> - CN 6.0.0 全量清单 `sdk_data/AssetBundleInfoNew.json`。
> - JP masterdata（`metadata.pjsk.moe/jp/master`）。
> - 逆向产物 `re-jp-pjsk-6.8.1`（dump、伪代码）。实施前用 prsk-reverse-workflow 的 JP 7.0.0 产物复核。

## 1. 功能需求 → 数据需求

| 功能 | 需要的数据 | 来源 |
|---|---|---|
| 渲染一个角色穿某套服装 | body 蒙皮网格 + 骨架、face/hair 网格、头饰网格、材质参数、贴图 | `characterv2/body`、`characterv2/face`、`characterv2/head_optional`（旧版 `character/head_optional`） |
| 颜色变体（オリジナル / アナザー1–3） | 替换用的贴图 | `characterv2/color_variation/body`、`…/color_variation/head_optional`（旧版 `character/color_variation/head_optional`） |
| 正确选择部件 | costume → model → bundle 的映射、默认头发 / 头部、禁止组合、体型 | masterdata：`costume3ds`、`costume3dModels`、`character3ds`、`costume3dModelDefaultHairs`、`costume3dModelNotAvailablePatterns`、`gameCharacters`、`gameCharacterUnits`（CN/TW/KR 另需 `costume3dGroups`） |
| 肤色（含两级阴影色） | 每个角色 × unit 的皮肤色 | `gameCharacterUnits.skinColorCode / skinShadowColorCode1 / 2`（写入材质 `_DefaultSkinColor / _Shadow1SkinColor / _Shadow2SkinColor`） |
| 身高 | 角色身高 | `gameCharacters.height`（对应游戏 `CharacterModel.Height`） |
| Toon 着色、描边、脸部阴影、眼睛 | 材质的 keyword / float / color / 贴图槽；FaceSDF 贴图；眼睛水光贴图；着色器语义 | 各 bundle 的 Material；`face/common`；`character_settings/water_eye_preset`；`shader/live`（只用于逆向） |
| 头发、裙摆物理 | SpringManager / SekaiSpringBone / 碰撞体参数 | body、face bundle 内的 MonoBehaviour |
| 辅助骨骼 | ExtraBone、RotationConstraint | body、face bundle 内的组件 |
| 待机动作 + 表情 | 身体骨骼动画 + 面部 blendshape 动画 | `character/motion/costume_setting/<NN>_00`（`motion`、`motion_loop`、`face`、`face_loop`） |
| 预览相机、灯光默认值 | `ModelRenderStudioConfig`、`CharacterLightData`、`SekaiCharacterDirectionalLight` | APK 内的 Resources 预制体 `Live/Prefabs/CharacterModelRenderStudio`。**不在 CDN 清单里**，属于一次性逆向工作。 |
| 列表缩略图 | 已有 | `thumbnail/costume/*.webp`（storage 上已存在） |

## 2. 完整解包清单

### 2.1 CDN bundle（解包器负责，持续跟版本）

数量与体积取自 CN 6.0.0 全量清单；JP 需要用 7.0.0 清单重新统计。

| 路径模式 | 分类 | 数量 / 体积 | 内容（实测） | 必需性 |
|---|---|---|---|---|
| `live_pv/model/characterv2/body/<model>/<figure>` | Live_pv | 3388 / 2.82 GB | 根预制体 `body`（使用）、`sit_body`（坐姿，不用）、`mdl_bdy_*`（原始模型，不用）。<br>蒙皮网格 `Body`：约 5.9k 顶点、99 骨、无 blendshape。<br>贴图 `tex_bdy_*_C/S/H`：1024²，ASTC。<br>材质 `mtl_bdy_00`。<br>组件：SpringManager×2、SekaiSpringBone×24、SpringSphereCollider×38、SpringCapsuleCollider×12、ExtraBone×12、RotationConstraint×16、Unity CapsuleCollider×11。 | 必需 |
| `live_pv/model/characterv2/face/<cid>/<model>` | Live_pv | 2588 / 6.57 GB | 根预制体 `face`（使用）、`mdl_chr_*`（原始，不用）。<br>`Face` 网格：59 个 blendshape（look / mouth / eye / eyeblow）、5 个子网格，分别对应 ehl / eye / eyelash / chr / eyebrow 材质。原始模型里只有 26 个 blendshape，**必须取预制体引用的那份**。<br>`Hair_combined` 网格。整头（`head_and_hair`，如 `14/0095a`）还会多一个 `Acc` 蒙皮网格。<br>`faceSdf` 贴图、头发 / 脸 / 眼 / 高光贴图。<br>组件：SekaiSpringBone、SpringManager、SekaiCharacterEye、SekaiCharacterHair。<br>骨架里有头饰挂点 `Head/a01…a09`。<br>依赖 `face/common`、`shader/live`。 | 必需 |
| `live_pv/model/characterv2/face/common` | Live_pv | 1 / 4 KB | `c_white_01`、`tex_elu_00_c`（材质跨 bundle 引用的公共贴图）。 | 必需 |
| `live_pv/model/characterv2/color_variation/body/<model>/<figure>/<color>` | Live_pv | 9754 / 4.19 GB | 只有 3 张贴图 `tex_body_C/S/H`，没有网格和材质。 | 必需（颜色变体） |
| `live_pv/model/characterv2/color_variation/face/…` | — | CN 中为 0 | 预留。 | 可选 |
| `live_pv/model/characterv2/head_optional/<acc>/<aNN>` | StartApp | 467 / 0.07 GB | 根预制体 `optional`（使用）、`mdl_acc_*`（原始）。<br>静态网格 `Acc`（MeshFilter + MeshRenderer，不蒙皮）、贴图 C/S/H 512²、材质 `mtl_acc_00`。<br>不含任何 MonoBehaviour。 | 必需 |
| `live_pv/model/characterv2/color_variation/head_optional/<acc>/<aNN>/<color>` | Live_pv | 1377 / 0.14 GB | 头饰颜色贴图。 | 必需（颜色变体） |
| `live_pv/model/character/head_optional/<acc>`<br>`live_pv/model/character/color_variation/head_optional/<acc>/<color>` | StartApp / Live_pv | 482 + 1425 / 0.14 GB | 旧版头饰。游戏仍有路径模板（`stringliteral` 25126、25128），结构与 v2 相同，但 bundle 内自带一个 Shader 对象。 | 必需（部分服装引用） |
| `character/motion/costume_setting/<NN>_00` | StartApp | 33 / 0.01 GB | 4 个 AnimationClip：<br>`motion`（7.48 s，不循环）和 `motion_loop`（5.33 s，循环）绑定 171 条 Transform 曲线；<br>`face` 和 `face_loop` 绑定 26 条 blendshape 曲线（typeID 137）。<br>60 Hz，Mecanim 格式（streamed + dense + constant）。 | 必需（动作） |
| `live_pv/model/character_settings/water_eye_preset` | Live_pv | 1 / 78 KB | `WaterEyePresetTable` 和 4 个 `WaterEyePreset`（0001 Default / 0002 Cry / 0003 Very Cry / 0100 Weak）：眼睛水光扭曲参数及 2 张扭曲贴图。 | 建议（眼睛还原度） |
| `shader/live` | Tutorial（CN） | 1 / 0.38 MB | 含 `Sekai/Live/Character/Toon`、`Toon-v3`（59 个属性）、`Eye-Base`、`Eye-Highlight`、`Accessory/Toon`、`Shadow*` 等编译后的着色器。材质通过外部 CAB 引用它。 | **逆向一次即可**：网页不加载着色器，只需要它的属性表和子程序作为移植依据。解包器只需解析出「着色器名」来标注材质。 |

不需要：`characterv2/body` 里的 `sit_body`、各 bundle 里的 `mdl_*` 原始模型、旧版 `live_pv/model/character/body|face`（73 个旧 MV 模型）。

### 2.2 masterdata（解包器读取，用于生成索引）

| 表 | 用到的字段 | 用途 |
|---|---|---|
| `costume3ds` | `id`、`costume3dGroupId`、`partType`、`colorId`、`colorName`、`characterId`、`assetbundleName`、`costume3dType`、`archivePublishedAt` | 服装 → 部件、颜色；Moesekai `costumeNumber = floor(costume3dGroupId / 1000)` |
| `costume3dModels` | `costume3dId`、`unit`、`assetbundleName`（body `99/0001`，face `01/0016`，头饰 `0095/a03`）、`colorAssetbundleName`、`headCostume3dAssetbundleType`、`part`（挂点 `aNN`）、`thumbnailAssetbundleName` | 计算 bundle 路径、挂点、整头还是头饰 |
| `character3ds` | `characterId`、`unit`、`head / hair / bodyCostume3dId` | 每个 role 的默认部件 |
| `costume3dModelDefaultHairs` | `unit`、`headCostume3dId`、`hairCostume3dId` | 头饰对应的默认发型 |
| `costume3dModelNotAvailablePatterns` | `unit`、`headCostume3dId`、`hairCostume3dId` | 禁止组合 |
| `gameCharacters` | `id`、`figure`、`breastSize`、`height`、`gender`、`unit` | body 文件名（`ladies_<breastSize>` / `mens` …）、身高 |
| `gameCharacterUnits` | `gameCharacterId`、`unit`、皮肤三色 | 肤色 |
| `costume3dGroups`（CN/TW/KR） | 补全压缩行的 characterId 等 | 各区数据结构差异 |
| `cardCostume3ds`、`costume3dShopItems` | 卡牌 / 商店关联 | 前端入口（可选） |

### 2.3 一次性逆向产物（不进解包器）

- `shader/live` 的子程序和属性默认值：用现有 `story/scripts/40_dump_shaders.py`、`50_shader_json_metal.py` 导出。
- APK Resources 中的 `CharacterModelRenderStudio` 预制体、`ModelRenderStudioConfig`、`CharacterLightData`。
- 伪代码：`LiveCharacterModelData.SetCostumeParts / GetAssetBundleNames`、`CharacterModel`、UTJ SpringBone、`CharacterAccessoryTransformController`。
- 以上结果作为常量和移植的着色器写进引擎，跟版本人工复核。

## 3. 解包器需要实现的内容

整体流程：

```
清单 ─► 选择 + 依赖闭包 ─► 下载 / 反混淆 / 暂存（增量）─► Unity 解析 ─► 规范化 ─► 产物（GLB / 贴图 / JSON）─► 索引 ─► 校验 ─► 发布
```

### 3.1 下载层

1. **独立的选择规则**：用 `include` / `exclude` 正则选 bundle，**不受 bundle 分类限制**。上面的 bundle 分属 `Live_pv` / `StartApp` / `Tutorial` 三类，现有 fork 的 `filters` 下载不到 `Tutorial`。
2. **依赖闭包**：递归加入 `dependencies`（`face/common`、`shader/live` 等），并单独记录每个 bundle 的依赖列表，供跨 bundle 引用解析。
3. **独立的增量账本**：
   - 记录 bundle → hash（CN 用 crc）；只处理新增或变化的 bundle。
   - 账本只在产物成功生成后才写入。
   - 一个 bundle 变化时，重新计算引用它的服装索引。
4. **反混淆后暂存原始 bundle**：内容寻址缓存，可复用。不走 Updater 的普通导出（避免 OBJ 和大量 typetree JSON）。
5. **完整性**：校验长度（CN：`fileSize + 4`）与 hash；失败重试；记录缺失的 bundle，下次补齐。
6. **多区服**：每个区服各自用清单和 masterdata；`downloadPath` 等区服差异沿用 Updater 现有的 provider。

### 3.2 Unity 解析层

1. **UnityFS + 序列化文件**：读取 typetree（实测样本带有 typetree，MonoBehaviour 可以直接解析）。Unity 版本回退用 `2022.3.62f*`。
2. **跨 bundle PPtr**：材质的 `m_Shader` 是外部引用（`m_FileID ≠ 0`，指向 `archive:/CAB-…`）。需要建立 CAB 名 → bundle 的映射，用来解析 `shader/live` 里的着色器名，以及 `face/common` 里的贴图。
3. **按预制体取对象**：只从根 GameObject `body` / `face` / `optional` 出发遍历层级；忽略 `sit_body`、`mdl_*`。实测原始模型的网格与预制体的不同（Face 只有 26 个 blendshape，而预制体是 59 个）。

### 3.3 规范化：每类对象要导出的内容

| 对象 | 必须保留 |
|---|---|
| Transform 层级 | 名称、完整路径、本地 TRS（Unity 左手坐标 → glTF 右手坐标，统一在这里转换）。<br>body 的根链是 `body/Position/PositionOffset/Hip/…`，face 的是 `face/Position/Hip/…`。**两者合并时按骨骼名对齐**（face 的 Hip / Waist / …/Head 对应 body 的同名骨骼），需要逆向确认合并规则（3.6）。 |
| SkinnedMeshRenderer + Mesh | 顶点流（实测通道：位置、法线、切线、**顶点色**（描边宽度、眉毛透明度）、uv0–uv2、骨骼权重、骨骼索引）；子网格及其材质顺序；16/32 位索引；bindpose；`m_Bones` → 骨骼路径；root bone；包围盒。<br>blendshape：每个通道的名字（`BS_mouth.mouth_a` 等）、帧权重、位置 / 法线 / 切线增量。<br>支持 `m_MeshCompression`（实测为 0，但要兼容）和 `m_StreamData`（外部资源流）。 |
| MeshFilter + MeshRenderer | 头饰的静态网格及其挂在哪个节点上。 |
| Material | 名称、着色器名（跨 bundle 解析）、`m_ValidKeywords`（如 `_LAMBERT`、`_UseFaceSDF`、`_OUTLINE_SECOND_NORMAL`）、render queue、所有 TexEnv（槽名 → 贴图 id + scale / offset）、Floats、Colors。<br>原样保留，不做语义转换，由引擎解释。 |
| Texture2D | 解码 **ASTC 4×4（format 48）/ 6×6（format 50）**，Android 区服需要兼容 ETC2。<br>记录色彩空间。`_ValueTex`（H）用的是 4×4 精度，可能是数据贴图，要确认应按线性还是 sRGB 处理。<br>原始贴图没有 mip，由浏览器生成，解包器不处理。<br>输出 PNG（2026-10-20 决定：无损，不引入新的编码依赖）。按内容 hash 去重。 |
| MonoBehaviour | 按类名导出为 JSON，**PathID 一律换成骨骼或对象路径**：<br>`SpringManager`（frameRate、dynamicRatio、gravity、bounce、friction、各开关、springBones）；<br>`SekaiSpringBone`（stiffness、drag、springForce、wind、angularStiffness、角度限制、半径、碰撞体列表、colliderFlag、pivotNode）；<br>`SpringSphereCollider` / `SpringCapsuleCollider` / `SpringPanelCollider`；<br>`ExtraBone`（referenceBone、rotationOrder、coefficient、轴）；<br>`SekaiCharacterEye`（光照影响、tint、emission、tiling、闭眼值）；<br>`SekaiCharacterHair`（headTransform、offset）；<br>`WaterEyePreset(Table)`。 |
| RotationConstraint（Unity 内置） | weight、rotationAtRest / offset、轴开关、sources（路径 + 权重）。 |
| CapsuleCollider（Unity 物理） | 先原样导出；是否参与 SpringBone 待逆向确认。 |
| AnimationClip | **解码 Mecanim 压缩格式**：streamed、dense、constant 三种曲线，60 Hz，停止时间，循环标志。<br>**解析绑定**：`genericBindings` 的 path 是 CRC32 哈希，需要用骨架所有路径（或 Avatar 的 `m_TOS`）反查；attribute 1 = 位置、2 = 旋转、3 = 缩放、4 = 欧拉角；typeID 137 = blendshape，attribute 是 `blendShape.<名称>` 的 CRC32。<br>欧拉角转四元数；输出 glTF 动画（TRS 和 morph weights 通道）。 |
| Avatar | 读取 `m_TOS`（路径哈希表）用于动画绑定；不需要导出。 |

### 3.4 组装索引（每个区服一份）

解包器要把游戏的部件选择逻辑预先算好，前端只按 id 取：

1. **role**：`characterId + unit`。普通角色 1–20 固定 unit；Miku 有 6 个 unit；22–26 为 piapro。表来自 `character3ds`。
2. **body**：`characterv2/body/<costume3dModels.assetbundleName>/<figure 文件>`。figure 文件来自 `gameCharacters.figure` + `breastSize`，例如 `ladies_m`；`mens`、`boys` 的命名规则待确认。<br>颜色变体：`color_variation/body/<model>/<figure 文件>/<colorAssetbundleName>`。没有对应 bundle 时要**标记为缺失**，不能静默回退成原色。
3. **face / hair**：face bundle = `characterv2/face/<cid>/<model>`，一个 bundle 同时含脸和头发：
   - 发型由 hair costume 的 model 决定；
   - 整头（`head_and_hair`）直接用它自己的 face bundle，这时 hair 被锁定；
   - `NN/0000` 这类默认发型的回退规则要按伪代码确认（游戏中有 `'0001_01'` 常量）；
   - `_mc` 后缀的 bundle 用途待确认。
4. **头饰**（`head_only / head_all / head_front / head_back`）：`characterv2/head_optional/<acc>/<part>`，找不到时回退旧版 `character/head_optional/<acc>`；挂到 face 骨架的 `Head/<part>`（`a01…a09`）。颜色从 `color_variation/head_optional/…` 取。
5. **默认值与限制**：没有头饰时用 `character3ds` 默认 head；发型按 `costume3dModelDefaultHairs`；`costume3dModelNotAvailablePatterns` 中的组合标记为不可用（整头不受限制）。
6. **Moesekai 服装映射**：`costumeNumber → { characterId → { unit → { colorId → recipe } } }`。recipe 由部件资源 id 组成，同时记录缺失原因。
7. 肤色、身高、动作（`costume_setting/<NN>_00` 中 `NN` 与角色 / unit 的对应关系，Miku 各 unit 用不同编号，待确认）写进 role 信息。

### 3.5 产物与发布

- **部件 GLB**：body / face / 头饰各一份。包含网格、蒙皮、morph targets、骨架；材质参数放在 `extras`（或单独的 JSON）；**不内嵌贴图**，通过 id 引用。<br>颜色变体只换贴图 id，共享网格。
- **贴图**：PNG，按内容寻址（`sha256/<hh>/<hash>.png`）。
- **组件 JSON**：SpringBone、碰撞体、约束、ExtraBone、Eye、Hair 等参数。
- **动作 GLB**：只含动画，每个 `costume_setting` bundle 一份。
- **索引**：`catalog/<role>.json`（可选部件列表，按 role 拆分以控制体积）、`costumes/<costumeNumber>.json`（recipe）、`snapshot.json`（来源版本、masterdata 版本、统计）。
- **发布**：遵循 Moly 在 `assets.pjsk.moe/sekai-extra-assets/` 的约定：
  - 已发布的字节不可变，用长缓存；
  - `manifest.json` 最后替换；
  - 压缩文件带正确的 `Content-Encoding`；
  - 开放跨域。

### 3.6 需要先逆向确认的点（实现前）

1. **face 与 body 的骨骼合并方式**：按名称对齐、谁覆盖谁，以及 `PositionOffset` / `OffsetValue` 的作用（鞋跟偏移？）。看 `CharacterModel` 的初始化。
2. **头饰的 per-face 偏移**：dump 中有 `CharacterAccessoryTransformData`（`faceId → AccessoryTransform`）。样本里的头饰、face、body bundle 都**不含**这份数据。需要确认它是否只用于 MySekai，还是另有来源。
3. **`_ValueTex`（H）的色彩空间**，以及 `faceSdf` 的采样方式。
4. **默认发型 `0000` 的回退规则**、`_mc` 后缀，以及 `mens` / `boys` 的命名。
5. **`costume_setting/<NN>`** 与角色、unit 的对应关系。
6. **Unity `CapsuleCollider`**（11 个）是否参与 SpringBone 碰撞。
7. **JP 清单的分类**与 CN 是否一致（影响不大，因为选择规则不看分类）。

### 3.7 验收与运维

- **完整性检查**：每个已发布 recipe 引用的文件都存在；缺失的 bundle 和颜色有清单可查。
- **一致性**：抽样渲染对比（可选 headless 截图），blendshape 数量、骨骼数与源数据一致。
- **增量**：变化的 bundle 和 masterdata 只触发相关产物的重建；导出器版本号变化时触发全量重建。
- **规模**（CN 原始数据约 14.6 GB）：
  - face 单个约 2.3 MB、共 2588 个，是主要耗时；
  - 需要并发处理，并控制内存上限；
  - 记录每个阶段的耗时和数量。
- **日志**：保留每个 bundle 的处理结果（成功 / 跳过 / 失败原因）。
