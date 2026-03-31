import * as THREE from 'three';
import { FloorElement } from '../rendering/FloorElement.js';

/**
 * 라운드 승리 후 3D 공간에서 카드 보상을 선택하는 씬.
 *
 * - 기존 택배 상자 자리에 3장의 카드를 세워서 표시
 * - CardDeck3D와 동일한 시각 스타일 (MeshBasicMaterial, 캔버스 텍스처)
 * - 호버 시 카드 상승, 클릭 시 덱 방향으로 날아가며 선택
 * - 리롤 / 건너뛰기 버튼 (FloorElement)
 */

const FLOOR_Y = 0.06;

// 선택 카드 크기 (세로 방향으로 세워서 표시)
const SEL_W     = 1.1;    // 월드 너비
const SEL_H     = 1.58;   // 월드 높이
const SEL_THICK = 0.04;   // 두께

// 캔버스 텍스처 — 세로형
const TEX_W = 240;
const TEX_H = 344;

// 카드를 세울 때 Y 중심 (바닥에 닿게)
const CARD_Y    = FLOOR_Y + SEL_H / 2 + 0.03;
// 카드 기울기: 카메라가 위/앞에 있으므로 앞면이 카메라를 향하도록
const CARD_TILT = -0.22;   // rotation.x (음수 = 상단이 카메라 쪽으로 기움)

// 3장 카드 위치 (택배 타워 기본 자리)
const CARD_POSITIONS = [
  { x: -2.2, z: -5.0 },
  { x:  0.0, z: -5.15 },
  { x:  2.2, z: -5.0 },
];

const HOVER_RISE   = 0.20;   // 호버 시 상승
const SELECT_DUR   = 0.55;   // 선택 애니메이션 길이(초)
const SELECT_TO_Y  = 0.8;    // 카드가 날아갈 Y 높이
const DECK_X       = 0;
const DECK_Z       = -3.4;   // CardDeck3D 위치

const CAT_ICONS = { '경제':'💰','등급':'⭐','진열':'📦','탐색':'🔍','안전':'🛡' };

// ── 리롤 버튼 ──

