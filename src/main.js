import * as THREE from 'three';
import { EventBus } from './core/EventBus.js';
import { GameStateManager } from './core/GameStateManager.js';
import { AssetLoader } from './core/AssetLoader.js';
import { SceneManager } from './rendering/SceneManager.js';
import { CoinSystem } from './rendering/CoinSystem.js';
import { TapIndicator } from './rendering/TapIndicator.js';
import { BoxSelectionScene } from './scenes/BoxSelectionScene.js';
import { UnboxingScene } from './scenes/UnboxingScene.js';
import { DisplayShelf3D, SLOT_POSITIONS } from './scenes/DisplayShelf3D.js';
import { CardDeck3D } from './scenes/CardDeck3D.js';
import { HUD } from './ui/HUD.js';
import { RuleEngine } from './systems/RuleEngine.js';
import { RoundManager } from './systems/RoundManager.js';
import { DisplaySlotManager } from './systems/DisplaySlotManager.js';
import { CouponCardSystem } from './systems/CouponCardSystem.js';
import { generateBoxSet } from './systems/BoxGenerator.js';
import { loadProducts } from './data/products.js';

// ── 초기화 ──
const bus         = new EventBus();
const ruleEngine  = new RuleEngine();
const gameState   = new GameStateManager(bus);
const assetLoader = new AssetLoader();
const sceneMgr    = new SceneManager();
const hud         = new HUD(bus);
const coins       = new CoinSystem(sceneMgr.scene, sceneMgr.camera);

const roundMgr    = new RoundManager(bus, ruleEngine);
const displayMgr  = new DisplaySlotManager(bus, ruleEngine);
const couponSys   = new CouponCardSystem(bus, ruleEngine);

const boxSelection  = new BoxSelectionScene(sceneMgr, gameState, bus);
const unboxing      = new UnboxingScene(sceneMgr, gameState, bus, assetLoader, ruleEngine);
const displayShelf  = new DisplayShelf3D(sceneMgr, assetLoader);
const cardDeck      = new CardDeck3D(sceneMgr);
const tapPin        = new TapIndicator(sceneMgr.scene);

const _ray = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

let _targetSlotIndex = -1;

// ── 3D 동기화 ──
function refreshDisplay3D() {
  displayShelf.updateTotal(displayMgr.getTotal(), roundMgr.targetValue);
}

bus.on('display:added', async ({ slotIndex, product }) => {
  await displayShelf.setSlotProduct(slotIndex, product);
  refreshDisplay3D();
});
bus.on('display:cleared', () => { displayShelf.clearAll(); refreshDisplay3D(); });
bus.on('display:update', () => refreshDisplay3D());

// ── 새 라운드 ──
function startNewRound() {
  sceneMgr.randomizeFloorPalette();
  coins.clearFloor();
  _targetSlotIndex = -1;

  const boxSet = generateBoxSet(ruleEngine);
  gameState.setBoxSet(boxSet);

  const ctx = roundMgr.startRound(boxSet);
  gameState.setRoundInfo(roundMgr.round, roundMgr.targetValue);
  if (ctx.bonusMoney > 0) gameState.earnMoney(ctx.bonusMoney);

  displayMgr.reset();
  displayShelf.clearAll();
  displayShelf.updateRound(roundMgr.round);
  displayShelf.updateTotal(0, roundMgr.targetValue);

  gameState.setPhase('box_selection');
  boxSelection.spawnBoxes(boxSet);

  refreshDisplay3D();
  hud.setHint('상자를 클릭해서 선택하세요');
  hud.hideButton();
  hud.setSwapVisible(true);
  hud.updateMoney(gameState.state.money);
}

function resumeFromSave() {
  const boxSet = gameState.state.boxSet;
  const layout = gameState.state.layout || null;
  gameState.setPhase('box_selection');
  boxSelection.spawnBoxes(boxSet, layout);
  gameState.state.boxStates.forEach((s, i) => { if (s === 'done') boxSelection.hideBox(i); });

  if (gameState.state.boxStates.filter(s => s === 'shelf').length <= 0) { startNewRound(); return; }

  roundMgr.round = gameState.state.round || 1;
  roundMgr.targetValue = gameState.state.targetValue || 0;
  displayShelf.updateRound(roundMgr.round);
  displayShelf.updateTotal(displayMgr.getTotal(), roundMgr.targetValue);
  refreshDisplay3D();
  hud.setHint('상자를 클릭해서 선택하세요');
  hud.setSwapVisible(true);
  hud.hideButton();
  hud.updateMoney(gameState.state.money);
}

