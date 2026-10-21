# SekaiLive2DViewer：在网页里查看 Live2D 模型

在浏览器里查看一个 Project SEKAI 的 Live2D 模型：选动作、选表情，开关物理和呼吸，缩放和平移。
模型由 SekaiStoryExporter（SSE）的 Live2D 实现编译成 WebAssembly，用 WebGPU 绘制：

- 动作分层、眨眼、呼吸、限幅和物理来自 `sse-live2d::runtime`；
- 绘制来自 `sse-live2d-render`（SSE ADR-0035）。

因此模型的样子和动作与游戏一致，也与 SSE 的剧情播放器、导出视频一致。

这份说明随发布物（`sekai-live2d-viewer-<版本>.tar.gz`）一起提供，供站点嵌入。

## 发布物

| 文件 | 作用 |
|---|---|
| `viewer.js` | 页面引入的 ES 模块，导出 `SekaiLive2DViewer` |
| `viewer-worker.js` | Worker：取文件（动作和表情按需取）、缓存，在 OffscreenCanvas 上绘制 |
| `pkg/sekai_live2d_viewer.js`、`pkg/sekai_live2d_viewer_bg.wasm` | wasm（`no-modules` 产物，Worker 用 `importScripts` 载入） |
| `manifest.json` | 这份发布物的来历，见下 |
| `LICENSE`、`LICENSE-EXCEPTION`、`README.md` | 许可和这份说明 |

`manifest.json` 记录这份发布物从哪里来：

- `format`：固定为 `sekai-live2d-viewer-release/1`。
- `version`、`commit`：版本号和构建它的提交。`dirty` 为真表示构建时工作区有未提交的改动。
- `toolchain`：使用的工具链。
- `sha256`：除 `manifest.json` 外每个文件的 SHA-256。

目录里只有 manifest 列出的文件，把发布物拷到别处时可以逐个文件校验。

整个目录要原样放在**与页面同源**的位置，因为浏览器不允许从别的源启动 Worker。
`viewer.js` 按自己所在的目录找 `viewer-worker.js` 和 `pkg/`，所以 `js` 和 `pkg` 两个选项通常都不用给。

**不包含 Cubism Core。** Worker 在运行时从 Live2D 官方地址
`https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js` 加载 Cubism Core for Web（SSE ADR-0032）：

- 这个地址不带版本号，提供的是 Live2D 当前放在那里的版本。
- 想固定版本、或者不依赖 Live2D 的服务器，可以自己托管一份，用 `core` 选项给出地址。再分发的条件由站点自己满足。
- Core 是 Live2D Inc. 的软件，适用它自己的许可。

## 浏览器要求

需要 WebGPU、OffscreenCanvas 和 Worker（Worker 要能用 `importScripts`）。不需要跨源隔离，也不需要音频。

```js
const { ok, missing } = await SekaiLive2DViewer.supported();
// missing 里可能有：webgpu、webgpu-adapter（有 WebGPU 但拿不到适配器）、offscreen-canvas、worker
```

`create` 一开始也做这个检查。缺少能力时，它抛出带 `missing` 的 Error，`kind` 为 `unsupported`。

## 用法

```js
import { SekaiLive2DViewer } from "/live2d-viewer/<版本>/viewer.js";

const dpr = devicePixelRatio;
const viewer = await SekaiLive2DViewer.create({
  canvas,                                      // 一个新的 <canvas>，交给查看器后就归它所有
  library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/", // 剧情库根目录（可以是代理）
  model: { bundle: "live2d/model/01ichika_normal", motion: "live2d/motion/01ichika_motion_base" },
  width: canvas.clientWidth * dpr,             // 绘制尺寸（像素）= CSS 尺寸 × devicePixelRatio
  height: canvas.clientHeight * dpr,
  // core: "https://<站点>/live2dcubismcore.min.js",  // 可选：自己托管的 Cubism Core
  signal,                                      // 可选：AbortSignal，中途放弃加载时 create 以 AbortError 拒绝
  onProgress: ({ loaded, total }) => {},       // 可选：已取到的文件数和总数
});
// 文件全部取完、模型建好并开始播放之后，create 才返回

viewer.motions;           // 身体动作名，已排序
viewer.facials;           // 表情名，已排序
await viewer.playMotion("w-normal-nod01");                  // 播一遍，停在最后一帧，然后发 motionend
await viewer.playMotion("w-cute02-tilthead", { loop: true }); // 每次播完重新开始
await viewer.setFacial("face_smile_01");                     // 都返回 Promise，见“按需加载”
viewer.physics = false;   // 物理开关；重新打开时，摆动从静止开始
viewer.breath = false;    // 呼吸开关
viewer.pause(); viewer.play();
viewer.setView({ zoom: 2, x: 0, y: -0.6 });
viewer.resize(w * dpr, h * dpr);
viewer.destroy();         // 释放 Worker 及其中的文件和 GPU 资源；离开或换模型时调用
```

