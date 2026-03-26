import * as THREE from 'three';
import { ProductRenderer } from '../rendering/ProductRenderer.js';
import { ConfettiSystem } from '../rendering/ConfettiSystem.js';
import { BOX_H } from '../rendering/BoxMesh.js';
import { rollGrade } from '../systems/GradeSystem.js';
import { createProductInstance } from '../systems/PricingCalculator.js';

const PI = Math.PI;
const FLOOR_Y = 0.06;
const FLY_DUR = 1.2;
const LAND_POS = new THREE.Vector3(0, FLOOR_Y, 0);
const OPEN_FB = PI * 0.82, OPEN_LR = PI * 0.78;
const RISE_HEIGHT = 2.8;      // 상품이 올라가는 최종 높이
const RISE_DUR = 1.2;         // 올라가는 시간

function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function bezier(p0, p2, t) {
  const ctrl = new THREE.Vector3(
    (p0.x + p2.x) / 2,
    Math.max(p0.y, p2.y) + 3.5,
    (p0.z + p2.z) / 2,
  );
  const u = 1 - t;
  return new THREE.Vector3(
    u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * ctrl.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * ctrl.z + t * t * p2.z,
  );
}

/**
 * 비행 → 착지 → 클릭 개봉 → 상품 상승 회전.
 * 상자 잡기/드래그 없음. 개봉 후 OrbitControls로 상품 감상.
 */
export class UnboxingScene {
  /**
   * @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr
   * @param {import('../core/GameStateManager.js').GameStateManager} gameState
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('../core/AssetLoader.js').AssetLoader} assetLoader
   */
  constructor(sceneMgr, gameState, bus, assetLoader) {
    this.sceneMgr = sceneMgr;
    this.gameState = gameState;
    this.bus = bus;
    this.productRenderer = new ProductRenderer(sceneMgr.scene, assetLoader);
    this.confetti = new ConfettiSystem(sceneMgr.scene);

    this._active = null;
    this._flyT = 0;
    this._animState = 'idle';   // 'idle'|'opening'|'rising'|'display'
    this._animT = 0;
    this._riseT = 0;
    this._gradeInfo = null;
    this._product = null;

    this._mouse = new THREE.Vector2();
    this._ray = new THREE.Raycaster();

    // 카메라 원래 위치 저장 (되돌리기용)
    this._origCamPos = new THREE.Vector3();
    this._origTarget = new THREE.Vector3();

    this._setupInput();
  }

  async startUnboxing(meshData) {
    this._active = meshData;
    this._flyT = 0;
    this._animState = 'idle';
    this._animT = 0;
    this._riseT = 0;

    // 카메라 원래 상태 저장
    this._origCamPos.copy(this.sceneMgr.camera.position);
    this._origTarget.copy(this.sceneMgr.controls.target);

    this.sceneMgr.controls.enabled = false;

    const boxDef = this.gameState.state.boxSet.boxes[this.gameState.state.selectedBoxIndex];
    this._gradeInfo = rollGrade(boxDef.product.category);
    this._product = createProductInstance(boxDef.product, this._gradeInfo);

    await this.productRenderer.prepare(boxDef.product, this._gradeInfo);
  }

  get gradeInfo() { return this._gradeInfo; }
  get productInstance() { return this._product; }
  get isOpen() { return this._animState === 'display'; }

  triggerOpen() {
    if (this._animState !== 'idle') return;
    this._animState = 'opening';
    this._animT = 0;
    this._confettiFired = false;
    this.gameState.setPhase('opening');
  }

  reset() {
    if (this._active) {
      const f = this._active.flaps;
      f.front.rotation.x = f.back.rotation.x = 0;
      f.left.rotation.z = f.right.rotation.z = 0;
      this._active.group.visible = false;
    }
    this._active = null;
    this.productRenderer.reset();
    this.confetti.clear();
    this._animState = 'idle';
    this._gradeInfo = null;
    this._product = null;

    // 카메라 원래 위치로 복원
    this.sceneMgr.controls.target.copy(this._origTarget);
    this.sceneMgr.controls.enabled = true;
  }

