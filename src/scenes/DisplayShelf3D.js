import * as THREE from 'three';

/**
 * 바닥 보드판 — 세로 뷰 레이아웃.
 * 슬롯 왼쪽에 판매 버튼 영역 포함.
 *
 *  ┌──────────────────┐
 *  │  ROUND · 목표     │
 *  ├──────────────────┤
 *  │ [판매] ⭕ 슬롯1 가격 │
 *  │ [판매] ⭕ 슬롯2 가격 │
 *  │ [판매] ⭕ 슬롯3 가격 │
 *  ├──────────────────┤
 *  │  합계 / 달성률 바   │
 *  └──────────────────┘
 */

const FLOOR_Y = 0.06;
const SLOT_COUNT = 3;

const BOARD_W = 2.6;
const BOARD_D = 4.8;
const BOARD_Z = -0.4;

const TEX_W = 512;
const TEX_H = 948;

const PRODUCT_Y = FLOOR_Y + 0.6;

// 캔버스 좌표 → 3D 월드 좌표
// PlaneGeometry rotation.x=-PI/2: 캔버스 y=0(상단)→z뒤, y=H(하단)→z앞
// 하지만 캔버스 텍스처는 y축이 뒤집혀서 렌더됨 (UV v=0=하단)
// 실측: 캔버스 상단(y=0) = 3D z가 가장 큰 값(앞/카메라쪽)
function canvasToWorld(cx, cy) {
  const x = (cx / TEX_W - 0.5) * BOARD_W;
  const z = BOARD_Z + (cy / TEX_H - 0.5) * BOARD_D;
  return { x, z };
}

// 캔버스에서 슬롯 원 중심 좌표 (drawBoard 기준)
const _topH = 110, _pad = 14, _slotStartY = _topH + _pad + 40, _slotGap = 210, _slotR = 58;
const _slotCX_canvas = TEX_W / 2 + 30;

const SLOT_POSITIONS = [0, 1, 2].map(i => {
  const cy = _slotStartY + i * _slotGap + _slotR;
  return canvasToWorld(_slotCX_canvas, cy);
});

const _btnCX_canvas = 52 + 40;
const SELL_BTN_POSITIONS = [0, 1, 2].map(i => {
  const cy = _slotStartY + i * _slotGap + _slotR;
  return canvasToWorld(_btnCX_canvas, cy);
});

export { SLOT_POSITIONS, SLOT_COUNT };

export class DisplayShelf3D {
  constructor(sceneMgr, assetLoader) {
    this.sceneMgr = sceneMgr;
    this.assetLoader = assetLoader;

    this._root = new THREE.Group();
    sceneMgr.scene.add(this._root);

    this._slots = [];
    /** @type {Array<THREE.Mesh>} 판매 버튼 히트 메시 */
    this._sellBtns = [];

    this._round = 1;
    this._target = 0;
    this._total = 0;
    this._slotPrices = [0, 0, 0];
    this._slotNames = ['', '', ''];
    this._slotGrades = ['', '', ''];
    this._slotFilled = [false, false, false];
    this._sellHighlight = false;

    this._buildBoard();
    this._buildSlots3D();
    this._buildSellButtons();
    this._drawBoard();

    // 디버그: 슬롯 위치에 빨간 구체 표시
    for (let i = 0; i < SLOT_COUNT; i++) {
      const pos = SLOT_POSITIONS[i];
      const sg = new THREE.SphereGeometry(0.08);
      const sm = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const s = new THREE.Mesh(sg, sm);
      s.position.set(pos.x, FLOOR_Y + 0.1, pos.z);
      this._root.add(s);
      console.log(`슬롯${i} 3D위치: x=${pos.x.toFixed(3)}, z=${pos.z.toFixed(3)}`);
    }
  }

  // ═══════════════ 보드 ═══════════════

