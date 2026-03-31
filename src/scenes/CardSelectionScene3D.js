import * as THREE from 'three';
import { DEAL_ORIGIN_X, DEAL_ORIGIN_Y, DEAL_ORIGIN_Z } from './CardDeck3D.js';
import { createCardBackTexture } from '../rendering/CardBackTexture.js';
import { createCardTexture, CARD_TEX_W, CARD_TEX_H } from '../rendering/CouponCardDraw.js';

/**
 * 라운드 승리 후 3D 카드 보상 선택.
 *
 * 흐름:
 *  dealing   → 카드 3장이 덱에서 화면 중앙 공중으로 날아옴
 *  selecting → 카드가 공중에서 둥둥 떠있음, 호버·클릭 가능
 *  chosen    → 1장 선택됨, 나머지 어두워짐, 확인/다시뽑기 버튼 표시
 */

const FLOOR_Y = 0.06;

// 카드 크기 — 가로(landscape) 통일, 바닥에 눕혀서 카메라 쪽으로 기울임
// BoxGeometry(WIDTH, THICKNESS, HEIGHT): X=너비, Y=두께, Z=높이
const SEL_W     = 1.55;   // 가로 (X)
const SEL_THICK = 0.04;   // 두께 (Y)
const SEL_H     = 1.08;   // 세로 (Z) — CARD_TEX_W/H 비율 유지

// 화면 중앙 공중 배치 (월드 고정 좌표)
const CARD_BASE_Y  = 2.4;   // 부유 높이
const CARD_BASE_Z  = -0.8;  // 씬 중앙부
const CARD_SPREAD  = 1.8;   // 카드 간 가로 간격 (X)

// 공중 부유 애니메이션
const BOB_AMP   = 0.06;
const BOB_FREQ  = 1.0;
const BOB_PHASE = 0.85;

// 선택 효과
const HOVER_RISE   = 0.12;
const CHOSEN_SCALE = 1.08;
const DIM_SCALE    = 0.78;

// 딜링 애니메이션
const DEAL_DUR     = 0.52;
const DEAL_STAGGER = 0.18;
const DEAL_ARC_H   = 1.6;

export class CardSelectionScene3D {
  /** @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr */
  constructor(sceneMgr) {
    this.sceneMgr  = sceneMgr;
    this._root     = new THREE.Group();
    sceneMgr.scene.add(this._root);

    this._state      = null;   // null|'dealing'|'selecting'|'chosen'
    this._cards      = [];
    this._hoveredIdx = -1;
    this._chosenIdx  = -1;
    this._time       = 0;
    this._dealTimer  = 0;

    this._onPick   = null;
    this._onReroll = null;
    this._onSkip   = null;
    this._rerolls  = 0;

    // 버튼 (공중 PlaneGeometry)
    this._btnConfirm = null;
    this._btnRedraw  = null;
    this._btnSkip    = null;
    this._btnHover   = null;   // 현재 호버 중인 버튼 mesh

    // 안내 라벨
    this._label = this._makeLabel('✦  보상 카드를 선택하세요  ✦', '#ffe066');
    this._label.visible = false;

    // 레이캐스트
    this._ray   = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._bMove = this._onMove.bind(this);
    this._bDown = this._onDown.bind(this);
  }

  // ══════════════════════════════════════
  // 공개 API
  // ══════════════════════════════════════

  show(choices, rerolls, onPick, onReroll, onSkip) {
    this.hide();
    this._onPick   = onPick;
    this._onReroll = onReroll;
    this._onSkip   = onSkip;
    this._rerolls  = rerolls;
    this._state    = 'dealing';
    this._dealTimer = 0;
    this._time = 0;
    this._spawnCards(choices);
    addEventListener('pointermove', this._bMove);
    addEventListener('pointerdown',  this._bDown, true);
  }

  refresh(choices, rerolls) {
    this._clearCards();
    this._hideButtons();
    this._rerolls   = rerolls;
    this._chosenIdx = -1;
    this._hoveredIdx = -1;
    this._state     = 'dealing';
    this._dealTimer = 0;
    this._label.visible = false;
    this._spawnCards(choices);
  }

  hide() {
    this._state = null;
    this._clearCards();
    this._hideButtons();
    this._chosenIdx  = -1;
    this._hoveredIdx = -1;
    this._label.visible = false;
    removeEventListener('pointermove', this._bMove);
    removeEventListener('pointerdown',  this._bDown, true);
  }

