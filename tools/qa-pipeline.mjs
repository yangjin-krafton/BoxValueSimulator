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
  lmModel:      flag('model', 'qwen/qwen3.5-9b'),
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

const QA_SYSTEM_PROMPT = `/no_think
You are a strict quality inspector for collectible figure images that will be converted to 3D models.
Do NOT think. Do NOT use <think> tags. Respond ONLY with a JSON object. No other text before or after.

Criteria:
1. SINGLE_SUBJECT: Exactly one clear main subject (not multiple scattered objects)
2. WHITE_BG: Clean white or near-white background (not cluttered/colored)
3. FULL_BODY: Complete figure visible, not cropped at edges
4. CLEAR_SHAPE: Well-defined solid shape suitable for 3D conversion (not blurry/abstract)
5. NO_ARTIFACTS: No visual glitches, noise, or distortion
6. RECOGNIZABLE: Subject matches a collectible figure/toy aesthetic

JSON format:
{"pass":true/false,"score":0-100,"issues":["issue1","issue2"],"suggestion":"one line fix suggestion if failed"}

Score guide: 90-100=excellent, 70-89=acceptable, 50-69=mediocre, 0-49=bad
Pass threshold: score >= 70 AND no critical issues (missing subject, heavy artifacts)`;

async function callLMVision(imageBase64, filename) {
  const res = await fetch(`${CONFIG.lmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.lmModel,
      messages: [
        { role: 'system', content: QA_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Inspect this image (${filename}). Respond with JSON only.` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
      // thinking 끄기 — 여러 방법 동시 적용 (LM Studio 버전별 호환)
      chat_template_kwargs: { enable_thinking: false },
      // Qwen3 thinking budget 0으로 설정
      extra_body: { thinking: { type: "disabled" } },
    }),
  });

  if (!res.ok) throw new Error(`LM Studio ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let raw = data.choices?.[0]?.message?.content || '';

  // thinking 태그가 있으면 전부 제거 (켜져 있는 경우 대비)
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  // 닫는 태그 없이 열린 think도 제거
  const thinkStart = raw.indexOf('<think>');
  if (thinkStart !== -1) {
    const thinkEnd = raw.indexOf('</think>', thinkStart);
    if (thinkEnd !== -1) {
      raw = raw.slice(0, thinkStart) + raw.slice(thinkEnd + 8);
    } else {
      // </think> 없이 끝난 경우 — think 이전 내용만 사용하거나, 이후에서 JSON 찾기
      raw = raw.slice(thinkStart);
    }
  }

  // JSON 추출 (```json 블록, 순수 JSON 등 모든 형태 대응)
  raw = raw.replace(/^[\s\S]*?(?=\{)/m, ''); // { 앞의 모든 텍스트 제거
  raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { pass: false, score: 0, issues: ['JSON 파싱 실패'], suggestion: 'retry', _raw: data.choices?.[0]?.message?.content?.slice(0, 200) };

  try {
    return JSON.parse(match[0]);
  } catch {
    return { pass: false, score: 0, issues: ['JSON 파싱 실패'], suggestion: 'retry', _raw: match[0].slice(0, 200) };
  }
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

  // LM Studio 연결 확인
  try {
    const res = await fetch(`${CONFIG.lmUrl}/v1/models`);
    const data = await res.json();
    console.log(`   LM Studio 연결: ${data.data?.[0]?.id || 'OK'}`);
  } catch (e) {
    console.error(`   ❌ LM Studio 연결 실패: ${CONFIG.lmUrl}`);
    console.error(`   모델을 먼저 로드하세요: ${CONFIG.lmModel}`);
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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = basename(file, '.png');

    // 배치 간 쉼
    if (i > 0 && i % CONFIG.batchSize === 0) {
      const pct = ((passed / (passed + failed)) * 100).toFixed(0);
      console.log(`   --- 배치 ${Math.floor(i / CONFIG.batchSize)} 완료 (합격률: ${pct}%) ---\n`);
    }

    process.stdout.write(`   [${i + 1}/${files.length}] ${id} ... `);

    try {
      const imgData = await readFile(resolve(IMG_DIR, file));
      const base64 = imgData.toString('base64');
      const result = await callLMVision(base64, file);

      report.results[id] = {
        ...result,
        timestamp: new Date().toISOString(),
      };

      if (result.pass && result.score >= 70) {
        passed++;
        console.log(`✅ ${result.score}점`);
      } else {
        failed++;
        const issues = result.issues?.join(', ') || 'unknown';
        console.log(`❌ ${result.score}점 [${issues}]`);
      }
    } catch (e) {
      errors++;
      report.results[id] = { pass: false, score: 0, issues: ['검수 오류: ' + e.message], suggestion: 'retry' };
      console.log(`⚠️  오류: ${e.message.slice(0, 50)}`);
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

  console.log(`\n   ────────────────────────────────`);
  console.log(`   합격: ${passed} | 불합격: ${failed} | 오류: ${errors}`);
  console.log(`   합격률: ${(rate * 100).toFixed(1)}%`);
  console.log(`   리포트: ${QA_REPORT_PATH}`);

  return report;
}

// ─── Phase: 재생성 ──────────────────────────────────────────

async function runRegeneration(report) {
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

    const suggestion = report.results[id]?.suggestion || '';
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
        if (dev) {
          const usage = 1 - dev.vram_free / dev.vram_total;
          if (usage > 0.8) {
            await freeComfyVRAM();
          }
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

    // LM Studio가 VRAM을 놓을 때까지 대기
    console.log('   ⏳ VRAM 전환 대기 (LM Studio → ComfyUI)...');
    console.log('   💡 LM Studio에서 모델을 언로드하세요');
    await sleep(5000);
    await freeComfyVRAM();

    const regenerated = await runRegeneration(report);

    if (regenerated === 0) {
      console.log('   재생성된 항목 없음 — 루프 종료');
      break;
    }

    // 다음 라운드 전 ComfyUI VRAM 해제
    await freeComfyVRAM();
    console.log('   ⏳ VRAM 전환 대기 (ComfyUI → LM Studio)...');
    console.log('   💡 LM Studio에서 모델을 다시 로드하세요');
    await sleep(5000);
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
