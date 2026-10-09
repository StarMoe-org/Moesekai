type SeoPageTranslation = {
    readonly title: string;
    readonly description: string;
    readonly keywords: readonly string[];
};

const BRAND_KEYWORDS = ["PJSK", "PJSK Wiki", "Project Sekai", "Project SEKAI", "PRSK", "世界計畫", "世界計畫 繽紛舞台", "プロセカ", "Moesekai"] as const;

function page(
    title: string,
    description: string,
    keywords: readonly string[],
): SeoPageTranslation {
    return {
        title,
        description,
        keywords: [...keywords, ...BRAND_KEYWORDS],
    };
}

export const ZH_TW_SEO_PAGE_METADATA = {
    about: page(
        "關於本站",
        "瞭解 Moesekai（原 Snowy SekaiViewer）的網站定位、資料來源與致謝名單。",
        ["關於本站", "資料來源", "致謝"],
    ),
    cards: page(
        "卡牌圖鑑",
        "瀏覽 Project SEKAI 全部卡牌，並依角色、稀有度、屬性、技能與所屬團體篩選。",
        ["卡牌", "卡牌圖鑑", "卡牌資料庫"],
    ),
    music: page(
        "歌曲圖鑑",
        "瀏覽 Project SEKAI 歌曲清單，檢視譜面難度、定數、作詞作曲與 MV 資訊。",
        ["歌曲", "歌曲圖鑑", "譜面", "歌曲 Meta"],
    ),
    lyrics: page(
        "歌詞資料庫",
        "瀏覽 Project SEKAI 已發布的歌曲歌詞，對照日文原文、簡體中文與英文翻譯。",
        ["歌詞", "歌曲歌詞", "歌詞翻譯"],
    ),
    soundtrack: page(
        "遊戲原聲帶",
        "收聽並瀏覽 Project SEKAI 遊戲原聲帶、背景音樂與相關音訊資源。",
        ["遊戲原聲帶", "背景音樂", "BGM", "OST"],
    ),
    music_meta: page(
        "歌曲 Meta",
        "檢視 Project SEKAI 歌曲效率、譜面定數與活動周回相關 Meta 資料。",
        ["歌曲 Meta", "效率排行", "譜面定數", "周回"],
    ),
    events: page(
        "活動圖鑑",
        "瀏覽 Project SEKAI 活動清單，檢視活動詳情、加成角色、活動歌曲與排名資料。",
        ["活動", "活動圖鑑", "活動排名"],
    ),
    information: page(
        "遊戲公告",
        "檢視 Project SEKAI JP 與 CN 的遊戲公告、活動預告、招募資訊與歌曲追加情報。",
        ["公告", "遊戲公告", "活動預告", "最新資訊"],
    ),
    gacha: page(
        "轉蛋資料庫",
        "瀏覽 Project SEKAI 轉蛋卡池，檢視開放時間、PU 卡牌與機率資訊。",
        ["轉蛋", "卡池", "Gacha", "PU 卡牌"],
    ),
    character: page(
        "角色圖鑑",
        "瀏覽 Project SEKAI 角色資料、團體資訊、生日與角色詳情。",
        ["角色", "角色圖鑑", "團體", "生日"],
    ),
    comic: page(
        "一格漫畫",
        "瀏覽 Project SEKAI 官方一格漫畫與中文翻譯。",
        ["漫畫", "一格漫畫", "官方漫畫"],
    ),
    costumes: page(
        "服裝圖鑑",
        "瀏覽 Project SEKAI 服裝圖鑑，並依角色、取得來源與服裝資訊篩選。",
        ["服裝", "服裝圖鑑", "衣裝"],
    ),
    exchanges: page(
        "交換所",
        "瀏覽 Project SEKAI 交換所與交換項目，檢視獎勵、所需道具與開放時間。",
        ["交換所", "交換獎勵", "交換項目"],
    ),
    manga: page(
        "官方四格漫畫",
        "瀏覽 Project SEKAI 官方四格漫畫與各話內容。",
        ["四格漫畫", "官方四格", "漫畫"],
    ),
    materials: page(
        "素材資料庫",
        "瀏覽 Project SEKAI 素材、持有物與 MySekai 素材資料。",
        ["持有物", "素材", "MySekai 素材"],
    ),
    honors: page(
        "稱號與成就",
        "瀏覽 Project SEKAI 稱號、成就與羈絆稱號資訊。",
        ["稱號", "成就", "羈絆稱號"],
    ),
    live: page(
        "虛擬演唱會資料庫",
        "瀏覽 Project SEKAI 虛擬演唱會、舉辦時間與獎勵資訊。",
        ["演唱會", "虛擬演唱會", "Virtual Live"],
    ),
    sticker: page(
        "貼圖表情",
        "瀏覽 Project SEKAI 貼圖、表情與角色貼圖資源。",
        ["貼圖", "表情", "Stamp"],
    ),
    mysekai: page(
        "MySekai 家具資料庫",
        "瀏覽 Project SEKAI MySekai 家具、擺設、素材與風味文字。",
        ["家具", "MySekai", "擺設", "MySekai 素材"],
    ),
    prediction: page(
        "活動預測",
        "檢視 Project SEKAI 活動預測、排名走勢與資料分析工具。",
        ["活動預測", "排名預測", "預測線"],
    ),
    prediction_next: page(
        "活動預測 Next",
        "全新 AkiYome v3.0.0 預測模型：依活動類型與 World Link 各期分組擬合歷史榜線，經滾動回測校準 P10–P90 區間，支援 World Link 獨立章節預測。",
        ["活動預測 Next", "AkiYome", "World Link預測"],
    ),
    prediction_planner: page(
        "衝榜規劃器",
        "依 Project SEKAI 每期活動各自的規則（World Link 章節、終章、疲勞槽、Auto 特殊措施等）與你的隊伍、時間預算，計算達成目標檔位所需的每日打歌時長、火數與體力。",
        ["衝榜規劃器", "衝榜規劃", "活動檔位", "火數計算", "體力計算", "World Link"],
    ),
    deck_recommend: page(
        "組隊推薦",
        "使用 Project SEKAI 組隊推薦工具，自動計算活動收益、分數與最佳隊伍。",
        ["組隊推薦", "隊伍推薦", "最佳隊伍"],
    ),
    deck_comparator: page(
        "隊伍比較",
        "比較 Project SEKAI 多人演唱會的 PT、分數與不同隊伍收益。",
        ["隊伍比較", "組隊比較", "收益比較"],
    ),
    chart_preview: page(
        "譜面預覽",
        "使用 MikuMikuWorld 風格的 3D 譜面預覽器檢視歌曲譜面，或載入自訂 SUS／BGM 網址。",
        ["譜面預覽", "3D 譜面", "SUS", "MikuMikuWorld"],
    ),
    chart_image: page(
        "譜面圖片預覽",
        "在瀏覽器中將 Project SEKAI 譜面渲染為可縮放的整曲譜面圖，並支援匯出 PNG。",
        ["譜面圖片", "譜面預覽", "SUS"],
    ),
    mysekai_preview: page(
        "烤森百景",
        "瀏覽 Project SEKAI MySekai 居家設計大賽作品、排行縮圖與 3D 預覽。",
        ["烤森百景", "百景排行", "MySekai 活動", "3D 預覽"],
    ),
    mysekai_preview_ranking: page(
        "MySekai 排行作品預覽",
        "預覽 Project SEKAI MySekai 居家設計大賽排行作品的 3D 房間配置。",
        ["MySekai", "百景排行", "排行作品", "3D 預覽"],
    ),
    mysekai_preview_scene: page(
        "MySekai 3D 預覽器",
        "透過 JP／CN UID、本機 JSON 檔案或公開 JSON 網址預覽 MySekai 房間配置。",
        ["MySekai", "UID", "房間配置", "JSON", "3D"],
    ),
    my_cards: page(
        "卡牌進度",
        "追蹤你的 Project SEKAI 卡牌收集進度、培育狀態與帳號卡牌資料。",
        ["卡牌進度", "卡牌收集", "帳號管理"],
    ),
    my_musics: page(
        "歌曲進度",
        "追蹤你的 Project SEKAI 歌曲遊玩、Clear、Full Combo 與 AP 進度。",
        ["歌曲進度", "歌曲遊玩", "FC", "AP"],
    ),
    my_materials: page(
        "資源庫存",
        "查詢你的 Project SEKAI 資源、素材庫存與帳號持有物資料。",
        ["資源查詢", "素材庫存", "帳號資源"],
    ),
    profile: page(
        "個人頁面",
        "管理 Moesekai 個人頁面、綁定帳號、公開 API 與 OAuth2 授權資料。",
        ["個人頁面", "帳號管理", "OAuth2"],
    ),
    score_control: page(
        "控分計算器",
        "使用 Project SEKAI 控分計算器規劃掛機、放置與目標分數路線。",
        ["控分計算", "掛機", "分數路線"],
    ),
    sticker_maker: page(
        "表情貼圖製作",
        "製作 Project SEKAI 風格的自訂貼圖、表情圖與角色圖片。",
        ["表情貼圖製作", "貼圖製作", "自訂貼圖"],
    ),
    realtime_ranking: page(
        "即時排行榜",
        "檢視 Project SEKAI 即時排名，支援 CN／JP／TW／KR／EN 伺服器切換與分數變化提示。",
        ["即時排行榜", "排名查詢", "分數變化"],
    ),
    realtime_ranking_next: page(
        "即時排行榜 Next",
        "全新改版的 Project SEKAI 即時排行榜，提供個人排名詳情、分數曲線、48 小時熱圖、時速與周回分析。",
        ["即時排行榜", "個人排名詳情", "分數曲線", "時速分析"],
    ),
    guess_jacket: page(
        "猜曲繪",
        "遊玩 Project SEKAI 猜曲繪小遊戲，根據歌曲封面猜出對應歌曲。",
        ["猜曲繪", "歌曲封面", "小遊戲"],
    ),
    guess_jacket_multiplayer: page(
        "猜曲繪連線對戰",
        "和朋友連線遊玩 Project SEKAI 猜曲繪對戰。",
        ["猜曲繪連線", "多人對戰", "歌曲封面"],
    ),
    guess_music: page(
        "猜歌曲",
        "遊玩 Project SEKAI 猜歌曲小遊戲，聽歌曲片段猜出曲名。每日挑戰可以衝排行榜，自由練習可以自訂難度。",
        ["猜歌曲", "聽歌猜曲", "每日挑戰", "小遊戲"],
    ),
    guess_who: page(
        "猜角色",
        "遊玩 Project SEKAI 猜角色小遊戲，根據線索猜出角色。",
        ["猜角色", "角色猜題", "小遊戲"],
    ),
    guess_who_multiplayer: page(
        "猜角色連線對戰",
        "和朋友連線遊玩 Project SEKAI 猜角色對戰。",
        ["猜角色連線", "多人對戰", "角色猜題"],
    ),
    goods_gacha: page(
        "周邊盲抽",
        "使用 Project SEKAI 周邊盲抽模擬器，規劃周邊商品的抽取體驗。",
        ["周邊盲抽", "周邊商品", "抽取模擬"],
    ),
    story: page(
        "劇情瀏覽",
        "瀏覽 Project SEKAI 主線、活動、卡牌、區域、自我介紹與特殊劇情。",
        ["劇情", "故事", "劇情翻譯"],
    ),
    story_unit: page(
        "主線劇情",
        "瀏覽 Project SEKAI 主線劇情與各團體的劇情章節。",
        ["主線劇情", "團體劇情", "Main Story"],
    ),
    story_event: page(
        "活動劇情",
        "瀏覽 Project SEKAI 活動劇情、章節與中文翻譯。",
        ["活動劇情", "Event Story", "劇情翻譯"],
    ),
    story_card: page(
        "卡牌劇情",
        "瀏覽 Project SEKAI 卡牌劇情前篇、後篇與中文翻譯。",
        ["卡牌劇情", "Card Story", "前後篇"],
    ),
    story_area: page(
        "區域對話",
        "瀏覽 Project SEKAI 區域對話、場景對話與 Area Talk。",
        ["區域對話", "Area Conversation", "Area Talk"],
    ),
    story_self: page(
        "自我介紹",
        "瀏覽 Project SEKAI 角色自我介紹、角色介紹與語音劇情。",
        ["自我介紹", "角色介紹", "Character Introduction"],
    ),
    story_special: page(
        "特殊劇情",
        "瀏覽 Project SEKAI 特殊劇情、週年劇情與限定故事。",
        ["特殊劇情", "Special Story", "週年劇情"],
    ),
    guides: page(
        "社群攻略",
        "瀏覽 PROJECT SEKAI 社群攻略、教學與實用指南。",
        ["攻略", "社群攻略", "Guide"],
    ),
    patreon: page(
        "支持我們",
        "支持 Moesekai 持續維護、更新資料與開發社群工具。",
        ["支持我們", "贊助", "Patreon"],
    ),
    asset_versions: page(
        "版本更新紀錄",
        "追蹤各伺服器 Project SEKAI 資源版本歷史，點擊版本檢視單一版本更新檔案明細。",
        ["版本更新", "更新紀錄", "資源版本", "Changelog"],
    ),
    privacy: page(
        "隱私權政策",
        "閱讀 Moesekai 隱私權政策，瞭解本機儲存、Cookie、廣告與第三方服務說明。",
        ["隱私權政策", "Cookie", "廣告"],
    ),
    terms: page(
        "服務條款",
        "閱讀 Moesekai 服務條款，瞭解網站性質、使用者行為、免責聲明與開源授權。",
        ["服務條款", "免責聲明", "開源授權"],
    ),
    breadcrumb_activity: page(
        "活動",
        "Moesekai 活動相關頁面的入口。",
        ["活動入口", "活動工具"],
    ),
    breadcrumb_community: page(
        "社群",
        "Moesekai 社群相關頁面的入口。",
        ["社群入口", "攻略"],
    ),
    breadcrumb_database: page(
        "資料庫",
        "Moesekai 資料庫頁面的入口。",
        ["資料庫入口", "圖鑑"],
    ),
    breadcrumb_personal: page(
        "個人",
        "Moesekai 個人資料與帳號相關頁面的入口。",
        ["個人入口", "帳號"],
    ),
    breadcrumb_story: page(
        "劇情",
        "Moesekai 劇情相關頁面的入口。",
        ["劇情入口", "故事"],
    ),
    breadcrumb_games: page(
        "遊戲",
        "Moesekai 遊戲與小遊戲頁面的入口。",
        ["遊戲入口", "小遊戲", "互動遊戲"],
    ),
    breadcrumb_tools: page(
        "工具",
        "Moesekai 實用工具頁面的入口。",
        ["工具入口", "實用工具"],
    ),
    asset_viewer: page(
        "資源瀏覽器",
        "瀏覽 Project SEKAI 各伺服器的靜態資源目錄，支援搜尋、預覽圖片與播放音訊檔案。",
        ["資源瀏覽器", "靜態資源", "資源下載", "音訊預覽"],
    ),
    blank: page(
        "空白素材頁",
        "Moesekai 空白素材展示頁。",
        ["空白頁", "素材頁"],
    ),
    guides_detail: page(
        "攻略詳情",
        "閱讀 PROJECT SEKAI 社群攻略的詳細內容。",
        ["攻略詳情", "社群攻略"],
    ),
    oauth2_connect: page(
        "OAuth2 綁定",
        "透過 OAuth2 將 Haruki 帳號與 Moesekai 綁定。",
        ["OAuth2 綁定", "帳號綁定"],
    ),
    oauth2_callback: page(
        "OAuth2 回呼",
        "處理 Moesekai OAuth2 授權回呼。",
        ["OAuth2 回呼", "授權回呼"],
    ),
    story_area_category: page(
        "區域對話",
        "瀏覽指定分類中的 Project SEKAI 區域對話。",
        ["區域對話", "Area Talk"],
    ),
    story_area_reader: page(
        "閱讀區域對話",
        "閱讀 Project SEKAI 區域對話內容。",
        ["閱讀區域對話", "Area Talk"],
    ),
    story_card_reader: page(
        "閱讀卡牌劇情",
        "閱讀 Project SEKAI 卡牌劇情內容。",
        ["閱讀卡牌劇情", "Card Story"],
    ),
    story_event_group: page(
        "活動劇情",
        "瀏覽指定 Project SEKAI 活動的劇情章節。",
        ["活動劇情", "劇情章節"],
    ),
    story_event_reader: page(
        "閱讀活動劇情",
        "閱讀 Project SEKAI 活動劇情內容。",
        ["閱讀活動劇情", "Event Story"],
    ),
    story_self_reader: page(
        "閱讀角色介紹",
        "閱讀 Project SEKAI 角色自我介紹內容。",
        ["閱讀角色介紹", "自我介紹"],
    ),
    story_special_reader: page(
        "閱讀特殊劇情",
        "閱讀 Project SEKAI 特殊劇情內容。",
        ["閱讀特殊劇情", "Special Story"],
    ),
    story_unit_group: page(
        "主線劇情",
        "瀏覽指定團體的 Project SEKAI 主線劇情章節。",
        ["主線劇情", "團體劇情"],
    ),
    story_unit_reader: page(
        "閱讀主線劇情",
        "閱讀 Project SEKAI 主線劇情內容。",
        ["閱讀主線劇情", "Main Story"],
    ),
} as const satisfies Record<string, SeoPageTranslation>;

