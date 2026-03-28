#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  QA Pipeline — LM Studio 비전 검수 + 재생성 루프              ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  ComfyUI 완료 → LM Studio 검수 → 불합격 재생성 → 재검수      ║
 * ║  90% 이상 합격까지 반복                                       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * VRAM 관리: ComfyUI ↔ LM Studio 동시 사용 불가 (16GB)
 *   - ComfyUI 작업 완료 후 /free → LM Studio 검수
 *   - 재생성 필요 시 LM Studio 종료 대기 → ComfyUI 재생성
 *
 * 사용법:
 *   node tools/qa-pipeline.mjs                     # 전체 루프
 *   node tools/qa-pipeline.mjs --qa-only           # 검수만 (재생성 안 함)
 *   node tools/qa-pipeline.mjs --max-rounds 5      # 최대 라운드 수
 *   node tools/qa-pipeline.mjs --pass-rate 0.95    # 합격률 목표 (기본 0.9)
 *   node tools/qa-pipeline.mjs --batch 20          # 배치 크기 (LM Studio)
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ─── 설정 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}

const CONFIG = {
  comfyUrl:     flag('comfy-url', 'http://100.66.10.225:8188'),
  lmUrl:        flag('lm-url', 'http://100.66.10.225:1234'),
  lmModel:      flag('model', 'qwen/qwen3-vl-8b'),
  qaOnly:       args.includes('--qa-only'),
  maxRounds:    Number(flag('max-rounds', '10')),
  passRate:     Number(flag('pass-rate', '0.9')),
  batchSize:    Number(flag('batch', '10')),
  pollInterval: 2000,
  pollTimeout:  600000,
};

const IMG_DIR        = resolve(__dirname, 'generated-img');
const QA_REPORT_PATH = resolve(__dirname, 'qa-report.json');
const CHECKPOINT_PATH = resolve(__dirname, 'pipeline-checkpoint.json');
const TEXT2IMG_PATH  = resolve(__dirname, 'text2img.json');
const PROMPTS_PATH   = resolve(__dirname, 'product-prompts.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── LM Studio API ─────────────────────────────────────────

const QA_SYSTEM_PROMPT = `You are a JSON API. Output raw JSON only. Never explain.

You inspect collectible figure product photos for 3D model conversion.
These are 512x512 studio photos on light backgrounds.

HARD FAIL (score 0-30):
- SINGLE: More than one separate character/figure in the image.
- MAJOR_CROP: Head or large body part completely missing/cut off at edge.
- MAJOR_ARTIFACT: Severe glitches, melted face, extra limbs, unrecognizable shape.

SOFT ISSUES (reduce score but still pass if minor):
- WHITE_BG: Background not perfectly white (light gray is OK, colored is not).
- MINOR_CROP: Tips of weapons/wings/feet slightly touching edge (acceptable).
- HELD_ITEMS: Weapon floating or clipping through body.
- CLEAR_SHAPE: Blurry or unclear shape.

Scoring: Start at 100, subtract for issues. Light gray bg = -5, slight edge touch = -5, weapon float = -15, multiple figures = instant 0.
pass=true if score >= 70.

For multiple images return JSON array in order.
{"pass":bool,"score":0-100,"issues":[],"suggestion":"fix"}`;

/** JSON Schema for structured output — LM Studio grammar-based enforcement */
const QA_SINGLE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "qa_result",
    strict: "true",
    schema: {
      type: "object",
      properties: {
        pass:       { type: "boolean" },
        score:      { type: "integer" },
        issues:     { type: "array", items: { type: "string" } },
        suggestion: { type: "string" },
      },
      required: ["pass", "score", "issues", "suggestion"],
    },
  },
};

const QA_BATCH_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "qa_batch_result",
    strict: "true",
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pass:       { type: "boolean" },
              score:      { type: "integer" },
              issues:     { type: "array", items: { type: "string" } },
              suggestion: { type: "string" },
            },
            required: ["pass", "score", "issues", "suggestion"],
          },
        },
      },
      required: ["results"],
    },
  },
};

