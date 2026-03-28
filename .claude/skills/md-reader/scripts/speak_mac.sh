#!/usr/bin/env bash
# speak_mac.sh - Read text aloud using macOS 'say' command
#
# Usage:
#   ./speak_mac.sh [options] <text-file.txt>
#   ./speak_mac.sh [options] --text "some text"
#
# Options:
#   -v <voice>    Voice name (e.g. "Yuna" for Korean, "Samantha" for English)
#   -r <rate>     Words per minute (default: 175)
#   -o <file>     Save to audio file instead of speaking (AIFF format)
#   --text <str>  Read this string instead of a file
#   --list        List available voices and exit
#
# Examples:
#   ./speak_mac.sh notes.txt
#   ./speak_mac.sh -v Yuna -r 160 notes.txt
#   ./speak_mac.sh --text "안녕하세요"
#   ./speak_mac.sh --list

set -euo pipefail

VOICE=""
RATE=175
OUTPUT=""
TEXT_DIRECT=""
LIST_VOICES=false
INPUT_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -v) VOICE="$2"; shift 2 ;;
        -r) RATE="$2"; shift 2 ;;
        -o) OUTPUT="$2"; shift 2 ;;
        --text) TEXT_DIRECT="$2"; shift 2 ;;
        --list) LIST_VOICES=true; shift ;;
        --) shift; INPUT_FILE="$*"; break ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) INPUT_FILE="$1"; shift ;;
    esac
done

# List voices
if $LIST_VOICES; then
    echo "Available voices:"
    say -v '?' | awk '{printf "  %-30s %s\n", $1, $2}'
    exit 0
fi

# Build say command
SAY_ARGS=(-r "$RATE")
[[ -n "$VOICE" ]] && SAY_ARGS+=(-v "$VOICE")
[[ -n "$OUTPUT" ]] && SAY_ARGS+=(-o "$OUTPUT")

if [[ -n "$TEXT_DIRECT" ]]; then
    echo "Speaking text directly (${#TEXT_DIRECT} chars)..."
    say "${SAY_ARGS[@]}" "$TEXT_DIRECT"
elif [[ -n "$INPUT_FILE" ]]; then
    if [[ ! -f "$INPUT_FILE" ]]; then
        echo "Error: File not found: $INPUT_FILE" >&2
        exit 1
    fi
    echo "Speaking file: $INPUT_FILE"
    say "${SAY_ARGS[@]}" -f "$INPUT_FILE"
else
    echo "Error: Provide a file or --text argument." >&2
    echo "Usage: $0 [-v voice] [-r rate] <text-file.txt>" >&2
    exit 1
fi

echo "Done."
