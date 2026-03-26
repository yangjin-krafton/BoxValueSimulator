import * as THREE from 'three';
import { EventBus } from './core/EventBus.js';
import { GameStateManager } from './core/GameStateManager.js';
import { AssetLoader } from './core/AssetLoader.js';
import { SceneManager } from './rendering/SceneManager.js';
import { CoinSystem } from './rendering/CoinSystem.js';
import { TapIndicator } from './rendering/TapIndicator.js';
import { BOX_H } from './rendering/BoxMesh.js';
import { BoxSelectionScene } from './scenes/BoxSelectionScene.js';
import { UnboxingScene } from './scenes/UnboxingScene.js';
import { HUD } from './ui/HUD.js';
import { generateBoxSet } from './systems/BoxGenerator.js';
import { loadProducts } from './data/products.js';

// ── 초기화 ──
const bus        = new EventBus();
const gameState  = new GameStateManager(bus);
const assetLoader = new AssetLoader();
const sceneMgr   = new SceneManager();
const hud        = new HUD(bus);
const coins      = new CoinSystem(sceneMgr.scene, sceneMgr.camera);

const boxSelection = new BoxSelectionScene(sceneMgr, gameState, bus);
const unboxing     = new UnboxingScene(sceneMgr, gameState, bus, assetLoader);
const tapPin       = new TapIndicator(sceneMgr.scene);

// ── 새 세트 시작 ──
function startNewSet() {
  coins.clearFloor();
  const boxSet = generateBoxSet();
  gameState.setBoxSet(boxSet);
  gameState.setPhase('box_selection');
  boxSelection.spawnBoxes(boxSet);
  hud.setHint('상자를 클릭해서 선택하세요');
  hud.hideButton();
  hud.setSwapVisible(true);
  hud.updateMoney(gameState.state.money);
}

/** 저장된 세트 복원 */
function resumeFromSave() {
  const boxSet = gameState.state.boxSet;
  const layout = gameState.state.layout || null;
  gameState.setPhase('box_selection');
  boxSelection.spawnBoxes(boxSet, layout);

  // done 상자 숨기기
  gameState.state.boxStates.forEach((s, i) => {
    if (s === 'done') boxSelection.hideBox(i);
  });

  const remaining = gameState.state.boxStates.filter(s => s === 'shelf').length;
  if (remaining > 0) {
    hud.setHint('상자를 클릭해서 선택하세요');
    hud.setSwapVisible(true);
  } else {
    // 모두 개봉 완료 상태면 새 세트
    startNewSet();
    return;
  }
  hud.hideButton();
  hud.updateMoney(gameState.state.money);
}

// ── 교환 버튼 ──
function swapBoxes() {
  if (gameState.state.phase !== 'box_selection') return;
  sceneMgr.fadeTransition(1.4, () => {
    // 어두운 시점: 상자 교체
    coins.clearFloor();
    const boxSet = generateBoxSet();
    gameState.setBoxSet(boxSet);
    boxSelection.spawnBoxes(boxSet);
    hud.setHint('새 상자가 도착했습니다!');
  });
}
hud.onSwap(swapBoxes);

// ── 이벤트 ──
bus.on('box:select', (index) => {
  const effectivePrice = boxSelection.getEffectivePrice(index);
  if (!gameState.spendMoney(effectivePrice)) {
    hud.setHint(`자금 부족! (필요: ₩${effectivePrice.toLocaleString()})`);
    boxSelection.setTagsVisible(true);
    return;
  }

  // 코인 뿌리기 (구매)
  const meshData = boxSelection.getBoxMesh(index);
  if (meshData) {
    const spawnPos = meshData.group.position.clone();
    spawnPos.y += 1;
    coins.spendCoins(effectivePrice, spawnPos);
  }

  boxSelection.consumeBonus();
  gameState.selectBox(index);
  gameState.setPhase('flying');
  hud.setSwapVisible(false);

  if (meshData) unboxing.startUnboxing(meshData);

  hud.setHint('', false);
  hud.hideButton();
});

bus.on('box:landed', () => {
  hud.setHint('상자를 클릭하여 개봉하세요');
  hud.showButton('개봉하기', () => unboxing.triggerOpen());
  // 상자 위에 탭 핀 (상자 크기 반영)
  const md = boxSelection.getBoxMesh(gameState.state.selectedBoxIndex);
  if (md) tapPin.show(md.group.position, BOX_H * md.scale + 0.5);
});

