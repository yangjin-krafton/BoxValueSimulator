/**
 * 진열 슬롯 관리 시스템.
 *
 * 슬롯은 기본 3칸 (쿠폰 카드로 확장 가능).
 * 개봉한 상품을 진열하거나, 기존 상품을 판매 후 교체.
 * 라운드 종료 시 진열 상품은 회수 (현금화 X).
 */

import { evaluateDisplayValue } from './PricingCalculator.js';

const DEFAULT_MAX_SLOTS = 3;

export class DisplaySlotManager {
  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('./RuleEngine.js').RuleEngine} ruleEngine
   */
  constructor(bus, ruleEngine) {
    this.bus = bus;
    this.ruleEngine = ruleEngine;

    /** @type {Array<object|null>} 진열 슬롯 (productInstance 또는 null) */
    this.slots = [];
    this.maxSlots = DEFAULT_MAX_SLOTS;

    this._initSlots();
  }

  _initSlots() {
    // RuleEngine으로 슬롯 수 보정
    const ctx = { maxSlots: DEFAULT_MAX_SLOTS };
    this.ruleEngine.apply('display:slotCount', ctx);
    this.maxSlots = ctx.maxSlots;

    this.slots = new Array(this.maxSlots).fill(null);
  }

  /** 라운드 시작 시 슬롯 초기화 */
  reset() {
    this._initSlots();
    this.bus.emit('display:update', this.getState());
  }

  /**
   * 빈 슬롯에 상품 진열.
   * @param {object} productInstance
   * @returns {boolean} 성공 여부
   */
  addToSlot(productInstance) {
    const emptyIdx = this.slots.findIndex(s => s === null);
    if (emptyIdx === -1) return false;

    this.slots[emptyIdx] = productInstance;
    this.bus.emit('display:update', this.getState());
    this.bus.emit('display:added', { slotIndex: emptyIdx, product: productInstance });
    return true;
  }

  /**
   * 기존 슬롯 상품을 판매하고 새 상품으로 교체.
   * @param {number} slotIndex - 교체할 슬롯 인덱스
   * @param {object} newProduct - 새 productInstance
   * @returns {object|null} 판매된 기존 상품 (salePrice로 현금화)
   */
  replaceSlot(slotIndex, newProduct) {
    if (slotIndex < 0 || slotIndex >= this.maxSlots) return null;

    const old = this.slots[slotIndex];
    this.slots[slotIndex] = newProduct;
    this.bus.emit('display:update', this.getState());
    this.bus.emit('display:replaced', { slotIndex, oldProduct: old, newProduct });
    return old; // 호출자가 old.salePrice 만큼 earnMoney 처리
  }

  /**
   * 진열 슬롯 판매가 총합 (display 보정 포함).
   * @returns {number}
   */
  getTotal() {
    return this.slots.reduce((sum, slot) => {
      if (!slot) return sum;
      return sum + evaluateDisplayValue(slot, this.ruleEngine);
    }, 0);
  }

  /** 빈 슬롯이 있는지 */
  hasEmptySlot() {
    return this.slots.some(s => s === null);
  }

  /** 채워진 슬롯 수 */
  filledCount() {
    return this.slots.filter(s => s !== null).length;
  }

  /**
   * 각 슬롯에 새 상품을 교체했을 때의 예상 총합 시뮬레이션.
   * @param {object} newProduct
   * @returns {Array<{slotIndex, currentValue, newTotal, diff}>}
   */
  simulateReplacements(newProduct) {
    const currentTotal = this.getTotal();
    const newValue = evaluateDisplayValue(newProduct, this.ruleEngine);

    return this.slots.map((slot, i) => {
      if (!slot) return { slotIndex: i, currentValue: 0, newTotal: currentTotal + newValue, diff: newValue };
      const oldValue = evaluateDisplayValue(slot, this.ruleEngine);
      const newTotal = currentTotal - oldValue + newValue;
      return { slotIndex: i, currentValue: oldValue, newTotal, diff: newValue - oldValue };
    });
  }

  /**
   * 라운드 종료 시 진열 상품 회수.
   * @returns {Array<object>} 회수된 상품들
   */
  collectAndClear() {
    const collected = this.slots.filter(s => s !== null);
    this.slots = new Array(this.maxSlots).fill(null);
    this.bus.emit('display:cleared', { collected });
    this.bus.emit('display:update', this.getState());
    return collected;
  }

  /** 현재 상태 스냅샷 */
  getState() {
    return {
      slots: this.slots.map((s, i) => ({
        index: i,
        product: s,
        value: s ? evaluateDisplayValue(s, this.ruleEngine) : 0,
      })),
      total: this.getTotal(),
      maxSlots: this.maxSlots,
      filledCount: this.filledCount(),
      hasEmpty: this.hasEmptySlot(),
    };
  }
}
