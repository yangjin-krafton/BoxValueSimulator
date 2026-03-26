import * as THREE from 'three';
import { ProductRenderer } from '../rendering/ProductRenderer.js';
import { ConfettiSystem } from '../rendering/ConfettiSystem.js';
import { BOX_H, BOX_W, BOX_D } from '../rendering/BoxMesh.js';
import { rollGrade } from '../systems/GradeSystem.js';
import { createProductInstance } from '../systems/PricingCalculator.js';

const PI = Math.PI;
const FLOOR_Y = 0.06;
const OPEN_FB = PI * 0.82, OPEN_LR = PI * 0.78;
const RISE_HEIGHT = 2.8;
const RISE_DUR = 1.2;

// 그리드 경계
const GRID_BX = 1.85, GRID_BZ = 1.55;

// 낙하 물리
const GRAVITY = -18;
const BOUNCE = 0.3;
const DROP_HEIGHT = 4.5;      // 상자가 나타나는 높이
const SETTLE_VEL = 0.5;       // 이 속도 이하면 정지 판정

function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/**
 * 물리 낙하 → 착지 → 클릭 개봉 → 상품 상승 회전.
 */
export class UnboxingScene {
  constructor(sceneMgr, gameState, bus, assetLoader) {
    this.sceneMgr = sceneMgr;
    this.gameState = gameState;
    this.bus = bus;
    this.productRenderer = new ProductRenderer(sceneMgr.scene, assetLoader, sceneMgr.camera);
    this.confetti = new ConfettiSystem(sceneMgr.scene);

    this._active = null;
    this._vel = new THREE.Vector3();
    this._angVel = new THREE.Vector3();
    this._settled = false;

    this._animState = 'idle';   // 'idle'|'opening'|'rising'|'display'
    this._animT = 0;
    this._riseT = 0;
    this._gradeInfo = null;
    this._product = null;

    this._viewDist = 4;
    this._riseCamStart = new THREE.Vector3();
    this._mouse = new THREE.Vector2();
    this._ray = new THREE.Raycaster();

    this._origCamPos = new THREE.Vector3();
    this._origTarget = new THREE.Vector3();

    // 판매 전환 애니메이션
    this._selling = false;
    this._sellT = 0;
    this._sellDur = 1.2;
    this._sellCallback = null;
    this._sellCamStart = new THREE.Vector3();
    this._sellTargetStart = new THREE.Vector3();

    this._setupInput();
  }

