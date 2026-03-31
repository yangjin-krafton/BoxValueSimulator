/**
 * 라운드 생명주기 — startNewRound / endCurrentRound / finishBoxAndContinue 등.
 * setupRoundFlow(ctx) 호출 시 이벤트를 등록하고 공개 함수를 반환한다.
 */
import { generateBoxSet } from '../systems/BoxGenerator.js';

export function setupRoundFlow(ctx) {
  const {
    bus, ruleEngine, gameState, sceneMgr, hud, coins, audio,
    roundMgr, displayMgr, couponSys,
    boxSelection, unboxing, displayShelf, cardDeck,
    endRoundBtn, cardSelection3D,
  } = ctx;

  // ── 디스플레이 동기화 ──

  function refreshDisplay3D() {
    displayShelf.updateTotal(displayMgr.getTotal(), roundMgr.targetValue);
  }

  bus.on('display:added', async ({ slotIndex, product }) => {
    await displayShelf.setSlotProduct(slotIndex, product);
    refreshDisplay3D();
  });
  bus.on('display:cleared', () => { displayShelf.clearAll(); refreshDisplay3D(); });
  bus.on('display:update',  () => refreshDisplay3D());

  // ── 새 라운드 ──

  function startNewRound() {
    sceneMgr.randomizeFloorPalette();
    coins.clearFloor();

    const boxSet    = generateBoxSet(ruleEngine);
    const roundCtx  = roundMgr.startRound(boxSet);
    gameState.setBoxSet(boxSet);
    gameState.setRoundInfo(roundMgr.round, roundMgr.targetValue);
    if (roundCtx.bonusMoney > 0) gameState.earnMoney(roundCtx.bonusMoney);

    displayMgr.reset();
    displayShelf.clearAll();
    displayShelf.updateRound(roundMgr.round);
    displayShelf.updateTotal(0, roundMgr.targetValue);
    endRoundBtn.hide();

    gameState.setPhase('box_selection');
    boxSelection.spawnBoxes(boxSet);

    refreshDisplay3D();
    hud.setHint('상자를 클릭해서 선택하세요');
    hud.hideButton();
    hud.setSwapVisible(true);
    hud.updateMoney(gameState.state.money);
  }

  // ── 저장 복구 ──

  function resumeFromSave() {
    const boxSet = gameState.state.boxSet;
    const layout = gameState.state.layout || null;
    gameState.setPhase('box_selection');
    boxSelection.spawnBoxes(boxSet, layout);
    gameState.state.boxStates.forEach((s, i) => { if (s === 'done') boxSelection.hideBox(i); });

    if (gameState.state.boxStates.filter(s => s === 'shelf').length <= 0) {
      startNewRound(); return;
    }

    roundMgr.round       = gameState.state.round       || 1;
    roundMgr.targetValue = gameState.state.targetValue || 0;
    displayShelf.updateRound(roundMgr.round);
    displayShelf.updateTotal(displayMgr.getTotal(), roundMgr.targetValue);
    refreshDisplay3D();
    hud.setHint('상자를 클릭해서 선택하세요');
    hud.setSwapVisible(true);
    hud.hideButton();
    hud.updateMoney(gameState.state.money);
  }

  // ── 클리어 체크 ──

  function checkRoundClear() {
    const { cleared } = roundMgr.checkClear(displayMgr.getTotal());
    if (cleared && !roundMgr.isEnded) refreshDisplay3D();
  }

  // ── 상자 처리 완료 → 다음 단계 ──

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
          endRoundBtn.show();
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
    endRoundBtn.hide();
    const result = roundMgr.endRound(displayMgr.getTotal());

    hud.showClearBanner(result.ratio, () => {
      displayMgr.collectAndClear();

      if (result.cleared) {
        boxSelection.clear();
        couponSys.startSelection(result.rerollCount);
        audio.play('coupon');

        const onPick = (i) => {
          const picked = couponSys.selectCard(i);
          if (picked) cardDeck.addCard(picked);
          gameState.syncCoupons(couponSys.getOwnedCards());
          sceneMgr.fadeTransition(1.4, () => startNewRound());
        };

        cardSelection3D.show(
          couponSys.currentChoices,
          couponSys.rerollsRemaining,
          onPick,
          () => {
            couponSys.reroll();
            cardSelection3D.refresh(couponSys.currentChoices, couponSys.rerollsRemaining);
          },
          () => { couponSys.skipSelection(); sceneMgr.fadeTransition(1.4, () => startNewRound()); },
        );
      } else {
        sceneMgr.fadeTransition(1.4, () => startNewRound());
      }
    });
  }

  endRoundBtn.onClick(() => endCurrentRound());

  return { startNewRound, resumeFromSave, finishBoxAndContinue, refreshDisplay3D };
}
