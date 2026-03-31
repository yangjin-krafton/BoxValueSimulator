import * as THREE from 'three';
import { createCardBackTexture } from '../rendering/CardBackTexture.js';
import { createCardTexture, createDetailTexture } from '../rendering/CouponCardDraw.js';
import { InputGuard } from '../core/InputGuard.js';

/**
 * 3D 쿠폰 카드 덱 — 중앙 보드판 왼쪽에 항상 스택 덱 형태로 표시.
 *
 * - 카드를 획득할 때마다 덱 위에 쌓임 (카드 1장씩 Y 방향으로 적층)
 * - 각 카드는 약간의 랜덤 회전/오프셋으로 자연스러운 덱 느낌
 * - 받침 트레이(tray) 메시로 3D 덱 느낌 강화
 * - 덱 클릭 → 맨 위 카드부터 순서대로 상세보기, 다시 클릭 → 닫기
 * - 호버 시 맨 위 카드가 살짝 떠오름
 */

const FLOOR_Y    = 0.06;

// 카드 크기 (가로 카드, 바닥에 눕힘)
const CARD_W     = 0.72;
const CARD_H     = 0.50;
const CARD_THICK = 0.013;

// 덱 위치 — CardZoneBoard에서 정의한 좌표와 일치
import { DECK_WORLD } from './CardZoneBoard.js';
const DECK_X = DECK_WORLD.x;
const DECK_Z = DECK_WORLD.z;

// 스택 설정
const PHANTOM_COUNT  = 16;     // 항상 깔리는 장식용 더미 카드 수
const PHANTOM_Y_STEP = 0.016;  // 더미 카드 간격 (촘촘하게)
const PHANTOM_TOP_Y  = FLOOR_Y + CARD_THICK + PHANTOM_COUNT * PHANTOM_Y_STEP; // 더미 꼭대기 Y

// ── 외부에서 딜링 시작점으로 참조하는 상수 ──
export const DEAL_ORIGIN_X = DECK_X;
export const DEAL_ORIGIN_Z = DECK_Z;
export const DEAL_ORIGIN_Y = PHANTOM_TOP_Y + 0.06;  // 덱 꼭대기 바로 위
const Y_STEP         = 0.038;  // 실제 카드 간 간격 (높게 쌓이게)
const MAX_JITTER     = 0.007;  // XZ 랜덤 오프셋 최대값
const ROT_JITTER     = 0.055;  // Y축 랜덤 회전 최대값 (rad)
const TOP_RISE       = 0.09;   // 호버 시 맨 위 카드 상승

// 상세보기 애니메이션
const FLY_DUR    = 0.42;
const DETAIL_DIST = 2.5;
const DETAIL_SCALE = 3.5;

const CAT_ICONS = { '경제':'💰','등급':'⭐','진열':'📦','탐색':'🔍','안전':'🛡' };

export class CardDeck3D {
  /** @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr */
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this._root    = new THREE.Group();
    sceneMgr.scene.add(this._root);

    /** @type {Array<{card:object, mesh:THREE.Mesh, texCanvas:HTMLCanvasElement, jx:number, jz:number, jr:number}>} */
    this._cards = [];

    // 호버 상태
    this._hoverTop = false;
    this._hoverT   = 0;

    // 상세보기 애니메이션
    this._detailIdx    = -1;
    this._cursorIdx    = -1;   // 다음 클릭에 보여줄 카드 (역순 순환)
    this._flyT         = 0;
    this._flyDir       = 0;    // 1=나가기, -1=돌아오기
    this._flyMesh      = null;
    this._flyFrom      = new THREE.Vector3();
    this._flyTo        = new THREE.Vector3();
    this._flyFromRot   = new THREE.Euler();
    this._flyToRot     = new THREE.Euler();
    this._flyFromScale = 1;
    this._flyToScale   = 1;