class RerollButton extends FloorElement {
  constructor(sceneMgr, rerolls) {
    super(sceneMgr, sceneMgr.scene, {
      width: 1.5, depth: 0.48,
      texWidth: 360, texHeight: 116,
      x: -0.9, z: -4.0,
    });
    this._rerolls = rerolls;
  }
  setRerolls(n) { this._rerolls = n; this.redraw(); }
  draw(ctx, w, h, hover) {
    const enabled = this._rerolls > 0;
    ctx.fillStyle = hover && enabled ? 'rgba(100,160,55,0.88)'
                  : enabled          ? 'rgba(70,120,35,0.82)'
                  :                    'rgba(35,35,45,0.65)';
    this.roundRect(ctx, 6, 6, w-12, h-12, 15);
    ctx.fill();
    ctx.strokeStyle = enabled ? (hover ? '#aaee66' : '#88cc44') : 'rgba(80,80,100,0.5)';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, 6, 6, w-12, h-12, 15);
    ctx.stroke();
    ctx.font = 'bold 32px system-ui';
    ctx.fillStyle = enabled ? '#ddffa0' : '#666677';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🔄 리롤 (${this._rerolls}회 남음)`, w/2, h/2);
  }
}

// ── 건너뛰기 버튼 ──

class SkipButton extends FloorElement {
  draw(ctx, w, h, hover) {
    ctx.fillStyle = hover ? 'rgba(80,80,105,0.88)' : 'rgba(48,48,68,0.75)';
    this.roundRect(ctx, 6, 6, w-12, h-12, 15);
    ctx.fill();
    ctx.strokeStyle = hover ? '#aaaacc' : 'rgba(100,100,130,0.45)';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, 6, 6, w-12, h-12, 15);
    ctx.stroke();
    ctx.font = 'bold 32px system-ui';
    ctx.fillStyle = '#aaaacc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('건너뛰기', w/2, h/2);
  }
}

// ── 메인 씬 클래스 ──

export class CardSelectionScene3D {
  /** @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr */
  constructor(sceneMgr) {
    this.sceneMgr  = sceneMgr;
    this._root     = new THREE.Group();
    sceneMgr.scene.add(this._root);

    this._active     = false;

    /** @type {Array<{mesh:THREE.Mesh, cardDef:object, baseY:number, hoverT:number}>} */
    this._cards      = [];
    this._hoveredIdx = -1;
    this._selectIdx  = -1;

    // 선택 애니메이션
    this._selectT    = 0;
    this._selectFrom = new THREE.Vector3();
    this._selectTo   = new THREE.Vector3();

    // 버튼
    this._rerollBtn  = null;
    this._skipBtn    = null;

    // 안내 라벨 스프라이트
    this._label      = this._buildLabel();

    // 콜백
    this._onPick     = null;
    this._onReroll   = null;
    this._onSkip     = null;

    // 입력
    this._ray        = new THREE.Raycaster();
    this._mouse      = new THREE.Vector2();
    this._boundMove  = this._handleMove.bind(this);
    this._boundDown  = this._handleDown.bind(this);
  }

  // ══════════════════════════════════════
  // 공개 API
  // ══════════════════════════════════════

  /**
   * 카드 선택 씬을 활성화한다.
   * @param {object[]} choices       3장 카드 정의 배열
   * @param {number}   rerolls       남은 리롤 횟수
   * @param {function} onPick        (choiceIndex) => void
   * @param {function} onReroll      () => void
   * @param {function} onSkip        () => void
   */
  show(choices, rerolls, onPick, onReroll, onSkip) {
    this.hide();

    this._onPick   = onPick;
    this._onReroll = onReroll;
    this._onSkip   = onSkip;
    this._active   = true;

    this._spawnCards(choices);
    this._buildButtons(rerolls);
    this._label.visible = true;

    addEventListener('pointermove', this._boundMove);
    addEventListener('pointerdown', this._boundDown, true);
  }

  /** 리롤 후 카드 새로 표시 */
  refresh(choices, rerolls) {
    for (const c of this._cards) {
      c.mesh.traverse(o => {
        if (o.isMesh) {
          [].concat(o.material).forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this._root.remove(c.mesh);
    }
    this._cards      = [];
    this._hoveredIdx = -1;
    this._spawnCards(choices);
    if (this._rerollBtn) this._rerollBtn.setRerolls(rerolls);
  }

  hide() {
    this._active = false;
    this._selectIdx = -1;
    this._hoveredIdx = -1;
    this._label.visible = false;

    for (const c of this._cards) {
      c.mesh.traverse(o => {
        if (o.isMesh) {
          [].concat(o.material).forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this._root.remove(c.mesh);
    }
    this._cards = [];

    if (this._rerollBtn) { this._rerollBtn.dispose(); this._rerollBtn = null; }
    if (this._skipBtn)   { this._skipBtn.dispose();   this._skipBtn   = null; }

    removeEventListener('pointermove', this._boundMove);
    removeEventListener('pointerdown', this._boundDown, true);
  }

  update(dt) {
    if (!this._active && this._selectIdx === -1) return;

    // 호버 Y 애니메이션
    for (let i = 0; i < this._cards.length; i++) {
      if (i === this._selectIdx) continue;
      const c = this._cards[i];
      const target = (i === this._hoveredIdx && this._selectIdx === -1) ? 1 : 0;
      c.hoverT = THREE.MathUtils.lerp(c.hoverT, target, dt * 9);
      c.mesh.position.y = c.baseY + c.hoverT * HOVER_RISE;
    }

    // 선택 애니메이션
    if (this._selectIdx >= 0) {
      this._selectT = Math.min(this._selectT + dt / SELECT_DUR, 1);
      const t = this._easeOut(this._selectT);

      // 선택된 카드: 덱 쪽으로 날아감 + 축소
      const sel = this._cards[this._selectIdx];
      if (sel) {
        sel.mesh.position.lerpVectors(this._selectFrom, this._selectTo, t);
        sel.mesh.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.05, t));
      }

      // 나머지 카드: 아래로 가라앉으며 축소
      for (let i = 0; i < this._cards.length; i++) {
        if (i === this._selectIdx) continue;
        const c = this._cards[i];
        c.mesh.position.y = THREE.MathUtils.lerp(c.baseY, c.baseY - 0.8, t);
        c.mesh.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.0, t));
      }

      if (this._selectT >= 1) {
        const cb  = this._onPick;
        const idx = this._selectIdx;
        this.hide();
        if (cb) cb(idx);
      }
    }
  }

  // ══════════════════════════════════════
  // 카드 생성
  // ══════════════════════════════════════

  _spawnCards(choices) {
    for (let i = 0; i < choices.length; i++) {
      const pos  = CARD_POSITIONS[i] ?? { x: (i - 1) * 2.4, z: -5.0 };
      const mesh = this._createCardMesh(choices[i]);
      mesh.position.set(pos.x, CARD_Y, pos.z);
      mesh.rotation.x = CARD_TILT;
      mesh.userData.selCardIdx = i;
      this._root.add(mesh);
      this._cards.push({ mesh, cardDef: choices[i], baseY: CARD_Y, hoverT: 0 });
    }
  }

  _buildButtons(rerolls) {
    this._rerollBtn = new RerollButton(this.sceneMgr, rerolls);
    this._rerollBtn.show();
    this._rerollBtn.onClick(() => {
      if (this._onReroll) this._onReroll();
    });

    this._skipBtn = new SkipButton(this.sceneMgr, this.sceneMgr.scene, {
      width: 1.1, depth: 0.48,
      texWidth: 260, texHeight: 116,
      x: 0.85, z: -4.0,
    });
    this._skipBtn.show();
    this._skipBtn.onClick(() => {
      const cb = this._onSkip;
      this.hide();
      if (cb) cb();
    });
  }

  _buildLabel() {
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 80;
    const c = cv.getContext('2d');
    c.font = 'bold 38px system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,220,100,0.18)';
    c.fillRect(0, 0, 480, 80);
    c.fillStyle = '#ffe066';
    c.shadowColor = 'rgba(255,200,0,0.6)';
    c.shadowBlur = 12;
    c.fillText('✦  보상 카드 선택  ✦', 240, 40);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.0, 0.5, 1);
    sprite.position.set(0, CARD_Y + SEL_H / 2 + 0.35, -5.05);
    sprite.visible = false;
    this._root.add(sprite);
    return sprite;
  }

  // ══════════════════════════════════════
  // 입력 처리
  // ══════════════════════════════════════

  _handleMove(e) {
    if (!this._active || this._selectIdx >= 0) return;
    this._setMouse(e);
    this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);

    // 카드 호버
    const cardMeshes = this._cards.map(c => c.mesh);
    const hits = this._ray.intersectObjects(cardMeshes, true);
    const newHover = hits.length > 0 ? this._resolveCardIdx(hits[0].object) : -1;
    this._hoveredIdx = newHover;

    // 버튼 호버
    const rTarget = this._rerollBtn?.getHitTarget();
    const sTarget = this._skipBtn?.getHitTarget();
    const btnTargets = [rTarget, sTarget].filter(Boolean);
    if (btnTargets.length > 0) {
      const btnHits = this._ray.intersectObjects(btnTargets);
      const hitObj  = btnHits[0]?.object ?? null;
      this._rerollBtn?.setHover(hitObj === rTarget);
      this._skipBtn?.setHover(hitObj === sTarget);
    }
  }

  _handleDown(e) {
    if (!this._active || this._selectIdx >= 0) return;
    this._setMouse(e);
    this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);

    // 카드 클릭
    const cardMeshes = this._cards.map(c => c.mesh);
    const hits = this._ray.intersectObjects(cardMeshes, true);
    if (hits.length > 0) {
      const idx = this._resolveCardIdx(hits[0].object);
      if (idx >= 0) {
        e.stopPropagation();
        this._startSelect(idx);
        return;
      }
    }

    // 버튼 클릭
    const rTarget = this._rerollBtn?.getHitTarget();
    const sTarget = this._skipBtn?.getHitTarget();
    const btnTargets = [rTarget, sTarget].filter(Boolean);
    if (btnTargets.length > 0) {
      const btnHits = this._ray.intersectObjects(btnTargets);
      if (btnHits.length > 0) {
        e.stopPropagation();
        const h = btnHits[0].object;
        if (h === rTarget) this._rerollBtn._fireClick();
        if (h === sTarget) this._skipBtn._fireClick();
      }
    }
  }

  _setMouse(e) {
    this._mouse.set(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1,
    );
  }

  _resolveCardIdx(obj) {
    let o = obj;
    while (o) {
      if (o.userData.selCardIdx !== undefined) return o.userData.selCardIdx;
      o = o.parent;
    }
    return -1;
  }

  _startSelect(idx) {
    this._selectIdx = idx;
    this._selectT   = 0;
    this._selectFrom.copy(this._cards[idx].mesh.position);
    this._selectTo.set(
      DECK_X + (Math.random() - 0.5) * 0.5,
      SELECT_TO_Y,
      DECK_Z,
    );
    this._label.visible = false;
    if (this._rerollBtn) this._rerollBtn.hide();
    if (this._skipBtn)   this._skipBtn.hide();
  }

  // ══════════════════════════════════════
  // 카드 메시 / 텍스처
  // ══════════════════════════════════════

  _createCardMesh(cardDef) {
    const texCanvas = this._createCardTexture(cardDef);
    const tex = new THREE.CanvasTexture(texCanvas);
    tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    // MeshBasicMaterial — 보드판과 동일하게 emission only
    const frontMat = new THREE.MeshBasicMaterial({ map: tex });
    const backMat  = new THREE.MeshBasicMaterial({ color: 0x1a1a2e });
    const sideMat  = new THREE.MeshBasicMaterial({ color: 0x2a2a40 });

    // BoxGeometry: X=너비, Y=높이, Z=두께
    // 면 순서: +X, -X, +Y(위끝), -Y(아래끝), +Z(앞면), -Z(뒷면)
    const geo  = new THREE.BoxGeometry(SEL_W, SEL_H, SEL_THICK);
    const mesh = new THREE.Mesh(geo, [
      sideMat, sideMat,   // 좌우 측면
      sideMat, sideMat,   // 위아래 끝 (얇은 면)
      frontMat, backMat,  // 앞면, 뒷면
    ]);
    mesh.castShadow = true;
    return mesh;
  }

  _createCardTexture(cardDef) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const c = cv.getContext('2d');
    const colors = cardDef.colors || ['#223355', '#445588'];
    const bright = colors[colors.length - 1];
    const icon   = CAT_ICONS[cardDef.category] || '🃏';

    // ── 배경 그라데이션 ──
    const grad = c.createLinearGradient(0, 0, TEX_W, TEX_H);
    if (colors.length === 2) {
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
    } else {
      grad.addColorStop(0,   colors[0]);
      grad.addColorStop(0.5, colors[1]);
      grad.addColorStop(1,   colors[2]);
    }
    c.fillStyle = grad;
    this._rr(c, 0, 0, TEX_W, TEX_H, 16);
    c.fill();

    // ── 테두리 ──
    c.strokeStyle = bright;
    c.lineWidth = 4;
    this._rr(c, 2, 2, TEX_W-4, TEX_H-4, 15);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.lineWidth = 1.5;
    this._rr(c, 8, 8, TEX_W-16, TEX_H-16, 11);
    c.stroke();

    // ── 헤더 바 ──
    c.fillStyle = 'rgba(0,0,0,0.42)';
    c.fillRect(4, 4, TEX_W-8, 58);

    // ── 아이콘 + 카드명 ──
    c.font = 'bold 22px system-ui';
    c.fillStyle = bright;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.65)';
    c.shadowBlur = 5;
    c.fillText(`${icon} ${cardDef.name}`, 14, 33);
    c.shadowBlur = 0;

    // ── 카테고리 ──
    c.font = '14px system-ui';
    c.fillStyle = 'rgba(255,255,255,0.38)';
    c.textAlign = 'right';
    c.fillText(cardDef.category, TEX_W-14, 33);

    // ── 구분선 ──
    const lineGrad = c.createLinearGradient(14, 0, TEX_W-14, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.2, bright);
    lineGrad.addColorStop(0.8, bright);
    lineGrad.addColorStop(1, 'transparent');
    c.strokeStyle = lineGrad;
    c.globalAlpha = 0.38;
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(14, 66); c.lineTo(TEX_W-14, 66); c.stroke();
    c.globalAlpha = 1;

    // ── 효과 설명 ──
    c.font = '18px system-ui';
    c.fillStyle = '#ddeeff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 3;
    const lines  = this._wrapText(c, cardDef.description, TEX_W - 30);
    const lineH  = 27;
    const bodyH  = TEX_H - 66 - 44;
    const startY = 66 + bodyH / 2 - (lines.length * lineH) / 2 + lineH / 2;
    for (let i = 0; i < lines.length; i++) {
      c.fillText(lines[i], TEX_W / 2, startY + i * lineH);
    }
    c.shadowBlur = 0;

    // ── 하단 라벨 ──
    c.font = 'bold 13px system-ui';
    c.fillStyle = 'rgba(255,255,255,0.2)';
    c.fillText('PASSIVE EFFECT', TEX_W / 2, TEX_H - 22);

    return cv;
  }

  // ══════════════════════════════════════
  // 유틸
  // ══════════════════════════════════════

  _wrapText(ctx, text, maxW) {
    const chars = [...text];
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line.length > 0) {
        lines.push(line); line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _easeOut(t) { return 1 - Math.pow(1 - t, 3); }
}