  _buildBoard() {
    this._boardCanvas = document.createElement('canvas');
    this._boardCanvas.width = TEX_W;
    this._boardCanvas.height = TEX_H;
    this._boardCtx = this._boardCanvas.getContext('2d');
    this._boardTex = new THREE.CanvasTexture(this._boardCanvas);
    this._boardTex.anisotropy = this.sceneMgr.renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshStandardMaterial({
      map: this._boardTex, roughness: 0.7, metalness: 0.1,
      transparent: true, polygonOffset: true, polygonOffsetFactor: -1,
    });
    this._boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D), mat);
    this._boardMesh.rotation.x = -Math.PI / 2;
    this._boardMesh.position.set(0, FLOOR_Y + 0.008, BOARD_Z);
    this._boardMesh.receiveShadow = true;
    this._root.add(this._boardMesh);
  }

  _drawBoard() {
    const c = this._boardCtx;
    const W = TEX_W, H = TEX_H;
    const pad = 14;

    c.clearRect(0, 0, W, H);

    // 배경
    c.fillStyle = 'rgba(10, 14, 22, 0.78)';
    this._rr(c, pad, pad, W - pad * 2, H - pad * 2, 20);
    c.fill();
    c.strokeStyle = 'rgba(90, 110, 150, 0.45)';
    c.lineWidth = 2.5;
    this._rr(c, pad, pad, W - pad * 2, H - pad * 2, 20);
    c.stroke();

    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // ── 상단 ──
    const topH = 110;
    c.fillStyle = 'rgba(18, 22, 38, 0.6)';
    this._rr(c, pad + 8, pad + 8, W - pad * 2 - 16, topH, 12);
    c.fill();

    c.font = 'bold 30px system-ui';
    c.fillStyle = '#8899bb';
    c.fillText(`ROUND ${this._round}`, W / 2, pad + 38);

    c.font = 'bold 34px system-ui';
    c.fillStyle = '#f0c040';
    c.fillText(`목표 ₩${this._target.toLocaleString()}`, W / 2, pad + 82);

    // ── 슬롯 3개 ──
    const slotStartY = topH + pad + 40;
    const slotGap = 210;
    const slotR = 58;
    // 슬롯 원 중심 x를 오른쪽으로 이동 (판매 버튼 공간)
    const slotCX = W / 2 + 30;

    for (let i = 0; i < 3; i++) {
      const cy = slotStartY + i * slotGap + slotR;

      // 판매 버튼 (슬롯 왼쪽)
      if (this._slotFilled[i]) {
        const btnX = 52, btnY = cy - 22, btnW = 80, btnH = 44;
        c.fillStyle = 'rgba(180, 40, 40, 0.7)';
        this._rr(c, btnX, btnY, btnW, btnH, 8);
        c.fill();
        c.strokeStyle = '#ff6655';
        c.lineWidth = 2;
        this._rr(c, btnX, btnY, btnW, btnH, 8);
        c.stroke();

        c.font = 'bold 20px system-ui';
        c.fillStyle = '#ffcccc';
        c.fillText('판매', btnX + btnW / 2, cy);
      } else {
        // 빈 슬롯 — 판매 버튼 비활성
        const btnX = 52, btnY = cy - 22, btnW = 80, btnH = 44;
        c.fillStyle = 'rgba(30, 35, 50, 0.4)';
        this._rr(c, btnX, btnY, btnW, btnH, 8);
        c.fill();
        c.strokeStyle = 'rgba(60, 70, 90, 0.3)';
        c.lineWidth = 1;
        this._rr(c, btnX, btnY, btnW, btnH, 8);
        c.stroke();
      }

      // 슬롯 원
      c.beginPath();
      c.arc(slotCX, cy, slotR, 0, Math.PI * 2);
      c.fillStyle = this._slotFilled[i]
        ? 'rgba(240, 192, 64, 0.1)'
        : 'rgba(35, 45, 65, 0.5)';
      c.fill();

      c.beginPath();
      c.arc(slotCX, cy, slotR, 0, Math.PI * 2);
      if (this._slotFilled[i]) {
        c.strokeStyle = this._gradeColor(this._slotGrades[i]);
        c.lineWidth = 3;
        c.setLineDash([]);
      } else {
        c.strokeStyle = 'rgba(60, 80, 110, 0.55)';
        c.lineWidth = 2;
        c.setLineDash([8, 6]);
      }
      c.stroke();
      c.setLineDash([]);

      if (!this._slotFilled[i]) {
        c.font = 'bold 40px system-ui';
        c.fillStyle = 'rgba(60, 80, 110, 0.45)';
        c.fillText(`${i + 1}`, slotCX, cy);
      } else {
        // 이름 + 가격 (오른쪽)
        c.font = 'bold 20px system-ui';
        c.fillStyle = '#ccddee';
        c.textAlign = 'left';
        const name = this._slotNames[i].length > 7
          ? this._slotNames[i].slice(0, 7) + '…'
          : this._slotNames[i];
        c.fillText(name, slotCX + slotR + 10, cy - 10);

        c.font = 'bold 24px system-ui';
        c.fillStyle = '#f0c040';
        c.fillText(`₩${this._slotPrices[i].toLocaleString()}`, slotCX + slotR + 10, cy + 18);
        c.textAlign = 'center';
      }

      // 연결선
      if (i < 2) {
        const y1 = cy + slotR + 8;
        const y2 = cy + slotGap - slotR - 8;
        c.strokeStyle = 'rgba(60, 80, 110, 0.25)';
        c.lineWidth = 2;
        c.setLineDash([5, 5]);
        c.beginPath();
        c.moveTo(slotCX, y1);
        c.lineTo(slotCX, y2);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // ── 하단: 합계 ──
    const botY = H - pad - 130;
    const botH = 120;
    c.fillStyle = 'rgba(18, 22, 38, 0.6)';
    this._rr(c, pad + 8, botY, W - pad * 2 - 16, botH, 12);
    c.fill();

    c.font = 'bold 28px system-ui';
    c.fillStyle = '#8899aa';
    c.textAlign = 'left';
    c.fillText('합계', pad + 28, botY + 30);

    c.font = 'bold 32px system-ui';
    c.fillStyle = this._total >= this._target && this._target > 0 ? '#66ff88' : '#f0c040';
    c.fillText(`₩${this._total.toLocaleString()}`, pad + 100, botY + 30);

    if (this._target > 0) {
      c.font = '20px system-ui';
      c.fillStyle = '#667788';
      c.textAlign = 'right';
      c.fillText(`/ ₩${this._target.toLocaleString()}`, W - pad - 22, botY + 30);
    }

    // 달성률 바
    const barX = pad + 24, barY = botY + 55;
    const barW = W - pad * 2 - 48, barH = 18;
    const ratio = this._target > 0 ? Math.min(this._total / this._target, 3) : 0;

    c.fillStyle = 'rgba(25, 35, 55, 0.8)';
    this._rr(c, barX, barY, barW, barH, 5);
    c.fill();

    const fillW = Math.max(0, barW * Math.min(ratio, 1));
    if (fillW > 0) {
      const grad = c.createLinearGradient(barX, 0, barX + fillW, 0);
      if (ratio >= 1) { grad.addColorStop(0, '#22cc66'); grad.addColorStop(1, '#66ff88'); }
      else { grad.addColorStop(0, '#cc8822'); grad.addColorStop(1, '#f0c040'); }
      c.fillStyle = grad;
      this._rr(c, barX, barY, fillW, barH, 5);
      c.fill();
    }

    const pct = Math.round(ratio * 100);
    c.font = 'bold 22px system-ui';
    c.fillStyle = ratio >= 1 ? '#66ff88' : '#f0c040';
    c.textAlign = 'center';
    c.fillText(`${pct}%`, W / 2, barY + barH + 24);

    this._boardTex.needsUpdate = true;
  }

  _gradeColor(grade) {
    return { SSSSS:'#ff00ff', SSSS:'#88ff44', SSS:'#44ffff', SS:'#ff44aa', S:'#ff8800', A:'#ffdd00' }[grade] || '#f0c040';
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  // ═══════════════ 3D 슬롯 ═══════════════

  _buildSlots3D() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const pos = SLOT_POSITIONS[i];

      const productPivot = new THREE.Group();
      productPivot.position.set(pos.x, PRODUCT_Y, pos.z);
      productPivot.scale.setScalar(0);
      this._root.add(productPivot);

      const glowLight = new THREE.PointLight(0xffdd00, 0, 4);
      glowLight.position.set(pos.x, PRODUCT_Y + 0.3, pos.z);
      this._root.add(glowLight);

      // 슬롯 히트 (상품 클릭)
      const hitGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 16);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set(pos.x, FLOOR_Y + 0.75, pos.z);
      hitMesh.userData.slotIndex = i;
      this._root.add(hitMesh);

      this._slots.push({ productPivot, productModel: null, glowLight, hitMesh, product: null });
    }
  }

  // ═══════════════ 판매 버튼 (3D 히트) ═══════════════

  _buildSellButtons() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const pos = SELL_BTN_POSITIONS[i];
      const geo = new THREE.BoxGeometry(0.5, 0.3, 0.35);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, FLOOR_Y + 0.15, pos.z);
      mesh.userData.sellSlotIndex = i;
      this._root.add(mesh);
      this._sellBtns.push(mesh);
    }
  }

  /** 판매 버튼 히트 타겟 (채워진 슬롯만) */
  getSellButtonTargets() {
    return this._sellBtns.filter((_, i) => this._slotFilled[i]);
  }

  // ═══════════════ 공개 API ═══════════════

  getFirstEmptySlot() { return this._slots.findIndex(s => s.product === null); }
  isSlotEmpty(index) { return this._slots[index]?.product === null; }

  getSlotPosition(index) {
    const pos = SLOT_POSITIONS[index];
    return new THREE.Vector3(pos.x, FLOOR_Y, pos.z);
  }

  async setSlotProduct(slotIndex, productInstance) {
    const slot = this._slots[slotIndex];
    if (!slot) return;
    this._clearSlotModel(slotIndex);
    slot.product = productInstance;

    let model;
    try {
      const def = productInstance.def;
      if (def.type === 'card' && def.imagePath) {
        model = await this.assetLoader.createCardMesh(def.imagePath);
      } else if (def.modelPath) {
        model = await this.assetLoader.loadGLB(def.modelPath);
        this.assetLoader.fitToBox(model);
      } else { throw 0; }
    } catch { model = this.assetLoader.createFallbackMesh(productInstance.gradeColor); }

    model.scale.multiplyScalar(0.55);
    slot.productPivot.add(model);
    slot.productPivot.scale.setScalar(1);
    slot.productModel = model;
    slot.glowLight.color.setHex(productInstance.gradeColor);
    slot.glowLight.intensity = 2.5;

    this._slotFilled[slotIndex] = true;
    this._slotPrices[slotIndex] = productInstance.salePrice;
    this._slotNames[slotIndex] = productInstance.def.name;
    this._slotGrades[slotIndex] = productInstance.grade;
    this._drawBoard();
  }

  clearSlot(slotIndex) {
    this._clearSlotModel(slotIndex);
    const slot = this._slots[slotIndex];
    if (!slot) return;
    slot.product = null;
    slot.glowLight.intensity = 0;
    this._slotFilled[slotIndex] = false;
    this._slotPrices[slotIndex] = 0;
    this._slotNames[slotIndex] = '';
    this._slotGrades[slotIndex] = '';
    this._drawBoard();
  }

  _clearSlotModel(slotIndex) {
    const slot = this._slots[slotIndex];
    if (slot.productModel) {
      slot.productPivot.remove(slot.productModel);
      slot.productModel = null;
      slot.productPivot.scale.setScalar(0);
    }
  }

  clearAll() { for (let i = 0; i < SLOT_COUNT; i++) this.clearSlot(i); this.updateTotal(0, 0); }

  updateTotal(total, target) {
    this._total = total; this._target = target;
    this._drawBoard();
  }

  updateRound(round) { this._round = round; this._drawBoard(); }

  setSellHighlight(enabled) { this._sellHighlight = enabled; }

  getFilledHitTargets() { return this._slots.filter(s => s.product !== null).map(s => s.hitMesh); }
  getAllHitTargets() { return this._slots.map(s => s.hitMesh); }

  update(dt, elapsed) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = this._slots[i];
      if (!slot.productModel) continue;
      slot.productModel.rotation.y += dt * 0.8;
      const floatY = PRODUCT_Y + Math.sin(elapsed * 1.8 + i * 2.1) * 0.06;
      slot.productPivot.position.y = floatY;
      slot.glowLight.position.y = floatY + 0.3;
      slot.glowLight.color.setHex(slot.product.gradeColor);
      slot.glowLight.intensity = 2 + Math.sin(elapsed * 2.5 + i) * 0.5;
    }
  }
}