export const ZH_TW_DYNAMIC_SEO_TEMPLATES = {
    guide: {
        title: "{title}",
        description: "閱讀 PROJECT SEKAI 社群攻略「{title}」，分類：{category}，標籤：{tags}",
        fallbackTitle: "攻略詳情",
        fallbackDescription: "閱讀 PROJECT SEKAI 社群攻略的詳細內容",
    },
    storyAreaCategory: {
        title: "{category} - 區域對話",
        description: "瀏覽 Project SEKAI 區域對話分類「{category}」，依場景查看收錄的 {count} 段角色對話與劇情內容。",
        fallbackTitle: "區域對話",
        fallbackDescription: "瀏覽 Project SEKAI 區域對話分類",
    },
    storyAreaReader: {
        title: "{area} - 區域對話",
        description: "閱讀 Project SEKAI 區域「{area}」的角色對話與完整場景文字；場景 ID：{scenarioId}。",
        fallbackTitle: "閱讀區域對話",
        fallbackDescription: "閱讀 Project SEKAI 區域對話內容",
    },
    storyCardReader: {
        title: "{card} - 卡牌劇情",
        description: "閱讀 Project SEKAI 卡牌「{card}」的前篇與後篇劇情，查看角色對話和完整故事文字。",
        fallbackTitle: "閱讀卡牌劇情",
        fallbackDescription: "閱讀 Project SEKAI 卡牌劇情內容",
    },
    storyEventGroup: {
        title: "{event} - 活動劇情",
        description: "瀏覽 Project SEKAI 活動「{event}」收錄的 {count} 個劇情章節，依話數閱讀活動故事。",
        fallbackTitle: "活動劇情",
        fallbackDescription: "瀏覽指定 Project SEKAI 活動的劇情章節",
    },
    storyEventReader: {
        title: "{episode} - {event}",
        description: "閱讀 Project SEKAI 活動「{event}」第 {episodeNo} 話「{episode}」的角色對話與完整劇情文字。",
        fallbackTitle: "閱讀活動劇情",
        fallbackDescription: "閱讀 Project SEKAI 活動劇情內容",
    },
    storySelfReader: {
        title: "{character} - 角色介紹",
        description: "閱讀 Project SEKAI 角色「{character}」的自我介紹、語音劇情與完整角色對話文字。",
        fallbackTitle: "閱讀角色介紹",
        fallbackDescription: "閱讀 Project SEKAI 角色自我介紹內容",
    },
    storySpecialReader: {
        title: "{title} - 特殊劇情",
        description: "閱讀 Project SEKAI 特殊劇情「{title}」收錄的全部 {count} 個章節與角色對話文字。",
        fallbackTitle: "閱讀特殊劇情",
        fallbackDescription: "閱讀 Project SEKAI 特殊劇情內容",
    },
    storyUnitGroup: {
        title: "{unit} - 主線劇情",
        description: "瀏覽 Project SEKAI 團體「{unit}」收錄的 {count} 個主線劇情章節，依順序閱讀團體故事。",
        fallbackTitle: "主線劇情",
        fallbackDescription: "瀏覽指定團體的 Project SEKAI 主線劇情章節",
    },
    storyUnitReader: {
        title: "{episode} - {unit}",
        description: "閱讀 Project SEKAI 團體「{unit}」主線劇情「{episode}」的角色對話與完整章節文字。",
        fallbackTitle: "閱讀主線劇情",
        fallbackDescription: "閱讀 Project SEKAI 主線劇情內容",
    },
} as const;

