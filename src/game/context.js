/**
 * 게임 전체 인스턴스를 생성하고 단일 컨텍스트 객체로 반환한다.
 * 로직은 없고 의존성 주입 컨테이너 역할만 한다.
 */
import { AudioManager } from '../audio/AudioManager.js';
import { EventBus } from '../core/EventBus.js';
import { GameStateManager } from '../core/GameStateManager.js';
import { AssetLoader } from '../core/AssetLoader.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { CoinSystem } from '../rendering/CoinSystem.js';
import { TapIndicator } from '../rendering/TapIndicator.js';
import { BoxSelectionScene } from '../scenes/BoxSelectionScene.js';
import { UnboxingScene } from '../scenes/UnboxingScene.js';
import { DisplayShelf3D, BOARD_Z, BOARD_D } from '../scenes/DisplayShelf3D.js';
import { CardDeck3D } from '../scenes/CardDeck3D.js';
import { CardSelectionScene3D } from '../scenes/CardSelectionScene3D.js';
import { FloorElement } from '../rendering/FloorElement.js';
import { FloorUIManager } from '../rendering/FloorUIManager.js';
import { SlotFullBubble } from '../rendering/SlotFullBubble.js';
import { HUD } from '../ui/HUD.js';
import { RuleEngine } from '../systems/RuleEngine.js';
import { RoundManager } from '../systems/RoundManager.js';
import { DisplaySlotManager } from '../systems/DisplaySlotManager.js';
import { CouponCardSystem } from '../systems/CouponCardSystem.js';

class EndRoundButton extends FloorElement {
  draw(ctx, w, h, hover) {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (hover) { grad.addColorStop(0, '#1e88e5'); grad.addColorStop(1, '#42a5f5'); }
    else       { grad.addColorStop(0, '#1565c0'); grad.addColorStop(1, '#1e88e5'); }
    ctx.fillStyle = grad;
    this.roundRect(ctx, 8, 8, w - 16, h - 16, 18); ctx.fill();
    ctx.strokeStyle = hover ? '#90caf9' : 'rgba(144,202,249,0.5)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 8, 8, w - 16, h - 16, 18); ctx.stroke();
    ctx.font = 'bold 38px system-ui';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('라운드 종료', w / 2, h / 2);
  }
}

export function createContext() {
  const bus         = new EventBus();
  const ruleEngine  = new RuleEngine();
  const gameState   = new GameStateManager(bus);
  const assetLoader = new AssetLoader();
  const sceneMgr    = new SceneManager();
  const hud         = new HUD(bus);
  const coins       = new CoinSystem(sceneMgr.scene, sceneMgr.camera);
  const audio       = new AudioManager(bus);

  const roundMgr   = new RoundManager(bus, ruleEngine);
  const displayMgr = new DisplaySlotManager(bus, ruleEngine);
  const couponSys  = new CouponCardSystem(bus, ruleEngine);

  const boxSelection   = new BoxSelectionScene(sceneMgr, gameState, bus);
  const unboxing       = new UnboxingScene(sceneMgr, gameState, bus, assetLoader, ruleEngine);
  const displayShelf   = new DisplayShelf3D(sceneMgr, assetLoader);
  const cardDeck       = new CardDeck3D(sceneMgr);
  const tapPin         = new TapIndicator(sceneMgr.scene);

  const floorUI         = new FloorUIManager(sceneMgr);
  const slotFullBubble  = new SlotFullBubble(sceneMgr.scene);
  const cardSelection3D = new CardSelectionScene3D(sceneMgr);

  const endRoundBtn = floorUI.add('endRound',
    new EndRoundButton(sceneMgr, sceneMgr.scene, {
      width: 2.0, depth: 0.6, texWidth: 400, texHeight: 120,
      x: 0, z: BOARD_Z + BOARD_D / 2 + 0.45,
    }),
  );

  return {
    bus, ruleEngine, gameState, assetLoader, sceneMgr, hud, coins, audio,
    roundMgr, displayMgr, couponSys,
    boxSelection, unboxing, displayShelf, cardDeck, tapPin,
    floorUI, slotFullBubble, cardSelection3D, endRoundBtn,
  };
}
