# Moly 对话与互动：接入、构建与验收

## 功能边界

正式入口为 `/mysekai/interactions/`，沿用网站 locale 路由（例如 `/zh-cn/mysekai/interactions/`）。家具目录、家具详情、侧栏和命令导航均可进入。普通家具数据库只读取目录与静态头像，不下载 Moly WASM 或 GLB。互动页的阅读状态同样只读取目录、所选详情与静态图片。用户点击进入场景或播放/预览后，才创建同源 iframe 并准备引擎和必要资源；宿主将激活请求交给场景，保留真实用户手势供音频使用，不需要再点击 iframe 内按钮。

React 管理检索、详情、选择、URL 与宿主 UI。iframe 内的原 Rust runtime 仍是对话、角色动作、家具控制器、音频、临时布景和恢复的唯一执行方。`available` 来自 runtime 导出的目录投影，宿主不重写角色/家具准入规则；实际播放再次通过 runtime 的动态准入。

区服和快照属于内容身份，不属于界面语言。家具链接保留 `region`，互动链接保留 `region`、`snapshot`、`content` 和筛选条件。未部署、来源不一致、旧快照或不存在的内容应显示明确状态，不能用另一个区服的同号 ID 代替。

目录固定每页 24 项，`page` 写入 URL 与浏览历史；切页替换当前项，不无限追加。普通选中内容通过可见卡片锚点累计补偿异步详情布局变化，不主动滚动到播放器。网页沉浸与浏览器全屏只改变同一个 stage 的呈现，不 portal、不移动或重新挂载 iframe，保留运行世界与音频。

参与者组件同时展示所有角色纯头部大头照与家具真实贴图。头像只接受 `moly-root-chara-head-v1`，由 moly-root chara viewer 的真实材质、面部与 stencil 渲染链生成；按 Head 骨骼后代筛选网格三角形，512×512 RGBA 透明背景，不通过裁切半身图片代替。发布时校验角色模型、rig、区域和版本来源，宿主只读取静态 manifest 与 PNG。

家具 `preview` 只播放独立真源 tweet 的头顶气泡，`play/engage` 进入完整正式对话；缺少 tweet 时显示 unavailable，不能从正文截取或改写。CN 与 JP 对白各自使用对应快照。例如 CN 6.0.0 的冰箱首句保留来源中的“望月同学”，不按记忆替换。

玩家 JSON 导入与 Haruki 读取只传给当前独立 runtime。MYSEKAI 与 suite 授权分别处理，拒绝后不会悄悄改用另一份数据；32 MiB 输入上限、请求取消与来源区服检查在宿主执行。预览、临时探索和恢复由原 Rust runtime 执行，不能覆盖用户本地存档。

## 资源与发布目录

应用镜像不包含游戏资源。生产部署将同源控制文件和游戏资源分开：Go 使用 `MOLY_ROOT` 只读挂载本地控制目录，公开的不可变资源由浏览器直连 CDN。`NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN` 是部署时指定的 HTTPS origin，例如 `https://assets.example.com`；留空时保留全量资源同源模式。

`/moly/` 是宿主、SDK、runtime 与缓存 worker 约定的固定协议路由，不是 OSS 目录的配置入口。无需新增 `BASE_PATH`：存储前缀在 ESA/CDN 中映射。例如公开请求 `/moly/snapshots/<id>/assets/...` 可回源到 OSS 的 `<自选前缀>/snapshots/<id>/assets/...`，不把 bucket、账号或真实部署域名写进源码。runtime 版本必须支持与宿主相同的可配置 origin。

| 请求 | 提供方 |
| --- | --- |
| `/moly/manifest.json`，含旧快照查找与可用性校验 | 同源 Go 控制面 |
| release 的 embed SDK、完整 iframe stage shell 及其相对导入、样式 | 同源 Go |
| `/moly/cache-worker.mjs` | 同源 Go，scope 固定为 `/moly/` |
| 目录索引、所选详情、头像与家具图片 | `NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN` |
| 引擎 JS 胶水、WASM、场景模型、贴图、音频等不可变资源 | `NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN` |

iframe 必须保持同源，宿主才能在用户点击时同步转交音频激活手势。仅设置 `MOLY_DEV_ORIGIN` 会走 Next 反向代理，不会让浏览器直连 CDN，也不能代替资源 origin 变量。Next 的 `/moly` rewrite 用于直接访问开发服务器；生产由 Go 优先处理同源 `/moly/`。

本地控制目录必须包含**完整的 release shell**，不能只复制 Go 清单校验触及的少数文件：

```text
/moly-control-plane/
  manifest.json                         # 可原子替换的发布发现描述
  cache-worker.mjs                      # 窄作用域可选缓存 worker
  releases/<release-id>/
    embed.mjs / embed-stage.mjs / embed-contract.mjs / ...
    stage.html / stage.mjs / stage.css / boot.mjs / ...
    asset-pack-client.mjs / base-resources.mjs / ...
    weather-*.mjs / stage-*.mjs / ...    # 递归保留 shell 的全部相对依赖
    pkg/webgpu/moly-app.js
    pkg/webgpu/moly-app_bg.wasm
    pkg/webgpu/moly-app_bg.wasm.br / .gz
    pkg/webgl2/moly-app.js
    pkg/webgl2/moly-app_bg.wasm
    pkg/webgl2/moly-app_bg.wasm.br / .gz
    integrity.json
  snapshots/<snapshot-id>/
    snapshot.json                       # 保留历史快照以支持固定链接
    catalog/index.json                  # Go 校验来源与快照身份
    assets/mysekai-fixtures.json         # Go 校验区域与版本
```