// ── 교환 ──
function swapBoxes() {
  if (gameState.state.phase !== 'box_selection') return;
  sceneMgr.fadeTransition(1.4, () => {
    sceneMgr.randomizeFloorPalette();
    coins.clearFloor();
    const boxSet = generateBoxSet(ruleEngine);
    gameState.setBoxSet(boxSet);
    boxSelection.spawnBoxes(boxSet);
    hud.setHint('새 상자가 도착했습니다!');
  });
}
hud.onSwap(swapBoxes);

// ── 상자 선택 ──
bus.on('box:select', (index) => {
  // 빈 슬롯 확인
  const emptySlot = displayShelf.getFirstEmptySlot();
  if (emptySlot === -1) {
    hud.setHint('슬롯이 가득 찼습니다! 판매 버튼을 눌러 비워주세요');
    boxSelection.setTagsVisible(true);
    return;
  }

  const effectivePrice = boxSelection.getEffectivePrice(index);
  if (!gameState.spendMoney(effectivePrice)) {
    hud.setHint(`자금 부족! (필요: ₩${effectivePrice.toLocaleString()})`);
    boxSelection.setTagsVisible(true);
    return;
  }

  _targetSlotIndex = emptySlot;
  const slotPos = SLOT_POSITIONS[_targetSlotIndex];

  const meshData = boxSelection.getBoxMesh(index);
  if (meshData) {
    const spawnPos = meshData.group.position.clone();
    spawnPos.y += 1;
    coins.spendCoins(effectivePrice, spawnPos);
  }

  gameState.state.lastBoxPrice = effectivePrice;
  boxSelection.consumeBonus();
  gameState.selectBox(index);
  gameState.setPhase('flying');
  hud.setSwapVisible(false);

  if (meshData) unboxing.startUnboxing(meshData, slotPos);
  hud.setHint('', false);
  hud.hideButton();
});

// ── 상자 착지 → 바로 개봉 ──
bus.on('box:landed', () => {
  // 착지하면 자동 개봉 (클릭 대기 없음)
  unboxing.triggerOpen();
});

// ── 개봉 완료 → 바로 슬롯에 배치 ──
bus.on('box:open', () => {
  tapPin.hide();
  roundMgr.onBoxOpened();
  gameState.incrementBoxOpened();

  const product = unboxing.productInstance;
  if (!product) return;

  hud.showProductResult(product, gameState.state.lastBoxPrice || 0);

  // 바로 슬롯에 배치
  if (_targetSlotIndex >= 0) {
    displayMgr.addToSlot(product);
    gameState.state.currentProduct = null;
  }
  _targetSlotIndex = -1;

  // 잠시 보여준 후 정리
  setTimeout(() => finishBoxAndContinue(), 800);
});

// ── 판매 버튼 클릭 (보드판 위) ──
addEventListener('pointerdown', (e) => {
  if (gameState.state.phase !== 'box_selection') return;

  _mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  _ray.setFromCamera(_mouse, sceneMgr.camera);

  // 판매 버튼 히트
  const sellTargets = displayShelf.getSellButtonTargets();
  const sellHits = _ray.intersectObjects(sellTargets);
  if (sellHits.length > 0) {
    const slotIdx = sellHits[0].object.userData.sellSlotIndex;
    if (slotIdx !== undefined) {
      sellSlotProduct(slotIdx);
      e.stopPropagation();
    }
  }
});

// ── 슬롯 판매 처리 ──
function sellSlotProduct(slotIndex) {
  const state = displayMgr.getState();
  const slotData = state.slots[slotIndex];
  if (!slotData || !slotData.product) return;

  const product = slotData.product;
  const pos = displayShelf.getSlotPosition(slotIndex);
  const coinCount = Math.max(3, Math.floor(product.salePrice / 1000));
  coins.earnCoins(product.salePrice, pos);
  hud.startCoinCountUp(product.salePrice, coinCount);
  gameState.earnMoney(product.salePrice);

  displayMgr.slots[slotIndex] = null;
  displayShelf.clearSlot(slotIndex);
  refreshDisplay3D();

  hud.setHint('슬롯을 비웠습니다');

  // 클리어 상태 재확인
  const { cleared } = roundMgr.checkClear(displayMgr.getTotal());
  if (!cleared) {
    hud.hideButton();
  }
}

// ── 라운드 클리어 체크 ──
function checkRoundClear() {
  const { cleared } = roundMgr.checkClear(displayMgr.getTotal());
  if (cleared && !roundMgr.isEnded) {
    refreshDisplay3D();
  }
}

