/**
 * 상품 데이터 로더.
 *
 * 매니페스트(products-manifest.json)에서 CSV 파일 목록을 읽고,
 * 랜덤으로 1~2개 CSV를 선택하여 로드합니다.
 * CSV가 1개뿐이면 그것을 로드.
 *
 * CSV 컬럼: id,name,baseValue,rarity,category,modelPath,preset
 * CSV는 tools/scan-models.mjs 가 자동 생성합니다.
 */

import { getPreset } from './presets.js';

/** @type {Array<Product>} */
export let PRODUCTS = [];

/** 현재 상품 데이터 버전 (매니페스트에서 로드) */
export let DATA_VERSION = '';

/**
 * @typedef {{
 *   id: string, name: string, baseValue: number, rarity: number,
 *   category: string, modelPath: string, preset: object
 * }} Product
 */

const MANIFEST_PATH = 'data/products-manifest.json';
const FALLBACK_CSV  = 'data/products.csv';

/** CSV 한 줄 → Product 객체 */
function rowToProduct(headers, values) {
  const raw = {};
  headers.forEach((h, i) => raw[h] = values[i] ?? '');

  return {
    id:        raw.id,
    name:      raw.name,
    baseValue: Number(raw.baseValue) || 0,
    rarity:    Number(raw.rarity) || 1.0,
    category:  raw.category || '액세서리',
    modelPath: raw.modelPath || '',
    preset:    getPreset(raw.preset),
  };
}

/** CSV 텍스트 → Product[] */
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return rowToProduct(headers, values);
  });
}

/** 배열에서 랜덤으로 N개 선택 */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/** 초기화 — main.js에서 호출 */
export async function loadProducts() {
  try {
    // 1. 매니페스트에서 CSV 파일 목록
    let csvFiles = [FALLBACK_CSV];
    try {
      const mRes = await fetch(MANIFEST_PATH, { cache: 'no-cache' });
      if (mRes.ok) {
        const manifest = await mRes.json();
        if (manifest.files?.length > 0) csvFiles = manifest.files;
        if (manifest.dataVersion) DATA_VERSION = manifest.dataVersion;
      }
    } catch { /* 매니페스트 없으면 폴백 */ }

    // 2. 파일이 여러 개면 랜덤 1~2개 선택, 1개면 그대로
    const selected = csvFiles.length > 1
      ? pickRandom(csvFiles, Math.min(2, csvFiles.length))
      : csvFiles;

    // 3. 선택된 CSV 로드 + 파싱 + 병합
    const allProducts = [];
    for (const csvPath of selected) {
      const res = await fetch(csvPath, { cache: 'no-cache' });
      if (!res.ok) continue;
      const text = await res.text();
      allProducts.push(...parseCSV(text));
    }

    // 4. 중복 제거 (id 기준)
    const seen = new Set();
    PRODUCTS = allProducts.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    console.log(`[products] ${PRODUCTS.length}개 상품 로드됨 (${selected.length}개 CSV)`);
  } catch (e) {
    console.warn(`[products] 로드 실패 (${e.message}), 빈 상태로 시작`);
    PRODUCTS = [];
  }
  return PRODUCTS;
}
