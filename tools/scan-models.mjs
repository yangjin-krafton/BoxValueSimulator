#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  GLB Model Scan Agent                                        ║
 * ║  Pipeline: Scan → Screenshot → Analyze → Shader Gen → Output ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * 사용법:  cd tools && npm install && npm run scan
 *
 * 옵션:
 *   --lm-url       LM Studio 서버 주소     (기본: http://100.66.10.225:1234)
 *   --model        LM Studio 모델 이름     (기본: qwen/qwen3.5-9b)
 *   --out          출력 파일 경로           (기본: ../src/data/products.js)
 *   --dry-run      파일 안 쓰고 JSON 출력
 *   --variations   모델당 shader 변형 수    (기본: 3)
 *   --batch        배치 크기 (N개씩 처리 후 CSV 저장) (기본: 5)
 *   --reset        기존 CSV 무시하고 처음부터 다시
 */

import { readdir, writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';

// ─── 설정 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}

const CONFIG = {
  lmUrl:       flag('lm-url', 'http://100.66.10.225:1234'),
  lmModel:     flag('model', 'qwen/qwen3.5-9b'),
  outPath:     resolve(flag('out', '../src/data/products.csv')),
  dryRun:      args.includes('--dry-run'),
  reset:       args.includes('--reset'),
  variations:  Number(flag('variations', '3')),
  batchSize:   Number(flag('batch', '5')),
};

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const MODELS_DIR  = resolve(__dirname, '../src/assets/models');
const SRC_DIR     = resolve(__dirname, '../src');
const TOOLS_DIR   = __dirname;
const SHOTS_DIR   = resolve(__dirname, 'screenshots');
const VIEWER_HTML = resolve(__dirname, 'model-viewer.html');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────
//  STAGE 1: Scanner — 폴더 스캔, GLB 목록 수집
// ─────────────────────────────────────────────────────────────
async function stageScanner() {
  console.log('\n━━ Stage 1: Scanner ━━');
  const files = (await readdir(MODELS_DIR))
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .sort();
  console.log(`   ${files.length}개 GLB 발견`);
  return files;
}

// ─────────────────────────────────────────────────────────────
//  STAGE 2: Renderer — Puppeteer로 각 모델 스크린샷
// ─────────────────────────────────────────────────────────────
function startStaticServer() {
  const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.glb': 'model/gltf-binary', '.json': 'application/json',
    '.png': 'image/png', '.css': 'text/css',
  };
  return new Promise(res => {
    const server = createServer(async (req, reply) => {
      try {
        const urlPath = decodeURIComponent(req.url);
        const filePath = urlPath.startsWith('/tools/')
          ? resolve(TOOLS_DIR, '.' + urlPath.replace('/tools/', '/'))
          : resolve(SRC_DIR, '.' + urlPath);
        const data = await readFile(filePath);
        reply.writeHead(200, {
          'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        reply.end(data);
      } catch {
        reply.writeHead(404);
        reply.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      res({ server, port: server.address().port });
    });
  });
}

async function stageRenderer(files) {
  console.log('\n━━ Stage 2: Renderer ━━');
  await mkdir(SHOTS_DIR, { recursive: true });

  const { server, port } = await startStaticServer();
  console.log(`   HTTP 서버: http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512 });
  await page.goto(`http://127.0.0.1:${port}/tools/model-viewer.html`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction('window.__VIEWER_READY__ === true', { timeout: 15000 });
  console.log('   뷰어 준비 완료');

  const screenshots = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = basename(file, '.glb').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    process.stdout.write(`   [${i + 1}/${files.length}] ${file} ... `);

    try {
      const modelUrl = `http://127.0.0.1:${port}/assets/models/${encodeURIComponent(file)}`;
      const result = await page.evaluate(async (url) => {
        try { return { ok: true, data: await window.captureModel(url) }; }
        catch (e) { return { ok: false, error: e?.message || String(e) }; }
      }, modelUrl);

      if (!result.ok) throw new Error(result.error);

      const pngData = result.data.replace(/^data:image\/png;base64,/, '');
      await writeFile(resolve(SHOTS_DIR, `${id}.png`), pngData, 'base64');
      screenshots.push({ file, id, dataUrl: result.data });
      console.log('✅');
    } catch (e) {
      console.log(`❌ ${e.message}`);
      screenshots.push({ file, id, dataUrl: null });
    }
  }

  await browser.close();
  server.close();

  const ok = screenshots.filter(s => s.dataUrl).length;
  console.log(`   ${ok}/${files.length} 스크린샷 성공`);
  return screenshots;
}

// ─────────────────────────────────────────────────────────────
//  STAGE 3: Analyzer — LM Studio Vision으로 메타데이터 추출
// ─────────────────────────────────────────────────────────────
function filenameToLabel(filename) {
  return basename(filename, extname(filename))
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1')
    .trim();
}

function stripThinking(raw) {
  const idx = raw.indexOf('</think>');
  if (idx !== -1) raw = raw.slice(idx + 8);
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim();
}

async function callLM(messages) {
  const res = await fetch(`${CONFIG.lmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.lmModel,
      messages,
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });
  if (!res.ok) throw new Error(`LM API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return stripThinking(data.choices?.[0]?.message?.content || '');
}

function parseJSON(raw, filename) {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  console.warn(`   ⚠️  JSON 파싱 실패 [${filename}]: ${raw.slice(0, 100)}`);
  return null;
}

/**
 * 배치 분석 — 여러 모델을 한 번의 LM 호출로 처리.
 * 이미지 N개 + 파일목록을 한 프롬프트에 보내고 JSON 배열로 응답받음.
 */
async function analyzeBatch(shots) {
  const validShots = shots.filter(s => s.dataUrl);
  if (validShots.length === 0) return shots.map(s => ({ ...s, meta: fallbackMeta(s.file) }));

  // 프롬프트: 파일 목록 + 이미지들
  const fileList = validShots.map((s, i) =>
    `${i + 1}. 파일: ${s.file} / 레이블: ${filenameToLabel(s.file)}`
  ).join('\n');

  const content = [
    {
      type: 'text',
      text: `아래 ${validShots.length}개 3D 모델 스크린샷을 분석해서 JSON 배열로 답해줘.
각 모델은 3D 모델 상점에서 판매하는 상품으로 가격을 매겨줘.

모델 목록:
${fileList}

응답 형식 (JSON 배열, 순서 유지):
[{"name":"한국어 상품명","baseValue":5000~200000,"rarity":0.1~2.0,"category":"안경|선글라스|고글|마스크|액세서리","dominantColors":["#hex1","#hex2"],"designKeywords":["키워드"]}]

규칙: 독특한 디자인→비싸고 희귀(rarity 낮음), 흔한 디자인→저렴(rarity 높음)
이미지 순서는 위 목록 순서와 동일.`
    },
    // 이미지들을 순서대로 추가
    ...validShots.map(s => ({
      type: 'image_url',
      image_url: { url: s.dataUrl },
    })),
  ];

  const raw = await callLM([{ role: 'user', content }]);

  // JSON 배열 파싱
  let results = null;
  try {
    results = JSON.parse(raw);
  } catch {
    // 배열 추출 시도
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) try { results = JSON.parse(arrMatch[0]); } catch {}
  }

  // 결과 매핑
  const analyses = [];
  const validIdx = new Map(validShots.map((s, i) => [s.file, i]));

  for (const shot of shots) {
    const idx = validIdx.get(shot.file);
    const meta = (results && Array.isArray(results) && idx != null)
      ? results[idx] ?? null
      : null;

    if (meta && meta.name) {
      analyses.push({ ...shot, meta });
    } else {
      analyses.push({ ...shot, meta: fallbackMeta(shot.file) });
    }
  }
  return analyses;
}

function fallbackMeta(file) {
  return {
    name: filenameToLabel(file),
    baseValue: 15000,
    rarity: 1.0,
    category: '액세서리',
    dominantColors: ['#888888', '#cccccc'],
    designKeywords: ['기본'],
  };
}

// ─────────────────────────────────────────────────────────────
//  STAGE 4: Preset Variation — 모델당 20종 (PBR 10 + Matcap 10)
// ─────────────────────────────────────────────────────────────

/** presets.js와 동일한 20개 프리셋 key 목록 (빌드 타임용) */
const ALL_PRESET_KEYS = [
  // PBR 10
  { key: 'plastic_matte',    label: '매트 플라스틱',      valueMod: 0,   rarityMod: 0 },
  { key: 'plastic_gloss',    label: '글로시 플라스틱',    valueMod: 10,  rarityMod: -0.05 },
  { key: 'rubber_soft',      label: '소프트 러버',        valueMod: 5,   rarityMod: 0 },
  { key: 'ceramic_clean',    label: '클린 세라믹',        valueMod: 20,  rarityMod: -0.1 },
  { key: 'metal_brushed',    label: '브러시드 메탈',      valueMod: 35,  rarityMod: -0.2 },
  { key: 'metal_polished',   label: '폴리시드 메탈',      valueMod: 50,  rarityMod: -0.3 },
  { key: 'paint_clearcoat',  label: '클리어코트 페인트',  valueMod: 30,  rarityMod: -0.15 },
  { key: 'fabric_sheen',     label: '패브릭 쉰',          valueMod: 15,  rarityMod: -0.05 },
  { key: 'glass_clear',      label: '클리어 글래스',      valueMod: 60,  rarityMod: -0.4 },
  { key: 'resin_tinted',     label: '틴티드 레진',        valueMod: 45,  rarityMod: -0.25 },
  // Matcap 10
  { key: 'matcap_clay',          label: '클레이',          valueMod: 5,   rarityMod: 0 },
  { key: 'matcap_wax',           label: '왁스',            valueMod: 10,  rarityMod: -0.05 },
  { key: 'matcap_chrome',        label: '크롬',            valueMod: 55,  rarityMod: -0.35 },
  { key: 'matcap_bronze',        label: '브론즈',          valueMod: 40,  rarityMod: -0.2 },
  { key: 'matcap_black_rubber',  label: '블랙 러버',      valueMod: 8,   rarityMod: 0 },
  { key: 'matcap_red_wax',       label: '레드 왁스',      valueMod: 15,  rarityMod: -0.1 },
  { key: 'matcap_white_ceramic', label: '화이트 세라믹',  valueMod: 25,  rarityMod: -0.15 },
  { key: 'matcap_blue_gloss',    label: '블루 글로시',    valueMod: 20,  rarityMod: -0.1 },
  { key: 'matcap_gold',          label: '골드',            valueMod: 70,  rarityMod: -0.5 },
  { key: 'matcap_silver_soft',   label: '소프트 실버',    valueMod: 35,  rarityMod: -0.2 },
];

function stagePresetGen(analyses) {
  const products = [];

  for (const entry of analyses) {
    const { id, file, meta } = entry;
    const base = meta.baseValue || 15000;
    const baseRarity = meta.rarity || 1.0;

    for (const preset of ALL_PRESET_KEYS) {
      const priceMod = 1 + preset.valueMod / 100;
      const finalValue = Math.round(base * priceMod / 100) * 100;
      const finalRarity = Math.max(0.1, Math.min(2.0, baseRarity + preset.rarityMod));

      products.push({
        id: `${id}_${preset.key}`,
        name: `${meta.name} (${preset.label})`,
        baseValue: finalValue,
        rarity: Math.round(finalRarity * 100) / 100,
        category: meta.category || '액세서리',
        modelPath: `assets/models/${file}`,
        preset: preset.key,
      });
    }
  }

  return products;
}

// ─────────────────────────────────────────────────────────────
//  CSV 유틸 — 점진적 읽기/쓰기 + 중복 체크
// ─────────────────────────────────────────────────────────────
const CSV_HEADERS = ['id','name','baseValue','rarity','category','modelPath','preset'];

function productToRow(p) {
  return [p.id, p.name, p.baseValue, p.rarity, p.category, p.modelPath, p.preset].join(',');
}

/** 기존 CSV에서 이미 처리된 id Set 로드 */
async function loadExistingIds() {
  try {
    const text = await readFile(CONFIG.outPath, 'utf-8');
    const lines = text.trim().split('\n');
    if (lines.length < 2) return new Set();
    const idIdx = lines[0].split(',').indexOf('id');
    const ids = new Set();
    for (let i = 1; i < lines.length; i++) {
      const id = lines[i].split(',')[idIdx];
      if (id) ids.add(id);
    }
    console.log(`   기존 CSV: ${ids.size}개 항목 발견`);
    return ids;
  } catch {
    return new Set();
  }
}

/** CSV 파일에 헤더가 없으면 생성, 있으면 그대로 */
async function ensureCSVHeader() {
  try {
    const text = await readFile(CONFIG.outPath, 'utf-8');
    if (text.trim().startsWith(CSV_HEADERS[0])) return; // 이미 있음
  } catch { /* 파일 없음 */ }
  await writeFile(CONFIG.outPath, CSV_HEADERS.join(',') + '\n', 'utf-8');
}

/** 새 행들을 CSV에 추가 (중복 id 건너뜀) */
async function appendToCSV(products, existingIds) {
  const newRows = [];
  for (const p of products) {
    if (existingIds.has(p.id)) continue;
    newRows.push(productToRow(p));
    existingIds.add(p.id);
  }
  if (newRows.length === 0) return 0;

  const text = await readFile(CONFIG.outPath, 'utf-8');
  const append = newRows.join('\n') + '\n';
  await writeFile(CONFIG.outPath, text + append, 'utf-8');
  return newRows.length;
}

// ─────────────────────────────────────────────────────────────
//  STAGE 6: CSV 분할 — 200행 단위로 분리 + manifest.json 생성
// ─────────────────────────────────────────────────────────────
const ROWS_PER_FILE = 200;
const CSV_DIR = resolve(__dirname, '../src/data');

async function splitCSV() {
  console.log('\n━━ Stage 6: CSV 분할 ━━');
  const text = await readFile(CONFIG.outPath, 'utf-8');
  const lines = text.trim().split('\n');
  const header = lines[0];
  const dataLines = lines.slice(1).filter(l => l.trim());

  if (dataLines.length <= ROWS_PER_FILE) {
    console.log(`   ${dataLines.length}행 — 분할 불필요 (단일 파일)`);
    // manifest에 단일 파일 등록
    const manifest = { files: ['data/products.csv'], totalProducts: dataLines.length };
    await writeFile(resolve(CSV_DIR, 'products-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    return;
  }

  // 기존 분할 파일 정리
  const existingParts = (await readdir(CSV_DIR)).filter(f => /^products_\d+\.csv$/.test(f));
  for (const f of existingParts) {
    await writeFile(resolve(CSV_DIR, f), '', 'utf-8'); // 덮어쓰기로 정리
  }

  const fileList = [];
  const totalChunks = Math.ceil(dataLines.length / ROWS_PER_FILE);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = dataLines.slice(i * ROWS_PER_FILE, (i + 1) * ROWS_PER_FILE);
    const filename = `products_${String(i + 1).padStart(2, '0')}.csv`;
    const content = [header, ...chunk].join('\n') + '\n';
    await writeFile(resolve(CSV_DIR, filename), content, 'utf-8');
    fileList.push(`data/${filename}`);
    console.log(`   📄 ${filename}: ${chunk.length}행`);
  }

  // manifest 생성
  const manifest = { files: fileList, totalProducts: dataLines.length };
  await writeFile(resolve(CSV_DIR, 'products-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`   ✅ ${totalChunks}개 파일로 분할, manifest 생성`);
}

// ─────────────────────────────────────────────────────────────
//  MAIN — 배치 단위 점진적 Agent 파이프라인
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  GLB Model Scan Agent (Incremental)   ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(`   배치: ${CONFIG.batchSize}개씩 | 프리셋: ${ALL_PRESET_KEYS.length}종 (PBR 10 + Matcap 10)\n`);

  // Stage 1: 폴더 스캔
  const files = await stageScanner();
  if (files.length === 0) { console.log('모델 없음. 종료.'); return; }

  // CSV 준비 + 기존 데이터 로드 (중복 체크용)
  if (CONFIG.reset) {
    await writeFile(CONFIG.outPath, CSV_HEADERS.join(',') + '\n', 'utf-8');
    console.log('   --reset: CSV 초기화');
  } else {
    await ensureCSVHeader();
  }
  const existingIds = CONFIG.reset ? new Set() : await loadExistingIds();

  // 이미 처리된 모델의 base id 추출 (shader 변형 suffix 제거)
  const doneBaseIds = new Set();
  for (const id of existingIds) {
    // 프리셋 suffix 제거해서 원본 모델 id 추출
    const presetKeys = ALL_PRESET_KEYS.map(p => p.key).join('|');
    doneBaseIds.add(id.replace(new RegExp(`_(${presetKeys})$`), ''));
  }
  const pendingFiles = files.filter(f => {
    const baseId = basename(f, '.glb').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return !doneBaseIds.has(baseId);
  });

  if (pendingFiles.length === 0) {
    console.log(`\n✅ 모든 ${files.length}개 모델이 이미 처리됨. 완료!`);
    return;
  }
  console.log(`   대기: ${pendingFiles.length}개 (기존 ${files.length - pendingFiles.length}개 건너뜀)\n`);

  // Stage 2: 브라우저 + 서버 시작 (전체 세션에서 재사용)
  console.log('━━ Stage 2: Renderer 준비 ━━');
  await mkdir(SHOTS_DIR, { recursive: true });
  const { server, port } = await startStaticServer();
  console.log(`   HTTP 서버: http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512 });
  await page.goto(`http://127.0.0.1:${port}/tools/model-viewer.html`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction('window.__VIEWER_READY__ === true', { timeout: 15000 });
  console.log('   뷰어 준비 완료');

  // 배치 루프
  const totalBatches = Math.ceil(pendingFiles.length / CONFIG.batchSize);
  let totalAdded = 0;
  let totalOk = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batchStart = b * CONFIG.batchSize;
    const batch = pendingFiles.slice(batchStart, batchStart + CONFIG.batchSize);
    const batchNum = b + 1;

    console.log(`\n━━ Batch ${batchNum}/${totalBatches} (${batch.length}개) ━━`);

    // 2a. 스크린샷 캡처
    const screenshots = [];
    for (const file of batch) {
      const id = basename(file, '.glb').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      process.stdout.write(`   📸 ${file} ... `);
      try {
        const modelUrl = `http://127.0.0.1:${port}/assets/models/${encodeURIComponent(file)}`;
        const result = await page.evaluate(async (url) => {
          try { return { ok: true, data: await window.captureModel(url) }; }
          catch (e) { return { ok: false, error: e?.message || String(e) }; }
        }, modelUrl);
        if (!result.ok) throw new Error(result.error);
        const pngData = result.data.replace(/^data:image\/png;base64,/, '');
        await writeFile(resolve(SHOTS_DIR, `${id}.png`), pngData, 'base64');
        screenshots.push({ file, id, dataUrl: result.data });
        console.log('✅');
      } catch (e) {
        console.log(`❌ ${e.message}`);
        screenshots.push({ file, id, dataUrl: null });
      }
    }

    // 3. LM Studio 배치 분석 (한 번의 호출로 N개 처리)
    process.stdout.write(`   🤖 LM 배치 분석 (${screenshots.length}개) ... `);
    let analyses;
    try {
      analyses = await analyzeBatch(screenshots);
      const okCount = analyses.filter(a => a.meta.name !== filenameToLabel(a.file)).length;
      totalOk += okCount;
      console.log(`✅ ${okCount}/${screenshots.length} 성공`);
      for (const a of analyses) {
        console.log(`      ${a.file} → ${a.meta.name} (₩${a.meta.baseValue})`);
      }
    } catch (e) {
      console.log(`❌ ${e.message.slice(0, 60)}`);
      analyses = screenshots.map(s => ({ ...s, meta: fallbackMeta(s.file) }));
    }

    // 4. Shader 변형 생성
    // Stage 4: 20종 프리셋 변형 생성
    const products = stagePresetGen(analyses);

    // 5. CSV에 점진적 추가 (중복 체크)
    if (!CONFIG.dryRun) {
      const added = await appendToCSV(products, existingIds);
      totalAdded += added;
      console.log(`   💾 CSV 저장: +${added}행 (누적 ${existingIds.size}개)`);
    } else {
      console.log(`   [dry-run] ${products.length}개 생성됨`);
    }
  }

  // 정리
  await browser.close();
  server.close();

  // Stage 6: CSV 분할 (200행 단위)
  if (!CONFIG.dryRun) {
    await splitCSV();
  }

  console.log('\n╔═══════════════════════════════════════╗');
  console.log(`║  완료! ${totalAdded}개 추가 (총 ${existingIds.size}개)`.padEnd(40) + '║');
  console.log(`║  분석 성공: ${totalOk}/${pendingFiles.length}`.padEnd(40) + '║');
  console.log('╚═══════════════════════════════════════╝');
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
