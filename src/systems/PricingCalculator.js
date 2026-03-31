/**
 * 판매가 계산기 (v3 — 단일 가격 기반).
 *
 * 판매가 = product.price × gradeMultiplier × hiddenMultiplier × marketAdj
 * RuleEngine 훅으로 최종 가격 보정 가능.
 */

/**
 * 판매가 계산.
 * @param {object} product - 상품 정의 (price 포함)
 * @param {object} gradeInfo - rollGrade() 결과
 * @param {object} [options]
 * @param {boolean} [options.isHidden=false]
 * @param {number} [options.hiddenMultiplier=1.5]
 * @param {import('./RuleEngine.js').RuleEngine} [options.ruleEngine]
 * @returns {number}
 */
export function calculateSalePrice(product, gradeInfo, options = {}) {
  const {
    isHidden = false,
    hiddenMultiplier = 1.5,
    ruleEngine = null,
  } = options;

  const marketAdj = 0.90 + Math.random() * 0.15; // 0.90~1.05
  const hidden = isHidden ? hiddenMultiplier : 1;
  let salePrice = Math.round(
    product.price * gradeInfo.multiplier * hidden * marketAdj / 100
  ) * 100;

  // RuleEngine 보정
  if (ruleEngine) {
    const ctx = { salePrice, isHidden, grade: gradeInfo.grade };
    ruleEngine.apply('product:sellModify', ctx);
    salePrice = ctx.salePrice;
  }

  return salePrice;
}

/**
 * 완성된 상품 인스턴스 생성.
 */
export function createProductInstance(product, gradeInfo, options = {}) {
  const salePrice = calculateSalePrice(product, gradeInfo, options);
  return {
    def: product,
    grade: gradeInfo.grade,
    gradeMultiplier: gradeInfo.multiplier,
    gradeColor: gradeInfo.color,
    salePrice,
    isHidden: options.isHidden || false,
  };
}

/**
 * 진열 슬롯용 상품 가치 평가.
 */
export function evaluateDisplayValue(productInstance, ruleEngine = null) {
  let displayValue = productInstance.salePrice;

  if (ruleEngine) {
    const ctx = { displayValue, grade: productInstance.grade, isHidden: productInstance.isHidden };
    ruleEngine.apply('display:valueModify', ctx);
    displayValue = ctx.displayValue;
  }

  return displayValue;
}
