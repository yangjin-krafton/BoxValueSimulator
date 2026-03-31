#!/usr/bin/env node
/**
 * GLB 모델 세팅 스크립트 — 다중 필터 + 500개 목표
 *
 * Internal-3D-Asset-Library에서 아래 필터를 순차 적용:
 *   1) 숫자 변형 제거 (Birthday0, Birthday1 → Birthday 대표 1개)
 *   2) 색상 변형 제거 (BottleBlack, BottleWhite → Bottle 대표 1개)
 *   3) 환경/지형/캐릭터 카테고리 제외 (Room, Road, Npc 등)
 *   4) 서브타입 다양성 샘플링 (FtrChair* 중 대표 N개)
 *   5) 카테고리 비례 배분으로 최종 500개
 *
 * 사용법:
 *   node tools/setup-models.mjs --dry-run     # 미리보기
 *   node tools/setup-models.mjs               # 실행 (기본 500개)
 *   node tools/setup-models.mjs --max 300     # 개수 변경
 */

import { readdir, copyFile, rm, mkdir, stat } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ─── 옵션 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}

const SOURCE_DIR = resolve(flag('source', 'D:/Weeks/Internal-3D-Asset-Library/src/asset/glb'));
const DEST_DIR   = resolve(__dirname, '../src/assets/models');
const DRY_RUN    = args.includes('--dry-run');
const MAX_MODELS = Number(flag('max', '500'));

// ─── 필터 1: 숫자 변형 제거 ────────────────────────────────
// "AccessoryGlassBirthday0.glb" → "AccessoryGlassBirthday"
function stripTrailingNumbers(name) {
  return name.replace(/\d+$/, '') || name;
}

// ─── 필터 2: 색상 접미사 제거 ───────────────────────────────
const COLOR_SUFFIXES = [
  'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink',
  'Gray', 'Grey', 'Brown', 'Orange', 'Purple', 'Gold', 'Silver',
  'Cyan', 'Beige', 'Navy', 'Ivory', 'Olive', 'Skin', 'Colorful',
];
const COLOR_RE = new RegExp(`(${COLOR_SUFFIXES.join('|')})$`);

function stripColor(name) {
  const stripped = name.replace(COLOR_RE, '');
  // 빈 문자열 방지 (이름 자체가 색상인 경우)
  return stripped.length >= 3 ? stripped : name;
}

// ─── 필터 3: 환경/지형/캐릭터 카테고리 제외 ────────────────
// 박스 개봉 게임에 어울리는 "아이템"만 남기기
const EXCLUDE_CATEGORIES = new Set([
  'Room',    // 방 레이아웃
  'Road',    // 도로
  'House',   // 집 건물
  'Fld',     // 지형 (필드)
  'Idr',     // 실내 구조물
  'Npc',     // NPC 캐릭터
  'Player',  // 플레이어 파츠
  'Strc',    // 구조물
  'River',   // 강
  'Cliff',   // 절벽
  'Fence',   // 울타리
  'Snow',    // 눈 지형
  'Wall',    // 벽
  'Bridge',  // 다리
  'Slope',   // 경사
  'Plaza',   // 광장
  'Base',    // 기반
  'Sea',     // 바다
  'Water',   // 물
  'Sun',     // 태양
  'Main',    // 시스템
  'Sub',     // 시스템
  'Sys',     // 시스템
  'Bbs',     // 게시판
  'Fall',    // 폭포/절벽
]);

// ─── 유틸 ───────────────────────────────────────────────────
function getCategory(filename) {
  const name = basename(filename, extname(filename));
  const match = name.match(/^([A-Z][a-z]+)/);
  return match ? match[1] : 'Other';
}

// 서브타입 추출: "FtrChairWood" → "FtrChair", "BagBackpackBasket" → "BagBackpack"
function getSubType(name) {
  // CamelCase에서 카테고리 + 첫 서브워드까지 추출
  const parts = name.replace(/([a-z])([A-Z])/g, '$1|$2').split('|');
  if (parts.length >= 2) return parts[0] + parts[1];
  return parts[0];
}

