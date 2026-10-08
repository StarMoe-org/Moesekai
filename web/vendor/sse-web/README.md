# sse-web：网页端剧情播放器

SekaiStoryExporter 编译成 WebAssembly 后在浏览器里实时播放一话剧情：模拟、Pass 1、混音、渲染与导出视频是同一份实现（ADR-0030、ADR-0031）。这份说明随发布物（`sse-web-<版本>.tar.gz`）一起提供，供站点嵌入。

## 发布物

| 文件 | 作用 |
|---|---|
| `player.js` | 页面引入的 ES 模块，导出 `SsePlayer` |
| `sim-worker.js` | 模拟 Worker：时间轴、Pass 1、混音 |
| `render-worker.js` | 渲染 Worker：OffscreenCanvas 上的 Pass 2，UI 套件派生 |
| `audio-worklet.js` | 播放混音并充当时钟 |
| `kit-worker.js` | 派生 UI 套件的 Worker：加载期间运行，开播前结束；派生结果存进浏览器的 Cache API，下次访问直接取 |
| `common.js` | 各 Worker 共用的加载器 |
| `pkg/sse_web.js`、`pkg/sse_web_bg.wasm` | wasm（`no-modules` 产物，Worker 用 `importScripts` 载入） |
| `manifest.json` | 这份发布物的来历：版本、构建它的提交（`dirty` 为真表示工作区有未提交的改动）、工具链，以及其余每个文件的 SHA-256。把发布物拷到别处的一方可以据此校验 |

六个脚本要放在同一个目录下，`pkg/` 是它的子目录（也可以用 `pkg` 选项指到别处）。

**不包含 Cubism Core。** 播放器在运行时从 Live2D 的官方地址 `https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js` 加载 Cubism Core for Web（ADR-0032）。这个地址不带版本号，提供的是 Live2D 当前放在那里的版本（2026-10-09 是 Core 05.01.0000）。想固定版本或不依赖 Live2D 的服务器的站点，可以自己托管一份，用 `core` 选项给出它的地址；再分发的条件由站点自己满足。Core 是 Live2D Inc. 的软件，适用它自己的许可。

## 浏览器要求

WebGPU、OffscreenCanvas、AudioWorklet（只在安全上下文即 HTTPS 下可用），以及能用 `importScripts` 的经典 Worker。不需要跨源隔离（不用 SharedArrayBuffer）。

开播前可以先问浏览器缺什么，不加载任何文件：

```js
const { ok, missing } = await SsePlayer.supported();
// missing 里的项：webgpu（没有 WebGPU）、webgpu-adapter（有 WebGPU 但拿不到适配器：被关闭或显卡被屏蔽）、
// offscreen-canvas、audio-worklet、worker
if (!ok) showTextOnly(missing);
```

`SsePlayer.create` 一开始也做这个检查，缺东西时抛出带 `missing` 的 Error（`kind` 为 `unsupported`，见“出错与缓冲”）。站点应提示并保留文本阅读。

## 用法

```js
import { SsePlayer } from "https://<发布物所在位置>/player.js";

const player = await SsePlayer.create({
  canvas,                                   // 画布，按渲染尺寸 width × height
  js: "https://<发布物所在位置>/",          // 这个目录（Worker 与 AudioWorklet 的脚本）
  pkg: "pkg/",                              // 相对于 js 的 wasm 目录
  // core: "https://<站点>/live2dcubismcore.min.js",  // 可选：站点自己托管的 Cubism Core；不给则用 Live2D 的官方地址
  sources: {
    library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/",
    inapp: "https://assets.pjsk.moe/sekai-extra-assets/inapp/jp-7.0.0/",
  },
  selector: "event:219/1",
  width: 1920, height: 1080,
  playerName: "「世界」的居民",              // 替换剧本里的玩家名（可选）
  auto: true,                               // AUTO 或手动模式（可选，默认 AUTO）
  onProgress: ({ sim, render, kit }) => {}, // 加载进度（可选）；kit 是 UI 套件的派生，已缓存时没有
});
// create 在这一话需要的文件全部载入后才返回（ADR-0031：先载完再播）

startButton.onclick = () => player.play();  // 浏览器要求音频由用户操作启动
canvas.onclick = (e) => {                   // 点击：推进对话、选择选项等
  const r = canvas.getBoundingClientRect();
  player.click((e.clientX - r.left) * 1920 / r.width, (e.clientY - r.top) * 1080 / r.height);
};
player.addEventListener("node", (e) => highlight(e.detail.node));
```