  update(dt) {
    if (!this._state) return;
    if (this._state === 'dealing')   { this._updateDealing(dt);   }
    if (this._state === 'selecting') { this._updateSelecting(dt); }
    if (this._state === 'chosen')    { this._updateChosen(dt);    }
    this._updateLabelPos();
  }

  // ══════════════════════════════════════
  // 카드 생성
  // ══════════════════════════════════════

  _spawnCards(choices) {
    const targets = this._computeTargets(choices.length);

    for (let i = 0; i < choices.length; i++) {
      const mesh = this._makeCardMesh(choices[i]);
      const from = new THREE.Vector3(DEAL_ORIGIN_X, DEAL_ORIGIN_Y, DEAL_ORIGIN_Z);
      const to   = targets[i];
      const ctrl = new THREE.Vector3(
        (from.x + to.x) / 2,
        Math.max(from.y, to.y) + DEAL_ARC_H,
        (from.z + to.z) / 2,
      );
      mesh.position.copy(from);
      mesh.scale.setScalar(0.01);
      this._root.add(mesh);
      this._cards.push({
        mesh, cardDef: choices[i],
        from, to, ctrl,
        dealT: 0, dealDelay: i * DEAL_STAGGER, dealt: false,
        hoverT: 0,
      });
    }
  }

