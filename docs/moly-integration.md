# Moly 对话与互动：接入、构建与验收

## 功能边界

正式入口为 `/mysekai/interactions/`，沿用网站 locale 路由（例如 `/zh-cn/mysekai/interactions/`）。家具目录、家具详情、侧栏和命令导航均可进入。普通家具数据库只读取目录与静态头像，不下载 Moly WASM 或 GLB。互动页的阅读状态同样只读取目录、所选详情与静态图片。用户点击进入场景或播放/预览后，才创建同源 iframe 并准备引擎和必要资源；宿主将激活请求交给场景，保留真实用户手势供音频使用，不需要再点击 iframe 内按钮。

React 管理检索、详情、选择、URL 与宿主 UI。iframe 内的原 Rust runtime 仍是对话、角色动作、家具控制器、音频、临时布景和恢复的唯一执行方。`available` 来自 runtime 导出的目录投影，宿主不重写角色/家具准入规则；实际播放再次通过 runtime 的动态准入。

区服和快照属于内容身份，不属于界面语言。家具链接只在区服与访问者默认区服不同时才带 `region`：带查询串的页面在 `proxy.ts` 里是 `noindex` 且 `private, no-store`，冗余的 pin 会让家具页丢掉可缓存、可索引的干净 URL。互动链接保留 `region`、`snapshot`、`content` 和筛选条件。未部署、来源不一致、旧快照或不存在的内容应显示明确状态，不能用另一个区服的同号 ID 代替。

目录固定每页 24 项，`page` 写入 URL 与浏览历史；切页替换当前项，不无限追加。普通选中内容通过可见卡片锚点累计补偿异步详情布局变化，不主动滚动到播放器。网页沉浸与浏览器全屏只改变同一个 stage 的呈现，不 portal、不移动或重新挂载 iframe，保留运行世界与音频。

参与者组件同时展示所有角色纯头部大头照与家具真实贴图。头像只接受 `moly-root-chara-head-v1`，由 moly-root chara viewer 的真实材质、面部与 stencil 渲染链生成；按 Head 骨骼后代筛选网格三角形，512×512 RGBA 透明背景，不通过裁切半身图片代替。发布时校验角色模型、rig、区域和版本来源，宿主只读取静态 manifest 与 PNG。

家具 `preview` 只播放独立真源 tweet 的头顶气泡，`play/engage` 进入完整正式对话；缺少 tweet 时显示 unavailable，不能从正文截取或改写。CN 与 JP 对白各自使用对应快照。例如 CN 6.0.0 的冰箱首句保留来源中的“望月同学”，不按记忆替换。

玩家 JSON 导入与 Haruki 读取只传给当前独立 runtime。MYSEKAI 与 suite 授权分别处理，拒绝后不会悄悄改用另一份数据；32 MiB 输入上限、请求取消与来源区服检查在宿主执行。预览、临时探索和恢复由原 Rust runtime 执行，不能覆盖用户本地存档。

## 资源与部署

应用镜像不包含游戏资源与运行时产物。部署只有一个配置项：`NEXT_PUBLIC_MOLY_RESOURCE_BASE`，指向发布目录，**包含 bucket 路径并以 `/` 结尾**，例如 `https://assets.example.com/bucket/`。留空时网站其余部分照常运行，互动入口显示资源未部署。

发布里的路径是逻辑路径：manifest 写 `/moly/releases/<id>/...`、`/moly/snapshots/<id>/...`。宿主把逻辑路径 `/moly/<尾部>` 映射为 `<资源目录><尾部>`，对象存储里的对象键就是 `<尾部>`（bucket 内不另加前缀）。映射只在宿主一处完成（`web/src/lib/moly/resourceBase.ts`），不依赖 CDN 路径改写。注意不能用 `new URL("/moly/...", base)` 解析，那会丢掉 bucket 路径。

iframe 必须与宿主页面同源，宿主才能在用户点击时同步转交音频激活手势；缓存 worker 的 scope 同样限定在同源 `/moly/`。因此 Next 只把这一小块同源控制面反向代理到资源目录，其余字节浏览器直连：

| 请求 | 提供方 |
| --- | --- |
| `/moly/manifest.json`、release 的 embed SDK 与 stage shell、`/moly/cache-worker.mjs` | Next 反向代理到 `<资源目录>manifest.json` 等（约 0.15 MB） |
| 引擎 JS 胶水与 WASM（`releases/<id>/pkg/`） | 浏览器直连资源目录 |
| 目录索引、详情、头像、家具图片、场景模型、贴图、音频 | 浏览器直连资源目录 |

宿主把校验过的资源目录交给 stage（`resourceBase`），runtime 据此解析引擎与资源地址，大体积字节不经过应用服务器。未配置时不建立该代理，`/moly/` 没有提供方。

资源目录下保存完整的版本化 release 与 snapshot（目录、详情、图片与全部被引用的场景资源），或 content-addressed asset-store；`manifest.json` 是当前发布的发现入口。已发布 ID 下的字节不可覆盖。

构建与运行示意（替换成部署配置）：

```sh
export NEXT_PUBLIC_MOLY_RESOURCE_BASE=https://assets.example.com/bucket/
docker build \
  --build-arg NEXT_PUBLIC_MOLY_RESOURCE_BASE="$NEXT_PUBLIC_MOLY_RESOURCE_BASE" \
  -t moesekai:local .

docker run --rm -p 8080:8080 moesekai:local
```

