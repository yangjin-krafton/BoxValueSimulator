# Asset Pipeline 실행 가이드

ComfyUI 기반 피규어 이미지 생성 + LM Studio 비전 검수 + TRELLIS.2 3D 모델 변환 파이프라인.

## 인프라

| 서비스 | 주소 | 용도 |
|--------|------|------|
| ComfyUI | `http://100.66.10.225:8188` | text2img, img2glb (Docker) |
| LM Studio | `http://100.66.10.225:1234` | QA 검수 (Qwen 3.5 9B Vision) |
| GPU | RTX 5080 16GB | ComfyUI ↔ LM Studio 교대 사용 |

## 사전 조건

- ComfyUI Docker 컨테이너 실행 중 (`docker start comfyui`)
- LM Studio에 `qwen/qwen3.5-9b` 모델 다운로드 완료
- Node.js 18+

## 전체 흐름

```
┌─────────────────────────────────────────────────────────┐
│  1. 프롬프트 생성 (100주제 x 10스타일 = 1000개)          │
│     node tools/generate-prompts.mjs                     │
├─────────────────────────────────────────────────────────┤
│  2. Phase 1: 이미지 생성 [ComfyUI, ~2.8시간]            │
│     node tools/asset-pipeline.mjs --phase 1             │
├─────────────────────────────────────────────────────────┤
│  3. QA 검수 + 재생성 루프 [LM Studio ↔ ComfyUI]         │
│     node tools/qa-pipeline.mjs                          │
│                                                         │
│     ComfyUI 이미지 완료                                  │
│       ↓ VRAM 해제                                       │
│     LM Studio 비전 검수 (합격/불합격 판정)                │
│       ↓ 불합격 목록 → VRAM 해제                          │
│     ComfyUI 불합격분 재생성 (시드 변경)                   │
│       ↓ VRAM 해제                                       │
│     LM Studio 재검수                                    │
│       ↓ 90% 합격 달성까지 반복                           │
├─────────────────────────────────────────────────────────┤
│  4. Phase 2: GLB 변환 [ComfyUI TRELLIS.2, ~66시간]      │
│     node tools/asset-pipeline.mjs --phase 2             │
└─────────────────────────────────────────────────────────┘
```

## 빠른 시작

```bash
cd D:\Weeks\BoxValueSimulator

# 원클릭 전체 실행
node tools/run-full-pipeline.mjs

# 또는 단계별 수동 실행
node tools/generate-prompts.mjs          # 1. 프롬프트
node tools/asset-pipeline.mjs --phase 1  # 2. 이미지
node tools/qa-pipeline.mjs               # 3. QA
node tools/asset-pipeline.mjs --phase 2  # 4. GLB
```

---

## Step 1: 프롬프트 생성

100개 주제 x 10개 스타일 = 1,000개 피규어 프롬프트 조합.

```bash
node tools/generate-prompts.mjs --dry-run    # 미리보기
node tools/generate-prompts.mjs              # 저장
node tools/generate-prompts.mjs --max 50     # 개수 제한
node tools/generate-prompts.mjs --theme dragon --style chibi  # 필터
```

### 카테고리 (100주제)

| 카테고리 | 수량 | 예시 |
|----------|------|------|
| 쿨/멋짐 | 15 | 다크나이트, 사이버닌자, 블레이드댄서 |
| 섹시/매력 | 12 | 서큐버스, 발키리, 아이스퀸 |
| 귀여움 | 15 | 아기드래곤, 고양이위자드, 코기킹 |
| 공포/다크 | 12 | 리치킹, 웬디고, 역병의사 |
| 메카/로봇 | 10 | 건담, 스팀펑크메카, 레트로로봇 |
| 동물 | 12 | 알파울프, 백호, 지옥사냥개 |
| 신화/전설 | 12 | 아누비스, 메두사, 펜리르 |
| 아이템 | 12 | 마검, 그리모어, 드래곤알 |

### 스타일 (10종)

| 스타일 | 설명 |
|--------|------|
| 치비 | 2등신 슈퍼디폼 |
| 스타일라이즈드 | 4등신 카툰풍 |
| 리얼리스틱 | 실사 디테일 |
| 클레이 | 점토 조형 매트 질감 |
| 바이닐토이 | 광택 디자이너 토이 |
| 우드카빙 | 나무 조각 민속풍 |
| 복셀픽셀 | 복셀 저폴리 블록 |
| 플러시 | 봉제인형 패브릭 질감 |
| 메카닉 | 기계 관절 장갑판 |
| 메탈릭 | 크롬 반사 금속 마감 |

