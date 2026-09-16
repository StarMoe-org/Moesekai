# Moly 对话与互动：接入、构建与验收

## 功能边界

正式入口为 `/mysekai/interactions/`，沿用网站 locale 路由（例如 `/zh-cn/mysekai/interactions/`）。家具目录、家具详情、侧栏和命令导航均可进入。普通家具数据库只读取目录与静态头像，不下载 Moly WASM 或 GLB。进入互动功能后自动准备必要资源；用户点击宿主的播放/预览按钮时，同步激活同源 iframe 中已经准备好的场景，保留这一次真实用户手势供音频使用，不需要再点击 iframe 内按钮。

React 管理检索、详情、选择、URL 与宿主 UI。iframe 内的原 Rust runtime 仍是对话、角色动作、家具控制器、音频、临时布景和恢复的唯一执行方。`available` 来自 runtime 导出的目录投影，宿主不重写角色/家具准入规则；实际播放再次通过 runtime 的动态准入。

区服和快照属于内容身份，不属于界面语言。家具链接保留 `region`，互动链接保留 `region`、`snapshot`、`content` 和筛选条件。未部署、来源不一致、旧快照或不存在的内容应显示明确状态，不能用另一个区服的同号 ID 代替。

目录固定每页 24 项，`page` 写入 URL 与浏览历史；切页替换当前项，不无限追加。普通选中内容通过可见卡片锚点累计补偿异步详情布局变化，不主动滚动到播放器。网页沉浸与浏览器全屏只改变同一个 stage 的呈现，不 portal、不移动或重新挂载 iframe，保留运行世界与音频。

参与者组件同时展示所有角色纯头部大头照与家具真实贴图。头像只接受 `moly-root-chara-head-v1`，由 moly-root chara viewer 的真实材质、面部与 stencil 渲染链生成；按 Head 骨骼后代筛选网格三角形，512×512 RGBA 透明背景，不通过裁切半身图片代替。发布时校验角色模型、rig、区域和版本来源，宿主只读取静态 manifest 与 PNG。

家具 `preview` 只播放独立真源 tweet 的头顶气泡，`play/engage` 进入完整正式对话；缺少 tweet 时显示 unavailable，不能从正文截取或改写。CN 与 JP 对白各自使用对应快照。例如 CN 6.0.0 的冰箱首句保留来源中的“望月同学”，不按记忆替换。

玩家 JSON 导入与 Haruki 读取只传给当前独立 runtime。MYSEKAI 与 suite 授权分别处理，拒绝后不会悄悄改用另一份数据；32 MiB 输入上限、请求取消与来源区服检查在宿主执行。预览、临时探索和恢复由原 Rust runtime 执行，不能覆盖用户本地存档。

## 资源与发布目录

应用镜像不包含游戏资源。Go 使用可选的 `MOLY_ROOT` 只读挂载：

```text
/moly-root/
  manifest.json                         # 可原子替换的发布发现描述
  cache-worker.mjs                      # 窄作用域可选缓存 worker
  releases/<release-id>/
    embed.mjs / stage.html / ...
    pkg/webgpu/moly-app.js
    pkg/webgpu/moly-app_bg.wasm
    pkg/webgpu/moly-app_bg.wasm.br / .gz
    pkg/webgl2/moly-app.js
    pkg/webgl2/moly-app_bg.wasm
    pkg/webgl2/moly-app_bg.wasm.br / .gz
    integrity.json
  snapshots/<snapshot-id>/
    catalog/index.json
    catalog/entries/*.json
    provenance.json
    assets/                             # 此快照的只读原始/派生资源挂载
```

浏览器只访问同源 `/moly/...`，由 Go 单入口直接提供；不依赖 Next 公共目录存放 WASM。Next 的 `/moly` rewrite 用于直接访问开发服务器时转发到 Go；正常部署由 Go 优先处理，不绕回 Next。

生产运行示意（将路径和镜像名替换成自己的构建产物）：

