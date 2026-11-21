/**
 * Official Japanese (`ja`) showcase MoeSekai Script (`.msk`) starter story.
 *
 * Cast: Leo/need (星乃一歌, 天馬咲希, 望月穂波, 日野森志歩).
 * Graph: 13 nodes (1 start, 6 scenes, 2 choices, 1 condition, 3 endings), 51 beats.
 * Every BG, BGM, SE, Live2D model, motion, and facial clip is live-verified across JP/CN/EN.
 */
export const STARTER_STORY_JA = `@story "放課後の星屑コーラス" region=jp id="starter_ja" author="Moesekai" summary="Leo/needの放課後ソングライティング小劇場。4人のLive2D演出・連動リアクション・BGM停止カット・変数と条件付き選択肢・合流シーン・3種のマルチエンディングを収録しています。"

@var harmony: number = 0 "バンドの一体感"
@var secret_chord: boolean = false "星屑コード"
@var encore_ready: boolean = false "アンコール準備"

@cast ichika "星乃一歌" model="v2_01ichika_casual" char=1
@cast saki "天馬咲希" model="v2_02saki_casual" char=2
@cast honami "望月穂波" model="v2_03honami_casual" char=3
@cast shiho "日野森志歩" model="v2_04shiho_casual" char=4

start @pos(48, 256) -> scene_classroom

scene scene_classroom "放課後の教室" @pos(368, 176) {
  bg set "bg_a000401"
  bgm play "bgm00045" vol=0.72
  place set "宮益坂女子学園 教室"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at right scale=1.05 facial="face_sparkling_01"
  ]
  cue se "se_pack00001/se00005" vol=0.65
  telop "放課後の星屑コーラス"
  talk ichika "チャイム鳴ったね。咲希、お昼休みからずっとノート見て嬉しそうだったけど、新しいサビでも思いついた？" motion="w-normal01-tilthead" facial="face_smile_01" react(saki motion="w-cute01-glad" facial="face_sparkling_01")
  talk saki "えへへ、一ちゃんにはお見通しだったかぁ！昨日の夜キーボード触ってたら、キラキラしたフレーズが浮かんじゃって――ほら、聴いて聴いて！" motion="w-normal01-pose" facial="face_wink_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00046" vol=0.75
  stage enter honami at farLeft scale=1.05 motion="w-normal01-nod" facial="face_smile_01"
  stage enter shiho at farRight scale=1.05 motion="w-cool06-nod" facial="face_normal_01"
  talk honami "ふたりともお疲れさま！廊下まですごく優しいメロディが聴こえてきたけど、咲希ちゃんの新曲アイデアかな？" motion="w-adult01-tilthead" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_01")
  talk shiho "来週のライブまで時間もないし、サビ前のつなぎがまだ決まってない。せっかく４人揃ったんだ、今日はどこから始める？" motion="w-cool02-pose" facial="face_normal_01" react(honami motion="w-normal01-nod" facial="face_smile_01") react(ichika motion="w-adult01-think" facial="face_normal_01")
} -> choice_afterschool

choice choice_afterschool "放課後の作戦会議" @pos(768, 224) {
  opt_studio: "すぐスタジオに行って、音を重ねて試してみる！" [harmony += 2] -> scene_studio
  opt_cafe: "街角のカフェでアップルパイを食べつつ歌詞を練る！" [harmony += 1] -> scene_cafe
}

scene scene_studio "スタジオ即興セッション" @pos(1152, 0) {
  bg set "bg_a001901"
  bgm play "bgm00020" vol=0.72
  place set "レッスンスタジオ"
  transition fadeBlack 0.5
  cast set [
    honami at farLeft scale=1.05 facial="face_smile_01"
    ichika at left scale=1.05 facial="face_purpose_01"
    saki at right scale=1.05 facial="face_sparkling_01"
    shiho at farRight scale=1.05 facial="face_sharp_01"
  ]
  talk saki "よーし、セッティング完了！穂波ちゃんカウントお願い！サビ前のつなぎ、思いっきり合わせよっか！せーのっ！" motion="w-happy11-guts" facial="face_sparkling_01" react(honami motion="w-normal01-nod" facial="face_smile_02") react(shiho motion="w-cool02-guts" facial="face_sharp_01")
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.25
  cue shake 0.3
  narration "ギター、ベース、ドラムが軽快に重なる。サビに入るほんの一拍前、咲希がふと澄み渡る高音のコードを滑り込ませた。"
  set secret_chord = true
  talk shiho "……ちょっと待って。咲希、今のサビ前のコード、もう一回弾いて。視界が一気に広がる感じで――ベースラインにも綺麗に乗る。" motion="w-cool10-forward" facial="face_bright_01" react(saki motion="w-normal01-glad" facial="face_sparkling_01") react(ichika motion="w-normal01-purpose" facial="face_sparkling_01")
  talk honami "本当だね！ドラムがふっと抜けた瞬間、サビ全体が星みたいに輝いて聴こえたよ。" motion="w-adult02-glad" facial="face_sparkling_01" react(shiho motion="w-cool06-nod" facial="face_smile_02")
  stage pose saki motion="w-cute02-wink" facial="face_wink_01"
  talk ichika "『星屑コード』って呼びたくなっちゃうね！一体感も {{harmony}} まで上がった気がするし――日が暮れる前に学校の屋上で整理しよっか！" motion="w-normal01-glad" facial="face_smile_02" react(saki motion="w-normal01-piece" facial="face_smile_03") react(honami facial="face_smile_01")
} -> scene_rooftop

scene scene_cafe "カフェで歌詞づくり" @pos(1152, 448) {
  bg set "bg_a001401"
  bgm play "bgm00006" vol=0.72
  place set "街角のカフェ"
  transition fadeBlack 0.5
  cast set [
    ichika at farLeft scale=1.05 facial="face_smile_01"
    honami at left scale=1.05 facial="face_sparkling_01"
    saki at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_normal_01"
  ]
  talk honami "わぁ、ちょうど焼きたてのシナモンアップルパイがあるみたい……みんな付き合ってくれてありがとう！甘い香りだけで元気が出てきちゃう。" motion="w-cute01-glad" facial="face_sparkling_01" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_02")
  talk saki "えへへ、志歩ちゃんもクールな顔して限定のベリーソーダ気になってたでしょ？ほらほら、たまには息抜きも大事なんだから！" motion="w-cute14-smug" facial="face_wink_01" react(shiho motion="w-cool13-sigh" facial="face_shy_01")
  talk shiho "……別に、メニュー見てただけだし。それより一歌、ノートの『同じ夕空を見上げて』ってフレーズ、咲希のメロディのリズムにぴったりはまる。" motion="w-cool02-tilthead" facial="face_lookaway_01" react(ichika motion="w-normal01-nod" facial="face_surprise_01") react(honami motion="w-normal01-nod" facial="face_smile_02")
  cue se "se_pack00001/se00091" vol=0.75
  stage move ichika to center dur=0.5 motion="w-normal01-glad" facial="face_sparkling_01"
  talk ichika "あ、本当だ……！その一行をサビの頭に置いたら、４人で並んで空を見上げる景色が浮かんでくるよ。一体感も {{harmony}} に上がったみたい！" motion="w-normal01-purpose" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_smile_02") react(shiho facial="face_smile_01")
  talk saki "やったー！じゃあアタシがお会計とテイクアウト受け取ってくるね！みんな先に学校の屋上で夕焼けスポット確保しててー！" motion="w-normal01-piece" facial="face_smile_03" react(ichika motion="w-normal01-nod" facial="face_smile_01")
  stage exit saki
  narration "甘いシナモンの香りと弾む笑い声を背に、書き込んだばかりの歌詞ノートを抱えて、４人は学校の屋上へと向かった。"
} -> scene_rooftop

scene scene_rooftop "夕焼けの屋上" @pos(1568, 192) {
  bg set "bg_a000802"
  bgm play "bgm00024" vol=0.72
  place set "宮益坂女子学園 屋上"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at center scale=1.05 facial="face_smile_02"
    honami at right scale=1.05 facial="face_smile_01"
  ]
  cue se "se_pack00001/se00064" vol=0.7
  talk saki "ふぁーっ、夕方の風きもちいい！オレンジ色の空が街ぜんぶを照らしてて、なんだかライブ開演前の照明みたいだね！" motion="w-happy14-glad" facial="face_sparkling_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") react(honami facial="face_smile_02")
  stage enter shiho at farRight scale=1.05 motion="w-cool02-pose" facial="face_normal_01"
  stage move ichika to farLeft dur=0.45
  stage move saki to left dur=0.45
  stage move honami to right dur=0.45
  talk honami "こうして風に吹かれながら、みんなで笑い合って曲のことを考える時間って、本当に宝物みたいだね。" motion="w-normal03-relief" facial="face_smile_02" react(shiho motion="w-cool06-nod" facial="face_smile_01") react(ichika facial="face_smile_01")
  talk shiho "本番までに詰めなきゃいけないところはまだまだあるけど……４人で向き合えば、ちゃんと私達らしい音になる。" motion="w-cool06-nod" facial="face_smile_02" react(saki motion="w-cute01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
  talk ichika "うん……私もそう思うよ。あれ、みんな、ポケットのスマホが――" motion="w-adult01-tilthead" facial="face_surprise_01" react(saki facial="face_surprise_01") react(honami facial="face_notice_01") react(shiho facial="face_surprise_01")
} -> scene_silence_cut

scene scene_silence_cut "静寂のきらめき" @pos(1984, 208) {
  bg inherit
  bgm stop
  place inherit
  transition none 0.4
  cast inherit
  cue wait 0.4
  cue se "se_pack00001/se00092" vol=0.8
  cue flash white 0.35
  talk saki "わっ！？いまの光――夕焼けの中で『Untitled』がきらって鳴ったよ！" motion="w-normal01-purpose" facial="face_surprise_01" react(ichika motion="w-normal01-nod" facial="face_sparkling_01") react(honami facial="face_surprise_01") react(shiho motion="w-cool02-tilthead" facial="face_bright_01")
  talk ichika "セカイも今の私達の想いに応えてくれたのかな。今の一体感は {{harmony}} ――今日の締めくくり、どうしようか？" motion="w-normal01-nod" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
} -> choice_finale

choice choice_finale "今日の最後のワンフレーズ" @pos(2400, 224) {
  opt_sekai: "『星屑コード』を胸に『Untitled』を再生し、教室のセカイへ！" if secret_chord == true [harmony += 2] -> scene_sekai_encore
  opt_rooftop_song: "このまま夕焼けの屋上で、４人で新しいサビを口ずさむ！" [harmony += 2] -> cond_ending
  opt_sweet_detour: "今日はここまで！帰り道にスイーツを買ってのんびり帰ろう！" -> cond_ending
}

scene scene_sekai_encore "教室のセカイ・星屑アンコール" @pos(2784, 0) {
  bg set "bg_f000701"
  bgm play "bgm_area00001" vol=0.75
  place set "教室のセカイ 星空の屋上"
  transition fadeWhite 0.6
  cast set [
    ichika at farLeft scale=1.05 facial="face_sparkling_01"
    saki at left scale=1.05 facial="face_sparkling_01"
    honami at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_bright_01"
  ]
  cue se "se_pack00001/se00091" vol=0.8
  telop "教室のセカイ ―― 星屑アンコール"
  talk ichika "きれい……満天の星がすぐ近くで輝いてる。スタジオで見つけたあのコードまで、星空が照らしてくれてるみたい。" motion="w-adult01-lookuptilthead" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_sparkling_01") react(saki facial="face_smile_03")
  talk saki "えへへ、せっかく来たんだし、この星空に新曲のサビを先行公開しちゃおっか！星屑コード、いくよー！" motion="w-happy11-guts" facial="face_wink_01" react(ichika motion="w-normal01-glad" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.3
  set harmony += 1, encore_ready = true
  talk shiho "……悪くないね。このサビと今の息の合い方なら、来週のステージ、きっとみんなの心まで届く。" motion="w-cool02-guts" facial="face_smile_03" react(honami motion="w-normal01-nod" facial="face_sparkling_01") react(saki motion="w-normal01-piece" facial="face_sparkling_01") react(ichika motion="w-normal01-nod" facial="face_smile_02")
  narration "どこまでも広がる星海の下、４人の声と音がひとつに溶け合い、次のライブへの煌めく序曲となった。"
} -> cond_ending

condition cond_ending "エンディング分岐" @pos(3200, 224) {
  rule_starlight: if encore_ready == true "星屑アンコール" -> end_starlight
  rule_bond: if harmony >= 3 "夕焼けハーモニー" -> end_sunset_bond
  else -> end_sweet_detour
}

end end_starlight "星屑アンコールエンド" subtitle="教室のセカイの星空の下、最高の新曲サビが響き渡った！（最終一体感：{{harmony}}）" @pos(3600, 16)
end end_sunset_bond "夕焼けハーモニーエンド" subtitle="茜色の空に４人の笑顔が重なり、新曲の輪郭が見えてきた！（最終一体感：{{harmony}}）" @pos(3600, 240)
end end_sweet_detour "甘い寄り道エンド" subtitle="笑い声とスイーツでリフレッシュ！明日もまた４人で前へ！（最終一体感：{{harmony}}）" @pos(3600, 464)
`;