출력: `tools/product-prompts.json`

---

## Step 2: Phase 1 — 이미지 생성

```bash
node tools/asset-pipeline.mjs --phase 1             # 이어서
node tools/asset-pipeline.mjs --phase 1 --reset      # 처음부터
node tools/asset-pipeline.mjs --phase 1 --ids fig_knight_chibi,fig_mage_clay
```

- 출력: `tools/generated-img/*.png` (512x512)
- 속도: 이미지당 ~10초
- 1000개 = 약 2.8시간

---

## Step 3: QA 검수 + 재생성

LM Studio (Qwen 3.5 9B Vision)로 이미지 품질 자동 판정. 불합격 이미지는 시드를 바꿔 재생성.

### VRAM 교대 사용

ComfyUI와 LM Studio는 같은 GPU(16GB)를 공유하므로 **동시 사용 불가**.
QA 파이프라인이 자동으로 VRAM 전환을 관리합니다.

```
ComfyUI 작업 완료 → /free API → LM Studio 검수
→ 불합격 목록 → LM Studio 언로드 → ComfyUI 재생성
→ /free API → LM Studio 재검수 → 90%+ 달성까지 반복
```

### LM Studio 설정

1. `qwen/qwen3.5-9b` 모델 로드
2. thinking ON/OFF 무관 — 코드에서 3중 방어 처리:
   - 시스템 프롬프트에 `/no_think` 토큰
   - API 파라미터 `chat_template_kwargs: {enable_thinking: false}`
   - 응답에서 `<think>...</think>` 태그 자동 제거 후 JSON 추출

### QA 실행

```bash
# 검수만 (재생성 안 함)
node tools/qa-pipeline.mjs --qa-only

# 검수 + 재생성 루프 (기본 90% 합격 목표)
node tools/qa-pipeline.mjs

# 합격률 95% 목표, 최대 5라운드
node tools/qa-pipeline.mjs --pass-rate 0.95 --max-rounds 5

# 배치 크기 조정
node tools/qa-pipeline.mjs --batch 20
```

### QA 판정 기준

| 기준 | 설명 | 치명적? |
|------|------|---------|
| SINGLE_SUBJECT | 하나의 명확한 주제 | O |
| WHITE_BG | 깨끗한 흰색 배경 | |
| FULL_BODY | 잘리지 않은 전신 | |
| CLEAR_SHAPE | 3D 변환 적합한 선명한 형태 | O |
| NO_ARTIFACTS | 글리치/노이즈 없음 | O |
| RECOGNIZABLE | 피규어/토이 미학 부합 | |

- **합격**: 점수 70점 이상 + 치명적 이슈 없음
- **점수**: 90-100 우수, 70-89 양호, 50-69 미흡, 0-49 불량

### QA 리포트

`tools/qa-report.json`:

```json
{
  "results": {
    "fig_knight_chibi": { "pass": true, "score": 92, "issues": [] },
    "fig_mage_clay": { "pass": false, "score": 45, "issues": ["MULTIPLE_SUBJECTS"], "suggestion": "..." }
  },
  "rounds": [
    { "total": 1000, "passed": 870, "failed": 130, "passRate": 87.0 },
    { "total": 130, "passed": 115, "failed": 15, "passRate": 88.5 }
  ]
}
```

---

## Step 4: Phase 2 — GLB 변환

```bash
node tools/asset-pipeline.mjs --phase 2
```

- 출력: `tools/generated-glb/*.glb` → `src/assets/models/`로 자동 복사
- 속도: 모델당 ~4분
- TRELLIS.2 16GB 최적화: `cpu_offload` + `512` 해상도 + progressive loading

---

## Step 5: GLB 미리보기

```bash
npx serve tools -l 3333
```

브라우저: `http://localhost:3333/glb-preview.html`
- 파일 선택 또는 드래그&드롭으로 GLB 확인
- 마우스 드래그=회전, 스크롤=줌
- 투명/반투명 재질 지원

---

## 진행상황 확인

