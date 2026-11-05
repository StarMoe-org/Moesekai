# MoeSekai 版本与发版机制

站点从 v2.0.0 起采用三段式语义版本（`v主版本.次版本.修订号`），目标是**零日常维护**：
平时什么都不用管，每个 commit 都会让修订号自动 +1；想正式发版时点一下 GitHub Action 即可。

## 版本号怎么来的

唯一真相源是仓库里最高的严格语义版本 git tag（`vX.Y.Z`，不含预发布 tag）。

```
当前展示版本 = X.Y.(Z + 该 tag 之后的 commit 数)
```

- 刚好打在 tag 上：展示 `X.Y.Z` 本身（正式版）。
- tag 之后每多一个 commit，修订号自动 +1。例如 `v2.0.0` 之后第 37 个 commit，站上显示 `v2.0.37`。
- 还没有任何 tag 时（或构建环境没有 `.git` 时），兜底基线为 `2.0.0`，并在设置「关于」页里显示实际 commit。

这一规则保证版本号**单调递增、永不回退、永不撞号**，且不需要任何“ bump 版本号”的垃圾 commit 或频繁打 tag。

## 显示在哪里

- 设置面板底部页脚：`Moesekai · v2.0.37`
- 设置 →「关于」：版本号、构建提交（短 SHA，可点进对应 commit）、构建日期，并有
  GitHub 发布页 / 更新日志（`CHANGELOG.md`）入口。
- 每次 Deploy 构建的 GHCR 镜像同时带 `v<版本>` tag（另有原来的 commit SHA 与 `main` tag）。

版本信息在构建时注入：`next.config.ts` 通过 `web/src/lib/build-version.ts` 解析，
写入 `NEXT_PUBLIC_MOESEKAI_*`，前端只读 `web/src/lib/app-version.ts`。
Docker 构建没有 `.git`，所以 Deploy workflow 先在 runner 上用
`web/scripts/resolve-version.mjs` 算好，再以 build-args 传入 Dockerfile。

## 怎么正式发版（一键）

1. 打开 GitHub 仓库 → Actions → **Release** → Run workflow（必须在 `main` 分支上跑）。
2. 选择 bump 类型：
   - `patch`：下一个修订版。会跳过已自动用掉的号——例如当前展示 `2.0.37`，下一个 patch tag 是 `v2.0.38`。
   - `minor`：新功能里程碑，如 `v2.1.0`（之后修订号重新从该 tag 起数）。
   - `major`：不兼容大改，如 `v3.0.0`。
3. Action 自动：算 tag → 打 annotated tag 并推送 → 用 `--generate-notes` 生成 GitHub Release。

首次运行（仓库还没有任何 tag 时）无论选哪种 bump，都会打出第一个正式版 `v2.0.0`。

发版只是给某个 main 提交起名字、留档，**不改变部署方式**：部署仍然是 push `main`
自动构建上线（`.github/workflows/deploy.yml`）。tag 推送会照常被 CNB 同步 workflow 镜像过去。

## 本地命令

```bash
npm run version:show          # 当前派生版本 / 基准 tag / commit 数
npm run version:next          # 下一个 patch 发版会打的 tag
node web/scripts/resolve-version.mjs --json
node web/scripts/resolve-version.mjs --next-tag minor
```

## 约定与注意事项

- 不要手工编辑 `package.json` 里的版本号来发版——那里的 `2.0.0` 只是无 tag/无 `.git` 时的兜底基线，
  与 `web/src/lib/build-version.ts` 的 `BASELINE_VERSION`、`web/src/lib/app-version.ts` 的
  `FALLBACK_VERSION` 保持一致即可。
- tag 命名必须是严格的 `vX.Y.Z`（可带 annotated message），不要用 `v2.1`、`release-2.1` 或预发布后缀作为基准 tag；
  解析脚本会忽略不符合格式的 tag。
- 手工打 tag 前先 `npm run version:show` 确认基准 tag 与 commit 数，避免打出比当前展示版本还小的号。
- 后端 Go 服务暂未纳入版本号展示；如需 `/healthz` 等接口带版本，再用 `-ldflags -X` 注入同一套派生版本。
