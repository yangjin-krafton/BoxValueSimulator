/**
 * 쿠폰 카드 캔버스 드로잉 — 단일 정의.
 *
 * 모든 쿠폰 카드(덱·선택·도감)는 여기서 그린 텍스처를 사용한다.
 * 카드는 가로(landscape) 형태로 통일.
 *
 *  THUMB   280 × 192  (덱 / 선택 씬 일반 상태)
 *  DETAIL  560 × 384  (클릭 후 확대 보기)
 *  CATALOG 280 × 192  (도감 그리드, THUMB 재사용)
 */

export const CARD_TEX_W      = 280;
export const CARD_TEX_H      = 192;
export const CARD_DETAIL_W   = 560;
export const CARD_DETAIL_H   = 384;

export const CAT_ICONS = {
  '경제': '💰', '등급': '⭐', '진열': '📦', '탐색': '🔍', '안전': '🛡',
};
export const RARITY_LABEL = { 1: '희귀', 2: '고급', 3: '일반' };

// ──────────────────────────────────────────────
// 내부 드로잉 헬퍼
// ──────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function wrapText(ctx, text, maxW) {
  const lines = []; let line = '';
  for (const ch of [...text]) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function gradient(ctx, w, h, colors) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (colors.length === 2) {
    g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
  } else {
    g.addColorStop(0, colors[0]); g.addColorStop(0.5, colors[1]); g.addColorStop(1, colors[2]);
  }
  return g;
}

// ──────────────────────────────────────────────
// 공통 카드 페이스 드로잉
// ──────────────────────────────────────────────

/**
 * 카드 앞면을 ctx에 그린다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  캔버스 너비
 * @param {number} H  캔버스 높이
 * @param {object} cardDef  couponCards.js 카드 정의
 * @param {object} [opts]
 * @param {boolean} [opts.dim=false]     미획득 어둠 오버레이
 * @param {boolean} [opts.large=false]   상세보기 폰트 크기
 */
export function drawCardFace(ctx, W, H, cardDef, { dim = false, large = false } = {}) {
  const colors = cardDef.colors ?? ['#223355', '#445588'];
  const bright = colors[colors.length - 1];
  const icon   = CAT_ICONS[cardDef.category] || '🃏';
  const scale  = large ? 2 : 1;   // DETAIL는 2× 해상도

  ctx.clearRect(0, 0, W, H);

  // 배경
  ctx.fillStyle = gradient(ctx, W, H, colors);
  rr(ctx, 0, 0, W, H, 12 * scale); ctx.fill();

  // 미획득 어둠
  if (dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    rr(ctx, 0, 0, W, H, 12 * scale); ctx.fill();
  }

  // 테두리
  ctx.strokeStyle = dim ? `${bright}66` : bright;
  ctx.lineWidth = (dim ? 2 : 3) * scale;
  rr(ctx, 2 * scale, 2 * scale, W - 4 * scale, H - 4 * scale, 11 * scale); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = scale;
  rr(ctx, 7 * scale, 7 * scale, W - 14 * scale, H - 14 * scale, 8 * scale); ctx.stroke();

  // 헤더 바
  const headerH = 42 * scale;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(4 * scale, 4 * scale, W - 8 * scale, headerH);

  // 아이콘 + 카드명
  ctx.font = `bold ${20 * scale}px system-ui`;
  ctx.fillStyle = dim ? `${bright}99` : bright;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * scale;
  ctx.fillText(`${icon} ${cardDef.name}`, 12 * scale, 4 * scale + headerH / 2);
  ctx.shadowBlur = 0;

  // 카테고리
  ctx.font = `${13 * scale}px system-ui`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText(cardDef.category, W - 12 * scale, 4 * scale + headerH / 2);

  // 구분선
  const lineY = (4 + headerH / scale + 4) * scale;
  const lg = ctx.createLinearGradient(12 * scale, 0, W - 12 * scale, 0);
  lg.addColorStop(0, 'transparent'); lg.addColorStop(0.2, bright);
  lg.addColorStop(0.8, bright);     lg.addColorStop(1, 'transparent');
  ctx.strokeStyle = lg; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5 * scale;
  ctx.beginPath(); ctx.moveTo(12 * scale, lineY); ctx.lineTo(W - 12 * scale, lineY); ctx.stroke();
  ctx.globalAlpha = 1;

  // 설명 텍스트
  ctx.font = `${15 * scale}px system-ui`;
  ctx.fillStyle = dim ? 'rgba(180,190,220,0.55)' : '#ddeeff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 3 * scale;
  const lines  = wrapText(ctx, cardDef.description, W - 28 * scale);
  const lineH  = 20 * scale;
  const bodyH  = H - lineY - (large ? 52 : 36) * scale;
  const startY = lineY + bodyH / 2 - (lines.length * lineH) / 2 + lineH / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH));
  ctx.shadowBlur = 0;

  // 희귀도 도트 (하단)
  if (cardDef.rarity != null) {
    const dotR = 5 * scale, dotGap = 16 * scale, dotY = H - 14 * scale;
    const startX = W / 2 - dotGap;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dotGap, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < cardDef.rarity
        ? (dim ? `${bright}88` : bright)
        : 'rgba(60,70,90,0.55)';
      ctx.fill();
    }
  }

  // DETAIL 전용 — 하단 라벨
  if (large) {
    ctx.font = `bold ${14 * scale}px system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PASSIVE EFFECT · 런 동안 지속', W / 2, H - 26 * scale);

    const barGrad = ctx.createLinearGradient(30 * scale, 0, W - 30 * scale, 0);
    barGrad.addColorStop(0, 'transparent'); barGrad.addColorStop(0.2, bright);
    barGrad.addColorStop(0.8, bright);      barGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = barGrad; ctx.globalAlpha = 0.25; ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(30 * scale, H - 12 * scale);
    ctx.lineTo(W - 30 * scale, H - 12 * scale);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// ──────────────────────────────────────────────
// 공개 팩토리 함수 (canvas 반환)
// ──────────────────────────────────────────────

/** 280×192 가로 카드 텍스처 */
export function createCardTexture(cardDef) {
  const cv = document.createElement('canvas');
  cv.width  = CARD_TEX_W;
  cv.height = CARD_TEX_H;
  drawCardFace(cv.getContext('2d'), CARD_TEX_W, CARD_TEX_H, cardDef);
  return cv;
}

/** 560×384 확대 상세 텍스처 */
export function createDetailTexture(cardDef) {
  const cv = document.createElement('canvas');
  cv.width  = CARD_DETAIL_W;
  cv.height = CARD_DETAIL_H;
  drawCardFace(cv.getContext('2d'), CARD_DETAIL_W, CARD_DETAIL_H, cardDef, { large: true });
  return cv;
}

/** 미획득 처리된 카드 텍스처 (도감용) */
export function createDimCardTexture(cardDef) {
  const cv = document.createElement('canvas');
  cv.width  = CARD_TEX_W;
  cv.height = CARD_TEX_H;
  drawCardFace(cv.getContext('2d'), CARD_TEX_W, CARD_TEX_H, cardDef, { dim: true });
  return cv;
}
