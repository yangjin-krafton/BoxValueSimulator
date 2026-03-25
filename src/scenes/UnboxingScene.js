import * as THREE from 'three';
import { ProductRenderer } from '../rendering/ProductRenderer.js';
import { BOX_H } from '../rendering/BoxMesh.js';
import { rollGrade } from '../systems/GradeSystem.js';
import { createProductInstance } from '../systems/PricingCalculator.js';

const PI = Math.PI;
const BOUNDS_X = 1.85, BOUNDS_Z = 1.55, FLOOR_Y = 0.06;
const GRAVITY = -16, BOUNCE = 0.38;
const FLY_DUR = 1.5, DROP_Y = 5.0;
const OPEN_FB = PI * 0.82, OPEN_LR = PI * 0.78;
const GRAB_Y = 1.4;

function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function bezier(p0, p2, t) {
  const ctrl = new THREE.Vector3((p0.x + p2.x) / 2, Math.max(p0.y, p2.y) + 3.5, (p0.z + p2.z) / 2);
  const u = 1 - t;
  return new THREE.Vector3(
    u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * ctrl.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * ctrl.z + t * t * p2.z,
  );
}

/**
 * 비행 → 물리 → 드래그 → 개봉 → 상품 등장.
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

    this._active = null;   // BoxMeshData
    this._vel = new THREE.Vector3();
    this._angX = 0; this._angZ = 0; this._onFloor = true;
    this._flyT = 0;
    this._animState = 'idle'; // 'idle'|'opening'|'open'
    this._animT = 0;
    this._gradeInfo = null;
    this._product = null;

    // 드래그
    this._grabbed = false; this._downOnBox = false;
    this._downNDC = new THREE.Vector2();
    this._mouse = new THREE.Vector2();
    this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GRAB_Y);
    this._dragPt = new THREE.Vector3();
    this._posHist = [];
    this._ray = new THREE.Raycaster();

    this._setupInput();
  }

  async startUnboxing(meshData) {
    this._active = meshData;
    this._flyT = 0;
    this._animState = 'idle'; this._animT = 0;
    this._vel.set(0, 0, 0); this._onFloor = true;
    this.sceneMgr.controls.enabled = false;

    const boxDef = this.gameState.state.boxSet.boxes[this.gameState.state.selectedBoxIndex];
    this._gradeInfo = rollGrade(boxDef.product.category);
    this._product = createProductInstance(boxDef.product, this._gradeInfo);

    await this.productRenderer.prepare(boxDef.product, this._gradeInfo);
  }

  get gradeInfo() { return this._gradeInfo; }
  get productInstance() { return this._product; }
  get isOpen() { return this._animState === 'open'; }

  triggerOpen() {
    if (this._animState !== 'idle') return;
    this._animState = 'opening'; this._animT = 0;
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
    this._animState = 'idle';
    this._gradeInfo = null; this._product = null;
  }

  update(dt, elapsed) {
    const a = this._active;
    if (!a) return;
    const grp = a.group;
    const phase = this.gameState.state.phase;

    // ── 비행 ──
    if (phase === 'flying') {
      this._flyT = Math.min(this._flyT + dt / FLY_DUR, 1);
      grp.position.copy(bezier(a.originPos, new THREE.Vector3(0, DROP_Y, 0), ease(this._flyT)));
      grp.rotation.x += dt * 1.8; grp.rotation.z += dt * 1.2;
      if (this._flyT >= 1) {
        this.gameState.setPhase('playable');
        this.sceneMgr.controls.enabled = true;
        this._vel.set((Math.random() - .5) * .4, 0, (Math.random() - .5) * .4);
        this._angX = (Math.random() - .5) * 2; this._angZ = (Math.random() - .5) * 2;
        this._onFloor = false;
        this.bus.emit('box:landed', undefined);
      }
      return;
    }

    // ── 드래그 ──
    if (this._grabbed) {
      const k = 1 - Math.pow(0.001, dt);
      const mx = this._dragPt.x - grp.position.x, mz = this._dragPt.z - grp.position.z;
      grp.position.x += mx * k; grp.position.z += mz * k;
      grp.position.y += (GRAB_Y - grp.position.y) * (1 - Math.pow(0.01, dt));
      grp.rotation.x += (-mz * 3 - grp.rotation.x) * dt * 6;
      grp.rotation.z += (mx * 3 - grp.rotation.z) * dt * 6;
    }

    // ── 물리 ──
    if (!this._grabbed && !this._onFloor) {
      this._vel.y += GRAVITY * dt;
      grp.position.addScaledVector(this._vel, dt);
      grp.rotation.x += this._angX * dt; grp.rotation.z += this._angZ * dt;
      this._angX *= Math.pow(0.85, dt * 60); this._angZ *= Math.pow(0.85, dt * 60);

      if (grp.position.y <= FLOOR_Y) {
        grp.position.y = FLOOR_Y;
        this._vel.y *= -BOUNCE; this._vel.x *= 0.65; this._vel.z *= 0.65;
        this._angX *= 0.4; this._angZ *= 0.4;
        if (Math.abs(this._vel.y) < 0.2) {
          this._vel.set(0, 0, 0); this._angX = 0; this._angZ = 0; this._onFloor = true;
        }
      }
      if (Math.abs(grp.position.x) > BOUNDS_X) {
        grp.position.x = Math.sign(grp.position.x) * BOUNDS_X;
        this._vel.x *= -0.45; this._angZ *= -0.5;
      }
      if (Math.abs(grp.position.z) > BOUNDS_Z) {
        grp.position.z = Math.sign(grp.position.z) * BOUNDS_Z;
        this._vel.z *= -0.45; this._angX *= -0.5;
      }
    }

    // ── 자세 복원 ──
    if (!this._grabbed) {
      const r = this._onFloor ? 5 : 1;
      grp.rotation.x += -grp.rotation.x * dt * r;
      grp.rotation.z += -grp.rotation.z * dt * r;
    }

    // ── 상품 위치 동기화 ──
    this.productRenderer.syncPosition(grp.position);

    // ── 개봉 ──
    if (this._animState === 'opening') {
      this._animT = Math.min(this._animT + dt * 0.72, 1);
      const t = ease(this._animT);
      a.flaps.front.rotation.x =  OPEN_FB * t;
      a.flaps.back.rotation.x  = -OPEN_FB * t;
      a.flaps.left.rotation.z  =  OPEN_LR * t;
      a.flaps.right.rotation.z = -OPEN_LR * t;

      if (this._animT > 0.55) {
        this.productRenderer.setRevealProgress(ease(Math.min((this._animT - .55) / .38, 1)));
      }
      if (this._animT >= 1) {
        this._animState = 'open';
        this.gameState.setPhase('result');
        this.gameState.setCurrentProduct(this._product);
        this.bus.emit('box:open', undefined);
      }
    }

    if (this._animState === 'open') {
      this.productRenderer.rotate(dt, elapsed);
    }
  }

  // ── Input ──
  _setupInput() {
    const canvas = this.sceneMgr.canvas;

    addEventListener('pointermove', (e) => {
      const p = this.gameState.state.phase;
      if (p !== 'playable' && p !== 'opening' && p !== 'result') return;
      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);

      if (this._downOnBox && !this._grabbed) {
        const dx = this._mouse.x - this._downNDC.x, dy = this._mouse.y - this._downNDC.y;
        if (Math.sqrt(dx * dx + dy * dy) > 0.018) {
          this._grabbed = true; this._downOnBox = false;
          this.sceneMgr.controls.enabled = false;
          this._vel.set(0, 0, 0); this._angX = 0; this._angZ = 0; this._onFloor = false;
          canvas.classList.add('grabbing');
        }
      }
      if (this._grabbed && this._active) {
        this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
        if (this._ray.ray.intersectPlane(this._dragPlane, this._dragPt)) {
          this._dragPt.x = Math.max(-BOUNDS_X, Math.min(BOUNDS_X, this._dragPt.x));
          this._dragPt.z = Math.max(-BOUNDS_Z, Math.min(BOUNDS_Z, this._dragPt.z));
          this._posHist.push({ x: this._dragPt.x, z: this._dragPt.z, t: performance.now() });
          if (this._posHist.length > 8) this._posHist.shift();
        }
      }
    });

    addEventListener('pointerdown', (e) => {
      const p = this.gameState.state.phase;
      if ((p !== 'playable' && p !== 'result') || !this._active) return;
      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
      if (this._ray.intersectObjects(this._active.hitTargets, true).length > 0) {
        this._downOnBox = true;
        this._downNDC.copy(this._mouse);
        this._posHist.length = 0;
      }
    });

    addEventListener('pointerup', () => {
      if (this._grabbed) {
        this._grabbed = false;
        this.sceneMgr.controls.enabled = true;
        canvas.classList.remove('grabbing');
        if (this._posHist.length >= 2) {
          const a = this._posHist[0], b = this._posHist[this._posHist.length - 1];
          const dtS = Math.max((b.t - a.t) / 1000, 0.001);
          this._vel.x = (b.x - a.x) / dtS; this._vel.z = (b.z - a.z) / dtS;
        }
        this._vel.y = 2.0;
        this._angX = this._vel.z * 0.12; this._angZ = -this._vel.x * 0.12;
        this._onFloor = false;
      } else if (this._downOnBox) {
        this._downOnBox = false;
        if (this._animState === 'idle') this.triggerOpen();
      }
    });
  }
}