/** 배치 이미지 검수 — structured output으로 JSON 강제 */
async function callLMVisionBatch(items) {
  const imageContents = [];
  const fileList = items.map((item, i) => `${i + 1}. ${item.filename}`).join('\n');

  imageContents.push({ type: 'text', text: `Inspect ${items.length} images. Return results array in order.\n${fileList}` });
  for (const item of items) {
    imageContents.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${item.base64}` } });
  }

  const isBatch = items.length > 1;

  const res = await fetch(`${CONFIG.lmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.lmModel,
      messages: [
        { role: 'system', content: QA_SYSTEM_PROMPT },
        { role: 'user', content: imageContents },
      ],
      temperature: 0.0,
      max_tokens: 4096,
      response_format: isBatch ? QA_BATCH_SCHEMA : QA_SINGLE_SCHEMA,
    }),
  });

  if (!res.ok) throw new Error(`LM Studio ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let raw = data.choices?.[0]?.message?.content || '';

  // thinking 태그 제거 (만약 있다면)
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  const thinkIdx = raw.indexOf('</think>');
  if (thinkIdx !== -1) raw = raw.slice(thinkIdx + 8);
  raw = raw.trim();

  try {
    const parsed = JSON.parse(raw);

    // 배치: { results: [...] }
    if (isBatch && parsed.results && Array.isArray(parsed.results)) {
      // 결과 수가 부족하면 fallback으로 채움
      while (parsed.results.length < items.length) {
        parsed.results.push({ pass: false, score: 0, issues: ['응답 누락'], suggestion: 'retry' });
      }
      return parsed.results.slice(0, items.length);
    }

    // 단일: { pass, score, ... }
    if (!isBatch && 'pass' in parsed) {
      return [parsed];
    }

    // 예외: 배열이 직접 왔을 때
    if (Array.isArray(parsed)) {
      return parsed.slice(0, items.length);
    }
  } catch {}

  // structured output 실패 시 fallback 파싱
  const objects = [...raw.matchAll(/\{[^{}]*\}/g)].map(m => {
    try { return JSON.parse(m[0]); } catch { return null; }
  }).filter(Boolean);

  if (objects.length >= items.length) return objects.slice(0, items.length);

  const fallback = { pass: false, score: 0, issues: ['JSON 파싱 실패'], suggestion: 'retry', _raw: raw.slice(0, 300) };
  return items.map(() => fallback);
}

// ─── ComfyUI API ────────────────────────────────────────────

async function comfyFetch(path, options = {}) {
  const res = await fetch(`${CONFIG.comfyUrl}${path}`, options);
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${path}`);
  return res;
}

async function freeComfyVRAM() {
  try {
    await comfyFetch('/free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    await sleep(3000);
  } catch {}
}

/** LM Studio 모델 로드 */
async function loadLMModel() {
  try {
    console.log(`   LM Studio 모델 로드: ${CONFIG.lmModel}...`);
    const res = await fetch(`${CONFIG.lmUrl}/api/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CONFIG.lmModel }),
    });
    if (res.ok) {
      console.log('   LM Studio 모델 로드 완료');
      await sleep(3000);
      return true;
    }
  } catch {}
  // load API 미지원 시 이미 로드되어 있다고 가정
  return false;
}

/** LM Studio 모델 언로드 — VRAM 해제 */
async function unloadLMModel() {
  try {
    console.log('   LM Studio 모델 언로드...');
    const res = await fetch(`${CONFIG.lmUrl}/api/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: CONFIG.lmModel }),
    });
    if (res.ok) {
      console.log('   LM Studio 모델 언로드 완료 (VRAM 해제)');
      await sleep(3000);
      return true;
    }
  } catch {}
  // unload API 미지원 시 수동 안내
  console.log('   ⚠️  LM Studio 자동 언로드 실패 — 수동으로 모델을 내려주세요');
  return false;
}

