/**
 * 룰 엔진 — 특수 규칙을 모듈화하여 쉽게 추가/제거할 수 있는 훅 시스템.
 *
 * 게임의 다양한 시점(훅)에 규칙을 등록하면,
 * 해당 시점에서 context 객체를 순차적으로 변형한다.
 *
 * 사용 예:
 *   ruleEngine.register('box:priceModify', ctx => { ctx.price *= 0.9; });
 *   const ctx = ruleEngine.apply('box:priceModify', { price: 10000 });
 *   // ctx.price === 9000
 *
 * 훅 목록 (확장 가능):
 *   - box:priceModify        상자 가격 결정 시
 *   - box:hiddenRateModify   히든 확률 결정 시
 *   - grade:tableModify      등급 테이블 생성 시
 *   - product:sellModify     즉시 판매 가격 결정 시
 *   - display:valueModify    진열 상품 가치 평가 시
 *   - display:slotCount      진열 슬롯 수 결정 시
 *   - tower:clearBonus       열 클리어 보너스 계산 시
 *   - tower:infoReveal       열 정보 공개 범위 결정 시
 *   - round:start            라운드 시작 시
 *   - round:end              라운드 종료 시
 *   - money:spendCheck       자금 소비 전 검증 시
 */

export class RuleEngine {
  /** @type {Map<string, Array<{id: string, priority: number, apply: Function}>>} */
  #hooks = new Map();

  /**
   * 훅에 규칙 등록.
   * @param {string} hookName - 훅 이름
   * @param {Function} applyFn - context를 받아 변형하는 함수
   * @param {object} [options]
   * @param {string} [options.id] - 규칙 ID (제거용)
   * @param {number} [options.priority=0] - 실행 순서 (낮을수록 먼저)
   * @returns {() => void} 등록 해제 함수
   */
  register(hookName, applyFn, { id = '', priority = 0 } = {}) {
    if (!this.#hooks.has(hookName)) this.#hooks.set(hookName, []);
    const entry = { id, priority, apply: applyFn };
    const list = this.#hooks.get(hookName);
    list.push(entry);
    list.sort((a, b) => a.priority - b.priority);

    return () => {
      const idx = list.indexOf(entry);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  /**
   * ID로 특정 규칙 제거.
   * @param {string} hookName
   * @param {string} ruleId
   */
  unregister(hookName, ruleId) {
    const list = this.#hooks.get(hookName);
    if (!list) return;
    const idx = list.findIndex(e => e.id === ruleId);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * 훅에 등록된 모든 규칙을 context에 순차 적용.
   * @param {string} hookName
   * @param {object} context - 변형 대상 (in-place 변경)
   * @returns {object} 변형된 context
   */
  apply(hookName, context) {
    const list = this.#hooks.get(hookName);
    if (!list) return context;
    for (const entry of list) {
      entry.apply(context);
    }
    return context;
  }

  /**
   * 쿠폰 카드의 effect를 일괄 등록.
   * @param {Array} cards - couponCards.js 형식의 카드 배열
   * @returns {Array<() => void>} 등록 해제 함수 배열
   */
  registerCards(cards) {
    return cards.map(card =>
      this.register(card.effect.hook, card.effect.apply, { id: card.id })
    );
  }

  /** 모든 훅에서 특정 ID의 규칙 제거 */
  unregisterById(ruleId) {
    for (const [hookName] of this.#hooks) {
      this.unregister(hookName, ruleId);
    }
  }

  /** 모든 규칙 초기화 */
  clear() {
    this.#hooks.clear();
  }

  /** 디버그: 등록된 규칙 목록 */
  debug() {
    const result = {};
    for (const [hook, list] of this.#hooks) {
      result[hook] = list.map(e => e.id || '(anonymous)');
    }
    return result;
  }
}
