/**
 * 셰이더 프리셋 시스템 — PBR 10종 + Matcap 10종 = 20종.
 *
 * 같은 GLB 모델에 20가지 재질 변형을 적용하여
 * 총 상품 수 = 원본 모델 수 × 20.
 *
 * - PBR: 원본 텍스처 유지 + MeshPhysicalMaterial 파라미터 override
 * - Matcap: MeshMatcapMaterial로 교체, 조명 불필요
 *
 * valueMod: 원본 baseValue에 대한 퍼센트 보정 (0 = 동일, +50 = 1.5배, -20 = 0.8배)
 * rarityMod: rarity 보정 (음수 = 더 희귀)
 */

// ─── PBR 프리셋 (MeshPhysicalMaterial) ──────────────────────
export const PBR_PRESETS = [
  {
    key: 'plastic_matte',
    label: '매트 플라스틱',
    valueMod: 0,
    rarityMod: 0,
    params: {
      metalness: 0.0,
      roughness: 0.85,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'plastic_gloss',
    label: '글로시 플라스틱',
    valueMod: 10,
    rarityMod: -0.05,
    params: {
      metalness: 0.0,
      roughness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'rubber_soft',
    label: '소프트 러버',
    valueMod: 5,
    rarityMod: 0,
    params: {
      metalness: 0.0,
      roughness: 0.95,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 0.3,
      sheenRoughness: 0.8,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'ceramic_clean',
    label: '클린 세라믹',
    valueMod: 20,
    rarityMod: -0.1,
    params: {
      metalness: 0.05,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'metal_brushed',
    label: '브러시드 메탈',
    valueMod: 35,
    rarityMod: -0.2,
    params: {
      metalness: 0.9,
      roughness: 0.45,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'metal_polished',
    label: '폴리시드 메탈',
    valueMod: 50,
    rarityMod: -0.3,
    params: {
      metalness: 0.95,
      roughness: 0.05,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'paint_clearcoat',
    label: '클리어코트 페인트',
    valueMod: 30,
    rarityMod: -0.15,
    params: {
      metalness: 0.1,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'fabric_sheen',
    label: '패브릭 쉰',
    valueMod: 15,
    rarityMod: -0.05,
    params: {
      metalness: 0.0,
      roughness: 0.7,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 1.0,
      sheenRoughness: 0.4,
      transmission: 0,
      opacity: 1.0,
      ior: 1.5,
    },
  },
  {
    key: 'glass_clear',
    label: '클리어 글래스',
    valueMod: 60,
    rarityMod: -0.4,
    params: {
      metalness: 0.0,
      roughness: 0.0,
      clearcoat: 0,
      clearcoatRoughness: 0,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0.9,
      opacity: 0.3,
      ior: 1.52,
    },
  },
  {
    key: 'resin_tinted',
    label: '틴티드 레진',
    valueMod: 45,
    rarityMod: -0.25,
    params: {
      metalness: 0.05,
      roughness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.02,
      sheen: 0,
      sheenRoughness: 0,
      transmission: 0.5,
      opacity: 0.6,
      ior: 1.6,
    },
  },
];

// ─── Matcap 프리셋 (MeshMatcapMaterial) ─────────────────────
export const MATCAP_PRESETS = [
  {
    key: 'matcap_clay',
    label: '클레이',
    valueMod: 5,
    rarityMod: 0,
    texture: 'assets/matcaps/clay.png',
  },
  {
    key: 'matcap_wax',
    label: '왁스',
    valueMod: 10,
    rarityMod: -0.05,
    texture: 'assets/matcaps/wax.png',
  },
  {
    key: 'matcap_chrome',
    label: '크롬',
    valueMod: 55,
    rarityMod: -0.35,
    texture: 'assets/matcaps/chrome.png',
  },
  {
    key: 'matcap_bronze',
    label: '브론즈',
    valueMod: 40,
    rarityMod: -0.2,
    texture: 'assets/matcaps/bronze.png',
  },
  {
    key: 'matcap_black_rubber',
    label: '블랙 러버',
    valueMod: 8,
    rarityMod: 0,
    texture: 'assets/matcaps/black_rubber.png',
  },
  {
    key: 'matcap_red_wax',
    label: '레드 왁스',
    valueMod: 15,
    rarityMod: -0.1,
    texture: 'assets/matcaps/red_wax.png',
  },
  {
    key: 'matcap_white_ceramic',
    label: '화이트 세라믹',
    valueMod: 25,
    rarityMod: -0.15,
    texture: 'assets/matcaps/white_ceramic.png',
  },
  {
    key: 'matcap_blue_gloss',
    label: '블루 글로시',
    valueMod: 20,
    rarityMod: -0.1,
    texture: 'assets/matcaps/blue_gloss.png',
  },
  {
    key: 'matcap_gold',
    label: '골드',
    valueMod: 70,
    rarityMod: -0.5,
    texture: 'assets/matcaps/gold.png',
  },
  {
    key: 'matcap_silver_soft',
    label: '소프트 실버',
    valueMod: 35,
    rarityMod: -0.2,
    texture: 'assets/matcaps/silver_soft.png',
  },
];

// ─── 통합 ───────────────────────────────────────────────────
export const ALL_PRESETS = [
  ...PBR_PRESETS.map(p => ({ ...p, type: 'pbr' })),
  ...MATCAP_PRESETS.map(p => ({ ...p, type: 'matcap' })),
];

/** key로 프리셋 조회 */
const _map = new Map(ALL_PRESETS.map(p => [p.key, p]));
export function getPreset(key) { return _map.get(key) ?? ALL_PRESETS[0]; }
