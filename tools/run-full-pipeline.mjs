#!/usr/bin/env node
/**
 * 전체 파이프라인 오케스트레이터
 *
 * 1. 프롬프트 생성
 * 2. Phase 1: text2img (ComfyUI)
 * 3. QA 검수 + 재생성 루프 (LM Studio ↔ ComfyUI)
 * 4. Phase 2: img2glb (ComfyUI)
 *
 * VRAM 사용 순서:
 *   ComfyUI(text2img) → free → LM Studio(검수) → free → ComfyUI(재생성) → ... → ComfyUI(img2glb)
 *
 * 사용법:
 *   node tools/run-full-pipeline.mjs                # 전체 실행
 *   node tools/run-full-pipeline.mjs --skip-gen     # 이미지 생성 건너뛰기 (QA부터)
 *   node tools/run-full-pipeline.mjs --skip-qa      # QA 건너뛰기
 *   node tools/run-full-pipeline.mjs --skip-glb     # GLB 변환 건너뛰기
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const skipGen = process.argv.includes('--skip-gen');
const skipQA  = process.argv.includes('--skip-qa');
const skipGLB = process.argv.includes('--skip-glb');

function run(script, args = []) {
  return new Promise((ok, fail) => {
    console.log(`\n${'▓'.repeat(60)}`);
    console.log(`  실행: node ${script} ${args.join(' ')}`);
    console.log(`${'▓'.repeat(60)}\n`);

    const child = execFile('node', [resolve(__dirname, script), ...args], {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
      maxBuffer: 50 * 1024 * 1024,
    });

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on('exit', code => code === 0 ? ok() : fail(new Error(`exit ${code}`)));
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Full Asset Pipeline                                  ║');
  console.log('║  Prompt → Image → QA → GLB                           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Step 1: 프롬프트 생성
  if (!skipGen) {
    await run('generate-prompts.mjs');
  }

  // Step 2: Phase 1 이미지 생성
  if (!skipGen) {
    await run('asset-pipeline.mjs', ['--phase', '1', '--reset']);
  }

  // Step 3: QA 검수 + 재생성 루프
  if (!skipQA) {
    console.log('\n  ⚠️  LM Studio에서 모델을 로드하세요: qwen/qwen3.5-9b');
    console.log('  준비되면 자동으로 시작합니다 (10초 대기)...\n');
    await new Promise(r => setTimeout(r, 10000));
    await run('qa-pipeline.mjs');
  }

  // Step 4: Phase 2 GLB 변환
  if (!skipGLB) {
    console.log('\n  ⚠️  LM Studio 모델을 언로드하세요 (VRAM 확보)');
    console.log('  10초 후 GLB 변환을 시작합니다...\n');
    await new Promise(r => setTimeout(r, 10000));
    await run('asset-pipeline.mjs', ['--phase', '2']);
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  전체 파이프라인 완료!                                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
