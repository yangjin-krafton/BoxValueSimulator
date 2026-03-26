#!/usr/bin/env node
/**
 * GLB 모델 자동 스캔 → LM Studio Vision → products.js 생성
 *
 * 사용법:
 *   cd tools && npm install && npm run scan
 *
 * 옵션:
 *   --lm-url    LM Studio 서버 주소  (기본: http://localhost:1234)
 *   --model     Vision 모델 이름      (기본: 자동 감지)
 *   --out       출력 파일 경로        (기본: ../src/data/products.js)
 *   --dry-run   products.js를 쓰지 않고 JSON만 stdout 출력
 *   --concurrency  동시 처리 수       (기본: 3)
 */

import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns';
import puppeteer from 'puppeteer';

// ─── CLI 옵션 파싱 ──────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const LM_URL     = flag('lm-url', 'http://100.66.68.140:1234');
const LM_MODEL   = flag('model', '');
const OUT_PATH   = resolve(flag('out', '../src/data/products.js'));
const DRY_RUN    = args.includes('--dry-run');
const CONCURRENCY = Number(flag('concurrency', '3'));

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const MODELS_DIR  = resolve(__dirname, '../src/assets/models');
const VIEWER_HTML = resolve(__dirname, 'model-viewer.html');
const SHOTS_DIR   = resolve(__dirname, 'screenshots');

// ─── 유틸 ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function filenameToLabel(filename) {
  // AccessoryGlassBoston3 → Accessory Glass Boston 3
  return basename(filename, extname(filename))
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1')
    .trim();
}

// ─── LM Studio API ──────────────────────────────────────────
async function detectModel() {
  if (LM_MODEL) return LM_MODEL;
  try {
    const res = await fetch(`${LM_URL}/v1/models`);
    const data = await res.json();
    const models = data.data || [];
    // vision / multimodal 모델 우선
    const vision = models.find(m =>
      /vision|llava|pixtral|qwen.*vl|gemma.*it/i.test(m.id)
    );
    const picked = vision || models[0];
    if (!picked) throw new Error('LM Studio에 로드된 모델이 없습니다.');
    console.log(`🤖 모델 감지: ${picked.id}`);
    return picked.id;
  } catch (e) {
    console.error(`❌ LM Studio 연결 실패 (${LM_URL}): ${e.message}`);
    process.exit(1);
  }
}

// Structured output JSON schema — LM Studio response_format 지원
const PRODUCT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'product_metadata',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        name:      { type: 'string',  description: '한국어 상품명 (e.g. "보스턴 안경", "사이버 고글")' },
        baseValue: { type: 'integer', description: '추정 가격 KRW (5000~200000)' },
        rarity:    { type: 'number',  description: '희귀도 0.1~2.0 (낮을수록 희귀)' },
        category:  { type: 'string',  enum: ['안경', '선글라스', '고글', '마스크', '액세서리'] },
      },
      required: ['name', 'baseValue', 'rarity', 'category'],
      additionalProperties: false,
    },
  },
};

async function analyzeWithVision(modelId, imageDataUrl, filename) {
  const label = filenameToLabel(filename);

  const prompt = `You are analyzing a 3D model screenshot for a "box value simulator" game.
The model file name is: "${filename}"
Readable label: "${label}"

Based on the screenshot and name, fill in the product metadata.

Rules:
- name: 한국어 상품명 (e.g. "보스턴 안경", "나비 선글라스")
- baseValue: KRW 가격 5000~200000 — 독특한 디자인(cyber, flower, butterfly)일수록 비싸게
- rarity: 0.1~2.0 — 독특할수록 낮게(희귀), 흔할수록 높게
- category: 스크린샷 외형에 맞는 카테고리
- 번호 변형(0,1,2...)은 색상 차이 — 동일 희귀도, 약간의 가격 차이`;

  const body = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: PRODUCT_SCHEMA,
    temperature: 0.3,
    max_tokens: 300,
  };

  const res = await fetch(`${LM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio API 오류 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();

  try {
    // structured output이므로 바로 파싱 가능
    return JSON.parse(raw);
  } catch {
    // 펜스 감싸진 경우 대비 폴백
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(cleaned);
    } catch {
      console.warn(`⚠️  JSON 파싱 실패 [${filename}]: ${raw.slice(0, 120)}`);
      return null;
    }
  }
}

// ─── 로컬 HTTP 서버 (file:// CORS 우회) ─────────────────────
const SRC_DIR = resolve(__dirname, '../src');

const TOOLS_DIR = __dirname;

function startStaticServer() {
  return new Promise((res) => {
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript',
      '.glb': 'model/gltf-binary', '.json': 'application/json',
      '.png': 'image/png', '.css': 'text/css',
    };
    const server = createServer(async (req, reply) => {
      try {
        const urlPath = decodeURIComponent(req.url);
        // /tools/ 경로 → tools 디렉토리, 그 외 → src 디렉토리
        let filePath;
        if (urlPath.startsWith('/tools/')) {
          filePath = resolve(TOOLS_DIR, '.' + urlPath.replace('/tools/', '/'));
        } else {
          filePath = resolve(SRC_DIR, '.' + urlPath);
        }
        const data = await readFile(filePath);
        const ext = extname(filePath);
        reply.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        reply.end(data);
      } catch {
        reply.writeHead(404);
        reply.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`🌐 정적 서버 시작: http://127.0.0.1:${port}`);
      res({ server, port });
    });
  });
}

