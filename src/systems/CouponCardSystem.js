/**
 * 특수 쿠폰 카드 시스템.
 *
 * 라운드 클리어 보상으로 카드 선택지를 제공하고,
 * 선택한 카드의 효과를 RuleEngine에 등록한다.
 *
 * 카드는 해당 런 동안만 유효 (런 종료 시 clear).
 */

import { drawCardChoices, COUPON_CARDS } from '../data/couponCards.js';

export class CouponCardSystem {
  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('./RuleEngine.js').RuleEngine} ruleEngine
   */
  constructor(bus, ruleEngine) {
    this.bus = bus;
    this.ruleEngine = ruleEngine;

    /** @type {Array<object>} 현재 런에서 보유 중인 카드 */
    this.ownedCards = [];

    /** @type {Array<() => void>} RuleEngine 등록 해제 함수들 */
    this._unregisters = [];

    /** @type {Array<object>} 현재 표시 중인 선택지 */
    this.currentChoices = [];

    /** @type {number} 리롤 남은 횟수 */
    this.rerollsRemaining = 0;
  }

  /**
   * 카드 선택 화면 시작.
   * @param {number} rerollCount - 초과 달성 보상 리롤 횟수
   * @param {number} [choiceCount=3] - 선택지 수
   */
  startSelection(rerollCount = 0, choiceCount = 3) {
    this.rerollsRemaining = rerollCount;
    const excludeIds = this.ownedCards.map(c => c.id);
    this.currentChoices = drawCardChoices(choiceCount, excludeIds);

    this.bus.emit('coupon:selectionStart', {
      choices: this.currentChoices,
      rerolls: this.rerollsRemaining,
      owned: this.ownedCards,
    });
  }

  /**
   * 선택지 리롤.
   * @returns {boolean} 성공 여부
   */
  reroll() {
    if (this.rerollsRemaining <= 0) return false;
    this.rerollsRemaining--;

    const excludeIds = this.ownedCards.map(c => c.id);
    this.currentChoices = drawCardChoices(this.currentChoices.length, excludeIds);

    this.bus.emit('coupon:rerolled', {
      choices: this.currentChoices,
      rerolls: this.rerollsRemaining,
    });
    return true;
  }

  /**
   * 카드 선택 확정.
   * @param {number} choiceIndex - 선택한 카드 인덱스
   * @returns {object|null} 선택한 카드
   */
  selectCard(choiceIndex) {
    const card = this.currentChoices[choiceIndex];
    if (!card) return null;

    this.ownedCards.push(card);
    // RuleEngine에 효과 등록
    const unregister = this.ruleEngine.register(
      card.effect.hook,
      card.effect.apply,
      { id: card.id }
    );
    this._unregisters.push(unregister);

    this.currentChoices = [];

    this.bus.emit('coupon:selected', { card, owned: this.ownedCards });
    return card;
  }

  /**
   * 카드 선택 건너뛰기 (선택하지 않음).
   */
  skipSelection() {
    this.currentChoices = [];
    this.bus.emit('coupon:skipped', { owned: this.ownedCards });
  }

  /** 현재 보유 카드 목록 */
  getOwnedCards() {
    return [...this.ownedCards];
  }

  /** 특정 카테고리 보유 카드 */
  getCardsByCategory(category) {
    return this.ownedCards.filter(c => c.category === category);
  }

  /** 런 종료 시 모든 카드 효과 해제 */
  clear() {
    this._unregisters.forEach(fn => fn());
    this._unregisters = [];
    this.ownedCards = [];
    this.currentChoices = [];
    this.rerollsRemaining = 0;
    this.bus.emit('coupon:cleared');
  }

  /** 디버그: 전체 카드 풀 */
  static getAllCards() {
    return COUPON_CARDS;
  }
}