稳妥的 Alpha 做法是保留完整 `releases/<release-id>/`，包含 `.mjs`、`.css`、`.html`、压缩副本与完整性文件。Go 当前仍会检查本地双后端 JS/WASM 及压缩文件尺寸，所以即使浏览器从 CDN 下载它们，也要将这些校验文件留在控制目录。只含校验文件的精简清单并不构成可播放的同源 shell。资源包模式还需保留 Go 校验所需的 content-addressed catalog。

CDN/OSS 则保存完整的版本化 release、snapshot（目录、详情、图片和全部被引用的场景资源）或 content-addressed asset-store。已发布 ID 下的字节不可覆盖；`manifest.json` 的生效版本仍由同源 Go 负责，而不是直接读取 OSS 上的静态清单。

构建与运行示意（将域名、路径和镜像名替换成部署配置）：

```sh
export NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN=https://assets.example.com
docker build \
  --build-arg NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN="$NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN" \
  -t moesekai:local .

docker run --rm -p 8080:8080 \
  -e MOLY_ROOT=/moly-root \
  -v /srv/moly-control-plane:/moly-root:ro \
  moesekai:local
```

`NEXT_PUBLIC_*` 由 Next.js 在构建时内联，改变域名需要重建前端/镜像；只在 `docker run -e` 添加该变量不会更新已有客户端。直接构建 Next 时在 `bun run --cwd web build:next` 之前设置同名变量。开发 compose 会读取根目录 `.env`（参见 `.env.example`）；直接 Next 开发可用 `web/.env.local`。仓库当前没有应用镜像构建 workflow，外部 CI 必须将同名变量显式传给 Docker `build-args`，不能仅给部署容器设置环境变量。

CDN 必须允许公开资源 GET/HEAD 跨域读取，支持 packed 模式所需的 OPTIONS / `X-Moly-Required`，并暴露 `Content-Encoding`、`ETag`、`Content-Length` 和 `X-Moly-Decoded-Bytes` 或 `x-oss-meta-moly-decoded-bytes`。压缩体仍使用原始逻辑 URL，同时设置正确的 `Content-Type` / `Content-Encoding`。版本资源使用长缓存与 `immutable`；真实响应与二次命中需在上线前验证。配置私有 OSS 回源时保持 bucket 私有，ESA 仅发布此功能的资源前缀。

本地运行账户必须具有控制目录的读取和遍历权限。不要把凭据或源工程放进发布目录。未提供 `MOLY_ROOT` 时，普通网站/API 继续运行，互动入口显示资源未部署。若资源 origin 留空，必须将完整资源树也复制或只读挂载到本地；精简控制目录不支持全量同源回退。

`MOLY_DEVELOPMENT=1` 仅供本地测试：允许开发资源 junction，资源 HTTP 响应为 `no-cache`，可变源文件不会进入持久资源缓存。不得用此模式宣称生产的 immutable 快照验证通过。

## 从 Moly 工程发布

### Alpha 阶段：手动触发，版本化交付

Alpha 先采用现有脚本构建、人工验收和手动切换版本。互动页标题显示主题色 Alpha 标记，并常驻说明场景还原及部分演出仍在完善。已知表现差异按项记录，不以模拟器全量完善作为上线前提。

首次部署按上一节将同源控制目录挂载到 `/moly-root`，把完整不可变资源发布到 OSS/ESA，并在构建前设置资源 origin。资源与应用镜像分开保存；Alpha 由人工运行发布工具与切换清单，不需要先建设资源管理后台。开发 junction 不是可直接上传的生产资源目录；生产发布使用 `developmentLinks=false`，将真实源资源同步至 OSS，不启用 `MOLY_DEVELOPMENT`。

| 改动 | 更新内容 |
| --- | --- |
| 页面、样式、文案（例如 Alpha 提示） | 按网站现有流程发布 Moesekai 前端 |
| Rust / WASM 引擎 | 构建 WebGPU 与 WebGL2，发布完整 `releases/<新 ID>/`；JS 胶水、WASM、压缩副本和完整性文件属于同一次构建 |
| 资源、对白、演出分类或目录投影 | 重新导出受影响区域的目录/资源，发布新的 `snapshots/<新 ID>/`；需要新引擎时一并更新 release |

每次手动发布按以下顺序：

