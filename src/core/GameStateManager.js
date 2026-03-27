/**
 * 게임 상태 중앙 관리.
 *
 * state.phase:
 *   'loading' | 'box_selection' | 'flying' | 'playable' | 'opening' | 'result'
 *
 * state.boxStates[]:
 *   'shelf' | 'flying' | 'active' | 'opened' | 'done'
 */

import { DATA_VERSION } from '../data/products.js';

const INITIAL_MONEY = 100_000;
const SAVE_KEY = 'boxsim_save';

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
        savedAt: Date.now(),
        dataVersion: DATA_VERSION,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded 등 무시 */ }
  }

  /**
   * localStorage에서 복원.
   * @returns {{ ok: boolean, offlineBonus: number }} offlineBonus: 1시간 이상 경과 시 보상 금액
   */
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ok: false, offlineBonus: 0 };
      const data = JSON.parse(raw);
      if (!data.boxSet || !data.boxStates) return { ok: false, offlineBonus: 0 };

      // 데이터 버전 불일치 → 머니만 유지, 박스셋은 초기화
      if (DATA_VERSION && data.dataVersion !== DATA_VERSION) {
        console.warn(`[save] 데이터 버전 변경 (${data.dataVersion || '없음'} → ${DATA_VERSION}), 박스셋 초기화`);
        this.state.money = data.money ?? INITIAL_MONEY;
        this.clearSave();
        return { ok: false, offlineBonus: 0 };
      }

      this.state.money = data.money ?? INITIAL_MONEY;
      this.state.boxSet = data.boxSet;
      this.state.boxStates = data.boxStates.map(s => (s === 'shelf' || s === 'done') ? s : 'shelf');
      this.state.layout = data.layout || null;
      this.state.selectedBoxIndex = -1;
      this.state.currentProduct = null;

      // 오프라인 보상: 1시간 이상 경과 시 시간당 5000원 (최대 50000원)
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

  /** 세이브 삭제 */
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
}
