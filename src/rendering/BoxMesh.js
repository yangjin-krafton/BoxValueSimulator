import * as THREE from 'three';

const PI = Math.PI;
export const BOX_W = 1.4, BOX_H = 1.0, BOX_D = 1.0;
const HW = BOX_W / 2, HD = BOX_D / 2, FW = HD, FL = HW;

// ── 공유 geometry (한 번만 생성) ──
const GEO = {
  bot:    new THREE.PlaneGeometry(BOX_W, BOX_D),
  fb:     new THREE.PlaneGeometry(BOX_W, BOX_H),
  lr:     new THREE.PlaneGeometry(BOX_D, BOX_H),
  flapFB: new THREE.PlaneGeometry(BOX_W, FW),
  flapLR: new THREE.PlaneGeometry(FL, BOX_D),
  shadow: new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
  glow:   new THREE.BoxGeometry(BOX_W * 1.08, BOX_H * 1.08, BOX_D * 1.08),
};

// ── 골판지 텍스처 ──
function makeCardTex(base, tapeY = null) {
  const s = 512, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const cx = cv.getContext('2d');
  cx.fillStyle = base; cx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 4) {
    cx.fillStyle = `rgba(0,0,0,${0.01 + Math.random() * 0.03})`;
    cx.fillRect(0, y, s, 1.5);
  }
  for (let i = 0; i < 6000; i++) {
    const l = Math.random() > .5;
    cx.fillStyle = `rgba(${l ? '255,210,120' : '0,0,0'},${Math.random() * 0.05})`;
    cx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1);
  }
  if (tapeY !== null) {
    const th = s * 0.13, ty = Math.max(0, tapeY * s - th / 2);
    cx.fillStyle = 'rgba(215,195,95,.75)'; cx.fillRect(0, ty, s, th);
    cx.fillStyle = 'rgba(0,0,0,.13)';
    cx.fillRect(0, ty - 3, s, 5); cx.fillRect(0, ty + th - 2, s, 5);
  }
  return new THREE.CanvasTexture(cv);
}

const matBase = { roughness: 0.87, metalness: 0.0, side: THREE.DoubleSide };
const cardMat     = new THREE.MeshStandardMaterial({ map: makeCardTex('#b07030'), ...matBase });
const flapFrontMat = new THREE.MeshStandardMaterial({ map: makeCardTex('#b07030', 0.04), ...matBase });
const shadowMat   = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/**
 * 상자 메시 1개 생성.
 * @returns {{ group, flaps, hitTargets, scale, originPos, originRotY }}
 */
export function createBoxMesh() {
  const group = new THREE.Group();
  const hitTargets = [];

  function face(geo, mat, x, y, z, rx = 0, ry = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
    m.receiveShadow = true;
    group.add(m); hitTargets.push(m);
  }
  face(GEO.bot, cardMat,  0, 0, 0, -PI / 2);
  face(GEO.fb,  cardMat,  0, BOX_H / 2,  HD);
  face(GEO.fb,  cardMat,  0, BOX_H / 2, -HD, 0, PI);
  face(GEO.lr,  cardMat, -HW, BOX_H / 2, 0, 0,  PI / 2);
  face(GEO.lr,  cardMat,  HW, BOX_H / 2, 0, 0, -PI / 2);

  function flap(geo, mat, px, pz, ox, oz, yOff = 0) {
    const pivot = new THREE.Group();
    pivot.position.set(px, BOX_H + yOff, pz);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -PI / 2; m.position.set(ox, 0, oz);
    m.receiveShadow = true;
    pivot.add(m); group.add(pivot); hitTargets.push(m);
    return pivot;
  }
  const flaps = {
    front: flap(GEO.flapFB, flapFrontMat,  0,  HD, 0, -FW / 2, 0.002),
    back:  flap(GEO.flapFB, cardMat,        0, -HD, 0, +FW / 2, 0.002),
    left:  flap(GEO.flapLR, cardMat,      -HW,   0, +FL / 2, 0),
    right: flap(GEO.flapLR, cardMat,       HW,   0, -FL / 2, 0),
  };

  const sc = new THREE.Mesh(GEO.shadow, shadowMat);
  sc.position.set(0, BOX_H / 2, 0); sc.castShadow = true;
  group.add(sc);

  return {
    group, flaps, hitTargets,
    scale: 1,
    originPos: new THREE.Vector3(),
    originRotY: 0,
  };
}

/** 호버 글로우 (씬에 1개) */
export function createHoverGlow() {
  const g = new THREE.LineSegments(
    new THREE.EdgesGeometry(GEO.glow),
    new THREE.LineBasicMaterial({ color: 0xffee55 })
  );
  g.visible = false;
  return g;
}
