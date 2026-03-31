/**
 * 10개 상자 세트 생성 (v3 — products.json 기반).
 *
 * 생성 순서:
 *  1. 세트 타입 결정
 *  2. 타워 수 결정
 *  3. 타워별 역할 결정
 *  4. 각 타워 층 수 결정 (총 10개)
 *  5. 각 슬롯의 가격 밴드 결정
 *  6. 가격 범위에 맞는 상품 선택 (PRODUCTS에서)
 *  7. 슬롯별 등급 확률표, 히든/쿠폰 확률 부여
 */

import { PRODUCTS } from '../data/products.js';
import { pickSetType } from '../data/setTypes.js';
import { pickTowerRole } from '../data/towerRoles.js';
import { PRICE_BANDS, getBand, bandToPrice } from '../data/priceBands.js';
import { getGradeTable } from '../data/gradeTables.js';

const BOX_COUNT = 10;

/**
 * @param {import('./RuleEngine.js').RuleEngine} [ruleEngine]
 * @returns {{ setType, towers: Array, boxes: Array }}
 */
export function generateBoxSet(ruleEngine = null) {
  // 1. 세트 타입
  const setType = pickSetType();

  // 2. 타워 수
  const [minT, maxT] = setType.towerCount;
  const towerCount = minT + Math.floor(Math.random() * (maxT - minT + 1));

  // 3. 타워별 역할
  const towerDefs = [];
  for (let t = 0; t < towerCount; t++) {
    towerDefs.push({
      index: t,
      role: pickTowerRole(setType.towerRoleWeights),
      boxCount: 0,
    });
  }

  // 4. 10개 박스를 타워에 분배
  distributeTowers(towerDefs, BOX_COUNT);

  // 5~7. 각 슬롯 생성
  const boxes = [];
  let globalIndex = 0;

  for (const tower of towerDefs) {
    const role = tower.role;
    const maxDepth = tower.boxCount - 1;

    for (let depth = 0; depth < tower.boxCount; depth++) {
      // 5. 가격 밴드
      const [bandMin, bandMax] = role.priceBandRange;
      const depthShift = depth * role.depthPriceBandShift;
      const biasShift = setType.priceBandBias * 0.5;
      const bandIndex = bandMin + (bandMax - bandMin) * (depth / Math.max(1, maxDepth)) + depthShift * 0.3 + biasShift;
      const band = getBand(bandIndex);

      // 가격에 약간의 노이즈
      const noise = 0.9 + Math.random() * 0.2;
      let price = bandToPrice(band, noise);

      // RuleEngine 가격 보정
      if (ruleEngine) {
        const ctx = { price, bandIndex, towerRole: role.id, depth, boxOpenedCount: 0 };
        ruleEngine.apply('box:priceModify', ctx);
        price = ctx.price;
      }

      // 6. 상품 선택 (가격 범위 기반)
      const product = pickProduct(band.baseValueMin, band.baseValueMax);

      // 7. 등급/히든/쿠폰 확률
      let hiddenRate = role.hiddenRateBase + depth * role.hiddenRatePerDepth;
      let couponRate = role.couponRateBase + depth * role.couponRatePerDepth;

      if (ruleEngine) {
        const hCtx = { hiddenRate, towerRole: role.id, depth };
        ruleEngine.apply('box:hiddenRateModify', hCtx);
        hiddenRate = hCtx.hiddenRate;
      }

      const gradeTable = getGradeTable(role.gradeTableId, depth, role.depthGradeEscalation);

      // 스케일 (시각적 크기)
      const bandRatio = Math.min(bandIndex, PRICE_BANDS.length - 1) / (PRICE_BANDS.length - 1);
      const scale = Math.max(0.45, Math.min(0.98, 0.5 + bandRatio * 0.48));

      boxes.push({
        index: globalIndex,
        towerIndex: tower.index,
        depth,
        price,
        product,
        gradeTable,
        gradeTableId: role.gradeTableId,
        hiddenRate,
        couponRate,
        laneType: role.id,
        laneColor: role.color,
        laneName: role.name,
        scale,
      });

      globalIndex++;
    }
  }

  return {
    setType,
    towers: towerDefs,
    boxes,
  };
}

/** 10개 박스를 N개 타워에 분배 (최소 2개씩, 나머지 랜덤) */
function distributeTowers(towers, total) {
  const n = towers.length;
  let remaining = total - n * 2;
  towers.forEach(t => { t.boxCount = 2; });

  while (remaining > 0) {
    const idx = Math.floor(Math.random() * n);
    towers[idx].boxCount++;
    remaining--;
  }
}

/**
 * 가격 범위에 맞는 상품 선택.
 * PRODUCTS에서 price가 범위 내인 상품을 우선 선택.
 */
function pickProduct(minVal, maxVal) {
  if (PRODUCTS.length === 0) {
    return { id: 'fallback', name: 'Unknown', style: '', grade: 'C', price: 10000, modelPath: '' };
  }

  const midVal = (minVal + maxVal) / 2;

  // 범위 안에 있는 상품
  const inRange = PRODUCTS.filter(p => p.price >= minVal && p.price <= maxVal);
  if (inRange.length > 0) {
    const sorted = inRange.sort((a, b) => Math.abs(a.price - midVal) - Math.abs(b.price - midVal));
    const pool = sorted.slice(0, Math.min(5, sorted.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 범위 밖이면 가장 가까운 상품
  const sorted = [...PRODUCTS].sort(
    (a, b) => Math.abs(a.price - midVal) - Math.abs(b.price - midVal)
  );
  const pool = sorted.slice(0, Math.min(3, sorted.length));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 히든 상품 선택 (고가 상품 중 랜덤) */
export function pickHiddenProduct() {
  if (PRODUCTS.length === 0) {
    return { id: 'fallback_hidden', name: 'Hidden', style: '', grade: 'S', price: 100000, modelPath: '' };
  }

  // 상위 20% 가격 상품을 히든 풀로 사용
  const sorted = [...PRODUCTS].sort((a, b) => b.price - a.price);
  const topCount = Math.max(3, Math.floor(sorted.length * 0.2));
  const pool = sorted.slice(0, topCount);
  return pool[Math.floor(Math.random() * pool.length)];
}
