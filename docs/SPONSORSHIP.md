# 赞助渠道与赞助者名单

赞助入口只有两个平台，二维码收款已全部下线：

| 渠道 | 面向 | 地址 |
|---|---|---|
| 爱发电 Afdian | 国内（微信 / 支付宝等） | https://afdian.com/a/MoeSekai |
| Ko-fi | 海外（国际支付） | https://ko-fi.com/moesekai |

链接常量在 `web/src/lib/team-links.ts`（`MOESEKAI_AFDIAN_URL` / `MOESEKAI_KOFI_URL`），赞助页
`/patreon` 与实时榜单庆祝弹窗都从这里取，不要再各处写死。

## 赞助者名单怎么展示

赞助页 `/patreon` 的名单分两层：

1. **主名单（实时）**：通过爱发电开放接口拉取当前赞助者（头像 + 昵称 + 当前方案），
   经本站 `GET /api/sponsors` 代理，缓存 1 小时。赞助后昵称会自动上墙，无需附言。
2. **历史名单（二级，默认折叠）**：爱发电开通前通过收款码等方式赞助过的「曾经赞助过」名单，
   点开赞助页下方的「历史赞助者」才展开；关于页 `/about` 的赞助者致谢也读同一份数据。

## 爱发电接口配置（服务端）

爱发电提供官方开放接口：`POST https://afdian.com/api/open/query-sponsor`
（文档/凭据：https://afdian.com/dashboard/dev ，创作者后台的开发者设置里有 `user_id` 与 API Token）。
签名方式：`sign = md5(token + "params" + <params JSON> + "ts" + <ts 秒> + "user_id" + <user_id>)`，
返回 `data.list[]`（`user.name` / `user.avatar`、`all_sum_amount`、`last_pay_time`、`current_plan`），
按 `page` / `per_page`（最大 100）分页。

本站实现：

- `web/src/lib/afdian.ts`：签名、分页拉取、字段清洗（只保留展示字段）。Token 只从服务端环境变量读取。
- `web/src/app/api/sponsors/route.ts`：对外只暴露清洗后的 `name/avatar/amount/plan`，不透传原始数据。

部署环境需要配置（见 `.env.example`）：

```bash
AFDIAN_USER_ID=        # 爱发电创作者 user_id
AFDIAN_API_TOKEN=      # 爱发电 API Token（机密！不要进 NEXT_PUBLIC_*，不要提交真实值）
# AFDIAN_API_BASE_URL= # 可选，默认 https://afdian.com/api/open
```

未配置时页面不报错：名单区显示「尚未配置」提示，历史名单照常展示。

## 名单改这里，不要再改语言包

赞助者、特别感谢、团队成员三类名单都已从 5 个语言包的硬编码长文案中抽出，
统一放在一个结构化文件：

- 数据：`web/src/data/community-lists.json`（`sponsors.members` / `sponsors.anonymousCount` /
  `specialThanks` / `teams.translation|art|guide`）
- 读取：`web/src/lib/community-lists.ts`（关于页与赞助页共用；成员名会自动挂已知的 B 站链接）

加人/改名只改这个 JSON 即可，不需要再同步 5 份翻译。语言包里只留标题、备注
（如 `page.about.sponsors.anonymousNote`、`page.about.specialThanks.partialNote`）等固定文案。
注意历史上各语言版本的名单略有出入，迁移时已取并集；新增成员直接往 JSON 里加。