剧集与区服：

- `selector` 与导出的写法相同，五类剧情都能播：活动 `event:<活动>/<话>`、主线 `unit:<章节的 assetbundleName>/<话>`（如 `unit:idol-story-chapter/1`）、卡面 `card:<卡>/first` 与 `card:<卡>/second`、特别 `special:<id>/<话>`、区域对话 `area:<区域>/<actionSet>`。剧情库的 `ripper.lock.json` 里有全部剧集的列表（`episodes`）。
- 区服由 `sources.library` 决定：`…/sekai-story/ripper/<jp|cn|tw|kr|en>/`。界面贴图和字体来自 `sources.inapp`，目前只有日服（`jp-7.0.0`）和国服（`cn-6.4.0`）两份客户端解包；繁中、韩、英三个区服的剧情库可以配国服的解包播放，文字能正常显示，但界面和字体是国服客户端的，与这三个区服的游戏不一定相同。

字体：

- 默认用客户端解包里的两个字体（正文一个、名字一个），由 UI 套件带出来。
- `SsePlayer.create` 的 `fonts` 可以换成页面自己的字体：

  ```js
  fonts: {
    body: [{ url: "…/MPLUS1[wght].ttf", weight: 460 }, { url: "…/SourceHanSansJP-Medium.otf" }],
    name: [{ url: "…/MPLUS1[wght].ttf", weight: 820 }, { url: "…/SourceHanSansJP-Heavy.otf" }],
  }
  ```

  每一项是一个列表：第一个是主字体，后面的只用来补它缺的字（按字符逐个查，哪个字体先有就用哪个）。`weight` 给可变字体定字重；给了 `weight` 而文件没有字重轴会报错。文件要是 TTF 或 OTF（不支持 WOFF），跨源时主机要放行。
- `body` 和 `name` 都给了的时候，UI 套件派生时**不读也不下载客户端的字体文件**（套件另存一份，目录名以 `-nofonts` 结尾）。只给其中一个时，另一个仍用客户端的。
- 换了字体就不是游戏的原样：字形不同；拉丁字母和数字的宽度不同时，个别句子的换行位置也会变。全角字符的宽度各家相同，纯日文、中文的换行不变。原生的导出不受影响，仍用客户端的字体。

资源地址：`assets.pjsk.moe` 只对 `https://pjsk.moe` 放行跨域，其他来源（例如本地开发）要经代理，用 `sources.proxy` 指定，见 `dev/serve.py`。

## 接口

