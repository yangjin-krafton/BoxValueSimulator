import * as THREE from 'three';

/**
 * 쿠폰 카드 영역 가로 바닥판 — 화면 하단 배치.
 * DisplayShelf3D와 동일한 시각 스타일.
 *
 * 레이아웃 (가로):
 *  ┌──────────┬─────────────────────────────────────────┐
 *  │          │  PASSIVE CARDS            N장            │
 *  │  ○  덱  ├─────────────────────────────────────────┤
 *  │          │ [💰단골할인] [⭐행운] [📦확장] ...      │
 *  └──────────┴─────────────────────────────────────────┘
 */

export const FLOOR_Y = 0.06;

// 보드 월드 크기 — 화면 하단 가로 배치
export const CZ_X = 0;      // 중심 X (화면 중앙)
export const CZ_Z = 3.3;    // 중심 Z (카메라 가까운 쪽 = 화면 하단)
export const CZ_W = 5.4;    // 가로 (X 방향, 넓게)
export const CZ_D = 1.6;    // 세로 (Z 방향, 얕게)

const TEX_W = 1080;
const TEX_H = 320;

// 덱 원 캔버스 위치 (왼쪽 섹션 중심)
const DECK_CX = 142;
const DECK_CY = TEX_H / 2;   // 160

// 캔버스 → 월드 좌표
function c2w(cx, cy) {
  return {
    x: CZ_X + (cx / TEX_W - 0.5) * CZ_W,
    z: CZ_Z + (cy / TEX_H - 0.5) * CZ_D,
  };
}

/** CardDeck3D가 올라갈 월드 좌표 */
export const DECK_WORLD = c2w(DECK_CX, DECK_CY);

const CAT_ICONS = { '경제':'💰','등급':'⭐','진열':'📦','탐색':'🔍','안전':'🛡' };

// 카드 칸 하나의 캔버스 너비
const CARD_COL_W = 155;
// 카드 목록 시작 X
const LIST_START_X = 295;

export class CardZoneBoard {
  /** @param {import('../rendering/SceneManager.js').SceneManager} sceneMgr */
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this._owned   = [];

    this._canvas = document.createElement('canvas');
    this._canvas.width  = TEX_W;
    this._canvas.height = TEX_H;
    this._ctx = this._canvas.getContext('2d');