1. 在构建机产出并验证新版本。WASM 用 `node web/build-wasm.mjs --renderer both`；再运行本节的 `release-artifact.mjs --config ...`，不要单独覆盖正在使用的 `.wasm` 文件。
2. 先将新增 release、snapshot 及所引用资源上传至 OSS/CDN，校验内容、MIME、压缩表示与缓存头；同时准备同源完整 release shell 与 Go 校验文件。已有相同 ID 的文件保持不可变，只更新引擎时无需重传未变的游戏资源。
3. 用固定的新版本路径通过真实 CDN 验证目录、WASM 和场景资源，确认浏览器直连配置的资源域名、播放与音频正常。保留当前 `manifest.json` 作为回滚入口；缓存 worker 独立同步并验证。不要把仅通过 Go 校验的精简目录当成完整 shell 验收。
4. 最后将新 manifest 以临时文件上传，再在服务器同一文件系统原子替换 `/srv/moly-control-plane/manifest.json`。Go 在后续请求中根据文件时间/大小重新读取清单，通常无需为引擎更新重建应用镜像或重启；首次配置挂载需重启，资源 origin 变化必须重建前端。
5. 新打开或刷新的页面读取新 release；正在播放的页面继续持有原版本，不中途替换引擎。遇到回归时恢复上一份 manifest，保留其引用文件；旧目录在确认无人依赖前不清理。

发布器提供 `reuseSnapshots: true`，适用于资产契约、目录投影和基础资源需求均未改变的纯引擎更新。此模式不填写 `sources`，输出目录必须已有经过验证的完整发布；它复用快照而重新生成 release。改动家具演出分类时不能使用此捷径，必须重新导出目录。

上述是通用 Alpha 运维流程；某个版本是否已经公网发布，以该次部署记录和实际验证结果为准。后续可以自动化构建、上传和验收。

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

发布器生成独立目录索引/详情、双后端 release、压缩 sidecar 和原子 manifest；`developmentLinks=false` 时不会复制大体积游戏资源，操作者需从真实源资源完成 OSS/CDN 同步，或在全同源模式完成只读 assets 挂载。它只移除 WASM 调试名称/调试段，并核对标准模块仍可编译且 import/export ABI 不变。

浏览器构建使用 `wasm-size` profile（`opt-level=s`、thin LTO、单 codegen unit），双后端共享源指纹。显式 Bevy feature 集移除未使用的 gizmos 与 picking 组；音频、UI、Sprite、glTF 与 animation 保留，post-process/AA 也保留，未将有兼容性问题的 wasm-opt 实验产物接入发布。Go 按 `Accept-Encoding` 的 quality 协商 Brotli、gzip、identity，尊重显式 `q=0`，所有可用表示均被禁止时返回 406。表示拥有独立 ETag，并支持正确的 HEAD、304 和 Range 长度。manifest 保留 `downloadBytes`、`decodedBytes`、`brotliBytes`、`gzipBytes`，读取 manifest 时核对实际文件长度；Brotli 发布的 `downloadBytes` 必须等于 `brotliBytes`。浏览器缓存统计使用解码字节，不能与 Brotli 网络流量直接比较。

快照 ID 包含目录、家具 master、控制器索引及来源描述的摘要，**不是每个游戏二进制的全量 Merkle 校验**。生产必须保持 assets 内容不可变；资源变化应生成新快照，而不是覆盖原 ID 下的文件。

## 缓存与数据隔离

`GET /moly/cache-worker.mjs` 返回 JavaScript 与 `Service-Worker-Allowed: /moly/`。worker 只控制同源 `/moly/` 下的 runtime 页面，并按配置的资源 origin 读取不可变 release/snapshot 与 asset-store 请求；CDN 资源保留真实 CDN URL。互动入口在 iframe 开始请求前自动开启保留，并持久缓存 release 与 `browser-base.json` 声明的基础资源；预算为 512 MiB，单项最多 128 MiB，排队写入有上限。按需演出的语音、模型等资源只在 worker 内存中复用，最多 64 MiB、单项最多 32 MiB，worker 结束后不保留。对话详情 JSON 只在当前阅读页面内存中复用（最多 64 条），不进入浏览器长期缓存。旧版 worker 留下的非基础资源在新版激活时清理。存储被浏览器拒绝时仍允许在线播放。

删除只位于 `/mysekai/interactions/resources/` 资源管理页；离开互动页时先让 runtime 恢复并关闭世界，再清理。清理只删除 `moly-resource-v1-*`，不删除站点设置、用户账户、已有布局或其他 CacheStorage。必要资源重新加载会重新填充对应快照的基础包。缓存统计为实际保留的解码字节，并非网络传输字节。

互动页、资源页、返回及重新加载链接保留 `region` 和 `snapshot`，因此中文界面浏览 JP 后不会在重新加载时隐式换成 CN。过期快照依旧显示来源失效，交由用户显式切换到当前快照。

离线保证只针对已完整准备且未被驱逐的基础包；按需演出资源只保证当前 worker 存活期间的尽力复用，不能承诺跨访问离线播放。离线验收应使用新浏览器 profile，等待缓存完成后断网逐项 fetch 必要资源；随后联网去资源管理页清理至零字节、重新加载并复测。浏览器仍可能回收站点存储。

## 验证与交付记录

宿主校验命令：

```sh
go test ./...
cd web
bunx tsc --noEmit
bun run lint
bun run lint:i18n
bun run lint:i18n-usage
bun run test:moly-resource-origin
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
