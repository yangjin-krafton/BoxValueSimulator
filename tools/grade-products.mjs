#!/usr/bin/env node
/**
 * GLB 모델 + 카드 이미지 등급/가격 판정 스크립트.
 *
 * product-prompts.json의 원본 생성 프롬프트를 LM Studio에 전달하여
 * 각 상품의 등급과 가격을 판정.
 *
 * 사용법:
 *   node tools/grade-products.mjs                   # LM Studio 판정 (이어서 — 완료된 항목 스킵)
 *   node tools/grade-products.mjs --reset           # LM Studio 판정 (처음부터 전부 다시)
 *   node tools/grade-products.mjs --local           # 규칙 기반 로컬 판정 (LM Studio 불필요)
 *   node tools/grade-products.mjs --url http://localhost:1234
 *   node tools/grade-products.mjs --model qwen/qwen3.5-9b
 *   node tools/grade-products.mjs --batch 10
 *   node tools/grade-products.mjs --models-only
 *   node tools/grade-products.mjs --cards-only
 *
 * 출력: src/data/products_*.csv + products-manifest.json
 */

import { readdir, readFile, writeFile, unlink as unlinkFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ─── 설정 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const CONFIG = {
  lmUrl:       flag('url', 'http://100.66.10.225:1234'),
  lmModel:     flag('model', 'qwen/qwen3.5-9b'),
  batchSize:   Number(flag('batch', '10')),
  modelsDir:   resolve(__dirname, '../src/assets/models'),
  cardsDir:    resolve(__dirname, '../src/assets/cards'),
  promptsFile: resolve(__dirname, 'product-prompts.json'),
  dataDir:     resolve(__dirname, '../src/data'),
  perFile:     Number(flag('per-file', '1000')),
  modelsOnly:  hasFlag('models-only'),
  cardsOnly:   hasFlag('cards-only'),
  local:       hasFlag('local'),
  reset:       hasFlag('reset'),     // 처음부터 (기존 CSV 무시)
                                      // 기본(옵션 없음) = 이어서 (기존 CSV에서 완료된 항목 스킵)
};

// ─── 등급 정의 ──────────────────────────────────────────────
const GRADES = ['C', 'B', 'A', 'S', 'SS', 'SSS', 'SSSS', 'SSSSS'];

// ─── 공통 유틸 ──────────────────────────────────────────────
function parseFilename(filename, ext) {
  const name = filename.replace(new RegExp(`\\.${ext}$`), '');
  const parts = name.replace(/^fig_/, '').split('_');
  const style = parts.pop();
  const character = parts.join('_');
  return { name, character, style };
}

function humanize(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── 한글 매핑 ──────────────────────────────────────────────
const THEME_KR = {
  school_idol: '스쿨 아이돌', shrine_maiden: '무녀', maid_cafe_star: '메이드 카페 스타',
  catgirl_gamer: '캣걸 게이머', fox_priestess: '여우 무녀', oni_girl: '오니 소녀',
  gyaru_sniper: '갸루 스나이퍼', nurse_android: '간호 안드로이드', detective_ojousama: '탐정 아가씨',
  sailor_uniform_ace: '세일러 에이스', winter_coat_heroine: '겨울 코트 히로인',
  bunny_suit_dealer: '바니 딜러', librarian_mage: '사서 마법사', alchemist_girl: '연금술사 소녀',
  mecha_pilot_girl: '메카 파일럿', gothic_lolita: '고딕 로리타', beach_heroine: '비치 히로인',
  tracksuit_streamer: '트레이닝복 스트리머', kimono_fireworks: '기모노 불꽃놀이',
  cyber_hacker_girl: '사이버 해커', tennis_ace: '테니스 에이스', race_queen_future: '레이스퀸 퓨처',
  cafe_barista_girl: '카페 바리스타', punk_guitarist: '펑크 기타리스트',
  angelic_choir_girl: '천사 성가대', devilish_schoolgirl: '악마 여학생',
  shrine_archer: '신사 궁수', office_secret_agent: '오피스 비밀요원',
  phantom_thief_girl: '괴도 소녀', samurai_princess: '사무라이 공주',
  arcade_mechanic_girl: '아케이드 메카닉',
  succubus: '서큐버스', vampire_queen: '뱀파이어 퀸', dark_elf: '다크 엘프',
  witch_queen: '마녀 여왕', valkyrie: '발키리', snake_empress: '뱀 여제',
  ninja_kunoichi: '쿠노이치', fallen_angel: '타락 천사', ice_queen: '얼음 여왕',
  pirate_siren: '해적 세이렌', cyber_diva: '사이버 디바',
  magical_girl_star: '마법소녀 스타', moon_princess: '달의 공주', card_captor: '카드 캡터',
  dream_healer: '꿈의 치유사', thunder_sorceress: '번개 마법사', sakura_spellblade: '벚꽃 마검사',
  celestial_oracle: '천상의 신관', bunny_guardian: '토끼 수호자',
  mermaid_songstress: '인어 가수', time_witch_apprentice: '시간 마녀 견습',
  mirror_enchantress: '거울 마법사',
  dark_knight: '다크 나이트', dragon_slayer: '드래곤 슬레이어', shadow_assassin: '그림자 암살자',
  demon_hunter: '데몬 헌터', samurai_ronin: '사무라이 로닌', cyber_ninja: '사이버 닌자',
  death_knight: '죽음의 기사', berserker: '버서커', gunslinger: '건슬링어',
  mech_commander: '메카 사령관', pirate_king: '해적왕', blood_mage: '혈마법사',
  void_lancer: '허공의 창병',
  lich_king: '리치 킹', wendigo: '웬디고', plague_doctor: '역병 의사',
  headless_rider: '머리 없는 기사', flesh_golem: '육체 골렘', spider_queen: '거미 여왕',
  shadow_wraith: '그림자 망령', abomination: '어보미네이션',
  gundam_hero: '건담 히어로', steampunk_mech: '스팀펑크 메카', tank_mech: '탱크 메카',
  insect_mech: '곤충 메카', samurai_mech: '사무라이 메카', battle_android: '전투 안드로이드',
  titan_golem: '타이탄 골렘', drone_swarm: '드론 스웜', kaiju_hunter: '카이주 헌터',
  assault_exosuit: '돌격 외골격', railgun_titan: '레일건 타이탄',
  wolf_alpha: '알파 울프', tiger_spirit: '백호', dire_bear: '대곰',
  lion_king: '사자왕', frost_wolf: '서리 늑대', shadow_panther: '그림자 팬서',
  anubis: '아누비스', minotaur: '미노타우로스', tengu: '텐구',
  grim_reaper: '사신', centaur_archer: '켄타우로스 궁수', griffin_mount: '그리핀',
  fenrir: '펜리르', jormungandr: '요르문간드', kitsune_empress: '키츠네 여제',
};

const STYLE_KR = {
  chibi: '치비', stylized: '스타일라이즈드', realistic: '리얼리스틱',
  clay: '클레이', vinyl: '바이닐토이', wooden: '우드카빙',
  pixel: '복셀픽셀', plush: '플러시', mech: '메카닉', metallic: '메탈릭',
};

function koreanName(character, style) {
  const kr = THEME_KR[character] || humanize(character);
  const stKr = STYLE_KR[style] || humanize(style);
  return `${kr} (${stKr})`;
}

async function loadPrompts() {
  try {
    const raw = await readFile(CONFIG.promptsFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─── 파일 스캔 ──────────────────────────────────────────────
async function scanItems() {
  const items = [];

  if (!CONFIG.cardsOnly) {
    const modelFiles = await readdir(CONFIG.modelsDir).catch(() => []);
    for (const f of modelFiles.filter(f => f.endsWith('.glb'))) {
      const { name, character, style } = parseFilename(f, 'glb');
      items.push({
        id: name, filename: f, character, style,
        type: 'model', assetPath: `assets/models/${f}`,
      });
    }
  }

  if (!CONFIG.modelsOnly) {
    const cardFiles = await readdir(CONFIG.cardsDir).catch(() => []);
    for (const f of cardFiles.filter(f => f.endsWith('.webp'))) {
      const { name, character, style } = parseFilename(f, 'webp');
      items.push({
        id: `card_${name}`, filename: f, character, style,
        type: 'card', assetPath: `assets/cards/${f}`,
      });
    }
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════
//  LM Studio 모드 — 원본 프롬프트를 전달하여 AI 판정
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `당신은 오타쿠/게이머/만화·애니 팬을 위한 한국어 가챠 박스 게임의 피규어·카드 상품 전문가입니다.
이 게임의 타겟은 애니메이션, 게임, 만화, 영화를 사랑하는 수집가들입니다.

원본 생성 프롬프트를 보고 각 상품에 대해 다음을 결정하세요:

1. nameKr: 한글 상품명 (매력적이고 오타쿠 감성 넘치는 이름, 15자 이내)
   - 예: "별빛 스테이지 아이돌", "크롬하트 사무라이", "몽환의 캣걸 스트리머"
   - 스타일 반영: 치비→SD/꼬마, 메탈릭→크롬/강철, 리얼리스틱→리얼/생동, 플러시→뭉실/솜뭉치
   - 피규어(3D)와 카드(2D)의 느낌을 다르게: 피규어는 웅장하게, 카드는 일러스트 느낌으로

2. description: 한글 상품 설명 (약 100자)
   - 오타쿠/게이머가 읽고 "이거 갖고 싶다!"고 느낄 재치있는 설명
   - 캐릭터의 매력, 포즈, 분위기, 스토리를 담아서
   - 수집 가치와 소유욕을 자극하는 문체
   - 예시:
     "눈부신 스포트라이트 아래, 마이크를 움켜진 그녀의 윙크 한 방에 관객석이 무너진다. 한정판 스테이지 의상의 프릴 디테일까지 완벽 재현!"
     "어둠의 기사단을 이끄는 불멸의 전사. 크롬 도금 갑옷에 새겨진 룬 문양이 은은하게 빛나며, 칼끝에서 느껴지는 냉기가 소름을 돋게 한다."
     "방과 후 비밀 임무 시작! 교복 아래 숨긴 쌍권총과 날카로운 눈빛의 갭 모에가 매력 포인트. 책상 위에 올려두면 매일 설레는 하교길."

3. grade: ${GRADES.join(', ')} 중 하나
   - C=커먼, B=언커먼, A=레어, S=슈퍼레어, SS+=울트라레어
   - 가챠 확률 분포: C~15% B~25% A~30% S~18% SS~8% SSS~3% SSSS~0.8% SSSSS~0.2%

4. price: 한국 원화 (KRW)
   - 3D 피규어: 5,000 ~ 500,000
   - 2D 카드: 3,000 ~ 150,000

반드시 유효한 JSON만 출력하세요.`;

const GRADE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'grading_result',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:          { type: 'string' },
              nameKr:      { type: 'string' },
              description: { type: 'string' },
              grade:       { type: 'string', enum: GRADES },
              price:       { type: 'number' },
            },
            required: ['id', 'nameKr', 'description', 'grade', 'price'],
            additionalProperties: false,
          },
        },
      },
      required: ['results'],
      additionalProperties: false,
    },
  },
};

