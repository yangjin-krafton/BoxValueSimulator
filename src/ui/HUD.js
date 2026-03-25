/**
 * DOM 기반 HUD. Three.js와 분리된 UI 레이어.
 */
export class HUD {
  constructor(bus) {
    this.bus = bus;
    this._money   = document.getElementById('money-display');
    this._hint    = document.getElementById('hint');
    this._popup   = document.getElementById('grade-popup');
    this._btn     = document.getElementById('btn-action');

    bus.on('money:change', (v) => this.updateMoney(v));
  }

  updateMoney(amount) {
    this._money.textContent = `₩ ${amount.toLocaleString()}`;
  }

  setHint(text, visible = true) {
    this._hint.textContent = text;
    this._hint.style.opacity = visible ? '1' : '0';
  }

  /** 등급 + 상품명 + 판매가 팝업 */
  showProductResult(product) {
    const colorMap = { SSS: '44ffff', SS: 'ff44aa', S: 'ff8800', A: 'ffdd00', B: '7799ff', C: '888888' };
    this._popup.innerHTML =
      `${product.grade} 등급!<br>` +
      `<span style="font-size:1.2rem;opacity:0.8">${product.def.name}</span><br>` +
      `<span style="font-size:1.5rem">₩ ${product.salePrice.toLocaleString()}</span>`;
    this._popup.style.color = '#' + (colorMap[product.grade] || 'ffffff');
    this._popup.style.opacity = '1';
    setTimeout(() => { this._popup.style.opacity = '0'; }, 3000);
  }

  showButton(text, onClick) {
    this._btn.textContent = text;
    this._btn.style.display = '';
    this._btn.onclick = onClick;
  }

  hideButton() {
    this._btn.style.display = 'none';
    this._btn.onclick = null;
  }

  hideLoading() {
    const el = document.getElementById('loading');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }
  }
}