async function regenerateImage(id, prompt) {
  const workflow = JSON.parse(await readFile(TEXT2IMG_PATH, 'utf-8'));
  workflow['50'].inputs.text = prompt;
  workflow['49'].inputs.seed = Math.floor(Math.random() * 2 ** 53);
  workflow['49'].inputs.denoise = 1.0;
  workflow['49'].inputs.steps = 10;
  workflow['9'].inputs.filename_prefix = id;

  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'qa-pipeline' }),
  });
  const { prompt_id } = await res.json();

  // 완료 대기
  const start = Date.now();
  while (Date.now() - start < CONFIG.pollTimeout) {
    await sleep(CONFIG.pollInterval);
    try {
      const hRes = await comfyFetch(`/history/${prompt_id}`);
      const data = await hRes.json();
      const entry = data[prompt_id];
      if (!entry) continue;
      if (entry.status?.status_str === 'error') throw new Error('ComfyUI error');
      if (entry.outputs && Object.keys(entry.outputs).length > 0) {
        const images = entry.outputs?.['9']?.images;
        if (!images?.length) throw new Error('출력 없음');
        const img = images[0];
        const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
        const dlRes = await comfyFetch(`/view?${params}`);
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        await writeFile(resolve(IMG_DIR, `${id}.png`), buffer);
        return true;
      }
    } catch (e) {
      if (e.message === 'ComfyUI error') throw e;
    }
  }
  throw new Error('timeout');
}

// ─── QA Report 관리 ─────────────────────────────────────────

async function loadQAReport() {
  try {
    return JSON.parse(await readFile(QA_REPORT_PATH, 'utf-8'));
  } catch {
    return { results: {}, rounds: [], stats: {} };
  }
}