| 成员 | 说明 |
|---|---|
| `SsePlayer.supported()` | 静态方法：`{ok, missing}`，见“浏览器要求” |
| `play()` / `pause()` | 播放、暂停 |
| `setAuto(bool)` | AUTO 与手动模式，随时可切换 |
| `click(x, y)` | 在画布坐标（渲染尺寸的像素）处点击：点中选项按钮即作答，其余是对话、地点字幕、等待的点击；不带坐标时就是点击 |
| `nodes` | 播放的全部节点，按顺序：点击会作用到的指令——对话、字幕（telop）、全屏文字、选项。每个是 `{kind, snippet, …}`：`kind` 为 `talk`（带 `speaker`、`body`）、`telop` 或 `text`（带 `body`）、`choices`（带 `options`）；`snippet` 是这条指令在剧本 `Snippets` 里的位置，站点用它对到自己的文本行 |
| `unsupported` | 这一话里网页端不播放的内容：`{reason, name?}`，`reason` 为 `movie`（影片：黑底加名称，声音照常）、`music_video`（3D MV）、`input_name`、`selectable`、`unknown_effect_type`、`unknown_action`。站点可在开播前提示 |
| `node` | 当前所在的节点序号（从 0 起；播完最后一个后等于 `nodes.length`） |
| `seek(k)` / `next()` / `previous()` | 跳到第 k 个节点、下一个、上一个的开头：画面与从头 AUTO 播放到那里时相同 |
| `setVolume(v)` | 总音量 0–1 |
| `position` | 播放位置：`node`、`nodes`（总数）、`shown`（显示的帧）、`waitsForClick`、`waitsForAnswer`、`stalled`、`seeking`、`ended` 等 |
| `error` | 出错时的信息 |
| `destroy()` | 结束播放器并释放它占用的一切：两个 Worker（连同这一话的文件和 GPU 资源）、音频、逐帧回调。离开页面或换一话时调用 |

事件（`CustomEvent`）：

| 事件 | 时机 |
|---|---|
| `node` | 进入另一个节点（`detail.node`），包括跳转 |
| `answer` | 出现选项，等用户在画面上选择 |
| `stall` / `resume` | 等文件或帧而暂停（`detail.reason`），以及恢复 |
| `ended` | 显示了最后一帧 |
| `error` | 出错停止，不会再恢复（`detail.message`、`detail.kind`、`detail.url`） |

## 出错与缓冲

`create` 失败时抛出的 Error 和 `error` 事件的 `detail` 都带 `kind`，站点按它决定提示什么：

| `kind` | 含义 | 建议的提示 |
|---|---|---|
| `unsupported` | 浏览器缺少必需的能力，`missing` 列出缺什么 | 说明不支持，保留文本阅读；不提供重试 |
| `not-found` | library 里没有这一话 | 说明没有这一话；不提供重试 |
| `network` | 某个文件取不到，`url` 是它的地址 | 提示检查网络，提供重试 |
| `internal` | 其他错误 | 显示 `message`，提供重试 |

- 每个文件最多取 4 次；连续 30 秒没有收到数据算一次失败（服务器接了请求却不再发数据时不会一直等下去）。服务器明确没有的文件（404）不重试。
- 出错后播放器不再工作。重试就是 `destroy()` 之后用**新的画布**再 `create` 一次：画布的绘制权交给 Worker 后收不回来，`create` 失败时也一样。
- 缓冲：`stall` 到 `resume` 之间声音和画面都停住。首次画到某个模型时会停一两帧，所以建议停顿超过约 0.4 秒再显示缓冲提示；跳转（`seek`）期间也会收到这对事件。
- 开发页 `dev/player.html` 按上面的方式实现了提示，可以照着写。

## 行为

- 节奏、点击、选项、片尾都按游戏处理，与导出视频同源。行为上唯一的差别是选项：导出 1.5 秒后自动选第一个，网页等用户选。画面上背景用资源站的 WebP（有损），与导出的 PNG 不逐像素相同。
- 一个页面同时只放一个播放器：两个 Worker 各持有这一话的文件（长的一话合计约 240 MB），桌面 Chrome 上 1080p 播放最重的一话时，页面进程约占 540 MB，另有 GPU 进程约 510 MB。离开或换一话时要 `destroy()`。
- 浏览器里留下的缓存：Cache API 的 `sse-ui-kit-v1`（派生好的 UI 套件，每个客户端版本约 8 MB）。
- 用户把标签页切到后台时，声音和模拟照常进行（时钟在音频线程），画面在回到前台时追上。

## 许可

见同目录的 `LICENSE`（AGPL-3.0-or-later）与 `LICENSE-EXCEPTION`。对外发布的 wasm 标注什么许可尚未决定（ADR-0032）。
