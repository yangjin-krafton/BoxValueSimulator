#!/usr/bin/env node
/**
 * GLB Draco 압축 최적화.
 * src/assets/models/*.glb → 인플레이스 압축.
 *
 * 사용법:
 *   node tools/optimize-glb.mjs
 *   node tools/optimize-glb.mjs --dry-run    # 미리보기만
 */

import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MODELS_DIR = resolve(__dirname, '../src/assets/models');
const GLTF_BIN = resolve(__dirname, 'node_modules/.bin/gltf-transform');
const DRY_RUN = process.argv.includes('--dry-run');

async function getSize(path) {
  const s = await stat(path);
  return s.size;
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

async function main() {
  const files = (await readdir(MODELS_DIR)).filter(f => f.endsWith('.glb'));
  console.log(`📦 ${files.length}개 GLB 파일 발견\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — 실제 변환 없음\n');
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const inputPath = resolve(MODELS_DIR, file);
    const tempPath = resolve(MODELS_DIR, `_opt_${file}`);
    const sizeBefore = await getSize(inputPath);
    totalBefore += sizeBefore;

    const progress = `[${i + 1}/${files.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} ${file} (${formatMB(sizeBefore)})`);
      totalAfter += sizeBefore;
      continue;
    }

    try {
      await execAsync(
        `"${GLTF_BIN}" optimize "${inputPath}" "${tempPath}" --compress draco`,
        { timeout: 120000 },
      );

      const sizeAfter = await getSize(tempPath);
      totalAfter += sizeAfter;

      // 원본을 압축 파일로 교체
      await unlink(inputPath);
      await rename(tempPath, inputPath);

      const ratio = ((1 - sizeAfter / sizeBefore) * 100).toFixed(0);
      processed++;
      console.log(`${progress} ✅ ${file}: ${formatMB(sizeBefore)} → ${formatMB(sizeAfter)} (-${ratio}%)`);
    } catch (err) {
      failed++;
      console.error(`${progress} ❌ ${file}: ${err.message}`);
      // 임시 파일 정리
      try { await unlink(tempPath); } catch {}
      totalAfter += sizeBefore;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 결과:`);
  console.log(`   파일: ${files.length}개 (성공 ${processed}, 실패 ${failed})`);
  console.log(`   변환 전: ${formatMB(totalBefore)}`);
  console.log(`   변환 후: ${formatMB(totalAfter)}`);
  console.log(`   절감: ${formatMB(totalBefore - totalAfter)} (-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
