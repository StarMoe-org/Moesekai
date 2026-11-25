# 账号系统

Moesekai 里和“账号”有关的东西分三层。新功能、新页面涉及账号时，先按本文确定放在哪一层、用哪个词。

## 1. 三层

| 层 | 是什么 | 归谁管 | 代码 |
|---|---|---|---|
| **身份** | StarMoe 通行证（Passport，passport.star.moe），所有 StarMoe 站点共用 | 通行证本身：密码、邮箱、两步验证都在它的账号中心，Moesekai 不做 | `web/src/lib/moesekai-account.ts`（`useMoesekaiAccount`、`signIn`、`signOut`） |
| **游戏账号** | 访客关注的游戏 UID（区服 + UID） | 登录后以 StarMoe 账号为准；未登录时只存在这台设备（访客模式） | `web/src/lib/account/`、`web/src/lib/starmoe-accounts.ts` |
| **数据来源** | 从 Haruki 读游戏数据的方式 | StarMoe Connect（connect.star.moe）保管 Haruki 连接 | `web/src/lib/account/game-data.ts` |

一句话：**通行证是“你是谁”，游戏账号是“你在看谁的数据”，Haruki 是“数据从哪来”。**

### 定位：登录优先，访客可用

- 所有需要游戏账号的入口，先给“登录 StarMoe”，同时保留“直接输入 UID”。不登录也能用，但要说清楚代价：只存在这台设备、对方必须在 Haruki 开启公开 API、带身份的功能（猜歌排行等）用不了。
- 登录后，StarMoe 账号里的列表是唯一的账号列表，换设备、Moebot 都是同一份。只在这台设备上的账号（“仅本机”）只是待处理状态，提示一键保存。
- 通行证设置跳通行证账号中心；连接、断开 Haruki 跳 StarMoe Connect。Moesekai 不重复实现。

## 2. 用词

全站统一，五种语言各对应一个词。

| 概念 | 简体中文 | 不再使用 |
|---|---|---|
| Passport 身份 | StarMoe 通行证 | StarMoe 账号、登录（单独出现时） |
| 游戏 UID | 游戏账号 | 账号（单独出现时）、绑定 |
| 存在 StarMoe 账号下 | 已保存 | 已同步 |
| 只在这台浏览器里 | 仅本机 | 未同步、本地 |
| Haruki 验证过（`source: verified`） | 已验证 | OAuth2 |
| 手动添加（`source: manual`） | 未验证 | 公开 API |
| 浏览器里正在看的那个 | 当前查看 | 默认、当前使用 |
| 重新读取数据 | 刷新数据 | 重新同步 |
| 服务端按区服的主账号（Moebot 用） | 区服主账号 | — |

## 3. 数据怎么流动

```text
浏览器 ── pjsk.moe（Go 主站，同源转发）── moesekai-api ──┬── StarMoe Connect ── Haruki（已验证账号，全部数据）
   │                                                    └── Haruki 公开 API（其余账号，公开字段）
   └── 未登录时直接读 Haruki 公开 API
```

- **登录**：`/api/auth/*`，在 moesekai-api 服务端完成（保密 OIDC 客户端）。浏览器只有 HttpOnly 会话 Cookie，不拿令牌，也不发 `Authorization` 头。
- **游戏账号与数据**：`/api/v1/me/accounts`、`/api/v1/me/sekai/{server}/{suite|mysekai}/{uid}`。和 Moebot 等第三方应用共用同一组接口，网站用 Cookie，第三方用 Passport 访问令牌。
  - Go 主站的转发前缀在 `main.go` 的 `moesekaiAPIPrefixes`。前端路径和转发必须在同一次部署里上线：`/api/v1/me/accounts` 返回 404 时，前端会认为功能不可用，退回只用本机账号。
  - 旧路径 `/api/accounts`、`/api/sekai` 只为缓存的旧页面保留，确认没有调用后，在 moesekai-api 和 `main.go` 里一起删除。
- **本机列表**：localStorage 的 `moesekai_accounts`、`moesekai_active_account`。任何修改都会触发 `moesekai:accounts-changed`。组件用 `useGameAccounts()`（`@/lib/account/hooks`）读取，自动跟随其他页面、其他标签页和 StarMoe 同步带来的变化，不要只在挂载时读一次。
- **同步**：登录后，`starmoe-sync.ts` 把服务端列表合并进本机列表：服务端有的加进来；服务端删掉的、原本来自服务端的删掉；只在本机的保留。
- **刷新**：`refreshGameAccount(id)` / `refreshGameAccounts({ onlyMissing })`。同一个账号同时只会读一次。

## 4. 代码地图

| 文件 | 职责 |
|---|---|
| `web/src/lib/account/types.ts` | 账号与游戏数据的类型 |
| `web/src/lib/account/store.ts` | 本机列表的读写、当前查看的账号、头像缓存 |
| `web/src/lib/account/starmoe-sync.ts` | 与 StarMoe 账号合并、保存手动添加的账号 |
| `web/src/lib/account/game-data.ts` | 读 Haruki 数据、刷新已保存的账号、MySekai 数据 |
| `web/src/lib/account/actions.ts` | 添加游戏账号、删除游戏账号、把仅本机的账号保存到通行证（所有页面共用） |
| `web/src/lib/account/game-data-format.ts` | 把各种 Haruki 响应整理成同一种结构，错误码归一（纯函数） |
| `web/src/lib/account/hooks.ts` | `useGameAccounts()`（列表和当前查看的账号，用于显示）；`useViewedGameAccount()`（只在换账号时变化，用作拉取数据的 effect 依赖） |
| `web/src/lib/starmoe-accounts.ts` | moesekai-api 的 `/api/v1/me` 客户端、Haruki 连接状态 |
| `web/src/lib/moesekai-account.ts` | 通行证登录状态 |
| `web/src/lib/legacy-oauth/` | **旧**浏览器 OAuth2 绑定（见第 5 节） |