  async startUnboxing(meshData) {
    this._active = meshData;
    this._animState = 'idle';
    this._animT = 0;
    this._riseT = 0;
    this._settled = false;

    // 카메라 저장
    this._origCamPos.copy(this.sceneMgr.camera.position);
    this._origTarget.copy(this.sceneMgr.controls.target);
    this.sceneMgr.controls.enabled = false;

    // 상자를 그리드 위 공중에 바로 배치 (회전 없이)
    const grp = meshData.group;
    const dropX = Math.max(-GRID_BX + 0.4, Math.min(GRID_BX - 0.4,
      meshData.originPos.x * 0.45));
    const dropZ = (Math.random() - 0.5) * 0.5;

    grp.position.set(dropX, DROP_HEIGHT, dropZ);
    grp.rotation.set(0, (Math.random() - 0.5) * 0.4, 0);

    // 초기 속도: 아래로 약간 + 수평 미세 랜덤
    this._vel.set(
      (Math.random() - 0.5) * 0.3,
      -1,                              // 살짝 아래로 시작
      (Math.random() - 0.5) * 0.2
    );
    // 미세한 회전 (자연스러운 낙하 느낌)
    this._angVel.set(
      (Math.random() - 0.5) * 0.8,
      0,
      (Math.random() - 0.5) * 0.6
    );

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

  /**
   * 판매 전환 시작: 카메라 서서히 복원 + 상품 축소.
   * 완료 후 onDone 콜백 호출.
   */
  startSellTransition(onDone) {
    this._selling = true;
    this._sellT = 0;
    this._sellCallback = onDone;
    this._sellCamStart.copy(this.sceneMgr.camera.position);
    this._sellTargetStart.copy(this.sceneMgr.controls.target);
    this.sceneMgr.controls.enabled = false;
  }

  /** 즉시 리셋 (전환 없이) */
  reset() {
    this._selling = false;
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

    this.sceneMgr.controls.target.copy(this._origTarget);
    this.sceneMgr.controls.enabled = true;
  }

  update(dt, elapsed) {
    this.confetti.update(dt);

    // ── 판매 전환 애니메이션 ──
    if (this._selling) {
      this._sellT = Math.min(this._sellT + dt / this._sellDur, 1);
      const t = ease(this._sellT);

      // 카메라 위치 서서히 복원
      this.sceneMgr.camera.position.lerpVectors(this._sellCamStart, this._origCamPos, t);
      this.sceneMgr.controls.target.lerpVectors(this._sellTargetStart, this._origTarget, t);

      // 상품 축소 + 상자 숨기기
      this.productRenderer.pivot.scale.setScalar(Math.max(0, 1 - t));

      if (this._sellT >= 1) {
        this._selling = false;
        this.reset();
        if (this._sellCallback) {
          const cb = this._sellCallback;
          this._sellCallback = null;
          cb();
        }
      }
      return;
    }

    const a = this._active;
    if (!a) return;
    const grp = a.group;
    const phase = this.gameState.state.phase;

    // ── 물리 낙하 ──
    if (phase === 'flying' && !this._settled) {
      // 중력
      this._vel.y += GRAVITY * dt;
      grp.position.addScaledVector(this._vel, dt);

      // 미세 회전
      grp.rotation.x += this._angVel.x * dt;
      grp.rotation.z += this._angVel.z * dt;

      // 바닥 충돌
      if (grp.position.y <= FLOOR_Y) {
        grp.position.y = FLOOR_Y;
        this._vel.y *= -BOUNCE;
        this._vel.x *= 0.5;
        this._vel.z *= 0.5;
        this._angVel.multiplyScalar(0.3);

        // 정지 판정
        if (Math.abs(this._vel.y) < SETTLE_VEL) {
          this._vel.set(0, 0, 0);
          this._angVel.set(0, 0, 0);
          this._settled = true;
        }
      }

      // 수평 경계 반사
      if (Math.abs(grp.position.x) > GRID_BX) {
        grp.position.x = Math.sign(grp.position.x) * GRID_BX;
        this._vel.x *= -0.4;
      }
      if (Math.abs(grp.position.z) > GRID_BZ) {
        grp.position.z = Math.sign(grp.position.z) * GRID_BZ;
        this._vel.z *= -0.4;
      }

      // 공기 저항
      this._vel.x *= Math.pow(0.98, dt * 60);
      this._vel.z *= Math.pow(0.98, dt * 60);
      this._angVel.multiplyScalar(Math.pow(0.96, dt * 60));

      this.productRenderer.syncPosition(grp.position);
      return;
    }

    // ── 정지 후 자세 복원 → playable 전환 ──
    if (phase === 'flying' && this._settled) {
      // 자세 부드럽게 수평으로 복원
      grp.rotation.x += -grp.rotation.x * dt * 8;
      grp.rotation.z += -grp.rotation.z * dt * 8;

      if (Math.abs(grp.rotation.x) < 0.01 && Math.abs(grp.rotation.z) < 0.01) {
        grp.rotation.x = 0;
        grp.rotation.z = 0;
        this.gameState.setPhase('playable');
        this.sceneMgr.controls.enabled = true;
        this.bus.emit('box:landed', undefined);
      }
      this.productRenderer.syncPosition(grp.position);
      return;
    }

    // ── 대기 ──
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

        // 모델 bound 기준 카메라 거리 — 화면에 꽉 차게
        const br = this.productRenderer._boundRadius || 0.5;
        const cam = this.sceneMgr.camera;
        const fov = cam.fov * (PI / 180);
        const aspect = cam.aspect;
        // 세로/가로 중 좁은 쪽 기준으로 거리 계산 (모바일 세로 대응)
        const hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
        const effectiveFov = Math.min(fov, hFov);
        // 모델이 화면 ~80% 차지하는 거리 (1.15 = br / tan * 여유)
        this._viewDist = Math.max(1.2, (br * 1.15) / Math.tan(effectiveFov / 2));
        this._riseCamStart = this.sceneMgr.camera.position.clone();
      }
      return;
    }

    // ── 상품 상승 ──
    if (this._animState === 'rising') {
      this._riseT = Math.min(this._riseT + dt / RISE_DUR, 1);
      const t = ease(this._riseT);
      const riseY = FLOOR_Y + 0.38 + RISE_HEIGHT * t;
      const productPos = new THREE.Vector3(grp.position.x, riseY, grp.position.z);

      this.productRenderer.setPosition(productPos.x, productPos.y, productPos.z);
      this.productRenderer.rotate(dt, elapsed);

      // 카메라 타겟 → 상품 위치
      this.sceneMgr.controls.target.lerp(productPos, dt * 4);

      // 카메라 위치 → 상품 앞에서 적정 거리
      const idealCamPos = new THREE.Vector3(
        productPos.x,
        productPos.y + 0.3,
        productPos.z + this._viewDist,
      );
      this.sceneMgr.camera.position.lerp(idealCamPos, dt * 3);

      if (this._riseT >= 1) {
        this._animState = 'display';
        this.gameState.setPhase('result');
        this.gameState.setCurrentProduct(this._product);
        this.sceneMgr.controls.target.copy(productPos);
        this.sceneMgr.controls.enabled = true;
        this.bus.emit('box:open', undefined);
      }
      return;
    }

    // ── 전시 ──
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
