#!/usr/bin/env node
/**
 * 피규어 프롬프트 대량 생성기
 *
 * 카테고리 조합: 주제(100) x 스타일(10) = 1,000개
 * 출력: product-prompts.json (asset-pipeline.mjs 입력용)
 *
 * 사용법:
 *   node tools/generate-prompts.mjs                    # 전체 생성
 *   node tools/generate-prompts.mjs --dry-run           # 미리보기
 *   node tools/generate-prompts.mjs --max 50            # 최대 N개
 *   node tools/generate-prompts.mjs --theme knight      # 특정 주제만
 *   node tools/generate-prompts.mjs --style chibi       # 특정 스타일만
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}
const DRY_RUN = args.includes('--dry-run');
const MAX = Number(flag('max', '9999'));
const THEME_FILTER = flag('theme', '');
const STYLE_FILTER = flag('style', '');

// ═══════════════════════════════════════════════════════════
//  스타일 (10종) — 같은 주제의 3D 모델 질감/분위기
// ═══════════════════════════════════════════════════════════

const STYLES = [
  { id: 'chibi',       label: '2-head-tall super deformed chibi',                        kr: '치비' },
  { id: 'stylized',    label: '4-head-tall stylized cartoon',                            kr: '스타일라이즈드' },
  { id: 'realistic',   label: 'realistic detailed proportions',                          kr: '리얼리스틱' },
  { id: 'clay',        label: 'clay sculpt matte finish',                                kr: '클레이' },
  { id: 'vinyl',       label: 'glossy vinyl designer toy',                               kr: '바이닐토이' },
  { id: 'wooden',      label: 'hand-carved wooden folk art',                             kr: '우드카빙' },
  { id: 'pixel',       label: 'voxel pixel art low-poly blocky',                         kr: '복셀픽셀' },
  { id: 'plush',       label: 'soft plush stuffed toy fabric texture',                   kr: '플러시' },
  { id: 'mech',        label: 'mechanical articulated robot joints and armor plates',     kr: '메카닉' },
  { id: 'metallic',    label: 'polished metallic chrome finish reflective surface',        kr: '메탈릭' },
];

// ═══════════════════════════════════════════════════════════
//  주제 (100종)
// ═══════════════════════════════════════════════════════════

const THEMES = [
  // ── 멋짐/쿨 (15) ──
  { id: 'dark_knight',       label: 'dark fallen knight in cursed black spiked armor raising burning greatsword overhead, fierce glowing eyes',  cat: '쿨' },
  { id: 'dragon_slayer',     label: 'dragon slayer in scarred battle armor lunging forward with massive dragonbone blade, determined battle cry', cat: '쿨' },
  { id: 'shadow_assassin',   label: 'shadow assassin crouching in stealth pose dual wielding glowing daggers, cold focused eyes',                cat: '쿨' },
  { id: 'demon_hunter',      label: 'demon hunter aiming dual pistols with crimson coat billowing, intense smirk',                              cat: '쿨' },
  { id: 'samurai_ronin',     label: 'ronin samurai in iaido draw stance with straw hat and wind-swept haori, calm stoic expression',             cat: '쿨' },
  { id: 'cyber_ninja',       label: 'cyberpunk ninja mid-dash with neon visor and plasma katana trailing light, focused gaze',                   cat: '쿨' },
  { id: 'death_knight',      label: 'undead death knight standing dominant with frost-rune sword planted in ground, hollow menacing stare',      cat: '쿨' },
  { id: 'berserker',         label: 'rage berserker screaming mid-swing with chained battle axe over head, war paint and scars',                 cat: '쿨' },
  { id: 'blade_dancer',      label: 'blade dancer in elegant spin with twin swords and flowing silk ribbons, serene focused expression',         cat: '쿨' },
  { id: 'gunslinger',        label: 'gunslinger in confident swagger pose tipping hat with twin revolvers holstered, sly grin',                  cat: '쿨' },
  { id: 'mech_commander',    label: 'mech commander standing arms crossed in heavy power armor with shoulder cannon deployed, stern face',       cat: '쿨' },
  { id: 'pirate_king',       label: 'pirate king standing on barrel foot raised laughing with flintlock raised, wild confident grin',            cat: '쿨' },
  { id: 'war_dragon',        label: 'armored war dragon roaring with wings spread and spiked tail raised, fierce battle-scarred face',           cat: '쿨' },
  { id: 'blood_mage',        label: 'blood mage floating in meditation pose with crimson runes orbiting, eyes glowing red calm expression',      cat: '쿨' },
  { id: 'space_bounty',      label: 'bounty hunter landing from jetpack boost with energy lasso spinning, confident cocky smirk',                cat: '쿨' },

  // ── 섹시/매력 (12) ──
  { id: 'succubus',          label: 'succubus sitting cross-legged on throne with bat wings spread, playful wink and teasing smile',             cat: '섹시' },
  { id: 'vampire_queen',     label: 'vampire queen leaning on gothic pillar in corset dress, seductive half-smile showing fangs',                cat: '섹시' },
  { id: 'dark_elf',          label: 'dark elf sorceress casting spell with one hand on hip, confident alluring gaze silver hair flowing',        cat: '섹시' },
  { id: 'witch_queen',       label: 'witch queen sitting sideways on broom with crossed legs wide hat tilted, mysterious smirk',                 cat: '섹시' },
  { id: 'fox_spirit',        label: 'kitsune fox spirit in flowing kimono looking over shoulder with nine tails fanned, enchanting smile',       cat: '섹시' },
  { id: 'pirate_siren',      label: 'pirate siren reclining on treasure pile with mermaid tail curled, beckoning finger and sly gaze',           cat: '섹시' },
  { id: 'cyber_idol',        label: 'cyberpunk idol striking stage pose with holographic mic, energetic wink and peace sign',                    cat: '섹시' },
  { id: 'valkyrie',          label: 'valkyrie landing pose with winged armor spear planted and hair windswept, proud fierce expression',         cat: '섹시' },
  { id: 'snake_empress',     label: 'lamia snake empress coiled elegantly with golden crown, regal commanding gaze',                             cat: '섹시' },
  { id: 'ninja_kunoichi',    label: 'kunoichi in dynamic leap pose with kunai between fingers, sharp focused eyes',                              cat: '섹시' },
  { id: 'angel_fallen',      label: 'fallen angel kneeling with one black wing one white wing and cracked halo, melancholy beautiful expression',cat: '섹시' },
  { id: 'ice_queen',         label: 'ice queen on frozen throne with legs crossed holding frost scepter, cold elegant beauty',                   cat: '섹시' },

  // ── 귀여운/캐릭터 (15) ──
  { id: 'baby_dragon',       label: 'adorable baby dragon tumbling out of cracked egg with tiny wings flapping, excited wide eyes',              cat: '귀여움' },
  { id: 'cat_wizard',        label: 'chubby cat wizard yawning mid-spell with oversized hat falling over eyes, sleepy cute face',                cat: '귀여움' },
  { id: 'slime_smile',       label: 'bouncy slime blob mid-bounce with big sparkling eyes and huge happy smile, blushing cheeks',                cat: '귀여움' },
  { id: 'penguin_knight',    label: 'tiny penguin waddling in oversized knight armor dragging sword, determined pouty face',                     cat: '귀여움' },
  { id: 'mushroom_fairy',    label: 'mushroom fairy sitting on toadstool kicking tiny legs with glowing spores, gentle dreamy smile',            cat: '귀여움' },
  { id: 'bunny_mage',        label: 'fluffy bunny mage hopping with carrot staff sparkling, surprised round eyes and floppy ears bouncing',      cat: '귀여움' },
  { id: 'puppy_samurai',     label: 'shiba inu puppy sitting proudly in samurai armor with tiny katana, happy tongue out panting',               cat: '귀여움' },
  { id: 'baby_phoenix',      label: 'baby phoenix chick nesting in flames with fluffy fire feathers, curious head tilt',                        cat: '귀여움' },
  { id: 'hamster_bard',      label: 'hamster bard strumming tiny lute with cheeks stuffed full, content closed-eye smile',                      cat: '귀여움' },
  { id: 'panda_chef',        label: 'panda chef tossing dumpling in wok with chef hat tilted, proud satisfied grin',                             cat: '귀여움' },
  { id: 'kitten_pirate',     label: 'kitten pirate peeking out of treasure chest with eyepatch, mischievous wide grin',                         cat: '귀여움' },
  { id: 'baby_cerberus',     label: 'baby cerberus three-headed puppy all heads chasing one tail, playful chaotic joy',                          cat: '귀여움' },
  { id: 'duckling_knight',   label: 'duckling knight charging forward with eggshell helmet and twig lance, brave tiny battle face',              cat: '귀여움' },
  { id: 'corgi_king',        label: 'corgi king lounging on tiny throne with crown sliding off, smug royal yawn',                                cat: '귀여움' },
  { id: 'owl_baby',          label: 'baby owl perched on stack of books in graduation cap, wise wide-eyed surprised look',                      cat: '귀여움' },

  // ── 공포/다크 (12) ──
  { id: 'lich_king',         label: 'lich king on dark throne with rotting crown raising soul-jar staff, hollow malevolent grin',                 cat: '공포' },
  { id: 'wendigo',           label: 'wendigo hunched stalking forward with deer skull head and elongated claws, empty black eye sockets',        cat: '공포' },
  { id: 'plague_doctor',     label: 'plague doctor standing ominously holding lantern up with bird mask, tilted head eerie silence',              cat: '공포' },
  { id: 'headless_rider',    label: 'headless horseman galloping holding flaming jack-o-lantern head high, fire trailing behind',                cat: '공포' },
  { id: 'flesh_golem',       label: 'flesh golem lurching forward with arms reaching and chains rattling, stitched twisted expression',          cat: '공포' },
  { id: 'banshee',           label: 'banshee floating with mouth wide open in eternal scream and tattered robes swirling, anguished face',       cat: '공포' },
  { id: 'spider_queen',      label: 'spider queen drider perched with arachnid legs spread and venom dripping from fangs, predatory gaze',      cat: '공포' },
  { id: 'scarecrow',         label: 'living scarecrow in T-pose with stitched grin glowing pumpkin eyes and crows circling, frozen menace',      cat: '공포' },
  { id: 'bone_dragon',       label: 'skeletal bone dragon coiled with jaw open wide in silent roar, glowing green eye sockets',                  cat: '공포' },
  { id: 'shadow_wraith',     label: 'shadow wraith rising from pool of darkness with clawed hands extended, face of hollow despair',              cat: '공포' },
  { id: 'puppet_master',     label: 'puppet master sitting with fingers controlling strings to hanging marionettes, cracked porcelain smile',    cat: '공포' },
  { id: 'abomination',       label: 'eldritch abomination mass of eyes and tendrils reaching in all directions, incomprehensible cosmic horror', cat: '공포' },

  // ── 메카/로봇 (10) ──
  { id: 'gundam_hero',       label: 'heroic mecha in victory pose with beam saber raised and wing thrusters glowing, V-fin eyes flashing',      cat: '메카' },
  { id: 'steampunk_mech',    label: 'steampunk mech tipping brass top hat with gear-arm while steam vents, monocle glowing',                     cat: '메카' },
  { id: 'tank_mech',         label: 'heavy tank mech in firing stance with dual gatling arms spinning and missiles locked, targeting visor red',  cat: '메카' },
  { id: 'insect_mech',       label: 'insectoid mech in pounce-ready crouch with mantis blades raised, compound eyes glowing green',              cat: '메카' },
  { id: 'samurai_mech',      label: 'samurai mech in kendo stance with energy katana two-handed grip, kabuto horn glowing',                      cat: '메카' },
  { id: 'support_droid',     label: 'cute round support droid hovering with medical tool extended and happy emoji on display, cheerful beep pose',cat: '메카' },
  { id: 'battle_android',    label: 'combat android in combat ready stance with plasma cannon charged, one eye glowing red targeting',            cat: '메카' },
  { id: 'titan_golem',       label: 'ancient titan golem awakening from slumber with vines breaking and core reactor igniting, ancient calm face',cat: '메카' },
  { id: 'drone_swarm',       label: 'drone controller standing commanding with arms raised and swarm orbiting, holographic tactical display',    cat: '메카' },
  { id: 'retro_robot',       label: 'retro tin robot marching with arms swinging wind-up key turning and ray gun at hip, simple happy dial face', cat: '메카' },

  // ── 동물/자연 (12) ──
  { id: 'wolf_alpha',        label: 'alpha wolf howling on rock with battle scars and moonlit silhouette, intense primal eyes',                  cat: '동물' },
  { id: 'golden_eagle',      label: 'golden eagle diving with talons extended and wings swept back, fierce predator focus',                      cat: '동물' },
  { id: 'tiger_spirit',      label: 'mythical white tiger prowling with blue fire markings glowing, calm powerful gaze',                        cat: '동물' },
  { id: 'kraken_baby',       label: 'baby kraken playfully wrapping tentacles around treasure chest, curious happy expression',                  cat: '동물' },
  { id: 'dire_bear',         label: 'dire bear standing upright roaring with runic collar glowing, powerful territorial rage',                   cat: '동물' },
  { id: 'lion_king',         label: 'lion king sitting regal with magnificent mane and battle-worn crown, proud commanding gaze',                cat: '동물' },
  { id: 'serpent_dragon',    label: 'eastern serpent dragon coiled around jade orb with whiskers flowing, wise ancient eyes',                    cat: '동물' },
  { id: 'war_horse',         label: 'armored war horse rearing up with barding and plume flowing, fierce determined neigh',                      cat: '동물' },
  { id: 'frost_wolf',        label: 'frost wolf mid-stride with ice crystals forming in fur and frozen breath visible, cold piercing stare',     cat: '동물' },
  { id: 'hell_hound',        label: 'hell hound snarling with lava cracks glowing across body and flame dripping from jaws, furious',            cat: '동물' },
  { id: 'thunder_bird',      label: 'thunderbird soaring with wings spread wide and lightning arcing between feathers, electrified majesty',     cat: '동물' },
  { id: 'shadow_panther',    label: 'shadow panther stalking low with smoke trailing body and glowing purple eyes locked on prey, silent menace',cat: '동물' },

  // ── 신화/전설 (12) ──
  { id: 'anubis',            label: 'anubis standing judgement pose with golden scales in one hand staff in other, solemn divine authority',     cat: '신화' },
  { id: 'medusa',            label: 'medusa gorgon with snake hair hissing and hand outstretched to petrify, beautiful yet terrifying face',    cat: '신화' },
  { id: 'minotaur',          label: 'minotaur charging with head lowered horns first and great axe dragging sparks, enraged snorting',          cat: '신화' },
  { id: 'tengu',             label: 'tengu perched on branch in commanding pose with war fan open and black wings spread, proud fierce look',   cat: '신화' },
  { id: 'yokai_oni',         label: 'oni demon mid-stomp with kanabo club over shoulder and sake gourd in hand, laughing wild grin',            cat: '신화' },
  { id: 'grim_reaper',       label: 'grim reaper hovering with scythe across shoulders and hourglass draining, faceless void stare',            cat: '신화' },
  { id: 'centaur_archer',    label: 'centaur rearing back drawing ornate longbow to full draw, focused targeting squint',                       cat: '신화' },
  { id: 'griffin_mount',     label: 'royal griffin landing with talons forward eagle head screeching and lion tail whipping, majestic fury',     cat: '신화' },
  { id: 'fenrir',            label: 'fenrir breaking free with divine chains snapping and rune markings blazing, unstoppable primal rage',      cat: '신화' },
  { id: 'quetzalcoatl',      label: 'quetzalcoatl feathered serpent spiraling upward with rainbow plumage fanned, divine serene expression',    cat: '신화' },
  { id: 'sphinx',            label: 'sphinx lounging with paws crossed in riddle-telling pose, mysterious all-knowing smile',                   cat: '신화' },
  { id: 'jormungandr',       label: 'jormungandr world serpent coiled tight with ocean waves on scales and jaws agape, apocalyptic presence',   cat: '신화' },

  // ── 아이템/소품 (12) ──
  { id: 'demon_blade',       label: 'cursed demon sword with living eye on hilt pulsing dark energy on ornate weapon stand',                    cat: '아이템' },
  { id: 'holy_grail',        label: 'holy grail chalice radiating divine light beams with angelic engravings on altar',                         cat: '아이템' },
  { id: 'grimoire',          label: 'floating dark grimoire with chains rattling pages turning and arcane eye on cover',                        cat: '아이템' },
  { id: 'dragon_egg',        label: 'dragon egg in ornate nest with cracks pulsing magma light from within',                                   cat: '아이템' },
  { id: 'mech_core',         label: 'mech reactor core suspended with energy tubes pulsing and warning lights flashing',                        cat: '아이템' },
  { id: 'skull_throne',      label: 'miniature skull throne made of stacked bones with dark gems embedded in eye sockets',                      cat: '아이템' },
  { id: 'treasure_hoard',    label: 'overflowing treasure hoard pile of gold coins gems weapons and goblets spilling out',                      cat: '아이템' },
  { id: 'enchanted_armor',   label: 'haunted enchanted armor on stand with glowing runes and ghostly blue mist inside visor',                   cat: '아이템' },
  { id: 'spirit_lantern',    label: 'spirit lantern with trapped ghost face pressing against glass from inside glowing',                        cat: '아이템' },
  { id: 'alchemist_set',     label: 'alchemist workbench with bubbling colored flasks skull and mysterious ingredient jars',                    cat: '아이템' },
  { id: 'war_banner',        label: 'tattered war banner impaled in ground on broken spear among fallen weapons',                               cat: '아이템' },
  { id: 'music_box',         label: 'gothic music box open with tiny skeletal dancer spinning under moon-shaped lid',                            cat: '아이템' },
];

// ═══════════════════════════════════════════════════════════
//  프롬프트 생성
// ═══════════════════════════════════════════════════════════

const BASE_PROMPT = 'single character only, one figure, full body visible from head to toe, no cropping, isolated on pure white background, no environment, no floor shadow, centered composition, collectible figure, high quality, 3d render style, studio lighting, product photo';

function generateAll() {
  const prompts = [];

  for (const theme of THEMES) {
    if (THEME_FILTER && !theme.id.includes(THEME_FILTER)) continue;

    for (const style of STYLES) {
      if (STYLE_FILTER && !style.id.includes(STYLE_FILTER)) continue;

      const id = `fig_${theme.id}_${style.id}`;
      const prompt = `${style.label} ${theme.label}, ${BASE_PROMPT}`;
      const name = `${theme.id.replace(/_/g,' ')} (${style.kr})`;

      prompts.push({ id, prompt, name, category: theme.cat, theme: theme.id, style: style.id });
    }
  }

  return prompts.slice(0, MAX);
}

// ═══════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════

const prompts = generateAll();

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║  Figure Prompt Generator                          ║');
console.log('╚═══════════════════════════════════════════════════╝');
console.log(`   주제:    ${THEMES.length}종`);
console.log(`   스타일:  ${STYLES.length}종`);
console.log(`   총 조합: ${THEMES.length} x ${STYLES.length} = ${THEMES.length * STYLES.length}개`);
console.log(`   생성:    ${prompts.length}개\n`);

const byCategory = {};
for (const p of prompts) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
console.log('   카테고리별:');
for (const [cat, cnt] of Object.entries(byCategory).sort((a,b) => b[1] - a[1]))
  console.log(`     ${cat.padEnd(8)} ${cnt}개`);

const byStyle = {};
for (const p of prompts) byStyle[p.style] = (byStyle[p.style] || 0) + 1;
console.log('\n   스타일별:');
for (const [s, cnt] of Object.entries(byStyle)) {
  const st = STYLES.find(x => x.id === s);
  console.log(`     ${(st?.kr || s).padEnd(12)} ${cnt}개`);
}

console.log('\n   샘플:');
const step = Math.max(1, Math.floor(prompts.length / 5));
for (const i of [0, step, step*2, step*3, prompts.length-1]) {
  const s = prompts[i];
  if (!s) continue;
  console.log(`     ${s.id}`);
  console.log(`       ${s.prompt.slice(0, 100)}...`);
}

if (DRY_RUN) {
  console.log('\n   [dry-run] 파일 저장 안 함');
} else {
  const outPath = resolve(__dirname, 'product-prompts.json');
  await writeFile(outPath, JSON.stringify(prompts, null, 2), 'utf-8');
  console.log(`\n   저장: ${outPath}`);
  console.log(`   실행: node tools/asset-pipeline.mjs --phase 1`);
}
