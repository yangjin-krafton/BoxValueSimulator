/**
 * 라운드 관리 시스템.
 *
 * 한 라운드 = 10개 상자 세트.
 * 라운드 목표: 진열 슬롯 3개의 판매가 총합 ≥ 목표 판매가.
 *
 * 라이프사이클:
 *  1. startRound() — 세트 생성, 목표 설정
 *  2. 유저가 상자를 열고 즉시 판매/진열 선택
 *  3. checkClear() — 언제든 클리어 조건 확인
 *  4. endRound() — 진열 상품 회수, 보상 계산
 */

export class RoundManager {
  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('./RuleEngine.js').RuleEngine} ruleEngine
   */
  constructor(bus, ruleEngine) {
    this.bus = bus;
    this.ruleEngine = ruleEngine;

    this.round = 0;
    this.targetValue = 0;
    this.boxSet = null;
    this.boxOpenedCount = 0;
    this.isCleared = false;
    this.isEnded = false;
  }

  /**
   * 새 라운드 시작.
   * @param {object} boxSet - generateBoxSet() 결과
   * @param {number} [baseTarget] - 기본 목표 판매가 (없으면 자동 계산)
   */
  startRound(boxSet, baseTarget = null) {
    this.round++;
    this.boxSet = boxSet;
    this.boxOpenedCount = 0;
    this.isCleared = false;
    this.isEnded = false;

    // 목표 판매가 계산
    const avgPrice = boxSet.boxes.reduce((s, b) => s + b.price, 0) / boxSet.boxes.length;
    const rawTarget = baseTarget || avgPrice * 3;
    this.targetValue = Math.round(rawTarget * (boxSet.setType.targetMultiplier || 1) / 1000) * 1000;

    // RuleEngine 라운드 시작 훅
    const ctx = { round: this.round, targetValue: this.targetValue, bonusMoney: 0 };
    this.ruleEngine.apply('round:start', ctx);
    this.targetValue = ctx.targetValue;

    this.bus.emit('round:start', {
      round: this.round,
      targetValue: this.targetValue,
      setType: boxSet.setType,
      bonusMoney: ctx.bonusMoney,
    });

    return ctx;
  }

  /** 상자 개봉 카운트 증가 */
  onBoxOpened() {
    this.boxOpenedCount++;
  }

  /**
   * 클리어 조건 확인.
   * @param {number} displayTotal - 진열 슬롯 판매가 총합
   * @returns {{ cleared: boolean, ratio: number }}
   */
  checkClear(displayTotal) {
    const ratio = this.targetValue > 0 ? displayTotal / this.targetValue : 0;
    this.isCleared = ratio >= 1.0;
    return { cleared: this.isCleared, ratio };
  }

  /**
   * 라운드 종료 처리.
   * @param {number} displayTotal - 진열 슬롯 판매가 총합
   * @returns {{ cleared, ratio, rerollCount }}
   */
  endRound(displayTotal) {
    this.isEnded = true;
    const { cleared, ratio } = this.checkClear(displayTotal);

    // 초과 달성 보상: 리롤 횟수
    let rerollCount = 0;
    if (ratio >= 3.0) rerollCount = 3;
    else if (ratio >= 2.0) rerollCount = 1;

    const result = { cleared, ratio, rerollCount, round: this.round, targetValue: this.targetValue };

    // RuleEngine 라운드 종료 훅
    this.ruleEngine.apply('round:end', result);

    this.bus.emit('round:end', result);
    return result;
  }

  /** 현재 라운드 정보 */
  getInfo() {
    return {
      round: this.round,
      targetValue: this.targetValue,
      boxOpenedCount: this.boxOpenedCount,
      isCleared: this.isCleared,
      isEnded: this.isEnded,
    };
  }
}