`model.bundle` 和 `model.motion` 取自 `models.json` 里同名的两个字段，见 [models-json.md](models-json.md)。
`motion` 可以为 `null`，这时模型没有动作也没有表情，只有呼吸和物理。

### 透明背景

画布配置为预乘 alpha，模型以外的部分完全透明。背景（例如剧情背景图）由页面自己用 CSS 垫在画布下面：

```css
.stage { background: url(…/bg_a000007.webp) center / cover; }
.stage canvas { width: 100%; height: 100%; }
```

### 取景和缩放

`zoom` 为 1 时，整个模型都在画面里，四边各留 3% 的边。取景范围是 moc 的画布，再加上模型在默认姿势下超出画布的部分（有些模型的腿会画到画布外面）。这和剧情里只显示上半身的取景不同。

`setView({ zoom, x, y })` 的含义：

- `zoom`：缩放倍数，不小于 1。
- `x`、`y`：zoom 为 1 时的取景中心落在画布上的位置，用 NDC 表示：x 朝右、y 朝上，(0, 0) 是画布中央，±1 是画布边缘。

缩放是把相机看到的范围（`ortho_size`）缩小，模型按新的尺寸重新绘制，而不是把图片放大，所以放大后仍然清晰。

以画布上的某一点 p（NDC）为中心缩放，从 z1 变到 z2 时，这样算出新的 x、y，p 底下的内容就不会移动：

```js
const x2 = p.x - (p.x - x1) * z2 / z1;
const y2 = p.y - (p.y - y1) * z2 / z1;
```

滚轮缩放、双指缩放和拖动平移都可以用这个公式实现，开发页 `dev/viewer.html` 里有完整的例子。
`viewer.view` 返回当前的 `{ zoom, x, y }`。

### 默认动作和默认表情

`create` 时自动播放 `defaultMotion`（播一遍，不循环）和 `defaultFacial`。这一次不发 `motionstart`，
因为那时页面还没来得及挂监听器；`viewer.motion` 和 `viewer.facial` 已经是这两个值。

- **默认动作：** 依次找剧情里用得最多的几个动作：`w-normal-tilthead01`、`w-normal01-tilthead`、`w-normal-nod01`、`w-normal01-nod`。
  都没有时，取名字以 `w-normal` 开头的 tilthead 动作，再找其他 tilthead 动作，再找 nod 动作，最后取排序后的第一个。
  这些动作结束时都是自然站立的姿势。
  动作包里没有 idle 动作；`w-normal-default01` 停在模型的初始姿势（两臂平伸），所以不选它。
- **默认表情：** `face_normal_01`，没有时取其他以 `face_normal` 开头的表情，最后取排序后的第一个。

必须有一个身体动作：游戏里新建的模型会暂停自动眨眼，直到第一个身体动作结束才恢复。没有动作的模型永远不会眨眼。

### 动作和循环

- **`loop` 为 false（默认）时与游戏相同。** 动作播一遍，停在最后一帧，结束后恢复眨眼，并发出 `motionend`。
  游戏数据本身就标为循环的动作会一直循环，不发 `motionend`。
- **`loop` 为 true 时，** 动作每次结束都重新开始，用游戏里同类动作之间 0.125 秒的混合衔接。换动作之前不发 `motionend`。
  每次重新开始后都会唤醒眨眼，所以模型会一直眨眼。这一点有意和游戏不同：游戏里动作播放期间不眨眼。
- **切换规则与游戏的 `ChangeMotion` 和 `ChangeFacial` 相同。**
  - 同类动作、或者其中一个是连接动作时，混合 0.125 秒；其他情况用新动作自己的淡入时间，默认 0.5 秒。
  - 表情用自己的淡入时间。
