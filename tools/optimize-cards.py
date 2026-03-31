#!/usr/bin/env python3
"""
카드 이미지 최적화: PNG 512px → WebP 256px.
src/assets/cards/*.png → src/assets/cards/*.webp (원본 PNG 삭제)

사용법:
  python tools/optimize-cards.py
  python tools/optimize-cards.py --size 256 --quality 80
  python tools/optimize-cards.py --dry-run
"""

import argparse
import os
from pathlib import Path
from PIL import Image

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--size', type=int, default=256, help='출력 크기 (기본 256px)')
    parser.add_argument('--quality', type=int, default=80, help='WebP 품질 (기본 80)')
    parser.add_argument('--dry-run', action='store_true', help='미리보기만')
    args = parser.parse_args()

    cards_dir = Path(__file__).parent.parent / 'src' / 'assets' / 'cards'
    png_files = sorted(cards_dir.glob('*.png'))

    print(f'[cards] {len(png_files)} PNG files found')
    print(f'  config: {args.size}px, WebP q{args.quality}')
    print()

    total_before = 0
    total_after = 0
    ok = 0

    for i, png_path in enumerate(png_files, 1):
        size_before = png_path.stat().st_size
        total_before += size_before
        webp_path = png_path.with_suffix('.webp')

        if args.dry_run:
            print(f'[{i}/{len(png_files)}] {png_path.name} ({size_before/1024:.0f}KB)')
            continue

        try:
            img = Image.open(png_path)
            if img.size[0] != args.size or img.size[1] != args.size:
                img = img.resize((args.size, args.size), Image.LANCZOS)
            img.save(webp_path, 'WEBP', quality=args.quality)

            size_after = webp_path.stat().st_size
            total_after += size_after

            png_path.unlink()
            ok += 1

            ratio = (1 - size_after / size_before) * 100
            print(f'[{i}/{len(png_files)}] OK {png_path.stem}: {size_before/1024:.0f}KB -> {size_after/1024:.0f}KB (-{ratio:.0f}%)')
        except Exception as e:
            print(f'[{i}/{len(png_files)}] FAIL {png_path.name}: {e}')
            total_after += size_before

    print()
    print('-' * 50)
    print(f'Result: {ok}/{len(png_files)} converted')
    print(f'  Before: {total_before/1024/1024:.1f}MB')
    if not args.dry_run:
        print(f'  After:  {total_after/1024/1024:.1f}MB')
        print(f'  Saved:  {(total_before-total_after)/1024/1024:.1f}MB (-{(1-total_after/total_before)*100:.0f}%)')

if __name__ == '__main__':
    main()
