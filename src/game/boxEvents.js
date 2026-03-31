/**
 * 상자 선택 / 개봉 / 판매 / 교환 이벤트 핸들러.
 * setupBoxEvents(ctx, flow) 호출 시 bus 이벤트와 DOM 리스너를 등록한다.
 */
import * as THREE from 'three';
import { SLOT_POSITIONS } from '../scenes/DisplayShelf3D.js';
import { generateBoxSet } from '../systems/BoxGenerator.js';
import { InputGuard } from '../core/InputGuard.js';

export function setupBoxEvents(ctx, { startNewRound, finishBoxAndContinue, refreshDisplay3D }) {
  const {
    bus, ruleEngine, gameState, sceneMgr, hud, coins, audio,
    roundMgr, displayMgr, displayShelf,
    boxSelection, unboxing, tapPin, endRoundBtn, slotFullBubble,
  } = ctx;

  const _ray   = new THREE.Raycaster();
  const _mouse = new THREE.Vector2();
  let _targetSlotIndex = -1;

  // ── 교환 ──

  function swapBoxes() {
    if (gameState.state.phase !== 'box_selection') return;
    audio.play('swap');
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
    const emptySlot = displayShelf.getFirstEmptySlot();
    if (emptySlot === -1) {
      audio.play('error');
      hud.setHint('슬롯이 가득 찼습니다! 판매 버튼을 눌러 비워주세요');
      boxSelection.setTagsVisible(true);
      slotFullBubble.show();
      return;
    }

    const effectivePrice = boxSelection.getEffectivePrice(index);
    if (!gameState.spendMoney(effectivePrice)) {
      audio.play('error');
      hud.setHint(`자금 부족! (필요: ₩${effectivePrice.toLocaleString()})`);
      boxSelection.setTagsVisible(true);
      return;
    }

    _targetSlotIndex = emptySlot;
    const meshData = boxSelection.getBoxMesh(index);
    if (meshData) {
      const spawnPos = meshData.group.position.clone();
      spawnPos.y += 1;
      coins.spendCoins(effectivePrice, spawnPos);
    }
    audio.play('purchase');

    gameState.state.lastBoxPrice = effectivePrice;
    boxSelection.consumeBonus();
    gameState.selectBox(index);
    gameState.setPhase('flying');
    hud.setSwapVisible(false);

    if (meshData) unboxing.startUnboxing(meshData, SLOT_POSITIONS[_targetSlotIndex]);
    hud.setHint('', false);
    hud.hideButton();
  });

  // ── 착지 → 자동 개봉 ──

  bus.on('box:landed', () => {
    audio.play('boxLand');
    unboxing.triggerOpen();
  });

  // ── 개봉 완료 ──

  bus.on('box:open', () => {
    audio.play('boxOpen');
    tapPin.hide();
    roundMgr.onBoxOpened();
    gameState.incrementBoxOpened();

    const product = unboxing.productInstance;
    if (!product) return;

    hud.showProductResult(product, gameState.state.lastBoxPrice || 0, () => {
      if (_targetSlotIndex >= 0) {
        displayMgr.addToSlot(product);
        gameState.state.currentProduct = null;
      }
      _targetSlotIndex = -1;
      finishBoxAndContinue();
    });
  });

  // ── 판매 버튼 (보드판 위 클릭) ──

  addEventListener('pointerdown', (e) => {
    if (InputGuard.blocked) return;
    if (gameState.state.phase !== 'box_selection') return;
    _mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    _ray.setFromCamera(_mouse, sceneMgr.camera);

    const sellHits = _ray.intersectObjects(displayShelf.getSellButtonTargets());
    if (sellHits.length > 0) {
      const slotIdx = sellHits[0].object.userData.sellSlotIndex;
      if (slotIdx !== undefined) { sellSlotProduct(slotIdx); e.stopPropagation(); }
    }
  });

  // ── 슬롯 판매 처리 ──

  function sellSlotProduct(slotIndex) {
    const slotData = displayMgr.getState().slots[slotIndex];
    if (!slotData?.product) return;

    const { product } = slotData;
    const coinCount = Math.max(3, Math.floor(product.salePrice / 1000));
    coins.earnCoins(product.salePrice, displayShelf.getSlotPosition(slotIndex));
    hud.startCoinCountUp(product.salePrice, coinCount);
    gameState.earnMoney(product.salePrice);
    audio.play('sell');

    displayMgr.slots[slotIndex] = null;
    displayShelf.clearSlot(slotIndex);
    refreshDisplay3D();
    hud.setHint('슬롯을 비웠습니다');

    const { cleared } = roundMgr.checkClear(displayMgr.getTotal());
    if (!cleared) { hud.hideButton(); endRoundBtn.hide(); }
  }
}
