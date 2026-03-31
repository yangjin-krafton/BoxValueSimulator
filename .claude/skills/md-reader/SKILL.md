---
name: md-reader
description: This skill should be used when the user asks to "read this markdown aloud", "read .md file with TTS", "마크다운 읽어줘", "TTS로 읽어줘", "음성으로 읽어줘", "소리 내서 읽어줘", "마크다운을 구두로 변환해줘", "이 파일 읽어줘", or wants to hear a markdown document spoken out loud using the system's text-to-speech engine.
version: 0.3.0
---

# Markdown TTS Reader

마크다운 파일을 **구두 전달용 대사(Script)로 변환**한 뒤 Microsoft Edge Neural TTS로 MP3를 생성.
MP3는 항상 파일로 저장되고 기본 플레이어로 열림 → 사용자가 일시정지/정지 직접 제어.

## 핵심 원칙

- **대사화 우선**: 마크다운 텍스트를 그대로 읽지 않는다. 구두 전달에 최적화된 스크립트로 재작성한 뒤 읽는다.
- **항상 MP3 저장**: 실시간 재생 없음. 항상 `.mp3` 파일로 저장 후 기본 플레이어로 열기.
- **주 음성**: `ko-KR-SunHiNeural` (Microsoft 선희, Neural 고품질)

---

## 워크플로우

### Step 1: 파일 확인

- 경로 지정 시 그대로 사용
- "이 파일" / "현재 파일" → IDE에서 열린 파일 경로 사용
- MP3 저장 위치: 원본 파일과 같은 폴더, 파일명은 `<원본이름>_tts.mp3`
  - 예: `docs/review.md` → `docs/review_tts.mp3`

### Step 2: 마크다운 파싱

```bash
python ".claude/skills/md-reader/scripts/strip_markdown.py" "<파일.md>" "<임시.txt>"
```

마크다운 구문 제거(헤더 기호, 링크 URL, 코드 펜스 마커 등) 후 구조화된 평문 획득.

### Step 3: 구두 대사화 (Claude가 직접 수행)

파싱된 텍스트를 **청취자에게 말하듯** 자연스러운 구어체 스크립트로 재작성.

**대사화 규칙:**

| 원문 패턴 | 대사화 |
|-----------|--------|
| `src/main.js:28` 같은 코드 경로 | "메인 제이에스 스물여덟 번째 줄" 또는 "메인 파일에서" |
| `` `startNewSet()` `` 함수명 | "스타트 뉴 셋 함수" 또는 "새 세트를 시작하는 함수" |
| 불릿 목록 (`- A`, `- B`) | "첫째, A. 둘째, B." 또는 흐름에 맞게 연결 |
| 표(Table) | 핵심 내용만 문장으로 요약 |
| `코드 블록` | "예를 들어, [코드 설명]" 또는 "코드로 표현하면 [내용]" |
| 섹션 헤더 | "다음은 [섹션명]에 대한 내용입니다." |
| 영어 변수/클래스명 | 한국어로 풀어 읽기 (예: `GameStateManager` → "게임 스테이트 매니저") |
| 기술 약어 | 풀어쓰기 (예: `GLB` → "지엘비 포맷", `HUD` → "헤드업 디스플레이") |
| URL / 이메일 | 생략하거나 "링크 참고"로 대체 |

**대사화 목표:**
- 화면을 보지 않아도 내용이 귀로 이해될 것
- 딱딱한 문어체 → 자연스러운 구어체
- 정보 밀도가 높은 부분은 풀어서 설명
- 긴 섹션 사이에 자연스러운 전환 문구 추가 ("이어서", "다음으로", "마지막으로")

**대사 초안 작성 후 사용자에게 미리보기 제공** (선택사항 — 파일이 길면 생략 가능).

### Step 4: 대사 텍스트 파일 저장

재작성된 대사를 `.txt`로 저장:
- 경로: 원본과 같은 폴더, 파일명 `<원본이름>_script.txt`
- 인코딩: UTF-8

### Step 5: MP3 생성 + 기본 플레이어 열기

```bash
python ".claude/skills/md-reader/scripts/speak_edge_tts.py" \
    "<script.txt>" \
    --output "<output_tts.mp3>" \
    --voice ko-KR-SunHiNeural \
    --rate "+0%"
```

실행 결과: MP3 저장 완료 → Windows 기본 미디어 플레이어로 자동 열기 (비블로킹).
사용자가 직접 일시정지 / 정지 / 탐색 가능.

---

## 음성 옵션

| 음성 ID | 이름 | 성별 | 특징 |
|---------|------|------|------|
| `ko-KR-SunHiNeural` | 선희 | 여성 | 기본값, 자연스럽고 명료함 |
| `ko-KR-InJoonNeural` | 인준 | 남성 | 차분하고 신뢰감 있음 |
| `ko-KR-HyunsuMultilingualNeural` | 현수 | 남성 | 영어/한국어 혼합 문서에 적합 |

속도 조절: `--rate +20%` (빠르게) / `--rate -10%` (느리게)

---

## 에러 처리

| 오류 | 해결 |
|------|------|
| `SSLCertVerificationError` | 스크립트 내부에서 자동 우회 |
| `네트워크 연결 실패` | `speak_windows.ps1`로 SAPI 폴백 |
| `edge-tts not found` | `pip install edge-tts` |

---

## 스크립트 경로

- **`scripts/strip_markdown.py`** — 마크다운 → 구조화된 평문
- **`scripts/speak_edge_tts.py`** — Edge Neural TTS → MP3 저장 + 기본 플레이어 열기
- **`scripts/speak_windows.ps1`** — SAPI 오프라인 폴백
- **`scripts/speak_mac.sh`** — macOS say 폴백
