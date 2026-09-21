# Moly 对话与互动：接入、构建与验收

## 功能边界

正式入口为 `/mysekai/interactions/`，沿用网站 locale 路由（例如 `/zh-cn/mysekai/interactions/`）。家具目录、家具详情、侧栏和命令导航均可进入。普通家具数据库只读取目录与静态头像，不下载 Moly WASM 或 GLB。互动页的阅读状态同样只读取目录、所选详情与静态图片。用户点击进入场景或播放/预览后，才创建同源 iframe 并准备引擎和必要资源；宿主将激活请求交给场景，保留真实用户手势供音频使用，不需要再点击 iframe 内按钮。

React 管理检索、详情、选择、URL 与宿主 UI。iframe 内的原 Rust runtime 仍是对话、角色动作、家具控制器、音频、临时布景和恢复的唯一执行方。`available` 来自 runtime 导出的目录投影，宿主不重写角色/家具准入规则；实际播放再次通过 runtime 的动态准入。

区服和快照属于内容身份，不属于界面语言。家具链接只在区服与访问者默认区服不同时才带 `region`：带查询串的页面在 `proxy.ts` 里是 `noindex` 且 `private, no-store`，冗余的 pin 会让家具页丢掉可缓存、可索引的干净 URL。互动链接保留 `region`、`snapshot`、`content` 和筛选条件。未部署、来源不一致、旧快照或不存在的内容应显示明确状态，不能用另一个区服的同号 ID 代替。

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

## 产物来源与更新

运行时产物由独立的运行时工程构建，不在本仓库内生成。本仓库只消费它们，因此这里只定义消费侧的契约。

发布分三类，互不耦合：页面、样式与文案走网站现有发布流程；引擎更新发布完整的 `releases/<新 ID>/`（JS 胶水、WASM、压缩副本与完整性文件属于同一次构建）；资源、对白或目录投影变化发布新的 `snapshots/<新 ID>/`。

切换版本的顺序是：先把新的 release、snapshot 及其引用资源放到 CDN 与控制目录并校验内容、MIME、压缩表示与缓存头，再以临时文件上传新 manifest，最后在同一文件系统上原子替换 `MOLY_ROOT/manifest.json`。Go 按文件时间与大小重新读取清单，引擎更新通常无需重建镜像或重启；首次配置挂载需要重启，资源 origin 变化必须重建前端。

已发布 ID 下的字节不可覆盖：资源变化应生成新快照，而不是覆盖原 ID 下的文件。新打开或刷新的页面读取新 release，正在播放的页面继续持有原版本。遇到回归时恢复上一份 manifest 并保留其引用文件；旧目录在确认无人依赖前不清理——固定链接依赖历史快照描述符仍然存在。

Go 按 `Accept-Encoding` 的 quality 协商 Brotli、gzip、identity，尊重显式 `q=0`，所有可用表示均被禁止时返回 406。各表示拥有独立 ETag，并支持 HEAD、304 与 Range。manifest 保留 `downloadBytes`、`decodedBytes`、`brotliBytes`、`gzipBytes`，读取时核对实际文件长度；Brotli 发布的 `downloadBytes` 必须等于 `brotliBytes`。浏览器缓存统计使用解码字节，不能与 Brotli 网络流量直接比较。

快照 ID 是目录、家具 master、控制器索引与来源描述的摘要，**不是每个游戏二进制的全量 Merkle 校验**。

## 缓存与数据隔离

`GET /moly/cache-worker.mjs` 返回 JavaScript 与 `Service-Worker-Allowed: /moly/`。worker 只控制同源 `/moly/` 下的 runtime 页面，并按配置的资源 origin 读取不可变 release/snapshot 与 asset-store 请求；CDN 资源保留真实 CDN URL。互动入口在 iframe 开始请求前自动开启保留，并持久缓存 release 与 `browser-base.json` 声明的基础资源；预算为 512 MiB，单项最多 128 MiB，排队写入有上限。按需演出的语音、模型等资源只在 worker 内存中复用，最多 64 MiB、单项最多 32 MiB，worker 结束后不保留。对话详情 JSON 只在当前阅读页面内存中复用（最多 64 条），不进入浏览器长期缓存。旧版 worker 留下的非基础资源在新版激活时清理。存储被浏览器拒绝时仍允许在线播放。

删除只位于 `/mysekai/interactions/resources/` 资源管理页；离开互动页时先让 runtime 恢复并关闭世界，再清理。清理只删除 `moly-resource-v1-*`，不删除站点设置、用户账户、已有布局或其他 CacheStorage。必要资源重新加载会重新填充对应快照的基础包。缓存统计为实际保留的解码字节，并非网络传输字节。

互动页、资源页、返回及重新加载链接保留 `region` 和 `snapshot`，因此中文界面浏览 JP 后不会在重新加载时隐式换成 CN。过期快照依旧显示来源失效，交由用户显式切换到当前快照。

离线保证只针对已完整准备且未被驱逐的基础包；按需演出资源只保证当前 worker 存活期间的尽力复用，不能承诺跨访问离线播放。离线验收应使用新浏览器 profile，等待缓存完成后断网逐项 fetch 必要资源；随后联网去资源管理页清理至零字节、重新加载并复测。浏览器仍可能回收站点存储。

## 验证

宿主校验命令：

```sh
go test ./...
cd web
bunx tsc --noEmit
bun run lint
bun run lint:i18n
bun run lint:i18n-usage
bun run test:moly-resource-origin
bun run test:mysekai-workspace
bun run test:mysekai-character-filter
bun run test:mysekai-runtime-selection
bun run build:next
```

实际浏览器验收必须包含：未进入时零引擎下载；宽/窄屏与明暗主题；严格区服上下文；原始对白、无对白动作和气泡；双渲染后端；停止/替换/自然结束/关闭后的恢复；资源缓存保留/清理；缺失资源与错误状态。出现 pageerror、协议错误或缺失资产时不能只凭脚本进程 exit 0 宣称完成。

在同一台机器上并行构建时设置 `MOE_NEXT_DIST_DIR` 创建独立产物，避免覆盖运行中的 standalone。`.next-*` 不提交，也不被 ESLint、TypeScript 源检查或 Tailwind 的自动源扫描使用。默认生产构建仍使用 `.next`。
