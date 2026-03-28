#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  ComfyUI Asset Generation Pipeline                           ║
 * ║  Text → Image → GLB → Game Resource                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * RTX 5080 16GB 안전 운영:
 *   - Phase 분리 (text2img 모두 완료 → img2glb)
 *   - 배치 간 /free API 호출로 VRAM 정리
 *   - checkpoint 저장으로 중단/재시작 지원
 *
 * 사용법:
 *   node tools/asset-pipeline.mjs                    # 전체 실행
 *   node tools/asset-pipeline.mjs --phase 1          # 이미지만
 *   node tools/asset-pipeline.mjs --phase 2          # GLB만
 *   node tools/asset-pipeline.mjs --ids id1,id2      # 특정 항목만
 *   node tools/asset-pipeline.mjs --retry-failed     # 실패 재시도
 *   node tools/asset-pipeline.mjs --reset            # checkpoint 초기화
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
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
  comfyUrl:       flag('comfy-url', 'http://100.66.10.225:8188'),
  phase:          flag('phase', 'all'),           // '1', '2', 'all'
  ids:            flag('ids', ''),                 // 'id1,id2,...' or ''
  retryFailed:    args.includes('--retry-failed'),
  reset:          args.includes('--reset'),
  imgBatchSize:   Number(flag('img-batch', '10')), // /free 호출 간격 (text2img)
  glbBatchSize:   Number(flag('glb-batch', '3')),  // /free 호출 간격 (img2glb)
  pollInterval:   2000,                            // ms
  pollTimeout:    300000,                          // 5분 타임아웃
  cooldownMs:     3000,                            // /free 후 대기
  maxRetries:     3,                               // 항목별 최대 재시도
  vramThreshold:  0.80,                            // VRAM 80% 이상이면 정리
};

const PROMPTS_PATH    = resolve(__dirname, 'product-prompts.json');
const CHECKPOINT_PATH = resolve(__dirname, 'pipeline-checkpoint.json');
const IMG_DIR         = resolve(__dirname, 'generated-img');
const GLB_DIR         = resolve(__dirname, 'generated-glb');
const MODELS_DIR      = resolve(__dirname, '../src/assets/models');
const TEXT2IMG_PATH   = resolve(__dirname, 'text2img.json');
const IMG2GLB_PATH    = resolve(__dirname, 'img2glb.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── ComfyUI API ────────────────────────────────────────────

async function comfyFetch(path, options = {}) {
  const url = `${CONFIG.comfyUrl}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${path}`);
  return res;
}

/** 워크플로우 실행, prompt_id 반환 */
async function queuePrompt(workflow) {
  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'asset-pipeline' }),
  });
  const data = await res.json();
  return data.prompt_id;
}

/** prompt_id 가 완료될 때까지 대기, outputs 반환 */
async function waitForCompletion(promptId) {
  const start = Date.now();
  while (Date.now() - start < CONFIG.pollTimeout) {
    await sleep(CONFIG.pollInterval);
    try {
      const res = await comfyFetch(`/history/${promptId}`);
      const data = await res.json();
      const entry = data[promptId];
      if (!entry) continue;
      if (entry.status?.completed) return entry.outputs;
      if (entry.status?.status_str === 'error') {
        throw new Error(`ComfyUI 실행 오류: ${JSON.stringify(entry.status)}`);
      }
    } catch (e) {
      if (e.message.includes('ComfyUI 실행 오류')) throw e;
      // polling 오류는 무시하고 재시도
    }
  }
  throw new Error(`타임아웃: ${promptId} (${CONFIG.pollTimeout / 1000}초)`);
}

