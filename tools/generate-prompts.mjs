#!/usr/bin/env node
/**
 * 피규어 프롬프트 대량 생성기
 *
 * 카테고리 조합: 주제(동적) x 스타일(10)
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
//  주제 (아이템 제외 확장판)
//  미소녀 피규어 중심 구성: 일본 오타쿠 취향의 여캐/미소녀 테마 비중 유지
// ═══════════════════════════════════════════════════════════

const THEMES = [
  // ── 미소녀 (31) ──
  { id: 'school_idol',           label: 'anime school idol in dynamic concert pose with frilled stage outfit twin tails and sparkling star eyes, bright winning smile', cat: '미소녀' },
  { id: 'shrine_maiden',         label: 'elegant shrine maiden in flowing red hakama holding ofuda and ceremonial bow, gentle composed smile', cat: '미소녀' },
  { id: 'maid_cafe_star',        label: 'maid cafe heroine presenting parfait on silver tray with lace apron heart hairpin and playful wink', cat: '미소녀' },
  { id: 'catgirl_gamer',         label: 'catgirl streamer sitting on arcade cube with oversized hoodie headset and glowing controller, teasing grin', cat: '미소녀' },
  { id: 'fox_priestess',         label: 'nine-tailed fox priestess with ornate kimono sleeves and floating spirit flames, charming mysterious gaze', cat: '미소녀' },
  { id: 'oni_girl',              label: 'anime oni girl resting spiked kanabo on shoulder with tiny horns festival outfit and fangy smirk', cat: '미소녀' },
  { id: 'gyaru_sniper',          label: 'gyaru sniper in street-tech uniform with long rifle case stickers loose socks and bold confident pose', cat: '미소녀' },
  { id: 'nurse_android',         label: 'android nurse heroine with glossy medical visor capsule syringe and soft reassuring smile, futuristic idol appeal', cat: '미소녀' },
  { id: 'detective_ojousama',    label: 'ojousama detective adjusting monocle with plaid cape teacup and smug genius expression', cat: '미소녀' },
  { id: 'sailor_uniform_ace',    label: 'school heroine in sailor uniform and varsity jacket spinning baseball bat over shoulder, energetic confident smile', cat: '미소녀' },
  { id: 'winter_coat_heroine',   label: 'anime heroine in oversized winter coat scarf and earmuffs holding canned coffee close, shy blushing look', cat: '미소녀' },
  { id: 'bunny_suit_dealer',     label: 'casino bunny girl dealer leaning over poker table chip stack with glossy stockings and mischievous wink', cat: '미소녀' },
  { id: 'librarian_mage',        label: 'bookish mage girl balancing floating tomes around her with ribbon glasses and neat braid, focused soft smile', cat: '미소녀' },
  { id: 'alchemist_girl',        label: 'alchemist girl mixing glowing potion in glass flask with tool belt apron and curious bright eyes', cat: '미소녀' },
  { id: 'mecha_pilot_girl',      label: 'anime mecha pilot girl stepping from cockpit harness with plugsuit panels and confident commander stare', cat: '미소녀' },
  { id: 'gothic_lolita',         label: 'gothic lolita heroine holding parasol and plush rabbit with layered lace dress, porcelain doll elegance', cat: '미소녀' },
  { id: 'beach_heroine',         label: 'summer beach heroine in sporty jacket over swimsuit holding water gun and inflatable ring, bright playful laugh', cat: '미소녀' },
  { id: 'tracksuit_streamer',    label: 'anime streamer girl in loose tracksuit crouched beside energy drink cans and handheld camera, cheeky peace sign', cat: '미소녀' },
  { id: 'kimono_fireworks',      label: 'festival heroine in patterned yukata lifting fireworks sparkler with translucent fan and warm nostalgic smile', cat: '미소녀' },
  { id: 'cyber_hacker_girl',     label: 'cyber hacker girl sitting on neon server case with translucent jacket hologram keyboard and sly sideways glance', cat: '미소녀' },
  { id: 'tennis_ace',            label: 'anime tennis ace in mid-serve with fluttering skirt visor and intense star-player focus', cat: '미소녀' },
  { id: 'race_queen_future',     label: 'futuristic race queen waving checkered flag in aerodynamic bodysuit with glossy boots and sponsor decals', cat: '미소녀' },
  { id: 'cafe_barista_girl',     label: 'barista girl presenting latte art with rolled sleeves apron skirt and soft inviting smile, urban slice-of-life charm', cat: '미소녀' },
  { id: 'punk_guitarist',        label: 'punk guitarist heroine mid-riff with oversized amp chain accessories and fierce rebellious grin', cat: '미소녀' },
  { id: 'angelic_choir_girl',    label: 'choir girl with halo-shaped headpiece folded wings and hymn book, serene crystalline expression', cat: '미소녀' },
  { id: 'devilish_schoolgirl',   label: 'devilish schoolgirl flicking tail behind blazer with heart-tipped trident and cocky fangy smile', cat: '미소녀' },
  { id: 'shrine_archer',         label: 'sacred archer maiden drawing ornate yumi with fluttering ribbon charms and calm determined eyes', cat: '미소녀' },
  { id: 'office_secret_agent',   label: 'office lady secret agent sliding glasses down with hidden pistol in briefcase and composed killer smile', cat: '미소녀' },
  { id: 'phantom_thief_girl',    label: 'phantom thief girl leaping from rooftop with jewel in hand feathered mask and elegant grin', cat: '미소녀' },
  { id: 'samurai_princess',      label: 'samurai princess standing heroic with lacquered katana armor sleeves and noble anime heroine gaze', cat: '미소녀' },
  { id: 'arcade_mechanic_girl',  label: 'arcade mechanic girl kneeling beside retro cabinet with wrench cartridge belt and grease-smudged grin, lively fixer energy', cat: '미소녀' },
  

  // ── 섹시 (11) ──
  { id: 'succubus',              label: 'succubus sitting cross-legged on throne with bat wings spread, playful wink and teasing smile', cat: '섹시' },
  { id: 'vampire_queen',         label: 'vampire queen leaning on gothic pillar in corset dress, seductive half-smile showing fangs', cat: '섹시' },
  { id: 'dark_elf',              label: 'dark elf sorceress casting spell with one hand on hip, confident alluring gaze silver hair flowing', cat: '섹시' },
  { id: 'witch_queen',           label: 'witch queen sitting sideways on broom with crossed legs wide hat tilted, mysterious smirk', cat: '섹시' },
  { id: 'valkyrie',              label: 'valkyrie landing pose with winged armor spear planted and hair windswept, proud fierce expression', cat: '섹시' },
  { id: 'snake_empress',         label: 'lamia snake empress coiled elegantly with golden crown, regal commanding gaze', cat: '섹시' },
  { id: 'ninja_kunoichi',        label: 'kunoichi in dynamic leap pose with kunai between fingers, sharp focused eyes', cat: '섹시' },
  { id: 'fallen_angel',          label: 'fallen angel kneeling with one black wing one white wing and cracked halo, melancholy beautiful expression', cat: '섹시' },
  { id: 'ice_queen',             label: 'ice queen on frozen throne with legs crossed holding frost scepter, cold elegant beauty', cat: '섹시' },
  { id: 'pirate_siren',          label: 'pirate siren reclining on treasure pile with jeweled saber and windswept hair, beckoning gaze', cat: '섹시' },
  { id: 'cyber_diva',            label: 'cyber diva posing against neon speaker stack in glossy bodysuit with laser heels and commanding stage gaze', cat: '섹시' },

  // ── 마법소녀 (11) ──
  { id: 'magical_girl_star',     label: 'magical girl twirling star wand with layered ribbons heart brooch and bright transformation smile', cat: '마법소녀' },
  { id: 'moon_princess',         label: 'moon princess floating with crescent staff and shimmering twin buns, graceful silver-eyed serenity', cat: '마법소녀' },
  { id: 'card_captor',           label: 'card summoner girl surrounded by flying tarot seals and school uniform cape, excited determined pose', cat: '마법소녀' },
  { id: 'dream_healer',          label: 'healer girl hugging plush familiar with glowing staff and soft pastel aura, comforting expression', cat: '마법소녀' },
  { id: 'thunder_sorceress',     label: 'lightning sorceress heroine crackling with electric ribbons and sharp battle-ready stance, fierce anime eyes', cat: '마법소녀' },
  { id: 'sakura_spellblade',     label: 'sakura spellblade girl drawing petal-covered katana with magical sigils and elegant resolve', cat: '마법소녀' },
  { id: 'celestial_oracle',      label: 'celestial oracle girl holding astrolabe with star veil floating around her, mystical upward gaze', cat: '마법소녀' },
  { id: 'bunny_guardian',        label: 'bunny guardian magical girl with moon hammer rabbit ears and oversized boots, energetic heroic smile', cat: '마법소녀' },
  { id: 'mermaid_songstress',    label: 'mermaid magical idol singing into shell microphone with water ribbons spiraling, radiant smile', cat: '마법소녀' },
  { id: 'time_witch_apprentice', label: 'time witch apprentice balancing pocket watches and spell circles with oversized sleeves, clever grin', cat: '마법소녀' },
  { id: 'mirror_enchantress',    label: 'mirror enchantress magical girl stepping through shattered prism portals with jeweled rapier and poised smile', cat: '마법소녀' },

  // ── 쿨 (13) ──
  { id: 'dark_knight',           label: 'dark fallen knight in cursed black spiked armor raising burning greatsword overhead, fierce glowing eyes', cat: '쿨' },
  { id: 'dragon_slayer',         label: 'dragon slayer in scarred battle armor lunging forward with massive dragonbone blade, determined battle cry', cat: '쿨' },
  { id: 'shadow_assassin',       label: 'shadow assassin crouching in stealth pose dual wielding glowing daggers, cold focused eyes', cat: '쿨' },
  { id: 'demon_hunter',          label: 'demon hunter aiming dual pistols with crimson coat billowing, intense smirk', cat: '쿨' },
  { id: 'samurai_ronin',         label: 'ronin samurai in iaido draw stance with straw hat and wind-swept haori, calm stoic expression', cat: '쿨' },
  { id: 'cyber_ninja',           label: 'cyberpunk ninja mid-dash with neon visor and plasma katana trailing light, focused gaze', cat: '쿨' },
  { id: 'death_knight',          label: 'undead death knight standing dominant with frost-rune sword planted in ground, hollow menacing stare', cat: '쿨' },
  { id: 'berserker',             label: 'rage berserker screaming mid-swing with chained battle axe overhead, war paint and scars', cat: '쿨' },
  { id: 'gunslinger',            label: 'gunslinger in confident swagger pose tipping hat with twin revolvers holstered, sly grin', cat: '쿨' },
  { id: 'mech_commander',        label: 'mech commander standing arms crossed in heavy power armor with shoulder cannon deployed, stern face', cat: '쿨' },
  { id: 'pirate_king',           label: 'pirate king standing on barrel with flintlock raised and coat whipping in wind, wild confident grin', cat: '쿨' },
  { id: 'blood_mage',            label: 'blood mage floating in meditation pose with crimson runes orbiting, eyes glowing red calm expression', cat: '쿨' },
  { id: 'void_lancer',           label: 'void lancer bracing cosmic spear with torn cape and starfield armor seams glowing, silent unstoppable resolve', cat: '쿨' },

  // ── 공포 (8) ──
  { id: 'lich_king',             label: 'lich king on dark throne with rotting crown raising soul-jar staff, hollow malevolent grin', cat: '공포' },
  { id: 'wendigo',               label: 'wendigo hunched stalking forward with deer skull head and elongated claws, empty black eye sockets', cat: '공포' },
  { id: 'plague_doctor',         label: 'plague doctor standing ominously holding lantern up with bird mask, tilted head eerie silence', cat: '공포' },
  { id: 'headless_rider',        label: 'headless rider galloping while holding flaming jack-o-lantern head high, fire trailing behind', cat: '공포' },
  { id: 'flesh_golem',           label: 'flesh golem lurching forward with arms reaching and chains rattling, stitched twisted expression', cat: '공포' },
  { id: 'spider_queen',          label: 'spider queen drider perched with arachnid legs spread and venom dripping from fangs, predatory gaze', cat: '공포' },
  { id: 'shadow_wraith',         label: 'shadow wraith rising from pool of darkness with clawed hands extended, face of hollow despair', cat: '공포' },
  { id: 'abomination',           label: 'eldritch abomination mass of eyes and tendrils reaching in all directions, incomprehensible cosmic horror', cat: '공포' },

  // ── 메카 (11) ──
  { id: 'gundam_hero',           label: 'heroic mecha in victory pose with beam saber raised and wing thrusters glowing, V-fin eyes flashing', cat: '메카' },
  { id: 'steampunk_mech',        label: 'steampunk mech tipping brass top hat with gear-arm while steam vents, monocle glowing', cat: '메카' },
  { id: 'tank_mech',             label: 'heavy tank mech in firing stance with dual gatling arms spinning and missiles locked, targeting visor red', cat: '메카' },
  { id: 'insect_mech',           label: 'insectoid mech in pounce-ready crouch with mantis blades raised, compound eyes glowing green', cat: '메카' },
  { id: 'samurai_mech',          label: 'samurai mech in kendo stance with energy katana two-handed grip, kabuto horn glowing', cat: '메카' },
  { id: 'battle_android',        label: 'combat android in combat-ready stance with plasma cannon charged, one eye glowing red targeting', cat: '메카' },
  { id: 'titan_golem',           label: 'ancient titan golem awakening from slumber with vines breaking and core reactor igniting, ancient calm face', cat: '메카' },
  { id: 'drone_swarm',           label: 'drone controller standing commanding with arms raised and swarm orbiting, holographic tactical display', cat: '메카' },
  { id: 'kaiju_hunter',          label: 'kaiju hunter mech bracing anti-monster harpoon cannon against shoulder with warning lights blazing, grim focus', cat: '메카' },
  { id: 'assault_exosuit',       label: 'assault exosuit soldier dropping from orbit with heavy rifle magnetized to gauntlet, visor locked forward', cat: '메카' },
  { id: 'railgun_titan',         label: 'railgun titan mecha kneeling into recoil stance with city-scale cannon charged and reactor fins flaring blue', cat: '메카' },

  // ── 동물 (6) ──
  { id: 'wolf_alpha',            label: 'alpha wolf howling on rock with battle scars and moonlit silhouette, intense primal eyes', cat: '동물' },
  { id: 'tiger_spirit',          label: 'mythical white tiger prowling with blue fire markings glowing, calm powerful gaze', cat: '동물' },
  { id: 'dire_bear',             label: 'dire bear standing upright roaring with runic collar glowing, powerful territorial rage', cat: '동물' },
  { id: 'lion_king',             label: 'lion king sitting regal with magnificent mane and battle-worn crown, proud commanding gaze', cat: '동물' },
  { id: 'frost_wolf',            label: 'frost wolf mid-stride with ice crystals forming in fur and frozen breath visible, cold piercing stare', cat: '동물' },
  { id: 'shadow_panther',        label: 'shadow panther stalking low with smoke trailing body and glowing purple eyes locked on prey, silent menace', cat: '동물' },

  // ── 신화 (9) ──
  { id: 'anubis',                label: 'anubis standing judgement pose with golden scales in one hand staff in other, solemn divine authority', cat: '신화' },
  { id: 'minotaur',              label: 'minotaur charging with head lowered horns first and great axe dragging sparks, enraged snorting', cat: '신화' },
  { id: 'tengu',                 label: 'tengu perched on branch in commanding pose with war fan open and black wings spread, proud fierce look', cat: '신화' },
  { id: 'grim_reaper',           label: 'grim reaper hovering with scythe across shoulders and hourglass draining, faceless void stare', cat: '신화' },
  { id: 'centaur_archer',        label: 'centaur rearing back drawing ornate longbow to full draw, focused targeting squint', cat: '신화' },
  { id: 'griffin_mount',         label: 'royal griffin landing with talons forward eagle head screeching and lion tail whipping, majestic fury', cat: '신화' },
  { id: 'fenrir',                label: 'fenrir breaking free with divine chains snapping and rune markings blazing, unstoppable primal rage', cat: '신화' },
  { id: 'jormungandr',           label: 'jormungandr world serpent coiled tight with ocean waves on scales and jaws agape, apocalyptic presence', cat: '신화' },
  { id: 'kitsune_empress',       label: 'kitsune empress seated above floating spirit lanterns with nine tails fanned wide and regal enchanted gaze', cat: '신화' },
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