  update(dt, elapsed) {
    this.confetti.update(dt);

    const a = this._active;
    if (!a) return;
    const grp = a.group;
    const phase = this.gameState.state.phase;

    // ── 비행 (선반 → 중앙) ──
    if (phase === 'flying') {
      this._flyT = Math.min(this._flyT + dt / FLY_DUR, 1);
      grp.position.copy(bezier(a.originPos, LAND_POS, ease(this._flyT)));
      grp.rotation.x += dt * 1.8;
      grp.rotation.z += dt * 1.2;
      if (this._flyT >= 1) {
        grp.position.copy(LAND_POS);
        grp.rotation.x = 0;
        grp.rotation.z = 0;
        this.gameState.setPhase('playable');
        this.sceneMgr.controls.enabled = true;
        this.bus.emit('box:landed', undefined);
      }
      this.productRenderer.syncPosition(grp.position);
      return;
    }

    // ── 대기 (착지 후 클릭 대기) ──
    if (phase === 'playable') {
      this.productRenderer.syncPosition(grp.position);
      return;
    }

    // ── 개봉 애니메이션 ──
    if (this._animState === 'opening') {
      this._animT = Math.min(this._animT + dt * 0.85, 1);
      const t = ease(this._animT);
      a.flaps.front.rotation.x =  OPEN_FB * t;
      a.flaps.back.rotation.x  = -OPEN_FB * t;
      a.flaps.left.rotation.z  =  OPEN_LR * t;
      a.flaps.right.rotation.z = -OPEN_LR * t;

      // 뚜껑이 열리면서 꽃가루 폭죽 발사!
      if (this._animT > 0.35 && !this._confettiFired) {
        this._confettiFired = true;
        const firePos = new THREE.Vector3(
          grp.position.x, grp.position.y + BOX_H * 0.5, grp.position.z
        );
        this.confetti.fire(this._gradeInfo.grade, firePos);
      }

      if (this._animT > 0.45) {
        this.productRenderer.setRevealProgress(ease(Math.min((this._animT - .45) / .45, 1)));
      }
      this.productRenderer.syncPosition(grp.position);

      if (this._animT >= 1) {
        this._animState = 'rising';
        this._riseT = 0;
      }
      return;
    }

    // ── 상품 상승 (상자에서 공중으로) ──
    if (this._animState === 'rising') {
      this._riseT = Math.min(this._riseT + dt / RISE_DUR, 1);
      const t = ease(this._riseT);
      const riseY = FLOOR_Y + 0.38 + RISE_HEIGHT * t;

      this.productRenderer.setPosition(grp.position.x, riseY, grp.position.z);
      this.productRenderer.rotate(dt, elapsed);

      // 카메라 타겟을 상품 쪽으로 부드럽게 이동
      const targetY = FLOOR_Y + 0.38 + RISE_HEIGHT * t;
      this.sceneMgr.controls.target.lerp(
        new THREE.Vector3(grp.position.x, targetY, grp.position.z), dt * 4
      );

      if (this._riseT >= 1) {
        this._animState = 'display';
        this.gameState.setPhase('result');
        this.gameState.setCurrentProduct(this._product);

        // 카메라 타겟 고정
        this.sceneMgr.controls.target.set(
          grp.position.x, FLOOR_Y + 0.38 + RISE_HEIGHT, grp.position.z
        );
        this.sceneMgr.controls.enabled = true;
        this.bus.emit('box:open', undefined);
      }
      return;
    }

    // ── 전시 (빙글빙글 회전 + 부유) ──
    if (this._animState === 'display') {
      const displayY = FLOOR_Y + 0.38 + RISE_HEIGHT + Math.sin(elapsed * 2.2) * 0.08;
      this.productRenderer.setPosition(grp.position.x, displayY, grp.position.z);
      this.productRenderer.rotate(dt, elapsed);
    }
  }

  // ── Input ──
  _setupInput() {
    addEventListener('pointerdown', (e) => {
      const p = this.gameState.state.phase;
      if (p !== 'playable' || !this._active) return;

      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
      if (this._ray.intersectObjects(this._active.hitTargets, true).length > 0) {
        this.triggerOpen();
      }
    });
  }
}
