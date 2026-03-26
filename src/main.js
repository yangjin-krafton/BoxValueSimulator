import { EventBus } from './core/EventBus.js';
import { GameStateManager } from './core/GameStateManager.js';
import { AssetLoader } from './core/AssetLoader.js';
import { SceneManager } from './rendering/SceneManager.js';
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

const boxSelection = new BoxSelectionScene(sceneMgr, gameState, bus);
const unboxing     = new UnboxingScene(sceneMgr, gameState, bus, assetLoader);

// ── 새 세트 시작 ──
function startNewSet() {
  const boxSet = generateBoxSet();
  gameState.setBoxSet(boxSet);
  gameState.setPhase('box_selection');
  boxSelection.spawnBoxes(boxSet);
  hud.setHint('상자를 클릭해서 선택하세요');
  hud.hideButton();
  hud.updateMoney(gameState.state.money);
}

// ── 이벤트 ──
bus.on('box:select', (index) => {
  const boxDef = gameState.state.boxSet.boxes[index];
  if (!gameState.spendMoney(boxDef.price)) {
    hud.setHint(`자금 부족! (필요: ₩${boxDef.price.toLocaleString()})`);
    boxSelection.setTagsVisible(true);   // 가격표 다시 표시
    return;
  }
  gameState.selectBox(index);
  gameState.setPhase('flying');

  const meshData = boxSelection.getBoxMesh(index);
  if (meshData) unboxing.startUnboxing(meshData);

  hud.setHint('', false);
  hud.hideButton();
});

bus.on('box:landed', () => {
  hud.setHint('상자를 클릭하여 개봉하세요');
  hud.showButton('개봉하기', () => unboxing.triggerOpen());
});

bus.on('box:open', () => {
  const product = unboxing.productInstance;
  if (product) {
    hud.showProductResult(product);
    hud.showButton('판매하기', () => sellAndContinue());
  }
});

function sellAndContinue() {
  if (gameState.state.currentProduct) gameState.sellProduct();

  const idx = gameState.state.selectedBoxIndex;
  gameState.setBoxState(idx, 'done');
  boxSelection.hideBox(idx);
  unboxing.reset();

  const remaining = gameState.state.boxStates.filter(s => s === 'shelf').length;
  if (remaining > 0) {
    gameState.setPhase('box_selection');
    boxSelection.setTagsVisible(true);
    hud.setHint('다음 상자를 선택하세요');
    hud.hideButton();
  } else {
    hud.showButton('새 세트 열기', () => startNewSet());
    hud.setHint('모든 상자를 열었습니다!');
  }
}

// ── 렌더 루프 ──
sceneMgr.startLoop((dt) => {
  const phase = gameState.state.phase;
  if (phase === 'box_selection') boxSelection.updateShelf(dt);
  if (phase === 'flying' || phase === 'playable' || phase === 'opening' || phase === 'result') {
    unboxing.update(dt, sceneMgr.clock.elapsedTime);
  }
});

// ── 시작 ──
loadProducts().then(() => {
  hud.hideLoading();
  startNewSet();
});
