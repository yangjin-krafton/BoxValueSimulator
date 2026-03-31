/**
 * 쿠폰 카드 뒷면 텍스처 생성.
 * 무채색 우주 그라데이션 + 중앙 '쿠폰' 레터링.
 *
 * @param {number} w  캔버스 픽셀 너비
 * @param {number} h  캔버스 픽셀 높이
 * @returns {HTMLCanvasElement}
 */
export function createCardBackTexture(w = 280, h = 192) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');

  // ── 우주 방사형 그라데이션 배경 ──
  const cx = w / 2, cy = h / 2;
  const rad = Math.hypot(w, h) * 0.58;
  const bg = c.createRadialGradient(cx, cy * 0.85, 0, cx, cy, rad);
  bg.addColorStop(0,    '#2e1260');
  bg.addColorStop(0.35, '#180a3a');
  bg.addColorStop(0.70, '#0c0520');
  bg.addColorStop(1,    '#040210');
  c.fillStyle = bg;
  _rr(c, 0, 0, w, h, 12); c.fill();

  // ── 성운 오버레이 (반투명 색채 구름) ──
  const nebula = c.createRadialGradient(cx * 0.6, cy * 0.5, 0, cx * 0.6, cy * 0.5, w * 0.45);
  nebula.addColorStop(0, 'rgba(100, 40, 200, 0.18)');
  nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = nebula; c.fillRect(0, 0, w, h);

  const nebula2 = c.createRadialGradient(cx * 1.4, cy * 1.3, 0, cx * 1.4, cy * 1.3, w * 0.4);
  nebula2.addColorStop(0, 'rgba(30, 80, 180, 0.15)');
  nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = nebula2; c.fillRect(0, 0, w, h);

  // ── 별 입자 (시드 고정) ──
  let seed = 77;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  for (let i = 0; i < 48; i++) {
    const sx = rng() * w, sy = rng() * h;
    const sr = rng() * 1.4 + 0.25;
    const sa = rng() * 0.55 + 0.2;
    c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2);
    c.fillStyle = `rgba(${200 + Math.floor(rng()*55)}, ${170 + Math.floor(rng()*60)}, 255, ${sa})`;
    c.fill();
  }

  // ── 외곽 테두리 ──
  c.strokeStyle = 'rgba(140, 90, 230, 0.55)';
  c.lineWidth = 2.5;
  _rr(c, 2, 2, w - 4, h - 4, 11); c.stroke();

  // 안쪽 글로우 라인
  c.strokeStyle = 'rgba(180, 130, 255, 0.18)';
  c.lineWidth = 1.2;
  _rr(c, 7, 7, w - 14, h - 14, 8); c.stroke();

  // ── 기하 패턴 — 마름모 장식 ──
  const dSize = Math.min(w, h) * 0.08;
  [[cx, cy - h * 0.3], [cx, cy + h * 0.3],
   [cx - w * 0.32, cy], [cx + w * 0.32, cy]].forEach(([dx, dy]) => {
    c.save();
    c.translate(dx, dy);
    c.rotate(Math.PI / 4);
    c.strokeStyle = 'rgba(160, 110, 255, 0.22)';
    c.lineWidth = 1;
    c.strokeRect(-dSize / 2, -dSize / 2, dSize, dSize);
    c.restore();
  });

  // ── 중앙 '쿠폰' 메인 텍스트 ──
  const fontSize = Math.round(Math.min(w, h) * 0.28);
  c.font = `bold ${fontSize}px system-ui`;
  c.textAlign = 'center'; c.textBaseline = 'middle';

  // 글로우 레이어
  c.shadowColor = 'rgba(170, 110, 255, 0.9)';
  c.shadowBlur = 18;

  // 그라데이션 텍스트 색상
  const tg = c.createLinearGradient(0, cy - fontSize * 0.55, 0, cy + fontSize * 0.55);
  tg.addColorStop(0,   '#f0e0ff');
  tg.addColorStop(0.4, '#cc99ff');
  tg.addColorStop(1,   '#8844cc');
  c.fillStyle = tg;
  c.fillText('쿠폰', cx, cy);
  c.shadowBlur = 0;

  // ── 하단 영문 서브 레터링 ──
  const subSize = Math.round(Math.min(w, h) * 0.075);
  c.font = `${subSize}px system-ui`;
  c.fillStyle = 'rgba(170, 130, 230, 0.42)';
  c.letterSpacing = '3px';
  c.fillText('COUPON  CARD', cx, cy + fontSize * 0.62);
  c.letterSpacing = '0px';

  // ── 상단 소형 장식 별 ──
  c.font = `${Math.round(subSize * 1.1)}px system-ui`;
  c.fillStyle = 'rgba(200, 160, 255, 0.35)';
  c.fillText('✦          ✦', cx, cy - fontSize * 0.62);

  return cv;
}

// 내부 유틸
function _rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
