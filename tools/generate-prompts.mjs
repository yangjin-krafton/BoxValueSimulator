#!/usr/bin/env node
/**
 * 피규어 프롬프트 대량 생성기
 *
 * 카테고리 조합: 색상조합 x 주제 x 등신 → 전체 배리언트
 * 출력: product-prompts.json (asset-pipeline.mjs 입력용)
 *
 * 사용법:
 *   node tools/generate-prompts.mjs                    # 전체 생성
 *   node tools/generate-prompts.mjs --dry-run           # 미리보기 (파일 안 씀)
 *   node tools/generate-prompts.mjs --max 50            # 최대 N개
 *   node tools/generate-prompts.mjs --theme warrior     # 특정 주제만
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

// ═══════════════════════════════════════════════════════════
//  카테고리 정의
// ═══════════════════════════════════════════════════════════

/** 색상 조합 — 피규어의 메인 컬러 팔레트 */
const COLORS = [
  { id: 'red_gold',      label: 'red and gold',            kr: '레드 골드' },
  { id: 'blue_silver',   label: 'blue and silver',         kr: '블루 실버' },
  { id: 'black_purple',  label: 'black and purple',        kr: '블랙 퍼플' },
  { id: 'white_cyan',    label: 'white and cyan',          kr: '화이트 시안' },
  { id: 'green_brown',   label: 'green and brown',         kr: '그린 브라운' },
  { id: 'pink_white',    label: 'pink and white',          kr: '핑크 화이트' },
  { id: 'orange_black',  label: 'orange and black',        kr: '오렌지 블랙' },
  { id: 'gold_white',    label: 'golden and white',        kr: '골드 화이트' },
  { id: 'dark_red',      label: 'dark red and black',      kr: '다크 레드' },
  { id: 'pastel_multi',  label: 'pastel rainbow colors',   kr: '파스텔 레인보우' },
  { id: 'mono_gray',     label: 'monochrome gray',         kr: '모노 그레이' },
  { id: 'neon_green',    label: 'neon green and black',    kr: '네온 그린' },
];

/** 주제 — 피규어 캐릭터 종류 */
const THEMES = [
  // 판타지 캐릭터
  { id: 'knight',       label: 'knight warrior with sword and shield',     category: '판타지', kr: '기사' },
  { id: 'mage',         label: 'mage wizard with magic staff and robe',    category: '판타지', kr: '마법사' },
  { id: 'archer',       label: 'archer ranger with bow and quiver',        category: '판타지', kr: '궁수' },
  { id: 'assassin',     label: 'assassin rogue with dual daggers',         category: '판타지', kr: '암살자' },
  { id: 'paladin',      label: 'holy paladin with hammer and cape',        category: '판타지', kr: '팔라딘' },
  { id: 'necromancer',  label: 'dark necromancer with skull staff',        category: '판타지', kr: '네크로맨서' },
  { id: 'dragon_rider', label: 'dragon rider with small dragon companion', category: '판타지', kr: '드래곤 라이더' },
  { id: 'fairy',        label: 'fairy with butterfly wings and wand',      category: '판타지', kr: '요정' },

  // 사이파이
  { id: 'mech_pilot',   label: 'mech pilot in futuristic armor',          category: 'SF', kr: '메카 파일럿' },
  { id: 'space_marine', label: 'space marine with laser rifle',            category: 'SF', kr: '스페이스 마린' },
  { id: 'cyborg',       label: 'cyborg with mechanical arm and eye',       category: 'SF', kr: '사이보그' },
  { id: 'android',      label: 'android robot humanoid',                   category: 'SF', kr: '안드로이드' },

  // 동물/몬스터
  { id: 'cat_samurai',  label: 'cat samurai with katana in kimono',        category: '동물', kr: '고양이 사무라이' },
  { id: 'bear_warrior', label: 'bear warrior with battle axe',             category: '동물', kr: '곰 전사' },
  { id: 'fox_mage',     label: 'fox spirit mage with nine tails',          category: '동물', kr: '여우 마법사' },
  { id: 'dragon_baby',  label: 'baby dragon sitting with small wings',     category: '동물', kr: '아기 드래곤' },
  { id: 'slime',        label: 'cute slime monster with happy face',       category: '몬스터', kr: '슬라임' },
  { id: 'golem',        label: 'stone golem with glowing runes',           category: '몬스터', kr: '골렘' },
  { id: 'mushroom',     label: 'mushroom creature with tiny legs',         category: '몬스터', kr: '버섯 크리처' },
  { id: 'ghost_knight', label: 'ghost knight in ethereal armor',           category: '몬스터', kr: '유령 기사' },

  // 직업/일상
  { id: 'chef',         label: 'chef cook with frying pan and hat',        category: '직업', kr: '셰프' },
  { id: 'pirate',       label: 'pirate captain with hat and hook',         category: '직업', kr: '해적' },
  { id: 'ninja',        label: 'ninja in black outfit with shuriken',      category: '직업', kr: '닌자' },
  { id: 'samurai',      label: 'samurai in full armor with katana',        category: '직업', kr: '사무라이' },
  { id: 'witch',        label: 'witch with pointy hat and broom',          category: '직업', kr: '마녀' },
  { id: 'alchemist',    label: 'alchemist with potions and goggles',       category: '직업', kr: '연금술사' },
];