// ─── 스크린샷 캡처 ──────────────────────────────────────────
async function setupBrowser(serverPort) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512 });

  // HTTP 서버를 통해 뷰어 HTML 로드 (file:// → http:// CORS 문제 방지)
  await page.goto(`http://127.0.0.1:${serverPort}/tools/model-viewer.html`, {
    waitUntil: 'networkidle0',
  });

  // 뷰어 준비 대기
  await page.waitForFunction('window.__VIEWER_READY__ === true', { timeout: 15000 });
  console.log('🖼️  모델 뷰어 준비 완료');
  return { browser, page };
}

async function captureScreenshot(page, glbFilename, serverPort) {
  // HTTP 서버를 통해 GLB를 로드
  const modelUrl = `http://127.0.0.1:${serverPort}/assets/models/${encodeURIComponent(glbFilename)}`;
  try {
    const dataUrl = await page.evaluate(async (url) => {
      try {
        const result = await window.captureModel(url);
        return { ok: true, data: result };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }, modelUrl);
    if (!dataUrl.ok) throw new Error(dataUrl.error);
    return dataUrl.data;
  } catch (e) {
    throw new Error(`캡처 실패: ${e.message}`);
  }
}

// ─── 배치 처리 ──────────────────────────────────────────────
async function processInBatches(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── products.js 생성 ───────────────────────────────────────
function generateProductsJS(products) {
  const entries = products.map(p => {
    return `  {
    id: '${p.id}',
    name: '${p.name}',
    baseValue: ${p.baseValue},
    rarity: ${p.rarity},
    category: '${p.category}',
    modelPath: '${p.modelPath}',
  }`;
  });

  return `/**
 * 상품 정의 테이블 — 자동 생성됨
 * 생성 시각: ${new Date().toISOString()}
 * 생성 도구: tools/scan-models.mjs
 *
 * 수동 편집하지 마세요! 모델을 추가/제거한 뒤 다시 스캔하세요:
 *   cd tools && npm run scan
 *
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   baseValue: number,
 *   rarity: number,
 *   category: string,
 *   modelPath: string
 * }>}
 */
export const PRODUCTS = [
${entries.join(',\n')}
];
`;
}

// ─── 메인 ───────────────────────────────────────────────────
async function main() {
  console.log('📂 모델 폴더 스캔 중...');

  // 1. GLB 파일 목록
  const files = (await readdir(MODELS_DIR))
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .sort();

  if (files.length === 0) {
    console.log('모델 파일이 없습니다.');
    process.exit(0);
  }
  console.log(`   ${files.length}개 GLB 파일 발견\n`);

  // 2. LM Studio 모델 감지
  const modelId = await detectModel();

  // 3. 로컬 HTTP 서버 + Puppeteer 브라우저 시작
  const { server, port } = await startStaticServer();
  const { browser, page } = await setupBrowser(port);

  // 4. 스크린샷 디렉토리 생성
  await mkdir(SHOTS_DIR, { recursive: true });

  // 5. 각 모델 처리 (순차 — 한 페이지에서 모델을 교체하며 캡처)
  const products = [];
  let success = 0;
  let fail = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const glbPath = resolve(MODELS_DIR, file);
    const id = basename(file, '.glb').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const progress = `[${i + 1}/${files.length}]`;

    process.stdout.write(`${progress} ${file} ... `);

    try {
      // 스크린샷 캡처 (HTTP 서버 경유)
      const dataUrl = await captureScreenshot(page, file, port);

      // 스크린샷 저장 (디버깅용)
      const pngData = dataUrl.replace(/^data:image\/png;base64,/, '');
      await writeFile(resolve(SHOTS_DIR, `${id}.png`), pngData, 'base64');

      // LM Studio Vision 분석
      const meta = await analyzeWithVision(modelId, dataUrl, file);

      if (meta) {
        products.push({
          id,
          name: meta.name || filenameToLabel(file),
          baseValue: Math.round(Number(meta.baseValue) || 15000),
          rarity: Math.round((Number(meta.rarity) || 1.0) * 100) / 100,
          category: meta.category || '액세서리',
          modelPath: `assets/models/${file}`,
        });
        console.log(`✅ ${meta.name} (₩${meta.baseValue})`);
        success++;
      } else {
        // LLM 실패 → 파일명 기반 폴백
        products.push({
          id,
          name: filenameToLabel(file),
          baseValue: 15000,
          rarity: 1.0,
          category: '액세서리',
          modelPath: `assets/models/${file}`,
        });
        console.log(`⚠️  폴백 사용`);
        fail++;
      }
    } catch (e) {
      console.log(`❌ 오류: ${e.message}`);
      // 오류 시에도 폴백 등록
      products.push({
        id,
        name: filenameToLabel(file),
        baseValue: 15000,
        rarity: 1.0,
        category: '액세서리',
        modelPath: `assets/models/${file}`,
      });
      fail++;
    }

    // LM Studio 과부하 방지
    await sleep(300);
  }

  await browser.close();
  server.close();

  // 6. 결과 출력
  console.log(`\n📊 결과: ${success} 성공 / ${fail} 폴백 / 총 ${products.length}개`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN (JSON) ---');
    console.log(JSON.stringify(products, null, 2));
  } else {
    const js = generateProductsJS(products);
    await writeFile(OUT_PATH, js, 'utf-8');
    console.log(`✅ ${OUT_PATH} 생성 완료`);
  }

  console.log(`📸 스크린샷: ${SHOTS_DIR}`);
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
