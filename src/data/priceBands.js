/**
 * 가격 밴드 정의.
 * 상자 가격과 기본 상품가 범위를 연결.
 */

export const PRICE_BANDS = [
  { id: 'B1', price: 10_000,  baseValueMin:  1_000, baseValueMax:  20_000 },
  { id: 'B2', price: 20_000,  baseValueMin:  5_000, baseValueMax:  35_000 },
  { id: 'B3', price: 30_000,  baseValueMin:  8_000, baseValueMax:  50_000 },
  { id: 'B4', price: 50_000,  baseValueMin: 10_000, baseValueMax: 100_000 },
  { id: 'B5', price: 80_000,  baseValueMin: 20_000, baseValueMax: 180_000 },
  { id: 'B6', price: 120_000, baseValueMin: 35_000, baseValueMax: 300_000 },
  { id: 'B7', price: 200_000, baseValueMin: 60_000, baseValueMax: 600_000 },
];

/**
 * 밴드 인덱스로 밴드 가져오기 (범위 클램프).
 * @param {number} index - 소수점 포함 가능, Math.round 처리
 */
export function getBand(index) {
  const i = Math.max(0, Math.min(PRICE_BANDS.length - 1, Math.round(index)));
  return PRICE_BANDS[i];
}

/**
 * 밴드 가격에 노이즈를 적용해 최종 상자 가격 생성.
 * @param {object} band - PRICE_BANDS 항목
 * @param {number} noise - 0.9~1.1 범위의 노이즈
 */
export function bandToPrice(band, noise = 1) {
  return Math.round((band.price * noise) / 1000) * 1000;
}