// ─── 메인 파이프라인 ────────────────────────────────────────
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  GLB Model Setup — 다중 필터 파이프라인             ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`   소스: ${SOURCE_DIR}`);
  console.log(`   대상: ${DEST_DIR}`);
  console.log(`   목표: ${MAX_MODELS}개`);
  if (DRY_RUN) console.log('   ⚠️  DRY RUN 모드');

  // ── Step 1: 소스 스캔 ──
  console.log('\n━━ Step 1: 소스 스캔 ━━');
  const allFiles = (await readdir(SOURCE_DIR))
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .sort();
  console.log(`   전체 GLB: ${allFiles.length}개`);

  // ── Step 2: 숫자 변형 그룹화 → 대표 선택 ──
  console.log('\n━━ Step 2: 숫자 변형 제거 ━━');
  const numGroups = new Map();
  for (const file of allFiles) {
    const name = basename(file, '.glb');
    const key = stripTrailingNumbers(name);
    if (!numGroups.has(key)) numGroups.set(key, []);
    numGroups.get(key).push(file);
  }
  // 각 그룹에서 0번 우선 선택
  const afterNumDedup = [];
  for (const [key, files] of numGroups) {
    const zero = files.find(f => basename(f, '.glb').endsWith('0'));
    afterNumDedup.push(zero || files[0]);
  }
  console.log(`   ${allFiles.length} → ${afterNumDedup.length}개 (${allFiles.length - afterNumDedup.length}개 숫자 변형 제거)`);

  // ── Step 3: 색상 변형 그룹화 → 대표 선택 ──
  console.log('\n━━ Step 3: 색상 변형 제거 ━━');
  const colorGroups = new Map();
  for (const file of afterNumDedup) {
    const name = basename(file, '.glb');
    const nameNoNum = stripTrailingNumbers(name);
    const key = stripColor(nameNoNum);
    if (!colorGroups.has(key)) colorGroups.set(key, []);
    colorGroups.get(key).push(file);
  }
  const afterColorDedup = [];
  for (const [key, files] of colorGroups) {
    afterColorDedup.push(files[0]); // 첫 번째 선택
  }
  console.log(`   ${afterNumDedup.length} → ${afterColorDedup.length}개 (${afterNumDedup.length - afterColorDedup.length}개 색상 변형 제거)`);

  // ── Step 4: 환경/지형/캐릭터 카테고리 제외 ──
  console.log('\n━━ Step 4: 카테고리 필터 ━━');
  const excluded = {};
  const afterCatFilter = afterColorDedup.filter(file => {
    const cat = getCategory(file);
    if (EXCLUDE_CATEGORIES.has(cat)) {
      excluded[cat] = (excluded[cat] || 0) + 1;
      return false;
    }
    return true;
  });
  console.log(`   ${afterColorDedup.length} → ${afterCatFilter.length}개`);
  console.log('   제외된 카테고리:');
  for (const [cat, count] of Object.entries(excluded).sort((a, b) => b[1] - a[1])) {
    console.log(`     ❌ ${cat}: ${count}개`);
  }

  // ── Step 5: 서브타입 다양성 분석 ──
  console.log('\n━━ Step 5: 서브타입 분석 ━━');
  const items = afterCatFilter.map(file => {
    const name = basename(file, '.glb');
    return {
      file,
      name,
      category: getCategory(file),
      subType: getSubType(stripTrailingNumbers(name)),
    };
  });

  // 카테고리별 현재 상태
  const catCounts = {};
  for (const item of items) {
    catCounts[item.category] = (catCounts[item.category] || 0) + 1;
  }
  console.log('   남은 카테고리 분포:');
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${cat}: ${count}개`);
  }

  // ── Step 6: 서브타입 기반 다양성 샘플링 → 최종 500개 ──
  console.log(`\n━━ Step 6: 다양성 샘플링 (${items.length} → ${MAX_MODELS}) ━━`);
  const finalSelection = diversitySample(items, MAX_MODELS);

  // 최종 카테고리 통계
  const finalCatCounts = {};
  for (const item of finalSelection) {
    finalCatCounts[item.category] = (finalCatCounts[item.category] || 0) + 1;
  }
  console.log('   최종 카테고리 분포:');
  for (const [cat, count] of Object.entries(finalCatCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ✅ ${cat}: ${count}개`);
  }

  // 서브타입 다양성 체크
  const subTypes = new Set(finalSelection.map(i => i.subType));
  console.log(`\n   총 ${finalSelection.length}개 모델, ${subTypes.size}개 서브타입`);

  // ── Step 7: 복사 또는 출력 ──
  if (!DRY_RUN) {
    console.log('\n━━ Step 7: 모델 복사 ━━');

    // 기존 모델 삭제
    try {
      const existing = await readdir(DEST_DIR);
      const glbFiles = existing.filter(f => f.toLowerCase().endsWith('.glb'));
      if (glbFiles.length > 0) {
        console.log(`   기존 ${glbFiles.length}개 GLB 삭제 중...`);
        for (const f of glbFiles) {
          await rm(resolve(DEST_DIR, f));
        }
      }
    } catch {
      await mkdir(DEST_DIR, { recursive: true });
    }

    let copied = 0;
    let totalSize = 0;
    for (let i = 0; i < finalSelection.length; i++) {
      const s = finalSelection[i];
      const src = resolve(SOURCE_DIR, s.file);
      const dst = resolve(DEST_DIR, s.file);
      try {
        await copyFile(src, dst);
        const info = await stat(dst);
        totalSize += info.size;
        copied++;
        if ((i + 1) % 50 === 0 || i === finalSelection.length - 1) {
          process.stdout.write(`\r   복사 중: ${copied}/${finalSelection.length} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
        }
      } catch (e) {
        console.log(`\n   ❌ ${s.file}: ${e.message}`);
      }
    }
    console.log(`\n   ✅ ${copied}개 복사 완료 (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('\n━━ [DRY RUN] 샘플 목록 (카테고리별 처음 5개) ━━');
    const byCat = {};
    for (const item of finalSelection) {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    }
    for (const [cat, items] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n   [${cat}] (${items.length}개)`);
      for (const item of items.slice(0, 5)) {
        console.log(`     ${item.file}  (서브: ${item.subType})`);
      }
      if (items.length > 5) console.log(`     ... 외 ${items.length - 5}개`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log(`║  완료! ${finalSelection.length}개 모델 준비됨`.padEnd(53) + '║');
  console.log('║  다음: node tools/scan-models.mjs --reset           ║');
  console.log('╚════════════════════════════════════════════════════╝');
}

/**
 * 다양성 기반 샘플링 — 카테고리 상한 + 서브타입 균등
 *
 * 전략:
 * 1. 서브타입별 그룹화 → 그룹 내 기본형(이름 짧은 것) 우선
 * 2. 카테고리별 상한: sqrt(원본수) 기반으로 큰 카테고리 억제
 * 3. 서브타입 다양성 최대화 (같은 서브타입에서 여러 개 뽑기 전에 다른 서브타입 먼저)
 * 4. 남은 슬롯을 라운드 로빈으로 배분
 */
function diversitySample(items, max) {
  // 서브타입별 그룹화
  const bySubType = new Map();
  for (const item of items) {
    if (!bySubType.has(item.subType)) bySubType.set(item.subType, []);
    bySubType.get(item.subType).push(item);
  }

  // 서브타입 내에서 이름 짧은 순 정렬 (기본형 선호)
  for (const [, group] of bySubType) {
    group.sort((a, b) => a.name.length - b.name.length);
  }

  const totalSubTypes = bySubType.size;
  console.log(`   서브타입 ${totalSubTypes}개 발견`);

  // 카테고리별 분류
  const byCat = new Map();
  for (const item of items) {
    if (!byCat.has(item.category)) byCat.set(item.category, []);
    byCat.get(item.category).push(item);
  }

  // ── 카테고리별 슬롯 할당 (sqrt 기반 상한) ──
  // 큰 카테고리는 억제하고 작은 카테고리는 보장
  const catSlots = new Map();
  const catSizes = [...byCat.entries()].map(([cat, arr]) => ({ cat, size: arr.length }));
  const totalRaw = items.length;

  // sqrt 가중치 계산
  let sumSqrt = 0;
  for (const { size } of catSizes) sumSqrt += Math.sqrt(size);
  for (const { cat, size } of catSizes) {
    const share = Math.max(1, Math.round((Math.sqrt(size) / sumSqrt) * max));
    catSlots.set(cat, share);
  }

  // 실제 가용 수로 상한 클램프 (1개짜리 카테고리에 3개 할당 방지)
  for (const [cat, slots] of catSlots) {
    const avail = byCat.get(cat)?.length || 0;
    catSlots.set(cat, Math.min(slots, avail));
  }

  // 슬롯 합이 max과 맞도록 조정
  let totalSlots = [...catSlots.values()].reduce((a, b) => a + b, 0);
  if (totalSlots > max) {
    // 가장 큰 카테고리부터 줄이기
    const sorted = [...catSlots.entries()].sort((a, b) => b[1] - a[1]);
    let excess = totalSlots - max;
    for (const [cat, slots] of sorted) {
      if (excess <= 0) break;
      const reduce = Math.min(excess, Math.max(0, slots - 1));
      catSlots.set(cat, slots - reduce);
      excess -= reduce;
    }
  } else if (totalSlots < max) {
    // 부족한 슬롯을 여유 있는 카테고리에 추가 배분
    let deficit = max - totalSlots;
    const sorted = [...catSlots.entries()]
      .map(([cat, slots]) => ({ cat, slots, avail: (byCat.get(cat)?.length || 0) - slots }))
      .filter(e => e.avail > 0)
      .sort((a, b) => b.avail - a.avail);
    for (const entry of sorted) {
      if (deficit <= 0) break;
      const add = Math.min(deficit, entry.avail);
      catSlots.set(entry.cat, catSlots.get(entry.cat) + add);
      deficit -= add;
    }
  }

  console.log('   카테고리별 슬롯 할당:');
  for (const [cat, slots] of [...catSlots.entries()].sort((a, b) => b[1] - a[1])) {
    const orig = byCat.get(cat)?.length || 0;
    console.log(`     ${cat}: ${slots}개 (원본 ${orig}개)`);
  }

  // ── 카테고리별 서브타입 기반 선택 ──
  const result = [];

  for (const [cat, slots] of catSlots) {
    const catItems = byCat.get(cat) || [];

    // 이 카테고리 내 서브타입별 그룹
    const catSubTypes = new Map();
    for (const item of catItems) {
      if (!catSubTypes.has(item.subType)) catSubTypes.set(item.subType, []);
      catSubTypes.get(item.subType).push(item);
    }

    // 서브타입 내 기본형 순 정렬
    for (const [, group] of catSubTypes) {
      group.sort((a, b) => a.name.length - b.name.length);
    }

    // 라운드 로빈: 서브타입마다 1개씩 돌아가며 선택
    const stQueues = [...catSubTypes.values()].map(g => [...g]);
    // 셔플해서 다양하게
    stQueues.sort(() => Math.random() - 0.5);

    let picked = 0;
    let round = 0;
    while (picked < slots) {
      let anyLeft = false;
      for (const queue of stQueues) {
        if (picked >= slots) break;
        if (round < queue.length) {
          result.push(queue[round]);
          picked++;
          anyLeft = true;
        }
      }
      if (!anyLeft) break;
      round++;
    }
  }

  return result.slice(0, max);
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