```sh
docker run --rm -p 8080:8080 \
  -e MOLY_ROOT=/moly-root \
  -v /srv/moly-publication:/moly-root:ro \
  moesekai:local
```

资源目录可预先复制进 snapshot 的 assets 目录，或再用单独只读 bind mount 挂到该目录。运行账户必须具有读取和目录遍历权限。不要挂载整个工作目录作为生产公开资源根，也不要把凭据或源工程放进 assets。未提供 `MOLY_ROOT` 时，普通网站/API 继续运行，互动入口显示资源未部署。

`MOLY_DEVELOPMENT=1` 仅供本地测试：允许开发资源 junction，资源 HTTP 响应为 `no-cache`，可变源文件不会进入持久资源缓存。不得用此模式宣称生产的 immutable 快照验证通过。

## 从 Moly 工程发布

先保持同一次构建的源文件稳定，再构建双后端：

```sh
node web/build-wasm.mjs
node web/split-gimmicks.mjs --assets /private/runtime-cn
node web/split-gimmicks.mjs --assets /private/runtime-jp
```

双后端分别有 `build.json`：记录实际编译源指纹、wasm-bindgen 版本和 JS/WASM hash。发布器拒绝过期后端和更改过的二进制，不以 Git HEAD 代替 dirty-tree 内容。构建过程中修改 Rust/相关资源会使最终指纹核对失败，需要重建。

控制器分包工具直接保留每个源包的 JSON 数值字面量，不经 JavaScript Number 重新序列化 64 位源 ID。它增加 `fixture-gimmick/browser-index.json` 与 `by-package/<sha256>.json`，不修改原 `gimmicks.json`。stage 仅按已放置的真实家具请求所需控制器；控制器编译、事件与恢复仍归原 runtime。请在资源进入只读生产挂载前完成此步骤。

接着用真实 runtime 的 `library_catalog()` 导出每个区服的独立模式目录。不要手工把 CN 目录改写成 JP。导出必须等 `ready=true`，保留真实缺失/不可用项。浏览器驱动属于 Moly 的 QA 工程，目前实测脚本和证据位置见下面的实施记录。

发布配置示例（JSON 文件放在源工程外）：

```json
{
  "workspace": "/src/moly",
  "output": "/srv/moly-publication",
  "developmentLinks": false,
  "sources": [
    {
      "region": "cn",
      "assets": "/private/runtime-cn",
      "catalog": "/private/exports/catalog-cn.json",
      "portraits": "/private/exports/heads-cn"
    },
    {
      "region": "jp",
      "assets": "/private/runtime-jp",
      "catalog": "/private/exports/catalog-jp.json",
      "portraits": "/private/exports/heads-jp"
    }
  ]
}
```

```sh
node web/release-artifact.mjs --config /private/publication.json
```

发布器生成独立目录索引/详情、双后端 release、压缩 sidecar 和原子 manifest；`developmentLinks=false` 时不会复制大体积游戏资源，操作者需完成只读 assets 挂载。它只移除 WASM 调试名称/调试段，并核对标准模块仍可编译且 import/export ABI 不变。

浏览器构建使用 `wasm-size` profile（`opt-level=s`、fat LTO、单 codegen unit），双后端共享源指纹。显式 Bevy feature 集移除未使用的 gizmos 与 picking 组；音频、UI、Sprite、glTF 与 animation 保留，post-process/AA 也保留，未将有兼容性问题的 wasm-opt 实验产物接入发布。Go 按 `Accept-Encoding` 的 quality 协商 Brotli、gzip、identity，尊重显式 `q=0`，所有可用表示均被禁止时返回 406。表示拥有独立 ETag，并支持正确的 HEAD、304 和 Range 长度。manifest 保留 `downloadBytes`、`decodedBytes`、`brotliBytes`、`gzipBytes`，读取 manifest 时核对实际文件长度；Brotli 发布的 `downloadBytes` 必须等于 `brotliBytes`。浏览器缓存统计使用解码字节，不能与 Brotli 网络流量直接比较。