- 传入 `motions` 或 `facials` 里没有的名字时，`playMotion` 和 `setFacial` 直接抛错（同步抛出，不是返回被拒绝的 Promise）。

### 按需加载

打开模型时只取这些文件：

- 两份 `_ripper.json`；
- 模型包里除动作文件以外的文件，也就是 moc、贴图、物理和 model3 等；
- 默认动作和默认表情各 1 个文件。

一般是 9 个文件左右，最多 14 个。`motions` 和 `facials` 两个名字列表直接从清单里读，不用先下载文件。

其他动作和表情，第一次用到时才取那 1 个文件（压缩后约 1 KB），之后从缓存读。因此 `playMotion` 和 `setFacial` 都返回 Promise：

- **resolve 为 `true`：** 文件已到、已经开始播放。`motionstart` 在这时发出，`viewer.motion` 和 `viewer.facial` 也在这时更新。
- **resolve 为 `false`：** 文件还没到时，又调用了同一个方法（以最后一次为准），这一次被取代、不会播放。`destroy()` 时还没完成的调用也 resolve 为 `false`。
- **reject：** 文件取不到。Error 带 `kind`（一般是 `network`）和 `url`。查看器继续播放原来的动作，不会发 `error` 事件；可以提示后再试一次。

## 事件

事件都是 `CustomEvent`：

| 事件 | 时机 |
|---|---|
| `ready` | 模型已经画出来（在 `create` 返回前发出） |
| `progress` | 加载中，`detail: { loaded, total }` |
| `motionstart` | `playMotion` 开始了一个动作（文件已到），`detail: { name, loop }` |
| `motionend` | 只播一遍的动作播完了，`detail: { name }` |
| `error` | 出错并停止，不会再恢复，`detail: { message, kind, url }`；同样的信息也在 `viewer.error` 里 |

## 出错

`create` 抛出的 Error、`error` 事件的 `detail`，以及 `playMotion` 和 `setFacial` 被拒绝时的 Error，都带 `kind` 字段：

| `kind` | 含义 | 建议的提示 |
|---|---|---|
| `unsupported` | 浏览器缺少必需的能力，`missing` 列出缺了什么 | 说明不支持，不提供重试 |
| `not-found` | 剧情库里没有这个模型包或动作包，`url` 是它的 `_ripper.json` | 说明没有这个模型，不提供重试 |
| `network` | 某个文件取不到，`url` 是它的地址 | 提示检查网络，提供重试 |
| `internal` | 其他错误 | 显示 `message`，提供重试 |

- 每个文件最多取 4 次。连续 30 秒没有收到数据算一次失败。服务器明确没有的文件（404）不重试。
- 重试的做法是先 `destroy()`，再用**新的画布** `create` 一次。画布交给 Worker 后就收不回来，`create` 失败时也一样。

## 缓存

- 文件存在 Cache API 的 `sekai-live2d-v1` 里。缓存键是文件地址加上它所在包的 `crc`。
- 每次打开都重新取模型包和动作包的 `_ripper.json`（两个小文件），其余文件只要缓存里有就直接读。
- 剧情库重新导出了某个包时，`crc` 会变，那个包的文件会重新下载，旧的缓存条目会被删掉。

下载量参考：首次打开 01ichika_normal 要取 9 个文件，共 2.6 MB，绝大部分是贴图和 moc。
`models.json` 里每个模型的 `bytes` 和 `files` 就是首次打开要取的量；之后每用一个新的动作或表情，再多取约 1 KB。

## 本地开发

剧情库的主机只对 `https://pjsk.moe` 放行跨域，在本地开发时要经代理访问。
仓库里的 `dev/serve.py` 提供代理：把 `/remote/assets.pjsk.moe/…` 转发到真实地址，
页面里把 `library` 设成 `http://127.0.0.1:8788/remote/assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/` 即可。

## 许可

见同目录的 `LICENSE`（AGPL-3.0-or-later）和 `LICENSE-EXCEPTION`（允许与 Live2D Cubism Core 链接的附加许可，与 SSE 相同）。
wasm 里编入了 SekaiStoryExporter 的 crate，它们的许可与本项目相同。其他第三方 Rust 依赖的许可声明还没有随发布物提供。
