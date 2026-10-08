# 剧情阅读页的 Live2D 播放

剧情阅读页可以在浏览器里实时播放这一话的 Live2D 演出：活动、主线、卡面、特别剧情和区域对话五类都有，五个资源服务器（日、国、繁中、韩、英）各读自己的剧情库。播放器是 SekaiStoryExporter 编译成 WebAssembly 的发布物（sse-web），本仓库不包含它，只有加载它的组件。

## 开关

默认关闭。同时设置下面两个变量后才显示入口（Next.js 在构建时写入 `NEXT_PUBLIC_*`，Docker 用 `--build-arg` 传）：

| 变量 | 含义 |
|---|---|
| `NEXT_PUBLIC_SSE_WEB_BASE` | 发布物所在的目录，以 `/` 结尾，里面是 `player.js`、各 Worker 脚本和 `pkg/` |
| `NEXT_PUBLIC_SSE_WEB_CORE_URL` | 站点自己托管的 `live2dcubismcore.min.js`（Cubism SDK for Web 5-r.5）。发布物不含 Cubism Core |

可选（都有默认值，指向 `assets.pjsk.moe` 上已发布的数据）：

| 变量 | 含义 | 默认 |
|---|---|---|
| `NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE` | 各区服剧情库的上级目录，剧情库是 `<它>/<jp\|cn\|tw\|kr\|en>/` | `https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/` |
| `NEXT_PUBLIC_SSE_WEB_INAPP_BASE` | 各份客户端解包的上级目录 | `https://assets.pjsk.moe/sekai-extra-assets/inapp/` |
| `NEXT_PUBLIC_SSE_WEB_INAPPS` | 每个区服用哪份客户端解包（界面贴图和字体取自它），写成 `区服=解包` 用逗号分隔；没列出的区服不提供 Live2D 播放 | `jp=jp-7.0.0,cn=cn-6.4.0,tw=cn-6.4.0,kr=cn-6.4.0,en=cn-6.4.0` |

| `NEXT_PUBLIC_SSE_WEB_FONT_BASE` | 放开源字体的目录（见下「字体」）；不设则用客户端解包里的字体 | 不设 |

`NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` 只用于本地开发。地址必须是规范的 https（本机回环地址可以用 http），写错会让构建失败。

播放器要从自己的目录启动 Worker，而 Worker 脚本必须与页面同源，所以 `next.config.ts` 把发布物目录映射到本站的 `/sse-web/`，浏览器只访问这个路径。Cubism Core 由 Worker 用 `importScripts` 加载，可以跨源。

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
- 播放以「句」为单位：没有进度条，位置显示为第几句；可以上一句、下一句，或点文本列表里的某一句跳过去。播放时列表高亮当前这一句并跟着滚动（可关），滚动时让开悬浮窗。
- AUTO 与手动两种模式；手动模式下点画面推进。选项要在画面上点。
- 浏览器不支持（需要 WebGPU 等）、剧情库里没有这一话、网络出错时各有提示，文本阅读不受影响。
- 与原有的「自动播放」（只播语音）互斥：打开 Live2D 播放时自动播放停止并隐藏。

## 字体

日服客户端的字体是商业字体（Fontworks 的 Rodin），站点不应该把它的文件发给访客。设了 `NEXT_PUBLIC_SSE_WEB_FONT_BASE` 以后：

- 日服的剧情改用开源字体：正文和名字用 **M PLUS 1**（可变字重，正文 460、名字 820，是与客户端两个字体实测笔画粗细相同的值），M PLUS 1 缺的字用**思源黑体 JP** 补（正文补 Medium，名字补 Heavy）。
- 播放器这时不读也不下载客户端的字体文件。
- 其他区服不变：它们用的国服解包里本来就是思源黑体。
- 播放时页面上有一行说明：字体不是游戏内的，字形和个别句子的换行略有不同（全角字符宽度相同，差别来自拉丁字母和数字的宽度）。

目录里要放这三个文件，用上游的文件名，并把各自的许可文本（都是 SIL OFL 1.1）放在旁边：

| 文件 | 来源 |
|---|---|
| `MPLUS1[wght].ttf` | Google Fonts 仓库 `google/fonts` 的 `ofl/mplus1/` |
| `SourceHanSansJP-Medium.otf` | Adobe 仓库 `adobe-fonts/source-han-sans` 的 `SubsetOTF/JP/` |
| `SourceHanSansJP-Heavy.otf` | 同上 |

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

在 SekaiStoryExporter 仓库里：`crates/sse-web/dist.sh` 生成发布物，拷到 `target/web-dev/dist/`，`python3 crates/sse-web/dev/serve.py` 提供发布物、Cubism Core 和资源中转。然后在 `web/.env.local` 里：

```
NEXT_PUBLIC_SSE_WEB_BASE=http://127.0.0.1:8787/dist/
NEXT_PUBLIC_SSE_WEB_CORE_URL=http://127.0.0.1:8787/core/live2dcubismcore.min.js
NEXT_PUBLIC_SSE_WEB_ASSET_PROXY=http://127.0.0.1:8787/remote/
NEXT_PUBLIC_SSE_WEB_FONT_BASE=http://127.0.0.1:8787/fonts/
```

最后一行可选：把上面「字体」一节的三个文件放进 `target/web-dev/fonts/` 即可。

`bun run --cwd web test:sse-web-config` 检查变量的校验规则。
