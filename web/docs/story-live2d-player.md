# 剧情阅读页的 Live2D 播放

剧情阅读页可以在浏览器里实时播放这一话的 Live2D 演出：活动、主线、卡面、特别剧情和区域对话五类都有，五个资源服务器（日、国、繁中、韩、英）各读自己的剧情库。播放器是 SekaiStoryExporter 编译成 WebAssembly 的发布物（sse-web）。发布物原样放在本仓库的 `web/vendor/sse-web/`，站点另有加载它的组件。

## 发布物

`web/vendor/sse-web/` 是 SekaiStoryExporter 的 `crates/sse-web/dist.sh` 的输出，没有改动：`player.js`、各 Worker 脚本、`pkg/` 里的 wasm、许可证（AGPL-3.0-or-later 加链接例外）和它自带的嵌入说明 `README.md`。`manifest.json` 记着它的版本、构建它的提交、工具链和其余每个文件的 SHA-256。里面没有 Cubism Core。

- `copy:wasm`（`dev` 和 `build` 都会先跑）用 `scripts/copy-sse-web.mjs` 把它拷到 `public/sse-web/<发布物名>/`，浏览器从那里加载；`public/sse-web/` 不入库。拷之前按 `manifest.json` 校验每个文件，对不上就让构建失败。
- 发布物名是版本号加全部文件哈希的摘要（如 `0.2.1-e0dff1e11b39`），写在 `src/lib/sseWeb/release.ts` 里（生成的，入库）。换了发布物目录名就变，浏览器不会把两版的文件混着用。
- 播放器要从自己的目录启动 Worker，Worker 脚本必须与页面同源、彼此按相对路径加载，所以发布物原样提供，不经过打包器。

更新发布物：在 SekaiStoryExporter 仓库里提交好改动后跑 `crates/sse-web/dist.sh`，然后

```sh
node web/scripts/sync-sse-web.mjs --from <SekaiStoryExporter>/target/web-dist/sse-web-<版本>
bun run --cwd web copy:wasm
```

`sync-sse-web.mjs` 校验那份构建，替换 `web/vendor/sse-web/` 并重写 `release.ts`，两处一起提交。工作区有未提交改动时打出来的构建（`manifest.json` 里 `dirty` 为真）记的提交不是它真正的来源，脚本会拒绝；加 `--allow-dirty` 可以拿来试，但不要提交。站点组件用到的播放器接口（`src/lib/sseWeb/player.ts`）要和发布物对得上，更新后在剧情页实际播一次。

## 设置

不需要任何设置就能用。下面的变量都是可选的（Next.js 在构建时写入 `NEXT_PUBLIC_*`，Docker 用 `--build-arg` 传）：

| 变量 | 含义 | 默认 |
|---|---|---|
| `NEXT_PUBLIC_SSE_WEB_CORE_URL` | 站点自己托管的 `live2dcubismcore.min.js`（Cubism Core for Web）。发布物不含 Cubism Core；不设时播放器从 Live2D 的官方地址加载，那个地址不带版本号，提供的是 Live2D 当前放在那里的版本 | `https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js`（写在播放器里） |
| `NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE` | 各区服剧情库的上级目录，剧情库是 `<它>/<jp\|cn\|tw\|kr\|en>/` | `https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/` |
| `NEXT_PUBLIC_SSE_WEB_INAPP_BASE` | 各份客户端解包的上级目录 | `https://assets.pjsk.moe/sekai-extra-assets/inapp/` |
| `NEXT_PUBLIC_SSE_WEB_INAPPS` | 每个区服用哪份客户端解包（界面贴图和字体取自它），写成 `区服=解包` 用逗号分隔；没列出的区服不提供 Live2D 播放 | `jp=jp-7.0.0,cn=cn-6.4.0,tw=cn-6.4.0,kr=cn-6.4.0,en=cn-6.4.0` |
| `NEXT_PUBLIC_SSE_WEB_FONT_BASE` | 另一个放开源字体的目录（见下「字体」） | 仓库里的 `public/story-fonts/` |
| `NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS` | 设为 `1` 时日服改用客户端解包里的字体（商业字体，见下「字体」） | 不设 |

`NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` 只用于本地开发。地址必须是规范的 https（本机回环地址可以用 http），写错会让构建失败。