export const ZH_TW_DETAIL_FALLBACK_TITLES = {
    card: "卡牌詳情",
    character: "角色詳情",
    costume: "服裝詳情",
    event: "活動詳情",
    exchange: "交換項目詳情",
    gacha: "轉蛋詳情",
    live: "虛擬演唱會詳情",
    manga: "漫畫詳情",
    music: "歌曲詳情",
    lyrics: "歌詞詳情",
    mysekai: "家具詳情",
} as const;

export const ZH_TW_DETAIL_FALLBACK_DESCRIPTIONS = {
    card: "檢視 Project SEKAI（世界計畫 / PJSK）卡牌詳情、角色、稀有度與圖片資源",
    character: "檢視 Project SEKAI（世界計畫 / PJSK）角色資料、團體、生日與相關內容",
    costume: "檢視 Project SEKAI（世界計畫 / PJSK）服裝詳情、適用角色與取得方式",
    event: "檢視 Project SEKAI（世界計畫 / PJSK）活動詳情、時間、獎勵與相關資料",
    exchange: "檢視 Project SEKAI（世界計畫 / PJSK）交換項目詳情、獎勵、所需道具與開放時間",
    gacha: "檢視 Project SEKAI（世界計畫 / PJSK）轉蛋詳情、卡池時間、PU 卡牌與機率資訊",
    live: "檢視 Project SEKAI（世界計畫 / PJSK）虛擬演唱會詳情、時間與獎勵資訊",
    manga: "檢視 Project SEKAI（世界計畫 / PJSK）官方四格漫畫各話詳情",
    music: "檢視 Project SEKAI（世界計畫 / PJSK）歌曲詳情、譜面、作詞作曲與封面資源",
    lyrics: "檢視 Project SEKAI（世界計畫 / PJSK）歌曲歌詞、日文原文與已發布翻譯",
    mysekai: "檢視 Project SEKAI（世界計畫 / PJSK）MySekai 家具詳情、素材與風味文字",
} as const;

