#!/usr/bin/env python3
"""
speak_edge_tts.py - Microsoft Edge Neural TTS를 이용해 텍스트/파일을 음성으로 재생.

의존성:
    pip install edge-tts

사용법:
    python speak_edge_tts.py <text-file.txt> [options]
    python speak_edge_tts.py --text "읽을 내용" [options]
    python speak_edge_tts.py --list-voices

옵션:
    --voice <name>     음성 이름 (기본값: ko-KR-SunHiNeural)
    --rate <+N%|-N%>   속도 조절 (기본값: +0%, 예: +20%, -10%)
    --output <file>    MP3로 저장 (재생 없이 파일만 저장)
    --list-voices      사용 가능한 한국어 음성 목록 출력 후 종료

한국어 뉴럴 음성:
    ko-KR-SunHiNeural           - 선희 (여성, 자연스러운)
    ko-KR-InJoonNeural          - 인준 (남성, 자연스러운)
    ko-KR-HyunsuMultilingualNeural - 현수 (남성, 다국어)

예시:
    python speak_edge_tts.py output.txt --voice ko-KR-SunHiNeural
    python speak_edge_tts.py --text "안녕하세요" --rate +10%
    python speak_edge_tts.py notes.txt --output notes_audio.mp3
"""

import sys
import os
import ssl
import asyncio
import argparse
import tempfile
import subprocess
import platform

# SSL 인증서 검증 우회 (회사 프록시/인증서 체인 환경 대응)
def _patch_ssl():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        import edge_tts.communicate as cm
        import edge_tts.voices as vm
        cm._SSL_CTX = ctx
        vm._SSL_CTX = ctx
    except Exception:
        pass
    return ctx

_patch_ssl()

try:
    import edge_tts
except ImportError:
    print("edge-tts가 설치되어 있지 않습니다.", file=sys.stderr)
    print("설치: pip install edge-tts", file=sys.stderr)
    sys.exit(1)


KOREAN_VOICES = [
    "ko-KR-SunHiNeural",
    "ko-KR-InJoonNeural",
    "ko-KR-HyunsuMultilingualNeural",
]

DEFAULT_VOICE = "ko-KR-SunHiNeural"


async def list_voices_async():
    try:
        voices = await edge_tts.list_voices()
        kr_voices = [v for v in voices if "ko-KR" in v["Locale"]]
        print("사용 가능한 한국어 Neural 음성:")
        for v in kr_voices:
            print(f"  {v['ShortName']:<45} | {v['Gender']:<8} | {v['FriendlyName']}")
        print("\n전체 음성 개수:", len(voices))
    except Exception as e:
        print(f"음성 목록 조회 실패: {e}", file=sys.stderr)
        print("오프라인 상태이거나 네트워크 문제일 수 있습니다.", file=sys.stderr)
        print("\n알려진 한국어 음성:")
        for v in KOREAN_VOICES:
            print(f"  {v}")


def play_audio_windows(mp3_path: str):
    """Windows에서 MP3 파일을 동기적으로 재생 (PowerShell MediaPlayer 사용)."""
    # 절대 경로로 변환하고 백슬래시 사용 (Windows URI 생성을 위해)
    abs_path = os.path.abspath(mp3_path).replace("/", "\\")
    ps_script = f"""
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$uri = [System.Uri]::new("{abs_path}")
$player.Open($uri)
$player.Play()
$timeout = 0
while ($player.NaturalDuration.HasTimeSpan -eq $false -and $timeout -lt 50) {{
    Start-Sleep -Milliseconds 100
    $timeout++
}}
if ($player.NaturalDuration.HasTimeSpan) {{
    $duration = $player.NaturalDuration.TimeSpan.TotalSeconds
    Start-Sleep -Seconds ($duration + 0.5)
}} else {{
    Start-Sleep -Seconds 60
}}
$player.Close()
"""
    subprocess.run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        check=True
    )


def play_audio(mp3_path: str):
    """플랫폼에 맞게 오디오를 재생."""
    system = platform.system()
    if system == "Windows":
        play_audio_windows(mp3_path)
    elif system == "Darwin":
        subprocess.run(["afplay", mp3_path], check=True)
    else:
        # Linux fallback
        for player in ["mpg123", "mpg321", "ffplay"]:
            if subprocess.run(["which", player], capture_output=True).returncode == 0:
                subprocess.run([player, "-q", mp3_path], check=True)
                return
        print("오디오 플레이어를 찾을 수 없습니다. mpg123 또는 ffplay를 설치하세요.", file=sys.stderr)


def open_with_default_player(mp3_path: str):
    """MP3를 OS 기본 플레이어로 비블로킹 실행 (사용자가 직접 정지/일시정지 가능)."""
    abs_path = os.path.abspath(mp3_path)
    system = platform.system()
    if system == "Windows":
        os.startfile(abs_path)
    elif system == "Darwin":
        subprocess.Popen(["open", abs_path])
    else:
        subprocess.Popen(["xdg-open", abs_path])


async def speak_async(text: str, voice: str, rate: str, output_path: str):
    """edge-tts로 텍스트를 음성으로 변환하고 MP3로 저장한 뒤 기본 플레이어로 열기."""
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    await communicate.save(output_path)
    abs_path = os.path.abspath(output_path)
    print(f"MP3 저장 완료: {abs_path}")
    print(f"음성: {voice}, 속도: {rate}, 글자 수: {len(text)}")
    print("기본 플레이어로 열기...")
    open_with_default_player(abs_path)
    print("재생 시작됨 (플레이어에서 일시정지/정지 가능).")


def main():
    parser = argparse.ArgumentParser(
        description="Microsoft Edge Neural TTS로 텍스트/파일을 음성으로 읽기",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input_file", nargs="?", help="읽을 텍스트 파일 (.txt 또는 .md)")
    parser.add_argument("--text", help="직접 입력할 텍스트")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"음성 이름 (기본값: {DEFAULT_VOICE})")
    parser.add_argument("--rate", default="+0%", help="속도 (기본값: +0%, 예: +20%%, -10%%)")
    parser.add_argument("--output", required=True, help="MP3 저장 경로 (필수, 예: output.mp3)")
    parser.add_argument("--list-voices", action="store_true", help="한국어 음성 목록 출력")

    args, _ = parser.parse_known_args()

    if args.list_voices:
        asyncio.run(list_voices_async())
        return

    args = parser.parse_args()

    # 텍스트 획득
    text = ""
    if args.text:
        text = args.text
    elif args.input_file:
        if not os.path.exists(args.input_file):
            print(f"오류: 파일을 찾을 수 없습니다: {args.input_file}", file=sys.stderr)
            sys.exit(1)
        with open(args.input_file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    else:
        parser.print_help()
        sys.exit(1)

    if not text:
        print("읽을 내용이 없습니다.", file=sys.stderr)
        sys.exit(1)

    # 너무 긴 텍스트 경고 (edge-tts는 분할 처리하지만 알려줌)
    if len(text) > 10000:
        print(f"텍스트 길이: {len(text)}자 (긴 문서는 시간이 걸릴 수 있습니다)")

    asyncio.run(speak_async(text, args.voice, args.rate, args.output))



if __name__ == "__main__":
    main()