```bash
# Phase 1/2 진행률
cat tools/pipeline-checkpoint.json | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    const p1=Object.values(j.phase1).filter(v=>v==='done').length;
    const p1f=Object.values(j.phase1).filter(v=>v?.startsWith('fail:')).length;
    const p2=Object.values(j.phase2).filter(v=>v==='done').length;
    const p2f=Object.values(j.phase2).filter(v=>v?.startsWith('fail:')).length;
    const total=Object.keys(j.phase1).length || '?';
    console.log('Phase1:', p1+'/'+total, '(fail:'+p1f+')');
    console.log('Phase2:', p2+'/'+total, '(fail:'+p2f+')');
  })"

# 생성된 파일 수
ls tools/generated-img/*.png | wc -l
ls tools/generated-glb/*.glb | wc -l

# QA 합격률
cat tools/qa-report.json | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    const p=Object.values(j.results).filter(r=>r.pass&&r.score>=70).length;
    const t=Object.keys(j.results).length;
    console.log('QA:', p+'/'+t, '('+(t?((p/t)*100).toFixed(1):0)+'%)');
  })"
```

## 중단 / 재시작

```bash
# ComfyUI 중단
curl -X POST http://100.66.10.225:8188/interrupt
curl -X POST http://100.66.10.225:8188/queue -H "Content-Type: application/json" -d '{"clear":true}'

# 이어서 실행 (checkpoint 자동 복구)
node tools/asset-pipeline.mjs

# 실패 항목만 재시도
node tools/asset-pipeline.mjs --retry-failed

# 처음부터
node tools/asset-pipeline.mjs --reset
```

## 전체 파이프라인 (원클릭)

```bash
node tools/run-full-pipeline.mjs                # 전체
node tools/run-full-pipeline.mjs --skip-gen     # QA부터
node tools/run-full-pipeline.mjs --skip-qa      # QA 건너뛰기
node tools/run-full-pipeline.mjs --skip-glb     # GLB 건너뛰기
```

## 옵션 레퍼런스

### asset-pipeline.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--phase 1/2` | 특정 Phase만 | `all` |
| `--ids id1,id2` | 특정 ID만 | 전체 |
| `--reset` | checkpoint 초기화 | 이어서 |
| `--retry-failed` | 실패 재시도 | 건너뜀 |
| `--comfy-url URL` | ComfyUI 주소 | `http://100.66.10.225:8188` |
| `--img-batch N` | VRAM 정리 간격 (Phase1) | `10` |
| `--glb-batch N` | VRAM 정리 간격 (Phase2) | `3` |

### qa-pipeline.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--qa-only` | 검수만 (재생성 안 함) | 루프 |
| `--pass-rate 0.95` | 합격률 목표 | `0.9` |
| `--max-rounds N` | 최대 반복 횟수 | `10` |
| `--batch N` | LM Studio 배치 크기 | `10` |
| `--lm-url URL` | LM Studio 주소 | `http://100.66.10.225:1234` |
| `--model NAME` | 비전 모델 | `qwen/qwen3.5-9b` |

### generate-prompts.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--dry-run` | 미리보기 | 저장 |
| `--max N` | 최대 생성 수 | 전체 |
| `--theme NAME` | 주제 필터 | 전체 |
| `--style NAME` | 스타일 필터 | 전체 |

## 파일 구조

```
tools/
├── generate-prompts.mjs       # 프롬프트 조합 생성기 (100주제 x 10스타일)
├── asset-pipeline.mjs         # ComfyUI 파이프라인 (text2img + img2glb)
├── qa-pipeline.mjs            # LM Studio 비전 검수 + 재생성 루프
├── run-full-pipeline.mjs      # 전체 오케스트레이터
├── product-prompts.json       # 생성된 프롬프트 목록
├── text2img.json              # ComfyUI 워크플로우 (이미지)
├── img2glb.json               # ComfyUI 워크플로우 (3D)
├── glb-preview.html           # GLB 뷰어
├── generated-img/             # [gitignore] Phase1 출력
├── generated-glb/             # [gitignore] Phase2 출력
├── pipeline-checkpoint.json   # [gitignore] 진행상황
└── qa-report.json             # [gitignore] QA 검수 리포트
```

## TRELLIS.2 16GB VRAM 수정사항

`D:\comfy\custom_nodes\ComfyUI-TRELLIS2\nodes\` 에서 수정:

- **`trellis_utils/lazy_manager.py`**: `cpu_offload` 모드에서 `enable_disk_offload=True` 적용 → 서브모델 on-demand 로드
- **`trellis2/pipelines/base.py`**: `_unload_model` 에서 사용 후 모델 삭제 + VRAM 해제

Docker 재시작 후 적용됨: `docker restart comfyui`
