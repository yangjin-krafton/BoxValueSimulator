/**
 * DOM 기반 HUD (v2 — 진열 슬롯, 라운드 정보, 개봉 후 선택 UI 포함).
 */
export class HUD {
  constructor(bus) {
    this.bus = bus;
    this._money   = document.getElementById('money-display');
    this._hint    = document.getElementById('hint');
    this._popup   = document.getElementById('grade-popup');
    this._btn     = document.getElementById('btn-action');
    this._swap    = document.getElementById('btn-swap');

    // 라운드 정보는 바닥 보드에 표시 (DisplayShelf3D)

    // v2: 개봉 후 선택
    this._postChoice = document.getElementById('post-open-choice');
    this._btnSellNow = document.getElementById('btn-sell-now');
    this._btnDisplay = document.getElementById('btn-display');

    // v2: 쿠폰 카드 선택
    this._couponSelect = document.getElementById('coupon-select');
    this._couponCards = document.getElementById('coupon-cards');
    this._couponReroll = document.getElementById('coupon-reroll');
    this._couponSkip = document.getElementById('coupon-skip');

    // v2: 라운드 클리어 배너
    this._clearBanner = document.getElementById('round-clear-banner');

    /** 교환 쿨타임 */
    this._swapCooldown = 0;
    this._swapTimer = null;
    this._swapCallback = null;
    this._swap.addEventListener('click', () => {
      if (this._swapCooldown > 0 || !this._swapCallback) return;
      this._swapCallback();
      this.startSwapCooldown(60);
    });

    /** 코인 카운트업 */
    this._displayAmount = 0;
    this._targetAmount = 0;
    this._coinQueue = [];
    this._tickRAF = null;
    this._lastTickTime = 0;

    bus.on('money:change', (v) => {
      if (v < this._displayAmount && this._coinQueue.length === 0) {
        this._displayAmount = v;
        this._targetAmount = v;
        this._renderMoney();
        this._bounce();
      }
    });
  }

  // ── 머니 ──

  updateMoney(amount) {
    this._displayAmount = amount;
    this._targetAmount = amount;
    this._coinQueue.length = 0;
    this._renderMoney();
  }

