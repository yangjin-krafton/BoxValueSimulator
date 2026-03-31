import * as THREE from 'three';
import { createContext }   from './game/context.js';
import { setupRoundFlow }  from './game/roundFlow.js';
import { setupBoxEvents }  from './game/boxEvents.js';
import { loadProducts }    from './data/products.js';

// ── 의존성 조립 ──
const ctx  = createContext();
const flow = setupRoundFlow(ctx);
setupBoxEvents(ctx, flow);

const {
  sceneMgr, gameState, hud, coins, tapPin, audio,
  boxSelection, unboxing, displayShelf, floorUI,
  cardDeck, cardSelection3D, slotFullBubble,
} = ctx;

// ── 렌더 루프 ──
sceneMgr.startLoop((dt) => {
  const phase = gameState.state.phase;
  if (phase === 'box_selection') boxSelection.updateShelf(dt);
  if (phase === 'flying' || phase === 'playable' || phase === 'opening'
      || phase === 'result' || unboxing._selling) {
    unboxing.update(dt, sceneMgr.clock.elapsedTime);
  }
  coins.update(dt);
  tapPin.update(dt);
  slotFullBubble.update(dt);
  displayShelf.update(dt, sceneMgr.clock.elapsedTime);
  floorUI.update(dt, sceneMgr.clock.elapsedTime);
  cardDeck.update(dt);
  cardSelection3D.update(dt);
  audio.update(dt);
});

// ── 디버그 ──
window.debug = {
  offlineBonus(hours = 2) {
    const raw = localStorage.getItem('boxsim_save_v2');
    if (!raw) { console.warn('세이브 없음'); return; }
    const data = JSON.parse(raw);
    data.savedAt = Date.now() - hours * 3_600_000;
    localStorage.setItem('boxsim_save_v2', JSON.stringify(data));
    console.log(`savedAt을 ${hours}시간 전으로 설정. 새로고침하세요.`);
  },
  setMoney(amount) {
    ctx.gameState.state.money = amount; ctx.gameState.save();
    ctx.hud.updateMoney(amount);
    console.log(`재화: ₩${amount.toLocaleString()}`);
  },
  clearSave() { ctx.gameState.clearSave(); console.log('세이브 삭제됨. 새로고침하세요.'); },
  state()  { console.log(JSON.parse(JSON.stringify(ctx.gameState.state))); },
  round()  { console.log('라운드:', ctx.roundMgr.getInfo(), '진열:', ctx.displayMgr.getState()); },
  rules()  { console.log('룰엔진:', ctx.ruleEngine.debug()); },
  async addCard() {
    const { COUPON_CARDS } = await import('./data/couponCards.js');
    const card = COUPON_CARDS[Math.floor(Math.random() * COUPON_CARDS.length)];
    ctx.cardDeck.addCard(card);
    console.log('카드 추가:', card.name);
  },
};
console.log('🔧 debug.state() / debug.round() / debug.setMoney(n) / debug.clearSave() / debug.addCard()');

// ── 시작 ──
(async function init() {
  await loadProducts();
  hud.hideLoading();

  const save = gameState.load();
  if (save.ok) {
    if (save.offlineBonus > 0) {
      hud.updateMoney(gameState.state.money);
      hud.setHint(`오프라인 보상! 코인을 터치하세요 (+₩${save.offlineBonus.toLocaleString()})`);
      hud.setSwapVisible(false);
      hud.hideButton();
      const pileTopY = coins.spawnPile(save.offlineBonus, (amount) => {
        tapPin.hide();
        gameState.earnMoney(amount);
        hud.startCoinCountUp(amount, Math.max(3, Math.floor(amount / 1000)));
        audio.play('sell');
        setTimeout(() => flow.resumeFromSave(), 1500);
      });
      tapPin.show(new THREE.Vector3(0, pileTopY, 0), 0.5);
    } else {
      flow.resumeFromSave();
    }
  } else {
    flow.startNewRound();
  }
})();
