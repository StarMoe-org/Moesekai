# 剧情浏览器

`/story-player` 是「工具」里的剧情浏览器：选一话剧情，在舞台上播放它的 Live2D 演出，旁边对照这一话的剧本。播放器与剧情阅读页的 Live2D 悬浮窗是同一个（sse-web，见 [story-live2d-player.md](story-live2d-player.md)），剧情库、客户端解包和字体的设置也相同。参照的是 moenotes 的剧情播放器（`StarMoe-org/moenotes` 的 `docs/story-player.md`），只借鉴了结构和交互。

## 地址

`/story-player?server=jp&ep=event:140/1`：`server` 是资源服务器（`jp`、`cn`、`tw`、`kr`、`en`），`ep` 是剧集在剧情库里的名字（选择器），写法与剧情阅读页给悬浮窗的 `live2dSelector` 相同：

| 类别 | 选择器 |
|---|---|
| 活动 | `event:<活动>/<话>` |
| 主线 | `unit:<章节的 assetbundleName>/<话>`（`episodeNo`，不是 `episodeNoLabel`） |
| 卡面 | `card:<卡>/former`（前篇）、`card:<卡>/latter`（后篇）；地址里的旧写法 `first` / `second` 也认 |
| 特别 | `special:<id>/<话>` |
| 区域对话 | `area:<区域>/<actionSet>` |

角色自我介绍不在剧情库里，不列出。

- 没有 `server` 时用站点设置里的资源服务器；页面上切换服务器、换一话都用 `history.replaceState` 改地址，链接可以直接分享。
- 打开链接时只显示这一话和「加载并播放」，不自动下载（长的一话两百多 MB）。在页面里选的一话（选剧情对话框、上一话 / 下一话、播完后的「下一话」）加载完就开始播放。
- 切换服务器时保留这一话：新服务器的剧情库里也有就照常显示，没有就提示换服务器或另选一话。

## 页面

- **顶栏**：这一话的类别、分组和标题（链接到这一话的剧情阅读页；没有阅读页的不加链接，例如特别剧情里的开场 2），上一话 / 下一话（同一类别内按时间顺序），服务器下拉，「选择剧情」。
- **舞台和剧本并排**：页面内容宽于 64rem（侧栏之外的宽度，用容器查询判断）时左边舞台、右边剧本，剧本栏与左栏同高，自己滚动；窄时上下排列，剧本栏高 60vh。
- **控制条**：只用播放器已有的能力——播放 / 暂停、上一句 / 下一句、AUTO、句子进度条（拖动或点击，松开后 `seek` 到那一句）、音量 / 静音、播放设置（`Live2DPlayerSettings`）、全屏。全屏时是画面上的浮动工具栏，与悬浮窗相同。一话播完，舞台上有「重播」和「下一话」。快进倍速、分轨音量、跳过要改 SSE，没有做。
- **剧本与播放同步**：规则与悬浮窗相同（`components/story/live2dRows.ts`）：播放器的每个节点带着它在剧本 `Snippets` 里的序号，对上列表里由同一个 snippet 生成的那一行；当前这一句的行高亮并滚进剧本栏的可见范围（可关），点一行跳到那一句。列表里没有对应行的节点不影响其他行。
- **剧本**：读所选服务器的镜像（`replaceAssetSourceRegion` 把站点的资源线路换成这个服务器），处理方式与剧情阅读页相同（`fetchStoryAssetFromMirror`、`processScenarioForDisplay`），显示原文，不合并翻译。
- 同一时间只播一个：页面和剧情阅读页的悬浮窗共用 `useLive2DPlayer` 里的那条规则，开始另一个时前一个自动关闭。

## 选剧情对话框

五个分页：活动（按活动，新的在前，每个活动带编号和横幅）、主线（按团体的章节）、卡面（按角色，每个角色的卡新的在前，前篇在后篇之前）、特别剧情（按特别剧情）、区域对话（按区域，带出场角色的头像）。卡面和区域对话还可以切换成「按活动」，与剧情页的做法一致：

- 卡面按卡所属的活动（`eventCards.json`；属于两个活动的卡归到前一个），新的活动在前，最后是不属于活动的卡。
- 区域对话按区域对话页的分类（`getAreaCategory`）：日常（第一、第二学年）、剧场版、各活动（新的在前）、限定区域、愚人节，最后是没有分类的。