/** ComfyUI 출력 파일 다운로드 */
async function downloadOutput(filename, subfolder, type, destPath) {
  const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
  const res = await comfyFetch(`/view?${params}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return destPath;
}

/** VRAM 정리 — 모델 언로드 + 메모리 해제 */
async function freeVRAM() {
  try {
    await comfyFetch('/free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    console.log('   🧹 VRAM 정리 완료');
    await sleep(CONFIG.cooldownMs);
  } catch (e) {
    console.warn(`   ⚠️  VRAM 정리 실패: ${e.message}`);
  }
}

/** 시스템 상태 확인, VRAM 사용률 반환 */
async function getVRAMUsage() {
  try {
    const res = await comfyFetch('/system_stats');
    const data = await res.json();
    const device = data.devices?.[0];
    if (!device) return 0;
    const used = device.vram_total - device.vram_free;
    return used / device.vram_total;
  } catch {
    return 0;
  }
}

/** 필요 시 VRAM 정리 */
async function ensureVRAM() {
  const usage = await getVRAMUsage();
  if (usage > CONFIG.vramThreshold) {
    console.log(`   ⚠️  VRAM ${(usage * 100).toFixed(0)}% 사용 중 → 정리`);
    await freeVRAM();
  }
}

// ─── Checkpoint 관리 ────────────────────────────────────────

async function loadCheckpoint() {
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, 'utf-8'));
  } catch {
    return { phase1: {}, phase2: {}, completed: [] };
  }
}

async function saveCheckpoint(cp) {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(cp, null, 2), 'utf-8');
}

// ─── Phase 1: Text → Image ─────────────────────────────────

async function runPhase1(products, checkpoint) {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  Phase 1: Text → Image                ║');
  console.log('╚═══════════════════════════════════════╝');

  const workflow = JSON.parse(await readFile(TEXT2IMG_PATH, 'utf-8'));
  await mkdir(IMG_DIR, { recursive: true });

  let count = 0;
  let success = 0;
  let sinceLastFree = 0;

  for (const product of products) {
    count++;
    const { id, prompt } = product;

    // 이미 완료?
    if (checkpoint.phase1[id] === 'done') {
      console.log(`   [${count}/${products.length}] ${id} — 이미 완료, 건너뜀`);
      continue;
    }

    // 실패 횟수 확인
    const failures = checkpoint.phase1[id]?.startsWith('fail:')
      ? parseInt(checkpoint.phase1[id].split(':')[1]) : 0;
    if (failures >= CONFIG.maxRetries && !CONFIG.retryFailed) {
      console.log(`   [${count}/${products.length}] ${id} — ${failures}회 실패, 건너뜀`);
      continue;
    }

    process.stdout.write(`   [${count}/${products.length}] ${id} ... `);

    try {
      // 워크플로우 수정
      const wf = JSON.parse(JSON.stringify(workflow));
      wf['50'].inputs.text = prompt;
      wf['49'].inputs.seed = Math.floor(Math.random() * 2 ** 53);
      wf['49'].inputs.denoise = 1.0;   // text2img는 반드시 1.0
      wf['49'].inputs.steps = 10;      // turbo 모델 최적 스텝
      wf['9'].inputs.filename_prefix = id;

      // 실행
      const promptId = await queuePrompt(wf);
      const outputs = await waitForCompletion(promptId);

      // 출력 이미지 찾기
      const saveNode = outputs?.['9'];
      const images = saveNode?.images;
      if (!images || images.length === 0) throw new Error('출력 이미지 없음');

      const img = images[0];
      const destPath = resolve(IMG_DIR, `${id}.png`);
      await downloadOutput(img.filename, img.subfolder, img.type, destPath);

      checkpoint.phase1[id] = 'done';
      await saveCheckpoint(checkpoint);
      success++;
      console.log('✅');
    } catch (e) {
      const newFails = failures + 1;
      checkpoint.phase1[id] = `fail:${newFails}`;
      await saveCheckpoint(checkpoint);
      console.log(`❌ (${newFails}/${CONFIG.maxRetries}) ${e.message.slice(0, 60)}`);
    }

    sinceLastFree++;
    if (sinceLastFree >= CONFIG.imgBatchSize) {
      await ensureVRAM();
      sinceLastFree = 0;
    }
  }

  console.log(`\n   Phase 1 완료: ${success}/${products.length} 성공`);
  return success;
}

// ─── Phase 2: Image → GLB ──────────────────────────────────

async function runPhase2(products, checkpoint) {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  Phase 2: Image → GLB                 ║');
  console.log('╚═══════════════════════════════════════╝');

  // Phase 1 → Phase 2 전환 시 전체 메모리 정리
  console.log('   Phase 전환: 전체 VRAM 정리...');
  await freeVRAM();

  const workflow = JSON.parse(await readFile(IMG2GLB_PATH, 'utf-8'));
  await mkdir(GLB_DIR, { recursive: true });

  // Phase 1에서 완료된 항목만 대상
  const eligible = products.filter(p => checkpoint.phase1[p.id] === 'done');
  console.log(`   대상: ${eligible.length}개 (Phase 1 완료 기준)\n`);

  let count = 0;
  let success = 0;
  let sinceLastFree = 0;

  for (const product of eligible) {
    count++;
    const { id } = product;

    if (checkpoint.phase2[id] === 'done') {
      console.log(`   [${count}/${eligible.length}] ${id} — 이미 완료, 건너뜀`);
      continue;
    }

    const failures = checkpoint.phase2[id]?.startsWith('fail:')
      ? parseInt(checkpoint.phase2[id].split(':')[1]) : 0;
    if (failures >= CONFIG.maxRetries && !CONFIG.retryFailed) {
      console.log(`   [${count}/${eligible.length}] ${id} — ${failures}회 실패, 건너뜀`);
      continue;
    }

    process.stdout.write(`   [${count}/${eligible.length}] ${id} ... `);

    try {
      // ComfyUI input 폴더에 이미지 업로드
      const imgPath = resolve(IMG_DIR, `${id}.png`);
      const imgData = await readFile(imgPath);

      const formData = new FormData();
      formData.append('image', new Blob([imgData], { type: 'image/png' }), `${id}.png`);
      formData.append('subfolder', 'pipeline');
      formData.append('overwrite', 'true');

      await comfyFetch('/upload/image', {
        method: 'POST',
        body: formData,
      });

      // 워크플로우 수정
      const wf = JSON.parse(JSON.stringify(workflow));
      wf['80'].inputs.image = `pipeline/${id}.png`;
      wf['72'].inputs.filename_prefix = id;

      // 실행
      const promptId = await queuePrompt(wf);
      const outputs = await waitForCompletion(promptId);

      // GLB 파일 찾기
      const exportNode = outputs?.['72'];
      const glbFiles = exportNode?.gltf || exportNode?.files;
      if (!glbFiles || glbFiles.length === 0) {
        // Preview3D 노드(64)에서 찾기
        const previewNode = outputs?.['64'];
        const modelFile = previewNode?.model_file;
        if (!modelFile) throw new Error('GLB 출력 없음');
        // model_file이 경로인 경우
        const glbDest = resolve(GLB_DIR, `${id}.glb`);
        await downloadOutput(
          typeof modelFile === 'string' ? modelFile : modelFile[0]?.filename,
          modelFile[0]?.subfolder || '', 'output', glbDest
        );
      } else {
        const glb = glbFiles[0];
        const glbDest = resolve(GLB_DIR, `${id}.glb`);
        await downloadOutput(glb.filename, glb.subfolder, glb.type, glbDest);
      }

      // 게임 리소스 폴더로 복사
      const glbSrc = resolve(GLB_DIR, `${id}.glb`);
      const glbFinal = resolve(MODELS_DIR, `${id}.glb`);
      await copyFile(glbSrc, glbFinal);

      checkpoint.phase2[id] = 'done';
      if (!checkpoint.completed.includes(id)) checkpoint.completed.push(id);
      await saveCheckpoint(checkpoint);
      success++;
      console.log('✅');
    } catch (e) {
      const newFails = failures + 1;
      checkpoint.phase2[id] = `fail:${newFails}`;
      await saveCheckpoint(checkpoint);
      console.log(`❌ (${newFails}/${CONFIG.maxRetries}) ${e.message.slice(0, 60)}`);
    }

    sinceLastFree++;
    if (sinceLastFree >= CONFIG.glbBatchSize) {
      console.log('   ⏸️  배치 정리...');
      await freeVRAM();
      sinceLastFree = 0;
    }
  }

  console.log(`\n   Phase 2 완료: ${success}/${eligible.length} 성공`);
  return success;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  ComfyUI Asset Generation Pipeline               ║');
  console.log('║  Text → Image → GLB → Game Resource              ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`   ComfyUI: ${CONFIG.comfyUrl}`);
  console.log(`   Phase: ${CONFIG.phase}`);

  // ComfyUI 연결 확인
  try {
    const res = await comfyFetch('/system_stats');
    const stats = await res.json();
    const device = stats.devices?.[0];
    if (device) {
      const totalGB = (device.vram_total / 1024 ** 3).toFixed(1);
      const freeGB = (device.vram_free / 1024 ** 3).toFixed(1);
      console.log(`   GPU: ${device.name} (${totalGB}GB 전체, ${freeGB}GB 여유)`);
    }
  } catch (e) {
    console.error(`\n❌ ComfyUI 연결 실패: ${CONFIG.comfyUrl}`);
    console.error(`   ${e.message}`);
    process.exit(1);
  }

  // 프롬프트 테이블 로드
  let products;
  try {
    products = JSON.parse(await readFile(PROMPTS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`\n❌ 프롬프트 파일 로드 실패: ${PROMPTS_PATH}`);
    console.error(`   ${e.message}`);
    console.error('   tools/product-prompts.json 파일을 먼저 작성하세요.');
    process.exit(1);
  }

  // ID 필터
  if (CONFIG.ids) {
    const idSet = new Set(CONFIG.ids.split(','));
    products = products.filter(p => idSet.has(p.id));
    console.log(`   ID 필터: ${products.length}개 선택`);
  }

  console.log(`   대상: ${products.length}개 제품\n`);

  // Checkpoint
  let checkpoint = CONFIG.reset
    ? { phase1: {}, phase2: {}, completed: [] }
    : await loadCheckpoint();

  if (CONFIG.reset) {
    await saveCheckpoint(checkpoint);
    console.log('   checkpoint 초기화 완료');
  }

  // 디렉토리 준비
  await mkdir(IMG_DIR, { recursive: true });
  await mkdir(GLB_DIR, { recursive: true });
  await mkdir(MODELS_DIR, { recursive: true });

  // Phase 실행
  if (CONFIG.phase === '1' || CONFIG.phase === 'all') {
    await runPhase1(products, checkpoint);
  }

  if (CONFIG.phase === '2' || CONFIG.phase === 'all') {
    await runPhase2(products, checkpoint);
  }

  // 결과 요약
  const p1Done = Object.values(checkpoint.phase1).filter(v => v === 'done').length;
  const p1Fail = Object.values(checkpoint.phase1).filter(v => v?.startsWith('fail:')).length;
  const p2Done = Object.values(checkpoint.phase2).filter(v => v === 'done').length;
  const p2Fail = Object.values(checkpoint.phase2).filter(v => v?.startsWith('fail:')).length;

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  결과 요약                                        ║`);
  console.log(`║  Phase 1 (이미지): ${p1Done} 성공 / ${p1Fail} 실패`.padEnd(52) + '║');
  console.log(`║  Phase 2 (GLB):    ${p2Done} 성공 / ${p2Fail} 실패`.padEnd(52) + '║');
  console.log(`║  게임 리소스:      ${checkpoint.completed.length}개 완료`.padEnd(52) + '║');
  console.log('╚═══════════════════════════════════════════════════╝');

  if (p1Fail > 0 || p2Fail > 0) {
    console.log('\n   실패한 항목은 --retry-failed 옵션으로 재시도할 수 있습니다.');
  }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