Cubism Core 由 Worker 用 `importScripts` 加载，可以跨源。它是 Live2D Inc. 的软件，适用它自己的许可；本仓库和发布物都不包含它。

## 行为

- 读的是设置里所选资源服务器的剧情库，画面里的文字是那个服务器的原文。目前只有日服和国服的客户端解包；繁中、韩、英三个服务器的剧情库配国服的解包播放，文字能正常显示，但对话框和字体是国服客户端的，播放时页面上有一行说明。等这三个服务器的客户端解包收录后，改 `NEXT_PUBLIC_SSE_WEB_INAPPS` 即可。
- 各类剧情在剧情库里的名字：活动 `event:<活动>/<话>`，主线 `unit:<章节的 assetbundleName>/<话>`，卡面 `card:<卡>/first`、`card:<卡>/second`，特别 `special:<id>/<话>`，区域对话 `area:<区域>/<actionSet>`。角色自我介绍不在剧情库里，没有入口。剧情库里没有的一话（例如资源还没上线）点了以后提示「这一话还没有 Live2D 数据」。
- 一个页面上可以有几个入口（卡面的前后篇、特别剧情的各话），同一时间只有一个在播：开始另一个时，前一个自动关闭。
- 点「加载并播放」之前不下载任何东西。之后先下载这一话的全部资源（长的一话两百多 MB）再开始。
- 画面在一个悬浮窗里，浮在页面上方（站点顶栏之下）：拖标题栏移动，拖下方两角调整大小（画面保持 16:9），也可以用方向键。窗口不会超出页面；位置和大小记在浏览器的 `localStorage`（`story-live2d-window`）里。默认在页面右下角，窄屏上在顶栏下方、占满宽度。窗口窄时音量只留静音按钮。
- 标题栏上的「播放设置」（记在 `localStorage` 的 `story-live2d-settings`，改了立即生效）：
  - 渲染分辨率：自动（悬浮窗的显示尺寸 × 设备像素比），或固定画面高度 540p–2160p。
  - 画面比例：16:9、4:3、2:1、21:9。悬浮窗跟着变形；界面按新比例重新排布，从当前这一句的开头继续。
  - 全屏时铺满屏幕（默认开）：全屏用屏幕自己的比例；关掉则保持所选比例。屏幕竖着时不铺满，按所选比例放进去。
  - 显示性能信息：在画面左上角显示渲染尺寸、帧率、跳过的帧数、两个 Worker 的 wasm 内存。
- 播放以「节点」为单位，位置显示为第几句：节点是点击会作用到的内容——对话、字幕（telop）、全屏文字、选项。没有可拖动的时间条；可以上一个、下一个，或点文本列表里对应的那一行跳过去（这四种行都能点）。播放时列表高亮当前这一行并跟着滚动（可关），滚动时让开悬浮窗。
- 节点和列表的行靠剧本里的位置对上：播放器给每个节点带上它在剧本 `Snippets` 里的序号，`storyLoader` 给每一行记同一个序号（`snippetIndex`）。列表里没有对应行的节点不影响其他行。
- AUTO 与手动两种模式；手动模式下点画面推进。选项要在画面上点。
- 浏览器不支持（需要 WebGPU 等）、剧情库里没有这一话、网络出错时各有提示，文本阅读不受影响。
- 与原有的「自动播放」（只播语音）互斥：打开 Live2D 播放时自动播放停止并隐藏。

## 界面

按站点的 Material 3 Expressive 规范（`docs/md3-migration.md`）做，只用 `components/md3` 的原语和语义 token：

- **悬浮窗**：`surface-container-high`、`rounded-md3-xl`、三级阴影，拖动或缩放时升到四级。顶部是拖动柄（32×4 的圆角条）和标题栏；出现时用弹性动效，系统设了「减少动态效果」时只淡入。
- **工具栏**：播放控制是一个标准按钮组（`ButtonGroup`，按钮相距 12）——上一句、下一句是窄的 tonal 图标按钮，播放 / 暂停是宽的 filled 按钮，播放时由圆形渐变成方形；按下其中一个，它加宽 15%，相邻的按钮让出这段宽度。AUTO 是可切换的 tonal 按钮，静音是可切换的图标按钮。工具栏上沿是一条进度（当前是第几句），播放时是波浪形，暂停时是直线。窗口窄时音量滑条收起，其余换行，句数不截断。
- **画面上的浮层**：暂停标记用 fixed 颜色角色（`primary-fixed`，舞台在明暗两种主题下都是黑的）；缓冲用 Expressive 的变形加载指示；加载进度放在一张 `surface-container-high` 的小卡片里；性能信息用 `inverse-surface`。
- **全屏**：只有画面进入全屏，控制是画面下方的浮动工具栏（胶囊形），指针移动或暂停时出现，播放中静止 3 秒后和指针一起隐去。
- **播放设置**：对话框（28 圆角、三级阴影）；分辨率是下拉选择，菜单是 Expressive 的竖向菜单（16 圆角、内缩 4、选中项 12 圆角 `tertiary-container`）；比例用 Expressive 的连接式按钮组（间距 2，内侧圆角 8、按下 4，选中的渐变成全圆角）；两个开关。