快照 ID 包含目录、家具 master、控制器索引及来源描述的摘要，**不是每个游戏二进制的全量 Merkle 校验**。生产必须保持 assets 内容不可变；资源变化应生成新快照，而不是覆盖原 ID 下的文件。

## 缓存与数据隔离

`GET /moly/cache-worker.mjs` 返回 JavaScript 与 `Service-Worker-Allowed: /moly/`。worker 只控制 `/moly/`，缓存只面向版本化 release/snapshot 资源。互动入口在 iframe 开始请求前自动开启保留，并下载 `browser-base.json` 中的必要资源；预算为 512 MiB，单项最多 128 MiB，排队写入有上限。存储被浏览器拒绝时仍允许在线播放。

删除只位于 `/mysekai/interactions/resources/` 资源管理页；离开互动页时先让 runtime 恢复并关闭世界，再清理。清理只删除 `moly-resource-v1-*`，不删除站点设置、用户账户、已有布局或其他 CacheStorage。必要资源重新加载会重新填充对应快照的基础包。缓存统计为实际保留的解码字节，并非网络传输字节。

互动页、资源页、返回及重新加载链接保留 `region` 和 `snapshot`，因此中文界面浏览 JP 后不会在重新加载时隐式换成 CN。过期快照依旧显示来源失效，交由用户显式切换到当前快照。

离线保证针对已完整准备且未被驱逐的必要包和已访问对话资源，不包括整个游戏资源库、全站导航或 Haruki 网络请求。离线验收应使用新浏览器 profile，等待缓存完成后断网，逐项 fetch 必要资源并实际播放已准备的对话；随后联网去资源管理页清理至零字节、重新加载并复测。浏览器仍可能回收站点存储。

## 验证与交付记录

宿主校验命令：

```sh
go test ./...
cd web
bunx tsc --noEmit
bun run lint
bun run lint:i18n
bun run lint:i18n-usage
bun run build:next
```

实际浏览器验收必须包含：未进入时零引擎下载；宽/窄屏与明暗主题；严格区服上下文；原始对白、无对白动作和气泡；双渲染后端；停止/替换/自然结束/关闭后的恢复；资源缓存保留/清理；缺失资源与错误状态。出现 pageerror、协议错误或缺失资产时不能只凭脚本进程 exit 0 宣称完成。

Windows 同时运行多个 QA 服务时设置 `MOE_NEXT_DIST_DIR=.next-r5-closeout` 创建独立产物，避免覆盖运行中的 standalone。`.next-*` 不提交，也不被 ESLint、TypeScript 源检查或 Tailwind 的自动源扫描使用。默认生产构建仍使用 `.next`。

本机当前交付记录在 Moly 工程：
- `pm/2026-09-16-r5-closeout.md`：本轮最终完成范围、发布身份、测试矩阵与真实限制；旧轮次 todo/integration 只作为历史记录。
- 工程外 `_work/round5/`：双后端真实播放、参与者、分页/历史、滚动/全屏、临时导入、62 张大头照与 WASM 尺寸证据。
- 工程外 `_work/round5-closeout/`：最终离线缓存矩阵、最新源码 production build、Go/TS/ESLint/i18n 日志与收口证据。

### 2026-09-16 收口验证

最新宿主源码通过独立 Next production build（80 路由）、TypeScript、Go `./...`、ESLint、i18n 与 i18n usage。i18n 为 5 locales / 3,848 keys，插值结构一致。ESLint 没有错误；manga 页面与 SettingsPanel 的 4 条既有导航警告保留，本功能没有新增 lint 警告。产物 `.next-r5-closeout-final` 由 QA 端口 3052 提供，8082 的最新 Go 后端代理到它；8080、8081 与旧 3050 服务不受影响。

最终发布为 `stage-85a6f76ccc10d0ffe25b`，来源快照为 CN `cn-6.0.0-a374d605e52c088f202c`、JP `jp-6.8.1-6749fb58d4973887bd93`。发布根仍为 `_work/round5/publication`，新增 immutable release/snapshot 后原子更新 manifest。以下为该发布的字节数，raw 指发布器剥离调试名称前的 WASM，decoded 指实际发布后浏览器解码得到的 WASM：

