import * as THREE from 'three';
import { createBoxMesh, createHoverGlow, addPriceStickers, BOX_H } from '../rendering/BoxMesh.js';
import { createPriceTag3D } from '../rendering/PriceTag3D.js';

const FLOOR_Y = 0.06;
const TAG_FLOAT_HEIGHT = 0.55;   // 상자 위 가격표 간격
const TAG_SPIN_SPEED = 0.6;      // 가격표 회전 속도 (rad/s)

/** 2~4열 타워를 랜덤 생성하고 10개 박스를 분배 */
function randomTowers(boxCount) {
  const towerCount = 2 + Math.floor(Math.random() * 3);           // 2, 3, 4
  const spacing = 2.0;
  const totalW = (towerCount - 1) * spacing;

  // 각 열에 최소 1개 배정 후 나머지 랜덤 분배
  const counts = Array(towerCount).fill(1);
  let remain = boxCount - towerCount;
  while (remain > 0) {
    const t = Math.floor(Math.random() * towerCount);
    counts[t]++;
    remain--;
  }

  return counts.map((n, i) => ({
    x: -totalW / 2 + i * spacing,
    z: -5.0 - (Math.random() * 0.3),
    n,
  }));
}

/**
 * 상자 10개 선반 배치, 호버, 클릭 선택, 3D 가격표.
 */
export class BoxSelectionScene {
  /**
   * @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr
   * @param {import('../core/GameStateManager.js').GameStateManager} gameState
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(sceneMgr, gameState, bus) {
    this.sceneMgr = sceneMgr;
    this.gameState = gameState;
    this.bus = bus;

    /** @type {Array<{group, flaps, hitTargets, scale, originPos, originRotY, towerIdx: number}>} */
    this.boxMeshes = [];
    /** @type {Array<{x, z, n}>} */
    this._towers = [];
    this.hoverGlow = createHoverGlow();
    this.sceneMgr.scene.add(this.hoverGlow);

    /** @type {Map<number, ReturnType<typeof createPriceTag3D>>} boxIdx → tag */
    this._priceTags = new Map();

    /** 열 클리어 보너스: 1회성, 각 상자별 랜덤 할인율 */
    this._bonusActive = false;
    /** @type {Map<number, number>} boxIdx → 할인율 (0.1~0.4) */
    this._bonusRates = new Map();

    this._hoveredIdx = -1;
    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    // 잔액 변경 시 가격표 색상 갱신
    this.bus.on('money:change', () => this._refreshTagColors());

