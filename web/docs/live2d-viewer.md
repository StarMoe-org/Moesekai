# Live2D 预览

`/live2d`（工具分组）在浏览器里显示剧情用到的 Live2D 模型：游戏原本的动作、表情、眨眼、呼吸与物理，可以缩放、全屏，并垫一张剧情背景。地址记着服务器和模型（`?server=jp&model=v2_01ichika_casual`）；角色详情页的「查看 Live2D 模型」链接到 `?character=<id>`，页面按这个角色筛选并打开他的第一个模型。

它不属于剧情：页面、组件和数据层都不依赖剧情页和剧情播放器（`components/story`、`lib/sseWeb`）。

## 播放器

播放器是 SekaiLive2DViewer 的发布物（`viewer.js`、Worker 脚本和 wasm），它复用 SekaiStoryExporter 的 `sse-live2d`（游戏的角色运行时）与 `sse-live2d-render`（模型绘制）。和剧情播放器一样，发布物原样放在本仓库的 `web/vendor/live2d-viewer/`，由 `copy:wasm`（`scripts/copy-live2d-viewer.mjs`）拷到 `public/live2d-viewer/<发布物名>/` 给浏览器加载；`public/live2d-viewer/` 不入库。发布物名写在生成的 `src/lib/live2dViewer/release.ts` 里。

两份发布物共用 `scripts/vendored-release.mjs`：按 `manifest.json` 校验每个文件，发布物名是版本号加全部文件哈希的摘要。还没有放入发布物时 `release.ts` 是 `null`，`copy:wasm` 跳过它，页面显示「Live2D 预览暂时不可用」。

更新发布物：在 SekaiLive2DViewer 里跑 `dist.sh`，然后

```sh
node web/scripts/sync-live2d-viewer.mjs --from <SekaiLive2DViewer>/target/web-dist/sekai-live2d-viewer-<版本>
bun run --cwd web copy:wasm
```

`vendor/live2d-viewer/` 和 `release.ts` 一起提交。`manifest.json` 的 `format` 必须是 `sekai-live2d-viewer-release/1`；工作区不干净时打出的构建（`dirty`）会被拒绝，加 `--allow-dirty` 只用来试。站点用到的播放器接口声明在 `src/lib/live2dViewer/viewer.ts`，更新发布物后要和它核对，并实际打开一个模型。

## 数据

- 模型文件来自各服务器的剧情库（SekaiStoryRipper 的产物）：`<剧情库>/<区服>/library/live2d/model/<模型>/` 与 `live2d/motion/<角色>_motion_base/`。播放器按每个包的 `_ripper.json` 文件清单下载。
- 模型列表来自 SekaiLive2DViewer 的索引工具（`sekai-live2d-index`）发布的 `<索引目录>/<区服>/models.json`（格式见那个项目的 `docs/models-json.md`，页面用到的字段在 `src/types/live2d.ts`），只包含剧情库里已有的模型。服务器没有发布索引（404）时列表为空。
- 服务器默认跟随站点设置里的资源服务器，页面上可以切换。
- 模型名就是模型包名，页面从中读出角色、版本（`v2_`）、联动（`clb<NN>_`）、配角（`sub_`）和服装词（`src/lib/live2dViewer/models.ts`）。服装没有官方名称；`page.live2d.costume.*` 翻译常见的词，虚拟歌手的团体版本显示团体名，其他词按模型名原样显示。
- 剧情背景列表来自资源站的 bundle 列表接口（`/api/assets/bundles?prefix=scenario/background/`，资产浏览器用的同一个），图片是资源站的 WebP。背景由页面用 `<img>` 垫在透明的播放器画布下面，不经过播放器。

本地联调：SekaiLive2DViewer 的 `dev/serve.py` 在 8788 端口提供中转（`/remote/`），同时提供它生成的 `sekai-live2d/<区服>/models.json`，可以在 `web/.env.local` 里写：

```
NEXT_PUBLIC_LIVE2D_ASSET_PROXY=http://127.0.0.1:8788/remote/
NEXT_PUBLIC_LIVE2D_INDEX_BASE=http://127.0.0.1:8788/sekai-live2d/
```

## 设置

都可以不设（`NEXT_PUBLIC_*` 在构建时写入，Docker 用 `--build-arg`）：

| 变量 | 含义 | 默认 |
|---|---|---|
| `NEXT_PUBLIC_LIVE2D_LIBRARY_BASE` | 各区服剧情库的上级目录 | `https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/` |
| `NEXT_PUBLIC_LIVE2D_INDEX_BASE` | 各区服模型索引的上级目录 | `https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d/` |
| `NEXT_PUBLIC_LIVE2D_CORE_URL` | 站点自己托管的 Cubism Core for Web | 剧情播放器的 `NEXT_PUBLIC_SSE_WEB_CORE_URL`，都不设时用 Live2D 官方地址 |
| `NEXT_PUBLIC_LIVE2D_ASSET_PROXY` | 本地开发的中转（`<中转><主机>/…`） | `NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` |

写错时构建失败（`next.config.ts` 调用 `live2dCheckConfig()`）。剧情库主机只放行 `https://pjsk.moe` 跨源读取，本地开发要设中转。Cubism Core 是 Live2D Inc. 的软件，适用它自己的许可，本仓库和发布物都不包含它；舞台下方注明了它。

## 界面

- 舞台：模型画布在剧情背景或 `surface-container` 渐变之上；滚轮以光标为中心缩放，放大后拖动平移，双指缩放，双击复位。缩放由播放器的相机完成（`setView`），放大后不会模糊。右下角的缩放胶囊和右上角的全屏按钮用 `glass`。
- 面板（容器宽度够时在舞台右侧，否则在下方）：当前模型、按角色分组的模型列表（配角和路人排在后面）、动作、表情、循环播放、物理、呼吸、暂停、恢复默认、背景。
- 筛选抽屉：搜索、类型（角色、配角、路人）、团体与角色、只看新版模型。
- 状态：加载进度（已取到的文件数）、浏览器不支持（列出缺少的能力）、剧情库里没有文件、网络错误与重试。动作和表情第一次用到时才下载（约 1 KB），下载失败时面板上有提示，模型继续原来的动作。没有动作包的模型（`motion` 为 `null`）只有呼吸和物理。

## 代码

| 文件 | 内容 |
|---|---|
| `src/lib/live2dViewer/config.ts` | 读取并校验上面的变量 |
| `src/lib/live2dViewer/viewer.ts` | 播放器接口的类型声明，运行时加载 `viewer.js` |
| `src/lib/live2dViewer/models.ts` | 索引解析、模型名解析、排序、地址 |
| `src/lib/live2dViewer/client.ts` | 读取模型索引和剧情背景列表 |
| `src/lib/live2dViewer/view.ts` | 缩放与平移的计算 |
| `src/components/live2d/useLive2DViewer.ts` | 播放器的生命周期、状态与操作 |
| `src/components/live2d/Live2DModelStage.tsx` | 舞台、手势、浮层 |
| `src/components/live2d/Live2DModelPanel.tsx` | 控制面板 |
| `src/components/live2d/BackgroundPickerDialog.tsx` | 背景选择 |
| `src/app/live2d/` | 页面 |

`bun run --cwd web test:live2d-viewer` 检查变量校验、模型名与索引解析、地址和缩放计算。
