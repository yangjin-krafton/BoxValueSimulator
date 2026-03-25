import * as THREE from 'three';
import { createBoxMesh, createHoverGlow, BOX_H } from '../rendering/BoxMesh.js';

const TOWERS = [
  { x: -2.0, z: -5.0, n: 3 },
  { x:  0.0, z: -5.3, n: 4 },
  { x:  2.0, z: -5.0, n: 3 },
];
const FLOOR_Y = 0.06;

/**
 * 상자 10개 선반 배치, 호버, 클릭 선택.
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

    /** @type {Array<{group, flaps, hitTargets, scale, originPos, originRotY}>} */
    this.boxMeshes = [];
    this.hoverGlow = createHoverGlow();
    this.sceneMgr.scene.add(this.hoverGlow);

    this._hoveredIdx = -1;
    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    this._setupInput();
  }

  /** 새 세트 10개 배치 */
  spawnBoxes(boxSet) {
    this.clear();
    let idx = 0;
    for (const tower of TOWERS) {
      let stackY = FLOOR_Y;
      for (let j = 0; j < tower.n && idx < boxSet.boxes.length; j++) {
        const def = boxSet.boxes[idx];
        const md = createBoxMesh();
        const s = def.scale;
        const x = tower.x + (Math.random() - 0.5) * 0.08;
        const z = tower.z + (Math.random() - 0.5) * 0.08;
        const ry = (Math.random() - 0.5) * 0.3;

        md.group.scale.setScalar(s);
        md.group.position.set(x, stackY, z);
        md.group.rotation.y = ry;
        md.scale = s;
        md.originPos.set(x, stackY, z);
        md.originRotY = ry;
        md.hitTargets.forEach(m => { m.userData.boxIdx = idx; });

        this.sceneMgr.scene.add(md.group);
        this.boxMeshes.push(md);
        stackY += BOX_H * s + 0.005;
        idx++;
      }
    }
  }

  getBoxMesh(index) { return this.boxMeshes[index]; }

  /** 선반 위 호버 부유 */
  updateShelf(dt) {
    this.boxMeshes.forEach((md, i) => {
      if (this.gameState.state.boxStates[i] !== 'shelf') return;
      const ty = md.originPos.y + (i === this._hoveredIdx ? 0.12 : 0);
      md.group.position.y += (ty - md.group.position.y) * dt * 7;
    });
  }

  hideBox(index) {
    const md = this.boxMeshes[index];
    if (md) md.group.visible = false;
  }

  clear() {
    for (const md of this.boxMeshes) this.sceneMgr.scene.remove(md.group);
    this.boxMeshes = [];
    this._hoveredIdx = -1;
    this.hoverGlow.visible = false;
  }

  // ── Input ──
  _shelfTargets() {
    return this.boxMeshes
      .filter((_, i) => this.gameState.state.boxStates[i] === 'shelf')
      .flatMap(m => m.hitTargets);
  }

  _setupInput() {
    addEventListener('pointermove', (e) => {
      if (this.gameState.state.phase !== 'box_selection') return;
      this._mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);
      const hits = this._ray.intersectObjects(this._shelfTargets());

      if (hits.length > 0) {
        const idx = hits[0].object.userData.boxIdx;
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
        this.hoverGlow.visible = false;
        this.bus.emit('box:select', hits[0].object.userData.boxIdx);
      }
    });
  }
}