    this._tex = new THREE.CanvasTexture(this._canvas);
    this._tex.anisotropy = sceneMgr.renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshBasicMaterial({
      map: this._tex, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this._mesh = new THREE.Mesh(new THREE.PlaneGeometry(CZ_W, CZ_D), mat);
    this._mesh.rotation.x = -Math.PI / 2;
    this._mesh.position.set(CZ_X, FLOOR_Y + 0.007, CZ_Z);
    sceneMgr.scene.add(this._mesh);

    this._draw();
  }

  updateOwnedCards(cards) {
    this._owned = cards ?? [];
    this._draw();
  }

  // ══════════════════════════════════════════════════════
  // 캔버스 그리기 — DisplayShelf3D 동일 스타일
  // ══════════════════════════════════════════════════════

  _draw() {
    const c   = this._ctx;
    const W   = TEX_W, H = TEX_H;
    const pad = 12;

    c.clearRect(0, 0, W, H);

    // ── 전체 배경 ──
    c.fillStyle = 'rgba(10, 14, 22, 0.78)';
    this._rr(c, pad, pad, W - pad * 2, H - pad * 2, 18);
    c.fill();
    c.strokeStyle = 'rgba(90, 110, 150, 0.45)';
    c.lineWidth = 2.5;
    this._rr(c, pad, pad, W - pad * 2, H - pad * 2, 18);
    c.stroke();

    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // ── 왼쪽 덱 섹션 ──
    const deckSecW = 272;
    c.fillStyle = 'rgba(18, 22, 38, 0.6)';
    this._rr(c, pad + 6, pad + 6, deckSecW - 6, H - pad * 2 - 12, 12);
    c.fill();

    // 덱 원 (DisplayShelf3D 슬롯 원 스타일)
    const deckR = 70;
    const filled = this._owned.length > 0;

    c.beginPath();
    c.arc(DECK_CX, DECK_CY, deckR, 0, Math.PI * 2);
    c.fillStyle = filled ? 'rgba(70, 100, 200, 0.12)' : 'rgba(35, 45, 65, 0.5)';
    c.fill();

    c.beginPath();
    c.arc(DECK_CX, DECK_CY, deckR, 0, Math.PI * 2);
    if (filled) {
      c.strokeStyle = 'rgba(80, 110, 220, 0.65)';
      c.lineWidth = 3; c.setLineDash([]);
    } else {
      c.strokeStyle = 'rgba(60, 80, 110, 0.55)';
      c.lineWidth = 2; c.setLineDash([8, 6]);
    }
    c.stroke();
    c.setLineDash([]);

    // 원 안 아이콘 + 라벨
    c.font = '34px system-ui';
    c.fillStyle = filled ? '#aabbdd' : 'rgba(60, 80, 110, 0.5)';
    c.fillText('🃏', DECK_CX, DECK_CY - 16);
    c.font = 'bold 17px system-ui';
    c.fillStyle = filled ? '#7788bb' : 'rgba(60, 80, 110, 0.45)';
    c.fillText('카드 덱', DECK_CX, DECK_CY + 22);

    // ── 세로 구분선 ──
    const divX = deckSecW + pad + 4;
    const lineGrad = c.createLinearGradient(0, pad + 16, 0, H - pad - 16);
    lineGrad.addColorStop(0,   'transparent');
    lineGrad.addColorStop(0.2, 'rgba(60, 80, 110, 0.45)');
    lineGrad.addColorStop(0.8, 'rgba(60, 80, 110, 0.45)');
    lineGrad.addColorStop(1,   'transparent');
    c.strokeStyle = lineGrad; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(divX, pad + 16); c.lineTo(divX, H - pad - 16); c.stroke();

    // ── 오른쪽: 헤더 행 ──
    const rightX  = divX + 10;
    const rightW  = W - rightX - pad - 8;
    const headerH = 46;

    c.fillStyle = 'rgba(18, 22, 38, 0.6)';
    this._rr(c, rightX, pad + 6, rightW, headerH, 10); c.fill();

    c.font = 'bold 22px system-ui';
    c.fillStyle = '#8899bb';
    c.textAlign = 'left';
    c.fillText('PASSIVE CARDS', rightX + 16, pad + 6 + headerH / 2);

    const cnt = this._owned.length;
    c.font = 'bold 22px system-ui';
    c.fillStyle = cnt > 0 ? '#f0c040' : '#667788';
    c.textAlign = 'right';
    c.fillText(`${cnt}장`, W - pad - 16, pad + 6 + headerH / 2);

    // ── 오른쪽: 카드 가로 목록 ──
    const listY  = pad + 6 + headerH + 8;
    const listH  = H - listY - pad - 6;

    if (cnt === 0) {
      c.font = 'bold 20px system-ui';
      c.fillStyle = 'rgba(60, 80, 110, 0.4)';
      c.textAlign = 'center';
      c.fillText('없음', rightX + rightW / 2, listY + listH / 2);
    } else {
      const maxCols = Math.floor(rightW / CARD_COL_W);
      const cards   = this._owned.slice(0, maxCols);

      cards.forEach((card, i) => {
        const cx  = rightX + i * CARD_COL_W + CARD_COL_W / 2;
        const cy  = listY + listH / 2;
        const bx  = rightX + i * CARD_COL_W + 4;
        const bw  = CARD_COL_W - 8;
        const bh  = listH;

        const colors = card.colors ?? ['#334466'];
        const bright = colors[colors.length - 1];
        const icon   = CAT_ICONS[card.category] || '🃏';

        // 카드 배경 (filled 슬롯 스타일)
        const grad = c.createLinearGradient(bx, listY, bx, listY + bh);
        grad.addColorStop(0, `${bright}28`);
        grad.addColorStop(1, `${bright}10`);
        c.fillStyle = grad;
        this._rr(c, bx, listY, bw, bh, 9); c.fill();
        c.strokeStyle = `${bright}55`; c.lineWidth = 1.5;
        this._rr(c, bx, listY, bw, bh, 9); c.stroke();

        // 아이콘
        c.font = '26px system-ui';
        c.fillStyle = bright;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 4;
        c.fillText(icon, cx, cy - 22);
        c.shadowBlur = 0;

        // 카드명
        c.font = 'bold 15px system-ui';
        c.fillStyle = '#ccddee';
        const name = card.name.length > 7 ? card.name.slice(0, 7) + '…' : card.name;
        c.fillText(name, cx, cy + 6);

        // 카테고리 (작은 텍스트)
        c.font = '12px system-ui';
        c.fillStyle = `${bright}99`;
        c.fillText(card.category, cx, cy + 26);

        // 연결 점선 (슬롯 사이 연결선 스타일)
        if (i < cards.length - 1) {
          const lx = bx + bw + 4;
          c.strokeStyle = 'rgba(60, 80, 110, 0.25)';
          c.lineWidth = 2; c.setLineDash([4, 4]);
          c.beginPath(); c.moveTo(lx, listY + 8); c.lineTo(lx, listY + bh - 8); c.stroke();
          c.setLineDash([]);
        }
      });

      // 초과 카드 표시
      if (this._owned.length > maxCols) {
        const extra = this._owned.length - maxCols;
        const ex = rightX + maxCols * CARD_COL_W + 4;
        if (ex < W - pad - 50) {
          c.font = 'bold 18px system-ui';
          c.fillStyle = 'rgba(100, 120, 180, 0.55)';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(`+${extra}`, ex + 26, listY + listH / 2);
        }
      }
    }

    this._tex.needsUpdate = true;
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
}
