/**
 * 상품 데이터 로더.
 * products-manifest.json → CSV 파일 목록 → 로드 + 병합.
 *
 * CSV 컬럼: id,name,style,type,grade,price,description,modelPath,imagePath
 * CSV는 tools/grade-products.mjs가 생성.
 */

/** @type {Array<Product>} */
export let PRODUCTS = [];

/**
 * @typedef {{
 *   id: string, name: string, style: string, type: string,
 *   grade: string, price: number, description: string,
 *   modelPath: string, imagePath: string
 * }} Product
 */

const MANIFEST_PATH = 'data/products-manifest.json';

/** 따옴표 이스케이프를 지원하는 CSV 행 파싱 */
function splitCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** CSV 한 줄 → Product 객체 */
function rowToProduct(headers, values) {
  const raw = {};
  headers.forEach((h, i) => raw[h] = (values[i] ?? '').trim());

  return {
    id:          raw.id,
    name:        raw.name,
    style:       raw.style || '',
    type:        raw.type || 'model',
    grade:       raw.grade || 'C',
    price:       Number(raw.price) || 10000,
    description: raw.description || '',
    modelPath:   raw.modelPath || '',
    imagePath:   raw.imagePath || '',
  };
}

/** CSV 텍스트 → Product[] */
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVRow(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = splitCSVRow(line);
    return rowToProduct(headers, values);
  });
}

/** 초기화 — main.js에서 호출 */
export async function loadProducts() {
  try {
    const mRes = await fetch(MANIFEST_PATH, { cache: 'no-cache' });
    if (!mRes.ok) throw new Error(`manifest ${mRes.status}`);
    const manifest = await mRes.json();
    const csvFiles = manifest.files || [];

    const allProducts = [];
    for (const csvPath of csvFiles) {
      const res = await fetch(csvPath, { cache: 'no-cache' });
      if (!res.ok) continue;
      const text = await res.text();
      allProducts.push(...parseCSV(text));
    }

    const seen = new Set();
    PRODUCTS = allProducts.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    console.log(`[products] ${PRODUCTS.length} loaded from ${csvFiles.length} CSV`);
  } catch (e) {
    console.warn(`[products] load failed (${e.message})`);
    PRODUCTS = [];
  }
  return PRODUCTS;
}
