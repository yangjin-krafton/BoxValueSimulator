import * as THREE from 'three';
import { InputGuard } from '../core/InputGuard.js';

/**
 * 바닥 3D UI 요소 관리자.
 * FloorElement 인스턴스를 등록하고, 레이캐스팅 기반 클릭/호버를 중앙 처리.
 *
 * 사용법:
 *   const mgr = new FloorUIManager(sceneMgr);
 *   mgr.add('endRound', myButton);
 *   // 렌더 루프에서
 *   mgr.update(dt, elapsed);
 */

export class FloorUIManager {
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    /** @type {Map<string, import('./FloorElement.js').FloorElement>} */
    this._elements = new Map();
    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._hoveredId = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    addEventListener('pointerdown', this._onPointerDown);
    addEventListener('pointermove', this._onPointerMove);
  }

  // ── 요소 관리 ──

  /** FloorElement 등록 */
  add(id, element) {
    this._elements.set(id, element);
    return element;
  }

  /** 요소 제거 + dispose */
  remove(id) {
    const el = this._elements.get(id);
    if (el) { el.dispose(); this._elements.delete(id); }
  }

  /** ID로 요소 가져오기 */
  get(id) { return this._elements.get(id) || null; }

  /** 등록된 모든 요소 ID */
  keys() { return [...this._elements.keys()]; }

  // ── 레이캐스팅 ──

  _setMouse(e) {
    this._mouse.set(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1,
    );
    this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
  }

  /** 보이는 요소들의 히트 타겟 수집 */
  _collectTargets() {
    const targets = [];
    for (const [id, el] of this._elements) {
      const t = el.getHitTarget();
      if (t) targets.push({ id, el, mesh: t });
    }
    return targets;
  }

  _onPointerDown(e) {
    if (InputGuard.blocked) return;
    const targets = this._collectTargets();
    if (targets.length === 0) return;

    this._setMouse(e);
    const meshes = targets.map(t => t.mesh);
    const hits = this._ray.intersectObjects(meshes);
    if (hits.length === 0) return;

    const hitMesh = hits[0].object;
    const entry = targets.find(t => t.mesh === hitMesh);
    if (entry) {
      entry.el._fireClick();
      e.stopPropagation();
    }
  }

  _onPointerMove(e) {
    if (InputGuard.blocked) return;
    const targets = this._collectTargets();

    if (targets.length === 0) {
      if (this._hoveredId) {
        const prev = this._elements.get(this._hoveredId);
        if (prev) prev.setHover(false);
        this._hoveredId = null;
        this.sceneMgr.canvas.style.cursor = '';
      }
      return;
    }

    this._setMouse(e);
    const meshes = targets.map(t => t.mesh);
    const hits = this._ray.intersectObjects(meshes);

    let hitId = null;
    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const entry = targets.find(t => t.mesh === hitMesh);
      if (entry) hitId = entry.id;
    }

    // 이전 호버 해제
    if (this._hoveredId && this._hoveredId !== hitId) {
      const prev = this._elements.get(this._hoveredId);
      if (prev) prev.setHover(false);
    }

    // 새 호버 설정
    if (hitId) {
      const el = this._elements.get(hitId);
      if (el) el.setHover(true);
      this.sceneMgr.canvas.style.cursor = 'pointer';
    } else {
      this.sceneMgr.canvas.style.cursor = '';
    }

    this._hoveredId = hitId;
  }

  // ── 업데이트 ──

  update(dt, elapsed) {
    for (const el of this._elements.values()) {
      el.update(dt, elapsed);
    }
  }

  dispose() {
    removeEventListener('pointerdown', this._onPointerDown);
    removeEventListener('pointermove', this._onPointerMove);
    for (const el of this._elements.values()) el.dispose();
    this._elements.clear();
  }
}
