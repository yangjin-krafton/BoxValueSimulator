/**
 * 판매가 = 기본가치 × 등급배수 × 희소도 × 시장보정(0.85~1.05)
 */
export function calculateSalePrice(product, gradeInfo) {
  const marketAdj = 0.85 + Math.random() * 0.20;
  const raw = product.baseValue * gradeInfo.multiplier * product.rarity * marketAdj;
  return Math.round(raw / 100) * 100; // 100원 단위
}

/** product + gradeInfo → 완성된 상품 인스턴스 */
export function createProductInstance(product, gradeInfo) {
  return {
    def: product,
    grade: gradeInfo.grade,
    gradeMultiplier: gradeInfo.multiplier,
    gradeColor: gradeInfo.color,
    salePrice: calculateSalePrice(product, gradeInfo),
  };
}