export const ZH_TW_DETAIL_SEO_TEMPLATES = {
    card: "查看 {character} 的 Project SEKAI（世界計畫 / PJSK）卡牌「{prefix}」，包含卡牌稀有度、屬性、技能、數值與高畫質卡面資源。",
    character: "查看 Project SEKAI（世界計畫 / PJSK）角色「{name}」的個人資料、所屬團體、相關卡牌、劇情與遊戲資料。",
    costume: "查看 Project SEKAI（世界計畫 / PJSK）服裝「{name}」的外觀、適用角色、配色與取得相關資訊。",
    event: "查看 Project SEKAI（世界計畫 / PJSK）活動「{name}」的舉辦時間、活動類型、獎勵、加成角色與相關劇情資料。",
    exchange: "Project SEKAI（世界計畫 / PJSK）交換項目：{name}{shopSuffix}",
    exchangeFallback: "Project SEKAI（世界計畫 / PJSK）交換項目詳情",
    gacha: "查看 Project SEKAI（世界計畫 / PJSK）轉蛋「{name}」的開放時間、招募類型、卡池內容、Pickup 卡牌與提供機率。",
    live: "查看 Project SEKAI（世界計畫 / PJSK）虛擬演唱會「{name}」的演出時間、出演角色、曲目與參與獎勵。",
    manga: "閱讀 Project SEKAI（世界計畫 / PJSK）官方四格漫畫「{title}」，查看本話標題與完整漫畫圖片。",
    music: "查看 Project SEKAI（世界計畫 / PJSK）歌曲「{title}」的難度與譜面資料、演唱版本和封面；作詞：{lyricist}，作曲：{composer}。",
    lyrics: "閱讀 Project SEKAI（世界計畫 / PJSK）歌曲「{title}」的日文歌詞，並對照已發布的簡體中文與英文翻譯。",
    mysekai: "查看 Project SEKAI（世界計畫 / PJSK）MySekai 家具「{name}」的外觀、製作素材與物品說明。{flavorSuffix}",
} as const;