bus.on('box:open', () => {
  tapPin.hide();
  const product = unboxing.productInstance;
  if (product) {
    hud.showProductResult(product);
    hud.showButton(
      `판매하기  ₩${product.salePrice.toLocaleString()}`,
      () => sellAndContinue(),
      { bg: '#2e7d32', color: '#ffffff' },
    );
  }
});

function sellAndContinue() {
  const product = gameState.state.currentProduct;
  if (product) {
    // 상품 위치에서 코인 폭발 → HUD로 흡수
    const productPos = unboxing.productRenderer.pivot.position.clone();
    const coinCount = Math.max(3, Math.floor(product.salePrice / 1000));
    coins.earnCoins(product.salePrice, productPos);

    // 코인 바운스 카운트업 (sellProduct 전에 현재 금액 기준으로 시작)
    hud.startCoinCountUp(product.salePrice, coinCount);
    gameState.sellProduct();
  }

  hud.hideButton();
  hud.setHint('');

  const idx = gameState.state.selectedBoxIndex;
  gameState.setBoxState(idx, 'done');
  boxSelection.hideBox(idx);

  // 카메라 서서히 복원 → 완료 후 다음 단계
  unboxing.startSellTransition(() => {
    const remaining = gameState.state.boxStates.filter(s => s === 'shelf').length;
    if (remaining > 0) {
      gameState.setPhase('box_selection');
      boxSelection.setTagsVisible(true);
      hud.setHint('다음 상자를 선택하세요');
      hud.hideButton();
      hud.setSwapVisible(true);
    } else {
      hud.showButton('새 세트 열기', () => {
        sceneMgr.fadeTransition(1.4, () => startNewSet());
      });
      hud.setHint('모든 상자를 열었습니다!');
      hud.setSwapVisible(false);
    }
  });
}

// ── 디버그 콘솔 명령 ──
window.debug = {
  /** 오프라인 보상 테스트: debug.offlineBonus(시간) — 예: debug.offlineBonus(2) = 2시간 */
  offlineBonus(hours = 2) {
    const fakeTime = Date.now() - hours * 60 * 60 * 1000;
    const raw = localStorage.getItem('boxsim_save');
    if (!raw) { console.warn('세이브 없음'); return; }
    const data = JSON.parse(raw);
    data.savedAt = fakeTime;
    localStorage.setItem('boxsim_save', JSON.stringify(data));
    console.log(`savedAt을 ${hours}시간 전으로 설정. 새로고침하세요.`);
  },
  /** 재화 설정: debug.setMoney(50000) */
  setMoney(amount) {
    gameState.state.money = amount;
    gameState.save();
    hud.updateMoney(amount);
    console.log(`재화: ₩${amount.toLocaleString()}`);
  },
  /** 세이브 삭제: debug.clearSave() */
  clearSave() {
    gameState.clearSave();
    console.log('세이브 삭제됨. 새로고침하세요.');
  },
  /** 현재 상태 출력: debug.state() */
  state() {
    console.log(JSON.parse(JSON.stringify(gameState.state)));
  },
};
console.log('🔧 디버그 명령: debug.offlineBonus(시간), debug.setMoney(금액), debug.clearSave(), debug.state()');

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
});

// ── 시작 ──
loadProducts().then(() => {
  hud.hideLoading();
  const save = gameState.load();
  if (save.ok) {
    if (save.offlineBonus > 0) {
      // 코인 산 표시 → 클릭하면 보상 흡수 후 게임 재개
      hud.updateMoney(gameState.state.money);
      hud.setHint(`오프라인 보상! 코인을 터치하세요 (+₩${save.offlineBonus.toLocaleString()})`);
      hud.setSwapVisible(false);
      hud.hideButton();

      const pileTopY = coins.spawnPile(save.offlineBonus, (amount) => {
        tapPin.hide();
        const coinCount = Math.max(3, Math.floor(amount / 1000));
        gameState.earnMoney(amount);
        hud.startCoinCountUp(amount, coinCount);
        setTimeout(() => resumeFromSave(), 1500);
      });
      // 코인 산 꼭대기 위에 핀
      tapPin.show(new THREE.Vector3(0, pileTopY, 0), 0.5);
    } else {
      resumeFromSave();
    }
  } else {
    startNewSet();
  }
});
