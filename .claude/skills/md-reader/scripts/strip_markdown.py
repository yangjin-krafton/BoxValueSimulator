#!/usr/bin/env python3
"""
strip_markdown.py - Convert markdown to plain text for TTS reading.

Usage:
    python strip_markdown.py <input.md> [output.txt]
    python strip_markdown.py <input.md>          # prints to stdout
"""

import sys
import re
import os


def strip_markdown(text: str) -> str:
    """Convert markdown text to clean plain text suitable for TTS."""

    # Remove YAML frontmatter (--- ... ---)
    text = re.sub(r'^---[\s\S]*?---\n', '', text, flags=re.MULTILINE)

    # Remove HTML comments
    text = re.sub(r'<!--[\s\S]*?-->', '', text)

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Fenced code blocks: keep the code content but add a spoken label
    def replace_code_block(m):
        lang = m.group(1).strip() if m.group(1) else ''
        label = f"코드 블록 시작. " if not lang else f"{lang} 코드 블록 시작. "
        code = m.group(2).strip()
        return f"\n{label}\n{code}\n코드 블록 끝.\n"
    text = re.sub(r'```(\w*)\n([\s\S]*?)```', replace_code_block, text)

    # Inline code: just keep the content
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Images: use alt text
    text = re.sub(r'!\[([^\]]*)\]\([^\)]*\)', r'이미지: \1', text)

    # Links: keep link text only
    text = re.sub(r'\[([^\]]+)\]\([^\)]*\)', r'\1', text)

    # Reference-style links
    text = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', text)

    # Setext-style headers (underlined with = or -)
    text = re.sub(r'^(.+)\n={3,}\s*$', r'제목. \1.', text, flags=re.MULTILINE)
    text = re.sub(r'^(.+)\n-{3,}\s*$', r'소제목. \1.', text, flags=re.MULTILINE)

    # ATX-style headers (#, ##, ###, ...)
    header_labels = {1: '제목', 2: '소제목', 3: '항목', 4: '항목', 5: '항목', 6: '항목'}
    def replace_header(m):
        level = len(m.group(1))
        label = header_labels.get(level, '항목')
        content = m.group(2).strip()
        return f"\n{label}. {content}.\n"
    text = re.sub(r'^(#{1,6})\s+(.+)$', replace_header, text, flags=re.MULTILINE)

    # Horizontal rules
    text = re.sub(r'^[-*_]{3,}\s*$', '\n구분선.\n', text, flags=re.MULTILINE)

    # Blockquotes
    text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)

    # Bold and italic (order matters: bold first)
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', text)
    text = re.sub(r'___(.+?)___', r'\1', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)

    # Strikethrough
    text = re.sub(r'~~(.+?)~~', r'\1', text)

    # Unordered list items
    text = re.sub(r'^[\s]*[-*+]\s+', '', text, flags=re.MULTILINE)

    # Ordered list items
    text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)

    # Tables: strip pipe characters and extra whitespace
    def replace_table_row(m):
        cells = [c.strip() for c in m.group(0).split('|') if c.strip()]
        return ', '.join(cells) + '.'
    text = re.sub(r'^\|.+\|$', replace_table_row, text, flags=re.MULTILINE)
    # Remove table separator rows (|---|---|)
    text = re.sub(r'^\|[-:| ]+\|$', '', text, flags=re.MULTILINE)

    # Remove trailing spaces
    text = re.sub(r' +$', '', text, flags=re.MULTILINE)

    # Collapse multiple blank lines into at most two
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Strip leading/trailing whitespace
    text = text.strip()

    return text


def main():
    if len(sys.argv) < 2:
        print("Usage: python strip_markdown.py <input.md> [output.txt]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, 'r', encoding='utf-8') as f:
        md_text = f.read()

    plain_text = strip_markdown(md_text)

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(plain_text)
        print(f"Saved to: {output_path}")
    else:
        print(plain_text)


if __name__ == '__main__':
    main()
