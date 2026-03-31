/**
 * 특수 쿠폰 카드 정의.
 * 라운드 클리어 보상으로 선택, 해당 런 동안 패시브 적용.
 *
 * 각 카드는 독립 모듈 형태:
 *  - id, name, description: 표시용
 *  - category: 분류 (경제/등급/진열/탐색/안전)
 *  - rarity: 등장 가중치 (높을수록 자주)
 *  - colors: 카드 고유 그라데이션 [2~3색]
 *  - effect: RuleEngine 훅에 등록할 효과 정의
 */

export const COUPON_CARDS = [
  // ── 경제 카드 ──
  {
    id: 'econ_discount_10',
    name: '단골 할인',
    category: '경제',
    rarity: 3,
    colors: ['#1a4d2e', '#2e8b57', '#90ee90'],
    description: '모든 상자 가격 10% 할인.',
    effect: {
      hook: 'box:priceModify',
      apply(ctx) { ctx.price = Math.round(ctx.price * 0.9); },
    },
  },
  {
    id: 'econ_sell_bonus_15',
    name: '감정사의 눈',
    category: '경제',
    rarity: 3,
    colors: ['#1a3d1a', '#44aa44', '#aaff66'],
    description: '즉시 판매 금액 15% 증가.',
    effect: {
      hook: 'product:sellModify',
      apply(ctx) { ctx.salePrice = Math.round(ctx.salePrice * 1.15); },
    },
  },
  {
    id: 'econ_clear_bonus',
    name: '열 마스터',
    category: '경제',
    rarity: 2,
    colors: ['#0d3320', '#228855', '#66ddaa'],
    description: '열 클리어 보너스 현금 50% 증가.',
    effect: {
      hook: 'tower:clearBonus',
      apply(ctx) { ctx.bonusCash = Math.round(ctx.bonusCash * 1.5); },
    },
  },
  {
    id: 'econ_starting_cash',
    name: '투자 시드',
    category: '경제',
    rarity: 2,
    colors: ['#1a4422', '#33bb55', '#ccff88'],
    description: '다음 라운드 시작 시 보너스 현금 20,000원.',
    effect: {
      hook: 'round:start',
      apply(ctx) { ctx.bonusMoney = (ctx.bonusMoney || 0) + 20_000; },
    },
  },

  // ── 등급 카드 ──
  {
    id: 'grade_attack_boost',
    name: '공격 강화',
    category: '등급',
    rarity: 2,
    colors: ['#4d1a0d', '#cc4422', '#ff8844'],
    description: '공격 열의 SS 이상 확률 30% 증가.',
    effect: {
      hook: 'grade:tableModify',
      apply(ctx) {
        if (ctx.towerRole === 'attack') {
          ctx.table.forEach(g => {
            if (['SS', 'SSS', 'SSSS', 'SSSSS'].includes(g.grade)) {
              g.weight *= 1.3;
            }
          });
        }
      },
    },
  },
  {
    id: 'grade_global_s_up',
    name: '행운의 부적',
    category: '등급',
    rarity: 2,
    colors: ['#3d2200', '#dd8800', '#ffcc44'],
    description: '모든 상자에서 S 이상 확률 20% 증가.',
    effect: {
      hook: 'grade:tableModify',
      apply(ctx) {
        ctx.table.forEach(g => {
          if (['S', 'SS', 'SSS', 'SSSS', 'SSSSS'].includes(g.grade)) {
            g.weight *= 1.2;
          }
        });
      },
    },
  },

  // ── 진열 카드 ──
  {
    id: 'display_value_boost',
    name: '진열 감정',
    category: '진열',
    rarity: 2,
    colors: ['#0d1a3d', '#2255bb', '#66aaff'],
    description: '진열 슬롯 상품의 판매가 평가 시 20% 추가 보정.',
    effect: {
      hook: 'display:valueModify',
      apply(ctx) { ctx.displayValue = Math.round(ctx.displayValue * 1.2); },
    },
  },
  {
    id: 'display_4th_slot',
    name: '확장 진열대',
    category: '진열',
    rarity: 1,
    colors: ['#0a1833', '#1a55aa', '#44ccff'],
    description: '진열 슬롯 1칸 추가 (총 4칸).',
    effect: {
      hook: 'display:slotCount',
      apply(ctx) { ctx.maxSlots = Math.max(ctx.maxSlots, 4); },
    },
  },

  // ── 탐색 카드 ──
  {
    id: 'explore_hidden_up',
    name: '보물 탐지기',
    category: '탐색',
    rarity: 2,
    colors: ['#2a0d3d', '#8833cc', '#cc77ff'],
    description: '히든 상품 출현 확률 2배.',
    effect: {
      hook: 'box:hiddenRateModify',
      apply(ctx) { ctx.hiddenRate *= 2; },
    },
  },
  {
    id: 'explore_peek',
    name: '투시경',
    category: '탐색',
    rarity: 1,
    colors: ['#1a0d33', '#6622aa', '#bb66ff'],
    description: '각 열의 두 번째 상자 가격 정보 공개.',
    effect: {
      hook: 'tower:infoReveal',
      apply(ctx) { ctx.revealDepth = Math.max(ctx.revealDepth, 1); },
    },
  },

  // ── 안전 카드 ──
  {
    id: 'safe_min_cash',
    name: '비상금',
    category: '안전',
    rarity: 2,
    colors: ['#0d2233', '#227788', '#44cccc'],
    description: '자금이 5,000원 이하로 떨어지지 않는다.',
    effect: {
      hook: 'money:spendCheck',
      apply(ctx) {
        const remaining = ctx.currentMoney - ctx.spendAmount;
        if (remaining < 5_000) {
          ctx.spendAmount = Math.max(0, ctx.currentMoney - 5_000);
        }
      },
    },
  },
  {
    id: 'safe_free_box',
    name: '무료 체험권',
    category: '안전',
    rarity: 1,
    colors: ['#0a2a2a', '#11887a', '#55eedd'],
    description: '라운드 첫 상자를 무료로 연다.',
    effect: {
      hook: 'box:priceModify',
      apply(ctx) {
        if (ctx.boxOpenedCount === 0) ctx.price = 0;
      },
    },
  },
];

/**
 * 랜덤 카드 선택지 N개 생성.
 * @param {number} count - 선택지 수
 * @param {string[]} excludeIds - 이미 보유한 카드 ID
 */
export function drawCardChoices(count = 3, excludeIds = []) {
  const pool = COUPON_CARDS.filter(c => !excludeIds.includes(c.id));
  const result = [];
  const used = new Set();

  while (result.length < count && result.length < pool.length) {
    const total = pool.reduce((s, c) => s + (used.has(c.id) ? 0 : c.rarity), 0);
    let r = Math.random() * total;
    for (const card of pool) {
      if (used.has(card.id)) continue;
      r -= card.rarity;
      if (r <= 0) {
        result.push(card);
        used.add(card.id);
        break;
      }
    }
  }
  return result;
}