    this._buildScene();
    this._setupInput();
  }

  // ══════════════════════════════════════
  // 공개 API
  // ══════════════════════════════════════

  addCard(cardDef) {
    const texCanvas = createCardTexture(cardDef);
    const tex = new THREE.CanvasTexture(texCanvas);
    tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    const backTex  = new THREE.CanvasTexture(createCardBackTexture(280, 192));
    backTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    const geo = new THREE.BoxGeometry(CARD_W, CARD_THICK, CARD_H);
    const frontMat = new THREE.MeshStandardMaterial({ map: tex,     roughness: 0.5, metalness: 0.1 });
    const backMat  = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55, metalness: 0.15 });
    const sideMat  = new THREE.MeshStandardMaterial({ color: 0x1a0d30, roughness: 0.8 });

    // BoxGeometry 면: +x, -x, +y(앞/위), -y(뒤/아래), +z, -z
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, frontMat, backMat, sideMat, sideMat]);
    mesh.castShadow = true;

    // 카드별 고유 지터 — addCard 시 1회 결정, 이후 재배치 시 동일 유지
    const jx = (Math.random() - 0.5) * 2 * MAX_JITTER;
    const jz = (Math.random() - 0.5) * 2 * MAX_JITTER;
    const jr = (Math.random() - 0.5) * 2 * ROT_JITTER;

    this._root.add(mesh);
    this._cards.push({ card: cardDef, mesh, texCanvas, jx, jz, jr });
    this._cursorIdx = this._cards.length - 1;

    this._relayout();
    this._refreshUI();
  }

  clear() {
    for (const c of this._cards) this._root.remove(c.mesh);
    this._cards     = [];
    this._detailIdx = -1;
    this._flyDir    = 0;
    this._cursorIdx = -1;
    this._refreshUI();
  }

  get count() { return this._cards.length; }

  /** 덱 클릭 시 호출할 콜백 등록 */
  onDeckClick(fn) { this._onDeckClick = fn; return this; }

  // ══════════════════════════════════════
  // 씬 구성
  // ══════════════════════════════════════

  _buildScene() {
    // ── 받침 트레이 ──
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x1c1c2c, roughness: 0.65, metalness: 0.45 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.10, 0.018, CARD_H + 0.10), trayMat);
    tray.position.set(DECK_X, FLOOR_Y + 0.009, DECK_Z);
    tray.receiveShadow = true;
    this._root.add(tray);

    // ── 트레이 테두리 링 ──
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x3344aa, roughness: 0.45, metalness: 0.6,
      emissive: 0x112255, emissiveIntensity: 0.5,
    });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.16, 0.008, CARD_H + 0.16), rimMat);
    rim.position.set(DECK_X, FLOOR_Y + 0.005, DECK_Z);
    this._root.add(rim);

    // ── 팬텀 베이스 카드 — 항상 높게 쌓인 덱처럼 보이게 ──
    const phantomBackTex = new THREE.CanvasTexture(createCardBackTexture(280, 192));
    phantomBackTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
    const backMat = new THREE.MeshStandardMaterial({ map: phantomBackTex, roughness: 0.55, metalness: 0.15 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a0d30, roughness: 0.8 });
    const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_THICK, CARD_H);
    const rng = this._seededRng(42);   // 항상 동일한 지터
    for (let i = 0; i < PHANTOM_COUNT; i++) {
      const mesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, backMat, backMat, sideMat, sideMat]);
      const jx = (rng() - 0.5) * 2 * MAX_JITTER;
      const jz = (rng() - 0.5) * 2 * MAX_JITTER;
      const jr = (rng() - 0.5) * 2 * ROT_JITTER;
      mesh.position.set(DECK_X + jx, FLOOR_Y + CARD_THICK + i * PHANTOM_Y_STEP, DECK_Z + jz);
      mesh.rotation.y = jr;
      this._root.add(mesh);
    }

    // ── 히트 메시 (덱 전체 영역 클릭 감지) — 팬텀 포함 전체 높이 커버 ──
    const stackH = PHANTOM_TOP_Y + 12 * Y_STEP + 0.15;  // 최대 예상 높이
    this._hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_W + 0.18, stackH, CARD_H + 0.18),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this._hitMesh.position.set(DECK_X, FLOOR_Y + stackH / 2, DECK_Z);
    this._root.add(this._hitMesh);

    // ── 바닥 라벨 ──
    this._root.add(this._makeFloorLabel('PASSIVE CARDS', DECK_X, FLOOR_Y + 0.003, DECK_Z + CARD_H / 2 + 0.2));

    // ── 빈 덱 안내 (점선 카드) ──
    this._emptyCard = this._makeEmptySlot();
    this._root.add(this._emptyCard);

    // ── 카드 수 배지 ──
    this._badge = null;
    this._badgeGroup = new THREE.Group();
    this._root.add(this._badgeGroup);
  }

  _relayout() {
    const n = this._cards.length;
    this._emptyCard.visible = (n === 0);

    for (let i = 0; i < n; i++) {
      const { mesh, jx, jz, jr } = this._cards[i];
      if (i === this._detailIdx && this._flyDir !== 0) continue;

      // 팬텀 베이스 위에서 시작
      mesh.position.set(
        DECK_X + jx,
        PHANTOM_TOP_Y + i * Y_STEP,
        DECK_Z  + jz,
      );
      mesh.rotation.set(0, jr, 0);
      mesh.scale.setScalar(1);
    }
  }

  _refreshUI() {
    // 배지 재생성
    for (const c of this._badgeGroup.children) {
      if (c.material) c.material.dispose();
    }
    this._badgeGroup.clear();

    const n = this._cards.length;
    if (n > 0) {
      const badge = this._makeCountBadge(n);
      this._badgeGroup.add(badge);
    }
    this._emptyCard.visible = (n === 0);
  }

  // ══════════════════════════════════════
  // 업데이트
  // ══════════════════════════════════════

  update(dt) {
    // 맨 위 카드 호버 부동
    if (this._cards.length > 0 && this._detailIdx < 0 && this._flyDir === 0) {
      const top     = this._cards[this._cards.length - 1];
      const baseY   = PHANTOM_TOP_Y + (this._cards.length - 1) * Y_STEP;
      this._hoverT  = THREE.MathUtils.lerp(this._hoverT, this._hoverTop ? 1 : 0, dt * 9);
      top.mesh.position.y = baseY + this._hoverT * TOP_RISE;
    }

    // 상세보기 애니메이션
    if (this._flyDir === 0 || !this._flyMesh) return;
    this._flyT = Math.min(this._flyT + dt / FLY_DUR, 1);
    const t    = this._ease(this._flyT);
    const mesh = this._flyMesh;

    if (this._flyDir === 1) {
      mesh.position.lerpVectors(this._flyFrom, this._flyTo, t);
      mesh.rotation.x = THREE.MathUtils.lerp(this._flyFromRot.x, this._flyToRot.x, t);
      mesh.rotation.y = THREE.MathUtils.lerp(this._flyFromRot.y, this._flyToRot.y, t);
      mesh.rotation.z = THREE.MathUtils.lerp(this._flyFromRot.z, this._flyToRot.z, t);
      mesh.scale.setScalar(THREE.MathUtils.lerp(1, DETAIL_SCALE, t));
    } else {
      mesh.position.lerpVectors(this._flyTo, this._flyFrom, t);
      mesh.rotation.x = THREE.MathUtils.lerp(this._flyToRot.x, this._flyFromRot.x, t);
      mesh.rotation.y = THREE.MathUtils.lerp(this._flyToRot.y, this._flyFromRot.y, t);
      mesh.rotation.z = THREE.MathUtils.lerp(this._flyToRot.z, this._flyFromRot.z, t);
      mesh.scale.setScalar(THREE.MathUtils.lerp(DETAIL_SCALE, 1, t));
    }

    if (this._flyT >= 1) {
      if (this._flyDir === -1) {
        mesh.scale.setScalar(1);
        this._detailIdx = -1;
        this._relayout();
      }
      this._flyDir  = 0;
      this._flyMesh = null;
    }
  }

  // ══════════════════════════════════════
  // 상세보기
  // ══════════════════════════════════════

  _openDetail(idx) {
    const entry = this._cards[idx];
    if (!entry) return;

    this._detailIdx    = idx;
    this._flyDir       = 1;
    this._flyT         = 0;
    this._flyMesh      = entry.mesh;
    this._flyFromScale = 1;
    this._flyToScale   = DETAIL_SCALE;

    this._flyFrom.copy(entry.mesh.position);
    this._flyFromRot.copy(entry.mesh.rotation);

    const cam = this.sceneMgr.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this._flyTo.copy(cam.position).addScaledVector(dir, DETAIL_DIST);
    const lookMat = new THREE.Matrix4().lookAt(this._flyTo, cam.position, cam.up);
    this._flyToRot.setFromRotationMatrix(lookMat);
    this._flyToRot.x += Math.PI / 2;

    // 상세 텍스처로 교체
    const detailTex = new THREE.CanvasTexture(createDetailTexture(entry.card));
    detailTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
    entry.mesh.material[2] = new THREE.MeshStandardMaterial({ map: detailTex, roughness: 0.4, metalness: 0.1 });
  }

  _closeDetail() {
    if (this._detailIdx < 0) return;
    this._flyDir = -1;
    this._flyT   = 0;

    const entry = this._cards[this._detailIdx];
    if (entry) {
      const tex = new THREE.CanvasTexture(entry.texCanvas);
      tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
      entry.mesh.material[2] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 });
    }
  }

  // ══════════════════════════════════════
  // 입력
  // ══════════════════════════════════════

  _setupInput() {
    const ray   = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    addEventListener('pointermove', (e) => {
      if (InputGuard.blocked) return;
      if (this._cards.length === 0) return;
      mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(mouse, this.sceneMgr.camera);
      this._hoverTop = ray.intersectObject(this._hitMesh).length > 0 && this._detailIdx < 0;
    });

    addEventListener('pointerdown', (e) => {
      if (InputGuard.blocked) return;
      if (this._flyDir !== 0) return;
      mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(mouse, this.sceneMgr.camera);
      if (ray.intersectObject(this._hitMesh).length > 0) {
        e.stopPropagation();
        if (this._onDeckClick) this._onDeckClick();
      }
    }, true);
  }

  // ══════════════════════════════════════
  // 유틸 메시
  // ══════════════════════════════════════

  _makeFloorLabel(text, x, y, z) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 44;
    const c = cv.getContext('2d');
    c.font = 'bold 17px system-ui';
    c.fillStyle = 'rgba(80,100,160,0.45)';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 128, 22);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.24, 1);
    sprite.position.set(x, y, z);
    return sprite;
  }

  _makeEmptySlot() {
    // 점선 카드 윤곽 — 바닥 평면 메시
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 140;
    const c = cv.getContext('2d');
    c.strokeStyle = 'rgba(80,90,140,0.35)';
    c.lineWidth = 3;
    c.setLineDash([8, 5]);
    this._rr(c, 5, 5, 182, 130, 12);
    c.stroke();
    c.font = '18px system-ui';
    c.fillStyle = 'rgba(100,110,160,0.32)';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('카드 없음', 96, 70);
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(DECK_X, FLOOR_Y + 0.019, DECK_Z);
    return mesh;
  }

  _makeCountBadge(n) {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const c = cv.getContext('2d');
    c.beginPath(); c.arc(48, 48, 44, 0, Math.PI * 2);
    c.fillStyle = 'rgba(38,55,140,0.90)'; c.fill();
    c.strokeStyle = '#6688ff'; c.lineWidth = 3; c.stroke();
    c.font = 'bold 38px system-ui';
    c.fillStyle = '#ccd8ff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${n}`, 48, 50);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.26, 0.26, 1);
    sprite.position.set(DECK_X + CARD_W / 2 + 0.02, FLOOR_Y + 0.24, DECK_Z - CARD_H / 2 - 0.02);
    return sprite;
  }

  // 카드 텍스처는 CouponCardDraw.js 에서 통합 관리

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  _ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /** 시드 고정 난수 — 팬텀 카드 지터가 리로드 후에도 동일하게 */
  _seededRng(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  }
}
