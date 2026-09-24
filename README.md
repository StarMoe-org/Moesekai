# Moesekai (原Snowy SekaiViewer)

这是一个基于 Next.js 和 Go 的 Project Sekai 查看器项目。

> ⚠️ **注意 / Note**
>
> 作者能力有限，本项目仅作为个人练习与探索。代码中可能存在大量非最佳实践，敬请包涵。
> The author has limited capabilities; this project is for personal practice and exploration. Please be aware that the code may contain non-optimal practices.

## 参考与致谢 / Credits

本项目参考了 [Sekai Viewer](https://github.com/Sekai-World/sekai-viewer) 的设计与实现。
Sekai Viewer 采用 **GPLv3** 开源协议。

This project is inspired by and references [Sekai Viewer](https://github.com/Sekai-World/sekai-viewer).
Sekai Viewer is licensed under **GPLv3**.

[sekai-calculator](https://github.com/xfl03/sekai-calculator) 项目提供的组卡算法支持
sekai-calculator 采用 **LGPL-2.1** 开源协议。

项目算法也参考了**Luna茶**的相关组卡代码实现[sekai-deck-recommend-cpp](https://github.com/NeuraXmy/sekai-deck-recommend-cpp)

表情包制作器参考了**Parallel-SEKAI**的PJSK-Sticker仓库 以及 **TheOriginalAyaka**的sekai-stickers仓库
[PJSK-Sticker](https://github.com/Parallel-SEKAI/PJSK-Sticker)
[sekai-stickers](https://github.com/TheOriginalAyaka/sekai-stickers)

## 歌词头像版权 / Lyrics avatar credits

歌词页面中的外部歌唱者头像均为小尺寸头像裁切图，版权归各自权利人所有。官方来源与署名集中记录如下：

- **GUMI** — © Internet Co., Ltd. — [官方页面](https://www.ssw.co.jp/products/vocaloid6/megpoid/)
- **Kasane Teto / 重音テト** — `重音テト © 線 / 小山乃舞世 / TWINDRILL` — [官方插画](https://kasaneteto.jp/illust-logo/) · [角色指南](https://kasaneteto.jp/guidelines/character.html)
- **flower** — © Gynoid — [官方素材页](https://www.gynoid.co.jp/items/view/18)
- **Nenerobo** — 暂无已确认的独立官方头像素材，当前保留文字回退头像
- **Kamui Gakupo** — © Internet Co., Ltd. / 三浦建太郎 — [官方角色页](https://www.ssw.co.jp/products/vocaloid3/gackpoid/)
- **KAFU** — © Musical Isotope — [官方条款](https://musical-isotope.kamitsubaki.jp/terms/)
- **Gekiyaku** — © KAMITSUBAKI STUDIO / Musical Isotope — [官方条款](https://musical-isotope.kamitsubaki.jp/terms/)
- **SEKAI** — © Musical Isotope — [官方条款](https://musical-isotope.kamitsubaki.jp/terms/)
- **Zundamon / ずんだもん** — © 東北ずん子・ずんだもんプロジェクト — [官方指南](https://zunko.jp/guideline.html)
- **Kaai Yuki** — © AH-Software Co. Ltd. — [官方角色页](https://www.ah-soft.com/vocaloid/kaaiyuki/)
- **Adachi Rei** — © m1namo — [官方页面](https://adachirei.com/)
- **RIME** — © KAMITSUBAKI STUDIO / Musical Isotope — [官方条款](https://musical-isotope.kamitsubaki.jp/terms/)
- **Hanakuma Chifuyu** — © TOKYO6 ENTERTAINMENT — [官方页面](https://tokyo6.tokyo/hanakuma/)
- **VY1** — © Yamaha Corporation — [官方指南](https://www.vocaloid.com/en/terms/)
- **SOLARIA** — © Eclipsed Sounds — [官方页面](https://www.eclipsedsounds.com/solaria/)
- **Kotonoha Aoi / 琴葉葵** — © AHS Co. Ltd. — [官方页面](https://www.ah-soft.com/voiceroid/kotonoha/)
- **Kotonoha Akane / 琴葉茜** — © AHS Co. Ltd. — [官方页面](https://www.ah-soft.com/voiceroid/kotonoha/)

以上已列出的身份均已使用对应公开素材裁切为歌词页头像；`Nenerobo` 因暂未找到可确认的独立官方头像素材，仍保留文字回退。

头像只做裁切、缩放和页面显示用途，不代表本项目拥有上述角色或素材的版权。

可核对来源见 [`docs/lyrics-external-avatar-sources.json`](docs/lyrics-external-avatar-sources.json)。

谱面预览器参考了**watagashi-uni**的sekai-mmw-preview-web 及 mikumikuworld 的相关实现
[sekai-mmw-preview-web](https://github.com/watagashi-uni/sekai-mmw-preview-web)
[MikuMikuWorld](https://github.com/crash5band/MikuMikuWorld)

## 免责声明 / Disclaimer

**本项目包含大量由人工智能（AI）辅助生成的代码。**

- 代码可能包含潜在的错误、逻辑漏洞或非最佳实践。
- 使用者请自行承担风险，建议在生产环境部署前进行充分的审查和测试。
- 维护者不对因使用本项目代码而导致的任何问题负责。

**This project contains a significant amount of code generated with the assistance of Artificial Intelligence (AI).**

- The code may contain potential errors, logical flaws, or non-best practices.
- Users should use it at their own risk and are advised to conduct thorough review and testing before deploying in a production environment.
- The maintainers are not responsible for any issues arising from the use of this project's code.

## License

本项目的开源协议遵循所参考项目的要求（如适用），当前采用 AGPL-3.0。
AGPL-3.0

## 环境变量 / Environment Variables

### 基础后端配置 (Go API Server)

- **PORT**: 后端监听端口（默认 `8080`）
- **REDIS_URL**: Redis 地址（默认 `localhost:6379`）
- **MASTER_DATA_PATH**: 可选本地 masterdata 缓存路径（默认 `./data/master`）。仓库不再提交完整 masterdata；本地文件缺失时 Go API 会从远端数据源加载。
- **STATIC_ARCHIVE_DIR**: Next.js 静态文件归档持久化目录（默认 `./data/static_archive`）。在全量 Docker 容器部署时，启动脚本会自动将新构建的 `.next/static` 产物增量归档保存至该目录，防止新版本部署导致未刷新的在线客户端加载旧 Chunk JS 出现 404 错误。
- **STATIC_CACHE_MAX_DAYS**: 静态归档产物保留天数（默认 `30`）；设为 `0` 禁用过期清理，其他值必须是非负整数。
- **HTML_CACHE_DIR**: HTML 响应缓存目录；留空时回落到默认目录（容器内 `/app/data/html_cache`，否则 `./data/html_cache`）。没有关闭磁盘 HTML 缓存的开关。
- **NEXTJS_PORT**: 全量镜像内部 Next.js 监听端口（默认 `3000`），必须与外部 Go `PORT` 不同。

### 前端配置 (Next.js Web - standalone 部署)

- **NEXT_PUBLIC_API_URL**: 关联活动/卡池等 API 的后端基准地址；使用当前 standalone + 内置反向代理部署时通常无需配置，前后端分离部署时可设为例如 `https://api.pjsk.moe`。
- **NEXT_PUBLIC_MOLY_RESOURCE_BASE**: 烤森对话的资源目录，包含 bucket 路径并以 `/` 结尾，例如 `https://assets.example.com/bucket/`；只接受不含凭据、query 或 fragment 的 HTTPS 目录，留空时互动入口显示资源未部署。Next.js 在构建时写入客户端代码：Docker 用 `--build-arg NEXT_PUBLIC_MOLY_RESOURCE_BASE="$NEXT_PUBLIC_MOLY_RESOURCE_BASE"`，直接 Next 构建在构建前设置，开发 compose 从根目录 `.env` 透传。运行已有生产镜像时设置 `docker run -e` 不会改变它。站内 `/moly/<路径>` 由 Next 代理到 `<资源目录><路径>`，不需要 CDN 路径映射；manifest、SDK、iframe shell 和 cache worker 继续同源。完整部署要求见 [Moly 接入文档](docs/moly-integration.md)。
- **NEXT_PUBLIC_LYRICS_BASE_URL**: 可选覆盖。未设置时，页面、sitemap 与生产镜像都使用编码里的已发布歌词目录 `https://translation.exmeaning.com/files/translation/lyrics`（与 `Dockerfile` ARG 默认值相同）。生产运行与构建只接受不含凭据、query 或 fragment 的 HTTPS URL；开发环境还允许显式配置本机回环 HTTP URL。页面与 sitemap 都从该目录读取同一份 `index.json`，避免发布视图分叉。显式配置无效时会直接失败，不会改去其他源。CI 和明确隔离的非生产环境可通过 `--build-arg NEXT_PUBLIC_LYRICS_BASE_URL="$NEXT_PUBLIC_LYRICS_BASE_URL"` 覆盖，`docker-compose.dev.yml` 继续只透传开发变量。Required PR CI 使用仅在 job 生命周期内存在的一首 strict Public Lyrics v3 Full-only synthetic HTTPS index/detail fixture 验证生产 Docker/Next build contract，临时 CA 通过 BuildKit secret 只挂载到构建步骤且不会进入镜像；这不证明真实生产源可达。不要把令牌或个人配置提交到仓库。

## Docker 部署

### 1. 全量部署 (Go 后端 + Next.js 前端)

全量部署镜像内置 Go 服务与 Next.js standalone 服务。建议使用挂载到 `/app/data` 的命名卷，使 masterdata、HTML 缓存和旧版静态 Chunk 归档可以跨容器更新保留：

```bash
docker build \
  -t pjsk-viewer -f Dockerfile .

docker volume create pjsk-viewer-data

docker run -d \
  -p 8080:8080 \
  --name pjsk-viewer \
  --restart unless-stopped \
  -e PORT=8080 \
  -v pjsk-viewer-data:/app/data \
  pjsk-viewer
```

容器以非 root 用户运行；若改用宿主机 bind mount，宿主目录必须允许容器 UID/GID `1000` 写入。生产 HTTPS 应在可信反向代理或负载均衡器终止，只向外暴露 Go 的 `8080` 端口，不应暴露内部 Next.js 端口。

- `/healthz` 检查 Go 入口及内部 Next.js 服务是否可用。
- `/readyz` 仅在首份完整 masterdata 加载完成后返回成功；依赖业务 API 的流量应使用此端点作为就绪探针。
- `/internal-healthz/` 是容器内部 Next.js 专用端点，不应作为公网部署探针。

### 2. 独立后端部署 (Go API Server)

当前端部署在 Pages 等独立平台时，可以使用 `Dockerfile.backend` 构建纯 Go API 服务。Dockerfile 不使用 `.go` 后缀，避免 Go 工具链将其误判为源码。

```bash
docker build -t pjsk-go-backend -f Dockerfile.backend .

docker run -d \
  -p 8080:8080 \
  --name pjsk-backend \
  -e PORT=8080 \
  -e REDIS_URL=localhost:6379 \
  -v "$(pwd)/data:/app/data" \
  pjsk-go-backend
```
