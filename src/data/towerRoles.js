/**
 * 타워(열) 역할 정의.
 * 각 열은 단순 적층 공간이 아니라 전략 단위.
 *
 * gradeTableId: 사용할 등급 확률표 ID
 * depthGradeEscalation: 층 당 등급표 상승 강도 (0 = 없음)
 * priceBandRange: [min, max] 이 열이 사용하는 가격 밴드 인덱스 범위
 * depthPriceBandShift: 아래층으로 갈수록 밴드 인덱스 상승량
 * hiddenRateBase: 히든 상품 기본 확률
 * hiddenRatePerDepth: 층 당 히든 확률 증가
 * couponRateBase: 쿠폰 기본 확률
 * couponRatePerDepth: 층 당 쿠폰 확률 증가
 * clearBonus: 열 클리어 시 보너스 배율
 * color: UI 표시 색상 (hex)
 */

export const TOWER_ROLES = {
  stable: {
    id: 'stable',
    name: '안정',
    description: '가격이 낮고 평균 회수율이 높다.',
    color: '#4CAF50',
    gradeTableId: 'stable',
    depthGradeEscalation: 0.5,
    priceBandRange: [0, 2],       // B1 ~ B3
    depthPriceBandShift: 0.5,
    hiddenRateBase: 0,
    hiddenRatePerDepth: 0.005,
    couponRateBase: 0.02,
    couponRatePerDepth: 0.01,
    clearBonus: 1.0,
  },

  attack: {
    id: 'attack',
    name: '공격',
    description: '가격이 높고 상위 등급 확률이 높다.',
    color: '#F44336',
    gradeTableId: 'attack',
    depthGradeEscalation: 1.0,
    priceBandRange: [2, 5],       // B3 ~ B6
    depthPriceBandShift: 0.8,
    hiddenRateBase: 0.02,
    hiddenRatePerDepth: 0.015,
    couponRateBase: 0.01,
    couponRatePerDepth: 0.005,
    clearBonus: 1.2,
  },

  deep: {
    id: 'deep',
    name: '심층',
    description: '위는 평범하지만 아래로 갈수록 급격히 좋아진다.',
    color: '#9C27B0',
    gradeTableId: 'stable',
    depthGradeEscalation: 2.0,     // 강한 깊이 보정
    priceBandRange: [1, 5],        // B2 ~ B6
    depthPriceBandShift: 1.5,
    hiddenRateBase: 0,
    hiddenRatePerDepth: 0.03,
    couponRateBase: 0,
    couponRatePerDepth: 0.02,
    clearBonus: 1.5,
  },

  bonus: {
    id: 'bonus',
    name: '보너스',
    description: '할인권, 히든, 열 클리어 보상에 특화.',
    color: '#FF9800',
    gradeTableId: 'stable',
    depthGradeEscalation: 0.8,
    priceBandRange: [0, 3],        // B1 ~ B4
    depthPriceBandShift: 0.5,
    hiddenRateBase: 0.03,
    hiddenRatePerDepth: 0.04,
    couponRateBase: 0.08,
    couponRatePerDepth: 0.06,
    clearBonus: 2.0,
  },
};

/** 가중치 기반으로 타워 역할 선택 */
export function pickTowerRole(weights) {
  const roles = Object.keys(weights);
  const vals = roles.map(r => weights[r]);
  const total = vals.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < roles.length; i++) {
    r -= vals[i];
    if (r <= 0) return TOWER_ROLES[roles[i]];
  }
  return TOWER_ROLES[roles[0]];
}
