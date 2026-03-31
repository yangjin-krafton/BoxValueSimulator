import * as THREE from 'three';

/**
 * 3D 쿠폰 카드 덱 — 보드와 타워 사이 바닥에 포커 핸드처럼 배치.
 *
 * - 카드는 가로 카드 형태 (landscape)
 * - 많아지면 자동으로 겹쳐서 부채꼴/중첩 배치
 * - 클릭 시 카메라 앞으로 날아와 상세 보기
 * - 다시 클릭하면 돌아감
 */

const FLOOR_Y = 0.06;

// 카드 크기 (가로 카드)
const CARD_W = 0.7;
const CARD_H = 0.48;
const CARD_THICK = 0.015;

// 카드 영역 위치 (보드와 타워 사이)
const DECK_X = 0;
const DECK_Z = -3.4;
const DECK_Y = FLOOR_Y + CARD_THICK;

// 배치 설정
const MAX_SPREAD = 3.0;      // 최대 펼침 너비
const CARD_OVERLAP = 0.55;   // 카드 간 최소 겹침 비율 (0=완전겹침, 1=안겹침)
const TILT_RANGE = 0.12;     // 좌우 기울기 (라디안)

// 상세 보기 애니메이션
const FLY_DUR = 0.4;         // 날아오는 시간 (초)
const DETAIL_DIST = 2.5;     // 카메라로부터의 거리

// 카테고리 아이콘
const CAT_ICONS = {
  '경제': '💰', '등급': '⭐', '진열': '📦', '탐색': '🔍', '안전': '🛡',
};

export class CardDeck3D {
  /**
   * @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr
   */
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this._root = new THREE.Group();
    sceneMgr.scene.add(this._root);

    // 영역 표시 (바닥 라벨)
    this._areaLabel = this._createFloorLabel('PASSIVE CARDS');
    this._areaLabel.position.set(DECK_X, FLOOR_Y + 0.003, DECK_Z + 0.5);
    this._root.add(this._areaLabel);

    /** @type {Array<{card, mesh, texCanvas, flyState}>} */
    this._cards = [];

    // 상세보기 상태
    this._detailCard = null;     // 현재 상세보기 중인 카드 인덱스
    this._flyT = 0;
    this._flyFrom = new THREE.Vector3();
    this._flyTo = new THREE.Vector3();
    this._flyFromRot = new THREE.Euler();
    this._flyToRot = new THREE.Euler();
    this._flyFromScale = 1;
    this._flyToScale = 1;
    this._flyDir = 0;            // 1=나가기, -1=돌아오기
    this._flyMesh = null;