`NEXT_PUBLIC_*` 由 Next.js 在构建时内联，改变资源目录需要重建前端/镜像；只在 `docker run -e` 添加该变量不会更新已有客户端。直接构建 Next 时在 `bun run --cwd web build:next` 之前设置同名变量。开发 compose 会读取根目录 `.env`（参见 `.env.example`）；直接 Next 开发可用 `web/.env.local`。外部 CI 必须将同名变量显式传给 Docker `build-args`，不能仅给部署容器设置环境变量。

资源目录必须是规范形式：HTTPS、含非根路径、以 `/` 结尾，不带查询、片段、凭据、反斜杠或百分号转义。不合规的值在读取 `next.config.ts` 时即报错、服务不会启动。本地联调 `/moly/` 时指向一个可用的 HTTPS 发布目录。

存储与 CDN 的要求：

- 公开资源允许任意站点 origin 的 GET/HEAD 跨域读取（引擎胶水以 ES module 方式跨域加载），并允许 OPTIONS 预检与请求头 `X-Moly-Required`。
- 压缩体以原始逻辑 URL 保存，`Content-Type` 为原类型、`Content-Encoding` 为 `br` 或 `gzip`，按原样返回，不做二次压缩或解压。对象上不能残留存储传输层的编码（例如分块上传留下的 `aws-chunked`），否则浏览器无法解码。
- 每个对象带解码字节数元数据（S3 为 `x-amz-meta-moly-decoded-bytes`），并通过 CORS `Expose-Headers` 暴露给脚本；缓存 worker 用它统计与保留解码字节。未暴露时在线播放不受影响，但不会写入持久缓存。
- 版本化资源使用长缓存与 `immutable`，`manifest.json` 与 `cache-worker.mjs` 不可长缓存。

## 产物来源与更新

运行时产物由独立的运行时工程构建，不在本仓库内生成。本仓库只消费它们，因此这里只定义消费侧的契约。

发布分三类，互不耦合：页面、样式与文案走网站现有发布流程；引擎更新发布完整的 `releases/<新 ID>/`（JS 胶水、WASM、压缩副本与完整性文件属于同一次构建）；资源、对白或目录投影变化发布新的 `snapshots/<新 ID>/`。

切换版本的顺序是：先把新的 release、snapshot 及其引用资源放到资源目录并校验内容、MIME、压缩表示与缓存头，最后替换 `cache-worker.mjs` 与 `manifest.json`。宿主读取清单时不使用缓存，引擎更新无需重建镜像或重启；资源目录变化必须重建前端。

已发布 ID 下的字节不可覆盖：资源变化应生成新快照，而不是覆盖原 ID 下的文件。新打开或刷新的页面读取新 release，正在播放的页面继续持有原版本。遇到回归时恢复上一份 manifest 并保留其引用文件；旧目录在确认无人依赖前不清理——固定链接依赖历史快照描述符仍然存在。

manifest 保留 `downloadBytes`、`decodedBytes`、`brotliBytes`、`gzipBytes`；Brotli 发布的 `downloadBytes` 必须等于 `brotliBytes`。浏览器缓存统计使用解码字节，不能与 Brotli 网络流量直接比较。

快照 ID 是目录、家具 master、控制器索引与来源描述的摘要，**不是每个游戏二进制的全量 Merkle 校验**。

## 缓存与数据隔离

缓存 worker 以同源 `/moly/cache-worker.mjs` 注册，脚本路径本身决定 `/moly/` 作用域。worker 只控制同源 `/moly/` 下的 runtime 页面，并按配置的资源目录读取不可变 release/snapshot 与 asset-store 请求；这些请求保留资源目录下的真实 URL。互动入口在 iframe 开始请求前自动开启保留，并持久缓存 release 与 `browser-base.json` 声明的基础资源；预算为 512 MiB，单项最多 128 MiB，排队写入有上限。按需演出的语音、模型等资源只在 worker 内存中复用，最多 64 MiB、单项最多 32 MiB，worker 结束后不保留。对话详情 JSON 只在当前阅读页面内存中复用（最多 64 条），不进入浏览器长期缓存。旧版 worker 留下的非基础资源在新版激活时清理。存储被浏览器拒绝时仍允许在线播放。

宿主先显式完成 worker 更新检查，再等待最新 installing/waiting worker 完成 activation 后才发送保留命令；同时存在的旧 active worker 不代表新版本已完成迁移。宿主缓存注册对象而非某代 worker，后续命令仍会检查更新。升级失败或超时可重试，消息通道在同步发送失败时也会关闭。

网页全屏和浏览器全屏均保留进入前的场景比例，在可用区域内等比居中；只改变展示尺寸，不重建 iframe 或重启音频。退出全屏恢复原布局与焦点。

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
bun run test:moly-resource-base
bun run test:moly-resource-cache
bun run test:moly-publication-contract
bun run test:moly-stage-viewport
bun run test:mysekai-workspace
bun run test:mysekai-character-filter
bun run test:mysekai-runtime-selection
bun run build:next
```

实际浏览器验收必须包含：未进入时零引擎下载；宽/窄屏与明暗主题；严格区服上下文；原始对白、无对白动作和气泡；双渲染后端；停止/替换/自然结束/关闭后的恢复；资源缓存保留/清理；缺失资源与错误状态。出现 pageerror、协议错误或缺失资产时不能只凭脚本进程 exit 0 宣称完成。

在同一台机器上并行构建时设置 `MOE_NEXT_DIST_DIR` 创建独立产物，避免覆盖运行中的 standalone。`.next-*` 不提交，也不被 ESLint、TypeScript 源检查或 Tailwind 的自动源扫描使用。默认生产构建仍使用 `.next`。