/** 등신 비율 — 피규어 스타일 */
const PROPORTIONS = [
  { id: '2head',  label: '2-head-tall super deformed chibi',   style: 'chibi',    kr: '2등신 치비' },
  { id: '3head',  label: '3-head-tall chibi',                  style: 'chibi',    kr: '3등신 치비' },
  { id: '5head',  label: '5-head-tall stylized',               style: 'stylized', kr: '5등신 스타일' },
];

// ═══════════════════════════════════════════════════════════
//  프롬프트 생성
// ═══════════════════════════════════════════════════════════

const BASE_PROMPT = 'collectible figure, full body, simple standing pose, solid white background, high quality, 3d render style, studio lighting, product photo';

function buildPrompt(color, theme, proportion) {
  return `${proportion.label} ${theme.label}, ${color.label} color scheme, ${BASE_PROMPT}`;
}

function buildId(color, theme, proportion) {
  return `fig_${theme.id}_${proportion.id}_${color.id}`;
}

function buildName(color, theme, proportion) {
  return `${theme.kr} ${proportion.kr} (${color.kr})`;
}

// ═══════════════════════════════════════════════════════════
//  조합 생성
// ═══════════════════════════════════════════════════════════

function generateAll() {
  const prompts = [];

  for (const theme of THEMES) {
    if (THEME_FILTER && !theme.id.includes(THEME_FILTER)) continue;

    for (const proportion of PROPORTIONS) {
      for (const color of COLORS) {
        prompts.push({
          id: buildId(color, theme, proportion),
          prompt: buildPrompt(color, theme, proportion),
          name: buildName(color, theme, proportion),
          category: theme.category,
          theme: theme.id,
          proportion: proportion.id,
          color: color.id,
        });
      }
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
console.log(`   색상:    ${COLORS.length}종`);
console.log(`   주제:    ${THEMES.length}종`);
console.log(`   등신:    ${PROPORTIONS.length}종`);
console.log(`   총 조합: ${COLORS.length} x ${THEMES.length} x ${PROPORTIONS.length} = ${COLORS.length * THEMES.length * PROPORTIONS.length}개`);
console.log(`   생성:    ${prompts.length}개\n`);

// 카테고리별 통계
const byCategory = {};
for (const p of prompts) {
  byCategory[p.category] = (byCategory[p.category] || 0) + 1;
}
console.log('   카테고리별:');
for (const [cat, cnt] of Object.entries(byCategory)) {
  console.log(`     ${cat}: ${cnt}개`);
}

// 샘플 출력
console.log('\n   샘플 프롬프트:');
const samples = [prompts[0], prompts[Math.floor(prompts.length / 2)], prompts[prompts.length - 1]];
for (const s of samples) {
  console.log(`     [${s.id}]`);
  console.log(`       ${s.prompt.slice(0, 100)}...`);
  console.log('');
}

if (DRY_RUN) {
  console.log('   [dry-run] 파일 저장 안 함');
} else {
  const outPath = resolve(__dirname, 'product-prompts.json');
  await writeFile(outPath, JSON.stringify(prompts, null, 2), 'utf-8');
  console.log(`   저장: ${outPath}`);
  console.log(`   다음 단계: node tools/asset-pipeline.mjs --phase 1`);
}