    this._setupInput();
  }

  /** 새 세트 10개 배치 (매번 2~4열 랜덤) */
  spawnBoxes(boxSet, savedLayout) {
    this.clear();
    this._bonusActive = false;
    this._bonusRates.clear();

    const towers = savedLayout ? savedLayout.towers : randomTowers(boxSet.boxes.length);
    this._towers = towers;

    // 박스별 위치/회전 생성 또는 복원
    const positions = savedLayout ? savedLayout.positions : null;
    let idx = 0;
    for (let ti = 0; ti < towers.length; ti++) {
      const tower = towers[ti];
      let stackY = FLOOR_Y;
      for (let j = 0; j < tower.n && idx < boxSet.boxes.length; j++) {
        const def = boxSet.boxes[idx];
        const md = createBoxMesh();
        const s = def.scale;

        let x, z, ry;
        if (positions && positions[idx]) {
          x = positions[idx].x;
          z = positions[idx].z;
          ry = positions[idx].ry;
          stackY = positions[idx].y;
        } else {
          x = tower.x + (Math.random() - 0.5) * 0.08;
          z = tower.z + (Math.random() - 0.5) * 0.08;
          ry = (Math.random() - 0.5) * 0.3;
        }

        md.group.scale.setScalar(s);
        md.group.position.set(x, stackY, z);
        md.group.rotation.y = ry;
        md.scale = s;
        md.originPos.set(x, stackY, z);
        md.originRotY = ry;
        md.towerIdx = ti;
        md.hitTargets.forEach(m => { m.userData.boxIdx = idx; });

        addPriceStickers(md.group, def.price);
        this.sceneMgr.scene.add(md.group);
        this.boxMeshes.push(md);
        if (!positions) stackY += BOX_H * s + 0.005;
        idx++;
      }
    }

    // 레이아웃 저장
    this._saveLayout();
    this._rebuildTags();
  }

  /** 현재 배치 정보를 gameState에 저장 */
  _saveLayout() {
    const positions = this.boxMeshes.map(md => ({
      x: md.originPos.x,
      y: md.originPos.y,
      z: md.originPos.z,
      ry: md.originRotY,
    }));
    this.gameState.state.layout = {
      towers: this._towers,
      positions,
    };
    this.gameState.save();
  }

  getBoxMesh(index) { return this.boxMeshes[index]; }

  /** 보너스 할인 적용된 실제 구매 가격 */
  getEffectivePrice(index) {
    const def = this.gameState.state.boxSet.boxes[index];
    const rate = this._bonusRates.get(index) || 0;
    if (rate > 0) {
      return Math.max(1000, Math.round((def.price * (1 - rate)) / 1000) * 1000);
    }
    return def.price;
  }

  /** 보너스 할인 소비 (구매 후 호출) — 전체 보너스 1회 소진 */
  consumeBonus() {
    const had = this._bonusActive;
    this._bonusActive = false;
    this._bonusRates.clear();
    return had;
  }

  /** 현재 보너스 활성 여부 */
  get bonusActive() { return this._bonusActive; }

  /** 선반 위 호버 부유 + 가격표 회전 */
  updateShelf(dt) {
    this.boxMeshes.forEach((md, i) => {
      if (this.gameState.state.boxStates[i] !== 'shelf') return;
      const ty = md.originPos.y + (i === this._hoveredIdx ? 0.12 : 0);
      md.group.position.y += (ty - md.group.position.y) * dt * 7;
    });

    // 가격표 회전 + 부유
    for (const [boxIdx, tag] of this._priceTags) {
      tag.group.rotation.y += TAG_SPIN_SPEED * dt;
      // 부유 효과
      tag.group.position.y = tag._baseY + Math.sin(Date.now() * 0.002 + boxIdx) * 0.04;
    }
  }

  hideBox(index) {
    const md = this.boxMeshes[index];
    if (!md) return;
    md.group.visible = false;

    // 열 클리어 감지: 해당 타워에 shelf 상자가 0개면 보너스 활성
    const ti = md.towerIdx;
    const towerHasShelf = this.boxMeshes.some(
      (m, i) => m.towerIdx === ti && this.gameState.state.boxStates[i] === 'shelf'
    );
    if (!towerHasShelf && !this._bonusActive) {
      this._bonusActive = true;
      this._bonusRates.clear();
      // 남은 모든 최상단 상자에 각각 랜덤 할인율 배정
      const tops = this._topIndices();
      for (const boxIdx of tops) {
        const rate = 0.1 + Math.random() * 0.3;   // 10~40% 랜덤
        this._bonusRates.set(boxIdx, rate);
      }
      this.bus.emit('tower:cleared', ti);
    }

    this._rebuildTags();
  }

  /** 가격표 보이기/숨기기 (phase 전환용) */
  setTagsVisible(visible) {
    for (const [, tag] of this._priceTags) {
      tag.group.visible = visible;
    }
  }

  clear() {
    for (const md of this.boxMeshes) this.sceneMgr.scene.remove(md.group);
    this.boxMeshes = [];
    this._hoveredIdx = -1;
    this.hoverGlow.visible = false;
    this._clearTags();
  }

  // ── 가격표 관리 ──

  /** 최상단 박스에만 3D 가격표 배치 */
  _rebuildTags() {
    this._clearTags();

    const tops = this._topIndices();
    const money = this.gameState.state.money;
    const boxSet = this.gameState.state.boxSet;
    if (!boxSet) return;

    for (const boxIdx of tops) {
      const md = this.boxMeshes[boxIdx];
      const def = boxSet.boxes[boxIdx];
      const tag = createPriceTag3D();

      // 보너스 할인 적용된 가격으로 표시
      const effectivePrice = this.getEffectivePrice(boxIdx);
      const bonusRate = this._bonusRates.get(boxIdx) || 0;
      tag.setBox(def, effectivePrice, bonusRate);
      tag.updateState(money);

      // 상자 최상단 위에 배치
      const topY = md.originPos.y + BOX_H * md.scale + TAG_FLOAT_HEIGHT;
      tag.group.position.set(md.originPos.x, topY, md.originPos.z);
      tag._baseY = topY;

      // boxIdx 기록 (async rebuild 후에도 전파되도록 group에도 저장)
      tag.group.userData.boxIdx = boxIdx;
      tag.hitMeshes.forEach(m => { m.userData.boxIdx = boxIdx; });

      this.sceneMgr.scene.add(tag.group);
      this._priceTags.set(boxIdx, tag);
    }
  }

  _clearTags() {
    for (const [, tag] of this._priceTags) {
      this.sceneMgr.scene.remove(tag.group);
      tag.dispose();
    }
    this._priceTags.clear();
  }

  _refreshTagColors() {
    const money = this.gameState.state.money;
    for (const [, tag] of this._priceTags) {
      tag.updateState(money);
    }
  }

  // ── Input ──

  /** 각 타워의 최상단 shelf 박스만 반환 */
  _topIndices() {
    const topByTower = new Map();
    this.boxMeshes.forEach((md, i) => {
      if (this.gameState.state.boxStates[i] !== 'shelf') return;
      const ti = md.towerIdx;
      const prev = topByTower.get(ti);
      if (prev === undefined || md.originPos.y > this.boxMeshes[prev].originPos.y) {
        topByTower.set(ti, i);
      }
    });
    return new Set(topByTower.values());
  }

  /** 상자 + 가격표 hitTarget 반환 */
  _shelfTargets() {
    const tops = this._topIndices();
    const targets = [];
    for (const i of tops) {
      targets.push(...this.boxMeshes[i].hitTargets);
      const tag = this._priceTags.get(i);
      if (tag) targets.push(...tag.hitMeshes);
    }
    return targets;
  }

  /** hit된 object에서 boxIdx 추출 (parent 탐색) */
  _resolveBoxIdx(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.boxIdx !== undefined) return cur.userData.boxIdx;
      cur = cur.parent;
    }
    return undefined;
  }

  _setupInput() {
    addEventListener('pointermove', (e) => {
      if (this.gameState.state.phase !== 'box_selection') return;
      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
      const hits = this._ray.intersectObjects(this._shelfTargets());

      if (hits.length > 0) {
        const idx = this._resolveBoxIdx(hits[0].object);
        if (idx === undefined) return;
        if (idx !== this._hoveredIdx) {
          this._hoveredIdx = idx;
          const md = this.boxMeshes[idx];
          const wp = new THREE.Vector3();
          md.group.getWorldPosition(wp);
          this.hoverGlow.position.set(wp.x, wp.y + BOX_H / 2 * md.scale, wp.z);
          this.hoverGlow.scale.setScalar(md.scale);
          this.hoverGlow.rotation.y = md.originRotY;
          this.hoverGlow.visible = true;
        }
        this.sceneMgr.canvas.classList.add('hovering');
      } else {
        this._hoveredIdx = -1;
        this.hoverGlow.visible = false;
        this.sceneMgr.canvas.classList.remove('hovering');
      }
    });

    addEventListener('pointerdown', (e) => {
      if (this.gameState.state.phase !== 'box_selection') return;
      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
      const hits = this._ray.intersectObjects(this._shelfTargets());
      if (hits.length > 0) {
        const idx = this._resolveBoxIdx(hits[0].object);
        if (idx === undefined) return;
        this.hoverGlow.visible = false;
        this.setTagsVisible(false);
        this.bus.emit('box:select', idx);
      }
    });
  }
}