`@/lib/account` 是上面这些模块的统一出口。客户端组件里的 hook 从 `@/lib/account/hooks` 引入。

界面：

| 位置 | 内容 |
|---|---|
| `web/src/components/account/AccountCenter.tsx` | 侧边栏底部的账号中心：第一行是通行证（未登录时是“登录 StarMoe”），第二行是当前查看的游戏账号；菜单里切换、添加、管理游戏账号，打开通行证账号中心，登录或退出 |
| `web/src/app/account/` | “我的账号”页：通行证、Haruki 数据来源、游戏账号、这台设备四块 |
| `web/src/components/account/AddGameAccountDialog.tsx` | 全站唯一的按 UID 添加入口（`/account?add=1` 直接打开） |
| `web/src/components/account/GameAccountList.tsx` | 游戏账号列表：来源、保存位置、数据时间、行内刷新错误、删除对话框 |
| `web/src/components/account/GameAccountSwitchMenu.tsx` | 切换当前查看的游戏账号的菜单 |
| `web/src/app/profile/` | 只展示当前查看的游戏账号的资料；旧链接 `/profile#profile-accounts` 自动转到 `/account` |
| `web/src/components/account/GameAccountBar.tsx` | 展示某个账号数据的页面（卡牌、歌曲、素材进度）顶部的“正在查看”栏：切换、添加 |
| `web/src/components/account/NoGameAccount.tsx` | 上述页面没有账号时的空状态：登录 StarMoe，或直接输入 UID |
| `web/src/components/account/GameAccountQuickFill.tsx` | 要填任意玩家 UID 的工具（组卡推荐、控分、MySekai）里一键填入自己的账号，带添加和管理入口 |
| `web/src/components/guess-music/StarMoeAccountChip.tsx` | 猜歌标题栏：未登录时给登录；登录后从已验证账号里选一个关联到排行榜 |
| `web/src/app/player-frames/` | 玩家边框预览的页头「同步账号数据」：把当前查看账号的游戏内名字、三个装备中的称号（含角色称号的背景样式与字样）、队长卡（含等级/突破/特训）、以及账号装备的边框（`userPlayerFrames`；WL3 组合框连 `partsLayout` 的六个部件角色一起套用，多个框取 `playerFrameId` 最大的那个）套用到预览；没有账号时弹出与「我的主页」相同的空状态对话框（`page.account.profile.empty*`，按钮跳 `/account`），不在这里弹 UID 输入框。只读当前查看的账号，不接受临时输入别人的 UID |

文案在 `web/src/lib/i18n/messages/<语言>/account.ts`，挂在 `page.account`。

## 5. 旧浏览器 OAuth2 绑定（2026-12-20 删除）

2026-11-19 之前，浏览器直接用 Haruki 的 OAuth2 客户端绑定游戏账号，令牌存在 localStorage（`authSource: "oauth2"`）。现在由 StarMoe Connect 在服务端保管 Haruki 连接，旧方式只做兼容，2026-12-20 删除。

- 相关代码集中在 `web/src/lib/legacy-oauth/`，此外只有这些地方引用：
  - `/oauth2/*` 页面；
  - `OAuthMigrationPrompt`；
  - `game-data.ts` 里 `isLegacyOAuthAccount` 的分支；
  - 猜歌的 `StarMoeAccountChip`：已验证账号按 `{server, userId}` 关联（服务端经 StarMoe Connect 核对）；旧绑定的账号仍用浏览器里的令牌关联，删除时去掉这条路径。
- 删除时，已有的旧账号要降级为公开 API 账号保留，不能直接丢掉。
- 新代码不要再依赖它。

## 6. 新增涉及账号的功能时

- 需要游戏账号：展示某个账号数据的页面用 `GameAccountBar` + `NoGameAccount`，工具页用 `GameAccountQuickFill`，其余场景用 `GameAccountSwitchMenu` 和 `AddGameAccountDialog`；添加和删除走 `actions.ts`，不要再写一套表单。
- 页面跟随全站“当前查看”的账号：显示用 `useGameAccounts()`，拉数据的 effect 依赖 `useViewedGameAccount()`，不要在挂载时读一次 `getActiveAccount()` 存进 state（侧边栏切换后页面不会跟着变）。
- 显示账号的组件要调用 `useStarMoeAccountSync()`，登录后才会拉回通行证里的账号和 Haruki 连接状态。
- 管理账号的入口一律指向 `/account`，不要再指向 `/profile`。
- 需要身份（排行、收藏、跨设备设置）：用 `useMoesekaiAccount()`；未登录时给登录入口，不要退回到用游戏 UID 充当身份。
- 只有手动添加的游戏账号会保存到 StarMoe 账号；工具页临时输入的 UID 只留在本机。
- 文案按第 2 节用词，五种语言都要补。
