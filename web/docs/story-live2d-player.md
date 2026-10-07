# 剧情阅读页的 Live2D 播放

活动剧情的阅读页（`/story/event/<活动>/<话>/`）可以在浏览器里实时播放这一话的 Live2D 演出。播放器是 SekaiStoryExporter 编译成 WebAssembly 的发布物（sse-web），本仓库不包含它，只有加载它的组件。

## 开关

默认关闭。同时设置下面两个变量后才显示入口（Next.js 在构建时写入 `NEXT_PUBLIC_*`，Docker 用 `--build-arg` 传）：

| 变量 | 含义 |
|---|---|
| `NEXT_PUBLIC_SSE_WEB_BASE` | 发布物所在的目录，以 `/` 结尾，里面是 `player.js`、各 Worker 脚本和 `pkg/` |
| `NEXT_PUBLIC_SSE_WEB_CORE_URL` | 站点自己托管的 `live2dcubismcore.min.js`（Cubism SDK for Web 5-r.5）。发布物不含 Cubism Core |

可选：`NEXT_PUBLIC_SSE_WEB_LIBRARY`、`NEXT_PUBLIC_SSE_WEB_INAPP` 改剧情库和客户端解包的地址（默认是 `assets.pjsk.moe` 上的日服数据）；`NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` 只用于本地开发。地址必须是规范的 https（本机回环地址可以用 http），写错会让构建失败。

播放器要从自己的目录启动 Worker，而 Worker 脚本必须与页面同源，所以 `next.config.ts` 把发布物目录映射到本站的 `/sse-web/`，浏览器只访问这个路径。Cubism Core 由 Worker 用 `importScripts` 加载，可以跨源。

## 行为

- 只在资源服务器选日服时显示：剧情库目前只有日服，画面里的文字是日服原文。
- 点「加载并播放」之前不下载任何东西。之后先下载这一话的全部资源（长的一话两百多 MB）再开始。
- 播放以「句」为单位：没有进度条，位置显示为第几句；可以上一句、下一句，或点文本列表里的某一句跳过去。播放时列表高亮当前这一句并跟着滚动（可关）。
- AUTO 与手动两种模式；手动模式下点画面推进。选项要在画面上点。
- 浏览器不支持（需要 WebGPU 等）、剧情库里没有这一话、网络出错时各有提示，文本阅读不受影响。
- 与原有的「自动播放」（只播语音）互斥：打开 Live2D 播放时自动播放停止并隐藏。

## 代码

| 文件 | 内容 |
|---|---|
| `src/lib/sseWeb/config.ts` | 读取并校验上面的变量 |
| `src/lib/sseWeb/player.ts` | 播放器接口的类型声明，运行时加载 `player.js` |
| `src/components/story/Live2DStoryPlayer.tsx` | 播放器组件 |
| `src/components/story/StoryReader.tsx` | `live2dSelector` 属性：传入剧集（如 `event:219/1`）就提供 Live2D 播放 |

其他类型的剧情（主线、卡牌等）剧情库里也有，接入时给对应页面的 `StoryReader` 传 `live2dSelector` 即可。

## 本地联调

在 SekaiStoryExporter 仓库里：`crates/sse-web/dist.sh` 生成发布物，拷到 `target/web-dev/dist/`，`python3 crates/sse-web/dev/serve.py` 提供发布物、Cubism Core 和资源中转。然后在 `web/.env.local` 里：

```
NEXT_PUBLIC_SSE_WEB_BASE=http://127.0.0.1:8787/dist/
NEXT_PUBLIC_SSE_WEB_CORE_URL=http://127.0.0.1:8787/core/live2dcubismcore.min.js
NEXT_PUBLIC_SSE_WEB_ASSET_PROXY=http://127.0.0.1:8787/remote/
```

`bun run --cwd web test:sse-web-config` 检查变量的校验规则。