// ── 상자 완료 → 다음 ──
function finishBoxAndContinue() {
  hud.hideButton();
  hud.setHint('');

  const idx = gameState.state.selectedBoxIndex;
  gameState.setBoxState(idx, 'done');
  boxSelection.hideBox(idx);

  checkRoundClear();

  unboxing.startSellTransition(() => {
    const remaining = gameState.state.boxStates.filter(s => s === 'shelf').length;
    const { cleared } = roundMgr.checkClear(displayMgr.getTotal());

    if (remaining > 0) {
      gameState.setPhase('box_selection');
      boxSelection.setTagsVisible(true);
      refreshDisplay3D();

      if (cleared) {
        hud.setHint('목표 달성! 계속 열거나 라운드 종료');
        hud.showButton('라운드 종료', () => endCurrentRound(), { bg: '#1565c0', color: '#fff' });
      } else {
        hud.setHint('다음 상자를 선택하세요');
      }
      hud.setSwapVisible(!cleared);
    } else {
      if (cleared) {
        endCurrentRound();
      } else {
        hud.setHint('라운드 실패...');
        hud.showButton('새 라운드', () => sceneMgr.fadeTransition(1.4, () => startNewRound()));
        hud.setSwapVisible(false);
      }
    }
  });
}

// ── 라운드 종료 ──
function endCurrentRound() {
  const result = roundMgr.endRound(displayMgr.getTotal());

  hud.showClearBanner(result.ratio, () => {
    displayMgr.collectAndClear();

    if (result.cleared) {
      couponSys.startSelection(result.rerollCount);
      const onPick = (i) => {
        const picked = couponSys.selectCard(i);
        if (picked) cardDeck.addCard(picked);
        gameState.syncCoupons(couponSys.getOwnedCards());
        sceneMgr.fadeTransition(1.4, () => startNewRound());
      };
      hud.showCouponSelect(
        couponSys.currentChoices, couponSys.rerollsRemaining,
        onPick,
        () => {
          couponSys.reroll();
          hud.updateCouponChoices(couponSys.currentChoices, couponSys.rerollsRemaining, onPick);
        },
        () => { couponSys.skipSelection(); sceneMgr.fadeTransition(1.4, () => startNewRound()); },
      );
    } else {
      sceneMgr.fadeTransition(1.4, () => startNewRound());
    }
  });
}

// ── 디버그 ──
window.debug = {
  offlineBonus(hours = 2) {
    const fakeTime = Date.now() - hours * 60 * 60 * 1000;
    const raw = localStorage.getItem('boxsim_save_v2');
    if (!raw) { console.warn('세이브 없음'); return; }
    const data = JSON.parse(raw);
    data.savedAt = fakeTime;
    localStorage.setItem('boxsim_save_v2', JSON.stringify(data));
    console.log(`savedAt을 ${hours}시간 전으로 설정. 새로고침하세요.`);
  },
  setMoney(amount) {
    gameState.state.money = amount; gameState.save();
    hud.updateMoney(amount);
    console.log(`재화: ₩${amount.toLocaleString()}`);
  },
  clearSave() { gameState.clearSave(); console.log('세이브 삭제됨. 새로고침하세요.'); },
  state() { console.log(JSON.parse(JSON.stringify(gameState.state))); },
  round() { console.log('라운드:', roundMgr.getInfo(), '진열:', displayMgr.getState()); },
  rules() { console.log('룰엔진:', ruleEngine.debug()); },
  async addCard() {
    const { COUPON_CARDS } = await import('./data/couponCards.js');
    const card = COUPON_CARDS[Math.floor(Math.random() * COUPON_CARDS.length)];
    cardDeck.addCard(card);
    console.log('카드 추가:', card.name);
  },
};
console.log('🔧 디버그: debug.state(), debug.round(), debug.setMoney(금액), debug.clearSave(), debug.addCard()');

// ── 렌더 루프 ──
sceneMgr.startLoop((dt) => {
  const phase = gameState.state.phase;
  if (phase === 'box_selection') boxSelection.updateShelf(dt);
  if (phase === 'flying' || phase === 'playable' || phase === 'opening' || phase === 'result'
      || unboxing._selling) {
    unboxing.update(dt, sceneMgr.clock.elapsedTime);
  }
  coins.update(dt);
  tapPin.update(dt);
  displayShelf.update(dt, sceneMgr.clock.elapsedTime);
  cardDeck.update(dt);
});

// ── 시작 ──
(async function init() {
  await loadProducts();
  hud.hideLoading();
  const save = gameState.load();
  if (save.ok) {
    if (save.offlineBonus > 0) {
      hud.updateMoney(gameState.state.money);
      hud.setHint(`오프라인 보상! 코인을 터치하세요 (+₩${save.offlineBonus.toLocaleString()})`);
      hud.setSwapVisible(false); hud.hideButton();
      const pileTopY = coins.spawnPile(save.offlineBonus, (amount) => {
        tapPin.hide();
        gameState.earnMoney(amount);
        hud.startCoinCountUp(amount, Math.max(3, Math.floor(amount / 1000)));
        setTimeout(() => resumeFromSave(), 1500);
      });
      tapPin.show(new THREE.Vector3(0, pileTopY, 0), 0.5);
    } else { resumeFromSave(); }
  } else { startNewRound(); }
})();