  startCoinCountUp(totalAmount, coinCount) {
    const perCoin = totalAmount / coinCount;
    const baseDelay = 0.03;
    const now = performance.now() / 1000;
    const startDelay = 0.6;

    this._coinQueue.length = 0;
    for (let i = 0; i < coinCount; i++) {
      this._coinQueue.push({ amount: perCoin, time: now + startDelay + i * baseDelay });
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
        if (this._coinQueue.length === 0) this._displayAmount = this._targetAmount;
        this._renderMoney();
        this._bounce();
      }
      if (this._coinQueue.length > 0) this._tickLoop();
      else this._tickRAF = null;
    });
  }

  _renderMoney() {
    const v = Math.round(this._displayAmount);
    this._money.innerHTML = `<span class="coin-icon">🪙</span>₩ ${v.toLocaleString()}`;
  }

  _bounce() {
    this._money.classList.remove('bouncing');
    void this._money.offsetWidth;
    this._money.classList.add('bouncing');
  }

  // ── 힌트 & 팝업 ──

  setHint(text, visible = true) {
    this._hint.textContent = text;
    this._hint.style.opacity = visible ? '1' : '0';
  }

  showProductResult(product, boxPrice = 0) {
    const colorMap = {
      SSSSS: 'ff00ff', SSSS: '88ff44', SSS: '44ffff',
      SS: 'ff44aa', S: 'ff8800', A: 'ffdd00', B: '7799ff', C: '888888',
    };
    const profit = product.salePrice - boxPrice;
    const pct = boxPrice > 0 ? Math.round((profit / boxPrice) * 100) : null;
    const pctColor = pct === null ? '#ffffff' : (pct >= 0 ? '#66ff88' : '#ff6655');
    const pctText = pct !== null
      ? `<span style="font-size:1rem;color:${pctColor}">${pct >= 0 ? '이익' : '손실'} ${pct >= 0 ? '+' : ''}${pct}%</span>`
      : '';
    const hiddenTag = product.isHidden ? '<span style="color:#ff00ff;font-size:1rem"> HIDDEN!</span>' : '';
    const desc = product.def.description
      ? `<br><span style="font-size:0.85rem;opacity:0.7;line-height:1.3">${product.def.description}</span>`
      : '';
    const typeTag = product.def.type === 'card'
      ? '<span style="font-size:0.8rem;color:#7ad;"> CARD</span>'
      : '';
    this._popup.innerHTML =
      `${product.grade} 등급!${hiddenTag}${typeTag}<br>` +
      `<span style="font-size:1.2rem;opacity:0.8">${product.def.name}</span><br>` +
      `<span style="font-size:1.5rem">₩ ${product.salePrice.toLocaleString()}</span>` +
      (pctText ? ` ${pctText}` : '') + desc;
    this._popup.style.color = '#' + (colorMap[product.grade] || 'ffffff');
    this._popup.style.opacity = '1';
    setTimeout(() => { this._popup.style.opacity = '0'; }, 3000);
  }

  // ── 버튼 ──

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

  // ── 교환 ──

  onSwap(callback) { this._swapCallback = callback; }

  setSwapVisible(visible) {
    this._swap.style.visibility = visible ? '' : 'hidden';
  }

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

  // ── v2: 라운드 정보 ──

  /** 라운드 정보 — 보드에서 표시하므로 noop (호출 호환 유지) */
  updateRoundInfo() {}
  updateRoundRatio() {}

  // ── v2: 개봉 후 선택 (즉시 판매 / 진열) ──

  showPostOpenChoice(product, onSell, onDisplay) {
    this._postChoice.style.display = 'flex';
    this._btnSellNow.textContent = `💰 즉시 판매 ₩${product.salePrice.toLocaleString()}`;
    this._btnSellNow.onclick = () => {
      this._postChoice.style.display = 'none';
      onSell();
    };
    this._btnDisplay.onclick = () => {
      this._postChoice.style.display = 'none';
      onDisplay();
    };
  }

  hidePostOpenChoice() {
    this._postChoice.style.display = 'none';
  }

  // ── v2: 라운드 클리어 배너 ──

  showClearBanner(ratio, onDone) {
    const ratioEl = this._clearBanner.querySelector('.clear-ratio');
    ratioEl.textContent = `달성률 ${Math.round(ratio * 100)}%`;
    this._clearBanner.style.display = 'block';
    setTimeout(() => {
      this._clearBanner.style.display = 'none';
      if (onDone) onDone();
    }, 2000);
  }

  // ── v2: 쿠폰 카드 선택 ──

  showCouponSelect(choices, rerolls, onSelect, onReroll, onSkip) {
    this._couponSelect.style.display = 'flex';

    this._renderCouponChoices(choices, onSelect);

    this._couponReroll.textContent = `🔄 리롤 (${rerolls}회)`;
    this._couponReroll.disabled = rerolls <= 0;
    this._couponReroll.onclick = () => {
      if (onReroll) onReroll();
    };

    this._couponSkip.onclick = () => {
      this._couponSelect.style.display = 'none';
      if (onSkip) onSkip();
    };
  }

  updateCouponChoices(choices, rerolls, onSelect) {
    this._renderCouponChoices(choices, onSelect);
    this._couponReroll.textContent = `🔄 리롤 (${rerolls}회)`;
    this._couponReroll.disabled = rerolls <= 0;
  }

  _renderCouponChoices(choices, onSelect) {
    this._couponCards.innerHTML = '';
    choices.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'coupon-card';
      el.innerHTML =
        `<div class="card-name">${card.name}</div>` +
        `<div class="card-cat">${card.category}</div>` +
        `<div class="card-desc">${card.description}</div>`;
      el.onclick = () => {
        this._couponSelect.style.display = 'none';
        onSelect(i);
      };
      this._couponCards.appendChild(el);
    });
  }

  hideCouponSelect() {
    this._couponSelect.style.display = 'none';
  }
}
