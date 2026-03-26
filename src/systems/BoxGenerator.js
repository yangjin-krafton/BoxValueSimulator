import { PRODUCTS } from '../data/products.js';

const SET_VALUE_MIN = 180_000;
const SET_VALUE_MAX = 320_000;
const BOX_COUNT = 10;

/**
 * 10개 상자 세트 생성.
 * 1. 세트 총 가치 결정
 * 2. 디리클레 유사 분포로 비대칭 분배
 * 3. 상자 가격 ≠ 내부 가치 (함정/기회)
 */
export function generateBoxSet() {
  const totalValue = SET_VALUE_MIN + Math.random() * (SET_VALUE_MAX - SET_VALUE_MIN);

  const rawW = Array.from({ length: BOX_COUNT }, () => Math.pow(Math.random(), 1.5));
  const wSum = rawW.reduce((a, b) => a + b, 0);
  const innerValues = rawW.map(w => (w / wSum) * totalValue);

  const boxes = innerValues.map((innerValue, index) => {
    const product = pickProduct(innerValue);
    const priceNoise = 0.7 + Math.random() * 0.6;
    const originalPrice = Math.max(1000, Math.round((innerValue * priceNoise) / 1000) * 1000);
    const scale = Math.max(0.45, Math.min(0.98, 0.52 + (innerValue / totalValue) * 2.5));

    // 할인 (20% 확률, 10~40% 할인)
    let discount = 0;
    let price = originalPrice;
    if (Math.random() < 0.20) {
      discount = 0.1 + Math.random() * 0.3;                     // 10~40%
      price = Math.max(1000, Math.round((originalPrice * (1 - discount)) / 1000) * 1000);
    }

    return { index, price, originalPrice, discount, innerValue, product, scale };
  });

  return { totalValue, boxes };
}

function pickProduct(targetValue) {
  if (PRODUCTS.length > 0) {
    const sorted = [...PRODUCTS].sort(
      (a, b) => Math.abs(a.baseValue - targetValue) - Math.abs(b.baseValue - targetValue)
    );
    const pool = sorted.slice(0, Math.min(3, sorted.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return createPlaceholder(targetValue);
}

const CATEGORY_NAMES = {
  '전자기기': ['블루투스 이어폰', '보조배터리', '미니 스피커', 'USB 허브'],
  '피규어':   ['애니 피규어', '레트로 로봇', '미니 동물', '히어로 피규어'],
  '생활용품': ['텀블러', '미니 가습기', 'LED 조명', '무선 충전기'],
  '장난감':   ['퍼즐 큐브', '미니 드론', 'RC카', '보드게임'],
  '수집품':   ['한정판 카드', '빈티지 코인', '기념 메달', '크리스탈 볼'],
};
const CATEGORIES = Object.keys(CATEGORY_NAMES);

function createPlaceholder(value) {
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const names = CATEGORY_NAMES[cat];
  return {
    id: 'ph_' + Math.random().toString(36).slice(2, 8),
    name: names[Math.floor(Math.random() * names.length)],
    baseValue: Math.round(value / 100) * 100,
    rarity: 0.8 + Math.random() * 0.5,
    category: cat,
    modelPath: '',
  };
}