| 后端 | raw | decoded | gzip | Brotli |
| --- | ---: | ---: | ---: | ---: |
| WebGPU | 52,712,781 | 41,306,822 | 11,884,955 | 8,928,672 |
| WebGL2 | 52,509,170 | 41,226,927 | 11,863,137 | 8,933,047 |

CN 与 JP 在各自新浏览器 profile 下均通过自动缓存 → 断网逐资源 SHA-256 校验 → 在线完整准备对话 → 新 runtime 离线播放至自然结束 → 清理到零 → 重新加载 → 再次断网校验。CN 离线覆盖 2 行、JP 覆盖 1 行；禁用保留后的网络读取保持缓存零字节。两轮均没有 HTTP 失败，用户 localStorage 和无关缓存保持原样：

| 来源 | 必要资源数 | 解码资源字节 | 离线新 runtime 对话 |
| --- | ---: | ---: | --- |
| CN 6.0.0 | 285 | 128,194,624 | `talk:fixture:1374` |
| JP 6.8.1 | 301 | 147,752,009 | `talk:general:3912` |

最终证据为 `_work/round5-closeout/qa-final/cache-cn.json`、`cache-jp.json`，均为 `passed: true`。资源管理往返继续保留 region/snapshot，包含中文 UI 浏览 JP 的情况。最终真实 HTTP 双后端 Brotli/gzip/identity、HEAD、206 Range、304 重验证见 `serving-final.log`，长度与上述 manifest 一致；全部编码禁用返回 406 的宿主协议检查见 `host/http-encoding.json`。

最终发布的宿主浏览器回归另确认：CN 桌面/移动端深色模式外层预览与完整播放、JP 桌面完整对话、`talk:fixture:5502` 的双头像与家具、家具 157 入口精确链接且零 WASM/GLB 下载、24 项分页前进后退、选择时 scroll delta 为 0、网页及浏览器全屏保持 iframe realm。总览为 `_work/round5-closeout/qa-final/host-summary.json`，9 张最终截图经过人工检查，已发布的 CN/JP 共 62 张 PNG SHA-256 与生产化 head exporter 输出逐张一致。移动端点击详情按钮后使用已有“返回舞台”控件检查实际对话画面，见 `qa-final/cn-mobile-stage-playing.png` 与 `qa-final/cn-mobile-stage-viewport.png`。早期宿主矩阵保留在 `qa/host-production-summary.json` 供问题追溯。

一轮 JP 并行测试在引擎初始化阶段超过脚本默认 30 秒，保留失败日志；在原超时配置不变的情况下单独重跑通过，未通过提高 timeout 掩盖。CN → JP 切换实际播放与恢复确认、未发布区服明确拒绝、减少动态/透明度/提高对比度下无页面溢出也通过，见 `qa/host-sources.json`。

最终发布的 WebGL2 CN 与 JP 移动端回归分别见 `qa-final/final-cn-webgl2.json`、`final-jp-webgl2-mobile.json`，均为 `failed: false`；逐行核对源 speaker/text、可见 transcript、自然结束与严格场景恢复，并确认只有一个 running 音频上下文且输出非零 PCM。WebGPU、宿主外层按钮、双区服、分页、全屏、参与者与 62 张真源纯头部头像也已完成本轮回归。临时玩家导入 `import-final.log` 为 `passed: true`，rank 100、1 site、1 fixture，探索 fixture 157 后恢复且 localStorage 未改。Rust 为 631 个常规测试与 6 个带真实资源补跑的测试通过，共 637 个。

本轮交付完成上述已列明的功能与回归范围；没有穷尽每一条目录对白，也不承诺全站或整个游戏资源库离线可用。移动端保留原作 canvas 对话框时文字较小，可使用全屏阅读。原生客户端交互本轮未实测；浏览器存储仍可能被系统回收。