## 字体

日服客户端的字体是商业字体（Fontworks 的 Rodin），站点不应该把它的文件发给访客。所以日服的剧情默认用开源字体画：

- 正文和名字用 **M PLUS 1**（可变字重，正文 460、名字 820，是与客户端两个字体实测笔画粗细相同的值），M PLUS 1 缺的字用**思源黑体 JP** 补（正文补 Medium，名字补 Heavy）。
- 播放器这时不读也不下载客户端的字体文件。
- 其他区服不变：它们用的国服解包里本来就是思源黑体。
- 播放时页面上有一行说明：字体不是游戏内的，字形和个别句子的换行略有不同（全角字符宽度相同，差别来自拉丁字母和数字的宽度）。

三个字体文件放在仓库的 `web/public/story-fonts/`，是上游的原文件、用上游的文件名，许可文本（都是 SIL OFL 1.1）在旁边，`SOURCE.json` 记着各自的来源提交和 SHA-256（`test:sse-web-config` 会核对）：

| 文件 | 来源 |
|---|---|
| `MPLUS1[wght].ttf` | Google Fonts 仓库 `google/fonts` 的 `ofl/mplus1/` |
| `SourceHanSansJP-Medium.otf` | Adobe 仓库 `adobe-fonts/source-han-sans` 的 `SubsetOTF/JP/` |
| `SourceHanSansJP-Heavy.otf` | 同上 |

用哪套字体按下面的顺序定：

1. 设了 `NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS=1`：用客户端解包里的字体（从资源站下载）。
2. 设了 `NEXT_PUBLIC_SSE_WEB_FONT_BASE`：用那个目录里的三个开源字体（文件名同上，许可文本放在旁边）。
3. 否则用仓库里的开源字体。构建时 `next.config.ts` 检查 `public/story-fonts/` 里三个文件是否齐全，缺了才退回客户端的字体。

字体由播放器的 Worker 用 `fetch` 取，跨源时那台主机要放行本站。字重和文件名写在 `src/lib/sseWeb/config.ts` 里。

## 代码

| 文件 | 内容 |
|---|---|
| `src/lib/sseWeb/config.ts` | 读取并校验上面的变量 |
| `src/lib/sseWeb/player.ts` | 播放器接口的类型声明，运行时加载 `player.js` |
| `src/components/story/Live2DStoryPlayer.tsx` | 播放器组件 |
| `src/lib/sseWeb/settings.ts` | 播放设置：读写与渲染尺寸的计算 |
| `src/components/story/Live2DPlayerSettings.tsx` | 播放设置的对话框 |
| `src/components/story/StoryReader.tsx` | `live2dSelector` 属性：传入剧集（如 `event:219/1`）就提供 Live2D 播放；区服取自设置里的资源服务器 |
| `src/app/story/{event,unit,card,special,area}/…/client.tsx` | 各类剧情页拼出自己的 `live2dSelector` |

再接入新的剧情页时，给它的 `StoryReader` 传 `live2dSelector` 即可。

## 本地联调

剧情库所在的主机只允许 `https://pjsk.moe` 跨源读取，本地开发要经过一个中转。在 SekaiStoryExporter 仓库里跑 `python3 crates/sse-web/dev/serve.py`，然后在 `web/.env.local` 里：

```
NEXT_PUBLIC_SSE_WEB_ASSET_PROXY=http://127.0.0.1:8787/remote/
```

要试还没提交的播放器改动，用上面「发布物」一节的 `sync-sse-web.mjs --allow-dirty`。

`bun run --cwd web test:sse-web-config` 检查变量的校验规则。