    // 클릭 감지
    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._setupInput();
  }

  /**
   * 카드 추가.
   * @param {object} cardDef - couponCards.js 카드 객체
   */
  addCard(cardDef) {
    const texCanvas = this._createCardTexture(cardDef);
    const tex = new THREE.CanvasTexture(texCanvas);
    tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    // 카드 메시 (양면)
    const geo = new THREE.BoxGeometry(CARD_W, CARD_THICK, CARD_H);
    const frontMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5, metalness: 0.1,
    });
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e, roughness: 0.6, metalness: 0.2,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x333344, roughness: 0.8,
    });

    // BoxGeometry 면 순서: +x, -x, +y(위=앞면), -y(아래=뒷면), +z, -z
    const mesh = new THREE.Mesh(geo, [
      sideMat, sideMat,   // 좌우
      frontMat, backMat,  // 위(앞), 아래(뒷)
      sideMat, sideMat,   // 앞뒤
    ]);
    mesh.castShadow = true;
    mesh.userData.cardIndex = this._cards.length;

    this._root.add(mesh);
    this._cards.push({ card: cardDef, mesh, texCanvas });

    this._layoutCards();
  }

  /** 모든 카드 제거 */
  clear() {
    for (const c of this._cards) {
      this._root.remove(c.mesh);
    }
    this._cards = [];
    this._detailCard = null;
    this._flyDir = 0;
  }

  /** 카드 수 */
  get count() { return this._cards.length; }

  // ═══════════════ 카드 배치 ═══════════════

  _layoutCards() {
    const n = this._cards.length;
    if (n === 0) return;

    // 카드 간 간격 계산 (많으면 겹침)
    const maxSpacing = CARD_W * CARD_OVERLAP;
    const totalNeeded = maxSpacing * (n - 1) + CARD_W;
    const actualSpread = Math.min(totalNeeded, MAX_SPREAD);
    const spacing = n > 1 ? (actualSpread - CARD_W) / (n - 1) : 0;

    const startX = DECK_X - actualSpread / 2 + CARD_W / 2;

    for (let i = 0; i < n; i++) {
      const { mesh } = this._cards[i];

      // 상세보기 중인 카드는 건너뛰기
      if (this._detailCard === i && this._flyDir !== 0) continue;

      const x = startX + i * spacing;
      const y = DECK_Y + i * 0.003;   // 약간씩 위로 (겹침 순서)
      const z = DECK_Z;

      // 부채꼴 기울기
      const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;  // -1 ~ 1
      const tilt = t * TILT_RANGE;

      mesh.position.set(x, y, z);
      mesh.rotation.set(0, tilt, 0);
    }
  }

  // ═══════════════ 카드 텍스처 ═══════════════

  /** 카드 고유 그라데이션 배경 */
  _drawCardGradient(c, w, h, colors, radius) {
    const grad = c.createLinearGradient(0, 0, w, h);
    if (colors.length === 2) {
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
    } else {
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(0.5, colors[1]);
      grad.addColorStop(1, colors[2]);
    }
    c.fillStyle = grad;
    this._rr(c, 0, 0, w, h, radius);
    c.fill();
  }

  /** 카드 테두리 (밝은 색 = colors의 마지막) */
  _drawCardBorder(c, w, h, colors, radius, lw = 3) {
    const bright = colors[colors.length - 1];
    c.strokeStyle = bright;
    c.lineWidth = lw;
    this._rr(c, lw / 2, lw / 2, w - lw, h - lw, radius);
    c.stroke();
    // 안쪽 글로우 라인
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    this._rr(c, lw + 2, lw + 2, w - lw * 2 - 4, h - lw * 2 - 4, radius - 2);
    c.stroke();
  }

  _createCardTexture(cardDef) {
    const cv = document.createElement('canvas');
    cv.width = 280; cv.height = 192;
    const c = cv.getContext('2d');
    const colors = cardDef.colors || ['#222', '#555'];
    const icon = CAT_ICONS[cardDef.category] || '🃏';
    const bright = colors[colors.length - 1];

    // 고유 그라데이션 배경
    this._drawCardGradient(c, cv.width, cv.height, colors, 12);

    // 테두리
    this._drawCardBorder(c, cv.width, cv.height, colors, 12);

    // 상단 반투명 바
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(4, 4, cv.width - 8, 42);

    // 아이콘 + 이름
    c.font = 'bold 20px system-ui';
    c.fillStyle = bright;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 4;
    c.fillText(`${icon} ${cardDef.name}`, 12, 25);
    c.shadowBlur = 0;

    // 카테고리
    c.font = '13px system-ui';
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.textAlign = 'right';
    c.fillText(cardDef.category, cv.width - 12, 25);

    // 설명
    c.font = '15px system-ui';
    c.fillStyle = '#ddeeff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 3;

    const lines = this._wrapText(c, cardDef.description, cv.width - 28);
    const lineH = 20;
    const startY = 46 + (cv.height - 46) / 2 - (lines.length * lineH) / 2 + lineH / 2;
    for (let i = 0; i < lines.length; i++) {
      c.fillText(lines[i], cv.width / 2, startY + i * lineH);
    }
    c.shadowBlur = 0;

    return cv;
  }

  _createDetailTexture(cardDef) {
    const cv = document.createElement('canvas');
    cv.width = 560; cv.height = 384;
    const c = cv.getContext('2d');
    const colors = cardDef.colors || ['#222', '#555'];
    const icon = CAT_ICONS[cardDef.category] || '🃏';
    const bright = colors[colors.length - 1];

    // 고유 그라데이션 배경
    this._drawCardGradient(c, cv.width, cv.height, colors, 18);

    // 테두리 (이중)
    this._drawCardBorder(c, cv.width, cv.height, colors, 18, 4);

    // 상단 바
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(6, 6, cv.width - 12, 68);

    // 아이콘 + 이름
    c.font = 'bold 34px system-ui';
    c.fillStyle = bright;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 6;
    c.fillText(`${icon} ${cardDef.name}`, 20, 40);
    c.shadowBlur = 0;

    // 카테고리
    c.font = 'bold 18px system-ui';
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.textAlign = 'right';
    c.fillText(cardDef.category, cv.width - 20, 40);

    // 구분선 (그라데이션)
    const lineGrad = c.createLinearGradient(20, 0, cv.width - 20, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.3, bright);
    lineGrad.addColorStop(0.7, bright);
    lineGrad.addColorStop(1, 'transparent');
    c.strokeStyle = lineGrad;
    c.globalAlpha = 0.4;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(20, 78);
    c.lineTo(cv.width - 20, 78);
    c.stroke();
    c.globalAlpha = 1;

    // 설명
    c.font = '24px system-ui';
    c.fillStyle = '#ddeeff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 4;

    const lines = this._wrapText(c, cardDef.description, cv.width - 50);
    const lineH = 34;
    const startY = 82 + (cv.height - 82 - 55) / 2 - (lines.length * lineH) / 2 + lineH / 2;
    for (let i = 0; i < lines.length; i++) {
      c.fillText(lines[i], cv.width / 2, startY + i * lineH);
    }
    c.shadowBlur = 0;

    // 하단 라벨
    c.font = 'bold 14px system-ui';
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillText('PASSIVE EFFECT · 런 동안 지속', cv.width / 2, cv.height - 26);

    // 하단 그라데이션 바 (장식)
    const barGrad = c.createLinearGradient(30, cv.height - 10, cv.width - 30, cv.height - 10);
    barGrad.addColorStop(0, 'transparent');
    barGrad.addColorStop(0.2, bright);
    barGrad.addColorStop(0.8, bright);
    barGrad.addColorStop(1, 'transparent');
    c.strokeStyle = barGrad;
    c.globalAlpha = 0.25;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(30, cv.height - 12);
    c.lineTo(cv.width - 30, cv.height - 12);
    c.stroke();
    c.globalAlpha = 1;

    return cv;
  }

  _wrapText(ctx, text, maxW) {
    const chars = [...text];
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ═══════════════ 상세보기 애니메이션 ═══════════════

  _openDetail(cardIndex) {
    if (this._detailCard !== null) {
      this._closeDetail();
      return;
    }

    const entry = this._cards[cardIndex];
    if (!entry) return;

    this._detailCard = cardIndex;
    this._flyDir = 1;
    this._flyT = 0;
    this._flyMesh = entry.mesh;

    // 출발: 현재 위치
    this._flyFrom.copy(entry.mesh.position);
    this._flyFromRot.copy(entry.mesh.rotation);
    this._flyFromScale = 1;

    // 도착: 카메라 앞
    const cam = this.sceneMgr.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this._flyTo.copy(cam.position).addScaledVector(dir, DETAIL_DIST);
    // 카메라를 바라보도록 회전
    const lookMat = new THREE.Matrix4().lookAt(this._flyTo, cam.position, cam.up);
    this._flyToRot.setFromRotationMatrix(lookMat);
    // x축 90도 보정 (카드가 수평이므로)
    this._flyToRot.x += Math.PI / 2;
    this._flyToScale = 3.5;

    // 상세 텍스처로 교체
    const detailCanvas = this._createDetailTexture(entry.card);
    const detailTex = new THREE.CanvasTexture(detailCanvas);
    detailTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
    entry.mesh.material[2] = new THREE.MeshStandardMaterial({
      map: detailTex, roughness: 0.4, metalness: 0.1,
    });
  }

  _closeDetail() {
    if (this._detailCard === null) return;
    this._flyDir = -1;
    this._flyT = 0;

    // 원래 텍스처 복원
    const entry = this._cards[this._detailCard];
    if (entry) {
      const tex = new THREE.CanvasTexture(entry.texCanvas);
      tex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();
      entry.mesh.material[2] = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.5, metalness: 0.1,
      });
    }
  }

  // ═══════════════ 업데이트 ═══════════════

  update(dt) {
    if (this._flyDir === 0 || !this._flyMesh) return;

    this._flyT = Math.min(this._flyT + dt / FLY_DUR, 1);
    const t = this._easeInOut(this._flyT);

    const mesh = this._flyMesh;

    if (this._flyDir === 1) {
      // 나가기
      mesh.position.lerpVectors(this._flyFrom, this._flyTo, t);
      mesh.rotation.x = THREE.MathUtils.lerp(this._flyFromRot.x, this._flyToRot.x, t);
      mesh.rotation.y = THREE.MathUtils.lerp(this._flyFromRot.y, this._flyToRot.y, t);
      mesh.rotation.z = THREE.MathUtils.lerp(this._flyFromRot.z, this._flyToRot.z, t);
      const s = THREE.MathUtils.lerp(this._flyFromScale, this._flyToScale, t);
      mesh.scale.setScalar(s);
    } else {
      // 돌아오기
      mesh.position.lerpVectors(this._flyTo, this._flyFrom, t);
      mesh.rotation.x = THREE.MathUtils.lerp(this._flyToRot.x, this._flyFromRot.x, t);
      mesh.rotation.y = THREE.MathUtils.lerp(this._flyToRot.y, this._flyFromRot.y, t);
      mesh.rotation.z = THREE.MathUtils.lerp(this._flyToRot.z, this._flyFromRot.z, t);
      const s = THREE.MathUtils.lerp(this._flyToScale, this._flyFromScale, t);
      mesh.scale.setScalar(s);
    }

    if (this._flyT >= 1) {
      if (this._flyDir === -1) {
        // 돌아옴 완료 → 레이아웃 복원
        mesh.scale.setScalar(1);
        this._detailCard = null;
        this._layoutCards();
      }
      this._flyDir = 0;
      this._flyMesh = null;
    }
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // ═══════════════ 입력 ═══════════════

  _setupInput() {
    addEventListener('pointerdown', (e) => {
      // 상세보기 중이면 → 닫기
      if (this._detailCard !== null && this._flyDir === 0) {
        this._closeDetail();
        return;
      }

      if (this._cards.length === 0) return;

      this._mouse.set(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
      );
      this._ray.setFromCamera(this._mouse, this.sceneMgr.camera);

      const meshes = this._cards.map(c => c.mesh);
      const hits = this._ray.intersectObjects(meshes);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.cardIndex;
        if (idx !== undefined) {
          e.stopPropagation();
          this._openDetail(idx);
        }
      }
    }, true);  // capture phase로 다른 클릭보다 먼저
  }

  // ═══════════════ 유틸 ═══════════════

  _createFloorLabel(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 48;
    const c = cv.getContext('2d');
    c.font = 'bold 20px system-ui';
    c.fillStyle = 'rgba(70, 90, 120, 0.35)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cv.width / 2, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.3, 1);
    return sprite;
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
}
