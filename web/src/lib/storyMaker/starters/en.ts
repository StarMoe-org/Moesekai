/**
 * Official English (`en`) showcase MoeSekai Script (`.msk`) starter story.
 *
 * Cast: Leo/need (Hoshino Ichika, Tenma Saki, Mochizuki Honami, Hinomori Shiho).
 * Graph: 13 nodes (1 start, 6 scenes, 2 choices, 1 condition, 3 endings), 51 beats.
 * Every BG, BGM, SE, Live2D model, motion, and facial clip is live-verified across JP/CN/EN.
 */
export const STARTER_STORY_EN = `@story "After-School Starlight Chorus" region=en id="starter_en" author="Moesekai" summary="A Leo/need after-school songwriting episode showcasing 4-actor Live2D staging, co-star reactions, BGM scene cuts, variables, locked conditional choices, branch convergence, and 3 endings."

@var harmony: number = 0 "Harmony"
@var secret_chord: boolean = false "Starlight Chord"
@var encore_ready: boolean = false "Encore Ready"

@cast ichika "Hoshino Ichika" model="v2_01ichika_casual" char=1
@cast saki "Tenma Saki" model="v2_02saki_casual" char=2
@cast honami "Mochizuki Honami" model="v2_03honami_casual" char=3
@cast shiho "Hinomori Shiho" model="v2_04shiho_casual" char=4

start @pos(48, 256) -> scene_classroom

scene scene_classroom "After-School Classroom" @pos(368, 176) {
  bg set "bg_a000401"
  bgm play "bgm00045" vol=0.72
  place set "Miyamasuzaka Girls Academy - Classroom"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at right scale=1.05 facial="face_sparkling_01"
  ]
  cue se "se_pack00001/se00005" vol=0.65
  telop "After-School Starlight Chorus"
  talk ichika "There's the bell. Saki, you've been grinning at your notebook since lunch—did you come up with a new chorus?" motion="w-normal01-tilthead" facial="face_smile_01" react(saki motion="w-cute01-glad" facial="face_sparkling_01")
  talk saki "Hehe, you caught me! Last night at my keyboard, this super sparkly melody just popped into my head—here, take a listen!" motion="w-normal01-pose" facial="face_wink_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00046" vol=0.75
  stage enter honami at farLeft scale=1.05 motion="w-normal01-nod" facial="face_smile_01"
  stage enter shiho at farRight scale=1.05 motion="w-cool06-nod" facial="face_normal_01"
  talk honami "Good work today, you two! I could hear such a gentle melody from the hallway—is that a new phrase, Saki?" motion="w-adult01-tilthead" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_01")
  talk shiho "Our live show is next week, and the chorus transition still needs one final spark. Since we're all here, where should we start?" motion="w-cool02-pose" facial="face_normal_01" react(honami motion="w-normal01-nod" facial="face_smile_01") react(ichika motion="w-adult01-think" facial="face_normal_01")
} -> choice_afterschool

choice choice_afterschool "First Stop After School" @pos(768, 224) {
  opt_studio: "Head straight to the studio and jam out a new chord!" [harmony += 2] -> scene_studio
  opt_cafe: "Grab apple pie at the corner cafe and polish the lyrics!" [harmony += 1] -> scene_cafe
}

scene scene_studio "Studio Jam Session" @pos(1152, 0) {
  bg set "bg_a001901"
  bgm play "bgm00020" vol=0.72
  place set "Rehearsal Studio"
  transition fadeBlack 0.5
  cast set [
    honami at farLeft scale=1.05 facial="face_smile_01"
    ichika at left scale=1.05 facial="face_purpose_01"
    saki at right scale=1.05 facial="face_sparkling_01"
    shiho at farRight scale=1.05 facial="face_sharp_01"
  ]
  talk saki "Alright, instruments ready! Count us in, Honami—let's run that bridge together right now! Three, two, one!" motion="w-happy11-guts" facial="face_sparkling_01" react(honami motion="w-normal01-nod" facial="face_smile_02") react(shiho motion="w-cool02-guts" facial="face_sharp_01")
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.25
  cue shake 0.3
  narration "Guitar, bass, and drums lock tightly together. Just one beat before the chorus, Saki improvises a shimmering, crystalline chord that lights up the entire studio."
  set secret_chord = true
  talk shiho "...Hold on. Saki, play that chord right before the chorus again. It opens up like a starry sky—and it actually fits my bassline." motion="w-cool10-forward" facial="face_bright_01" react(saki motion="w-normal01-glad" facial="face_sparkling_01") react(ichika motion="w-normal01-purpose" facial="face_sparkling_01")
  talk honami "She's right! Once the drums ease into that chord, the whole chorus suddenly shines." motion="w-adult02-glad" facial="face_sparkling_01" react(shiho motion="w-cool06-nod" facial="face_smile_02")
  stage pose saki motion="w-cute02-wink" facial="face_wink_01"
  talk ichika "Let's call it the Starlight Chord! Our harmony is already up to {{harmony}}—let's head up to the school rooftop before sunset and jot it down!" motion="w-normal01-glad" facial="face_smile_02" react(saki motion="w-normal01-piece" facial="face_smile_03") react(honami facial="face_smile_01")
} -> scene_rooftop

scene scene_cafe "Cafe Lyric Break" @pos(1152, 448) {
  bg set "bg_a001401"
  bgm play "bgm00006" vol=0.72
  place set "Corner Cafe"
  transition fadeBlack 0.5
  cast set [
    ichika at farLeft scale=1.05 facial="face_smile_01"
    honami at left scale=1.05 facial="face_sparkling_01"
    saki at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_normal_01"
  ]
  talk honami "Oh, they just pulled fresh cinnamon apple pies from the oven! Thank you all for coming—just the aroma gives me a boost of energy." motion="w-cute01-glad" facial="face_sparkling_01" react(saki motion="w-normal01-glad" facial="face_smile_03") react(ichika facial="face_smile_02")
  talk saki "Hehe, Shiho acted so chill, yet I totally saw you eyeing the seasonal berry soda! Come on, great ideas love a good snack break!" motion="w-cute14-smug" facial="face_wink_01" react(shiho motion="w-cool13-sigh" facial="face_shy_01")
  talk shiho "...I was just reading the menu. More importantly, Ichika—that lyric about looking up at the same evening sky matches Saki's melody rhythm." motion="w-cool02-tilthead" facial="face_lookaway_01" react(ichika motion="w-normal01-nod" facial="face_surprise_01") react(honami motion="w-normal01-nod" facial="face_smile_02")
  cue se "se_pack00001/se00091" vol=0.75
  stage move ichika to center dur=0.5 motion="w-normal01-glad" facial="face_sparkling_01"
  talk ichika "Wait—it really does! Putting that line right at the chorus entrance brings all four of us into focus... Our harmony is already at {{harmony}}!" motion="w-normal01-purpose" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_smile_02") react(shiho facial="face_smile_01")
  talk saki "Woohoo! I'll grab the check and takeout cups—you three save us a spot on the school rooftop for sunset! I'll catch right up!" motion="w-normal01-piece" facial="face_smile_03" react(ichika motion="w-normal01-nod" facial="face_smile_01")
  stage exit saki
  narration "Warm cinnamon aroma trails behind their laughter as they tuck away the lyric notebook and climb up toward Miyamasuzaka's rooftop."
} -> scene_rooftop

scene scene_rooftop "Sunset on the Rooftop" @pos(1568, 192) {
  bg set "bg_a000802"
  bgm play "bgm00024" vol=0.72
  place set "Miyamasuzaka Girls Academy - Rooftop"
  transition fadeBlack 0.5
  cast set [
    ichika at left scale=1.05 facial="face_smile_01"
    saki at center scale=1.05 facial="face_smile_02"
    honami at right scale=1.05 facial="face_smile_01"
  ]
  cue se "se_pack00001/se00064" vol=0.7
  talk saki "Whew, this breeze feels amazing! The whole skyline is glowing gold—it looks just like stage lights right before a show!" motion="w-happy14-glad" facial="face_sparkling_01" react(ichika motion="w-normal01-nod" facial="face_smile_02") react(honami facial="face_smile_02")
  stage enter shiho at farRight scale=1.05 motion="w-cool02-pose" facial="face_normal_01"
  stage move ichika to farLeft dur=0.45
  stage move saki to left dur=0.45
  stage move honami to right dur=0.45
  talk honami "Days like this—laughing together, figuring out every bar side by side—really feel like something to treasure." motion="w-normal03-relief" facial="face_smile_02" react(shiho motion="w-cool06-nod" facial="face_smile_01") react(ichika facial="face_smile_01")
  talk shiho "We still have plenty to tighten up before next week, sure. But when the four of us push forward together, we always find our sound." motion="w-cool06-nod" facial="face_smile_02" react(saki motion="w-cute01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
  talk ichika "Yeah... I feel the exact same way. Wait—did everyone's phone just—" motion="w-adult01-tilthead" facial="face_surprise_01" react(saki facial="face_surprise_01") react(honami facial="face_notice_01") react(shiho facial="face_surprise_01")
} -> scene_silence_cut

scene scene_silence_cut "A Quiet Spark" @pos(1984, 208) {
  bg inherit
  bgm stop
  place inherit
  transition none 0.4
  cast inherit
  cue wait 0.4
  cue se "se_pack00001/se00092" vol=0.8
  cue flash white 0.35
  talk saki "Whoa?! That flash—our 'Untitled' just chimed in the middle of the sunset!" motion="w-normal01-purpose" facial="face_surprise_01" react(ichika motion="w-normal01-nod" facial="face_sparkling_01") react(honami facial="face_surprise_01") react(shiho motion="w-cool02-tilthead" facial="face_bright_01")
  talk ichika "It's like SEKAI is answering how we feel right now. Our harmony is at {{harmony}}—how should we wrap up today?" motion="w-normal01-nod" facial="face_smile_02" react(saki motion="w-normal01-glad" facial="face_smile_03") react(honami facial="face_smile_01")
} -> choice_finale

choice choice_finale "Today's Final Note" @pos(2400, 224) {
  opt_sekai: "Play 'Untitled' with the Starlight Chord for a SEKAI encore!" if secret_chord == true [harmony += 2] -> scene_sekai_encore
  opt_rooftop_song: "Hum the finished chorus together under the sunset!" [harmony += 2] -> cond_ending
  opt_sweet_detour: "Call it a day and take a sweet detour on the walk home!" -> cond_ending
}

scene scene_sekai_encore "School SEKAI - Starlight Encore" @pos(2784, 0) {
  bg set "bg_f000701"
  bgm play "bgm_area00001" vol=0.75
  place set "School SEKAI - Starry Rooftop"
  transition fadeWhite 0.6
  cast set [
    ichika at farLeft scale=1.05 facial="face_sparkling_01"
    saki at left scale=1.05 facial="face_sparkling_01"
    honami at right scale=1.05 facial="face_smile_02"
    shiho at farRight scale=1.05 facial="face_bright_01"
  ]
  cue se "se_pack00001/se00091" vol=0.8
  telop "School SEKAI — Starlight Encore"
  talk ichika "Look at that sky... A whole river of stars overhead. It feels like it's lighting up the chord we found back at the studio." motion="w-adult01-lookuptilthead" facial="face_sparkling_01" react(honami motion="w-adult02-glad" facial="face_sparkling_01") react(saki facial="face_smile_03")
  talk saki "Hehe, then let's give the stars an exclusive sneak peek! Starlight Chord—here we go!" motion="w-happy11-guts" facial="face_wink_01" react(ichika motion="w-normal01-glad" facial="face_smile_02") se="se_pack00001/se00124" seVol=0.8
  cue se "se_pack00001/se00123" vol=0.8
  cue flash white 0.3
  set harmony += 1, encore_ready = true
  talk shiho "...Not bad at all. With this chorus and our sync like this, next week's show is going to reach everyone." motion="w-cool02-guts" facial="face_smile_03" react(honami motion="w-normal01-nod" facial="face_sparkling_01") react(saki motion="w-normal01-piece" facial="face_sparkling_01") react(ichika motion="w-normal01-nod" facial="face_smile_02")
  narration "Beneath an endless sea of starlight, four voices and four instruments ring out as one—the bright prelude to Leo/need's next stage."
} -> cond_ending

condition cond_ending "Ending Check" @pos(3200, 224) {
  rule_starlight: if encore_ready == true "Starlight Encore" -> end_starlight
  rule_bond: if harmony >= 3 "Sunset Harmony" -> end_sunset_bond
  else -> end_sweet_detour
}

end end_starlight "Starlight Encore Ending" subtitle="Under the School SEKAI stars, Leo/need's new chorus came alive! (Final Harmony: {{harmony}})" @pos(3600, 16)
end end_sunset_bond "Sunset Harmony Ending" subtitle="Bathed in golden twilight, the four found the heart of their song! (Final Harmony: {{harmony}})" @pos(3600, 240)
end end_sweet_detour "Sweet Detour Ending" subtitle="Laughter and treats wrapped up the day—ready to shine tomorrow! (Final Harmony: {{harmony}})" @pos(3600, 464)
`;
