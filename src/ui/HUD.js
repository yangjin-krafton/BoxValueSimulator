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
    this._swap    = document.getElementById('btn-swap');

    /** 교환 쿨타임 */
    this._swapCooldown = 0;          // 남은 초
    this._swapTimer = null;
    this._swapCallback = null;
    this._swap.addEventListener('click', () => {
      if (this._swapCooldown > 0 || !this._swapCallback) return;
      this._swapCallback();
      this.startSwapCooldown(60);
    });

    /** 코인 카운트업 애니메이션 상태 */
    this._displayAmount = 0;       // 현재 화면에 표시 중인 금액
    this._targetAmount = 0;        // 최종 목표 금액
    this._coinQueue = [];          // 대기 중인 코인 단위 틱 [{amount, time}]
    this._tickRAF = null;
    this._lastTickTime = 0;

    bus.on('money:change', (v) => {
      // spend는 즉시 반영, earn은 코인 바운스로 처리
      if (v < this._displayAmount && this._coinQueue.length === 0) {
        this._displayAmount = v;
        this._targetAmount = v;
        this._renderMoney();
        this._bounce();
      }
    });
  }

  updateMoney(amount) {
    this._displayAmount = amount;
    this._targetAmount = amount;
    this._coinQueue.length = 0;
    this._renderMoney();
  }

  /**
   * 판매 수익을 코인 단위로 바운스하며 카운트업.
   * @param {number} totalAmount  총 수익
   * @param {number} coinCount    코인 개수
   */
  startCoinCountUp(totalAmount, coinCount) {
    const perCoin = totalAmount / coinCount;
    const baseDelay = 0.03;   // 코인 간 간격 (초)
    const now = performance.now() / 1000;

    // 흡수 코인 타이밍에 맞춰 지연 시작 (폭발 0.4s + 흡수 시작)
    const startDelay = 0.6;

    this._coinQueue.length = 0;
    for (let i = 0; i < coinCount; i++) {
      this._coinQueue.push({
        amount: perCoin,
        time: now + startDelay + i * baseDelay,
      });
    }
    this._targetAmount = this._displayAmount + totalAmount;

    if (!this._tickRAF) this._tickLoop();
  }

  _tickLoop() {
    this._tickRAF = requestAnimationFrame(() => {
      const now = performance.now() / 1000;
      let ticked = false;

      while (this._coinQueue.length > 0 && this._coinQueue[0].time <= now) {
        const tick = this._coinQueue.shift();
        this._displayAmount += tick.amount;
        ticked = true;
      }

      if (ticked) {
        // 마지막 틱이면 정확한 목표치로 보정
        if (this._coinQueue.length === 0) {
          this._displayAmount = this._targetAmount;
        }
        this._renderMoney();
        this._bounce();
      }

      if (this._coinQueue.length > 0) {
        this._tickLoop();
      } else {
        this._tickRAF = null;
      }
    });
  }

  _renderMoney() {
    const v = Math.round(this._displayAmount);
    this._money.innerHTML = `<span class="coin-icon">🪙</span>₩ ${v.toLocaleString()}`;
  }

  _bounce() {
    // CSS animation 재시작: 클래스 제거 → reflow → 재추가
    this._money.classList.remove('bouncing');
    void this._money.offsetWidth;
    this._money.classList.add('bouncing');
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

  showButton(text, onClick, style) {
    this._btn.textContent = text;
    this._btn.style.display = '';
    this._btn.style.background = style?.bg || '#f0c040';
    this._btn.style.color = style?.color || '#1a0f00';
    this._btn.onclick = onClick;
  }

  hideButton() {
    this._btn.style.display = 'none';
    this._btn.style.background = '';
    this._btn.style.color = '';
    this._btn.onclick = null;
  }

  hideLoading() {
    const el = document.getElementById('loading');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }
  }

  // ── 교환 버튼 ──

  /** 교환 콜백 등록 */
  onSwap(callback) {
    this._swapCallback = callback;
  }

  /** 교환 버튼 표시/숨김 */
  setSwapVisible(visible) {
    this._swap.style.visibility = visible ? '' : 'hidden';
  }

  /** 쿨타임 시작 */
  startSwapCooldown(seconds) {
    this._swapCooldown = seconds;
    this._swap.disabled = true;
    this._updateSwapLabel();

    if (this._swapTimer) clearInterval(this._swapTimer);
    this._swapTimer = setInterval(() => {
      this._swapCooldown--;
      if (this._swapCooldown <= 0) {
        this._swapCooldown = 0;
        this._swap.disabled = false;
        clearInterval(this._swapTimer);
        this._swapTimer = null;
      }
      this._updateSwapLabel();
    }, 1000);
  }

  _updateSwapLabel() {
    if (this._swapCooldown > 0) {
      this._swap.innerHTML = `🔄 교환 <span class="cooldown">${this._swapCooldown}s</span>`;
    } else {
      this._swap.textContent = '🔄 교환';
    }
  }
}
