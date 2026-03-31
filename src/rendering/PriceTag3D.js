import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

/**
 * 3D 두께 있는 메시 텍스트 가격표.
 * 상자 위에 떠서 천천히 회전. 상태에 따라 색상 변경.
 */

// 색상: 메인 + 측면(어두운 톤)
const PALETTE = {
  affordable: { main: 0x00e676, side: 0x00a152, emissive: 0x00e676 },
  expensive:  { main: 0xff1744, side: 0xb2102f, emissive: 0xff1744 },
  sale:       { main: 0xffd600, side: 0xc7a500, emissive: 0xffd600 },
};

let _fontPromise = null;
let _loadedFont = null;

/** 폰트 1회 로드 (CDN helvetiker bold) */
function loadFont() {
  if (_loadedFont) return Promise.resolve(_loadedFont);
  if (_fontPromise) return _fontPromise;
  _fontPromise = new Promise((resolve, reject) => {
    new FontLoader().load(
      'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json',
      (font) => { _loadedFont = font; resolve(font); },
      undefined,
      reject,
    );
  });
  return _fontPromise;
}

function formatPrice(price) {
  const man = price / 10000;
  if (price < 10000) return `${(price / 1000).toFixed(0)}K`;
  if (man === Math.floor(man)) return `${Math.floor(man)}M`;
  return `${man.toFixed(1)}M`;
}

function formatDiscount(discount) {
  return `-${Math.round(discount * 100)}%`;
}

/**
 * 3D 텍스트 메시 생성.
 */
const _isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

function createTextMesh(text, font, size, depth, color, emissive) {
  const geo = new TextGeometry(text, {
    font,
    size,
    depth,
    curveSegments: _isMobile ? 3 : 6,
    bevelEnabled: true,
    bevelThickness: depth * 0.15,
    bevelSize: size * 0.04,
    bevelSegments: _isMobile ? 1 : 3,
  });
  geo.computeBoundingBox();
  // 중앙 정렬
  const bb = geo.boundingBox;
  geo.translate(
    -(bb.max.x + bb.min.x) / 2,
    -(bb.max.y + bb.min.y) / 2,
    -(bb.max.z + bb.min.z) / 2,
  );

  const mat = new THREE.MeshPhongMaterial({
    color,
    emissive,
    emissiveIntensity: 0.4,
    shininess: 80,
    specular: 0xffffff,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * 3D 가격표 1개 생성.
 */
export function createPriceTag3D() {
  const group = new THREE.Group();

  // 아래쪽 연결 막대
  const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.45, 6);
  const poleMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 60 });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = -0.35;
  group.add(pole);

  let _boxDef = null;
  let _effectivePrice = 0;   // 보너스 할인 적용된 실제 가격
  let _totalDiscount = 0;    // 표시할 총 할인율
  let _priceMesh = null;
  let _discountMesh = null;
  let _status = '';
  const _hitMeshes = [];

  async function rebuild(status) {
    const font = await loadFont();
    if (!font || !_boxDef) return;

    // 기존 메시 제거
    if (_priceMesh) { group.remove(_priceMesh); _priceMesh.geometry.dispose(); _priceMesh.material.dispose(); }
    if (_discountMesh) { group.remove(_discountMesh); _discountMesh.geometry.dispose(); _discountMesh.material.dispose(); }
    _priceMesh = null; _discountMesh = null;
    _hitMeshes.length = 0;

    const pal = PALETTE[status];
    const priceText = formatPrice(_effectivePrice);

    if (_totalDiscount > 0) {
      // 할인율 위, 가격 아래
      _discountMesh = createTextMesh(
        formatDiscount(_totalDiscount), font, 0.18, 0.06,
        PALETTE.sale.main, PALETTE.sale.emissive
      );
      _discountMesh.position.y = 0.15;
      group.add(_discountMesh);
      _hitMeshes.push(_discountMesh);

      _priceMesh = createTextMesh(priceText, font, 0.25, 0.08, pal.main, pal.emissive);
      _priceMesh.position.y = -0.1;
      group.add(_priceMesh);
      _hitMeshes.push(_priceMesh);
    } else {
      _priceMesh = createTextMesh(priceText, font, 0.3, 0.1, pal.main, pal.emissive);
      group.add(_priceMesh);
      _hitMeshes.push(_priceMesh);
    }

    // userData 전파
    _hitMeshes.forEach(m => {
      if (group.userData.boxIdx !== undefined) {
        m.userData.boxIdx = group.userData.boxIdx;
      }
    });
  }

  return {
    group,

    /**
     * @param {object} boxDef           상자 정의
     * @param {number} [effectivePrice] 보너스 할인 적용 가격 (없으면 boxDef.price)
     * @param {number} [bonusDiscount]  열 클리어 보너스 할인율
     */
    setBox(boxDef, effectivePrice, bonusDiscount = 0) {
      _boxDef = boxDef;
      _effectivePrice = effectivePrice ?? boxDef.price;
      _totalDiscount = bonusDiscount;
    },

    updateState(money) {
      if (!_boxDef) return;

      let status;
      if (_totalDiscount > 0 && money >= _effectivePrice) {
        status = 'sale';        // 할인 + 구매 가능 → 노란색
      } else if (money >= _effectivePrice) {
        status = 'affordable';  // 정가 + 구매 가능 → 초록색
      } else {
        status = 'expensive';   // 구매 불가 (할인 여부 무관) → 빨간색
      }

      if (status === _status) return;
      _status = status;
      rebuild(status);
    },

    get hitMeshes() { return _hitMeshes; },

    dispose() {
      if (_priceMesh) { _priceMesh.geometry.dispose(); _priceMesh.material.dispose(); }
      if (_discountMesh) { _discountMesh.geometry.dispose(); _discountMesh.material.dispose(); }
      poleMat.dispose();
      poleGeo.dispose();
    },
  };
}
