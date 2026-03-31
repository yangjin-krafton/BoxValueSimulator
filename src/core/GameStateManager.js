/**
 * 게임 상태 중앙 관리 (v2 — 라운드 + 진열 슬롯 지원).
 *
 * state.phase:
 *   'loading' | 'box_selection' | 'flying' | 'playable' | 'opening'
 *   | 'result' | 'post_open_choice' | 'round_clear' | 'coupon_select' | 'round_fail'
 *
 * state.boxStates[]:
 *   'shelf' | 'flying' | 'active' | 'opened' | 'done'
 */

const INITIAL_MONEY = 500_000;
const SAVE_KEY = 'boxsim_save_v2';

export class GameStateManager {
  /** @param {import('./EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.state = {
      phase: 'loading',
      money: INITIAL_MONEY,
      selectedBoxIndex: -1,
      currentProduct: null,
      boxSet: null,
      boxStates: [],
      layout: null,

      // v2: 라운드 & 진열
      round: 0,
      targetValue: 0,
      displaySlots: [null, null, null],
      ownedCoupons: [],
      boxOpenedCount: 0,
    };
  }

  /** localStorage에 진행 상태 저장 */
  save() {
    try {
      const data = {
        money: this.state.money,
        boxSet: this.state.boxSet,
        boxStates: this.state.boxStates,
        layout: this.state.layout || null,
        round: this.state.round,
        targetValue: this.state.targetValue,
        displaySlots: this.state.displaySlots,
        ownedCoupons: this.state.ownedCoupons.map(c => c.id),
        boxOpenedCount: this.state.boxOpenedCount,
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded 등 무시 */ }
  }

  /**
   * localStorage에서 복원.
   * @returns {{ ok: boolean, offlineBonus: number }}
   */
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ok: false, offlineBonus: 0 };
      const data = JSON.parse(raw);
      if (!data.boxSet || !data.boxStates) return { ok: false, offlineBonus: 0 };

      this.state.money = data.money ?? INITIAL_MONEY;
      this.state.boxSet = data.boxSet;
      this.state.boxStates = data.boxStates.map(s => (s === 'shelf' || s === 'done') ? s : 'shelf');
      this.state.layout = data.layout || null;
      this.state.selectedBoxIndex = -1;
      this.state.currentProduct = null;
      this.state.round = data.round || 0;
      this.state.targetValue = data.targetValue || 0;
      this.state.displaySlots = data.displaySlots || [null, null, null];
      this.state.boxOpenedCount = data.boxOpenedCount || 0;

      // 오프라인 보상
      let offlineBonus = 0;
      if (data.savedAt) {
        const hoursAway = (Date.now() - data.savedAt) / (1000 * 60 * 60);
        if (hoursAway >= 1) {
          offlineBonus = Math.min(50000, Math.floor(hoursAway) * 5000);
        }
      }

      return { ok: true, offlineBonus };
    } catch {
      return { ok: false, offlineBonus: 0 };
    }
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* */ }
  }

  setPhase(phase) {
    this.state.phase = phase;
    this.bus.emit('phase:change', phase);
  }

  selectBox(index) {
    this.state.selectedBoxIndex = index;
    this.setBoxState(index, 'flying');
    this.bus.emit('box:selected', index);
  }

  setCurrentProduct(product) {
    this.state.currentProduct = product;
    this.bus.emit('product:revealed', product);
  }

  /** @returns {boolean} 구매 성공 여부 */
  spendMoney(amount) {
    if (this.state.money < amount) return false;
    this.state.money -= amount;
    this.bus.emit('money:change', this.state.money);
    this.save();
    return true;
  }

  earnMoney(amount) {
    this.state.money += amount;
    this.bus.emit('money:change', this.state.money);
    this.save();
  }

  sellProduct() {
    const product = this.state.currentProduct;
    if (!product) return;
    this.earnMoney(product.salePrice);
    this.bus.emit('product:sell', product);
    this.state.currentProduct = null;
  }

  setBoxState(index, boxState) {
    this.state.boxStates[index] = boxState;
    this.save();
  }

  setBoxSet(set) {
    this.state.boxSet = set;
    this.state.boxStates = set.boxes.map(() => 'shelf');
    this.bus.emit('set:new', set);
    this.save();
  }

  /** v2: 라운드 정보 업데이트 */
  setRoundInfo(round, targetValue) {
    this.state.round = round;
    this.state.targetValue = targetValue;
    this.state.boxOpenedCount = 0;
    this.save();
  }

  /** v2: 진열 슬롯 동기화 */
  syncDisplaySlots(slots) {
    this.state.displaySlots = slots;
    this.save();
  }

  /** v2: 보유 쿠폰 동기화 */
  syncCoupons(cards) {
    this.state.ownedCoupons = cards;
    this.save();
  }

  /** v2: 상자 개봉 카운트 */
  incrementBoxOpened() {
    this.state.boxOpenedCount++;
    this.save();
  }
}