async function gradeBatch(batchItems, promptMap) {
  const descriptions = batchItems.map(it => {
    const promptKey = it.type === 'card'
      ? `fig_${it.character}_${it.style}`
      : it.id;
    const promptData = promptMap.get(promptKey);

    const typeLabel = it.type === 'card' ? '2D Art Card' : '3D Model Figure';
    const category = promptData?.category || 'unknown';
    const prompt = promptData?.prompt || `${humanize(it.character)} ${humanize(it.style)}`;

    return [
      `[${it.id}]`,
      `  type: ${typeLabel}`,
      `  category: ${category}`,
      `  character: ${humanize(it.character)}`,
      `  style: ${humanize(it.style)}`,
      `  prompt: "${prompt}"`,
    ].join('\n');
  }).join('\n\n');

  const userMsg = `Grade these ${batchItems.length} items:\n\n${descriptions}`;

  const res = await fetch(`${CONFIG.lmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.lmModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 4096,
      response_format: GRADE_SCHEMA,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response');

  // thinking 태그 제거 (qwen3 계열)
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed.results || parsed;
}

async function runLM(items) {
  const prompts = await loadPrompts();
  const promptMap = new Map(prompts.map(p => [p.id, p]));
  console.log(`[lm] prompts loaded: ${prompts.length}`);
  console.log(`[lm] server: ${CONFIG.lmUrl}`);
  console.log(`[lm] model: ${CONFIG.lmModel}`);
  console.log(`[lm] batch: ${CONFIG.batchSize}\n`);

  const allResults = [];
  const batches = [];
  for (let i = 0; i < items.length; i += CONFIG.batchSize) {
    batches.push(items.slice(i, i + CONFIG.batchSize));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const types = batch.map(b => b.type === 'card' ? 'C' : 'M').join('');
    process.stdout.write(`[${bi + 1}/${batches.length}] ${types} ... `);

    try {
      const results = await gradeBatch(batch, promptMap);
      allResults.push(...results);
      console.log(`OK ${results.map(r => r.grade).join(' ')}`);
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      for (const item of batch) {
        const fallbackPrice = item.type === 'card' ? 8000 : 15000;
        allResults.push({ id: item.id, grade: 'B', price: fallbackPrice });
      }
    }
  }

  return allResults;
}

// ═══════════════════════════════════════════════════════════════
//  로컬 모드 — 규칙 기반 (LM Studio 불필요)
// ═══════════════════════════════════════════════════════════════

const CATEGORY_SCORE = {
  '미소녀': 6, '섹시': 7, '마법소녀': 6, '쿨': 5,
  '메카': 5, '신화': 7, '공포': 4, '동물': 3,
};

const STYLE_TIER = {
  realistic: { score: 5, modelBase: 90000,  cardBase: 30000 },
  metallic:  { score: 5, modelBase: 80000,  cardBase: 28000 },
  mech:      { score: 4, modelBase: 70000,  cardBase: 22000 },
  stylized:  { score: 3, modelBase: 50000,  cardBase: 18000 },
  vinyl:     { score: 3, modelBase: 45000,  cardBase: 15000 },
  wooden:    { score: 2, modelBase: 35000,  cardBase: 12000 },
  clay:      { score: 2, modelBase: 28000,  cardBase: 10000 },
  plush:     { score: 1, modelBase: 22000,  cardBase: 8000 },
  chibi:     { score: 1, modelBase: 18000,  cardBase: 7000 },
  pixel:     { score: 1, modelBase: 15000,  cardBase: 5000 },
};

const GRADE_PRICE_MULT = {
  'C': 0.6, 'B': 0.85, 'A': 1.0, 'S': 1.4,
  'SS': 2.0, 'SSS': 3.0, 'SSSS': 5.0, 'SSSSS': 8.0,
};

function scoreToGrade(score) {
  if (score >= 12) return 'SSSSS';
  if (score >= 11) return 'SSSS';
  if (score >= 10) return 'SSS';
  if (score >= 9)  return 'SS';
  if (score >= 7)  return 'S';
  if (score >= 5)  return 'A';
  if (score >= 3)  return 'B';
  return 'C';
}

async function runLocal(items) {
  const prompts = await loadPrompts();
  const promptMap = new Map(prompts.map(p => [p.id, p]));
  console.log(`[local] prompts: ${prompts.length}\n`);

  return items.map(item => {
    const promptKey = item.type === 'card'
      ? `fig_${item.character}_${item.style}` : item.id;
    const prompt = promptMap.get(promptKey);
    const category = prompt?.category || '동물';
    const catScore = CATEGORY_SCORE[category] ?? 3;
    const styleTier = STYLE_TIER[item.style] || STYLE_TIER.clay;
    const noise = Math.random() * 1.5 - 0.5;
    const grade = scoreToGrade(catScore + styleTier.score + noise);
    const basePrice = item.type === 'card' ? styleTier.cardBase : styleTier.modelBase;
    const price = Math.round(basePrice * (GRADE_PRICE_MULT[grade] || 1) * (0.85 + Math.random() * 0.3) / 1000) * 1000;
    const maxP = item.type === 'card' ? 150000 : 500000;
    const minP = item.type === 'card' ? 3000 : 5000;
    const nameKr = koreanName(item.character, item.style);
    return { id: item.id, nameKr, description: '', grade, price: Math.max(minP, Math.min(maxP, price)), category };
  });
}

// ═══════════════════════════════════════════════════════════════
//  기존 CSV 로드 (resume용)
// ═══════════════════════════════════════════════════════════════

function splitCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

async function loadExistingProducts() {
  const existing = new Map();
  try {
    const manifestRaw = await readFile(resolve(CONFIG.dataDir, 'products-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    for (const csvRelPath of manifest.files || []) {
      const csvPath = resolve(CONFIG.dataDir, '..', csvRelPath);
      const text = await readFile(csvPath, 'utf8').catch(() => '');
      const lines = text.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) continue;
      const headers = splitCSVRow(lines[0]).map(h => h.trim());
      for (let li = 1; li < lines.length; li++) {
        const vals = splitCSVRow(lines[li]);
        const row = {};
        headers.forEach((h, i) => row[h] = (vals[i] ?? '').trim());
        existing.set(row.id, row);
      }
    }
  } catch { /* no existing data */ }
  return existing;
}

// ═══════════════════════════════════════════════════════════════
//  메인
// ═══════════════════════════════════════════════════════════════

async function main() {
  const mode = CONFIG.local ? 'local' : 'lm-studio';
  const resumeMode = !CONFIG.reset && !CONFIG.local;
  console.log(`--- grade-products (${mode}${resumeMode ? ', resume' : CONFIG.reset ? ', reset' : ''}) ---\n`);

  const items = await scanItems();
  const mc = items.filter(i => i.type === 'model').length;
  const cc = items.filter(i => i.type === 'card').length;
  console.log(`scan: model ${mc}, card ${cc}, total ${items.length}\n`);

  // resume: 기존 데이터 로드, 완료된 항목 분리
  let doneResults = [];
  let todoItems = items;

  if (resumeMode) {
    const existing = await loadExistingProducts();
    const doneIds = new Set();

    for (const [id, row] of existing) {
      // description이 있으면 LM Studio 처리 완료로 간주
      if (row.description && row.description.length > 0) {
        doneIds.add(id);
        doneResults.push({
          id,
          nameKr: row.name,
          description: row.description,
          grade: row.grade,
          price: Number(row.price) || 10000,
          category: row.category || '',
        });
      }
    }

    todoItems = items.filter(it => !doneIds.has(it.id));
    console.log(`resume: ${doneIds.size} done, ${todoItems.length} remaining\n`);

    if (todoItems.length === 0) {
      console.log('all items already processed. use --reset to redo.');
    }
  }

  // 미처리 항목 판정
  let newResults = [];
  if (todoItems.length > 0) {
    newResults = CONFIG.local
      ? await runLocal(todoItems)
      : await runLM(todoItems);
  }

  const allResults = [...doneResults, ...newResults];

  // 결과 → products 변환
  const itemMap = new Map(items.map(it => [it.id, it]));
  const products = allResults.map(r => {
    const item = itemMap.get(r.id);
    if (!item) return null;

    const price = Math.round(r.price / 1000) * 1000;
    const maxP = item.type === 'card' ? 150000 : 500000;
    const minP = item.type === 'card' ? 3000 : 5000;

    // 한글명: LM Studio 결과 우선, 없으면 매핑 테이블, 최종 폴백 humanize
    const nameKr = r.nameKr || koreanName(item.character, item.style);
    const description = r.description || '';

    const product = {
      id: r.id,
      name: nameKr,
      style: STYLE_KR[item.style] || humanize(item.style),
      grade: r.grade,
      price: Math.max(minP, Math.min(maxP, price)),
      description,
    };

    if (r.category) product.category = r.category;

    if (item.type === 'card') {
      product.type = 'card';
      product.imagePath = item.assetPath;
      product.modelPath = '';
    } else {
      product.type = 'model';
      product.modelPath = item.assetPath;
    }

    return product;
  }).filter(Boolean);

  // 통계
  const ms = {}, cs = {};
  for (const p of products) {
    const b = p.type === 'card' ? cs : ms;
    b[p.grade] = (b[p.grade] || 0) + 1;
  }

  console.log('\n--- grade distribution ---');
  console.log('  [model]');
  for (const g of GRADES) if (ms[g]) console.log(`    ${g}: ${ms[g]}`);
  console.log('  [card]');
  for (const g of GRADES) if (cs[g]) console.log(`    ${g}: ${cs[g]}`);

  // ─── CSV 출력 ─────────────────────────────────────────────
  const CSV_HEADER = 'id,name,style,type,grade,price,description,modelPath,imagePath';

  function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function toCSVRow(p) {
    return [
      p.id,
      csvEscape(p.name),
      csvEscape(p.style),
      p.type || 'model',
      p.grade,
      p.price,
      csvEscape(p.description || ''),
      p.modelPath || '',
      p.imagePath || '',
    ].join(',');
  }

  // 기존 products_*.csv 삭제
  const existingFiles = await readdir(CONFIG.dataDir).catch(() => []);
  for (const f of existingFiles) {
    if (f.match(/^products_\d+\.csv$/)) {
      await unlinkFile(resolve(CONFIG.dataDir, f));
    }
  }

  // 1000개씩 분할하여 CSV 파일 생성
  const csvFiles = [];
  for (let i = 0; i < products.length; i += CONFIG.perFile) {
    const chunk = products.slice(i, i + CONFIG.perFile);
    const fileNum = String(Math.floor(i / CONFIG.perFile) + 1).padStart(2, '0');
    const filename = `products_${fileNum}.csv`;
    const csvContent = [CSV_HEADER, ...chunk.map(toCSVRow)].join('\n');
    await writeFile(resolve(CONFIG.dataDir, filename), csvContent, 'utf8');
    csvFiles.push(`data/${filename}`);
    console.log(`  ${filename}: ${chunk.length} items`);
  }

  // 매니페스트 생성
  const manifest = {
    files: csvFiles,
    totalProducts: products.length,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(
    resolve(CONFIG.dataDir, 'products-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  const tm = products.filter(p => (p.type || 'model') !== 'card').length;
  const tc = products.filter(p => p.type === 'card').length;
  console.log(`\nsaved: ${csvFiles.length} CSV + manifest`);
  console.log(`  model ${tm} + card ${tc} = total ${products.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