async function saveQAReport(report) {
  await writeFile(QA_REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
}

// ─── Phase: QA 검수 ─────────────────────────────────────────

async function runQA(targetIds = null) {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  QA 검수 (LM Studio Vision)           ║');
  console.log('╚═══════════════════════════════════════╝');

  // ComfyUI VRAM 해제
  console.log('   ComfyUI VRAM 해제...');
  await freeComfyVRAM();

  // LM Studio 모델 로드
  await loadLMModel();

  // LM Studio 연결 확인
  try {
    const res = await fetch(`${CONFIG.lmUrl}/v1/models`);
    const data = await res.json();
    const loaded = data.data?.map(m => m.id).join(', ') || 'none';
    console.log(`   LM Studio 연결: ${loaded}`);
    if (!data.data?.length) {
      console.error('   ❌ 로드된 모델 없음');
      return null;
    }
  } catch (e) {
    console.error(`   ❌ LM Studio 연결 실패: ${CONFIG.lmUrl}`);
    return null;
  }

  // 검수 대상 이미지 수집
  const allFiles = (await readdir(IMG_DIR)).filter(f => f.startsWith('fig_') && f.endsWith('.png'));
  const files = targetIds
    ? allFiles.filter(f => targetIds.includes(basename(f, '.png')))
    : allFiles;

  console.log(`   대상: ${files.length}개 이미지\n`);

  const report = await loadQAReport();
  let passed = 0, failed = 0, errors = 0;

  // 배치 단위로 처리
  for (let bStart = 0; bStart < files.length; bStart += CONFIG.batchSize) {
    const batch = files.slice(bStart, bStart + CONFIG.batchSize);
    const batchNum = Math.floor(bStart / CONFIG.batchSize) + 1;
    const totalBatches = Math.ceil(files.length / CONFIG.batchSize);

    console.log(`   [배치 ${batchNum}/${totalBatches}] ${batch.length}장 검수 중...`);

    try {
      // 배치 이미지 로드
      const items = [];
      for (const file of batch) {
        const imgData = await readFile(resolve(IMG_DIR, file));
        items.push({ base64: imgData.toString('base64'), filename: file });
      }

      // 배치 API 호출
      const results = await callLMVisionBatch(items);

      // 결과 기록
      for (let i = 0; i < batch.length; i++) {
        const id = basename(batch[i], '.png');
        const result = results[i] || { pass: false, score: 0, issues: ['응답 누락'], suggestion: 'retry' };

        report.results[id] = { ...result, timestamp: new Date().toISOString() };

        // 합격 판정: pass=true이거나, critical issue(SINGLE, NOT_CROPPED) 없이 score>=80
        const hardFails = (result.issues || []).filter(i => ['SINGLE', 'MAJOR_CROP', 'MAJOR_ARTIFACT'].includes(i));
        const isPass = hardFails.length === 0 && result.score >= 70;
        result.pass = isPass;

        if (isPass) {
          passed++;
          console.log(`     ${id} ✅ ${result.score}점`);
        } else {
          failed++;
          const issues = result.issues?.join(', ') || 'unknown';
          console.log(`     ${id} ❌ ${result.score}점 [${issues}]`);
        }
      }
    } catch (e) {
      // 배치 실패 시 개별 fallback
      for (const file of batch) {
        const id = basename(file, '.png');
        errors++;
        report.results[id] = { pass: false, score: 0, issues: ['배치 오류: ' + e.message], suggestion: 'retry' };
        console.log(`     ${id} ⚠️ 오류`);
      }
    }

    const total = passed + failed;
    if (total > 0) {
      console.log(`   --- 누적: ${passed}/${total} 합격 (${((passed/total)*100).toFixed(0)}%) ---\n`);
    }
  }

  // 통계
  const total = passed + failed;
  const rate = total > 0 ? (passed / total) : 0;
  const roundStats = {
    timestamp: new Date().toISOString(),
    total: files.length,
    passed,
    failed,
    errors,
    passRate: Math.round(rate * 1000) / 10,
  };
  report.rounds.push(roundStats);
  report.stats = roundStats;

  await saveQAReport(report);

  // QA 완료 → LM Studio 모델 언로드 (VRAM 해제)
  await unloadLMModel();

  console.log(`\n   ────────────────────────────────`);
  console.log(`   합격: ${passed} | 불합격: ${failed} | 오류: ${errors}`);
  console.log(`   합격률: ${(rate * 100).toFixed(1)}%`);
  console.log(`   리포트: ${QA_REPORT_PATH}`);

  return report;
}

// ─── Phase: 재생성 ──────────────────────────────────────────

async function runRegeneration(report, roundNum) {
  // 불합격 목록 추출
  const failedIds = Object.entries(report.results)
    .filter(([_, r]) => !r.pass || r.score < 70)
    .map(([id]) => id);

  if (failedIds.length === 0) {
    console.log('\n   재생성 필요 없음 (전체 합격)');
    return 0;
  }

  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  재생성: ${String(failedIds.length).padStart(4)}개 불합격 이미지         ║`);
  console.log(`╚═══════════════════════════════════════╝`);

  // 불합격 이미지 삭제
  const { unlink } = await import('node:fs/promises');
  for (const id of failedIds) {
    try { await unlink(resolve(IMG_DIR, `${id}.png`)); } catch {}
  }
  console.log(`   불합격 ${failedIds.length}장 삭제`);

  // 프롬프트 로드
  const products = JSON.parse(await readFile(PROMPTS_PATH, 'utf-8'));
  const promptMap = new Map(products.map(p => [p.id, p.prompt]));

  let regenerated = 0;
  let regen_failed = 0;

  for (let i = 0; i < failedIds.length; i++) {
    const id = failedIds[i];
    const prompt = promptMap.get(id);
    if (!prompt) {
      console.log(`   [${i + 1}/${failedIds.length}] ${id} — 프롬프트 없음, 건너뜀`);
      continue;
    }

    process.stdout.write(`   [${i + 1}/${failedIds.length}] ${id} ... `);

    try {
      await regenerateImage(id, prompt);
      regenerated++;
      console.log('✅ 재생성 완료');
    } catch (e) {
      regen_failed++;
      console.log(`❌ ${e.message.slice(0, 40)}`);
    }

    // 배치마다 VRAM 확인
    if ((i + 1) % 10 === 0) {
      try {
        const res = await comfyFetch('/system_stats');
        const stats = await res.json();
        const dev = stats.devices?.[0];
        if (dev && (1 - dev.vram_free / dev.vram_total) > 0.8) {
          await freeComfyVRAM();
        }
      } catch {}
    }
  }

  console.log(`\n   재생성 완료: ${regenerated}개 성공, ${regen_failed}개 실패`);
  return regenerated;
}

// ─── Main: QA + 재생성 루프 ─────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  QA Pipeline — 검수 + 재생성 루프                 ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`   LM Studio: ${CONFIG.lmUrl} (${CONFIG.lmModel})`);
  console.log(`   ComfyUI:   ${CONFIG.comfyUrl}`);
  console.log(`   목표:      합격률 ${(CONFIG.passRate * 100).toFixed(0)}%`);
  console.log(`   최대:      ${CONFIG.maxRounds}라운드`);

  for (let round = 1; round <= CONFIG.maxRounds; round++) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  라운드 ${round}/${CONFIG.maxRounds}`);
    console.log(`${'═'.repeat(60)}`);

    // 1) QA 검수 (라운드 1은 전체, 이후는 재생성된 것만)
    const report = await runQA(round === 1 ? null : undefined);
    if (!report) {
      console.error('QA 실패 — 중단');
      break;
    }

    const rate = report.stats.passRate / 100;

    // 목표 달성?
    if (rate >= CONFIG.passRate) {
      console.log(`\n   🎉 목표 달성! 합격률 ${report.stats.passRate}% >= ${(CONFIG.passRate * 100).toFixed(0)}%`);
      break;
    }

    // QA만 모드면 재생성 안 함
    if (CONFIG.qaOnly) {
      console.log(`\n   [qa-only] 재생성 건너뜀`);
      break;
    }

    // 2) ComfyUI로 불합격 이미지 재생성
    console.log(`\n   합격률 ${report.stats.passRate}% < ${(CONFIG.passRate * 100).toFixed(0)}% — 재생성 시작`);

    // LM Studio VRAM 해제 → ComfyUI 전환
    console.log('   VRAM 전환 (LM Studio → ComfyUI)...');
    await sleep(3000);

    const regenerated = await runRegeneration(report, round);

    if (regenerated === 0) {
      console.log('   재생성된 항목 없음 — 루프 종료');
      break;
    }

    // 다음 라운드 전 ComfyUI VRAM 해제 → LM Studio 전환
    await freeComfyVRAM();
    console.log('   VRAM 전환 (ComfyUI → LM Studio)...');
    await sleep(3000);
  }

  // 최종 리포트
  const report = await loadQAReport();
  const passed = Object.values(report.results).filter(r => r.pass && r.score >= 70).length;
  const total = Object.keys(report.results).length;
  const failedList = Object.entries(report.results)
    .filter(([_, r]) => !r.pass || r.score < 70)
    .map(([id, r]) => `  ${id}: ${r.score}점 [${r.issues?.join(', ')}]`);

  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  최종 결과                                        ║`);
  console.log(`║  합격: ${String(passed).padStart(4)} / ${String(total).padStart(4)}  (${total > 0 ? ((passed/total)*100).toFixed(1) : 0}%)`.padEnd(52) + '║');
  console.log(`║  라운드: ${report.rounds.length}회`.padEnd(52) + '║');
  console.log(`╚═══════════════════════════════════════════════════╝`);

  if (failedList.length > 0 && failedList.length <= 20) {
    console.log('\n   불합격 목록:');
    failedList.forEach(l => console.log(`   ${l}`));
  } else if (failedList.length > 20) {
    console.log(`\n   불합격 ${failedList.length}개 — qa-report.json 참조`);
  }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
