/**
 * 세트 타입 정의.
 * 각 세트는 성격을 가지며, 열 역할 분배와 가격 분포를 결정한다.
 *
 * towerRoleWeights: 각 타워 역할의 선택 가중치
 * priceBandBias: 가격 밴드 분포 보정 (양수 = 비싼 쪽, 음수 = 싼 쪽)
 * towerCount: [min, max] 타워 수 범위
 */

export const SET_TYPES = {
  stable: {
    id: 'stable',
    name: '안정형',
    description: '가격이 전반적으로 낮고 평균 회수율이 높다. 초반 진행용.',
    towerRoleWeights: { stable: 5, attack: 1, deep: 2, bonus: 2 },
    priceBandBias: -1,
    towerCount: [2, 4],
    targetMultiplier: 0.8,   // 라운드 목표 보정
  },

  balanced: {
    id: 'balanced',
    name: '균형형',
    description: '가격과 기대값이 고르게 분포. 기본형 세트.',
    towerRoleWeights: { stable: 3, attack: 3, deep: 2, bonus: 2 },
    priceBandBias: 0,
    towerCount: [2, 4],
    targetMultiplier: 1.0,
  },

  aggressive: {
    id: 'aggressive',
    name: '공격형',
    description: '일부 열 가격이 높고 상위 등급 확률이 높다. 회수율 변동 큼.',
    towerRoleWeights: { stable: 1, attack: 5, deep: 3, bonus: 1 },
    priceBandBias: 1,
    towerCount: [2, 3],
    targetMultiplier: 1.2,
  },

  jackpot: {
    id: 'jackpot',
    name: '잭팟형',
    description: '평균 회수율은 낮지만 SSSSS 이상 확률이 높다. 대박용.',
    towerRoleWeights: { stable: 1, attack: 3, deep: 4, bonus: 2 },
    priceBandBias: 2,
    towerCount: [2, 3],
    targetMultiplier: 1.5,
  },

  bonus: {
    id: 'bonus',
    name: '보너스형',
    description: '열 클리어 보너스가 강하고 할인/특수 효과 기대값이 높다.',
    towerRoleWeights: { stable: 2, attack: 1, deep: 2, bonus: 5 },
    priceBandBias: 0,
    towerCount: [3, 4],
    targetMultiplier: 0.9,
  },
};

/** 가중 랜덤으로 세트 타입 선택 */
export function pickSetType(weights = null) {
  const types = Object.values(SET_TYPES);
  const w = weights || types.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < types.length; i++) {
    r -= w[i];
    if (r <= 0) return types[i];
  }
  return types[0];
}
