import * as THREE from 'three';
import { createBoxMesh, createHoverGlow, addPriceStickers, BOX_H } from '../rendering/BoxMesh.js';
import { createPriceTag3D } from '../rendering/PriceTag3D.js';

const FLOOR_Y = 0.06;
const TAG_FLOAT_HEIGHT = 0.55;
const TAG_SPIN_SPEED = 0.6;

/**
 * v2: boxSet.towers에서 타워 정보를 받아 배치.
 * 타워별 역할(lane) 색상 및 이름 표시.
 */
function towersToLayout(towerDefs) {
  const spacing = 2.0;
  const totalW = (towerDefs.length - 1) * spacing;
  return towerDefs.map((td, i) => ({
    x: -totalW / 2 + i * spacing,
    z: -5.0 - (Math.random() * 0.3),
    n: td.boxCount,
    role: td.role,
  }));
}

/**
 * 상자 10개 선반 배치, 호버, 클릭 선택, 3D 가격표.
 * v2: 타워 역할 정보 표시, 세트 타입 연동.
 */
export class BoxSelectionScene {
  constructor(sceneMgr, gameState, bus) {
    this.sceneMgr = sceneMgr;
    this.gameState = gameState;
    this.bus = bus;

    this.boxMeshes = [];
    this._towers = [];
    this.hoverGlow = createHoverGlow();
    this.sceneMgr.scene.add(this.hoverGlow);

    this._priceTags = new Map();
    this._laneLabels = [];

    this._bonusActive = false;
    this._bonusRates = new Map();

    this._hoveredIdx = -1;
    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    this.bus.on('money:change', () => this._refreshTagColors());
    this._setupInput();
  }

  spawnBoxes(boxSet, savedLayout) {
    this.clear();
    this._bonusActive = false;
    this._bonusRates.clear();

    // v2: boxSet.towers에서 타워 레이아웃 생성
    let towers;
    if (savedLayout) {
      towers = savedLayout.towers;
    } else if (boxSet.towers) {
      towers = towersToLayout(boxSet.towers);
    } else {
      // 호환: 기존 방식 폴백
      towers = this._legacyRandomTowers(boxSet.boxes.length);
    }
    this._towers = towers;

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

    this._saveLayout();
    this._rebuildTags();
    this._buildLaneLabels();
  }

  _legacyRandomTowers(boxCount) {
    const towerCount = 2 + Math.floor(Math.random() * 3);
    const spacing = 2.0;
    const totalW = (towerCount - 1) * spacing;
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

  /** v2: 타워 역할 라벨 (바닥에 표시) */
  _buildLaneLabels() {
    this._clearLaneLabels();
    for (const tower of this._towers) {
      if (!tower.role) continue;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx2d = canvas.getContext('2d');
      ctx2d.fillStyle = tower.role.color || '#888888';
      ctx2d.font = 'bold 28px system-ui';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(tower.role.name, 128, 40);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.2, 0.3, 1);
      sprite.position.set(tower.x, FLOOR_Y + 0.02, tower.z + 0.8);
      this.sceneMgr.scene.add(sprite);
      this._laneLabels.push(sprite);
    }
  }

  _clearLaneLabels() {
    for (const s of this._laneLabels) this.sceneMgr.scene.remove(s);
    this._laneLabels = [];
  }

  getBoxMesh(index) { return this.boxMeshes[index]; }

  getEffectivePrice(index) {
    const def = this.gameState.state.boxSet.boxes[index];
    const rate = this._bonusRates.get(index) || 0;
    if (rate > 0) {
      return Math.max(1000, Math.round((def.price * (1 - rate)) / 1000) * 1000);
    }
    return def.price;
  }

  consumeBonus() {
    const had = this._bonusActive;
    this._bonusActive = false;
    this._bonusRates.clear();
    return had;
  }

  get bonusActive() { return this._bonusActive; }

  updateShelf(dt) {
    this.boxMeshes.forEach((md, i) => {
      if (this.gameState.state.boxStates[i] !== 'shelf') return;
      const ty = md.originPos.y + (i === this._hoveredIdx ? 0.12 : 0);
      md.group.position.y += (ty - md.group.position.y) * dt * 7;
    });

    for (const [boxIdx, tag] of this._priceTags) {
      tag.group.rotation.y += TAG_SPIN_SPEED * dt;
      tag.group.position.y = tag._baseY + Math.sin(Date.now() * 0.002 + boxIdx) * 0.04;
    }
  }

  hideBox(index) {
    const md = this.boxMeshes[index];
    if (!md) return;
    md.group.visible = false;

    const ti = md.towerIdx;
    const towerHasShelf = this.boxMeshes.some(
      (m, i) => m.towerIdx === ti && this.gameState.state.boxStates[i] === 'shelf'
    );
    if (!towerHasShelf && !this._bonusActive) {
      this._bonusActive = true;
      this._bonusRates.clear();
      const tops = this._topIndices();
      for (const boxIdx of tops) {
        const rate = 0.1 + Math.random() * 0.3;
        this._bonusRates.set(boxIdx, rate);
      }
      this.bus.emit('tower:cleared', ti);
    }

    this._rebuildTags();
  }

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
    this._clearLaneLabels();
  }

  // ── 가격표 ──

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

      const effectivePrice = this.getEffectivePrice(boxIdx);
      const bonusRate = this._bonusRates.get(boxIdx) || 0;
      tag.setBox(def, effectivePrice, bonusRate);
      tag.updateState(money);

      const topY = md.originPos.y + BOX_H * md.scale + TAG_FLOAT_HEIGHT;
      tag.group.position.set(md.originPos.x, topY, md.originPos.z);
      tag._baseY = topY;

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
