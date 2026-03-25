/**
 * 게임 상태 중앙 관리.
 *
 * state.phase:
 *   'loading' | 'box_selection' | 'flying' | 'playable' | 'opening' | 'result'
 *
 * state.boxStates[]:
 *   'shelf' | 'flying' | 'active' | 'opened' | 'done'
 */

const INITIAL_MONEY = 100_000;

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

  setPhase(phase) {
    this.state.phase = phase;
    this.bus.emit('phase:change', phase);
  }

  setBoxSet(set) {
    this.state.boxSet = set;
    this.state.boxStates = set.boxes.map(() => 'shelf');
    this.bus.emit('set:new', set);
  }

  setBoxState(index, boxState) {
    this.state.boxStates[index] = boxState;
  }

  selectBox(index) {
    this.state.selectedBoxIndex = index;
    this.setBoxState(index, 'flying');
    this.bus.emit('box:select', index);
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
    return true;
  }

  earnMoney(amount) {
    this.state.money += amount;
    this.bus.emit('money:change', this.state.money);
  }

  sellProduct() {
    const product = this.state.currentProduct;
    if (!product) return;
    this.earnMoney(product.salePrice);
    this.bus.emit('product:sell', product);
    this.state.currentProduct = null;
  }
}