活动分组都显示活动编号和横幅（活动剧情的横幅，没有时用活动标志，都取自所选服务器的资源站）。搜索只在当前分页里找（分组名、活动编号、标题、话数、选择器）。当前这一话所在的分组默认展开，并滚到这一话；主线和特别剧情的分组都默认展开，其余点开才列出各话。对话框按 Material 3 做：窄屏（< 640px）是全屏对话框，顶部应用栏是关闭按钮和标题；宽屏是最宽 560px 的普通对话框，高度固定（`min(85vh, 56rem)`），切换分页不跳动。标题下依次是搜索框（填充式，40px）、主标签页、卡面和区域对话的分组方式（分段按钮），这几行都不滚动；只有下面的列表滚动。列表是平铺的 Material 列表：分组是可展开的列表项（活动带横幅和编号），展开后标题吸在列表顶部；剧集是两行列表项，当前这一话用列表的选中色（`secondary-container`）并标「当前」。列表项和标签页的焦点环画在元素内侧，不会被滚动区域裁掉。

列表来自所选服务器的 masterdata（`fetchMasterData(path, false, server)`：站点设置的服务器用缓存的那份，其他服务器直接取），只保留剧情库确实有的话：

```
<剧情库>/ripper.lock.json 的 episodes
```

剧情库地址是 `sseWebSources(server).library`，本地开发时同样经过 `NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` 的中转。清单里卡面写作 `first` / `second`，读进来时换成 `former` / `latter`。每个服务器每个类别只读一次（模块里缓存），读失败的下次再试。

| 类别 | 读的 masterdata |
|---|---|
| 活动 | `events.json`、`eventStories.json` |
| 主线 | `unitStories.json`、`unitProfiles.json` |
| 卡面 | `cards.json`、`cardEpisodes.json`、`gameCharacters.json`、`events.json`、`eventCards.json` |
| 特别 | `specialStories.json` |
| 区域对话 | `actionSets.json`、`areas.json`、`character2ds.json`、`events.json` |

## 代码

| 文件 | 内容 |
|---|---|
| `src/app/story-player/{page,client}.tsx` | 页面 |
| `src/components/story/useLive2DPlayer.ts` | 播放器的生命周期、状态与操作（悬浮窗和页面共用） |
| `src/components/story/Live2DStage.tsx` | 舞台（画面上的标记、加载卡片、暂停 / 缓冲、全屏工具栏）、`Live2DControls`、`Live2DFailureBanner` |
| `src/components/story/live2dRows.ts` | 节点与剧本行的对应 |
| `src/components/story-player/StoryPickerDialog.tsx` | 选剧情对话框 |
| `src/components/story-player/StoryScriptPanel.tsx` | 剧本栏 |
| `src/components/story-player/labels.ts` | 分组名与话数的显示 |
| `src/lib/storyPlayer/episodes.ts` | 选择器、剧情库清单、各类别的分组、`storyPlayerHref` |
| `src/lib/storyPlayer/script.ts` | 按所选服务器读剧本 |
| `src/hooks/useStoryCatalogs.ts` | 按类别加载列表 |

文案在各语言字典的 `page.storyPlayer.*`（播放器自己的文案沿用 `page.story.live2d.*`），侧栏与搜索的名字在 `layout.nav.items.storyPlayer`、`layout.groupPages.storyPlayer`，SEO 是 `SEO_PAGE_METADATA.story_player` 和 `seo-routes-data.json` 里的 `/story-player/`。

## 本地联调

与剧情阅读页相同（见 [story-live2d-player.md](story-live2d-player.md#本地联调)）：剧情库和 `ripper.lock.json` 都只允许 `https://pjsk.moe` 跨源读取，本地要跑 SekaiStoryExporter 的 `crates/sse-web/dev/serve.py` 中转，并在 `web/.env.local` 里设 `NEXT_PUBLIC_SSE_WEB_ASSET_PROXY`。改了播放器或页面后，至少各播一话活动、主线、卡面、特别剧情和区域对话，再换一个非日服的服务器播一次，看剧本是否跟着播放走。