  /** 가로 카드 3장 위치 계산 (월드 고정 좌표, X축으로 펼침) */
  _computeTargets(n) {
    const targets = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * CARD_SPREAD;
      targets.push(new THREE.Vector3(x, CARD_BASE_Y, CARD_BASE_Z));
    }
    return targets;
  }

  /**
   * 평면 가로 카드의 +Y 앞면이 카메라를 향하도록 rotation 계산.
   * 카드는 바닥에 눕혀진 상태(+Y=앞)이므로 elevation + azimuth 기울기만 적용.
   */
  _faceCamera(mesh) {
    const cam = this.sceneMgr.camera;
    const dx  = cam.position.x - mesh.position.x;
    const dy  = cam.position.y - mesh.position.y;
    const dz  = cam.position.z - mesh.position.z;
    const hDist = Math.sqrt(dx * dx + dz * dz);
    mesh.rotation.set(
      Math.atan2(dy, hDist),   // X: 카메라 고도만큼 앞면 기울임
      Math.atan2(dx, dz),      // Y: 카메라 수평 방향
      0,
    );
  }

  // ══════════════════════════════════════
  // 업데이트 단계
  // ══════════════════════════════════════

  _updateDealing(dt) {
    this._dealTimer += dt;
    let allDealt = true;

    for (const c of this._cards) {
      if (c.dealt) continue;
      const elapsed = this._dealTimer - c.dealDelay;
      if (elapsed <= 0) { allDealt = false; continue; }

      c.dealT = Math.min(c.dealT + dt / DEAL_DUR, 1);
      const t = this._easeOut(c.dealT), mt = 1 - t;

      c.mesh.position.set(
        mt*mt*c.from.x + 2*mt*t*c.ctrl.x + t*t*c.to.x,
        mt*mt*c.from.y + 2*mt*t*c.ctrl.y + t*t*c.to.y,
        mt*mt*c.from.z + 2*mt*t*c.ctrl.z + t*t*c.to.z,
      );
      c.mesh.scale.setScalar(THREE.MathUtils.lerp(0.01, 1.0, t));
      if (t > 0.4) this._faceCamera(c.mesh);

      if (c.dealT >= 1) {
        c.dealt = true;
        c.mesh.position.copy(c.to);
        c.mesh.scale.setScalar(1);
        this._faceCamera(c.mesh);
      } else {
        allDealt = false;
      }
    }

    if (allDealt) {
      this._state = 'selecting';
      this._time  = 0;
      this._label.visible = true;
    }
  }

  _updateSelecting(dt) {
    this._time += dt;
    for (let i = 0; i < this._cards.length; i++) {
      const c   = this._cards[i];
      const bob = Math.sin(this._time * BOB_FREQ + i * BOB_PHASE) * BOB_AMP;
      c.hoverT  = THREE.MathUtils.lerp(c.hoverT, i === this._hoveredIdx ? 1 : 0, dt * 10);
      c.mesh.position.y = c.to.y + bob + c.hoverT * HOVER_RISE;
      c.mesh.scale.setScalar(THREE.MathUtils.lerp(c.mesh.scale.x, 1.0 + c.hoverT * 0.04, dt * 10));
    }
  }

  _updateChosen(dt) {
    this._time += dt;
    for (let i = 0; i < this._cards.length; i++) {
      const c = this._cards[i];
      if (i === this._chosenIdx) {
        const bob = Math.sin(this._time * BOB_FREQ * 0.7) * BOB_AMP * 0.5;
        c.mesh.position.y = THREE.MathUtils.lerp(c.mesh.position.y, c.to.y + HOVER_RISE + bob, dt * 6);
        c.mesh.scale.setScalar(THREE.MathUtils.lerp(c.mesh.scale.x, CHOSEN_SCALE, dt * 8));
      } else {
        c.mesh.position.y = THREE.MathUtils.lerp(c.mesh.position.y, c.to.y - 0.2, dt * 6);
        c.mesh.scale.setScalar(THREE.MathUtils.lerp(c.mesh.scale.x, DIM_SCALE, dt * 8));
      }
    }

    // 버튼 위치: 선택된 카드 아래
    if (this._btnConfirm && this._chosenIdx >= 0) {
      const chosen = this._cards[this._chosenIdx];
      const bx = chosen.to.x;
      const by = chosen.to.y - SEL_H * CHOSEN_SCALE / 2 - 0.3;
      const bz = chosen.to.z;
      this._btnConfirm.position.set(bx - 0.52, by, bz);
      this._btnRedraw.position.set(bx + 0.52, by, bz);
      this._faceCamera(this._btnConfirm);
      this._faceCamera(this._btnRedraw);
      if (this._btnSkip) {
        this._btnSkip.position.set(bx, by - 0.26, bz);
        this._faceCamera(this._btnSkip);
      }
    }
  }

  // ══════════════════════════════════════
  // 입력
  // ══════════════════════════════════════

  _onMove(e) {
    if (this._state !== 'selecting' && this._state !== 'chosen') return;
    this._setMouse(e);
    this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);

    if (this._state === 'selecting') {
      const hits = this._ray.intersectObjects(this._cards.map(c => c.mesh), true);
      this._hoveredIdx = hits.length > 0 ? this._resolveIdx(hits[0].object) : -1;
    }

    if (this._state === 'chosen') {
      const btns = [this._btnConfirm, this._btnRedraw, this._btnSkip].filter(Boolean);
      const hits = this._ray.intersectObjects(btns);
      const prev = this._btnHover;
      this._btnHover = hits.length > 0 ? hits[0].object : null;
      if (this._btnHover !== prev) {
        if (prev)              this._setBtnHover(prev, false);
        if (this._btnHover)   this._setBtnHover(this._btnHover, true);
      }
    }
  }

  _onDown(e) {
    if (!this._state) return;
    this._setMouse(e);
    this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);

    if (this._state === 'selecting') {
      const hits = this._ray.intersectObjects(this._cards.map(c => c.mesh), true);
      if (hits.length > 0) {
        const idx = this._resolveIdx(hits[0].object);
        if (idx >= 0) { e.stopPropagation(); this._chooseCard(idx); }
      }
    } else if (this._state === 'chosen') {
      const btns = [this._btnConfirm, this._btnRedraw, this._btnSkip].filter(Boolean);
      const hits = this._ray.intersectObjects(btns);
      if (hits.length > 0) {
        e.stopPropagation();
        const h = hits[0].object;
        if (h === this._btnConfirm) this._confirm();
        if (h === this._btnRedraw)  this._redraw();
        if (h === this._btnSkip)    this._skip();
      }
    }
  }

  _chooseCard(idx) {
    this._chosenIdx  = idx;
    this._hoveredIdx = -1;
    this._state      = 'chosen';
    this._time       = 0;
    this._label.visible = false;
    this._buildButtons();
  }

  _confirm() {
    const cb  = this._onPick;
    const idx = this._chosenIdx;
    this.hide();
    if (cb) cb(idx);
  }

  _redraw() {
    if (this._rerolls <= 0) return;
    const cb = this._onReroll;
    if (cb) cb();
  }

  _skip() {
    const cb = this._onSkip;
    this.hide();
    if (cb) cb();
  }

  // ══════════════════════════════════════
  // 버튼 (공중 PlaneGeometry)
  // ══════════════════════════════════════

  _buildButtons() {
    this._hideButtons();

    this._btnConfirm = this._makeAirButton('✓  선택 확인', '#1a7a3c', '#2ecc71');
    this._btnRedraw  = this._rerolls > 0
      ? this._makeAirButton(`↺  다시 뽑기 (${this._rerolls})`, '#7a4a1a', '#e6a020')
      : this._makeAirButton('↺  다시 뽑기 (0)', '#333344', '#555566');
    this._btnSkip = this._makeAirButton('건너뛰기', '#222233', '#555577', true);

    this._root.add(this._btnConfirm);
    this._root.add(this._btnRedraw);
    this._root.add(this._btnSkip);
  }

  _hideButtons() {
    [this._btnConfirm, this._btnRedraw, this._btnSkip].forEach(b => {
      if (b) { this._root.remove(b); b.geometry.dispose(); b.material.dispose(); }
    });
    this._btnConfirm = this._btnRedraw = this._btnSkip = null;
    this._btnHover = null;
  }

  _makeAirButton(text, bg, border, small = false) {
    const cw = small ? 240 : 320, ch = small ? 60 : 90;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const c = cv.getContext('2d');

    // 배경
    c.fillStyle = bg;
    c.strokeStyle = border;
    c.lineWidth = 3;
    this._rr(c, 4, 4, cw - 8, ch - 8, 14);
    c.fill(); c.stroke();

    // 텍스트
    c.font = `bold ${small ? 22 : 30}px system-ui`;
    c.fillStyle = '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4;
    c.fillText(text, cw / 2, ch / 2);

    const mat  = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(small ? 0.7 : 0.92, small ? 0.18 : 0.27), mat);
    mesh.userData._btnBorder = border;
    return mesh;
  }

  _setBtnHover(mesh, hover) {
    if (!mesh?.material?.map) return;
    const alpha = hover ? 1.0 : 0.85;
    mesh.material.opacity = alpha;
    mesh.scale.setScalar(hover ? 1.06 : 1.0);
  }

  // ══════════════════════════════════════
  // 카드 메시 / 텍스처
  // ══════════════════════════════════════

  _makeCardMesh(cardDef) {
    const tex = new THREE.CanvasTexture(createCardTexture(cardDef));
    tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
    const backTex = new THREE.CanvasTexture(createCardBackTexture(CARD_TEX_W, CARD_TEX_H));
    backTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    const frontMat = new THREE.MeshBasicMaterial({ map: tex });
    const backMat  = new THREE.MeshBasicMaterial({ map: backTex });
    const sideMat  = new THREE.MeshBasicMaterial({ color: 0x1a0d30 });

    // 가로 카드 — 바닥에 눕혀서 카메라 쪽으로 기울임 (+Y 앞면)
    // BoxGeometry(W, THICK, H): X=너비, Y=두께, Z=높이
    // 면 순서: [+X,-X, +Y(앞), -Y(뒤), +Z,-Z]
    const geo  = new THREE.BoxGeometry(SEL_W, SEL_THICK, SEL_H);
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, frontMat, backMat, sideMat, sideMat]);
    mesh.castShadow = true;
    return mesh;
  }

  // ══════════════════════════════════════
  // 유틸
  // ══════════════════════════════════════

  _makeLabel(text, color) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 72;
    const c  = cv.getContext('2d');
    c.font = 'bold 38px system-ui';
    c.fillStyle = 'rgba(255,220,100,0.14)'; c.fillRect(0, 0, 512, 72);
    c.fillStyle = color;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(255,200,0,0.55)'; c.shadowBlur = 14;
    c.fillText(text, 256, 36);
    const mat    = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.45, 1);
    this._root.add(sprite);
    return sprite;
  }

  _clearCards() {
    for (const c of this._cards) {
      c.mesh.traverse(o => {
        if (!o.isMesh) return;
        [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      this._root.remove(c.mesh);
    }
    this._cards = [];
  }

  _resolveIdx(obj) {
    let o = obj;
    while (o) { if (o.userData.selCardIdx !== undefined) return o.userData.selCardIdx; o = o.parent; }
    // 카드 mesh를 직접 찾아서 인덱스 반환
    for (let i = 0; i < this._cards.length; i++) {
      if (this._cards[i].mesh === obj || this._cards[i].mesh === obj.parent) return i;
    }
    return -1;
  }

  _setMouse(e) { this._mouse.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1); }

  _easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // ── 라벨 위치 업데이트 (카드 위에 고정) ──
  _updateLabelPos() {
    if (!this._label.visible || this._cards.length === 0) return;
    const mid = this._cards[Math.floor(this._cards.length / 2)];
    this._label.position.set(mid.to.x, mid.to.y + 0.6, mid.to.z);
  }
}
