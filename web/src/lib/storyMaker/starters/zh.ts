/**
 * Official Simplified Chinese (`zh`) showcase MoeSekai Script (`.msk`) starter story.
 *
 * Cast: Leo/need (Hoshino Ichika, Tenma Saki, Mochizuki Honami, Hinomori Shiho).
 * Graph: 13 nodes (1 start, 6 scenes, 2 choices, 1 condition, 3 endings), 51 beats.
 * Every BG, BGM, SE, Live2D model, motion, and facial clip is live-verified across JP/CN/EN.
 */
export const STARTER_STORY_ZH = `@story "放学后的星光副歌" region=cn id="starter_zh" author="Moesekai" summary="Leo/need 放学后写歌小剧场：包含四位成员 Live2D 舞台站位与联动表情、多场景与音乐切换、无声切幕、低代码变量与条件锁选项、合流场景与三重结局。"

@var harmony: number = 0 "默契度"
@var secret_chord: boolean = false "星光和弦"
@var encore_ready: boolean = false "安可准备"

@cast ichika "星乃一歌" model="v2_01ichika_casual" char=1
@cast saki "天马咲希" model="v2_02saki_casual" char=2
@cast honami "望月穗波" model="v2_03honami_casual" char=3
@cast shiho "日野森志步" model="v2_04shiho_casual" char=4

start @pos(48, 256) -> scene_classroom

scene scene_classroom "放学后的教室" @pos(368, 176) {
  bg set "bg_a000401"
  bgm play "bgm00045" vol=0.72
  place set "宫益坂女子学园 教室"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at right scale=1.05 facial="face_sparkling_01"
  ]
  cue se "se_pack00001/se00005" vol=0.65
  telop "放学后的星光副歌"
  talk ichika "下课铃响了呢。咲希，你从午休开始就一直盯着笔记本笑，是不是想到新歌的副歌了？" motion="w-normal01-tilthead" facial="face_smile_01" react(saki motion="w-cute01-glad" facial="face_sparkling_01")
  talk saki "欸嘿嘿，被一歌发现了！其实昨晚练习键盘的时候，脑海里突然蹦出一段超闪亮的旋律——你听听看！" motion="w-normal01-pose" facial="face_wink_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00046" vol=0.75
  stage enter honami at farLeft scale=1.05 motion="w-normal01-nod" facial="face_smile_01"
  stage enter shiho at farRight scale=1.05 motion="w-cool06-nod" facial="face_normal_01"
  talk honami "大家辛苦了！刚才在走廊就听见很温柔的琴声了，是咲希的新灵感吗？" motion="w-adult01-tilthead" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_01")
  talk shiho "离下周的演出只剩几天了，副歌衔接还差临门一脚。既然大家都在，今天放学后先去哪边整理灵感？" motion="w-cool02-pose" facial="face_normal_01" react(honami motion="w-normal01-nod" facial="face_smile_01") react(ichika motion="w-adult01-think" facial="face_normal_01")
} -> choice_afterschool

choice choice_afterschool "放学后的第一站" @pos(768, 224) {
  opt_studio: "直接去排练室，用乐器合奏试出新和弦！" [harmony += 2] -> scene_studio
  opt_cafe: "先去街角咖啡馆吃苹果派、顺便打磨歌词！" [harmony += 1] -> scene_cafe
}

scene scene_studio "排练室即兴合奏" @pos(1152, 0) {
  bg set "bg_a001901"
  bgm play "bgm00020" vol=0.72
  place set "排练工作室"
  transition fadeBlack 0.5
  cast set [
    honami at farLeft scale=1.05 facial="face_smile_01"
    ichika at left scale=1.05 facial="face_purpose_01"
    saki at right scale=1.05 facial="face_sparkling_01"
    shiho at farRight scale=1.05 facial="face_sharp_01"
  ]
  talk saki "好——乐器全员就位！穗波起拍，我们直接把刚想到的过渡段合一遍吧！三、二、一！" motion="w-happy11-guts" facial="face_sparkling_01" react(honami motion="w-normal01-nod" facial="face_smile_02") react(shiho motion="w-cool02-guts" facial="face_sharp_01")
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.25
  cue shake 0.3
  narration "吉他、贝斯与鼓点利落地重叠在一起。就在进入副歌的前一拍，咲希灵机一动，按下了一组清澈而意想不到的高音和弦。"
  set secret_chord = true
  talk shiho "……等等。咲希，刚才进副歌前那组和弦再弹一遍。意外地很有夜空展开的感觉，完全能接上我的贝斯线。" motion="w-cool10-forward" facial="face_bright_01" react(saki motion="w-normal01-glad" facial="face_sparkling_01") react(ichika motion="w-normal01-purpose" facial="face_sparkling_01")
  talk honami "真的耶！鼓点跟着轻落下来以后，整段副歌好像一下子亮起来了呢。" motion="w-adult02-glad" facial="face_sparkling_01" react(shiho motion="w-cool06-nod" facial="face_smile_02")
  stage pose saki motion="w-cute02-wink" facial="face_wink_01"
  talk ichika "那就叫它「星光和弦」吧！感觉大家的默契已经升到 {{harmony}} 了——趁夕阳还没落山，我们去学校天台吹吹风，顺便把副歌记下来吧！" motion="w-normal01-glad" facial="face_smile_02" react(saki motion="w-normal01-piece" facial="face_smile_03") react(honami facial="face_smile_01")
} -> scene_rooftop

scene scene_cafe "咖啡馆的歌词时间" @pos(1152, 448) {
  bg set "bg_a001401"
  bgm play "bgm00006" vol=0.72
  place set "街角咖啡馆"
  transition fadeBlack 0.5
  cast set [
    ichika at farLeft scale=1.05 facial="face_smile_01"
    honami at left scale=1.05 facial="face_sparkling_01"
    saki at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_normal_01"
  ]
  talk honami "哇，今天正好赶上刚出炉的肉桂苹果派……谢谢大家陪我顺路过来，光是闻到香气就觉得干劲满满了！" motion="w-cute01-glad" facial="face_sparkling_01" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_02")
  talk saki "欸嘿嘿，志步嘴上说着随便，刚才不是也盯着限定莓果苏打看了好久吗？来嘛来嘛，放松一下灵感才会上门！" motion="w-cute14-smug" facial="face_wink_01" react(shiho motion="w-cool13-sigh" facial="face_shy_01")
  talk shiho "……我只是在看菜单而已。不过一歌，你笔记本上那句「抬头望见同一片晚霞」的节奏，刚好能贴合咲希刚才那段旋律。" motion="w-cool02-tilthead" facial="face_lookaway_01" react(ichika motion="w-normal01-nod" facial="face_surprise_01") react(honami motion="w-normal01-nod" facial="face_smile_02")
  cue se "se_pack00001/se00091" vol=0.75
  stage move ichika to center dur=0.5 motion="w-normal01-glad" facial="face_sparkling_01"
  talk ichika "真的！把这句接在副歌开头，整首歌一下子就有了四个人并肩仰望天空的画面感……感觉我们的默契也涨到 {{harmony}} 了呢！" motion="w-normal01-purpose" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_smile_02") react(shiho facial="face_smile_01")
  talk saki "太棒了！那我去柜台结账顺便拿外带杯，大家先去学校天台占好位置看日落吧——我马上追上来！" motion="w-normal01-piece" facial="face_smile_03" react(ichika motion="w-normal01-nod" facial="face_smile_01")
  stage exit saki
  narration "伴着暖烘烘的肉桂香气与轻快的笑声，大家收起写满批注的歌词本，踏上了通往学校天台的楼梯。"
} -> scene_rooftop

scene scene_rooftop "夕阳下的天台" @pos(1568, 192) {
  bg set "bg_a000802"
  bgm play "bgm00024" vol=0.72
  place set "宫益坂女子学园 天台"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at center scale=1.05 facial="face_smile_02"
    honami at right scale=1.05 facial="face_smile_01"
  ]
  cue se "se_pack00001/se00064" vol=0.7
  talk saki "呼——天台的风好舒服！橘红色的晚霞把整座城市都染得暖洋洋的，感觉就像演出开场前的灯光一样！" motion="w-happy14-glad" facial="face_sparkling_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") react(honami facial="face_smile_02")
  stage enter shiho at farRight scale=1.05 motion="w-cool02-pose" facial="face_normal_01"
  stage move ichika to farLeft dur=0.45
  stage move saki to left dur=0.45
  stage move honami to right dur=0.45
  talk honami "微风吹过来的时候，大家一起笑、一起烦恼的日子，真的让人觉得无比珍贵呢。" motion="w-normal03-relief" facial="face_smile_02" react(shiho motion="w-cool06-nod" facial="face_smile_01") react(ichika facial="face_smile_01")
  talk shiho "虽然离正式演出还有不少细节要磨，但只要四个人这样齐心协力，总能找到属于我们的声音。" motion="w-cool06-nod" facial="face_smile_02" react(saki motion="w-cute01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
  talk ichika "嗯……我也这么觉得。咦？等等，大家口袋里的手机是不是——" motion="w-adult01-tilthead" facial="face_surprise_01" react(saki facial="face_surprise_01") react(honami facial="face_notice_01") react(shiho facial="face_surprise_01")
} -> scene_silence_cut

scene scene_silence_cut "晚风骤停的瞬间" @pos(1984, 208) {
  bg inherit
  bgm stop
  place inherit
  transition none 0.4
  cast inherit
  cue wait 0.4
  cue se "se_pack00001/se00092" vol=0.8
  cue flash white 0.35
  talk saki "哇！？刚才那道光——我们的『Untitled』竟然在夕阳里轻轻响起来了！" motion="w-normal01-purpose" facial="face_surprise_01" react(ichika motion="w-normal01-nod" facial="face_sparkling_01") react(honami facial="face_surprise_01") react(shiho motion="w-cool02-tilthead" facial="face_bright_01")
  talk ichika "好像连 SEKAI 都在呼应我们今天的心情呢。现在大家的默契度是 {{harmony}}——今天最后的尾声，要怎么收尾呢？" motion="w-normal01-nod" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
} -> choice_finale

choice choice_finale "今天的最后一个音符" @pos(2400, 224) {
  opt_sekai: "带着「星光和弦」按下『Untitled』，去教室的SEKAI安可！" if secret_chord == true [harmony += 2] -> scene_sekai_encore
  opt_rooftop_song: "就在夕阳天台，四个人轻声合唱完新副歌！" [harmony += 2] -> cond_ending
  opt_sweet_detour: "今天就先放松收工，顺路再去买点心边走边聊吧！" -> cond_ending
}

scene scene_sekai_encore "教室的SEKAI·星光安可" @pos(2784, 0) {
  bg set "bg_f000701"
  bgm play "bgm_area00001" vol=0.75
  place set "教室的SEKAI 星光天台"
  transition fadeWhite 0.6
  cast set [
    ichika at farLeft scale=1.05 facial="face_sparkling_01"
    saki at left scale=1.05 facial="face_sparkling_01"
    honami at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_bright_01"
  ]
  cue se "se_pack00001/se00091" vol=0.8
  telop "教室的SEKAI — 星光安可"
  talk ichika "好美……满天星海就在头顶闪耀着。感觉这片星空，把我们刚才在排练室找到的那组和弦也照亮了。" motion="w-adult01-lookuptilthead" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_sparkling_01") react(saki facial="face_smile_03")
  talk saki "嘿嘿，既然来到这里了，就给这片星空抢先试听我们的新副歌吧！星光和弦，准备——！" motion="w-happy11-guts" facial="face_wink_01" react(ichika motion="w-normal01-glad" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.3
  set harmony += 1, encore_ready = true
  talk shiho "……还不赖嘛。带着这份默契和这首副歌，下周的舞台，我们一定能唱进每个人心里。" motion="w-cool02-guts" facial="face_smile_03" react(honami motion="w-normal01-nod" facial="face_sparkling_01") react(saki motion="w-normal01-piece" facial="face_sparkling_01") react(ichika motion="w-normal01-nod" facial="face_smile_02")
  narration "在永不褪色的星光之下，四人的歌声与乐音交织回荡，化作 Leo/need 迈向下一场演出的璀璨序曲。"
} -> cond_ending

condition cond_ending "结局判定" @pos(3200, 224) {
  rule_starlight: if encore_ready == true "星光安可达成" -> end_starlight
  rule_bond: if harmony >= 3 "夕阳默契达成" -> end_sunset_bond
  else -> end_sweet_detour
}

end end_starlight "星光安可结局" subtitle="在教室的SEKAI满天星海下奏响了完美新副歌！（最终默契度：{{harmony}}）" @pos(3600, 16)
end end_sunset_bond "夕阳合声结局" subtitle="晚霞映照着四人的微笑，新歌的轮廓清晰成形！（最终默契度：{{harmony}}）" @pos(3600, 240)
end end_sweet_detour "甜蜜绕道结局" subtitle="用欢笑与甜点为今天画下轻松句点，明天继续并肩前行！（最终默契度：{{harmony}}）" @pos(3600, 464)
`;
